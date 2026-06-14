import { workspace, window as cocWindow, Disposable } from 'coc.nvim'
import { StateManager, PackageEntry, AppState, ViewFilter, SortBy } from './state'
import { installPackage, uninstallPackage, updatePackage, checkUpdates, runConcurrent } from './pipeline'
import { updateRegistry, getPackage, ProgressCallback } from './registry'
import { LineBuffer, RenderResult } from './renderer'

const VERSION: string = (() => {
  try {
    const pkg = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'package.json'), 'utf-8'))
    return pkg.version
  } catch { return '0.0.0' }
})()

const HELP_TEXT = [
  `  coc-loader v${VERSION} — VS Code extension → coc.nvim plugin converter`,
  '',
  '  Keymaps:',
  '    i          Install package under cursor',
  '    u          Update package under cursor',
  '    U          Update all installed packages',
  '    C          Check for updates from remote',
  '    X          Uninstall package under cursor',
  '    R          Reinstall package under cursor',
  '    Z          Uninstall all installed packages (with confirm)',
  '    D          Clean up orphaned packages',
  '    x          Toggle mark',
  '    f          Cycle filter: all → installed → not-installed',
  '    s          Cycle sort: default → name → status → type',
  '    j/k        Scroll through packages',
  '    /          Search filter (then j/k to scroll)',
  '    gg         Jump to first page',
  '    G          Jump to last page',
  '    <Enter>    Toggle expand/collapse details',
  '    q          Close window',
  '    <Esc>      Help→Search→Marks→Busy guard→Close',
  '',
  '  ' + '─'.repeat(40),
  '',
  '  Plugin types:',
  '    ts-bridge   Depends on TypeScript LSP bridge (e.g. Volar)',
  '    pure-lsp    Standard LSP protocol (e.g. Prisma, ESLint)',
  '    direct-api  Direct coc.nvim API calls (e.g. HTML CSS Support)',
]

export class TUI {
  private bufnr: number = 0
  private winid: number = 0
  private ns: number = 0
  private state: StateManager
  private disposables: Disposable[] = []
  private unsubscribe: (() => void) | null = null
  private pkgLineMap: Map<number, string> = new Map()
  private logLineSet: Set<number> = new Set()
  private windowHeight: number = 0
  private static readonly HEADER_LINES = 6
  private static readonly FOOTER_LINES = 3

  constructor(state: StateManager) {
    this.state = state
  }

