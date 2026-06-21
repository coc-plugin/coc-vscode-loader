import { workspace } from 'coc.nvim'
import {
  EditorAPI, EditorBuffer, EditorWindow,
  FloatWinConfig, HighlightDef,
} from './editor-api'

export class NvimEditor implements EditorAPI {
  private nvim: any
  private buffers = new Map<number, any>()

  constructor() {
    this.nvim = workspace.nvim
  }

  async init(): Promise<void> {}
  async dispose(): Promise<void> {}

  // ── Namespace ──

  async createNamespace(name: string): Promise<number> {
    return this.nvim.createNamespace(name)
  }

  // ── Buffer ──

  async createScratchBuffer(): Promise<EditorBuffer> {
    const buf = await this.nvim.createNewBuffer(false, true)
    this.buffers.set(buf.id, buf)
    return { id: buf.id }
  }

  async bufferSetLines(buf: EditorBuffer, lines: string[]): Promise<void> {
    await this.nvim.call('nvim_buf_set_lines', [buf.id, 0, -1, false, lines])
  }

  async bufferClearNamespace(buf: EditorBuffer, ns: number): Promise<void> {
    await this.nvim.call('nvim_buf_clear_namespace', [buf.id, ns, 0, -1])
  }

  async bufferSetExtmark(buf: EditorBuffer, ns: number, line: number, col: number, opts: { end_col: number; hl_group: string; hl_mode: string }): Promise<void> {
    await this.nvim.call('nvim_buf_set_extmark', [buf.id, ns, line, col, opts])
  }

  async bufferSetOption(buf: EditorBuffer, key: string, value: any): Promise<void> {
    await this.nvim.call('nvim_buf_set_option', [buf.id, key, value])
  }

  async bufferSetKeymap(buf: EditorBuffer, mode: string, lhs: string, rhs: string, opts?: { silent?: boolean; nowait?: boolean }): Promise<void> {
    const nvimBuf = this.nvim.createBuffer(buf.id)
    nvimBuf.setKeymap(mode, lhs, rhs, {
      silent: opts?.silent !== false,
      nowait: opts?.nowait !== false,
    })
  }

  // ── Float window ──

  async openFloatWindow(buf: EditorBuffer, focus: boolean, config: FloatWinConfig): Promise<EditorWindow> {
    const nvimBuf = this.buffers.get(buf.id) || { id: buf.id }
    const win = await this.nvim.openFloatWindow(
      nvimBuf,
      focus,
      {
        relative: config.relative || 'editor',
        width: config.width,
        height: config.height,
        row: config.row,
        col: config.col,
        style: 'minimal',
        border: config.border || 'none',
        focusable: config.focusable !== false,
        zindex: config.zindex ?? 44,
      },
    )
    return { id: win.id }
  }

  async setWindowConfig(win: EditorWindow, config: Partial<FloatWinConfig>): Promise<void> {
    await this.nvim.call('nvim_win_set_config', [win.id, config])
  }

  async setWindowOption(win: EditorWindow, key: string, value: any): Promise<void> {
    await this.nvim.call('nvim_set_option_value', [key, value, { scope: 'local', win: win.id }])
  }

  async closeWindow(win: EditorWindow, force: boolean): Promise<void> {
    try { await this.nvim.call('nvim_win_close', [win.id, force]) } catch {}
  }

  // ── Cursor ──

  async windowGetCursor(win: EditorWindow): Promise<[number, number]> {
    return this.nvim.call('nvim_win_get_cursor', [win.id]) as Promise<[number, number]>
  }

  async windowSetCursor(win: EditorWindow, pos: [number, number]): Promise<void> {
    await this.nvim.call('nvim_win_set_cursor', [win.id, pos])
  }

  // ── Highlight ──

  async defineHighlight(hl: HighlightDef): Promise<void> {
    let cmd = `highlight default ${hl.name}`
    if (hl.guibg) cmd += ` guibg=${hl.guibg}`
    if (hl.guifg) cmd += ` guifg=${hl.guifg}`
    if (hl.gui) cmd += ` gui=${hl.gui}`
    await this.nvim.command(cmd)
  }

  async defineHighlightLink(hl: string, link: string): Promise<void> {
    await this.nvim.command(`highlight default link ${hl} ${link}`)
  }

  // ── Screen ──

  async screenSize(): Promise<{ lines: number; columns: number; cmdheight: number }> {
    const [editorLines, editorCols, cmdheight] = await Promise.all([
      this.nvim.call('nvim_get_option', ['lines']) as Promise<number>,
      this.nvim.call('nvim_get_option', ['columns']) as Promise<number>,
      this.nvim.call('nvim_get_option', ['cmdheight']) as Promise<number>,
    ])
    return { lines: editorLines, columns: editorCols, cmdheight }
  }

  async termguicolors(): Promise<number> {
    return this.nvim.call('nvim_get_option', ['termguicolors']) as Promise<number>
  }

  async normalHlBg(): Promise<number | null> {
    const hl = await this.nvim.call('nvim_get_hl', [0, { name: 'Normal' }]) as Record<string, any> | null
    return hl?.bg ?? null
  }

  // ── Command / function ──

  async executeCommand(cmd: string, truncate?: boolean): Promise<void> {
    await this.nvim.command(cmd, truncate)
  }

  async callFunction(name: string, args: any[]): Promise<any> {
    return this.nvim.call(name, args)
  }

  // ── Bulk notifications ──

  pauseNotification(): void {
    this.nvim.pauseNotification()
  }

  submit(method: string, args: any[]): void {
    this.nvim.call(method, args, true)
  }

  resumeNotification(): Promise<void> {
    return this.nvim.resumeNotification()
  }

  // ── Raw API ──

  async call(method: string, args: any[]): Promise<any> {
    return this.nvim.call(method, args)
  }
}
