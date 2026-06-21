import { workspace, window as cocWindow, Disposable } from 'coc.nvim'
import { StateManager, PackageEntry, AppState } from './state'
import { installPackage, uninstallPackage, updatePackage, checkUpdates, runConcurrent, cancelPackage } from './pipeline'
import { updateRegistry, getPackage, ProgressCallback } from './registry'
import { LineBuffer } from './renderer'

const VERSION: string = (() => {
  try {
    const pkg = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'package.json'), 'utf-8'))
    return pkg.version
  } catch { return '0.0.0' }
})()

// Per-tab educational content (Mason-style, concise)
const TAB_HELP_CONTENT: Record<string, string[]> = {
  'All': [
    'coc-loader lets VS Code extensions run in coc.nvim.',
    'Extensions are automatically converted and managed here.',
  ],
  'LSP': [
    'LSP provides language features — completions, diagnostics,',
    'go-to-definition, hover — via a standard protocol.',
    'Extensions are converted from VS Code LSP clients.',
  ],
  'Snippets': [
    'Snippets are reusable code templates that expand from',
    'a prefix. Select from the completion menu to insert.',
  ],
  'Formatter': [
    'Formatters restructure code to follow consistent style.',
    'Trigger via :CocCommand or auto-format on save.',
  ],
  'Linter': [
    'Linters analyze code for errors and style issues.',
    'Diagnostics appear inline via coc.nvim.',
  ],
  'Completion': [
    'Completion sources provide intelligent suggestions',
    'as you type — keywords, symbols, and more.',
  ],
}

const GENERIC_TAB_HELP = [
  'Packages in this category extend coc.nvim\'s',
  'capabilities. Install and restart to activate.',
]

const KEYMAP_ENTRIES: [string, string][] = [
  ['i', 'Install package'],
  ['u', 'Update package'],
  ['R', 'Reinstall package'],
  ['U', 'Update all installed'],
  ['X', 'Uninstall package'],
  ['C', 'Check for updates'],
  ['c', 'Check package version'],
  ['<C-c>', 'Cancel install / update'],
  ['s', 'Cycle sort'],
  ['<C-f>', 'Cycle language filter'],
  ['/', 'Search packages'],
  ['<CR>', 'Toggle package details / log'],
  ['1-9', 'Switch view tab'],
  ['g? / ?', 'Toggle this help'],
  ['q / <Esc>', 'Close window'],
]

const CONFIG_HOME = (() => {
  try { return require('path').join(require('os').homedir(), '.config', 'coc') }
  catch { return '~/.config/coc' }
})()

export class TUI {
  private bufnr: number = 0
  private winid: number = 0
  private ns: number = 0
  private state: StateManager
  private disposables: Disposable[] = []
  private unsubscribe: (() => void) | null = null
  private pkgLineMap: Map<number, string> = new Map()
  private windowHeight: number = 0
  private windowWidth: number = 0
  private _helpAnimChars = 0
  private _helpAnimating = false
  private _inSearchMode = false
  private backdropBufnr: number = 0
  private backdropWinid: number = 0

  constructor(state: StateManager) {
    this.state = state
  }

