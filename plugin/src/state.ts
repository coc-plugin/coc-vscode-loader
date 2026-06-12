import { getAllPackages, PackageInfo } from './registry'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

function isInstalled(name: string): boolean {
  return fs.existsSync(path.join(os.homedir(), '.config', 'coc', 'extensions', 'node_modules', `coc-${name}`))
}

export type Status = 'not-installed' | 'installing' | 'installed' | 'updating' | 'uninstalling' | 'failed'

export interface PackageEntry {
  info: PackageInfo
  status: Status
  commit?: string
  commitMsg?: string
  commitDate?: string
  updated?: boolean
  hasUpdate?: boolean
  progress?: string
  progressLog: string[]
  expanded: boolean
  logExpanded: boolean
  error?: string
}

export type ViewFilter = 'all' | 'installed' | 'not-installed'
export type SortBy = 'default' | 'name' | 'status' | 'type'

export interface AppState {
  packages: PackageEntry[]
  searchQuery: string
  showHelp: boolean
  activePill: string | null
  dirty: boolean
  statusMessage?: string
  viewFilter: ViewFilter
  sortBy: SortBy
}

type Listener = (state: AppState) => void

export function createInitialState(): AppState {
  const packages = getAllPackages().map(info => {
    const installed = isInstalled(info.name)
    let commit: string | undefined
    let commitMsg: string | undefined
    let commitDate: string | undefined
    if (installed) {
      try {
        const meta = JSON.parse(
          fs.readFileSync(path.join(os.homedir(), '.config', 'coc', 'converter-cache', info.name, 'meta.json'), 'utf-8')
        )
        commit = meta.commit || undefined
        commitMsg = meta.msg || undefined
        commitDate = meta.date || undefined
      } catch { /* non-critical: commit info */ }
    }
    return {
      info,
      status: (installed ? 'installed' : 'not-installed') as Status,
      commit,
      commitMsg,
      commitDate,
      progressLog: [],
      expanded: false,
      logExpanded: false,
    }
  })
  return { packages, searchQuery: '', showHelp: false, activePill: null, dirty: false, viewFilter: 'all', sortBy: 'default' }
}

export class StateManager {
  private state: AppState
  private listeners: Set<Listener> = new Set()
  private scheduled = false

  constructor(initial: AppState) {
    this.state = initial
  }

  getState(): AppState {
    return this.state
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  mutate(fn: (state: AppState) => void) {
    fn(this.state)
    this.notify()
  }

  private notify() {
    if (this.scheduled) return
    this.scheduled = true
    const state = this.state
    process.nextTick(() => {
      this.scheduled = false
      for (const fn of this.listeners) {
        fn(state)
      }
    })
  }

  setPackageStatus(name: string, status: Status, extra?: { progress?: string; error?: string; appendLog?: boolean; logEntry?: string }) {
    this.mutate(s => {
      const pkg = s.packages.find(p => p.info.name === name)
      if (pkg) {
        if (status === 'installing' || status === 'updating' || status === 'uninstalling') {
          pkg.progressLog = []
        }
        pkg.status = status
        if (extra?.progress !== undefined) pkg.progress = extra.progress
        if (extra?.logEntry !== undefined) pkg.progressLog.push(extra.logEntry)
        if (extra?.appendLog && extra?.progress !== undefined) pkg.progressLog.push(extra.progress)
        if (extra?.error !== undefined) pkg.error = extra.error
        if (status === 'installed' || status === 'not-installed') {
          pkg.progress = undefined
        }
      }
    })
  }

  toggleExpand(name: string) {
    this.mutate(s => {
      const pkg = s.packages.find(p => p.info.name === name)
      if (pkg) pkg.expanded = !pkg.expanded
    })
  }

  toggleLog(name: string) {
    this.mutate(s => {
      const pkg = s.packages.find(p => p.info.name === name)
      if (pkg) pkg.logExpanded = !pkg.logExpanded
    })
  }

  toggleHelp() {
    this.mutate(s => { s.showHelp = !s.showHelp })
  }

  setViewFilter(filter: ViewFilter) {
    this.mutate(s => { s.viewFilter = filter })
  }

  cycleViewFilter() {
    this.mutate(s => {
      s.viewFilter = s.viewFilter === 'all' ? 'installed' : s.viewFilter === 'installed' ? 'not-installed' : 'all'
    })
  }

  setSortBy(sortBy: SortBy) {
    this.mutate(s => { s.sortBy = sortBy })
  }

  cycleSortBy() {
    this.mutate(s => {
      s.sortBy = s.sortBy === 'default' ? 'name' : s.sortBy === 'name' ? 'status' : s.sortBy === 'status' ? 'type' : 'default'
    })
  }

  setStatusMessage(msg?: string) {
    this.mutate(s => { s.statusMessage = msg })
  }

  setDirty() {
    this.mutate(s => { s.dirty = true })
  }

  setActivePill(pill: string | null) {
    this.mutate(s => { s.activePill = pill })
  }

  setSearchQuery(query: string) {
    this.mutate(s => { s.searchQuery = query })
  }

  getFilteredPackages(): PackageEntry[] {
    let pkgs = this.state.packages
    if (this.state.viewFilter === 'not-installed') {
      pkgs = pkgs.filter(p => p.status === 'not-installed')
    } else if (this.state.viewFilter === 'installed') {
      pkgs = pkgs.filter(p => p.status === 'installed')
    }
    const q = this.state.searchQuery.toLowerCase()
    if (q) {
      pkgs = pkgs.filter(p =>
        p.info.name.toLowerCase().includes(q) ||
        p.info.displayName.toLowerCase().includes(q) ||
        p.info.description.toLowerCase().includes(q)
      )
    }
    const sortBy = this.state.sortBy
    if (sortBy === 'name') {
      pkgs = [...pkgs].sort((a, b) => a.info.name.localeCompare(b.info.name))
    } else if (sortBy === 'status') {
      const order: Record<string, number> = { installed: 0, installing: 1, updating: 2, uninstalling: 3, failed: 4, 'not-installed': 5 }
      pkgs = [...pkgs].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9))
    } else if (sortBy === 'type') {
      pkgs = [...pkgs].sort((a, b) => a.info.type.localeCompare(b.info.type))
    }
    return pkgs
  }

  getPackage(name: string): PackageEntry | undefined {
    return this.state.packages.find(p => p.info.name === name)
  }

  refreshPackages() {
    this.mutate(s => {
      const updated = getAllPackages()
      const oldMap = new Map(s.packages.map(p => [p.info.name, p]))
      s.packages = updated.map(info => {
        const old = oldMap.get(info.name)
        if (old) {
          old.info = info
          return old
        }
        return {
          info,
          status: isInstalled(info.name) ? 'installed' : 'not-installed',
          progressLog: [],
          expanded: false,
          logExpanded: false,
        }
      })
    })
  }
}
