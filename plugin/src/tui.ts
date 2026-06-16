import { workspace, window as cocWindow, Disposable } from 'coc.nvim'
import { StateManager, PackageEntry, AppState } from './state'
import { installPackage, uninstallPackage, updatePackage, checkUpdates, runConcurrent } from './pipeline'
import { updateRegistry, getPackage, ProgressCallback } from './registry'
import { LineBuffer } from './renderer'

const VERSION: string = (() => {
  try {
    const pkg = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'package.json'), 'utf-8'))
    return pkg.version
  } catch { return '0.0.0' }
})()

const HELP_TEXT = [
  `  coc-loader v${VERSION} — VS Code extension loader for coc.nvim`,
  '',
  '  Keymaps:',
  '    1-9        Switch view tab',
  '    i          Install package under cursor',
  '    u          Update package under cursor',
  '    U          Update all installed packages',
  '    C          Check for updates',
  '    X          Uninstall package under cursor',
  '    <CR>       Toggle package details',
  '    ?          Toggle this help',
  '    q / <Esc>  Close window',
  '',
  '  ' + '─'.repeat(40),
  '',
  '  View tabs:',
  '    All        All packages',
  '    <category> Filter by category',
]

export class TUI {
  private bufnr: number = 0
  private winid: number = 0
  private ns: number = 0
  private state: StateManager
  private disposables: Disposable[] = []
  private unsubscribe: (() => void) | null = null
  private pkgLineMap: Map<number, string> = new Map()
  private detailWinid: number = 0
  private detailBufnr: number = 0
  private backdropBufnr: number = 0
  private backdropWinid: number = 0
  private detailPkgName: string = ''
  private detailMode: 'log' | 'info' = 'info'
  private windowHeight: number = 0
  private windowWidth: number = 0
  private lastFocusedPkg: string = ''

  constructor(state: StateManager) {
    this.state = state
  }

