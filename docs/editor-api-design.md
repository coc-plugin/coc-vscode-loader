# Editor API 抽象层设计

## 动机

`plugin/src/tui.ts` 中直接调用了 71 处 `workspace.nvim` API（`nvim_open_win`、`nvim_create_buf`、extmarks 等），这些全是 Neovim 专属接口。
为支持在 Vim 上运行，需要将这些调用抽象为一层 Editor API，Neovim 和 Vim 各实现一套后端。

### 最低版本 / 降级策略

| 编辑器 | 最低版本 | UI 级别 | 实现 |
|--------|---------|---------|------|
| Neovim | 0.8.0+ | 完整浮窗 | `nvim-editor.ts` |
| Vim | 9.0.0438+ | 完整浮窗 | `vim-editor.ts` |
| Vim | 8.0+ | 降级：底部拆分窗口 + 列表 | `vim-legacy-editor.ts` |

降级判断在 `editor-api.ts` 的工厂函数中自动完成：

```typescript
export function createEditor(): IEditorAPI {
  if (hasNvimFloatwin()) return new NvimEditor()
  if (hasVimPopup()) return new VimEditor()
  return new VimLegacyEditor()
}
```

## 架构

```
tui.ts / renderer.ts / state.ts          ← 纯逻辑，不直接调 nvim API
       ↓
IEditorAPI  (editor-api.ts)              ← 抽象接口
       ↓              ↓              ↓
nvim-editor.ts  vim-editor.ts  vim-legacy-editor.ts
(Neovim)       (Vim 9 popup)  (Vim 8 split)
```

### 原则

1. **tui.ts 不变** ── 只改调用方式，`workspace.nvim.call(...)` → `this.editor.call(...)`
2. **renderer.ts 不变** ── 已经通过 `LineBuffer` 抽象了文本渲染，不涉及编辑器 API
3. **state.ts 不变** ── 纯状态管理，不涉及编辑器 API
4. **nvim-editor.ts 从 tui.ts 提取** ── 不新增功能，只搬运代码

## IEditorAPI 接口定义

```typescript
// editor-api.ts

export interface FloatWinConfig {
  width: number
  height: number
  row: number
  col: number
  relative?: 'editor' | 'cursor' | 'win'
  style?: 'minimal'
  border?: 'single' | 'double' | 'rounded' | 'none'
  zindex?: number
}

export interface HighlightDef {
  name: string
  guibg?: string
  guifg?: string
  gui?: string
  link?: string
}

export interface EditorWindow {
  id: number
}

export interface EditorBuffer {
  id: number
}

export interface IEditorAPI {
  // ── 生命周期 ──
  init(): Promise<void>
  dispose(): Promise<void>

  // ── 命名空间 (extmarks / text properties) ──
  createNamespace(name: string): Promise<number>

  // ── 缓冲区 ──
  createScratchBuffer(): Promise<EditorBuffer>
  bufferSetLines(buf: EditorBuffer, lines: string[]): Promise<void>
  bufferSetOption(buf: EditorBuffer, key: string, value: any): Promise<void>
  bufferSetKeymap(buf: EditorBuffer, mode: string, lhs: string, rhs: string, opts?: { silent?: boolean; nowait?: boolean }): Promise<void>

  // ── 浮窗 ──
  openFloatWindow(buf: EditorBuffer, focus: boolean, config: FloatWinConfig): Promise<EditorWindow>
  setWindowConfig(win: EditorWindow, config: Partial<FloatWinConfig>): Promise<void>
  setWindowOption(win: EditorWindow, key: string, value: any): Promise<void>
  closeWindow(win: EditorWindow): Promise<void>

  // ── 光标 ──
  windowGetCursor(win: EditorWindow): Promise<[number, number]>

  // ── 高亮 ──
  defineHighlight(hl: HighlightDef): Promise<void>
  bufferAddHighlight(buf: EditorBuffer, ns: number, hlName: string, line: number, colStart: number, colEnd: number): Promise<void>

  // ── 全局信息 ──
  screenSize(): Promise<{ lines: number; columns: number; cmdheight: number }>

  // ── 命令/函数 ──
  executeCommand(cmd: string): Promise<void>
  callFunction(name: string, args: any[]): Promise<any>

  // ── 原始 RPC (后备) ──
  call(method: string, args: any[]): Promise<any>

  // ── 批量通知 ──
  pauseNotification(): void
  resumeNotification(): Promise<void>
}
```

## Neovim 实现

直接从 `tui.ts` 提取现有的 `workspace.nvim` 调用，封装在 `NvimEditor` 类中。

```typescript
// nvim-editor.ts

export class NvimEditor implements IEditorAPI {
  private nvim: any  // workspace.nvim

  constructor() {
    const { workspace } = require('coc.nvim')
    this.nvim = workspace.nvim
  }

  async createNamespace(name: string): Promise<number> {
    return this.nvim.createNamespace(name)
  }

  async createScratchBuffer(): Promise<EditorBuffer> {
    const buf = await this.nvim.createNewBuffer(false, true)
    return { id: buf.id }
  }

  async openFloatWindow(buf: EditorBuffer, focus: boolean, config: FloatWinConfig): Promise<EditorWindow> {
    const win = await this.nvim.openFloatWindow(
      { id: buf.id } as any,  // nvim Buffer 对象
      focus,
      {
        width: config.width,
        height: config.height,
        row: config.row,
        col: config.col,
        relative: 'editor',
        style: 'minimal',
        zindex: config.zindex ?? 44,
      },
    )
    return { id: win.id }
  }

  // ... 其余方法类似，从 tui.ts 逐行提取
}
```

### 提取对照表

