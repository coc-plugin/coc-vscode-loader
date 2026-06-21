export interface FloatWinConfig {
  width: number
  height: number
  row: number
  col: number
  relative?: 'editor' | 'cursor' | 'win'
  style?: 'minimal'
  border?: 'none' | 'single' | 'double' | 'rounded'
  focusable?: boolean
  zindex?: number
}

export interface HighlightDef {
  name: string
  guibg?: string
  guifg?: string
  gui?: string
  link?: string
}

export interface HighlightRange {
  line: number
  hlGroup: string
  colStart: number
  colEnd: number
}

export interface EditorWindow {
  id: number
}

export interface EditorBuffer {
  id: number
}

export interface EditorAPI {
  init(): Promise<void>
  dispose(): Promise<void>

  // Namespace
  createNamespace(name: string): Promise<number>

  // Buffer
  createScratchBuffer(): Promise<EditorBuffer>
  bufferSetLines(buf: EditorBuffer, lines: string[]): Promise<void>
  bufferClearNamespace(buf: EditorBuffer, ns: number): Promise<void>
  bufferSetExtmark(buf: EditorBuffer, ns: number, line: number, col: number, opts: { end_col: number; hl_group: string; hl_mode: string }): Promise<void>
  bufferSetOption(buf: EditorBuffer, key: string, value: any): Promise<void>
  bufferSetKeymap(buf: EditorBuffer, mode: string, lhs: string, rhs: string, opts?: { silent?: boolean; nowait?: boolean }): Promise<void>

  // Float window
  openFloatWindow(buf: EditorBuffer, focus: boolean, config: FloatWinConfig): Promise<EditorWindow>
  setWindowConfig(win: EditorWindow, config: Partial<FloatWinConfig>): Promise<void>
  setWindowOption(win: EditorWindow, key: string, value: any): Promise<void>
  closeWindow(win: EditorWindow, force: boolean): Promise<void>

  // Cursor
  windowGetCursor(win: EditorWindow): Promise<[number, number]>
  windowSetCursor(win: EditorWindow, pos: [number, number]): Promise<void>

  // Highlight
  defineHighlight(hl: HighlightDef): Promise<void>
  defineHighlightLink(hl: string, link: string): Promise<void>

  // Screen
  screenSize(): Promise<{ lines: number; columns: number; cmdheight: number }>
  termguicolors(): Promise<number>
  normalHlBg(): Promise<number | null>

  // Command / function
  executeCommand(cmd: string, truncate?: boolean): Promise<void>
  callFunction(name: string, args: any[]): Promise<any>

  // Bulk notifications
  pauseNotification(): void
  submit(method: string, args: any[]): void
  resumeNotification(): Promise<void>

  // Raw API
  call(method: string, args: any[]): Promise<any>
}
