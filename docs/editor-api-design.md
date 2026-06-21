# Editor API 抽象层设计

## 动机

`plugin/src/tui.ts` 中直接调用了 71 处 `workspace.nvim` API（`nvim_open_win`、`nvim_create_buf`、extmarks 等），这些全是 Neovim 专属接口。
为支持在 Vim 上运行，需要将这些调用抽象为一层 Editor API，Neovim 和 Vim 各实现一套后端。

## 状态

- ✅ **Phase 1 完成** — `editor-api.ts`（接口）+ `nvim-editor.ts`（Neovim 实现）+ `tui.ts` 迁移
- ⏳ **Phase 2** — Vim 9 popup 实现（`vim-editor.ts`，TODO）
- ⏳ **Phase 3** — Vim 8 降级实现（`vim-legacy-editor.ts`，TODO）

### 最低版本 / 降级策略

| 编辑器 | 最低版本 | UI 级别 | 实现 |
|--------|---------|---------|------|
| Neovim | 0.8.0+ | 完整浮窗 + extmark | `nvim-editor.ts` |
| Vim | 9.0.0438+ | popup 浮窗 + text property | `vim-editor.ts`（TODO） |
| Vim | 8.0+ | 底部拆分窗口 + setline | `vim-legacy-editor.ts`（TODO） |

## 架构

```
tui.ts / renderer.ts / state.ts          ← 纯逻辑，不直接调编辑器 API
       ↓
EditorAPI  (editor-api.ts)               ← 抽象接口
       ↓              ↓              ↓
nvim-editor.ts  vim-editor.ts  vim-legacy-editor.ts
(Neovim 0.8+)   (Vim 9 popup)   (Vim 8 split)
```

### 原则

1. **tui.ts** — 只改调用方式，`workspace.nvim.xxx()` → `this.editor.xxx()`
2. **renderer.ts** — 已经通过 `LineBuffer` 抽象了文本渲染，不涉及编辑器 API
3. **state.ts** — 纯状态管理，不涉及编辑器 API
4. **nvim-editor.ts** — 从 `tui.ts` 提取，不新增功能
5. **`workspace.registerAutocmd`** — 不纳入 Editor API，保持在 tui.ts 中直接使用

## EditorAPI 接口定义

```typescript
// editor-api.ts

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

export interface EditorWindow { id: number }
export interface EditorBuffer { id: number }

export interface EditorAPI {
  // ── 生命周期 ──
  init(): Promise<void>
  dispose(): Promise<void>

  // ── 命名空间 ──
  createNamespace(name: string): Promise<number>

  // ── 缓冲区 ──
  createScratchBuffer(): Promise<EditorBuffer>
  bufferSetLines(buf: EditorBuffer, lines: string[]): Promise<void>
  bufferClearNamespace(buf: EditorBuffer, ns: number): Promise<void>
  bufferSetExtmark(buf: EditorBuffer, ns: number, line: number, col: number,
    opts: { end_col: number; hl_group: string; hl_mode: string }): Promise<void>
  bufferSetOption(buf: EditorBuffer, key: string, value: any): Promise<void>
  bufferSetKeymap(buf: EditorBuffer, mode: string, lhs: string, rhs: string,
    opts?: { silent?: boolean; nowait?: boolean }): Promise<void>

  // ── 浮窗 ──
  openFloatWindow(buf: EditorBuffer, focus: boolean,
    config: FloatWinConfig): Promise<EditorWindow>
  setWindowConfig(win: EditorWindow, config: Partial<FloatWinConfig>): Promise<void>
  setWindowOption(win: EditorWindow, key: string, value: any): Promise<void>
  closeWindow(win: EditorWindow, force: boolean): Promise<void>

  // ── 光标 ──
  windowGetCursor(win: EditorWindow): Promise<[number, number]>
  windowSetCursor(win: EditorWindow, pos: [number, number]): Promise<void>

  // ── 高亮定义 ──
  defineHighlight(hl: HighlightDef): Promise<void>
  defineHighlightLink(hl: string, link: string): Promise<void>

  // ── 屏幕信息 ──
  screenSize(): Promise<{ lines: number; columns: number; cmdheight: number }>
  termguicolors(): Promise<number>
  normalHlBg(): Promise<number | null>

  // ── 命令 / 函数 ──
  executeCommand(cmd: string, truncate?: boolean): Promise<void>
  callFunction(name: string, args: any[]): Promise<any>

  // ── 批量通知（RPC 合并优化）──
  pauseNotification(): void
  submit(method: string, args: any[]): void
  resumeNotification(): Promise<void>

  // ── 原始 API ──
  call(method: string, args: any[]): Promise<any>
}
```