  async open() {
    const nvim = workspace.nvim
    this.ns = await nvim.createNamespace('coc-loader')

    // Mason-style highlight groups (all with `default` to respect user theme)
    await nvim.command('highlight default CocLoaderHeader guibg=#DCA561 guifg=#222222 gui=bold')
    await nvim.command('highlight default CocLoaderHeaderSec guibg=#56B6C2 guifg=#222222 gui=bold')
    await nvim.command('highlight default CocLoaderTabActive guibg=#56B6C2 guifg=#222222 gui=bold')
    await nvim.command('highlight default CocLoaderTabInactive guibg=#888888 guifg=#222222')
    await nvim.command('highlight default CocLoaderHeading gui=bold')
    await nvim.command('highlight default CocLoaderHighlight guifg=#56B6C2')
    await nvim.command('highlight default CocLoaderMuted guifg=#888888')
    await nvim.command('highlight default link CocLoaderError ErrorMsg')
    await nvim.command('highlight default link CocLoaderNormal NormalFloat')
    await nvim.command('highlight default link CocLoaderSearchMatch Search')
    await nvim.command('highlight default CocLoaderWarning guifg=#DCA561')
    await nvim.command('highlight default CocLoaderBackdrop guibg=#000000')

    const editorLines = await nvim.call('nvim_get_option', ['lines']) as number
    const editorCols = await nvim.call('nvim_get_option', ['columns']) as number
    const cmdheight = await nvim.call('nvim_get_option', ['cmdheight']) as number
    const availLines = Math.max(1, editorLines - cmdheight)
    const height = Math.floor(availLines * 0.9)
    const width = Math.floor(editorCols * 0.8)
    this.windowHeight = height
    this.windowWidth = width
    const row = Math.max(Math.floor((availLines - height) / 2), 0)
    const col = Math.max(Math.floor((editorCols - width) / 2), 0)

    // Create backdrop (Mason-style dim overlay)
    const backdropBuf = await nvim.createNewBuffer(false, true)
    this.backdropBufnr = backdropBuf.id
    const backdropWin = await nvim.openFloatWindow(backdropBuf, false, {
      relative: 'editor',
      width: editorCols,
      height: editorLines,
      row: 0,
      col: 0,
      style: 'minimal',
      focusable: false,
      border: 'none',
      zindex: 44,
    })
    this.backdropWinid = backdropWin.id
    await nvim.call('nvim_win_set_option', [backdropWin.id, 'winhighlight', 'Normal:CocLoaderBackdrop'])
    await nvim.call('nvim_win_set_option', [backdropWin.id, 'winblend', 60])

    const buf = await nvim.createNewBuffer(false, true)
    this.bufnr = buf.id

    const win = await nvim.openFloatWindow(buf, true, {
      relative: 'editor',
      width,
      height,
      row,
      col,
      border: 'none',
      style: 'minimal',
      zindex: 45,
    })
    this.winid = win.id

    await nvim.call('nvim_win_set_option', [this.winid, 'winhighlight', 'NormalFloat:CocLoaderNormal'])
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

    const exists = await nvim.call('exists', ['*CocConverterDispatch']) as number
    if (exists === 0) {
      await nvim.command(`
        function! CocConverterDispatch(key) abort
          execute 'CocCommand loader._dispatch ' . a:key
        endfunction
      `)
    }

    await this.setupKeymaps()

    this.unsubscribe = this.state.subscribe(() => {
      this.render().catch(() => {})
    })

    this.disposables.push(
      workspace.registerAutocmd({
        event: 'WinEnter',
        request: true,
        callback: async () => {
          try {
            if (!this.winid) return
            const curWin = await nvim.call('win_getid') as number
            if (curWin === this.winid) return
            const curBuf = await nvim.call('winbufnr', [curWin]) as number
            const bt = await nvim.call('getbufvar', [curBuf, '&buftype']) as string
            if (bt !== 'nofile' && bt !== 'prompt' && bt !== 'help' && bt !== 'terminal' && bt !== 'quickfix') {
              await this.close()
            }
          } catch {}
        }
      })
    )

    try {
      await this.render()
    } catch {
      this.close().catch(() => {})
      throw new Error('TUI render failed')
    }

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
    if (!this.winid) return
    const line0 = await this.getCursorLine0()
    const s = this.state.getState()

    if (id === 'q') { await this.close(); return }
    if (id === 'esc') {
      if (s.showHelp) { this.state.toggleHelp(); return }
      if (s.categoryFilter) { this.state.setCategoryFilter(null); return }
      await this.close(); return
    }
    if (id === 'question') { this.state.toggleHelp(); return }

    // Number key tab switching (Mason-style)
    if (id >= '1' && id <= '9') {
      const tabs = this.getTabs()
      const idx = parseInt(id) - 1
      if (idx < tabs.length) {
        const tab = tabs[idx]
        this.state.setCategoryFilter(tab === 'All' ? null : tab)
      }
      return
    }

    if (id === 'C') {
      await checkUpdates(this.state)
      return
    }
    if (id === 'U') {
      const installed = s.packages.filter(p => p.status === 'installed')
      if (installed.length === 0) return
      await runConcurrent(installed.map(p => p.info.name), name => updatePackage(this.state, name), this.state)
      return
    }

    // Package operations
    const pkgName = this.pkgLineMap.get(line0)
    if (!pkgName) return
    const entry = this.state.getPackage(pkgName)
    if (!entry) return

    this.lastFocusedPkg = pkgName

    if (id === 'i' && entry.status === 'not-installed') { await installPackage(this.state, pkgName); return }
    if (id === 'u' && entry.status === 'installed') { await updatePackage(this.state, pkgName); return }
    if (id === 'X' && entry.status === 'installed') { await uninstallPackage(this.state, pkgName); return }
    if (id === 'cr') {
      if (['installing', 'updating', 'uninstalling'].includes(entry.status)) {
        this.state.toggleLog(pkgName)
      } else {
        this.state.toggleExpand(pkgName)
      }
      return
    }
  }

