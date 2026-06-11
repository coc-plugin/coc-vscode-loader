import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
  workspace,
  window,
  commands,
  extensions,
  services as cocServices,
  ExtensionContext,
} from 'coc.nvim'
import * as path from 'path'
import * as fs from 'fs'

let logStream: fs.WriteStream | null = null

function log(msg: string) {
  if (!logStream) return
  const ts = new Date().toISOString().slice(11, 23)
  logStream.write(`[vue] [${ts}] ${msg}\n`)
}

export async function activate(context: ExtensionContext): Promise<void> {
  try {
    const config = workspace.getConfiguration('vue')
    const lf = config.get<string>('server.logFile', '')
    if (lf) {
      logStream = fs.createWriteStream(
        path.isAbsolute(lf) ? lf : path.join(workspace.root, lf),
        { flags: 'a' },
      )
    }
    log('=== activate ===')

    // 1. 确保 coc-tsserver 已激活（它会加载 @vue/typescript-plugin）
    const tsExt = extensions.getExtensionById('coc-tsserver')
    if (tsExt && !tsExt.isActive) {
      await tsExt.activate()
      log('coc-tsserver activated')
    }
    const tsSvc = cocServices.getService('tsserver')
    if (tsSvc) {
      await tsSvc.start()
      log('tsserver service started')
    }

    // 2. 找到 @vue/language-server
    let serverModule = config.get<string>('server.path', '')
    if (serverModule) {
      serverModule = path.isAbsolute(serverModule) ? serverModule : path.join(workspace.root, serverModule)
    }
    if (!serverModule || !fs.existsSync(serverModule)) {
      try { serverModule = require.resolve('@vue/language-server/index.js') }
      catch { try { serverModule = require.resolve('@vue/language-server/bin/vue-language-server.js') } catch {} }
    }
    if (!serverModule) { window.showErrorMessage('Cannot find @vue/language-server.'); return }
    log('server: ' + path.basename(path.dirname(serverModule)))

    // 3. 启动 Vue 语言服务器
    const client = new LanguageClient('vue', 'Vue Language Server', {
      module: serverModule,
      transport: TransportKind.ipc,
    }, {
      documentSelector: ['vue'],
      outputChannelName: 'Vue Language Server',
    })
    context.subscriptions.push(client)
    context.subscriptions.push(cocServices.registerLanguageClient(client))
    client.start()
    log('Vue LanguageClient started')

    // 4. tsserver 桥接 — 通过 coc-tsserver 的 typescript.tsserverRequest 命令转发
    client.onNotification('tsserver/request', async ([seq, command, args]: [number, string, any]) => {
      log('→ tsserver req #' + seq + ': ' + command)
      try {
        const result = await commands.executeCommand<any>(
          'typescript.tsserverRequest', command, args,
          { isAsync: true, lowPriority: true },
        )
        log('← tsserver res #' + seq + ': ' + (result?.body ? 'ok' : 'empty'))
        client.sendNotification('tsserver/response', [seq, result?.body])
      } catch (e: any) {
        log('✗ tsserver req #' + seq + ' error: ' + e.message)
        client.sendNotification('tsserver/response', [seq, undefined])
      }
    })

    // 5. 重启命令
    context.subscriptions.push(
      commands.registerCommand('vue.action.restartServer', async () => {
        log('restart')
        await client.stop()
        client.start()
      }),
    )
    log('=== activation complete ===')
  } catch (e: any) {
    log('ERROR: ' + (e.message || String(e)))
    window.showErrorMessage('Vue error: ' + (e.message || String(e)))
  }
}
