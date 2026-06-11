import { Project } from 'ts-morph'
import * as fs from 'fs'
import * as path from 'path'
import { scan } from './scanner.js'
import { TransformContext } from './types.js'
import { transformImportMapping } from './transforms/import-mapping.js'
import { transformLanguageClient } from './transforms/language-client.js'

const TRANSFORMS = [
  { name: 'import-mapping', fn: transformImportMapping },
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

  // 8. Generate bridge index.ts for TS-bridge plugins
  const hasTsBridge = result.hasTsBridge
  const pluginName = origPkg.name || path.basename(input)
  const description = origPkg.description || ''

  let bridgeCode = ''
  if (hasTsBridge) {
    bridgeCode = `\
import {
  LanguageClient,
  TransportKind,
  RevealOutputChannelOn,
  workspace,
  window,
  commands,
  extensions,
  services as cocServices,
  ExtensionContext,
} from 'coc.nvim'
import * as path from 'path'
import * as fs from 'fs'

export async function activate(context: ExtensionContext): Promise<void> {
  try {
    // Ensure coc-tsserver is active (loads TS plugins like @vue/typescript-plugin)
    const tsExt = extensions.all.find(e => e.id === 'coc-tsserver')
    if (tsExt && !tsExt.isActive) {
      await tsExt.activate()
    }
    const tsSvc = cocServices.getService('tsserver')
    if (tsSvc) {
      await tsSvc.start()
    }

    // Find language server module
    const config = workspace.getConfiguration('${configNamespace}')
    let serverModule = config.get<string>('server.path', '')
    if (serverModule) {
      serverModule = path.isAbsolute(serverModule) ? serverModule : path.join(workspace.root, serverModule)
    }
    if (!serverModule || !fs.existsSync(serverModule)) {
      try { serverModule = require.resolve('@vue/language-server/index.js') }
      catch { try { serverModule = require.resolve('@vue/language-server/bin/vue-language-server.js') } catch {} }
    }
    if (!serverModule) { window.showErrorMessage('Cannot find language server.'); return }

    // Start LSP client
    const client = new LanguageClient(
      '${pluginName}',
      '${description || pluginName}',
      { module: serverModule, transport: TransportKind.ipc },
      {
        documentSelector: [{ language: 'vue', scheme: 'file' }],
        outputChannelName: '${description || pluginName}',
        revealOutputChannelOn: RevealOutputChannelOn.Never,
        progressOnInitialization: true,
      },
    )
    context.subscriptions.push({ dispose: () => client.stop() })
    context.subscriptions.push(cocServices.registerLanguageClient(client))
    client.start()

    // tsserver bridge
    client.onNotification('tsserver/request', async ([seq, command, args]: [number, string, any]) => {
      try {
        const result = await commands.executeCommand<any>(
          'typescript.tsserverRequest', command, args,
          { isAsync: true, lowPriority: true },
        )
        client.sendNotification('tsserver/response', [seq, result?.body])
      } catch {
        client.sendNotification('tsserver/response', [seq, undefined])
      }
    })

    // Restart command
    context.subscriptions.push(
      commands.registerCommand('${pluginName}.restartServer', async () => {
        await client.stop()
        client.start()
      }),
    )
  } catch (e: any) {
    window.showErrorMessage('${pluginName} error: ' + (e.message || String(e)))
  }
}
`
  } else {
    bridgeCode = `\
import {
  LanguageClient,
  TransportKind,
  workspace,
  window,
  ExtensionContext,
} from 'coc.nvim'
import * as path from 'path'
import * as fs from 'fs'

export async function activate(context: ExtensionContext): Promise<void> {
  try {
    const config = workspace.getConfiguration('${configNamespace}')
    let serverModule = config.get<string>('server.path', '')
    if (serverModule) {
      serverModule = path.isAbsolute(serverModule) ? serverModule : path.join(workspace.root, serverModule)
    }
    if (!serverModule || !fs.existsSync(serverModule)) {
      try { serverModule = require.resolve('./server/index.js') } catch {}
    }
    if (!serverModule) { window.showErrorMessage('Cannot find server.'); return }

    const client = new LanguageClient(
      '${pluginName}',
      '${description || pluginName}',
      { module: serverModule, transport: TransportKind.ipc },
      {
        documentSelector: [{ language: 'vue', scheme: 'file' }],
        outputChannelName: '${description || pluginName}',
      },
    )
    context.subscriptions.push({ dispose: () => client.stop() })
    context.subscriptions.push(client)
    client.start()
  } catch (e: any) {
    window.showErrorMessage('${pluginName} error: ' + (e.message || String(e)))
  }
}
`
  }

  fs.writeFileSync(path.join(output, 'src', 'index.ts'), bridgeCode)

  // 9. Generate package.json with dependencies
  const serverDeps: Record<string, string> = {}
  if (hasTsBridge) {
    // Default deps for TS bridge plugins, override in registry per plugin
    serverDeps['@vue/language-server'] = '^3.3.4'
    serverDeps['typescript'] = '^5.0.0'
  }
  const activationEvents = Array.isArray(origPkg.activationEvents) ? origPkg.activationEvents : []
  const activationEvent = activationEvents.find((e: string) => e.startsWith('onLanguage:'))
    || `onLanguage:${configNamespace}`
    || 'onLanguage'
  const pkg = {
    name: pluginName.startsWith('coc-') ? pluginName : `coc-${pluginName}`,
    version: origPkg.version || '0.1.0',
    dependencies: {
      ...serverDeps,
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
        typescriptServerPlugins: [
          {
            name: '@vue/typescript-plugin',
            languages: ['vue'],
            enableForWorkspaceTypeScriptVersions: true,
          },
        ],
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
  const esbuildConfig = `\
import * as esbuild from 'esbuild'

const options = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: false,
  mainFields: ['module', 'main'],
  external: ['coc.nvim'],
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
  console.log('    ├── src/index.ts         ← 主入口')
  console.log('    ├── package.json         ← coc 插件配置')
  console.log('    ├── esbuild.mjs          ← 构建配置')
  console.log('    └── src/*.ts             ← 转换后的源码')
  console.log('\n  Next:')
  console.log(`    cd ${output}`)
  console.log('    npm install')
  console.log('    npm run build')
}