  async open() {
    const nvim = workspace.nvim
    this.ns = await nvim.createNamespace('coc-loader')

    await nvim.command('highlight default link CocConverterTitle Title')
    await nvim.command('highlight default link CocConverterPill Visual')
    await nvim.command('highlight default link CocConverterPillActive IncSearch')
    await nvim.command('highlight CocConverterKey guifg=#569CD6 guibg=NONE ctermbg=NONE')
    await nvim.command('highlight default link CocConverterInstalled String')
    await nvim.command('highlight default link CocConverterAvailable Comment')
    await nvim.command('highlight default link CocConverterType Type')
    await nvim.command('highlight default link CocConverterSection Title')
    await nvim.command('highlight default link CocConverterTotal Identifier')

    const buf = await nvim.createNewBuffer(false, true)
    this.bufnr = buf.id

    const editorLines = await nvim.call('nvim_get_option', ['lines']) as number
    const editorCols = await nvim.call('nvim_get_option', ['columns']) as number
    const height = Math.min(Math.floor(editorLines * 0.85), 40)
    this.windowHeight = height - 2 // content area (border takes 2 rows)
    const width = Math.min(Math.floor(editorCols * 0.85), 120)
    const row = Math.max(Math.floor((editorLines - height) / 2), 0)
    const col = Math.max(Math.floor((editorCols - width) / 2), 0)

    const win = await nvim.openFloatWindow(buf, true, {
      relative: 'editor',
      width,
      height,
      row,
      col,
      border: 'rounded',
      style: 'minimal',
    })
    this.winid = win.id

    await nvim.call('nvim_buf_set_option', [this.bufnr, 'modifiable', false])
    await nvim.call('nvim_buf_set_option', [this.bufnr, 'bufhidden', 'wipe'])
    await nvim.call('nvim_buf_set_option', [this.bufnr, 'buftype', 'nofile'])
    await nvim.call('nvim_buf_set_option', [this.bufnr, 'swapfile', false])
    await nvim.call('nvim_buf_set_option', [this.bufnr, 'undolevels', -1])
    await nvim.call('nvim_win_set_option', [this.winid, 'cursorline', true])
    await nvim.call('nvim_win_set_option', [this.winid, 'number', false])
    await nvim.call('nvim_win_set_option', [this.winid, 'relativenumber', false])
    await nvim.call('nvim_win_set_option', [this.winid, 'wrap', false])
    await nvim.call('nvim_win_set_option', [this.winid, 'signcolumn', 'no'])
    await nvim.call('nvim_win_set_option', [this.winid, 'spell', false])
    await nvim.call('nvim_win_set_option', [this.winid, 'foldenable', false])

    this.unsubscribe = this.state.subscribe(() => {
      this.render().catch(() => {})
    })

    this.disposables.push(
      workspace.registerAutocmd({
        event: 'WinEnter',
        request: true,
        callback: async () => {
          if (!this.winid) return
          const curWin = await nvim.call('win_getid') as number
          if (curWin === this.winid) return
          const curBuf = await nvim.call('winbufnr', [curWin]) as number
          const bt = await nvim.call('getbufvar', [curBuf, '&buftype']) as string
          if (bt !== 'nofile' && bt !== 'prompt') {
            this.close()
          }
        }
      })
    )

    const exists = await nvim.call('exists', ['*CocConverterDispatch']) as number
    if (exists === 0) {
      await nvim.command(`
        function! CocConverterDispatch(key) abort
          execute 'CocCommand loader._dispatch ' . a:key
        endfunction
      `)
    }

    await this.setupKeymaps()

    // Initial render with current state (may be empty if no cache)
    await this.render()

    // Fetch remote registry in background with progress, re-render when done
    this.state.setStatusMessage('Fetching registry...')
    const onProgress: ProgressCallback = (msg) => {
      this.state.setStatusMessage(msg)
    }
    updateRegistry(onProgress).then(() => {
      this.state.setStatusMessage()
      this.state.refreshPackages()
      this.render()
    }).catch(() => {
      this.state.setStatusMessage('Failed to fetch remote registry (offline?)')
      setTimeout(() => this.state.setStatusMessage(), 5000)
    })
  }

  private async getCursorLine0(): Promise<number> {
    const nvim = workspace.nvim
    const cursor = await nvim.call('nvim_win_get_cursor', [this.winid]) as [number, number]
    return cursor[0] - 1
  }

