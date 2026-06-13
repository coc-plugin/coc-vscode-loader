import { Project } from 'ts-morph'
import * as fs from 'fs'
import * as path from 'path'
import { scan } from './scanner.js'
import {
  ConvertStep,
  isLanguageClientStep,
  StepResult,
} from './types.js'
import { executeStep, getRegisteredStepTypes } from './steps/index.js'

export interface ConvertOptions {
  input: string
  output: string
  convert: ConvertStep[]
  presets?: Record<string, any>
  verbose?: boolean
}

interface MergedResult {
  generatedFiles: Array<{ path: string; content: string }>
  entryPoint?: string
  keepDeps: Record<string, string>
  activationEvents: string[]
  serverBinary?: {
    repo: string
    asset: string
    binaryPath?: string
    args?: string[]
  }
}

export async function convert(opts: ConvertOptions): Promise<void> {
  const { input, output, convert: steps, verbose } = opts

  if (!fs.existsSync(input)) {
    console.error(`input not found: ${input}`)
    process.exit(1)
  }

  if (!steps || steps.length === 0) {
    console.error('no convert steps provided (use --convert)')
    process.exit(1)
  }

  // 1. Validate
  const knownTypes = getRegisteredStepTypes()
  for (const s of steps) {
    if (!knownTypes.includes(s.type)) {
      console.error(`unknown step type: "${s.type}". Available: ${knownTypes.join(', ')}`)
      process.exit(1)
    }
    if (isLanguageClientStep(s) && s.server.kind === 'binary') {
      if (s.server.binary?.asset) {
        const vars = ['{{version}}', '{{platform}}', '{{arch}}', '{{rust-target}}']
        for (const v of vars) {
          if (s.server.binary.asset.includes(v)) break
        }
      }
    }
  }

  // 2. Scan for summary (try src/ first, fall back to input root)
  console.log('Scanning...')
  let result = scan(path.join(input, 'src'))
  if (result.files.length === 0) {
    result = scan(input)
  }
  console.log(result.summary)

  if (result.files.length === 0) {
    console.log('No VS Code API usage found, nothing to convert.')
    return
  }

  // 3. Read original package.json
  const origPkgPath = path.join(input, 'package.json')
  const origPkg = fs.existsSync(origPkgPath)
    ? JSON.parse(fs.readFileSync(origPkgPath, 'utf-8'))
    : {}

  // 4. Create output directory
  if (fs.existsSync(output)) {
    fs.rmSync(output, { recursive: true })
  }
  fs.mkdirSync(path.join(output, 'src'), { recursive: true })

  // 5. Project for transforms
  const project = new Project()

  // 6. Execute steps
  const ctx = { input, output, project, origPkg, verbose, presets: opts.presets }
  const merged: MergedResult = {
    generatedFiles: [],
    entryPoint: undefined,
    keepDeps: {},
    activationEvents: [],
    serverBinary: undefined,
  }

  const stepResults: StepResult[] = []
  for (const step of steps) {
    const stepVerbose = verbose || (step as any).verbose
    if (stepVerbose) console.log(`  step: ${step.type}`)
    const stepCtx = { ...ctx, verbose: stepVerbose }
    const stepResult: StepResult = executeStep(stepCtx, step)
    stepResults.push(stepResult)

    // Merge
    merged.generatedFiles.push(...stepResult.generatedFiles)
    merged.entryPoint = stepResult.entryPoint || merged.entryPoint
    Object.assign(merged.keepDeps, stepResult.keepDeps)
    merged.activationEvents.push(...stepResult.activationEvents)
    if (stepResult.serverBinary) {
      merged.serverBinary = stepResult.serverBinary
    }
  }

  // 8. Apply code injections from steps (generic, no hardcoded plugin knowledge)
  for (const stepResult of stepResults) {
    if (!stepResult.codeInjections) continue
    for (const inj of stepResult.codeInjections) {
      const targetFile = merged.generatedFiles.find(f => f.path === inj.target)
      if (!targetFile) continue

      let content = targetFile.content

      // Add import codes
      if (inj.importCode) {
        if (inj.importCode.endsWith(',')) {
          // Import addition (adds a line to existing import block)
          const marker = inj.insertBefore || "} from 'coc.nvim'"
          if (!content.includes(inj.importCode.trim())) {
            content = content.replace(marker, `${inj.importCode}\n${marker}`)
          }
        } else {
          // Full import line
          if (!content.includes(inj.importCode)) {
            content = inj.importCode + '\n' + content
          }
        }
      }

      // Insert code before a marker
      if (inj.insertBefore && inj.code) {
        if (!content.includes(inj.code.trim())) {
          content = content.replace(inj.insertBefore, inj.code + inj.insertBefore)
        }
      }

      // Insert code after a marker
      if (inj.insertAfter && inj.code) {
        if (!content.includes(inj.code.trim())) {
          content = content.replace(inj.insertAfter, inj.insertAfter + inj.code)
        }
      }

      targetFile.content = content
      if (verbose) console.log(`  injected into ${inj.target}: ${(inj.importCode || inj.code).substring(0, 60)}...`)
    }
  }

  // 9. Write generated files
  for (const gf of merged.generatedFiles) {
    const fp = path.join(output, gf.path)
    fs.mkdirSync(path.dirname(fp), { recursive: true })
    fs.writeFileSync(fp, gf.content)
    if (verbose) console.log(`  wrote: ${gf.path}`)
  }

  // 10. Apply text replacements to all source files (getWordRangeAtPosition, .fileName)
  {
    const outputSrc = path.join(output, 'src')
    if (fs.existsSync(outputSrc)) {
      for (const f of fs.readdirSync(outputSrc, { recursive: true })) {
        const fp = typeof f === 'string' ? path.join(outputSrc, f) : f
        if (!fp.endsWith('.ts')) continue
        let content = fs.readFileSync(fp, 'utf-8')
        let changed = false

        if (content.includes('document.getWordRangeAtPosition')) {
          // const range = document.getWordRangeAtPosition(pos, regex)
          content = content.replace(
            /const range = document\.getWordRangeAtPosition\(([^,]+),\s*([^)]+)\)/g,
            'const line = document.getText().split("\\n")[$1.line]; const pre = line.slice(0, $1.character); const m = pre.match($2); const range = m ? { start: { line: $1.line, character: $1.character - m[0].length }, end: { line: $1.line, character: $1.character } } : undefined'
          )
          // const range = document.getWordRangeAtPosition(pos)
          content = content.replace(
            /const range = document\.getWordRangeAtPosition\(([^)]+)\)/g,
            'const line = document.getText().split("\\n")[$1.line]; const pre = line.slice(0, $1.character); const m = pre.match(/[_a-zA-Z0-9-]+/); const range = m ? { start: { line: $1.line, character: $1.character - m[0].length }, end: { line: $1.line, character: $1.character } } : undefined'
          )
          // range = document.getWordRangeAtPosition(pos, regex) (without const)
          content = content.replace(
            /range = document\.getWordRangeAtPosition\(([^,]+),\s*([^)]+)\)/g,
            '(() => { const ln = document.getText().split("\\n")[$1.line]; const pr = ln.slice(0, $1.character); const mt = pr.match($2); return mt ? { start: { line: $1.line, character: $1.character - mt[0].length }, end: { line: $1.line, character: $1.character } } : undefined; })()'
          )
          changed = true
        }

        if (content.includes('.fileName') || content.includes('.uri.fsPath')) {
          // .fileName → .uri (coc's TextDocument#uri returns a string path, not a URI object)
          content = content.replace(/(document|this\.document|textDocument|scope)\.fileName/g, '$1.uri')
          // .uri.fsPath → .uri (coc's uri is already a string path, not a URI object)
          content = content.replace(/\.uri\.fsPath/g, '.uri')
          changed = true
        }

        if (changed) fs.writeFileSync(fp, content)
      }
    }
  }

  // 12. Determine entry point
  const hasLanguageClient = steps.some(s => s.type === 'language-client')

  // If language-client step exists, it generates src/index.ts as entry.
  // If source step provides an entry point, the generated index.ts imports it.
  // For source-only plugins, entry is the source entry.
  let esbuildEntry = 'src/index.ts'
  if (!hasLanguageClient) {
    esbuildEntry = merged.entryPoint
      ? `src/${merged.entryPoint.replace(/^src\//, '')}`
      : 'src/extension.ts'
  }

  // 13. Generate package.json
  const pluginName = origPkg.name || path.basename(input)

  // Detect config namespace (from original contributes.properties or name)
  const origProps = origPkg.contributes?.configuration?.properties || {}
  const configNamespace = Object.keys(origProps).length > 0
    ? [...new Set(Object.keys(origProps).map((k: string) => k.split('.')[0]))][0]
    : pluginName

  // For bridge mode: detect TypeScript plugins from source + origPkg
  const hasBridge = steps.some(s => s.type === 'bridge')
  const tsPlugins = hasBridge ? scanTypeScriptPlugins(input, origPkg) : []
  const description = origPkg.description || ''

  const activationEvents = merged.activationEvents.length > 0
    ? merged.activationEvents
    : ['onLanguage']

  // Gather server deps: for module-kind language-client steps
  const serverDeps: Record<string, string> = {}
  for (const s of steps) {
    if (isLanguageClientStep(s) && s.server.kind === 'module') {
      const pkg = s.server.package
      const ver = origPkg.dependencies?.[pkg] || origPkg.devDependencies?.[pkg]
      if (ver && ver.startsWith('workspace:')) {
        serverDeps[pkg] = '*' // monorepo workspace → wildcard for npm
      } else {
        serverDeps[pkg] = ver || '*'
      }
    }
  }

  // Collect all runtime deps from origPkg (deps + devDeps, filtered)
  const origDeps: Record<string, string> = {}
  {
    const allPkgDeps = { ...origPkg.dependencies, ...origPkg.devDependencies }
    for (const [dep, ver] of Object.entries(allPkgDeps)) {
      const v = ver as string
      if (v.startsWith('workspace:')) continue
      if (dep.startsWith('@types/')) continue
      if (['typescript', 'mocha', 'c8', 'prettier', 'rollup', 'esbuild', '@vscode/'].some(p => dep.startsWith(p))) continue
      origDeps[dep] = v
    }
  }

  const deps: Record<string, string> = {
    ...serverDeps,
    ...origDeps,
    ...merged.keepDeps,
  }
  // Fix workspace: protocol deps (monorepo, invalid in npm) → wildcard
  for (const k of Object.keys(deps)) {
    if (typeof deps[k] === 'string' && deps[k].startsWith('workspace:')) deps[k] = '*'
  }

  const pkg = {
    name: pluginName.startsWith('coc-') ? pluginName : `coc-${pluginName}`,
    version: origPkg.version || '0.1.0',
    description,
    main: 'lib/index.js',
    engines: { coc: '^0.0.82' },
    activationEvents,
    dependencies: deps,
    devDependencies: {
      esbuild: '^0.28.0',
    },
    contributes: {
      configuration: origPkg.contributes?.configuration ? {
        type: 'object',
        title: origPkg.contributes.configuration.title || pluginName,
        properties: origPkg.contributes.configuration.properties || {},
      } : undefined,
      commands: origPkg.contributes?.commands?.map((c: any) => ({
        command: c.command,
        title: c.title,
      })) || undefined,
      ...(tsPlugins.length > 0 ? {
        typescriptServerPlugins: tsPlugins.map(p => ({
          ...p,
          languages: p.languages.length ? p.languages : [configNamespace],
        })),
      } : {}),
    },
  }

  // Clean null fields
  if (!pkg.contributes?.configuration) delete (pkg.contributes as any).configuration
  if (!pkg.contributes?.commands) delete (pkg.contributes as any).commands
  if (Object.keys(pkg.contributes).length === 0) delete (pkg as any).contributes

  fs.writeFileSync(path.join(output, 'package.json'), JSON.stringify(pkg, null, 2))

  // 14. Generate esbuild config — externalize all runtime deps
  const externalMods = [
    'coc.nvim',
    ...Object.keys(serverDeps),
    ...Object.keys(merged.keepDeps),
    ...Object.keys(origDeps),
  ].flatMap(n => {
    if (n.startsWith('@')) return n.split('/').slice(0, 2).join('/')
    return n.split('/')[0]
  }).filter((v, i, a) => v && a.indexOf(v) === i)

  const esbuildConfig = `\
import * as esbuild from 'esbuild'

const options = {
  entryPoints: ['${esbuildEntry}'],
  bundle: true,
  minify: false,
  mainFields: ['module', 'main'],
  external: [${externalMods.map(m => `'${m}'`).join(', ')}],
  platform: 'node',
  target: 'node18',
  outfile: 'lib/index.js',
}

const result = await esbuild.build(options)
if (result.errors.length) {
  console.error(result.errors)
  process.exit(1)
}
`
  fs.writeFileSync(path.join(output, 'esbuild.mjs'), esbuildConfig)

  // 15. Write step metadata for pipeline
  const meta = {
    entryPoint: esbuildEntry,
    activationEvents,
    keepDeps: merged.keepDeps,
    serverDeps,
    serverBinary: merged.serverBinary,
    hasLanguageClient,
  }
  fs.writeFileSync(path.join(output, 'coc-convert.json'), JSON.stringify(meta, null, 2))

  // 16. Print report
  console.log('\n=== Conversion Report ===')
  console.log(`  Plugin: ${pkg.name}`)
  console.log(`  Steps: ${steps.map(s => s.type).join(' → ')}`)
  console.log(`  Source files: ${result.files.length}`)
  console.log(`  Activation: ${activationEvents.join(', ')}`)

  if (merged.serverBinary) {
    console.log(`  Server binary: ${merged.serverBinary.repo}`)
  }

  console.log(`\n  ${output}/`)
  console.log('    ├── package.json')
  console.log('    ├── esbuild.mjs')
  console.log('    ├── coc-convert.json')
  if (hasLanguageClient) console.log('    ├── src/index.ts         ← generated entry')
  console.log('    ├── src/*.ts             ← converted source')
  console.log('\n  Next:')
  console.log(`    cd ${output}`)
  console.log('    npm install')
    console.log('    npx tsx esbuild.mjs')
}