## Neovim 实现

```typescript
// nvim-editor.ts

export class NvimEditor implements EditorAPI {
  private nvim = workspace.nvim
  private buffers = new Map<number, any>()  // 保存原始 Buffer 对象

  async createScratchBuffer(): Promise<EditorBuffer> {
    const buf = await this.nvim.createNewBuffer(false, true)
    this.buffers.set(buf.id, buf)
    return { id: buf.id }
  }

  async openFloatWindow(buf: EditorBuffer, focus: boolean,
                        config: FloatWinConfig): Promise<EditorWindow> {
    const nvimBuf = this.buffers.get(buf.id) || { id: buf.id }
    const win = await this.nvim.openFloatWindow(nvimBuf, focus, {
      relative: config.relative || 'editor',
      width: config.width,
      height: config.height,
      row: config.row,
      col: config.col,
      style: 'minimal',
      border: config.border || 'none',
      focusable: config.focusable !== false,
      zindex: config.zindex ?? 44,
    })
    return { id: win.id }
  }

  submit(method: string, args: any[]): void {
    this.nvim.call(method, args, true)  // true = notification mode
  }

  // ... 其余方法皆为对应 nvim.xxx 的 1:1 封装
}
```

### 提取对照表

| tui.ts 原写法 | nvim-editor.ts 方法 |
|--------------|-------------------|
| `nvim.createNamespace('coc-loader')` | `createNamespace('coc-loader')` |
| `nvim.createNewBuffer(false, true)` | `createScratchBuffer()` |
| `nvim.openFloatWindow(buf, false, {...})` | `openFloatWindow(buf, false, {...})` |
| `nvim.call('nvim_win_set_config', [id, {...}])` | `setWindowConfig(win, {...})` |
| `nvim.call('nvim_set_option_value', [k, v, { scope:'local', win: id }])` | `setWindowOption(win, k, v)` |
| `nvim.call('nvim_set_option_value', [k, v, { scope:'local', buf: id }])` | `bufferSetOption(buf, k, v)` |
| `nvim.call('nvim_buf_set_lines', [id, 0, -1, false, lines])` | `bufferSetLines(buf, lines)` |
| `nvim.call('nvim_buf_clear_namespace', [id, ns, 0, -1])` | `bufferClearNamespace(buf, ns)` |
| `nvim.call('nvim_buf_set_extmark', [id, ns, l, c, opts])` | `bufferSetExtmark(buf, ns, l, c, opts)` |
| `nvim.call('nvim_buf_set_option', [id, k, v])` | `bufferSetOption(buf, k, v)` |
| `nvim.call('nvim_win_get_cursor', [id])` | `windowGetCursor(win)` |
| `nvim.call('nvim_win_set_cursor', [id, pos])` | `windowSetCursor(win, pos)` |
| `nvim.command('highlight default ...')` | `defineHighlight(hl)` |
| `nvim.command('highlight default link a b')` | `defineHighlightLink('a', 'b')` |
| `nvim.call('nvim_get_option', ['lines'])` | `(await screenSize()).lines` |
| `nvim.call('nvim_get_option', ['termguicolors'])` | `termguicolors()` |
| `nvim.call('nvim_get_hl', [0, { name:'Normal' }])` | `normalHlBg()` |
| `nvim.call('exists', ['*Func'])` | `callFunction('exists', ['*Func'])` |
| `nvim.call('feedkeys', [...])` | `callFunction('feedkeys', [...])` |
| `nvim.call('win_getid')` | `callFunction('win_getid', [])` |
| `nvim.call('getcmdline')` | `callFunction('getcmdline', [])` |
| `nvim.command('CocRestart', true)` | `executeCommand('CocRestart', true)` |
| `nvim.command('function!...')` | `executeCommand('function!...')` |
| `nvim.pauseNotification()` | `pauseNotification()` |
| `nvim.call(method, args, true)`（批量模式） | `submit(method, args)` |
| `nvim.resumeNotification()` | `resumeNotification()` |
| `workspace.nvim.createBuffer(id).setKeymap(...)` | `bufferSetKeymap(buf, mode, lhs, rhs)` |
| `nvim.call('nvim_win_close', [id, force])` | `closeWindow(win, force)` |