  async handleKey(id: string) {
    const line0 = await this.getCursorLine0()
    const s = this.state.getState()

    if (id === 'q') { this.close(); return }
    if (id === 'I') {
      this.state.setActivePill('I')
      return
    }
    if (id === 'H') {
      this.state.setSearchQuery('')
      this.state.setActivePill(null)
      if (s.showHelp) this.state.toggleHelp()
      return
    }
    if (id === 'esc') {
      if (s.showHelp) { this.state.toggleHelp(); return }
      if (s.searchQuery) { this.state.setSearchQuery(''); return }
      const hasMarks = s.packages.some(p => p.marked)
      if (hasMarks) { this.state.clearMarks(); return }
      const busy = s.packages.some(p => ['installing', 'updating', 'uninstalling'].includes(p.status))
      if (busy) { cocWindow.showInformationMessage('Operation in progress, wait for it to finish'); return }
      this.close(); return
    }
    if (id === 'question') { this.state.toggleHelp(); return }
    if (id === 'slash') {
      try {
        const q = await workspace.nvim.call('input', ['Search: ', '']) as string
        if (q) this.state.setSearchQuery(q)
      } catch {}
      return
    }
    if (id === 'f') { this.state.cycleViewFilter(); this.focusIndex = 0; return }
    if (id === 's') { this.state.cycleSortBy(); this.focusIndex = 0; return }
    if (id === 'gg') {
      this.state.setScrollOffset(0)
      this.focusIndex = 0
      return
    }
    if (id === 'G') {
      const filtered = this.state.getFilteredPackages()
      const visibleCount = Math.max(1, this.windowHeight - TUI.HEADER_LINES - TUI.FOOTER_LINES)
      this.state.setScrollOffset(Math.max(0, filtered.length - visibleCount))
      this.focusIndex = Math.max(0, filtered.length - 1)
      return
    }
    if (id === 'j') {
      const nvim = workspace.nvim
      const [row, col] = await nvim.call('nvim_win_get_cursor', [this.winid]) as [number, number]
      // Try moving within the same package first (detail/log lines)
      const pkgName = this.pkgLineMap.get(row - 1) // nvim row is 1-based, pkgLineMap is 0-based
      if (pkgName) {
        const lines = [...this.pkgLineMap.keys()].filter(l => this.pkgLineMap.get(l) === pkgName).sort((a, b) => a - b)
        const idx = lines.indexOf(row - 1) // convert to 0-based
        if (idx >= 0 && idx < lines.length - 1) {
          await nvim.call('nvim_win_set_cursor', [this.winid, [lines[idx + 1] + 1, col]])
          this.focusLineOffset = idx + 1
          return
        }
      }
      // At last line of current package, move to next package
      this.focusLineOffset = 0
      const filtered = this.state.getFilteredPackages()
      const s = this.state.getState()
      const visibleCount = Math.max(1, this.windowHeight - TUI.HEADER_LINES - TUI.FOOTER_LINES)
      if (this.focusIndex < filtered.length - 1) {
        this.focusIndex++
        if (this.focusIndex >= s.scrollOffset + visibleCount) {
          const maxOffset = Math.max(0, filtered.length - visibleCount)
          this.state.setScrollOffset(Math.min(maxOffset, s.scrollOffset + 1))
          return // render handles cursor
        }
        // No scroll change — just move cursor in buffer
        const focused = filtered[this.focusIndex]
        const pkgLine = [...this.pkgLineMap.entries()].find(([l, n]) => n === focused.info.name)?.[0]
        if (pkgLine !== undefined) {
          await nvim.call('nvim_win_set_cursor', [this.winid, [pkgLine + 1, col]])
        }
      }
      return
    }
    if (id === 'k') {
      const nvim = workspace.nvim
      const [row, col] = await nvim.call('nvim_win_get_cursor', [this.winid]) as [number, number]
      // Try moving within the same package first (detail/log lines)
      const pkgName = this.pkgLineMap.get(row - 1)
      if (pkgName) {
        const lines = [...this.pkgLineMap.keys()].filter(l => this.pkgLineMap.get(l) === pkgName).sort((a, b) => a - b)
        const idx = lines.indexOf(row - 1) // convert to 0-based
        if (idx > 0) {
          await nvim.call('nvim_win_set_cursor', [this.winid, [lines[idx - 1] + 1, col]])
          this.focusLineOffset = idx - 1
          return
        }
      }
      // At first line of current package, move to previous package
      this.focusLineOffset = 0
      const s = this.state.getState()
      if (this.focusIndex > 0) {
        this.focusIndex--
        if (this.focusIndex < s.scrollOffset) {
          this.state.setScrollOffset(Math.max(0, s.scrollOffset - 1))
          return // render handles cursor
        }
        // No scroll change — just move cursor in buffer
        const filtered = this.state.getFilteredPackages()
        const focused = filtered[this.focusIndex]
        const pkgLine = [...this.pkgLineMap.entries()].find(([l, n]) => n === focused.info.name)?.[0]
        if (pkgLine !== undefined) {
          await nvim.call('nvim_win_set_cursor', [this.winid, [pkgLine + 1, col]])
        }
      }
      return
    }
    if (id === 'D') {
      const installed = s.packages.filter(p => p.status === 'installed')
      const removed = installed.filter(p => !getPackage(p.info.name))
      if (removed.length === 0) {
        cocWindow.showInformationMessage('No orphaned packages found')
        return
      }
      const ok = await cocWindow.showPrompt(`Uninstall ${removed.length} orphaned package(s)?`)
      if (ok) {
        for (const p of removed) await uninstallPackage(this.state, p.info.name)
      }
      return
    }
    if (id === 'U') {
      const installed = s.packages.filter(p => p.status === 'installed')
      if (installed.length === 0) return
      this.state.setActivePill('U')
      const names = installed.map(p => p.info.name)
      await runConcurrent(names, name => updatePackage(this.state, name))
      this.state.setActivePill(null)
      return
    }
    if (id === 'Z') {
      const installed = s.packages.filter(p => p.status === 'installed')
      if (installed.length === 0) return
      const ok = await cocWindow.showPrompt(`Uninstall all ${installed.length} packages?`)
      if (ok) {
        for (const pkg of installed) await uninstallPackage(this.state, pkg.info.name)
      }
      return
    }
    if (id === 'C') {
      this.state.setActivePill('C')
      await checkUpdates(this.state)
      this.state.setActivePill(null)
      return
    }

    const pkgName = this.pkgLineMap.get(line0)
    if (!pkgName) return
    const entry = this.state.getPackage(pkgName)
    if (!entry) return

    if (id === 'x') { this.state.toggleMark(pkgName); return }
    if (id === 'i' && entry.status === 'not-installed') { await installPackage(this.state, pkgName); return }
    if (id === 'u' && entry.status === 'installed') { await updatePackage(this.state, pkgName); return }
    if (id === 'X' && entry.status === 'installed') { await uninstallPackage(this.state, pkgName); return }
    if (id === 'R' && entry.status === 'installed') {
      await uninstallPackage(this.state, pkgName)
      await installPackage(this.state, pkgName)
      return
    }
    if (id === 'cr') {
      if (this.logLineSet.has(line0)) {
        this.state.toggleLog(pkgName)
      } else {
        this.state.toggleExpand(pkgName)
      }
      return
    }
  }

