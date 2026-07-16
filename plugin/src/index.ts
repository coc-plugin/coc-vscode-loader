import { commands, workspace, window as cocWindow, ExtensionContext } from 'coc.nvim'
import { createInitialState, StateManager, PackageEntry } from './state'
import { TUI } from './tui'
import { installPackage, uninstallPackage, updatePackage, runConcurrent, checkUpdates, rimraf } from './pipeline'
import { updateRegistry, findPackage } from './registry'
import { whatChanged, saveSnapshot, autoCheck } from './baseline'
import * as path from 'path'
import * as fs from 'fs'
import { CACHE_ROOT } from './paths'

function dirSize(dir: string): number {
  try {
    let size = 0
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) size += dirSize(p)
      else if (entry.isFile()) size += fs.statSync(p).size
    }
    return size
  } catch { return 0 }
}

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

async function ensureRegistry(state: StateManager): Promise<void> {
  if (state.getState().packages.length > 0) return
  try {
    await updateRegistry()
    state.refreshPackages()
  } catch {
    console.warn('[coc-loader] ensureRegistry: failed to fetch registry (offline?)')
  }
}

function resolvePackageName(state: StateManager, query: string): { regName: string; pkg: PackageEntry } | undefined {
  const info = findPackage(query)
  if (!info) return undefined
  const pkg = state.getPackage(info.name)
  if (!pkg) return undefined
  return { regName: info.name, pkg }
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
    const pkgs = state.getState().packages
    if (pkgs.length === 0) {
      cocWindow.showWarningMessage(`[coc-loader] Failed to fetch registry (offline?). Global extensions cannot be installed.`)
    }
    return
  }

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
      toInstall.push(info.name)
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
  const parts: string[] = []
  if (succeeded.length > 0) parts.push(`Installed: ${succeeded.join(', ')}`)
  if (failed.length > 0) {
    const errs = failed.map(n => {
      const p = state.getPackage(n)
      return p?.error ? `${n} (${p.error})` : n
    })
    parts.push(`Failed: ${errs.join(', ')}`)
  }
  if (parts.length > 0) {
    const msg = parts.join('; ') + (succeeded.length > 0 ? '. Restart coc to apply.' : '')
    if (failed.length > 0) {
      cocWindow.showWarningMessage(`[coc-loader] ${msg}`)
    } else {
      cocWindow.showInformationMessage(`[coc-loader] ${msg}`)
    }
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

  function registerPackageCmd(name: string, fn: (regName: string, pkg: PackageEntry) => Promise<void>) {
    context.subscriptions.push(
      commands.registerCommand(`loader.${name}`, async (input?: string) => {
        try {
          await ensureRegistry(state)
          if (!input) {
            const raw: unknown = await workspace.nvim.call('input', ['Plugin name: ', ''])
            if (typeof raw !== 'string' || !raw) return
            input = raw as string
          }
          const resolved = resolvePackageName(state, input)
          if (!resolved) {
            cocWindow.showInformationMessage(`Unknown package: ${input}`)
            return
          }
          await fn(resolved.regName, resolved.pkg)
        } catch (e: unknown) {
          cocWindow.showErrorMessage(`loader.${name}: ${safeMsg(e)}`)
        }
      })
    )
  }

  registerPackageCmd('install', async (regName, pkg) => {
    if (pkg.status === 'installed') {
      cocWindow.showInformationMessage(`${regName} is already installed`)
      return
    }
    cocWindow.showInformationMessage(`Installing ${regName}...`)
    await installPackage(state, regName)
    const after = state.getPackage(regName)
    if (after?.status === 'failed') {
      cocWindow.showErrorMessage(`${regName} install failed: ${after.error || 'unknown error'}`)
    }
  })

  registerPackageCmd('uninstall', async (regName, pkg) => {
    if (pkg.status !== 'installed') {
      cocWindow.showInformationMessage(`${regName} is not installed`)
      return
    }
    const ok = await cocWindow.showPrompt(`Uninstall ${regName}?`)
    if (!ok) return
    cocWindow.showInformationMessage(`Uninstalling ${regName}...`)
    await uninstallPackage(state, regName)
    const after = state.getPackage(regName)
    if (after?.status === 'failed') {
      cocWindow.showErrorMessage(`${regName} uninstall failed: ${after.error || 'unknown error'}`)
    }
  })

  registerPackageCmd('update', async (regName, pkg) => {
    if (pkg.status !== 'installed') {
      cocWindow.showInformationMessage(`${regName} is not installed`)
      return
    }
    cocWindow.showInformationMessage(`Updating ${regName}...`)
    await updatePackage(state, regName)
    const after = state.getPackage(regName)
    if (after?.status === 'failed') {
      cocWindow.showErrorMessage(`${regName} update failed: ${after.error || 'unknown error'}`)
    }
  })

  context.subscriptions.push(
    commands.registerCommand('loader.uninstallAll', async () => {
      try {
        await ensureRegistry(state)
        const installed = state.getState().packages.filter(p => p.status === 'installed')
        if (installed.length === 0) {
          cocWindow.showInformationMessage('No packages installed')
          return
        }
        const ok = await cocWindow.showPrompt(`Uninstall all ${installed.length} packages?`)
        if (ok) {
          await runConcurrent(
            installed.map(p => p.info.name),
            async name => { await uninstallPackage(state, name) },
            state, 3,
          )
        }
      } catch (e: unknown) {
        cocWindow.showErrorMessage(`loader.uninstallAll: ${safeMsg(e)}`)
      }
    })
  )

  registerPackageCmd('reinstall', async (regName, pkg) => {
    if (pkg.status !== 'installed') {
      cocWindow.showInformationMessage(`${regName} is not installed`)
      return
    }
    await uninstallPackage(state, regName)
    await installPackage(state, regName)
  })

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
    commands.registerCommand('loader.cleanCache', async () => {
      try {
        const dirs = fs.readdirSync(CACHE_ROOT).filter(n => {
          const p = path.join(CACHE_ROOT, n)
          return fs.statSync(p).isDirectory() && !n.startsWith('.')
        })
        if (dirs.length === 0) {
          cocWindow.showInformationMessage('No cached packages to clean')
          return
        }
        let totalSize = 0
        for (const name of dirs) {
          totalSize += dirSize(path.join(CACHE_ROOT, name))
        }
        const sizeStr = totalSize > 1024 * 1024
          ? `${(totalSize / 1024 / 1024).toFixed(1)}MB`
          : `${(totalSize / 1024).toFixed(0)}KB`
        const ok = await cocWindow.showPrompt(`Clean cache (${dirs.length} pkg, ${sizeStr})?`)
        if (!ok) return
        for (const name of dirs) {
          await rimraf(path.join(CACHE_ROOT, name))
        }
        cocWindow.showInformationMessage(
          `Cleaned ${dirs.length} package(s) (${sizeStr}) — extensions/node_modules not affected`,
        )
      } catch (e: unknown) {
        cocWindow.showErrorMessage(`loader.cleanCache: ${safeMsg(e)}`)
      }
    })
  )

  context.subscriptions.push(
    commands.registerCommand('loader.list', async () => {
      try {
        await ensureRegistry(state)
        const installed = state.getState().packages.filter(p => p.status === 'installed')
        if (installed.length === 0) {
          cocWindow.showInformationMessage('No packages installed')
          return
        }
        const shortNames = installed.map(p => p.info.name.replace(/^vscode-/, '')).sort()
        const escaped = shortNames.map(n => n.replace(/'/g, "'\"'\"'"))
        const viml = `['${escaped.join("', '")}']`
        const lua = `{ '${escaped.join("', '")}' }`
        await workspace.nvim.call('setreg', ['+', lua])
        cocWindow.showInformationMessage(
          `Installed (${shortNames.length}) — Lua: ${lua}  VimL: ${viml} (Lua copied to clipboard)`,
        )
      } catch (e: unknown) {
        cocWindow.showErrorMessage(`loader.list: ${safeMsg(e)}`)
      }
    })
  )

  context.subscriptions.push(
    commands.registerCommand('loader.whatChanged', async () => {
      try {
        await ensureRegistry(state)
        const result = whatChanged()
        if (!result.changed.length && result.oldVersion === '(none)') {
          cocWindow.showInformationMessage(`[coc-loader] Baseline snapshot saved (v${result.newVersion}). Run again after next upgrade to see changes.`)
          return
        }
        const installedNames = new Set(
          state.getState().packages.filter(p => p.status === 'installed').map(p => p.info.name)
        )
        const relevant = result.changed.filter(e => installedNames.has(e.name))
        if (relevant.length === 0) {
          cocWindow.showInformationMessage(`[coc-loader] No changes detected for your installed plugins (v${result.oldVersion} → v${result.newVersion})`)
          return
        }
        const lines: string[] = [`[coc-loader] Cross-version impact (v${result.oldVersion} → v${result.newVersion}):`]
        for (const entry of relevant) {
          if (entry.status === 'new') {
            lines.push(`${entry.name}  + new (${entry.totalFiles} files)`)
          } else {
            const fileList = entry.files.map(f => f.file).join(', ')
            lines.push(`${entry.name}  ~ ${entry.files.length}/${entry.totalFiles} files changed: ${fileList}`)
          }
          lines.push(`  ⚠ Reinstall recommended`)
        }
        cocWindow.showInformationMessage(lines.join('\n'))
      } catch (e: unknown) {
        cocWindow.showErrorMessage(`loader.whatChanged: ${safeMsg(e)}`)
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

  // Silent update check on startup — only notify if updates found, timeout after 30s
  Promise.race([
    checkUpdates(state, true),
    new Promise<number>(r => setTimeout(() => r(0), 30_000)),
  ]).then(count => {
    if (count > 0) {
      cocWindow.showInformationMessage(`[coc-loader] ${count} package(s) have updates. Open TUI and press U to update.`)
    }
  }).catch(() => {})

  // Auto-detect cross-version changes on startup (silent, only notifies if plugins are affected)
  Promise.resolve().then(() => {
    const affected = autoCheck()
    if (affected.length > 0) {
      const installedNames = new Set(
        state.getState().packages.filter(p => p.status === 'installed').map(p => p.info.name)
      )
      const relevant = affected.filter(e => installedNames.has(e.name))
      if (relevant.length > 0) {
        const names = relevant.map(e => e.name.replace(/^vscode-/, '')).join(', ')
        state.mutate(s => {
          for (const p of s.packages) {
            p.hasChanged = relevant.some(e => e.name === p.info.name)
          }
        })
        cocWindow.showInformationMessage(
          `[coc-loader] ${relevant.length} plugin(s) changed since upgrade: ${names}. Run :CocCommand loader.reinstall to apply.`
        )
      }
    }
  }).catch(() => {})

  const hasInstalled = state.getState().packages.some(p => p.status === 'installed')
  if (!hasInstalled) {
    cocWindow.showInformationMessage('coc-loader activated! Use :CocCommand loader.open')
  }
}

async function checkLoaderVersion(): Promise<string | null> {
  try {
    const res = await fetch('https://registry.npmjs.org/coc-vscode-loader/latest')
    if (!res.ok) return null
    const data = await res.json() as { version: string }
    const current = pluginVersion()
    if (data.version !== current) return data.version
  } catch {}
  return null
}

export async function deactivate(): Promise<void> {
  await closeCurrentTUI()
}