### init / dispose

`NvimEditor` 中 `init()` 和 `dispose()` 为空实现，因为 Neovim 的 `workspace.nvim` 在构造函数中即可使用，无需额外生命周期管理。保留在接口中供 Vim 后端使用。

## Vim 实现（TODO，目标 Vim ≥ 9.0.0438）

| Neovim API | Vim 9 替代 |
|-----------|-----------|
| `nvim_open_win` | `popup_create()` / `popup_atbottom()` |
| `nvim_win_set_config` | `popup_setoptions()` |
| `nvim_buf_set_lines` | `setline()` |
| `nvim_buf_set_extmark` | `prop_add()` + `prop_type_add()` |
| `nvim_create_namespace` | 无需 namespace，`prop_type_add()` 直接命名 |
| `nvim_set_option_value` | `setwinvar()`、`&l:options` |

## Vim Legacy 实现（TODO，Vim 8+ 降级）

当编辑器既不支持 float window 也不支持 popup window 时，降级为底部拆分窗口 + setline。

### 降级 UI

```
┌──────────────────────────────────────────────────────────────┐
│                     正常编辑器内容...                         │
├──────────────────────────────────────────────────────────────┤
│ coc-loader     [i] Install  [u] Update  [X] Uninstall  [q]  │
│──────────────────────────────────────────────────────────────│
│ ◍ vscode-eslint          ← 通过 setline() 渲染               │
│ ◍ vscode-volar                                            │
│ ◍ vscode-pyright                                          │
│──────────────────────────────────────────────────────────────│
│ 12 packages installed | Press i/u/X/q                       │
└──────────────────────────────────────────────────────────────┘
```

### 差异对照

| 特性 | 完整浮窗 (Nvim/Vim9) | 降级 (Vim 8) |
|------|-------------------|-------------|
| 窗口 | 居中浮窗，80%×90% | `:botright 15split` 底部窗口 |
| 遮罩 | backdrop + winblend 60% | 无 |
| 高亮 | extmark/prop 精确定位 | `matchadd()` 行级 |
| 包详情 | 内联 extmark 展开 | `:CocCommand` 弹出信息 |
| 搜索 | `/` 命令行实时过滤 | 同上 |
| 缩放适应 | VimResized autocmd | 手动 |

## 当前文件结构

```
plugin/src/
├── editor-api.ts     ← 接口定义（86 行）
├── nvim-editor.ts    ← Neovim 实现（163 行）
├── tui.ts            ← 纯逻辑，通过 this.editor 调用
├── renderer.ts       ← LineBuffer 渲染引擎（编辑器无关）
├── state.ts          ← 状态管理（编辑器无关）
├── pipeline.ts       ← 安装/更新/卸载流程（编辑器无关）
├── registry.ts       ← registry 管理（编辑器无关）
└── index.ts          ← 插件入口
```

## 未覆盖的调用

以下操作不通过 Editor API，直接在 `tui.ts` 中调用：

| 调用 | 方式 | 原因 |
|------|------|------|
| `workspace.registerAutocmd(...)` | 直接调用 | coc.nvim 事件系统，编辑器无关 |
| `cocWindow.showInformationMessage(...)` | 直接调用 | coc.nvim 通知 API |
| `cocWindow.showQuickPick(...)` | 直接调用 | coc.nvim 快速选择 API |
