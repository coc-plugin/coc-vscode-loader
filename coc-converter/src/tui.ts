import { workspace, window as cocWindow, Disposable } from 'coc.nvim'
import { StateManager, PackageEntry, AppState } from './state'
import { installPackage, uninstallPackage, updatePackage } from './pipeline'
import { LineBuffer, RenderResult } from './renderer'

const HELP_TEXT = [
  '  coc-converter — VS Code extension → coc.nvim plugin converter',
  '',
  '  Keymaps:',
  '    i          Install package under cursor',
  '    u          Update package under cursor',
  '    U          Update all installed packages',
  '    X          Uninstall package under cursor',
  '    Z          Uninstall all installed packages (with confirm)',
  '    <Enter>    Toggle expand/collapse details',
  '    /          Search filter',
  '    q / <Esc>  Close window',
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

  constructor(state: StateManager) {
    this.state = state
  }

  async open() {
    const nvim = workspace.nvim
    this.ns = await nvim.createNamespace('coc-converter')

    const buf = await nvim.createNewBuffer(false, true)
    this.bufnr = buf.id

    const editorLines = await nvim.call('nvim_get_option', ['lines']) as number
    const editorCols = await nvim.call('nvim_get_option', ['columns']) as number
    const height = Math.min(Math.floor(editorLines * 0.85), 40)
    const width = Math.min(Math.floor(editorCols * 0.85), 120)
    const row = Math.max(Math.floor((editorLines - height) / 2), 0)
    const col = Math.max(Math.floor((editorCols - width) / 2), 0)

    const win = await nvim.openFloatWindow(buf, true, {
      relative: 'editor',
      width,
      height,
      row,
      col,
      border: 'none',
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
      this.render()
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
          execute 'CocCommand converter._dispatch ' . a:key
        endfunction
      `)
    }

    await this.setupKeymaps()
    await this.render()
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
    if (id === 'esc') {
      if (s.showHelp) { this.state.toggleHelp(); return }
      if (s.searchQuery) { this.state.setSearchQuery(''); return }
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
    if (id === 'U') {
      for (const pkg of s.packages.filter(p => p.status === 'installed')) {
        updatePackage(this.state, pkg.info.name)
      }
      return
    }
    if (id === 'Z') {
      const installed = s.packages.filter(p => p.status === 'installed')
      if (installed.length === 0) return
      const ok = await cocWindow.showPrompt(`Uninstall all ${installed.length} packages?`)
      if (ok) {
        for (const pkg of installed) uninstallPackage(this.state, pkg.info.name)
      }
      return
    }

    const pkgName = this.pkgLineMap.get(line0)
    if (!pkgName) return
    const entry = this.state.getPackage(pkgName)
    if (!entry) return

    if (id === 'i' && entry.status === 'not-installed') { installPackage(this.state, pkgName); return }
    if (id === 'u' && entry.status === 'installed') { updatePackage(this.state, pkgName); return }
    if (id === 'X' && entry.status === 'installed') { uninstallPackage(this.state, pkgName); return }
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
    q: 'q', esc: '<Esc>', question: '?', slash: '/',
    U: 'U', Z: 'Z', i: 'i', u: 'u', X: 'X', cr: '<CR>',
  }

  private async setupKeymaps() {
    const buf = workspace.nvim.createBuffer(this.bufnr)
    const entries: [string, string][] = [
      ['q', 'q'], ['<Esc>', 'esc'], ['?', 'question'], ['/', 'slash'],
      ['U', 'U'], ['Z', 'Z'], ['i', 'i'], ['u', 'u'], ['X', 'X'], ['<CR>', 'cr'],
    ]
    for (const [vimKey, id] of entries) {
      buf.setKeymap('n', vimKey, `:<C-u>call CocConverterDispatch("${id}")<CR>`, { silent: true, nowait: true })
    }
  }

  async close() {
    if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null }
    for (const d of this.disposables) { d.dispose() }
    this.disposables = []
    if (this.winid) {
      try { await workspace.nvim.call('nvim_win_close', [this.winid, true]) } catch {}
      this.winid = 0
    }
  }

  private rendering = false

  private async render() {
    if (!this.winid || this.rendering) return
    this.rendering = true
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
        nvim.call('nvim_buf_add_highlight', [this.bufnr, this.ns, h.hlGroup, h.line, h.colStart, h.colEnd], true)
      }
      await nvim.resumeNotification()

      this.pkgLineMap = result.pkgLineMap
      this.logLineSet = result.logLines
    } finally {
      this.rendering = false
    }
  }

  private renderHelp(): TuiRenderResult {
    const header = [
      '',
      '  coc-converter v0.1',
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
    buf.append('  Install (i)   Update (u)   Uninstall (X)   Update All (U)   Uninstall All (Z)   Help (?)')
    buf.highlight(/Install|Update|Uninstall|Update All|Uninstall All|Help/g, 'String')
    buf.highlight(/\([iuXUZ?]\)/g, 'Special')
    buf.nl()
    buf.append(`  Total: ${filtered.length} packages`)
    buf.nl()

    const installed = filtered.filter(e => e.status === 'installed')
    const available = filtered.filter(e => e.status !== 'installed')

    if (installed.length > 0) {
      buf.nl(`  Installed (${installed.length})`)
      for (const entry of installed) {
        this.renderEntry(buf, pkgLineMap, logSet, entry, '●', 'String')
      }
    }

    if (available.length > 0) {
      buf.nl(`  Available (${available.length})`)
      for (const entry of available) {
        const icon = entry.status === 'failed' ? '✗' : '○'
        const hl = entry.status === 'failed' ? 'ErrorMsg' : 'Comment'
        this.renderEntry(buf, pkgLineMap, logSet, entry, icon, hl)
      }
    }

    if (filtered.length === 0 && state.searchQuery) {
      buf.nl('  no matching packages')
    }

    const result = buf.render()
    return { lines: result.lines, pkgLineMap, logLines: logSet, highlights: result.highlights }
  }

  private renderEntry(
    buf: LineBuffer, pkgLineMap: Map<number, string>, logSet: Set<number>,
    entry: PackageEntry, icon: string, iconHl: string,
  ) {
    const curLine = (): number => buf.lineCount() - 1

    buf.nl()
    const pkgLine = curLine()
    pkgLineMap.set(pkgLine, entry.info.name)

    buf.append(`  ${icon} `, iconHl)
    buf.append(entry.info.displayName)
    buf.append(`   ${entry.info.type}`, 'Type')

    if (entry.expanded) {
      const items = [
        entry.info.description,
        `type        ${entry.info.type}`,
        `source      ${sourceStr(entry.info.source)}`,
        `languages   ${entry.info.languages.join(', ')}`,
        `categories  ${entry.info.categories.join(', ')}`,
        `homepage    ${entry.info.url}`,
      ]
      for (const text of items) {
        buf.nl(`     ${text}`)
        pkgLineMap.set(curLine(), entry.info.name)
      }
    }

    if (entry.progress) {
      if (entry.logExpanded) {
        buf.nl(`     ▼ Install log:`)
        logSet.add(curLine())
        pkgLineMap.set(curLine(), entry.info.name)
        for (const log of entry.progressLog) {
          for (const l of log.split('\n')) {
            buf.nl(`       ${l}`)
            logSet.add(curLine())
            pkgLineMap.set(curLine(), entry.info.name)
          }
        }
      } else {
        buf.nl(`     ▶ ${entry.progress}`)
        logSet.add(curLine())
        pkgLineMap.set(curLine(), entry.info.name)
      }
    }

    if (entry.error) {
      buf.nl(`     ✗ ${entry.error}`)
      pkgLineMap.set(curLine(), entry.info.name)
    }
  }

  private hl(line: number, hlGroup: string, colStart: number, colEnd: number) {
    this.hlLines.push({ line, hlGroup, colStart, colEnd })
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