  private keyMap: Record<string, string> = {
    q: 'q', esc: '<Esc>', question: '?', slash: '/', j: 'j', k: 'k',
    U: 'U', Z: 'Z', i: 'i', u: 'u', X: 'X', R: 'R', cr: '<CR>',
    f: 'f', s: 's', x: 'x', D: 'D', gg: 'gg', G: 'G',
  }

  private async setupKeymaps() {
    const buf = workspace.nvim.createBuffer(this.bufnr)
    const entries: [string, string][] = [
      ['q', 'q'], ['<Esc>', 'esc'], ['?', 'question'], ['/', 'slash'],
      ['U', 'U'], ['Z', 'Z'], ['C', 'C'], ['i', 'i'], ['I', 'I'], ['H', 'H'],
      ['u', 'u'], ['X', 'X'], ['R', 'R'],
      ['f', 'f'], ['s', 's'], ['x', 'x'], ['D', 'D'],
      ['j', 'j'], ['k', 'k'],
      ['gg', 'gg'], ['G', 'G'],
      ['<CR>', 'cr'],
    ]
    for (const [vimKey, id] of entries) {
      buf.setKeymap('n', vimKey, `<Cmd>call CocConverterDispatch("${id}")<CR>`, { silent: true, nowait: true })
    }
  }

