import { getAllPackages, PackageInfo } from './registry'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

const EXT_DIR = path.join(os.homedir(), '.config', 'coc', 'extensions', 'node_modules')

function getInstalledSet(): Set<string> {
  try {
    const entries = fs.readdirSync(EXT_DIR)
    return new Set(entries.filter(n => n.startsWith('coc-')).map(n => n.slice(4)))
  } catch {
    return new Set()
  }
}

export type Status = 'not-installed' | 'installing' | 'installed' | 'updating' | 'uninstalling' | 'failed'
const BUSY_STATUSES: ReadonlySet<Status> = new Set(['installing', 'updating', 'uninstalling'])

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
  marked: boolean
  error?: string
}

export type ViewFilter = 'all' | 'installed' | 'not-installed'
export type SortBy = 'default' | 'name' | 'status' | 'type'

export interface BatchStats {
  total: number
  completed: number
  failed: number
}

export interface AppState {
  packages: PackageEntry[]
  searchQuery: string
  showHelp: boolean
  activePill: string | null
  dirty: boolean
  statusMessage?: string
  viewFilter: ViewFilter
  sortBy: SortBy
  scrollOffset: number
  categoryFilter: string | null
  languageFilter: string | null
  queuedNames: string[]
  batchStats: BatchStats | null
}

type Listener = (state: AppState) => void

export function createInitialState(): AppState {
  const installedSet = getInstalledSet()
  const packages = getAllPackages().map(info => {
    const installed = installedSet.has(info.name)
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
      marked: false,
    }
  })
  return { packages, searchQuery: '', showHelp: false, activePill: null, dirty: false, viewFilter: 'all', sortBy: 'default', scrollOffset: 0, categoryFilter: null, languageFilter: null, queuedNames: [], batchStats: null }
}

export class StateManager {
  private state: AppState
  private listeners: Set<Listener> = new Set()
  private scheduled = false
  private cachedFiltered: PackageEntry[] | null = null
  private cachedFilterKey: string = ''

  constructor(initial: AppState) {
    this.state = initial
  }

  getState(): AppState {
    return this.state
  }