  async open() {
    const nvim = workspace.nvim
    this.ns = await nvim.createNamespace('coc-loader')

    // Mason-style fixed highlight groups (default=true so users can override)
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
    await nvim.command('highlight default CocLoaderHighlightBlock guibg=#56B6C2 guifg=#222222')
    await nvim.command('highlight default CocLoaderMutedBlock guibg=#888888 guifg=#222222')

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

    // Create backdrop (Mason-style dim overlay, requires termguicolors and non-transparent)
    const termguicolors = await nvim.call('nvim_get_option', ['termguicolors']) as number
    const normalHl = await nvim.call('nvim_get_hl', [0, { name: 'Normal' }]) as Record<string, any>
    const isTransparent = normalHl && normalHl.bg === null
    if (termguicolors === 1 && !isTransparent) {
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
      await nvim.call('nvim_set_option_value', ['winhighlight', 'Normal:CocLoaderBackdrop', { scope: 'local', win: backdropWin.id }])
      await nvim.call('nvim_set_option_value', ['winblend', 60, { scope: 'local', win: backdropWin.id }])
    }

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

    await nvim.call('nvim_set_option_value', ['winhighlight', 'NormalFloat:CocLoaderNormal', { scope: 'local', win: this.winid }])
    await nvim.call('nvim_set_option_value', ['modifiable', false, { scope: 'local', buf: this.bufnr }])
    await nvim.call('nvim_set_option_value', ['bufhidden', 'wipe', { scope: 'local', buf: this.bufnr }])
    await nvim.call('nvim_set_option_value', ['buftype', 'nofile', { scope: 'local', buf: this.bufnr }])
    await nvim.call('nvim_set_option_value', ['swapfile', false, { scope: 'local', buf: this.bufnr }])
    await nvim.call('nvim_set_option_value', ['undolevels', -1, { scope: 'local', buf: this.bufnr }])
    await nvim.call('nvim_set_option_value', ['filetype', 'coc-loader', { scope: 'local', buf: this.bufnr }])
    await nvim.call('nvim_set_option_value', ['cursorline', true, { scope: 'local', win: this.winid }])
    await nvim.call('nvim_set_option_value', ['number', false, { scope: 'local', win: this.winid }])
    await nvim.call('nvim_set_option_value', ['relativenumber', false, { scope: 'local', win: this.winid }])
    await nvim.call('nvim_set_option_value', ['wrap', false, { scope: 'local', win: this.winid }])
    await nvim.call('nvim_set_option_value', ['signcolumn', 'no', { scope: 'local', win: this.winid }])
    await nvim.call('nvim_set_option_value', ['spell', false, { scope: 'local', win: this.winid }])
    await nvim.call('nvim_set_option_value', ['foldenable', false, { scope: 'local', win: this.winid }])

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

    // Mason-style real-time search via CmdLine
    this.disposables.push(
      workspace.registerAutocmd({
        event: 'CmdLineChanged',
        request: true,
        callback: async () => {
          if (!this._inSearchMode) return
          const cmdline = await nvim.call('getcmdline') as string
          this.state.setSearchQuery(cmdline)
        }
      }),
      workspace.registerAutocmd({
        event: 'CmdLineLeave',
        request: true,
        callback: async () => {
          this._inSearchMode = false
          if (this.state.getState().searchQuery) {
            try { await nvim.command('nohlsearch', true) } catch {}
          }
        }
      }),
      workspace.registerAutocmd({
        event: 'VimResized',
        request: true,
        callback: async () => {
          if (!this.winid) return
          const editorLines = await nvim.call('nvim_get_option', ['lines']) as number
          const editorCols = await nvim.call('nvim_get_option', ['columns']) as number
          const cmdheight = await nvim.call('nvim_get_option', ['cmdheight']) as number
          const availLines = Math.max(1, editorLines - cmdheight)
          this.windowHeight = Math.floor(availLines * 0.9)
          this.windowWidth = Math.floor(editorCols * 0.8)
          const row = Math.max(Math.floor((availLines - this.windowHeight) / 2), 0)
          const col = Math.max(Math.floor((editorCols - this.windowWidth) / 2), 0)
          try {
            nvim.pauseNotification()
            nvim.call('nvim_win_set_config', [this.winid, { width: this.windowWidth, height: this.windowHeight, row, col }], true)
            if (this.backdropWinid) {
              nvim.call('nvim_win_set_config', [this.backdropWinid, { width: editorCols, height: editorLines }], true)
            }
            await nvim.resumeNotification()
            await this.render()
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
    updateRegistry(onProgress).then(async () => {
      this.state.setStatusMessage()
      this.state.refreshPackages()
      await this.render().catch(() => {})
      checkUpdates(this.state).catch(() => {})
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
      if (s.languageFilter) { this.state.setLanguageFilter(null); return }
      if (s.searchQuery) { this.state.setSearchQuery(''); return }
      const busyCount = s.packages.filter(p => ['installing', 'updating', 'uninstalling'].includes(p.status)).length
      if (busyCount > 0) {
        cocWindow.showWarningMessage(`${busyCount} operation(s) in progress. Use <C-c> to cancel, or wait for completion.`)
        return
      }
      await this.close(); return
    }
    if (id === 'question') { this.state.toggleHelp(); return }
    if (id === 'search') {
      if (s.showHelp) return
      this._inSearchMode = true
      await this.render()
      setTimeout(() => {
        if (this.winid) workspace.nvim.call('feedkeys', ['/', 'n']).catch(() => {})
      }, 16)
      return
    }

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

    if (id === 'language-filter') {
      const langs = this.state.getLanguages()
      if (langs.length === 0) return
      const picks = [...langs.map(l => ({ label: l })), { label: 'Clear filter' }]
      const chosen = await cocWindow.showQuickPick(picks, { placeholder: 'Select language filter' })
      if (chosen) {
        this.state.setLanguageFilter(chosen.label === 'Clear filter' ? null : chosen.label)
      }
      return
    }

    if (id === 's') { this.state.cycleSortBy(); return }
    if (id === 'C') {
      this.state.setStatusMessage('Updating registry...')
      try {
        await updateRegistry((msg) => this.state.setStatusMessage(msg))
        this.state.refreshPackages()
        this.state.setStatusMessage('Checking for updates...')
      } catch {}
      await checkUpdates(this.state)
      return
    }
    if (id === 'c') {
      const pkgName = this.pkgLineMap.get(line0)
      if (pkgName) {
        const entry = this.state.getPackage(pkgName)
        if (entry && entry.hasUpdate) {
          cocWindow.showInformationMessage(`${entry.info.displayName} has an update available`)
        } else if (entry) {
          cocWindow.showInformationMessage(`${entry.info.displayName} is up to date`)
        }
      }
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

    if (id === 'cancel') {
      if (['installing', 'updating', 'uninstalling'].includes(entry.status)) {
        cancelPackage(pkgName)
        this.state.setPackageStatus(pkgName, 'not-installed', {
          logEntry: '✗ Cancelled',
          error: '',
        })
      }
      return
    }

    if (id === 'i' && entry.status === 'not-installed') { await installPackage(this.state, pkgName); return }
    if (id === 'u' && entry.status === 'installed') { await updatePackage(this.state, pkgName); return }
    if (id === 'R' && entry.status === 'installed') { await uninstallPackage(this.state, pkgName); await installPackage(this.state, pkgName); return }
    if (id === 'X' && entry.status === 'installed') { await uninstallPackage(this.state, pkgName); return }
    if (id === 'cr') {
      if (['installing', 'updating', 'uninstalling', 'failed'].includes(entry.status)) {
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
      ['q', 'q'], ['<Esc>', 'esc'], ['?', 'question'], ['g?', 'question'],
      ['i', 'i'], ['u', 'u'], ['R', 'R'], ['U', 'U'], ['C', 'C'], ['c', 'c'], ['X', 'X'],
      ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'],
      ['6', '6'], ['7', '7'], ['8', '8'], ['9', '9'],
      ['<C-c>', 'cancel'],
      ['s', 's'],
      ['<C-f>', 'language-filter'],
      ['/', 'search'],
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

      // Save cursor line before render to restore position after
      const prevCursor = await nvim.call('nvim_win_get_cursor', [this.winid]) as [number, number]

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

      this.pkgLineMap = result.pkgLineMap

      // Restore cursor to same line (clamped to new buffer size)
      if (!state.showHelp) {
        const restoreLine = Math.min(prevCursor[0], result.lines.length)
        await nvim.call('nvim_win_set_cursor', [this.winid, [restoreLine, 0]])
      }

      // Trigger Mason-style typewriter header animation
      if (state.showHelp && !this._helpAnimating && this._helpAnimChars === 0) {
        this.animateHelpHeader().catch(() => {})
      }
      if (!state.showHelp) {
        this._helpAnimChars = 0
        this._helpAnimating = false
      }
    } finally {
      this.rendering = false
      if (this.pendingRender) await this.render()
    }
  }

  private renderHelp(): TuiRenderResult {
    const buf = new LineBuffer()
    const state = this.state.getState()
    const tab = state.categoryFilter || 'All'
    // Centered header like main interface
    const headerText = 'coc-loader help'
    const showLen = this._helpAnimChars
    const display = headerText.slice(0, showLen)
    const textLen = Buffer.from(display).length
    let pad = Math.floor((this.windowWidth - textLen) / 2) - 2
    if (pad < 2) pad = 2
    if (pad > 0) buf.append(' '.repeat(pad), undefined)
    buf.append(display, 'CocLoaderHeader')
    buf.nl()
    buf.nl()

    // Tab-specific educational content (centered)
    const edu = TAB_HELP_CONTENT[tab] || GENERIC_TAB_HELP
    for (const line of edu) {
      const lineLen = Buffer.from(line).length
      let pad = Math.floor((this.windowWidth - lineLen) / 2) - 2
      if (pad < 2) pad = 2
      buf.append(' '.repeat(pad), undefined)
      buf.append(line, 'CocLoaderMuted')
      buf.nl()
    }
    buf.nl()

    // Keymaps
    buf.append('Keymaps', 'CocLoaderHeading')
    buf.nl()
    const keyWidth = Math.max(...KEYMAP_ENTRIES.map(([k]) => k.length))
    for (const [key, action] of KEYMAP_ENTRIES) {
      buf.append('  ', undefined)
      buf.append(key + ' '.repeat(keyWidth - key.length + 2), 'CocLoaderHighlight')
      buf.append(action, undefined)
      buf.nl()
    }
    buf.nl()

    // Debugging
    buf.append('Debugging', 'CocLoaderHeading')
    buf.nl()
    const dbgKeyWidth = Math.max(':CocCommand loader.updateRegistry'.length, ':CocRestart'.length)
    for (const [cmd, desc] of [
      [':CocRestart', 'Restart after install'] as [string, string],
      [':CocCommand loader.open', 'Open this TUI'] as [string, string],
      [':CocCommand loader.updateRegistry', 'Force registry refresh'] as [string, string],
    ]) {
      buf.append('  ', undefined)
      buf.append(cmd + ' '.repeat(dbgKeyWidth - cmd.length + 2), 'CocLoaderHighlight')
      buf.append(desc, undefined)
      buf.nl()
    }
    buf.append(`  Log: ${CONFIG_HOME}/coc-vscode-loader.log`, 'CocLoaderMuted')
    buf.nl()
    buf.nl()

    // Contributing
    buf.append('Contributing', 'CocLoaderHeading')
    buf.nl()
    buf.append('  Missing a package? ', undefined)
    buf.append('github.com/coc-plugin/coc-vscode-registry', 'CocLoaderHighlight')
    buf.nl()
    buf.append('  Report issues: ', undefined)
    buf.append('github.com/coc-plugin/coc-vscode-loader/issues', 'CocLoaderHighlight')

    const result = buf.render(2)
    return { lines: result.lines, pkgLineMap: new Map(), logLines: new Set(), highlights: result.highlights }
  }

  private async animateHelpHeader() {
    this._helpAnimating = true
    const headerText = 'coc-loader help'
    for (let i = 1; i <= headerText.length && this._helpAnimating; i++) {
      await new Promise(r => setTimeout(r, 60))
      if (!this._helpAnimating || !this.winid) break
      this._helpAnimChars = i
      await this.render().catch(() => {})
    }
    this._helpAnimChars = headerText.length
    this._helpAnimating = false
  }

  private renderPackageList(state: AppState, filtered: PackageEntry[]): TuiRenderResult {
    const pkgLineMap = new Map<number, string>()
    this.pkgLineMap = pkgLineMap

    const buf = new LineBuffer()

    // Centered header + key hint
    const searchSuffix = state.searchQuery ? ' (search mode)' : ''
    const hdrLine = `coc-loader v${VERSION}${searchSuffix}`
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

    const queuedNames = state.queuedNames || []
    const failed = filtered.filter(p => p.status === 'failed' && !queuedNames.includes(p.info.name))
    const queued = filtered.filter(p => queuedNames.includes(p.info.name))
    const installing = filtered.filter(p => p.status === 'installing' && !queuedNames.includes(p.info.name))
    const updating = filtered.filter(p => p.status === 'updating' && !queuedNames.includes(p.info.name))
    const uninstalling = filtered.filter(p => p.status === 'uninstalling' && !queuedNames.includes(p.info.name))
    const installed = filtered.filter(p => p.status === 'installed' && !queuedNames.includes(p.info.name))
    const available = filtered.filter(p => p.status === 'not-installed' && !queuedNames.includes(p.info.name))

    this.renderSection(buf, pkgLineMap, 'Failed', failed)
    this.renderSection(buf, pkgLineMap, 'Installing', installing)
    this.renderSection(buf, pkgLineMap, 'Queued', queued)
    this.renderSection(buf, pkgLineMap, 'Updating', updating)
    this.renderSection(buf, pkgLineMap, 'Uninstalling', uninstalling)
    this.renderSection(buf, pkgLineMap, 'Installed', installed)
    this.renderSection(buf, pkgLineMap, 'Available', available)

    const result = buf.render(2)
    return { lines: result.lines, pkgLineMap, logLines: new Set(), highlights: result.highlights }
  }

  private renderSection(buf: LineBuffer, pkgLineMap: Map<number, string>, title: string, entries: PackageEntry[]) {
    if (entries.length === 0) return
    buf.append(`${title} `, 'CocLoaderHeading')
    buf.append(`(${entries.length})`, 'CocLoaderMuted')
    if (title === 'Installed') {
      const updatable = entries.filter(e => e.hasUpdate)
      if (updatable.length > 0) {
        buf.append('  ', undefined)
        buf.append(`Press U to update ${updatable.length} package(s)`, 'CocLoaderWarning')
      }
    }
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
    const isExpanded = ['installed', 'not-installed', 'failed'].includes(entry.status) && entry.expanded
    if (isExpanded) {
      buf.append(entry.info.displayName, 'CocLoaderHeading')
    } else {
      this.appendHighlightedText(buf, entry.info.displayName)
    }
    // Mason-style update indicator
    if (entry.hasUpdate && entry.status === 'installed') {
      buf.append(' [update]', 'CocLoaderWarning')
    }
    // Mason-style keywords in search mode
    if ((this._inSearchMode || this.state.getState().searchQuery) && entry.info.languages.length > 0) {
      buf.append(` (keywords: ${entry.info.languages.join(', ')})`, 'CocLoaderMuted')
    }
    buf.nl()

    // Mason-style installing log: tail or full log toggle
    if (['installing', 'updating', 'uninstalling', 'failed'].includes(entry.status) && entry.progressLog.length > 0) {
      if (entry.status === 'failed') {
        if (entry.logExpanded) {
          buf.append('    ▼ Displaying full log', 'CocLoaderHeading')
          buf.nl()
          for (const log of entry.progressLog) {
            const summary = log.split('\n')[0]
            buf.append('      ', undefined)
            buf.append(summary, 'CocLoaderError')
            buf.nl()
          }
        } else {
          const tail = entry.progressLog.slice(-5)
          buf.append(`    ▶ Error (${entry.progressLog.length})`, 'CocLoaderError')
          buf.nl()
          for (const log of tail) {
            const summary = log.split('\n')[0]
            buf.append('      ', undefined)
            buf.append(summary, 'CocLoaderError')
            buf.nl()
          }
        }
      } else if (entry.logExpanded) {
        buf.append('    ▼ Displaying full log', 'CocLoaderHeading')
        buf.nl()
        for (const log of entry.progressLog) {
          const summary = log.split('\n')[0]
          buf.append('      ', undefined)
          buf.append(summary, 'CocLoaderMuted')
          buf.nl()
        }
      } else {
        const last = entry.progressLog[entry.progressLog.length - 1]
        const head = last.split('\n')[0]
        buf.append(`    ▶ # ${entry.progress || head}`, 'CocLoaderMuted')
        buf.nl()
      }
    }
    if (entry.status === 'failed' && entry.error) {
      buf.append('    ', undefined)
      buf.append('✗ ' + entry.error, 'CocLoaderError')
      buf.nl()
    }

    // Mason-style inline expanded package details
    if (['installed', 'not-installed', 'failed'].includes(entry.status) && entry.expanded) {
      this.renderExpandedInfo(buf, entry)
    }

    // Map all lines of this entry (log, expanded details) to the package
    for (let l = pkgLine + 1; l <= buf.currentLine(); l++) {
      pkgLineMap.set(l, entry.info.name)
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