function walkTsFiles(dir: string): string[] {
  const files: string[] = []
  try {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry)
      const stat = fs.statSync(full)
      if (stat.isDirectory()) {
        if (entry.startsWith('.') || entry === 'node_modules') continue
        files.push(...walkTsFiles(full))
      } else if (entry.endsWith('.ts') || entry.endsWith('.d.ts')) {
        files.push(full)
      }
    }
  } catch {}
  return files
}

function scanTypeScriptPlugins(input: string, origPkg: Record<string, any>): Array<{ name: string; languages: string[]; enableForWorkspaceTypeScriptVersions: boolean }> {
  // First check if origPkg already has typescriptServerPlugins configured
  if (origPkg.contributes?.typescriptServerPlugins?.length) {
    return origPkg.contributes.typescriptServerPlugins.map((p: any) => ({
      name: p.name,
      languages: p.languages || [],
      enableForWorkspaceTypeScriptVersions: p.enableForWorkspaceTypeScriptVersions ?? true,
    }))
  }

  // Otherwise scan source files for plugin references
  const plugins: Array<{ name: string; languages: string[]; enableForWorkspaceTypeScriptVersions: boolean }> = []
  let scanDir = path.join(input, 'src')
  if (!fs.existsSync(scanDir)) scanDir = input
  if (!fs.existsSync(scanDir)) return plugins

  const content = walkTsFiles(scanDir).map(f => fs.readFileSync(f, 'utf-8')).join('\n')
  const refs = content.matchAll(/['"](@[^'"]+\/(?:typescript-plugin|language-service)[^'"]*)['"]|['"](\w+(?:-typescript-plugin|-language-service))['"]/g)
  for (const m of refs) {
    const name = m[1] || m[2]
    if (name && !plugins.some(p => p.name === name)) {
      plugins.push({ name, languages: [], enableForWorkspaceTypeScriptVersions: true })
    }
  }

  for (const dep of Object.keys(origPkg.dependencies || {})) {
    if ((dep.includes('typescript-plugin') || dep.includes('language-service')) && !plugins.some(p => p.name === dep)) {
      plugins.push({ name: dep, languages: [], enableForWorkspaceTypeScriptVersions: true })
    }
  }

  return plugins
}