  async close() {
    const needRestart = this.state.getState().dirty
    if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null }
    for (const d of this.disposables) { d.dispose() }
    this.disposables = []
    if (this.winid) {
      try { await workspace.nvim.call('nvim_win_close', [this.winid, true]) } catch {}
      this.winid = 0
    }
    if (needRestart) {
      workspace.nvim.command('CocRestart', true)
    }
  }

  private rendering = false
  private pendingRender = false
  private focusIndex = 0
  private focusLineOffset = 0

  private async render() {
    if (!this.winid) return
    if (this.rendering) { this.pendingRender = true; return }
    this.rendering = true
    this.pendingRender = false
    try {
      const nvim = workspace.nvim
      const state = this.state.getState()
      const filtered = this.state.getFilteredPackages()

      const result = state.showHelp
        ? this.renderHelp()
        : this.renderPackageList(state, filtered)

    nvim.pauseNotification()
    nvim.call('nvim_buf_set_option', [this.bufnr, 'modifiable', true], true)
    nvim.call('nvim_buf_clear_namespace', [this.bufnr, this.ns, 0, -1], true)
    nvim.call('nvim_buf_set_lines', [this.bufnr, 0, -1, false, result.lines], true)
    nvim.call('nvim_buf_set_option', [this.bufnr, 'modifiable', false], true)
    for (const h of result.highlights) {
      nvim.call('nvim_buf_set_extmark', [this.bufnr, this.ns, h.line, h.colStart, {
        end_col: h.colEnd,
        hl_group: h.hlGroup,
        hl_mode: 'combine',
      }], true)
    }
    await nvim.resumeNotification()

    // Position cursor on package main line (only when user hasn't entered details/logs)
    if (!state.showHelp && result.pkgLineMap.size > 0 && this.focusLineOffset === 0) {
      const visible = this.state.getFilteredPackages()
      const idx = Math.min(this.focusIndex, visible.length - 1)
      const focused = visible[idx]
      if (focused) {
        const pkgLines = [...result.pkgLineMap.entries()]
          .filter(([l, n]) => n === focused.info.name)
          .map(([l]) => l)
          .sort((a, b) => a - b)
        if (pkgLines.length > 0) {
          await nvim.call('nvim_win_set_cursor', [this.winid, [pkgLines[0] + 1, 0]])
        }
      }
    }

      this.pkgLineMap = result.pkgLineMap
      this.logLineSet = result.logLines
    } finally {
      this.rendering = false
      if (this.pendingRender) this.render()
    }
  }

  private renderHelp(): TuiRenderResult {
    const header = [
      '',
      `  coc-loader v${VERSION}`,
      '  press ? help | / search | q quit',
      '  ' + '─'.repeat(50),
      '',
    ]
    return { lines: [...header, ...HELP_TEXT, '', '  q to return'], pkgLineMap: new Map(), logLines: new Set(), highlights: [] }
  }

  private statusLabel(status: string): string {
    switch (status) {
      case 'installed': return '[installed]'
      case 'not-installed': return '[not installed]'
      case 'installing': return '[installing]'
      case 'updating': return '[updating]'
      case 'uninstalling': return '[uninstalling]'
      case 'failed': return '[failed]'
      default: return ''
    }
  }

  private renderPackageList(state: AppState, filtered: PackageEntry[]): TuiRenderResult {
    const pkgLineMap = new Map<number, string>()
    const logSet = new Set<number>()
    this.pkgLineMap = pkgLineMap
    this.logLineSet = logSet

    const buf = new LineBuffer()

    buf.nl()
    const needHome = !!(state.showHelp || state.searchQuery)
    buf.append('coc-loader(H)', needHome ? 'CocConverterPillActive' : 'CocConverterTitle')
    for (const [name, key] of [['Install', 'I'], ['Update', 'U'], ['Check', 'C'], ['Help', '?']] as const) {
      buf.append('  ')
      const isActive = key === '?' && state.showHelp
        || key === 'I' && state.activePill === 'I'
        || key === 'U' && state.activePill === 'U'
        || key === 'C' && state.activePill === 'C'
      buf.append(`${name}(${key})`, isActive ? 'CocConverterPillActive' : 'CocConverterPill')
    }
    buf.highlight(/\([IU?C]\)/g, 'CocConverterKey')
    buf.nl()
    buf.nl()
    const filterLabel = state.viewFilter === 'all' ? 'All' : state.viewFilter === 'installed' ? 'Installed' : 'Available'
    const sortLabel = state.sortBy === 'default' ? 'Default' : state.sortBy === 'name' ? 'Name' : state.sortBy === 'status' ? 'Status' : 'Type'
    buf.append(`Total: ${filtered.length} packages`, 'CocConverterTotal')
    buf.append(`  |  `)
    buf.append(`F:${filterLabel}(f)`, 'CocConverterPill')
    buf.append(`  `)
    buf.append(`S:${sortLabel}(s)`, 'CocConverterPill')
    if (state.statusMessage) {
      buf.append('  ·  ')
      buf.append(state.statusMessage, 'Comment')
    }
    buf.nl()
    buf.nl()

    // Virtual scroll: visible window
    const visibleCount = Math.max(1, this.windowHeight - TUI.HEADER_LINES - TUI.FOOTER_LINES)
    const maxOffset = Math.max(0, filtered.length - visibleCount)
    const start = Math.min(state.scrollOffset, maxOffset)
    const end = Math.min(start + visibleCount, filtered.length)
    const visible = filtered.slice(start, end)

    // Indicator
    const indicator = filtered.length > visibleCount
      ? `${start + 1}–${end} of ${filtered.length}`
      : `${filtered.length} packages`
    buf.append(indicator, 'CocConverterTotal')
    buf.nl()
    buf.nl()

    // Render visible items (virtual list)
    for (const e of visible) {
      this.renderEntry(buf, pkgLineMap, logSet, e)
    }

    if (filtered.length === 0 && state.searchQuery) {
      buf.nl('no matching packages')
    }

    // Footer (in main buffer, always visible)
    buf.nl()
    buf.append(' ' + '─'.repeat(50), 'Comment')
    buf.nl()
    const filterLabel2 = state.viewFilter === 'all' ? 'All' : state.viewFilter === 'installed' ? 'Installed' : 'Available'
    const sortLabel2 = state.sortBy === 'default' ? 'Default' : state.sortBy === 'name' ? 'Name' : state.sortBy === 'status' ? 'Status' : 'Type'
    buf.append(` ${filtered.length} packages · ${filterLabel2} · ${sortLabel2}`, 'Comment')

    const result = buf.render(2)
    return { lines: result.lines, pkgLineMap, logLines: logSet, highlights: result.highlights }
  }

  private renderEntry(
    buf: LineBuffer, pkgLineMap: Map<number, string>, logSet: Set<number>,
    entry: PackageEntry,
  ) {
    const icon = entry.status === 'installed' ? '●' : entry.status === 'failed' ? '✗' : '○'
    const iconHl = entry.status === 'installed' ? 'CocConverterInstalled'
      : entry.status === 'failed' ? 'ErrorMsg' : 'CocConverterAvailable'

    const pkgLine = buf.currentLine()
    pkgLineMap.set(pkgLine, entry.info.name)

    if (entry.marked) {
      buf.append('▸', 'CocConverterKey')
      buf.append(' ')
    } else {
      buf.append('  ')
    }
    buf.append(icon, iconHl)
    buf.append(' ')
    buf.append(entry.info.displayName)
    buf.append(' ')
    buf.append(entry.info.type, 'CocConverterType')
    if (entry.hasUpdate) {
      buf.append('  ↑', 'CocConverterKey')
    }
    // lazy.nvim style: only show commit info for just-updated packages
    if (entry.updated && entry.commit && entry.commitMsg) {
      buf.nl()
      const ln = buf.currentLine()
      buf.append(`     ${entry.commit} ${entry.commitMsg}`, 'Comment')
      if (entry.commitDate) {
        buf.append(` (${entry.commitDate})`, 'Comment')
      }
      pkgLineMap.set(ln, entry.info.name)
    }

    if (entry.expanded) {
      buf.nl()
      const extras: (string | null)[] = [
        entry.info.description,
        `type        ${entry.info.type}`,
        entry.commit ? `commit      ${entry.commit}` : null,
        `source      ${sourceStr(entry.info.source)}`,
        `languages   ${entry.info.languages.join(', ')}`,
        `categories  ${entry.info.categories.join(', ')}`,
        `homepage    ${entry.info.url}`,
        entry.info.serverBinary ? `server      ${entry.info.serverBinary.repo} (binary release)` : null,
      ]
      for (const text of extras.filter(Boolean) as string[]) {
        const ln = buf.currentLine()
        buf.nl(`     ${text}`)
        pkgLineMap.set(ln, entry.info.name)
      }
    }

    if (entry.progress) {
      buf.nl()
      if (entry.logExpanded) {
        const ln = buf.currentLine()
        buf.nl(`     ▼ Install log:`)
        logSet.add(ln)
        pkgLineMap.set(ln, entry.info.name)
        for (const log of entry.progressLog) {
          for (const l of log.split('\n')) {
            const ln2 = buf.currentLine()
            buf.nl(`       ${l}`)
            logSet.add(ln2)
            pkgLineMap.set(ln2, entry.info.name)
          }
        }
      } else {
        const ln = buf.currentLine()
        buf.nl(`     ▶ ${entry.progress}`)
        logSet.add(ln)
        pkgLineMap.set(ln, entry.info.name)
      }
    }

    if (entry.error) {
      buf.nl()
      const ln = buf.currentLine()
      buf.nl(`     ✗ ${entry.error}`)
      pkgLineMap.set(ln, entry.info.name)
    }

    buf.nl()
  }

  isOpen(): boolean {
    return this.winid !== 0
  }
}

interface TuiRenderResult {
  lines: string[]
  pkgLineMap: Map<number, string>
  logLines: Set<number>
  highlights: { line: number; hlGroup: string; colStart: number; colEnd: number }[]
}

function sourceStr(source: { type: string; repo?: string; package?: string; subdir?: string }): string {
  if (source.type === 'github') return `github:${source.repo}${source.subdir ? '/' + source.subdir : ''}`
  if (source.type === 'npm') return `npm:${source.package}`
  return source.type
}
