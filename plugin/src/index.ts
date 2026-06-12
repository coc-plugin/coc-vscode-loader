import { commands, workspace, window as cocWindow, ExtensionContext } from 'coc.nvim'
import { createInitialState, StateManager } from './state'
import { TUI } from './tui'
import { installPackage, uninstallPackage, updatePackage } from './pipeline'
import { updateRegistry } from './registry'

let currentTUI: TUI | null = null

export async function activate(context: ExtensionContext) {
  const state = new StateManager(createInitialState())

  context.subscriptions.push(
    commands.registerCommand('loader.open', async () => {
      if (currentTUI && currentTUI.isOpen()) {
        await currentTUI.close()
      }
      currentTUI = new TUI(state)
      await currentTUI.open()
    })
  )

  context.subscriptions.push(
    commands.registerCommand('loader.install', async (name?: string) => {
      if (!name) {
        name = await workspace.nvim.call('input', ['Plugin name: ', '']) as string
        if (!name) return
      }
      const pkg = state.getPackage(name)
      if (!pkg) {
        cocWindow.showInformationMessage(`Unknown package: ${name}`)
        return
      }
      if (pkg.status === 'installed') {
        cocWindow.showInformationMessage(`${name} is already installed`)
        return
      }
      await installPackage(state, name)
    })
  )

  context.subscriptions.push(
    commands.registerCommand('loader.uninstall', async (name?: string) => {
      if (!name) {
        name = await workspace.nvim.call('input', ['Plugin name: ', '']) as string
        if (!name) return
      }
      const pkg = state.getPackage(name)
      if (!pkg) {
        cocWindow.showInformationMessage(`Unknown package: ${name}`)
        return
      }
      if (pkg.status !== 'installed') {
        cocWindow.showInformationMessage(`${name} is not installed`)
        return
      }
      uninstallPackage(state, name)
    })
  )

  context.subscriptions.push(
    commands.registerCommand('loader.update', async (name?: string) => {
      if (!name) {
        name = await workspace.nvim.call('input', ['Plugin name: ', '']) as string
        if (!name) return
      }
      const pkg = state.getPackage(name)
      if (!pkg) {
        cocWindow.showInformationMessage(`Unknown package: ${name}`)
        return
      }
      if (pkg.status !== 'installed') {
        cocWindow.showInformationMessage(`${name} is not installed`)
        return
      }
      await updatePackage(state, name)
    })
  )

  context.subscriptions.push(
    commands.registerCommand('loader.uninstallAll', async () => {
      const installed = state.getState().packages.filter(p => p.status === 'installed')
      if (installed.length === 0) {
        cocWindow.showInformationMessage('No packages installed')
        return
      }
      const ok = await cocWindow.showPrompt(`Uninstall all ${installed.length} packages?`)
      if (ok) {
        for (const pkg of installed) {
          uninstallPackage(state, pkg.info.name)
        }
      }
    })
  )

  context.subscriptions.push(
    commands.registerCommand('loader.reinstall', async (name?: string) => {
      if (!name) {
        name = await workspace.nvim.call('input', ['Plugin name: ', '']) as string
        if (!name) return
      }
      const pkg = state.getPackage(name)
      if (!pkg) {
        cocWindow.showInformationMessage(`Unknown package: ${name}`)
        return
      }
      if (pkg.status !== 'installed') {
        cocWindow.showInformationMessage(`${name} is not installed`)
        return
      }
      await uninstallPackage(state, name)
      await installPackage(state, name)
    })
  )

  context.subscriptions.push(
    commands.registerCommand('loader.updateRegistry', async () => {
      try {
        const count = await updateRegistry()
        cocWindow.showInformationMessage(`Registry updated: ${count} packages available. Restart coc to apply.`)
      } catch (e: any) {
        cocWindow.showErrorMessage(`Registry update failed: ${e.message}`)
      }
    })
  )

  context.subscriptions.push(
    commands.registerCommand('loader._dispatch', async (key: string) => {
      if (currentTUI) {
        await currentTUI.handleKey(key)
      }
    })
  )

  // Registry fetch happens when TUI opens, not on startup

  cocWindow.showInformationMessage('coc-loader activated! Use :CocCommand loader.open')
}
