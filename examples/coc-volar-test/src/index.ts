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
    // 1. 确保 coc-tsserver 已激活（加载 @vue/typescript-plugin）
    const tsExt = extensions.all.find(e => e.id === 'coc-tsserver')
    if (tsExt && !tsExt.isActive) {
      await tsExt.activate()
    }
    const tsSvc = cocServices.getService('tsserver')
    if (tsSvc) {
      await tsSvc.start()
    }

    // 2. 找到 @vue/language-server
    const config = workspace.getConfiguration('vue')
    let serverModule = config.get<string>('server.path', '')
    if (serverModule) {
      serverModule = path.isAbsolute(serverModule) ? serverModule : path.join(workspace.root, serverModule)
    }
    if (!serverModule || !fs.existsSync(serverModule)) {
      try { serverModule = require.resolve('@vue/language-server/index.js') }
      catch { try { serverModule = require.resolve('@vue/language-server/bin/vue-language-server.js') } catch {} }
    }
    if (!serverModule) { window.showErrorMessage('Cannot find @vue/language-server.'); return }

    // 3. 启动 Vue LSP
    const client = new LanguageClient(
      'vue',
      'Vue Language Server',
      {
        module: serverModule,
        transport: TransportKind.ipc,
      },
      {
        documentSelector: [{ language: 'vue', scheme: 'file' }],
        outputChannelName: 'Vue Language Server',
        revealOutputChannelOn: RevealOutputChannelOn.Never,
        progressOnInitialization: true,
      },
    )
    context.subscriptions.push({ dispose: () => client.stop() })
    context.subscriptions.push(cocServices.registerLanguageClient(client))
    client.start()

    // 4. tsserver 桥接
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

    // 5. 命令
    context.subscriptions.push(
      commands.registerCommand('vue.action.restartServer', async () => {
        await client.stop()
        client.start()
      }),
    )
  } catch (e: any) {
    window.showErrorMessage('Vue error: ' + (e.message || String(e)))
  }
}
