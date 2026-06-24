import { workspace } from 'coc.nvim'
import {
  EditorAPI, EditorBuffer, EditorWindow,
  FloatWinConfig, HighlightDef, BatchRenderInput,
} from './editor-api'

export class VimEditor implements EditorAPI {
  private nvim: any
  private scratchBuffers = new Set<number>()
  private mainWindowId = 0
  private _batchMode = false
  private _batchCommands: string[] = []

  constructor() {
    this.nvim = workspace.nvim
  }

  private vimlEncode(val: any): string {
    if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`
    if (typeof val === 'number') return String(val)
    if (typeof val === 'boolean') return val ? 'v:true' : 'v:false'
    if (val === null || val === undefined) return 'v:null'
    if (Array.isArray(val)) return `[${val.map(v => this.vimlEncode(v)).join(',')}]`
    if (typeof val === 'object') {
      const entries = Object.entries(val).map(([k, v]) => `${k}:${this.vimlEncode(v)}`)
      return `{${entries.join(',')}}`
    }
    return String(val)
  }

  private cmd(name: string, args: any[]): string {
    return `call ${name}(${args.map(a => this.vimlEncode(a)).join(',')})`
  }

  // Some built-in functions in Vim9 def return void when called via call_function RPC (E1031),
  // auto-degrade to nvim.command('call Func(...)').
  private async vcall(name: string, args: any[]): Promise<any> {
    if (this._batchMode) {
      this._batchCommands.push(this.cmd(name, args))
      return null
    }
    try {
      return await this.nvim.call(name, args)
    } catch (e) {
      const msg = String(e)
      if (msg.includes('E1031')) {
        await this.nvim.command(this.cmd(name, args))
        return null
      }
      if (msg.includes('E474') || msg.includes('E957') || msg.includes('E1210')) {
        return null
      }
      throw e
    }
  }

  async init(): Promise<void> {
    this.mainWindowId = await this.vcall('win_getid', [])
    // Define optimized batch render function (Vim9 if available, legacy fallback)
    const exists = await this.vcall('exists', ['*CocLoaderBatchRender']) as number
    if (exists === 0) {
      await this.nvim.command(`
        function! CocLoaderBatchRender(bufnr, lines, highlights) abort
          call setbufvar(a:bufnr, '&modifiable', 1)
          call setbufline(a:bufnr, 1, a:lines)
          call deletebufline(a:bufnr, len(a:lines) + 1, '$')
          if !empty(a:highlights)
            call prop_clear(1, len(a:lines), {'bufnr': a:bufnr})
          endif
          call setbufvar(a:bufnr, '&modifiable', 0)
          for h in a:highlights
            call prop_add(h.line + 1, h.col + 1, {'length': h.length, 'type': h.hl_group, 'bufnr': a:bufnr})
          endfor
          call timer_start(0, {-> execute('redraw', '')})
        endfunction
      `)
    }
  }

  async dispose(): Promise<void> {
    for (const bufId of this.scratchBuffers) {
      try { await this.vcall('execute', [`silent! bdelete! ${bufId}`]) } catch {}
    }
    this.scratchBuffers.clear()
    try { await this.vcall('win_gotoid', [this.mainWindowId]) } catch {}
  }

  // ── Namespace ──

  async createNamespace(_name: string): Promise<number> {
    return 1
  }

  // ── Buffer ──

  async createScratchBuffer(): Promise<EditorBuffer> {
    const bufId = await this.vcall('bufadd', ['']) as number
    await this.vcall('bufload', [bufId])
    await this.vcall('setbufvar', [bufId, '&buftype', 'nofile'])
    this.scratchBuffers.add(bufId)
    return { id: bufId }
  }

  async bufferSetLines(buf: EditorBuffer, lines: string[]): Promise<void> {
    if (this._batchMode) {
      this._batchCommands.push(`call setbufline(${buf.id}, 1, [${lines.map(l => this.vimlEncode(l)).join(',')}])`)
      return
    }
    await this.vcall('setbufline', [buf.id, 1, lines])
    const info = await this.vcall('getbufinfo', [buf.id]) as any[]
    const oldCount = info[0]?.linecount ?? 0
    if (oldCount > lines.length) {
      await this.vcall('deletebufline', [buf.id, lines.length + 1, oldCount])
    }
  }

  async bufferClearNamespace(buf: EditorBuffer, _ns: number): Promise<void> {
    if (this._batchMode) {
      this._batchCommands.push(`call deletebufline(${buf.id}, 1, '$')`)
      return
    }
    await this.vcall('deletebufline', [buf.id, 1, '$'])
  }

  async bufferSetExtmark(buf: EditorBuffer, _ns: number, line: number, col: number,
    opts: { end_col: number; hl_group: string; hl_mode: string }): Promise<void> {
    const length = opts.end_col - col
    if (length <= 0) return
    if (this._batchMode) {
      this._batchCommands.push(`call prop_add(${line + 1}, ${col + 1}, {'length':${length},'type':${this.vimlEncode(opts.hl_group)},'bufnr':${buf.id}})`)

      return
    }
    await this.vcall('prop_add', [line + 1, col + 1, {
      length,
      type: opts.hl_group,
      bufnr: buf.id,
    }])
  }

  async bufferSetOption(buf: EditorBuffer, key: string, value: any): Promise<void> {
    if (this._batchMode) {
      this._batchCommands.push(`call setbufvar(${buf.id}, ${this.vimlEncode(`&${key}`)}, ${this.vimlEncode(value)})`)
      return
    }
    await this.vcall('setbufvar', [buf.id, `&${key}`, value])
  }

  async bufferSetKeymap(buf: EditorBuffer, mode: string, lhs: string, rhs: string,
    opts?: { silent?: boolean; nowait?: boolean }): Promise<void> {
    const parts: string[] = []
    if (opts?.silent !== false) parts.push('<silent>')
    if (opts?.nowait !== false) parts.push('<nowait>')
    parts.push('<buffer>')
    parts.push(lhs)
    parts.push(rhs)
    await this.vcall('execute', [`${mode}noremap ${parts.join(' ')}`])
  }

  // ── Batched render (single RPC call, no | separator overhead) ──

  async batchRender(buf: EditorBuffer, _ns: number, input: BatchRenderInput): Promise<void> {
    const highlights = input.highlights
      .filter(h => h.colEnd > h.colStart)
      .map(h => ({
        line: h.line,
        col: h.colStart,
        length: h.colEnd - h.colStart,
        hl_group: h.hlGroup,
      }))
    await this.vcall('CocLoaderBatchRender', [buf.id, input.lines, highlights])
  }

  // ── Float window → split window ──

  async openFloatWindow(buf: EditorBuffer, _focus: boolean,
    config: FloatWinConfig): Promise<EditorWindow> {
    await this.vcall('execute', [`botright ${config.height}new`])
    const winId = await this.vcall('win_getid', []) as number
    await this.vcall('execute', [`buffer ${buf.id}`])
    return { id: winId }
  }

  async setWindowConfig(win: EditorWindow, config: Partial<FloatWinConfig>): Promise<void> {
    if (config.height === undefined) return
    const prev = await this.vcall('win_getid', []) as number
    await this.vcall('win_gotoid', [win.id])
    await this.vcall('execute', [`resize ${config.height}`])
    if (prev !== win.id) await this.vcall('win_gotoid', [prev])
  }

  async setWindowOption(win: EditorWindow, key: string, value: any): Promise<void> {
    try { await this.vcall('setwinvar', [win.id, `&${key}`, value]) } catch {}
  }

  async closeWindow(win: EditorWindow, _force: boolean): Promise<void> {
    try {
      const prev = await this.vcall('win_getid', []) as number
      if (prev !== win.id) await this.vcall('win_gotoid', [win.id])
      await this.vcall('execute', ['close!'])
      if (prev !== win.id) { try { await this.vcall('win_gotoid', [prev]) } catch {} }
    } catch {}
  }

  // ── Cursor ──

  async windowGetCursor(win: EditorWindow): Promise<[number, number]> {
    const prev = await this.vcall('win_getid', []) as number
    await this.vcall('win_gotoid', [win.id])
    const pos = await this.vcall('getcurpos', []) as number[]
    if (prev !== win.id) await this.vcall('win_gotoid', [prev])
    return [pos[1], pos[2] - 1]
  }

  async windowSetCursor(win: EditorWindow, pos: [number, number]): Promise<void> {
    const prev = await this.vcall('win_getid', []) as number
    await this.vcall('win_gotoid', [win.id])
    await this.vcall('cursor', [pos[0], pos[1] + 1])
    if (prev !== win.id) await this.vcall('win_gotoid', [prev])
  }

  // ── Highlight ──

  async defineHighlight(hl: HighlightDef): Promise<void> {
    let cmd = `highlight default ${hl.name}`
    if (hl.guibg) cmd += ` guibg=${hl.guibg}`
    if (hl.guifg) cmd += ` guifg=${hl.guifg}`
    if (hl.gui) cmd += ` gui=${hl.gui}`
    await this.nvim.command(cmd)
    const existing = await this.vcall('prop_type_get', [hl.name]) as any
    if (!existing || Object.keys(existing).length === 0) {
      try { await this.vcall('prop_type_add', [hl.name, { highlight: hl.name }]) } catch {}
    }
  }

  async defineHighlightLink(hl: string, link: string): Promise<void> {
    const targetExists = await this.vcall('hlget', [link]) as any[]
    if (targetExists.length === 0) return
    await this.nvim.command(`highlight default link ${hl} ${link}`)
    const existing = await this.vcall('prop_type_get', [hl]) as any
    if (!existing || Object.keys(existing).length === 0) {
      try { await this.vcall('prop_type_add', [hl, { highlight: hl }]) } catch {}
    }
  }

  // ── Screen ──

  async screenSize(): Promise<{ lines: number; columns: number; cmdheight: number }> {
    const [editorLines, editorCols] = await Promise.all([
      this.vcall('eval', ['&lines']) as Promise<number>,
      this.vcall('eval', ['&columns']) as Promise<number>,
    ])
    const ch = await this.vcall('eval', ['&cmdheight']) as number
    return { lines: editorLines, columns: editorCols, cmdheight: ch }
  }

  async termguicolors(): Promise<number> {
    return this.vcall('eval', ['&termguicolors']) as Promise<number>
  }

  async normalHlBg(): Promise<number | null> {
    const hl = await this.vcall('hlget', ['Normal']) as any[]
    const bg = hl[0]?.guibg ?? null
    if (!bg) return null
    return parseInt(bg.replace('#', ''), 16)
  }

  // ── Command / function ──

  async executeCommand(cmd: string, truncate?: boolean): Promise<void> {
    await this.nvim.command(cmd, truncate)
  }

  async callFunction(name: string, args: any[]): Promise<any> {
    return this.vcall(name, args)
  }

  // ── Batch notifications ──

  pauseNotification(): void {
    this._batchMode = true
    this._batchCommands = []
  }

  submit(method: string, args: any[]): void {
    this.vcall(method, args).catch(() => {})
  }

  async resumeNotification(): Promise<void> {
    this._batchMode = false
    const cmds = this._batchCommands
    this._batchCommands = []
    if (cmds.length === 0) return
    // Merge into a single execute call, greatly reducing RPC round trips
    const script = cmds.join(' | ')
    if (script.length < 32000) {
      await this.nvim.command(script)
    } else {
      // Execute overly long scripts in batches
      for (const cmd of cmds) {
        await this.nvim.command(cmd)
      }
    }
  }

  // ── Raw API ──

  async call(method: string, args: any[]): Promise<any> {
    return this.nvim.call(method, args)
  }
}
