import { getAllPackages, PackageInfo } from './registry'

export type Status = 'not-installed' | 'installing' | 'installed' | 'updating' | 'uninstalling' | 'failed'

export interface PackageEntry {
  info: PackageInfo
  status: Status
  progress?: string
  progressLog: string[]
  expanded: boolean
  logExpanded: boolean
  error?: string
}

export interface AppState {
  packages: PackageEntry[]
  searchQuery: string
  showHelp: boolean
}

type Listener = (state: AppState) => void

export function createInitialState(): AppState {
  const packages = getAllPackages().map(info => ({
    info,
    status: 'not-installed' as Status,
    progressLog: [],
    expanded: false,
    logExpanded: false,
  }))
  return { packages, searchQuery: '', showHelp: false }
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

  setSearchQuery(query: string) {
    this.mutate(s => { s.searchQuery = query })
  }

  getFilteredPackages(): PackageEntry[] {
    const q = this.state.searchQuery.toLowerCase()
    if (!q) return this.state.packages
    return this.state.packages.filter(p =>
      p.info.name.toLowerCase().includes(q) ||
      p.info.displayName.toLowerCase().includes(q) ||
      p.info.description.toLowerCase().includes(q)
    )
  }

  getPackage(name: string): PackageEntry | undefined {
    return this.state.packages.find(p => p.info.name === name)
  }
}
