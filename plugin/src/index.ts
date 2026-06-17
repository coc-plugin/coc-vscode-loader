import { commands, workspace, window as cocWindow, ExtensionContext } from 'coc.nvim'
import { createInitialState, StateManager } from './state'
import { TUI } from './tui'
import { installPackage, uninstallPackage, updatePackage, runConcurrent } from './pipeline'
import { updateRegistry, findPackage } from './registry'

let currentTUI: TUI | null = null
let openingTUI = false

function safeMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

async function closeCurrentTUI(): Promise<void> {
  if (currentTUI) {
    try { await currentTUI.close() } catch { /* ignore close errors */ }
    currentTUI = null
  }
}

async function ensureGlobalExtensions(state: StateManager): Promise<void> {
  const nvim = workspace.nvim
  let globalExt: unknown
  try {
    globalExt = await nvim.getVar('coc_loader_global_extensions')
  } catch {
    return
  }
  if (!Array.isArray(globalExt) || globalExt.length === 0) return
  const names = globalExt.filter((n): n is string => typeof n === 'string')
  if (names.length === 0) return

  try {
    await updateRegistry()
    state.refreshPackages()
  } catch {
    return
  }

  const regNameByQuery = new Map<string, string>()
  const toInstall: string[] = []
  const unknown: string[] = []
  const alreadyInstalled: string[] = []
  for (const query of names) {
    const info = findPackage(query)
    if (!info) {
      unknown.push(query)
      continue
    }
    const pkg = state.getPackage(info.name)
    if (!pkg) {
      unknown.push(query)
      continue
    }
    if (pkg.status === 'installed') {
      alreadyInstalled.push(query)
    } else {
      const regName = info.name
      regNameByQuery.set(query, regName)
      toInstall.push(regName)
    }
  }

  if (unknown.length > 0) {
    cocWindow.showWarningMessage(`[coc-loader] Unknown global extensions: ${unknown.join(', ')}`)
  }

  if (toInstall.length === 0) {
    if (alreadyInstalled.length === names.length) {
      cocWindow.showInformationMessage('[coc-loader] All global extensions are already installed')
    }
    return
  }

  cocWindow.showInformationMessage(`[coc-loader] Installing ${toInstall.length}/${names.length} global extension(s)...`)
  const failed: string[] = []
  await runConcurrent(toInstall, async (regName) => {
    await installPackage(state, regName)
    const pkg = state.getPackage(regName)
    if (pkg && pkg.status !== 'installed') {
      failed.push(regName)
    }
  }, state, 3)

  const succeeded = toInstall.filter(n => !failed.includes(n))
  if (failed.length > 0) {
    cocWindow.showErrorMessage(`[coc-loader] Failed: ${failed.join(', ')}`)
  }
  if (succeeded.length > 0) {
    cocWindow.showInformationMessage(`[coc-loader] Installed: ${succeeded.join(', ')}. Restart coc to apply.`)
  }
}

export async function activate(context: ExtensionContext) {
  const state = new StateManager(createInitialState())

  context.subscriptions.push(
    commands.registerCommand('loader.open', async () => {
      if (openingTUI) return
      openingTUI = true
      try {
        await closeCurrentTUI()
        const tui = new TUI(state)
        await tui.open()
        currentTUI = tui
      } catch (e: unknown) {
        cocWindow.showErrorMessage(`loader.open: ${safeMsg(e)}`)
        currentTUI = null
      } finally {
        openingTUI = false
      }
    })
  )

  context.subscriptions.push(
    commands.registerCommand('loader.install', async (name?: string) => {
      try {
        if (!name) {
          const raw: unknown = await workspace.nvim.call('input', ['Plugin name: ', ''])
          if (typeof raw !== 'string' || !raw) return
          name = raw as string
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
      } catch (e: unknown) {
        cocWindow.showErrorMessage(`loader.install: ${safeMsg(e)}`)
      }
    })
  )

  context.subscriptions.push(
    commands.registerCommand('loader.uninstall', async (name?: string) => {
      try {
        if (!name) {
          const raw: unknown = await workspace.nvim.call('input', ['Plugin name: ', ''])
          if (typeof raw !== 'string' || !raw) return
          name = raw as string
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
      } catch (e: unknown) {
        cocWindow.showErrorMessage(`loader.uninstall: ${safeMsg(e)}`)
      }
    })
  )

  context.subscriptions.push(
    commands.registerCommand('loader.update', async (name?: string) => {
      try {
        if (!name) {
          const raw: unknown = await workspace.nvim.call('input', ['Plugin name: ', ''])
          if (typeof raw !== 'string' || !raw) return
          name = raw as string
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
      } catch (e: unknown) {
        cocWindow.showErrorMessage(`loader.update: ${safeMsg(e)}`)
      }
    })
  )

  context.subscriptions.push(
    commands.registerCommand('loader.uninstallAll', async () => {
      try {
        const installed = state.getState().packages.filter(p => p.status === 'installed')
        if (installed.length === 0) {
          cocWindow.showInformationMessage('No packages installed')
          return
        }
        const ok = await cocWindow.showPrompt(`Uninstall all ${installed.length} packages?`)
        if (ok) {
          for (const pkg of installed) {
            try { await uninstallPackage(state, pkg.info.name) } catch { /* skip */ }
          }
        }
      } catch (e: unknown) {
        cocWindow.showErrorMessage(`loader.uninstallAll: ${safeMsg(e)}`)
      }
    })
  )

  context.subscriptions.push(
    commands.registerCommand('loader.reinstall', async (name?: string) => {
      try {
        if (!name) {
          const raw: unknown = await workspace.nvim.call('input', ['Plugin name: ', ''])
          if (typeof raw !== 'string' || !raw) return
          name = raw as string
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
      } catch (e: unknown) {
        cocWindow.showErrorMessage(`loader.reinstall: ${safeMsg(e)}`)
      }
    })
  )

  context.subscriptions.push(
    commands.registerCommand('loader.updateRegistry', async () => {
      try {
        const count = await updateRegistry()
        cocWindow.showInformationMessage(`Registry updated: ${count} packages available. Restart coc to apply.`)
      } catch (e: unknown) {
        cocWindow.showErrorMessage(`Registry update failed: ${safeMsg(e)}`)
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

  // Auto-install global extensions from vim.g.coc_loader_global_extensions
  ensureGlobalExtensions(state).catch(() => {})

  cocWindow.showInformationMessage('coc-loader activated! Use :CocCommand loader.open')
}

export async function deactivate(): Promise<void> {
  await closeCurrentTUI()
}