| tui.ts 原写法 | nvim-editor.ts 方法 |
|--------------|-------------------|
| `nvim.createNamespace('coc-loader')` | `createNamespace('coc-loader')` |
| `nvim.createNewBuffer(false, true)` | `createScratchBuffer()` |
| `nvim.openFloatWindow(buf, false, {...})` | `openFloatWindow(buf, false, {...})` |
| `nvim.call('nvim_win_set_config', [win.id, {...}])` | `setWindowConfig(win, {...})` |
| `nvim.call('nvim_set_option_value', [key, val, { scope: 'local', win: win.id }])` | `setWindowOption(win, key, val)` |
| `nvim.call('nvim_set_option_value', [key, val, { scope: 'local', buf: buf.id }])` | `bufferSetOption(buf, key, val)` |
| `nvim.call('nvim_buf_set_lines', [buf.id, 0, -1, false, lines])` | `bufferSetLines(buf, lines)` |
| `nvim.call('nvim_win_get_cursor', [win.id])` | `windowGetCursor(win)` |
| `nvim.call('nvim_buf_add_highlight', [buf.id, ns, hl, line, colS, colE])` | `bufferAddHighlight(buf, ns, hl, line, colS, colE)` |
| `nvim.command('highlight default ...')` | `defineHighlight(...)` |
| `nvim.call('nvim_get_option', ['lines'])` | `screenSize()` |
| `nvim.command('call CocConverterDispatch(...)')` | `executeCommand(...)` |
| `nvim.call('feedkeys', [...])` | `callFunction('feedkeys', [...])` |
| `nvim.pauseNotification()` | `pauseNotification()` |
| `nvim.resumeNotification()` | `resumeNotification()` |

## Vim 实现（TODO，目标 Vim ≥ 9.0.0438）

Vim 9 的 popup window + text property API 可对标 Neovim 的 float window + extmark：

| Neovim | Vim 9 |
|--------|-------|
| `nvim_open_win` | `popup_create()` / `popup_atbottom()` |
| `nvim_win_set_config` | `popup_setoptions()` |
| `nvim_buf_set_lines` | `setline()` |
| `nvim_buf_add_highlight` | `prop_add()` + `prop_type_add()` |
| `nvim_create_namespace` | 无需 namespace，`prop_type_add()` 直接命名 |
| `nvim_set_option_value` | `setwinvar()`、`&l:options` |

Vim 版 coc.nvim 运行时尚不存在，此实现暂不开发。

## Vim Legacy 实现（降级方案，Vim 8+）

当检测到编辑器既不支持 float window 也不支持 popup window 时，降级为底部拆分窗口 + 简单列表。

### 降级 UI

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                     正常编辑器内容...                         │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ coc-loader     [i] Install  [u] Update  [X] Uninstall  [q]  │
│──────────────────────────────────────────────────────────────│
│ ◍ vscode-eslint          ← 通过 setline() 渲染，无 extmark   │
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
| 高亮 | extmark/prop 精确定位 | `matchadd()` 行级粗放高亮 |
| icon | 青色 `◍` | 纯文本 `◍`（无特殊高亮） |
| 包详情 | 内联 extmark 展开 | `:CocCommand` 弹出信息 |
| 搜索 | `/` 命令行实时过滤 | 同上 |
| 键盘 | buffer 映射 + dispatch | 同上 |
| 缩放适应 | VimResized autocmd | 手动 `:q` 或 resize |

### 实现说明

`vim-legacy-editor.ts` 的核心差异在窗口创建：

```typescript
async openFloatWindow(buf: EditorBuffer, focus: boolean, config: FloatWinConfig): Promise<EditorWindow> {
  // Vim 8: 底部拆分窗口替代浮窗
  await this.call('exe', [`botright ${Math.min(config.height + 2, 20)}split coc-loader`])
  const win = await this.call('win_getid')
  await this.call('setbufvar', [buf.id, '&buftype', 'nofile'])
  return { id: win }
}
```

其余方法（buffer 操作、光标、命令执行）大部分可复用相同的逻辑。`defineHighlight` 使用 `matchadd()` 而非 namespace extmark。

## 迁移步骤

### Step 1: 创建 `editor-api.ts`（接口定义）

纯类型文件，无运行时依赖。

### Step 2: 创建 `nvim-editor.ts`（Neovim 实现）

从 `tui.ts` 提取所有 `workspace.nvim` 调用，按方法归类。

### Step 3: 修改 `tui.ts`

- 构造时初始化 `this.editor = new NvimEditor()`
- 所有 `workspace.nvim` 调用替换为 `this.editor.*`
- 保留 `workspace.nvim` 的 import（NvimEditor 内部使用）

### Step 4: 创建 `vim-legacy-editor.ts`（Vim 8 降级实现）

底部拆分窗口 + `setline()` + `matchadd()`，供不支持浮窗的 Vim 使用。

### Step 5: 验证

- 构建通过
- TUI 功能完整（渲染、键盘、浮窗、高亮）
- 测试通过

## 未覆盖的调用

以下调用不纳入 Editor API，保持直接在 tui.ts 中调用：

| 调用 | 原因 |
|------|------|
| `nvim.command('highlight default link ...')` | 简单的命令转发，通过 `executeCommand()` 即可 |
| `nvim.call('exists', ['*Func'])` | 一次性检查，`callFunction()` 覆盖 |
| `nvim.call('win_getid')` | `callFunction()` 覆盖 |
| `nvim.call('winbufnr', [...])` | `callFunction()` 覆盖 |
| `nvim.call('getcmdline')` | `callFunction()` 覆盖 |
| `nvim.call('getbufvar', [...])` | `callFunction()` 覆盖 |
