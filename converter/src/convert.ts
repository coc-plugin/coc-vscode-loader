import { Project } from 'ts-morph'
import * as fs from 'fs'
import * as path from 'path'
import { scan } from './scanner.js'
import { TransformContext } from './types.js'
import { transformImportMapping } from './transforms/import-mapping.js'
import { transformLanguageClient } from './transforms/language-client.js'
import { transformClassToFactory } from './transforms/class-to-factory.js'
import { transformProviderRegister } from './transforms/provider-register.js'
import { transformEnumOffset } from './transforms/enum-offset.js'
import { getActivePresets, generateBridgeCode } from './presets.js'

const TRANSFORMS = [
  { name: 'import-mapping', fn: transformImportMapping },
  { name: 'class-to-factory', fn: transformClassToFactory },
  { name: 'provider-register', fn: transformProviderRegister },
  { name: 'enum-offset', fn: transformEnumOffset },
  { name: 'language-client', fn: transformLanguageClient },
]

interface Options {
  input: string
  output: string
  bridge?: boolean
  verbose?: boolean
}

export async function convert(opts: Options): Promise<void> {
  const { input, output } = opts

  if (!fs.existsSync(input)) {
    console.error(`input not found: ${input}`)
    process.exit(1)
  }

  // 1. Scan
  console.log('Scanning...')
  const result = scan(input)
  console.log(result.summary)

  if (result.files.length === 0) {
    console.log('No VS Code API usage found, nothing to convert.')
    return
  }

  // 2. Create output directory
  if (fs.existsSync(output)) {
    fs.rmSync(output, { recursive: true })
  }
  fs.mkdirSync(path.join(output, 'src'), { recursive: true })

  // 3. Read original package.json
  const origPkgPath = path.join(input, 'package.json')
  const origPkg = fs.existsSync(origPkgPath)
    ? JSON.parse(fs.readFileSync(origPkgPath, 'utf-8'))
    : {}

  // 4. Copy source files (only .ts that have vscode usage)
  const srcDir = path.join(input, 'src')
  const copiedFiles: string[] = []
  if (fs.existsSync(srcDir)) {
    for (const file of fs.readdirSync(srcDir)) {
      if (!file.endsWith('.ts')) continue
      const srcPath = path.join(srcDir, file)
      const destPath = path.join(output, 'src', file)
      fs.copyFileSync(srcPath, destPath)
      copiedFiles.push(file)
    }
  }

  // 5. Load files with ts-morph and apply transforms
  const project = new Project()
  const srcFiles = copiedFiles
    .map(f => path.join(output, 'src', f))
    .filter(f => fs.existsSync(f))

  for (const fp of srcFiles) {
    try { project.addSourceFileAtPath(fp) } catch {}
  }

  for (const file of project.getSourceFiles()) {
    const ctx: TransformContext = { file, project }
    for (const t of TRANSFORMS) {
      try {
        t.fn(ctx)
        if (opts.verbose) console.log(`  ${t.name}: ${path.basename(file.getFilePath())}`)
      } catch (e: any) {
        console.warn(`  ${t.name} error: ${e.message}`)
      }
    }
    file.saveSync()
  }

  // 6. Mark unsupported code patterns in source files
  for (const file of result.files) {
    if (!file.path.startsWith('src/') || !file.path.endsWith('.ts')) continue
    const fp = path.join(output, file.path)
    if (!fs.existsSync(fp)) continue

    let content = fs.readFileSync(fp, 'utf-8')

    // Mark unsupported lines
    for (const { pattern, label } of [
      { pattern: 'createTextEditorDecorationType', label: 'decoration API' },
      { pattern: 'createWebviewPanel', label: 'webview API' },
      { pattern: 'registerTreeDataProvider', label: 'tree data provider' },
      { pattern: 'env.openExternal', label: 'env.openExternal' },
    ]) {
      content = content.replace(
        new RegExp(`^(.*${pattern}.*)$`, 'gm'),
        '// [converter] TODO: $1  — coc has no equivalent for ' + label
      )
    }

    // Replace getWordRangeAtPosition calls with inline word boundary calculation.
    // In coc's TextDocument there's no getWordRangeAtPosition.
    content = content.replace(
      /const range = document\.getWordRangeAtPosition\(([^,]+),\s*([^)]+)\)/g,
      'const line = document.getText().split("\\n")[$1.line]; const pre = line.slice(0, $1.character); const m = pre.match($2); const range = m ? Range.create($1.line, $1.character - m[0].length, $1.line, $1.character) : undefined'
    )
    content = content.replace(
      /const range = document\.getWordRangeAtPosition\(([^)]+)\)/g,
      'const line = document.getText().split("\\n")[$1.line]; const pre = line.slice(0, $1.character); const m = pre.match(/[_a-zA-Z0-9-]+/); const range = m ? Range.create($1.line, $1.character - m[0].length, $1.line, $1.character) : undefined'
    )
    // Also replace usage without 'const' (already declared)
    content = content.replace(
      /range = document\.getWordRangeAtPosition\(([^,]+),\s*([^)]+)\)/g,
      '(() => { const ln = document.getText().split("\\n")[$1.line]; const pr = ln.slice(0, $1.character); const mt = pr.match($2); return mt ? Range.create($1.line, $1.character - mt[0].length, $1.line, $1.character) : undefined; })()'
    )
    // fileName → uri (coc's DocumentUri is a string path)
    if (content.includes('.fileName')) {
      content = content.replace(/\.fileName/g, '.uri')
      // uri is a full path in coc, but fileName might have had file:// prefix in vscode
      // Add comment about potential file:// handling
    }

    // Remove unsupported import packages
    content = content.replace(
      /import .* from ['"]@volar\/vscode['"];?\n?/g,
      ''
    )
    content = content.replace(
      /import .* from ['"]reactive-vscode['"];?\n?/g,
      ''
    )
    content = content.replace(
      /import \* as lsp from ['"]@volar\/vscode\/node['"];?\n?/g,
      ''
    )

    fs.writeFileSync(fp, content)
  }

  // 7. Detect config namespace from original properties
  const origProps = origPkg.contributes?.configuration?.properties || {}
  const configNamespace = Object.keys(origProps).length > 0
    ? [...new Set(Object.keys(origProps).map(k => k.split('.')[0]))][0]
    : origPkg.name || path.basename(input)

  // 8. Detect server module from original source
  const serverModuleNames = detectServerModules(input, result)
  if (serverModuleNames.length > 0) {
    console.log(`  detected server: ${serverModuleNames.join(', ')}`)
  }

  // 9. Determine plugin type and entry point
  const hasTsBridge = result.hasTsBridge
  const hasServer = serverModuleNames.length > 0
  const isDirectApi = !hasServer && !hasTsBridge
  const pluginName = origPkg.name || path.basename(input)
  const description = origPkg.description || ''
  const activePresets = getActivePresets(hasTsBridge, result)

  // Build server resolution code
  const serverResolveCalls = serverModuleNames.map(name => {
    return `\
    try { serverModule = require.resolve('${escapeStr(name)}') } catch {}
    try {
      const _mainPath = require.resolve('${escapeStr(name)}');
      let _dir = require('path').dirname(_mainPath);
      while (_dir !== require('path').dirname(_dir)) {
        const _pkgPath = require('path').join(_dir, 'package.json');
        if (require('fs').existsSync(_pkgPath)) {
          const _pkg = JSON.parse(require('fs').readFileSync(_pkgPath, 'utf-8'));
          if (_pkg.bin) {
            const _entry = typeof _pkg.bin === 'string' ? _pkg.bin : Object.values(_pkg.bin)[0];
            serverModule = require('path').join(_dir, _entry);
          }
          break;
        }
        _dir = require('path').dirname(_dir);
      }
    } catch {}`
  }).join('\n')

  // Generate bridge code from presets
  const bridgeCode = generateBridgeCode(activePresets)
  const needsExtensions = activePresets.some(p => p.name === 'ts-bridge')
  const needsCommands = activePresets.some(p => p.requiresCommand)

  let fullCode = ''
  let esbuildEntry = 'src/index.ts'
  if (isDirectApi) {
    esbuildEntry = 'src/extension.ts'
  } else {
    fullCode = `\
import {
  LanguageClient,
  TransportKind,
  workspace,
  window,
  commands,
  services as cocServices,
  ExtensionContext${needsExtensions ? ',\n  extensions' : ''},
} from 'coc.nvim'
import * as path from 'path'
import * as fs from 'fs'

export async function activate(context: ExtensionContext): Promise<void> {
  try {
${needsExtensions ? `\
    const tsExt = extensions.all.find(e => e.id === 'coc-tsserver')
    if (tsExt && !tsExt.isActive) { await tsExt.activate() }
    const tsSvc = cocServices.getService('tsserver')
    if (tsSvc) { await tsSvc.start() }
` : ''}\
    const config = workspace.getConfiguration('${escapeStr(configNamespace)}')
    let serverModule = config.get<string>('server.path', '')
    if (serverModule) {
      serverModule = path.isAbsolute(serverModule) ? serverModule : path.join(workspace.root, serverModule)
    }
    if (!serverModule || !fs.existsSync(serverModule)) {
${serverResolveCalls}
    }
    if (!serverModule) { window.showErrorMessage('Cannot find language server.'); return }

    const client = new LanguageClient(
      '${escapeStr(pluginName)}',
      '${escapeStr(description || pluginName)}',
      { module: serverModule, transport: TransportKind.ipc },
      {
        documentSelector: [{ language: '${escapeStr(configNamespace)}', scheme: 'file' }],
        outputChannelName: '${escapeStr(description || pluginName)}',
      },
    )
    context.subscriptions.push({ dispose: () => client.stop() })
    context.subscriptions.push(cocServices.registerLanguageClient(client))
    client.start()

${bridgeCode ? bridgeCode + '\n\n' : ''}\
    // Restart command
    context.subscriptions.push(
      commands.registerCommand('${escapeStr(pluginName)}.restartServer', async () => {
        await client.stop()
        client.start()
      }),
    )
  } catch (e: any) {
    window.showErrorMessage('${escapeStr(pluginName)} error: ' + (e.message || String(e)))
  }
}
`
  }
  if (fullCode) {
    fs.writeFileSync(path.join(output, 'src', 'index.ts'), fullCode)
  }

  // 10. Detect dependencies from original package.json + preset extras
  const serverDeps: Record<string, string> = {}
  // Add preset extra deps (e.g. typescript for ts-bridge)
  for (const preset of activePresets) {
    for (const dep of (preset.extraDeps || [])) {
      if (!serverDeps[dep]) serverDeps[dep] = '*'
    }
  }
  if (isDirectApi) {
    // Non-LSP: keep all original deps (including devDeps, since they may be imported at runtime)
    const allDeps = { ...origPkg.dependencies, ...origPkg.devDependencies }
    for (const [dep, ver] of Object.entries(allDeps)) {
      if (ver.startsWith('workspace:')) continue
      if (dep.startsWith('@types/')) continue // skip type packages
      if (['typescript', 'mocha', 'c8', 'prettier', 'rollup', '@vscode/'].some(p => dep.startsWith(p))) continue
      if (['tslib'].includes(dep)) continue
      serverDeps[dep] = ver as string
    }
  } else {
    // LSP-based: only include server-related dependencies
    const knownPatterns = ['language-server', 'language-server/node', '-server', 'languageserver']
    for (const [dep, ver] of Object.entries(origPkg.dependencies || {})) {
      if (ver.startsWith('workspace:')) continue
      if (knownPatterns.some(p => dep.includes(p))) {
        serverDeps[dep] = ver as string
      }
    }
    for (const name of serverModuleNames) {
      const pkgName = name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0]
      if (!serverDeps[pkgName]) serverDeps[pkgName] = '*'
    }
  }
  const activationEvents = Array.isArray(origPkg.activationEvents) ? origPkg.activationEvents : []
  const activationEvent = activationEvents.find((e: string) => e.startsWith('onLanguage:'))
    || (activationEvents.includes('*') ? '*' : undefined)
    || (activationEvents.includes('onStartupFinished') ? '*' : undefined)
    || `onLanguage:${configNamespace}`
    || 'onLanguage'
  const pkg = {
    name: pluginName.startsWith('coc-') ? pluginName : `coc-${pluginName}`,
    version: origPkg.version || '0.1.0',
    dependencies: {
      ...serverDeps,
    },
    devDependencies: {
      esbuild: '^0.28.0',
    },
    description: description,
    main: 'lib/index.js',
    engines: { coc: '^0.0.82' },
    activationEvents: [activationEvent],
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
      ...(hasTsBridge ? {
        typescriptServerPlugins: (origPkg.contributes?.typescriptServerPlugins?.length
          ? origPkg.contributes?.typescriptServerPlugins
          : scanTypeScriptPlugins(input, result).map(p => ({
              ...p,
              languages: p.languages.length ? p.languages : [configNamespace],
            }))
        ) || [],
      } : {}),
    },
  }

  // Clean null fields
  for (const key of ['configuration', 'commands'] as const) {
    if (!pkg.contributes[key]) delete pkg.contributes[key]
  }
  if (Object.keys(pkg.contributes).length === 0) delete pkg.contributes

  fs.writeFileSync(path.join(output, 'package.json'), JSON.stringify(pkg, null, 2))

  // 10. Generate esbuild config
  const externalMods = ['coc.nvim', ...serverModuleNames]
    .map(n => n.startsWith('@') ? n.split('/').slice(0, 2).join('/') : n.split('/')[0])
    .filter((v, i, a) => v && a.indexOf(v) === i)
  const esbuildConfig = `\
import * as esbuild from 'esbuild'

const options = {
  entryPoints: ['${escapeStr(esbuildEntry)}'],
  bundle: true,
  minify: false,
  mainFields: ['module', 'main'],
  external: [${externalMods.map(m => `'${escapeStr(m)}'`).join(', ')}],
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

  // 11. Generate report
  console.log('\n=== Conversion Report ===')
  console.log(`  Plugin: ${pkg.name}`)
  console.log(`  Type: ${hasTsBridge ? 'ts-bridge' : 'pure-lsp'}`)
  console.log(`  Source files: ${copiedFiles.length + (hasTsBridge ? 0 : 0)}`)

  if (hasTsBridge) {
    console.log('\n  ⚠ TS-bridge mode:')
    console.log('    - Generated src/index.ts with tsserver/request bridge')
    console.log('    - Package.json includes typescriptServerPlugins')
    console.log('    - Requires modified coc-tsserver (PR #493)')
    console.log('    - Install: cd ~/.config/coc/extensions && npm install ChuYanLon/coc-tsserver')
  }

  console.log(`\n  ${output}/`)
  console.log('    ├── src/index.ts         ← main entry')
  console.log('    ├── package.json         ← coc plugin config')
  console.log('    ├── esbuild.mjs          ← build config')
  console.log('    └── src/*.ts             ← converted source')
  console.log('\n  Next:')
  console.log(`    cd ${output}`)
  console.log('    npm install')
  console.log('    npm run build')
}

/**
 * Scan original source for TypeScript plugin names used by the extension.
 * Checks: explicit imports, require() calls, package.json dependencies.
 */
function scanTypeScriptPlugins(input: string, _result: any): Array<{ name: string; languages: string[]; enableForWorkspaceTypeScriptVersions: boolean }> {
  const plugins: Array<{ name: string; languages: string[]; enableForWorkspaceTypeScriptVersions: boolean }> = []
  const scanDir = path.join(input, 'src')
  if (!fs.existsSync(scanDir)) return plugins

  // Collect all .ts file content
  const allContent: string[] = []
  for (const file of fs.readdirSync(scanDir)) {
    if (!file.endsWith('.ts')) continue
    allContent.push(fs.readFileSync(path.join(scanDir, file), 'utf-8'))
  }
  const content = allContent.join('\n')

  // Check for plugin names in require() / import statements
  // Patterns like: @vue/typescript-plugin, @angular/language-service, etc.
  const pluginRefs = content.matchAll(/['"](@[^'"]+\/(?:typescript-plugin|language-service)[^'"]*)['"]|['"](\w+(?:-typescript-plugin|-language-service))['"]/g)
  for (const m of pluginRefs) {
    const name = m[1] || m[2]
    if (name && !plugins.some(p => p.name === name)) {
      plugins.push({ name, languages: [], enableForWorkspaceTypeScriptVersions: true })
    }
  }

  // Check package.json for typescript plugin dependencies
  const pkgPath = path.join(input, 'package.json')
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    for (const dep of Object.keys(pkg.dependencies || {})) {
      if (dep.includes('typescript-plugin') || dep.includes('language-service')) {
        if (!plugins.some(p => p.name === dep)) {
          plugins.push({ name: dep, languages: [], enableForWorkspaceTypeScriptVersions: true })
        }
      }
    }
  }

  return plugins
}

/** Escape string for template literal */
function escapeStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$')
}

/** Clean up server path: relative → bare package name, subpath → base */
function sanitizeServerPath(p: string): string | null {
  if (p.startsWith('../node_modules/')) p = p.replace(/^\.\.\/node_modules\//, '')
  if (p.startsWith('./')) return null
  if (p.startsWith('../')) return null
  if (p.startsWith('@')) {
    const parts = p.split('/')
    if (parts.length > 2) return parts.slice(0, 2).join('/')
  } else {
    const parts = p.split('/')
    if (parts.length > 1) return parts[0]
  }
  return p
}

/**
 * Detect language server module names from original source code.
 * Returns an array of `require.resolve` argument strings (bare module names).
 */
function detectServerModules(input: string, _result: any): string[] {
  const serverModules: string[] = []
  const seen = new Set<string>()
  const scanDir = path.join(input, 'src')
  if (fs.existsSync(scanDir)) {
    for (const file of fs.readdirSync(scanDir)) {
      if (!file.endsWith('.ts')) continue
      const content = fs.readFileSync(path.join(scanDir, file), 'utf-8')
      for (const re of [/(?:require\s*(?:\.\s*resolve)?\s*\(|from\s+)['"]([^'"]+(?:language-server|server|Server)[^'"]*)['"]\s*\)?/g]) {
        for (const m of content.matchAll(re)) {
          const name = sanitizeServerPath(m[1])
          if (name && !seen.has(name)) { seen.add(name); serverModules.push(name) }
        }
      }
    }
  }
  return serverModules
}