  private getTabs(): string[] {
    const cats = this.state.getCategories()
    return ['All', ...cats.slice(0, 6)]
  }

  private async setupKeymaps() {
    const buf = workspace.nvim.createBuffer(this.bufnr)
    const entries: [string, string][] = [
      ['q', 'q'], ['<Esc>', 'esc'], ['?', 'question'],
      ['i', 'i'], ['u', 'u'], ['U', 'U'], ['C', 'C'], ['X', 'X'],
      ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'],
      ['6', '6'], ['7', '7'], ['8', '8'], ['9', '9'],
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
    if (this.detailWinid) {
      try { await workspace.nvim.call('nvim_win_close', [this.detailWinid, true]) } catch {}
      this.detailWinid = 0
    }
    if (this.backdropWinid) {
      try { await workspace.nvim.call('nvim_win_close', [this.backdropWinid, true]) } catch {}
      this.backdropWinid = 0
    }
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

      if (this.windowWidth > 0) {
        result.highlights = result.highlights.filter(h => h.colStart < this.windowWidth)
        for (const h of result.highlights) {
          if (h.colEnd > this.windowWidth) h.colEnd = this.windowWidth
        }
      }

      nvim.pauseNotification()
      try {
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
      } finally {
        await nvim.resumeNotification()
      }

      if (this.detailWinid) {
        this.updateDetailPopup().catch(() => {})
      }

      this.pkgLineMap = result.pkgLineMap

      // Restore cursor position
      if (!state.showHelp && this.lastFocusedPkg && result.pkgLineMap.size > 0) {
        const targetLine = [...result.pkgLineMap.entries()].find(([l, n]) => n === this.lastFocusedPkg)?.[0]
        if (targetLine !== undefined) {
          await nvim.call('nvim_win_set_cursor', [this.winid, [targetLine + 1, 0]])
        }
      }
    } finally {
      this.rendering = false
      if (this.pendingRender) await this.render()
    }
  }

  private renderHelp(): TuiRenderResult {
    const lines = [
      '',
      `  coc-loader v${VERSION}`,
      '  press ? help | q quit',
      '  ' + '─'.repeat(50),
      '',
      ...HELP_TEXT,
      '',
      '  q to return',
    ]
    return { lines, pkgLineMap: new Map(), logLines: new Set(), highlights: [] }
  }