  private filterKey(): string {
    return `${this.state.viewFilter}|${this.state.searchQuery}|${this.state.sortBy}|${this.state.categoryFilter || ''}|${this.state.languageFilter || ''}`
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

  private invalidateFilterCache() {
    this.cachedFilterKey = ''
  }

  setPackageStatus(name: string, status: Status, extra?: { progress?: string; error?: string; logEntry?: string }) {
    this.invalidateFilterCache()
    this.mutate(s => {
      const pkg = s.packages.find(p => p.info.name === name)
      if (pkg) {
        if ((status === 'installing' || status === 'updating' || status === 'uninstalling') && pkg.status !== status) {
          pkg.progressLog = []
        }
        pkg.status = status
        if (extra?.progress !== undefined) pkg.progress = extra.progress
        if (extra?.logEntry !== undefined) {
          pkg.progressLog.push(extra.logEntry)
          if (pkg.progressLog.length > 500) pkg.progressLog.splice(0, pkg.progressLog.length - 500)
        } else if (extra?.progress !== undefined) {
          pkg.progressLog.push(extra.progress)
          if (pkg.progressLog.length > 500) pkg.progressLog.splice(0, pkg.progressLog.length - 500)
        }
        if (extra?.error !== undefined) pkg.error = extra.error
        if (status === 'installed' || status === 'not-installed') {
          pkg.progress = undefined
          pkg.progressLog = []
          pkg.error = undefined
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
    this.mutate(s => { s.viewFilter = filter; s.scrollOffset = 0 })
  }

  cycleViewFilter() {
    this.mutate(s => {
      s.viewFilter = s.viewFilter === 'all' ? 'installed' : s.viewFilter === 'installed' ? 'not-installed' : 'all'
      s.scrollOffset = 0
    })
  }

  setSortBy(sortBy: SortBy) {
    this.mutate(s => { s.sortBy = sortBy; s.scrollOffset = 0 })
  }

  cycleSortBy() {
    this.mutate(s => {
      s.sortBy = s.sortBy === 'default' ? 'name' : s.sortBy === 'name' ? 'status' : s.sortBy === 'status' ? 'type' : 'default'
      s.scrollOffset = 0
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
    this.mutate(s => { s.searchQuery = query; s.scrollOffset = 0 })
  }

  setScrollOffset(n: number) {
    this.mutate(s => { s.scrollOffset = n })
  }

  setCategoryFilter(cat: string | null) {
    this.invalidateFilterCache()
    this.mutate(s => { s.categoryFilter = cat; s.scrollOffset = 0 })
  }

  setLanguageFilter(lang: string | null) {
    this.invalidateFilterCache()
    this.mutate(s => { s.languageFilter = lang; s.scrollOffset = 0 })
  }

  getLanguages(): string[] {
    const langs = new Set<string>()
    for (const p of this.state.packages) {
      for (const l of p.info.languages) langs.add(l)
    }
    return [...langs].sort()
  }

  setQueued(names: string[]) {
    this.mutate(s => { s.queuedNames = names })
  }

  removeQueued(name: string) {
    this.mutate(s => { s.queuedNames = s.queuedNames.filter(n => n !== name) })
  }

  getCategories(): string[] {
    const cats = new Set<string>()
    for (const p of this.state.packages) {
      for (const c of p.info.categories) cats.add(c)
    }
    return [...cats].sort()
  }

  cycleCategory(next: boolean) {
    const cats = this.getCategories()
    if (cats.length === 0) return
    const current = this.state.categoryFilter
    const idx = current ? cats.indexOf(current) : -1
    let newIdx: number
    if (next) {
      newIdx = idx >= cats.length - 1 ? -1 : idx + 1
    } else {
      newIdx = idx <= -1 ? cats.length - 1 : idx - 1
    }
    this.setCategoryFilter(newIdx === -1 ? null : cats[newIdx])
  }

  setBatchStats(stats: BatchStats | null) {
    this.mutate(s => { s.batchStats = stats })
  }

  getFilteredPackages(): PackageEntry[] {
    const key = this.filterKey()
    if (this.cachedFiltered && this.cachedFilterKey === key) {
      return [...this.cachedFiltered]
    }
    let pkgs = this.state.packages
    if (this.state.viewFilter === 'not-installed') {
      pkgs = pkgs.filter(p => p.status === 'not-installed' || p.status === 'failed')
    } else if (this.state.viewFilter === 'installed') {
      pkgs = pkgs.filter(p => p.status === 'installed' || p.status === 'failed')
    }
    const q = this.state.searchQuery.toLowerCase()
    if (q) {
      pkgs = pkgs.filter(p =>
        p.info.name.toLowerCase().includes(q) ||
        p.info.displayName.toLowerCase().includes(q) ||
        p.info.description.toLowerCase().includes(q)
      )
    }
    const cat = this.state.categoryFilter
    if (cat) {
      pkgs = pkgs.filter(p => p.info.categories.includes(cat))
    }
    const lang = this.state.languageFilter
    if (lang) {
      pkgs = pkgs.filter(p => p.info.languages.includes(lang))
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
    this.cachedFiltered = pkgs
    this.cachedFilterKey = key
    return [...pkgs]
  }

  getPackage(name: string): PackageEntry | undefined {
    return this.state.packages.find(p => p.info.name === name)
  }

  refreshPackages() {
    this.invalidateFilterCache()
    const installedSet = getInstalledSet()
    this.mutate(s => {
      const updated = getAllPackages()
      if (updated.length === 0 && s.packages.length > 0) return  // don't clear on registry corruption
      const oldMap = new Map(s.packages.map(p => [p.info.name, p]))
      s.packages = updated.map(info => {
        const old = oldMap.get(info.name)
        if (old) {
          // Don't clobber in-progress status from pipeline
          if (!BUSY_STATUSES.has(old.status)) {
            old.status = installedSet.has(info.name) ? 'installed' : 'not-installed'
            if (old.status === 'installed' || old.status === 'not-installed') {
              old.progressLog = []
              old.error = undefined
            }
          }
          old.info = info
          return old
        }
        return {
          info,
          status: installedSet.has(info.name) ? 'installed' : 'not-installed',
          progressLog: [],
          expanded: false,
          logExpanded: false,
          marked: false,
        }
      })
    })
  }
}
