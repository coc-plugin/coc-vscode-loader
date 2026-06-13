import { StepGenerator, StepContext, LanguageClientStep, StepResult } from '../types.js'

function escapeStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$')
}

export const languageClientGenerator: StepGenerator = {
  type: 'language-client',

  generate(ctx: StepContext, step: StepResult): StepResult {
    const ls = step as LanguageClientStep
    const id = ls.id || 'main-ls'
    const transport = ls.transport || (ls.server.kind === 'binary' ? 'stdio' : 'ipc')
    const transportExpr = transport === 'stdio' ? 'TransportKind.stdio' : 'TransportKind.ipc'
    const languages = ls.languages
    const multiRoot = ls.multiRoot ?? false
    const pluginName = ctx.origPkg.name || 'plugin'
    const description = ctx.origPkg.description || pluginName

    let serverPathCode: string
    let serverOptionsCode: string
    let binaryDownloaded = false

    if (ls.server.kind === 'binary') {
      const pkg = ls.server.package
      const binary = ls.server.binary
      const args = ls.server.args || []
      const argsStr = args.length ? `[${args.map(a => `'${escapeStr(a)}'`).join(', ')}]` : '[]'

      serverPathCode = `\
    let serverPath: string | undefined
    try {
      serverPath = require.resolve('${escapeStr(pkg)}')
    } catch {}
    if (!serverPath) {
      serverPath = require('path').join(__dirname, '..', 'server', '${escapeStr(binary.binaryPath || pkg)}')
    }`
      serverOptionsCode = `{ command: serverPath, args: ${argsStr}, transport: ${transportExpr} }`
      binaryDownloaded = true
    } else {
      const pkg = ls.server.package
      const entry = ls.server.entry || 'main'

      serverPathCode = `\
    let serverPath: string | undefined
    try {
      serverPath = require.resolve('${escapeStr(pkg)}')
    } catch {}
    if (serverPath && ${entry === 'bin' ? 'true' : 'false'}) {
      try {
        const pkgJson = require(require.resolve('${escapeStr(pkg)}/package.json'))
        if (pkgJson.bin) {
          const binEntry = typeof pkgJson.bin === 'string' ? pkgJson.bin : Object.values(pkgJson.bin)[0]
          serverPath = require('path').join(require('path').dirname(require.resolve('${escapeStr(pkg)}/package.json')), binEntry)
        }
      } catch {}
    }`

      if (entry === 'bin') {
        serverOptionsCode = `{ module: serverPath || require.resolve('${escapeStr(pkg)}'), transport: ${transportExpr} }`
      } else {
        serverOptionsCode = `{ module: serverPath || require.resolve('${escapeStr(pkg)}'), transport: ${transportExpr} }`
      }
    }

    const docSelectorCode = `[${languages.map(l => `{ scheme: 'file', language: '${l}' }`).join(', ')}]`

    const code = `\
import {
  LanguageClient,
  TransportKind,
  services,
  workspace,
  window,
  commands,
  ExtensionContext,
} from 'coc.nvim'
import * as path from 'path'

export async function activate(context: ExtensionContext): Promise<void> {
  try {
${serverPathCode}
    if (!serverPath) {
      window.showErrorMessage('Cannot find language server.')
      return
    }

    const client = new LanguageClient(
      '${escapeStr(id)}',
      '${escapeStr(description)}',
      ${serverOptionsCode},
      {
        documentSelector: ${docSelectorCode},
        outputChannelName: '${escapeStr(description)}',
      },
    )
    context.subscriptions.push({ dispose: () => client.stop() })
    context.subscriptions.push(services.registerLanguageClient(client))
    client.start().catch(() => {/* init may complete async */})

    context.subscriptions.push(
      commands.registerCommand('${escapeStr(pluginName)}.restart', async () => {
        await client.stop()
        client.start()
      }),
    )
  } catch (e: any) {
    window.showErrorMessage('${escapeStr(pluginName)} error: ' + (e.message || String(e)))
  }
}
`

    const activationEvents = languages.map(l => `onLanguage:${l}`)

    return {
      generatedFiles: [{ path: 'src/index.ts', content: code }],
      entryPoint: 'src/index.ts',
      keepDeps: {},
      activationEvents,
      serverBinary: ls.server.kind === 'binary' ? {
        repo: ls.server.binary.repo,
        asset: ls.server.binary.asset,
        binaryPath: ls.server.binary.binaryPath,
        args: ls.server.args,
      } : undefined,
    }
  },
}
