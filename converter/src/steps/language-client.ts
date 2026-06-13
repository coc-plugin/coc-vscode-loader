import { StepGenerator, StepContext, LanguageClientStep, StepResult } from '../types.js'

function escapeStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$')
}

export const languageClientGenerator: StepGenerator = {
  type: 'language-client',

  generate(ctx: StepContext, step: StepResult): StepResult {
    const ls = step as LanguageClientStep
    const id = ls.id || (ctx.origPkg.name || 'language-client')
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
      serverOptionsCode = `{ command: serverPath, args: ${argsStr} }`
      binaryDownloaded = true
    } else {
      const pkg = ls.server.package
      const entry = ls.server.entry || 'main'

      // Same resolution as old converter: resolve main entry first, then walk for bin
      serverPathCode = `\
    let serverPath: string | undefined
    try {
      serverPath = require.resolve('${escapeStr(pkg)}')
    } catch {}
    try {
      // Walk up from the resolved main entry to find the package's package.json
      // We can't use require.resolve('pkg/package.json') because exports field may block it
      let _dir = require('path').dirname(require.resolve('${escapeStr(pkg)}'));
      while (_dir !== require('path').dirname(_dir)) {
        const _pkgPath = require('path').join(_dir, 'package.json');
        if (require('fs').existsSync(_pkgPath)) {
          const _pkg = JSON.parse(require('fs').readFileSync(_pkgPath, 'utf-8'));
          if (_pkg.bin) {
            const _entry = typeof _pkg.bin === 'string' ? _pkg.bin : Object.values(_pkg.bin)[0];
            serverPath = require('path').join(_dir, _entry);
          }
          break;
        }
        _dir = require('path').dirname(_dir);
      }
    } catch {}`
      // Use full require.resolve path (including bin walking) if available, else fallback to simple main entry
      serverOptionsCode = `{ module: serverPath || require.resolve('${escapeStr(pkg)}'), transport: ${transportExpr} }`
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
${ls.verbose ? `    console.log('[${escapeStr(id)}] activate() called')\n` : ''}${serverPathCode}
    if (!serverPath) {
${ls.verbose ? `    console.log('[${escapeStr(id)}] serverPath undefined')\n` : ''}\
      window.showErrorMessage('Cannot find language server.')
      return
    }
${ls.verbose ? `    console.log('[${escapeStr(id)}] serverPath =', serverPath)\n` : ''}\
${ls.verbose ? `    console.log('[${escapeStr(id)}] creating LanguageClient')\n` : ''}\
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
${ls.verbose ? `    console.log('[${escapeStr(id)}] registering LanguageClient')\n` : ''}\
    context.subscriptions.push(services.registerLanguageClient(client))
${ls.verbose ? `    console.log('[${escapeStr(id)}] starting client')\n` : ''}\
    client.start()

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
