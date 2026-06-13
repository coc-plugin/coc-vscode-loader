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

  // 2. Scan for summary
  console.log('Scanning...')
  const result = scan(path.join(input, 'src'))
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
  const ctx = { input, output, project, origPkg, verbose }
  const merged: MergedResult = {
    generatedFiles: [],
    entryPoint: undefined,
    keepDeps: {},
    activationEvents: [],
    serverBinary: undefined,
  }

  for (const step of steps) {
    if (verbose) console.log(`  step: ${step.type}`)
    const stepResult: StepResult = executeStep(ctx, step)

    // Merge
    merged.generatedFiles.push(...stepResult.generatedFiles)
    merged.entryPoint = stepResult.entryPoint || merged.entryPoint
    Object.assign(merged.keepDeps, stepResult.keepDeps)
    merged.activationEvents.push(...stepResult.activationEvents)
    if (stepResult.serverBinary) {
      merged.serverBinary = stepResult.serverBinary
    }
  }

  // 7. Inject source entry import into language-client entry
  {
    const lcStep = steps.some(s => s.type === 'language-client')
    const srcStep = steps.find(s => s.type === 'source') as any
    if (lcStep && srcStep?.entry) {
      const entryFile = merged.generatedFiles.find(f => f.path === 'src/index.ts')
      if (entryFile) {
        const relPath = srcStep.entry.replace(/^src\//, '').replace(/\.ts$/, '')
        if (!entryFile.content.includes(`'./${relPath}'`)) {
          entryFile.content = `import './${relPath}'\n` + entryFile.content
          if (verbose) console.log(`  injected import for ${srcStep.entry} into src/index.ts`)
        }
      }
    }
  }

  // 8. Write generated files
  for (const gf of merged.generatedFiles) {
    const fp = path.join(output, gf.path)
    fs.mkdirSync(path.dirname(fp), { recursive: true })
    fs.writeFileSync(fp, gf.content)
    if (verbose) console.log(`  wrote: ${gf.path}`)
  }

  // 8. Determine entry point
  const hasLanguageClient = steps.some(s => s.type === 'language-client')

  // If language-client step exists, it generates src/index.ts as entry.
  // If source step provides an entry point, the generated index.ts imports it.
  // For source-only plugins, entry is the source entry.
  let esbuildEntry: string
  if (hasLanguageClient) {
    esbuildEntry = 'src/index.ts'
  } else {
    esbuildEntry = merged.entryPoint || 'src/extension.ts'
  }

  // 9. Generate package.json
  const pluginName = origPkg.name || path.basename(input)
  const description = origPkg.description || ''

  const activationEvents = merged.activationEvents.length > 0
    ? merged.activationEvents
    : ['onLanguage']

  // Gather server deps: for module-kind language-client steps
  const serverDeps: Record<string, string> = {}
  for (const s of steps) {
    if (isLanguageClientStep(s) && s.server.kind === 'module') {
      const pkg = s.server.package
      const ver = origPkg.dependencies?.[pkg] || origPkg.devDependencies?.[pkg] || '*'
      serverDeps[pkg] = ver
    }
  }

  const deps: Record<string, string> = {
    ...serverDeps,
    ...merged.keepDeps,
  }

  const pkg = {
    name: pluginName.startsWith('coc-') ? pluginName : `coc-${pluginName}`,
    version: origPkg.version || '0.1.0',
    description,
    main: 'lib/index.js',
    engines: { coc: '^0.0.82' },
    activationEvents,
    dependencies: deps,
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
    },
  }

  // Clean null fields
  if (!pkg.contributes?.configuration) delete (pkg.contributes as any).configuration
  if (!pkg.contributes?.commands) delete (pkg.contributes as any).commands
  if (Object.keys(pkg.contributes).length === 0) delete (pkg as any).contributes

  fs.writeFileSync(path.join(output, 'package.json'), JSON.stringify(pkg, null, 2))

  // 10. Generate esbuild config
  const externalMods = [
    'coc.nvim',
    ...Object.keys(serverDeps),
    ...Object.keys(merged.keepDeps),
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

  // 11. Write step metadata for pipeline
  const meta = {
    entryPoint: esbuildEntry,
    activationEvents,
    keepDeps: merged.keepDeps,
    serverDeps,
    serverBinary: merged.serverBinary,
    hasLanguageClient,
  }
  fs.writeFileSync(path.join(output, 'coc-convert.json'), JSON.stringify(meta, null, 2))

  // 12. Print report
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