  private renderPackageList(state: AppState, filtered: PackageEntry[]): TuiRenderResult {
    const pkgLineMap = new Map<number, string>()
    this.pkgLineMap = pkgLineMap

    const buf = new LineBuffer()

    // Centered header + key hint
    const hdrLine = `coc-loader v${VERSION}`
    const hdrLen = Buffer.from(hdrLine).length
    const hdrPad = Math.max(0, Math.floor((this.windowWidth - hdrLen) / 2) - 2)
    if (hdrPad > 0) buf.append(' '.repeat(hdrPad), undefined)
    buf.append(hdrLine, 'CocLoaderHeader')
    buf.nl()
    const hintLine = 'press g? for help'
    const hintLen = Buffer.from(hintLine).length
    const hintPad = Math.max(0, Math.floor((this.windowWidth - hintLen) / 2) - 2)
    if (hintPad > 0) buf.append(' '.repeat(hintPad), undefined)
    buf.append('press ', undefined)
    buf.append('g?', 'CocLoaderHighlight')
    buf.append(' for help')
    buf.nl()
    buf.nl()

    // Tabs: " (1) All  (2) LSP  (3) Snippets ..."
    const tabs = this.getTabs()
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i]
      const isActive = (i === 0 && !state.categoryFilter) || (i > 0 && state.categoryFilter === tab)
      const hl = isActive ? 'CocLoaderTabActive' : 'CocLoaderTabInactive'
      buf.append(` (${i + 1}) ${tab} `, hl)
      if (i < tabs.length - 1) {
        buf.append(' ', undefined)
      }
    }
    buf.nl()
    buf.nl()

    const failed = filtered.filter(p => p.status === 'failed')
    const installing = filtered.filter(p => ['installing', 'updating', 'uninstalling'].includes(p.status))
    const installed = filtered.filter(p => p.status === 'installed')
    const available = filtered.filter(p => p.status === 'not-installed')

    this.renderSection(buf, pkgLineMap, 'Failed', failed)
    this.renderSection(buf, pkgLineMap, 'Installing', installing)
    this.renderSection(buf, pkgLineMap, 'Installed', installed)
    this.renderSection(buf, pkgLineMap, 'Available', available)

    const result = buf.render(2)
    return { lines: result.lines, pkgLineMap, logLines: new Set(), highlights: result.highlights }
  }

  private renderSection(buf: LineBuffer, pkgLineMap: Map<number, string>, title: string, entries: PackageEntry[]) {
    if (entries.length === 0) return
    buf.append(`${title} `, 'CocLoaderHeading')
    buf.append(`(${entries.length})`, 'CocLoaderMuted')
    buf.nl()
    for (const entry of entries) {
      this.renderEntry(buf, pkgLineMap, entry)
    }
    buf.nl()
  }

  private renderEntry(buf: LineBuffer, pkgLineMap: Map<number, string>, entry: PackageEntry) {
    const pkgLine = buf.currentLine()
    pkgLineMap.set(pkgLine, entry.info.name)

    let iconHl: string
    if (entry.status === 'failed') {
      iconHl = 'CocLoaderError'
    } else if (entry.status === 'installed') {
      iconHl = 'CocLoaderHighlight'
    } else if (['installing', 'updating', 'uninstalling'].includes(entry.status)) {
      iconHl = 'CocLoaderHighlight'
    } else {
      iconHl = 'CocLoaderMuted'
    }
    buf.append('  ')
    buf.append('◍', iconHl)
    buf.append(' ')
    this.appendHighlightedText(buf, entry.info.name)
    if (entry.hasUpdate) {
      buf.append('  ↑', 'CocLoaderHighlight')
    }
    buf.nl()

    // Mason-style installing log: tail or full log toggle
    if (['installing', 'updating', 'uninstalling'].includes(entry.status) && entry.progressLog.length > 0) {
      if (entry.logExpanded) {
        buf.append('    ▼ Displaying full log', 'CocLoaderHeading')
        buf.nl()
        for (const log of entry.progressLog) {
          for (const l of log.split('\n')) {
            buf.append('      ', undefined)
            buf.append(l, 'CocLoaderMuted')
            buf.nl()
          }
        }
      } else {
        const last = entry.progressLog[entry.progressLog.length - 1]
        const head = last.split('\n')[0]
        buf.append('    ▶ # ', undefined)
        buf.append(entry.progress || head, 'CocLoaderMuted')
        buf.nl()
      }
    }

    // Mason-style inline expanded package details
    if (['installed', 'not-installed', 'failed'].includes(entry.status) && entry.expanded) {
      this.renderExpandedInfo(buf, entry)
    }
  }

  private renderExpandedInfo(buf: LineBuffer, entry: PackageEntry) {
    // Description in Comment (multi-line support)
    for (const descLine of entry.info.description.split('\n')) {
      buf.append('    ', undefined)
      buf.append(descLine, 'CocLoaderMuted')
      buf.nl()
    }
    buf.nl()

    // Table: muted labels + value in highlight/bold
    const rows: [string, string, string][] = [
      ['type', entry.info.type, 'CocLoaderHighlight'],
      ['source', sourceStr(entry.info.source), 'CocLoaderHighlight'],
      ['languages', entry.info.languages.join(', '), 'CocLoaderHeading'],
      ['categories', entry.info.categories.join(', '), 'CocLoaderHeading'],
      ['homepage', entry.info.url, 'CocLoaderHighlight'],
    ]
    if (entry.commit) {
      const verMsg = entry.commit + (entry.commitMsg ? ' ' + entry.commitMsg : '')
      rows.unshift(['version', verMsg, 'CocLoaderHeading'])
    }
    const labelWidth = Math.max(...rows.map(r => r[0].length))
    for (const [label, value, valueHl] of rows) {
      buf.append('    ', undefined)
      buf.append(label + ' '.repeat(labelWidth - label.length + 2), 'CocLoaderMuted')
      buf.append(value, valueHl)
      buf.nl()
    }
    buf.nl()
  }

  private appendHighlightedText(buf: LineBuffer, text: string) {
    const q = this.state.getState().searchQuery
    if (!q) {
      buf.append(text)
      return
    }
    const lower = text.toLowerCase()
    const qLower = q.toLowerCase()
    let pos = 0
    let idx = lower.indexOf(qLower, pos)
    if (idx === -1) {
      buf.append(text)
      return
    }
    while (idx !== -1) {
      if (idx > pos) buf.append(text.slice(pos, idx))
      buf.append(text.slice(idx, idx + q.length), 'CocLoaderSearchMatch')
      pos = idx + q.length
      idx = lower.indexOf(qLower, pos)
    }
    if (pos < text.length) buf.append(text.slice(pos))
  }

  private buildDetailLines(entry: PackageEntry, mode: 'log' | 'info' = 'info'): string[] {
    const lines: string[] = []
    if (mode === 'log') {
      for (const log of entry.progressLog) {
        for (const l of log.split('\n')) {
          lines.push(`  ${l}`)
        }
      }
      if (entry.error) lines.push('', `  ✗ ${entry.error}`)
      return lines
    }
    lines.push(
      `  desc     ${entry.info.description}`,
      `  type     ${entry.info.type}`,
      `  status   ${entry.status}`,
    )
    if (entry.commit) lines.push(`  commit   ${entry.commit}`)
    lines.push(
      `  source   ${sourceStr(entry.info.source)}`,
      `  langs    ${entry.info.languages.join(', ')}`,
      `  cats     ${entry.info.categories.join(', ')}`,
      `  link     ${entry.info.url}`,
    )
    if (entry.info.serverBinary) {
      lines.push(`  server   ${entry.info.serverBinary.repo}`)
    }
    return lines
  }

  private showDetailPopupBusy = false
  private async showDetailPopup(name: string) {
    if (this.showDetailPopupBusy) return
    this.showDetailPopupBusy = true
    const nvim = workspace.nvim
    try {
      if (this.detailWinid) await this.closeDetailPopup()
      this.detailPkgName = name
      const entry = this.state.getPackage(name)
      if (!entry) return
      this.detailMode = ['installing', 'updating', 'uninstalling', 'failed'].includes(entry.status) ? 'log' : 'info'

      const editorLines = await nvim.call('nvim_get_option', ['lines']) as number
      const editorCols = await nvim.call('nvim_get_option', ['columns']) as number
      const lines = this.buildDetailLines(entry, this.detailMode)
      const maxH = Math.floor(editorLines * 0.7)
      const height = this.detailMode === 'log' ? Math.min(20, maxH) : Math.min(lines.length, 20)
      const row = Math.max(0, Math.floor((editorLines - height - 2) / 2))
      const col = Math.max(0, Math.floor((editorCols - 80) / 2))
      const buf = await nvim.createNewBuffer(false, true)
      this.detailBufnr = buf.id
      const win = await nvim.openFloatWindow(buf, true, {
        relative: 'editor', width: 78, height, row, col,
        border: 'rounded', style: 'minimal', zindex: 100,
        title: this.detailMode === 'log' ? `${entry.info.displayName}  ·  Log` : entry.info.displayName,
        title_pos: 'left',
      })
      this.detailWinid = win.id
      await nvim.call('nvim_win_set_option', [this.detailWinid, 'wrap', true])
      await nvim.call('nvim_buf_set_option', [this.detailBufnr, 'bufhidden', 'wipe'])
      await nvim.call('nvim_buf_set_option', [this.detailBufnr, 'buftype', 'nofile'])
      const keyBuf = nvim.createBuffer(this.detailBufnr)
      keyBuf.setKeymap('n', 'q', '<Cmd>call CocConverterDispatch("close-detail")<CR>', { silent: true, nowait: true })
      keyBuf.setKeymap('n', '<Esc>', '<Cmd>call CocConverterDispatch("close-detail")<CR>', { silent: true, nowait: true })
      keyBuf.setKeymap('n', 'j', '<Cmd>call CocConverterDispatch("detail-j")<CR>', { silent: true, nowait: true })
      keyBuf.setKeymap('n', 'k', '<Cmd>call CocConverterDispatch("detail-k")<CR>', { silent: true, nowait: true })
      await this.updateDetailPopup()
    } finally {
      this.showDetailPopupBusy = false
    }
  }

  private async updateDetailPopup() {
    if (!this.detailWinid || !this.detailPkgName) return
    const entry = this.state.getPackage(this.detailPkgName)
    if (!entry) return
    const lines = this.buildDetailLines(entry, this.detailMode)
    const nvim = workspace.nvim
    nvim.pauseNotification()
    try {
      nvim.call('nvim_buf_set_lines', [this.detailBufnr, 0, -1, false, lines], true)
      nvim.call('nvim_buf_clear_namespace', [this.detailBufnr, this.ns, 0, -1], true)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.startsWith('  [')) {
          const endBracket = line.indexOf(']')
          if (endBracket > 0) {
            nvim.call('nvim_buf_set_extmark', [this.detailBufnr, this.ns, i, 2, { end_col: endBracket + 1, hl_group: 'CocLoaderHighlight' }], true)
            nvim.call('nvim_buf_set_extmark', [this.detailBufnr, this.ns, i, endBracket + 1, { end_col: line.length, hl_group: 'Comment' }], true)
          }
        } else if (line.startsWith('  $ ')) {
          nvim.call('nvim_buf_set_extmark', [this.detailBufnr, this.ns, i, 0, { end_col: line.length, hl_group: 'Comment' }], true)
        } else if (line.includes('✗') || line.includes('Error:')) {
          nvim.call('nvim_buf_set_extmark', [this.detailBufnr, this.ns, i, 0, { end_col: line.length, hl_group: 'ErrorMsg' }], true)
        } else if (line.match(/^\s{4}at\s/) || line.match(/^\s{4}Node\.js/)) {
          nvim.call('nvim_buf_set_extmark', [this.detailBufnr, this.ns, i, 0, { end_col: line.length, hl_group: 'Comment' }], true)
        } else if (line.match(/^\s{2}\w+\s{3,}/)) {
          const parts = line.substring(2).split(/\s{2,}/)
          if (parts.length >= 2 && ['desc', 'type', 'status', 'source', 'langs', 'cats', 'link', 'commit', 'server'].includes(parts[0])) {
            const labelEnd = 2 + parts[0].length + line.substring(2 + parts[0].length).match(/^\s*/)![0].length
            nvim.call('nvim_buf_set_extmark', [this.detailBufnr, this.ns, i, 2, { end_col: labelEnd, hl_group: 'CocLoaderHighlight' }], true)
            nvim.call('nvim_buf_set_extmark', [this.detailBufnr, this.ns, i, labelEnd, { end_col: line.length, hl_group: 'Comment' }], true)
          }
        }
      }
      if (this.detailMode === 'log') {
        nvim.call('nvim_win_set_cursor', [this.detailWinid, [lines.length, 0]], true)
      }
    } finally {
      await nvim.resumeNotification()
    }
  }

  private async closeDetailPopup() {
    if (!this.detailWinid) return
    try { await workspace.nvim.call('nvim_win_close', [this.detailWinid, true]) } catch {}
    this.detailWinid = 0
    this.detailBufnr = 0
    this.detailPkgName = ''
    this.detailMode = 'info'
    this.render().catch(() => {})
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
  if (source.type === 'github') return `github:${source.repo || 'unknown'}${source.subdir ? '/' + source.subdir : ''}`
  if (source.type === 'npm') return `npm:${source.package || 'unknown'}`
  return source.type
}
