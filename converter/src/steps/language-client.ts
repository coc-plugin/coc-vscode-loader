import { StepGenerator, StepContext, LanguageClientStep, StepResult } from '../types.js'

function escapeStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/`/g, '\\`').replace(/\$/g, '\\$')
}

export const languageClientGenerator: StepGenerator = {
  type: 'language-client',

  generate(ctx: StepContext, step: any): StepResult {
    const ls = step as LanguageClientStep
    const id = ls.id || (ctx.origPkg.name || 'language-client')
    const transport = ls.transport || (ls.server.kind === 'binary' ? 'stdio' : 'ipc')
    const transportExpr = transport === 'stdio' ? 'TransportKind.stdio' : 'TransportKind.ipc'
    const languages = ls.languages
    const multiRoot = ls.multiRoot ?? false
    const pluginName = ctx.origPkg.name || 'plugin'
    const description = ctx.origPkg.description || pluginName

    const isLocal = ls.server.kind !== 'binary' && (ls.server.package.startsWith('./') || ls.server.package.startsWith('../'))

    let serverPathCode: string
    let serverOptionsCode: string

    // Compute runtime args expression (for both binary and module servers)
    function buildArgsExpr(args: string[]): string {
      return args.map(a => {
        if (a === '{dir}') return '__dirname'
        if (a === '{pluginDir}') return "require('path').resolve(__dirname, '..')"
        return `'${escapeStr(a)}'`
      }).join(', ')
    }

    if (ls.server.kind === 'binary') {
      const pkg = ls.server.package
      const binary = ls.server.binary
      const fallbackName = binary ? (binary.binaryPath || pkg) : pkg
      const args = ls.server.args || []
      const argsStr = args.length ? `[${args.map(a => `'${escapeStr(a)}'`).join(', ')}]` : '[]'

      serverPathCode = `\
    let serverPath: string | undefined
    try {
      serverPath = require.resolve('${escapeStr(pkg)}')
    } catch {}
    if (!serverPath) {
      const _fallback = require('path').join(__dirname, '..', 'server', '${escapeStr(fallbackName)}')
      if (require('fs').existsSync(_fallback)) {
        serverPath = _fallback
      } else {
        serverPath = '${escapeStr(pkg)}'
      }
    }`
      serverOptionsCode = `{ command: serverPath, args: ${argsStr} }`
    } else {
      const pkg = ls.server.package

      if (pkg.startsWith('./') || pkg.startsWith('../')) {
        // Local relative path server — simple resolve, no bin walking, no package.json fallback
        serverPathCode = `\
    let serverPath: string | undefined
    let _mainEntry: string | undefined
    try {
      _mainEntry = require.resolve('${escapeStr(pkg)}')
    } catch {}
    if (!_mainEntry) {
      _mainEntry = require('path').join(__dirname, '${escapeStr(pkg)}')
    }`
        const args = ls.server.args
        const argsClause = args?.length ? `, args: [${buildArgsExpr(args)}]` : ''
        serverOptionsCode = `{ module: _mainEntry, transport: ${transportExpr}${argsClause} }`
      } else {
        // npm package server — resolve main entry, then walk for bin
        const entry = ls.server.entry || 'main'
        const binName = ls.server.binName || ''
        const binLookupCode = binName
          ? `(typeof _pkg.bin === 'string' ? _pkg.bin : (_pkg.bin && _pkg.bin['${escapeStr(binName)}'] ? _pkg.bin['${escapeStr(binName)}'] : Object.values(_pkg.bin)[0]))`
          : `(typeof _pkg.bin === 'string' ? _pkg.bin : Object.values(_pkg.bin)[0])`
        serverPathCode = `\
    let serverPath: string | undefined
    let _mainEntry: string | undefined
    try {
      _mainEntry = require.resolve('${escapeStr(pkg)}')
    } catch {}
    if (!_mainEntry) {
      try { _mainEntry = require.resolve('${escapeStr(pkg)}/package.json') } catch {}
    }
    try {
      // Walk up from the resolved main entry to find the package's package.json
      // We can't use require.resolve('pkg/package.json') because exports field may block it
      let _dir = _mainEntry ? require('path').dirname(_mainEntry) : undefined;
      while (_dir && _dir !== require('path').dirname(_dir)) {
        const _pkgPath = require('path').join(_dir, 'package.json');
        if (require('fs').existsSync(_pkgPath)) {
          const _pkg = JSON.parse(require('fs').readFileSync(_pkgPath, 'utf-8'));
          if (_pkg.bin) {
            const _entry = ${binLookupCode};
            serverPath = require('path').join(_dir, _entry);
          }
          break;
        }
        _dir = require('path').dirname(_dir);
      }
    } catch {}`
        // Use full require.resolve path (including bin walking) if available, else fallback to simple main entry
        const args = ls.server.args
        const argsClause = args?.length ? `, args: [${buildArgsExpr(args)}]` : ''
        serverOptionsCode = `{ module: serverPath || _mainEntry || require.resolve('${escapeStr(pkg)}/package.json'), transport: ${transportExpr}${argsClause} }`
      }
    }

    const docSelectorCode = `[${languages.map(l => `{ scheme: 'file', language: '${l}' }`).join(', ')}]`

    const stylesheetScanExts = ['css', 'scss', 'less']
    const hasStylesheetLanguages = languages.some(l => stylesheetScanExts.includes(l))

    const initOptsExpr = ls.initializationOptions || 'undefined'
    const hasPreload = isLocal && hasStylesheetLanguages
    const initOptsCode = hasPreload ? 'initOpts' : initOptsExpr
    const preloadCode = hasPreload ? `
    const initOpts = Object.assign({}, ${initOptsExpr})
    if (!initOpts.stylesheets) initOpts.stylesheets = []
    const exts = '{${stylesheetScanExts.join(',')}}'
    const exclude = '{**/node_modules/**,**/bower_components/**,**/.git/**,**/dist/**,**/build/**,**/.next/**,**/out/**,**/coverage/**}'
    const files = await workspace.findFiles(\`**/*.\${exts}\`, exclude)
    for (const file of files) {
      try {
        const fsPath = file.fsPath || (typeof file === 'string' ? file : '')
        if (!fsPath) continue
        const text = require('fs').readFileSync(fsPath, 'utf-8')
        const languageId = path.extname(fsPath).slice(1)
        initOpts.stylesheets.push({ uri: file.toString(), languageId, text })
      } catch {}
    }
` : ''

    const code = `\
import {
  LanguageClient,
  TransportKind,
  services,
  languages,
  workspace,
  window,
  commands,
  ExtensionContext,
} from 'coc.nvim'
import * as path from 'path'

export async function activate(context: ExtensionContext): Promise<void> {
  try {
    // Normalize LANG: coc.nvim's getLocale() splits by '.' and may return en_US (invalid for Intl.Collator)
    const _rawLang = process.env.LANG || '';
    if (_rawLang.includes('_')) process.env.LANG = _rawLang.replace(/_/g, '-');
${ls.verbose ? `    console.log('[${escapeStr(id)}] activate() called')\n` : ''}${serverPathCode}
    if (!serverPath && !_mainEntry) {
${ls.verbose ? `    console.log('[${escapeStr(id)}] serverPath undefined')\n` : ''}\
      window.showErrorMessage('Cannot find language server.')
      return
    }
${ls.verbose ? `    console.log('[${escapeStr(id)}] creating LanguageClient')\n` : ''}\
${preloadCode}
    const createClient = () => {
      const client = new LanguageClient(
        '${escapeStr(id)}',
        '${escapeStr(description)}',
        ${serverOptionsCode},
        {
          documentSelector: ${docSelectorCode},
          outputChannelName: '${escapeStr(description)}',
          ${ls.syncConfig !== false ? `synchronize: { configurationSection: '${escapeStr(id)}' },` : ''}
          ${hasPreload ? `initializationOptions: initOpts,` : ''}
          ${!hasPreload && ls.initializationOptions ? `initializationOptions: ${ls.initializationOptions},` : ''}
          ${ls.autoParentheses !== false ? `middleware: {
            provideCompletionItem: async (_doc, _pos, _ctx, _token, next) => {
              const result = await next(_doc, _pos, _ctx, _token)
              if (!result) return result
              const patch = (item) => {
                if ((item.kind === 2 || item.kind === 3) && item.insertTextFormat !== 2) {
                  item.insertTextFormat = 2
                  if (item.textEdit) {
                    item.textEdit.newText = (item.textEdit.newText || item.label || '') + '($0)'
                  } else {
                    item.insertText = (typeof item.insertText === 'string' ? item.insertText : item.label ?? '') + '($0)'
                  }
                  item.command = { command: 'editor.action.triggerParameterHints', arguments: [] }
                }
              }
              const items = Array.isArray(result) ? result : (result && result.items) || []
              for (const item of items) patch(item)
              return result
            },
            resolveCompletionItem: async (item, _token, next) => {
              const result = await next(item, _token)
              if (result && (result.kind === 2 || result.kind === 3) && result.insertTextFormat !== 2) {
                result.insertTextFormat = 2
                if (result.textEdit) {
                  result.textEdit.newText = (result.textEdit.newText || result.label || '') + '($0)'
                } else {
                  result.insertText = (typeof result.insertText === 'string' ? result.insertText : result.label ?? '') + '($0)'
                }
                result.command = { command: 'editor.action.triggerParameterHints', arguments: [] }
              }
              return result ?? item
            },
          },` : ''}
        },
      )
      context.subscriptions.push({ dispose: () => client.stop() })
      context.subscriptions.push(services.registerLanguageClient(client))
      return client
    }

${ls.verbose ? `    console.log('[${escapeStr(id)}] registering LanguageClient')\n` : ''}\
    let client: LanguageClient | undefined
    let clients: LanguageClient[]
    if (${multiRoot ? 'workspace.workspaceFolders && workspace.workspaceFolders.length > 1' : 'false'}) {
${ls.verbose ? `      console.log('[${escapeStr(id)}] multiRoot mode')\n` : ''}\
      clients = workspace.workspaceFolders.map(folder => {
        const c = createClient()
        c.start()
        return c
      })
      client = clients[0]
    } else {
      client = createClient()
${ls.verbose ? `      console.log('[${escapeStr(id)}] starting client')\n` : ''}\
      client.start()
      clients = [client]
    }

    // Local server hover fallback: try server hover first, fallback to building from definition
    ${isLocal ? `const hoverLanguages = [${languages.map((l: string) => `'${l}'`).join(', ')}]
    const _client = client
    context.subscriptions.push(
      languages.registerHoverProvider(hoverLanguages, {
        provideHover: async (_doc: any, _pos: any) => {
          const params = {
            textDocument: { uri: _doc.uri.toString() },
            position: { line: _pos.line, character: _pos.character },
          }
          const hov = await _client.sendRequest<any>('textDocument/hover', params).catch(() => null)
          if (hov) return hov
          const defs = await _client.sendRequest<any>('textDocument/definition', params).catch(() => null)
          if (!defs || defs.length === 0) return null
          const loc = defs[0]
          try {
            const fpath = decodeURIComponent((loc.uri || '').replace(/^file:\\/\\/\\/?/, ''))
            const lang = (fpath.match(/\\.(\\w+)$/) || [])[1] || 'text'
            const lines = require('fs').readFileSync(fpath, 'utf-8').split('\\n').slice(loc.range.start.line, loc.range.end.line + 1)
            const indent = lines.reduce((m: number, l: string) => { const s = l.match(/^(\\s*)/); return s ? Math.min(m, s[1].length) : m }, 999)
            const snippet = lines.map((l: string) => l.slice(indent)).join('\\n').trim()
            if (snippet) return { contents: { kind: 'markdown', value: '\`\`\`' + lang + String.fromCharCode(10) + snippet + String.fromCharCode(10) + '\`\`\`' } }
          } catch {}
          return null
        },
      })
    )` : ''}

    context.subscriptions.push(
      commands.registerCommand('${escapeStr(pluginName)}.restart', async () => {
        for (const c of clients) {
          try { await c.stop() } catch {}
        }
        for (const c of clients) {
          try { await c.start() } catch {}
        }
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
      serverBinary: ls.server.kind === 'binary' && ls.server.binary ? {
        repo: ls.server.binary.repo,
        asset: ls.server.binary.asset,
        binaryPath: ls.server.binary.binaryPath,
        args: ls.server.args,
        targetAssets: ls.server.binary.targetAssets,
      } : undefined,
    }
  },
}
