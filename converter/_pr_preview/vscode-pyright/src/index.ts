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
    // Workaround: ansible LSP spawns Python subprocesses that need valid locale
    if (!process.env.LC_ALL) process.env.LC_ALL = 'C.UTF-8';
    let serverPath: string | undefined
    let _mainEntry: string | undefined
    try {
      _mainEntry = require.resolve('pyright')
    } catch {}
    if (!_mainEntry) {
      try { _mainEntry = require.resolve('pyright/package.json') } catch {}
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
            const _entry = (typeof _pkg.bin === 'string' ? _pkg.bin : (_pkg.bin && _pkg.bin['pyright-langserver'] ? _pkg.bin['pyright-langserver'] : Object.values(_pkg.bin)[0]));
            serverPath = require('path').join(_dir, _entry);
          }
          break;
        }
        _dir = require('path').dirname(_dir);
      }
    } catch {}
    if (!serverPath && !_mainEntry) {
      window.showErrorMessage('Cannot find language server.')
      return
    }

    const createClient = () => {
      const client = new LanguageClient(
        'pyright',
        'VS Code static type checking for Python',
        { module: serverPath || _mainEntry || require.resolve('pyright/package.json'), transport: TransportKind.ipc },
        {
          documentSelector: [{ scheme: 'file', language: 'python' }],
          outputChannelName: 'VS Code static type checking for Python',
          synchronize: { configurationSection: 'pyright' },
          
          
          middleware: {
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
          },
        },
      )
      context.subscriptions.push({ dispose: () => client.stop() })
      context.subscriptions.push(services.registerLanguageClient(client))
      return client
    }

    let client: LanguageClient | undefined
    let clients: LanguageClient[]
    if (false) {
      clients = workspace.workspaceFolders.map(folder => {
        const c = createClient()
        c.start()
        return c
      })
      client = clients[0]
    } else {
      client = createClient()
      client.start()
      clients = [client]
    }

    // Local server hover fallback: try server hover first, fallback to building from definition
    

    context.subscriptions.push(
      commands.registerCommand('vscode-pyright.restart', async () => {
        for (const c of clients) {
          try { await c.stop() } catch {}
        }
        for (const c of clients) {
          try { await c.start() } catch {}
        }
      }),
    )

  } catch (e: any) {
    window.showErrorMessage('vscode-pyright error: ' + (e.message || String(e)))
  }
}
