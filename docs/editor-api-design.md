# Editor API 抽象层设计

## 动机

`plugin/src/tui.ts` 中直接调用了大量 `workspace.nvim` API（`nvim_open_win`、`nvim_buf_set_extmark`、`nvim_buf_set_lines` 等），这些全是 Neovim 专属接口。为支持在 Vim 上运行，需要将这些调用抽象为 Editor API 层，Neovim 和 Vim 各实现一套后端。

## 状态

- ✅ **Phase 1 完成** — `editor-api.ts`（接口）+ `nvim-editor.ts`（Neovim 实现）+ `tui.ts` 迁移
- ⏳ **Phase 2** — Vim 拆分窗口实现（`vim-editor.ts`）
- ❌ ~~Phase 3 — Vim 9 popup 实现~~：设计评审后废弃，参见下方 Vim popup 分析

### 最低版本

| 编辑器 | 最低版本 | UI 级别 | 实现 |
|--------|---------|---------|------|
| Neovim | 0.8.0+ | 完整浮窗 + extmark | `nvim-editor.ts` |
| Vim | 9.0+ | 底部拆分窗口 + text property | `vim-editor.ts`（TODO） |

---

## Vim popup 方案：设计评审

### 结论：废弃

Vim 9.0+ 的 `popup_create()` 与 Neovim 的 `nvim_open_win()` 有根本性差异：

| 特性 | Neovim float window | Vim popup |
|------|-------------------|-----------|
| 光标进入 | ✅ 可以 `win_gotoid()` 进入 | ❌ 不能进入，光标始终在底层窗口 |
| 按键处理 | buffer keymap 自然触发 | 只能通过 `filter` 回调拦截 |
| 光标移动 | 真实光标 j/k 导航 | 需要维护虚拟光标 |
| cursorline | 自动跟随真实光标 | 需要手动改行背景色 |
| 滚动 | 窗口自然滚动 | 需要手动重新 `popup_settext` |

交互模型完全不同，把现有 TUI 迁移到 `popup` 相当于重写整个键盘分发系统，且效果远不如 Neovim。

### 参考项目

- [octavetui.vim](https://github.com/NewComer00/octavetui.vim) — Vim 8.2+ / Neovim 双支持，全部使用 window split，无 popup
- [vim-dadbod-ui](https://github.com/kristijanhusak/vim-dadbod-ui) — Vim 数据库 TUI，使用拆分窗口
- [coc.nvim 的 CocList](https://github.com/neoclide/coc.nvim) — 底部拆分窗口，buffer-local keymap

---

## 架构

```
tui.ts / renderer.ts / state.ts          ← 纯逻辑，不直接调编辑器 API
       ↓
EditorAPI  (editor-api.ts)               ← 抽象接口
       ↓              ↓
nvim-editor.ts    vim-editor.ts
(Neovim 0.8+)     (Vim 9 split-window)
```

### 原则

1. **tui.ts** — 编辑器差异通过 `EditorAPI` 接口隔离；禁止直接调 `workspace.nvim`
2. **renderer.ts** — 已通过 `LineBuffer` 抽象文本渲染，不涉及编辑器 API
3. **state.ts** — 纯状态管理，不涉及编辑器 API
4. **`workspace.registerAutocmd`** — 不纳入 Editor API，保持在 tui.ts 中直接使用
5. **`cocWindow.show*`** — coc.nvim 通知 API，不纳入 Editor API

### 例外：必须在 tui.ts 中处理的差异

以下差异超出 `EditorAPI` 接口范围，需要 `tui.ts` 中加守卫：

| 差异 | 原因 | 处理方式 |
|------|------|---------|
| backdrop（遮罩） | Vim 无 winblend | `_supportsBackdrop` 字段守卫 |
| WinEnter 自动关闭 | Vim 无可靠 WinEnter | Vim 不做自动关闭 |
| CmdLineChanged 搜索 | Vim 无此 autocmd | 改用 `input()` 函数 |
| VimResized 窗口调整 | `nvim_win_set_config` 不适用 | 分支出 `resize` 路径 |
| `feedkeys('/', 'n')` 搜索 | Vim 的 feedkeys 可能触发底层窗口 | 改为 `input()` 弹窗 |

---

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

---

## 完整功能对照矩阵

### 生命周期：open / close

| Neovim 步骤 | Vim 对应步骤 | 差异 |
|------------|-------------|------|
| `createEditor()` → `NvimEditor` | `createEditor()` → `VimEditor` | 工厂检测 `has('nvim')` |
| `editor.createNamespace('coc-loader')` | `VimEditor.createNamespace()` 返回固定值 1 | Vim 无 namespace |
| `defineHighlight` × 14 组 | 同 Neovim + 额外创建 `prop_type_add` × 14 | prop_add 需要预注册 prop type |
| `editor.screenSize()` | 同（Vim 也用 `&lines`/`&columns`） | 无差异 |
| 计算 80%×90% 居中位置 | 计算 60% 高度底部窗口 | 布局不同 |
| backdrop 检测 + 创建 | **跳过**（`_supportsBackdrop = false`） | Vim 无 backdrop |
| 主浮窗 `nvim_open_win(zindex:45)` | `:botright Nnew` + `buffer buf.id` | 拆分窗口初始化 |
| 设 buffer 选项：modifiable/bufhidden/buftype/swapfile/undolevels/filetype | 同（`setbufvar(&...)`） | 无差异 |
| 设窗口选项：cursorline/number/relativenumber/wrap/signcolumn/spell/foldenable | 同（`setwinvar(&...)`） | 无差异 |
| 定义 `CocConverterDispatch` 函数 | 同 | VimL 兼容 |
| `setupKeymaps()` 19 个缓冲映射 | 同 | `nnoremap <buffer>` 兼容 |
| `state.subscribe()` | 同 | 纯 JS |
| `WinEnter` autocmd → 自动关闭 | **跳过**（Vim 行为不稳定） | 用户手动 `q` 关闭 |
| `CmdLineChanged` autocmd | **跳过**（Vim 无此 autocmd） | 改用 `input()` |
| `CmdLineLeave` autocmd | **跳过** | 不需要 |
| `VimResized` autocmd → 重新计算 + 更新窗口 | 同（但用 `resize` 代替 `nvim_win_set_config`） | API 不同 |
| 初始 render | 同 | 无差异 |
| 后台 fetch registry | 同 | 无差异 |

### close

| Neovim | Vim |
|--------|-----|
| state.unsubscribe | 同 |
| dispose autocmds | 同 |
| `closeWindow(backdrop)` | 跳过（无 backdrop） |
| `closeWindow(main)` | `closeWindow(main)` → 关闭拆分窗口 |
| if dirty → `CocRestart` | 同 |

### 键盘快捷键（全部 19 个）

| 键 | ID | Neovim 实现 | Vim 实现 |
|----|----|------------|---------|
| `q` | `q` | buffer keymap → `CocConverterDispatch('q')` → `handleKey('q')` → `close()` | **完全同** |
| `<Esc>` | `esc` | 同上 → 清 filter / 清 search / 警告后关闭 | **完全同** |
| `?` | `question` | 同上 → `toggleHelp()` | **完全同** |
| `g?` | `question` | 同上 | **完全同** |
| `i` | `i` | 同上 → `installPackage()` | **完全同** |
| `u` | `u` | 同上 → `updatePackage()` | **完全同** |
| `R` | `R` | 同上 → reinstall | **完全同** |
| `U` | `U` | 同上 → batch update | **完全同** |
| `X` | `X` | 同上 → `uninstallPackage()` | **完全同** |
| `C` | `C` | 同上 → check updates | **完全同** |
| `c` | `c` | 同上 → show info | **完全同** |
| `1`-`9` | `1`-`9` | 同上 → tab switch | **完全同** |
| `<C-c>` | `cancel` | 同上 → `cancelPackage()` | **完全同** |
| `s` | `s` | 同上 → `cycleSortBy()` | **完全同** |
| `<C-f>` | `language-filter` | 同上 → `showQuickPick()` QuickPick | **完全同**（QuickPick 是 coc.nvim API） |
| `/` | `search` | 同上 → `_inSearchMode = true` → `feedkeys('/', 'n')` | 改为弹出 `input('Search: ')` 对话框 |
| `<CR>` | `cr` | 同上 → `toggleLog`/`toggleExpand` | **完全同** |

### 渲染 pipeline：render()

| 步骤 | Neovim 实现 | Vim 实现 | 差异 |
|------|------------|---------|------|
| 互斥锁 | `if (rendering)` → `pendingRender = true` | 同 | 无 |
| 保存光标 | `editor.windowGetCursor(win)` | 同 → `getcurpos()` | `VimEditor` 内部转换 |
| `renderHelp()` / `renderPackageList()` | 纯逻辑 | 同 | 无 |
| 裁剪高亮 | `filter + clamp colStart/colEnd` | 同 | 无 |
| pauseNotification | `nvim.pauseNotification()` | no-op | Vim 无 atomic batch |
| `modifiable = true` | `submit('nvim_buf_set_option')` | `editor.bufferSetOption(buf, 'modifiable', true)` | 抽象化调用 |
| 清空缓冲区 | `submit('nvim_buf_clear_namespace', [bufnr, ns, 0, -1])` | `editor.bufferClearNamespace(buf, ns)` | 抽象化调用 |
| 写内容 | `submit('nvim_buf_set_lines', [bufnr, 0, -1, false, lines])` | `editor.bufferSetLines(buf, lines)` | 抽象化调用 |
| `modifiable = false` | `submit('nvim_buf_set_option')` | `editor.bufferSetOption(...)` | 抽象化调用 |
| 高亮 | `submit('nvim_buf_set_extmark', [bufnr, ns, l, c, {...}])` 循环 | `editor.bufferSetExtmark(buf, ns, l, c, opts)` 循环 | 抽象化调用 |
| resumeNotification | `await nvim.resumeNotification()` | no-op | Vim 无 atomic batch |
| 恢复光标 | `editor.windowSetCursor(win, pos)` | 同 | 无 |
| 帮助动画 | 60ms 间隔 re-render | 同 | 无 |

### VimResized

| Neovim | Vim |
|--------|-----|
| `submit('nvim_win_set_config', [winid, {width,height,row,col}])` | `setWindowConfig(win, {height: newHeight})` |
| `submit('nvim_win_set_config', [backdropWinid, {width,height}])` | 跳过（无 backdrop） |

### 搜索模式

| Neovim | Vim |
|--------|-----|
| 用户按 `/` | 用户按 `/` |
| `_inSearchMode = true` | 同 |
| `feedkeys('/', 'n')` → Vim 键入 `/` | `workspace.nvim.call('input', ['Search: ', ''])` |
| `CmdLineChanged` autocmd 实时更新搜索词 | 用户输入后按 `<CR>` → 一次性设置搜索词 |
| `CmdLineLeave` autocmd → 清除状态 + nohlsearch | 用户按 `<Esc>` 退出 input → 清除 |
| `appendHighlightedText()` 实时高亮匹配词 | 用户确认后重新 `bufferSetLines` + prop 高亮 |

### 高亮渲染差异

| 高亮特征 | Neovim extmark | Vim prop_add |
|---------|---------------|-------------|
| 精确列范围 | `nvim_buf_set_extmark(buf, ns, line, colStart, {end_col, hl_group})` | `prop_add(line+1, colStart+1, {length: colSpan, type: hl_group, bufnr: buf.id})` |
| 1-index | Neovim 0-index 行/列 | Vim 1-index 行/列 |
| `combine` 模式 | `hl_mode: 'combine'` — 叠加上层语法高亮 | **无影响** — TUI buffer 是 scratch buffer（`filetype=coc-loader`），无语法高亮层，`combine` 无意义 |
| 清理 | `nvim_buf_clear_namespace(buf, ns, 0, -1)` | `prop_clear(1, -1, {bufnr: buf.id})` — 不能按 namespace 过滤 |
| 跨行 | `end_col` 在同一行内 | `end_lnum` / `end_col` 支持跨行 |

**⚠️ 参数签名注意**：`prop_add` 是 `(lnum, col, {dict})`，不是 `(bufnr, lnum, {dict})`。
错误写法：`prop_add(buf.id, line+1, {type, length})`
正确写法：`prop_add(line+1, col+1, {type, length, bufnr: buf.id})`

`prop_clear` 同理：`prop_clear(lnum_start, lnum_end, {bufnr?})`

**渲染策略**：每次 render 先 `prop_clear(1, -1, {bufnr: buf.id})` 清除旧 props，再 `setbufline()` 写入内容，最后 `prop_add()` 添加新高亮。

**prop_type_add 重入**：TUI 可被多次 open/close（用户退出后重新 `:CocCommand loader.open`）。每次都调用 14 次 `prop_type_add` 会因"类型已存在"报错。需在 `defineHighlight` 中先检查：

```typescript
async defineHighlight(hl: HighlightDef): Promise<void> {
  // highlight 命令
  let cmd = `highlight default ${hl.name}`
  if (hl.guibg) cmd += ` guibg=${hl.guibg}`
  if (hl.guifg) cmd += ` guifg=${hl.guifg}`
  if (hl.gui) cmd += ` gui=${hl.gui}`
  await this.nvim.command(cmd)
  // prop type 仅创建一次
  const existing = await this.nvim.call('prop_type_get', [hl.name]) as any
  if (!existing || Object.keys(existing).length === 0) {
    try { await this.nvim.call('prop_type_add', [hl.name, { highlight: hl.name }]) } catch {}
  }
}
```

### backdrop 差异

| Neovim | Vim |
|--------|-----|
| 创建黑色浮窗（zindex:44）覆盖全屏 + winblend 60 | 不创建 |
| `setWindowOption(backdropWin, 'winhighlight', 'Normal:CocLoaderBackdrop')` | 不设置 |
| `setWindowOption(backdropWin, 'winblend', 60)` | 不设置 |

tui.ts 中 `open()` 方法插入守卫：

```typescript
const _isNvim = await editor.callFunction('has', ['nvim']) === 1
this._supportsBackdrop = _isNvim && tc === 1 && !isTransparent
if (this._supportsBackdrop) {
  // 现有 backdrop 代码
}
```

### 窗口关闭检测（WinEnter）

| Neovim | Vim |
|--------|-----|
| 注册 `WinEnter` autocmd → 检测 `curWin === this.winid` → 检测 buftype → 自动关闭 | **不注册 WinEnter**（Vim 的 WinEnter 行为与 Neovim 有差异，尤其是焦点在 terminal 窗口时） |
| 用户用 `<C-w>w` 切出 → TUI 自动关闭 | 用户手动按 `q` 或 `<Esc>` 关闭 |

### normalHlBg 差异

| Neovim | Vim |
|--------|-----|
| `nvim_get_hl(0, {name: 'Normal'})` | `hlget('Normal')` |
| 返回 `{bg: number}` 或 `null` | 返回 `[{bg: '#XXXXXX'}]` 或 `[]` |
| 当前实现：`hl?.bg ?? null` | Vim 需要：`hl[0]?.bg ?? null` |

### nvim_set_option_value 差异

| EditorAPI 方法 | Neovim 实现 | Vim 实现 |
|---------------|------------|---------|
| `setWindowOption(win, key, value)` | `nvim_set_option_value(key, value, {scope:'local', win: win.id})` | `setwinvar(win.id, '&'.key, value)` |
| `bufferSetOption(buf, key, value)` | `nvim_buf_set_option(buf.id, key, value)` | `setbufvar(buf.id, '&'.key, value)` |

---

## VimEditor 实现方案

### 布局设计

```
┌──────────────────────────────────────────────────────────────┐
│                        正常编辑内容...                        │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ coc-loader v1.5.1                        press g? for help  │
│                                                              │
│ (1) All  (2) LSP  (3) Snippets  (4) Formatter               │
│                                                              │
│ Installed (12)                                                │
│   ◍ vscode-eslint                          ← prop_add 高亮   │
│   ◍ vscode-volar                                             │
│                                                              │
│ Available (110)                                               │
│   ◍ vscode-pyright                                           │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ [i]nstall [u]pdate [X]uninstall [q]uit | 12 installed        │
└──────────────────────────────────────────────────────────────┘
```

- 底部拆分窗口，默认高度 = `Math.floor(availLines * 0.6)`
- 窗口选项：`cursorline=true`, `number=false`, `relativenumber=false`, `wrap=false`, `signcolumn=no`, `spell=false`, `foldenable=false`
- buffer 类型：`buftype=nofile`, `bufhidden=wipe`, `swapfile=false`, `undolevels=-1`, `filetype=coc-loader`

### VimEditor 类

```typescript
// vim-editor.ts

export class VimEditor implements EditorAPI {
  private nvim = workspace.nvim
  private scratchBuffers = new Set<number>()
  private mainWindowId = 0
  private _propTypesInitialized = false

  // ── 生命周期 ──

  async init(): Promise<void> {
    this.mainWindowId = await this.nvim.call('win_getid') as number
  }

  async dispose(): Promise<void> {
    for (const bufId of this.scratchBuffers) {
      try { await this.nvim.call('execute', [`silent! bdelete! ${bufId}`]) } catch {}
    }
    this.scratchBuffers.clear()
    try { await this.nvim.call('win_gotoid', [this.mainWindowId]) } catch {}
  }

  // ── 命名空间 ──

  async createNamespace(_name: string): Promise<number> {
    return 1  // Vim 无 namespace，固定值
  }

  // ── 缓冲区 ──

  async createScratchBuffer(): Promise<EditorBuffer> {
    const bufId = await this.nvim.call('bufadd', ['']) as number
    await this.nvim.call('bufload', [bufId])
    await this.nvim.call('setbufvar', [bufId, '&buftype', 'nofile'])
    this.scratchBuffers.add(bufId)
    return { id: bufId }
  }

  async bufferSetLines(buf: EditorBuffer, lines: string[]): Promise<void> {
    // Vim 行号 1-indexed
    await this.nvim.call('setbufline', [buf.id, 1, lines])
    // 如果新内容比旧 buffer 短，删除多余行
    const info = await this.nvim.call('getbufinfo', [buf.id]) as any[]
    const oldCount = info[0]?.line_count ?? 0
    if (oldCount > lines.length) {
      await this.nvim.call('deletebufline', [buf.id, lines.length + 1, oldCount])
    }
  }

  async bufferClearNamespace(buf: EditorBuffer, _ns: number): Promise<void> {
    // 清除所有文本和 prop。setbufline([ ]) 不保证清空，先 deletebufline
    await this.nvim.call('deletebufline', [buf.id, 1, '$'])
    // prop_clear(lnum_start, lnum_end, {bufnr}) — 不是 (bufnr, lnum, ...)
    await this.nvim.call('prop_clear', [1, -1, { bufnr: buf.id }])
  }

  async bufferSetExtmark(buf: EditorBuffer, _ns: number, line: number, col: number,
    opts: { end_col: number; hl_group: string; hl_mode: string }): Promise<void> {
    const length = opts.end_col - col
    if (length <= 0) return
    // prop_add(lnum, col, {dict}) — 注意参数顺序：行号、列号不是 bufnr
    await this.nvim.call('prop_add', [line + 1, col + 1, {
      length,
      type: opts.hl_group,
      bufnr: buf.id,
    }])
  }

  async bufferSetOption(buf: EditorBuffer, key: string, value: any): Promise<void> {
    await this.nvim.call('setbufvar', [buf.id, `&${key}`, value])
  }

  async bufferSetKeymap(buf: EditorBuffer, mode: string, lhs: string, rhs: string,
    opts?: { silent?: boolean; nowait?: boolean }): Promise<void> {
    const parts: string[] = []
    if (opts?.silent !== false) parts.push('<silent>')
    if (opts?.nowait !== false) parts.push('<nowait>')
    parts.push('<buffer>')
    parts.push(lhs)
    parts.push(rhs)
    await this.nvim.call('execute', [`${mode}noremap ${parts.join(' ')}`])
  }

  // ── 窗口 ──

  async openFloatWindow(buf: EditorBuffer, _focus: boolean,
    config: FloatWinConfig): Promise<EditorWindow> {
    // 底部创建拆分窗口
    await this.nvim.call('execute', [`botright ${config.height}new`])
    const winId = await this.nvim.call('win_getid') as number
    await this.nvim.call('execute', [`buffer ${buf.id}`])
    // Vim 无 NormalFloat，winhighlight 仅设置 CocLoaderNormal
    // (CocLoaderNormal 在 defineHighlightLink 中链接到 Normal)
    await this.nvim.call('setwinvar', [winId, '&winhighlight', 'CocLoaderNormal'])
    return { id: winId }
  }

  async setWindowConfig(win: EditorWindow, config: Partial<FloatWinConfig>): Promise<void> {
    const prev = await this.nvim.call('win_getid') as number
    await this.nvim.call('win_gotoid', [win.id])
    if (config.height !== undefined) {
      await this.nvim.call('execute', [`resize ${config.height}`])
    }
    if (prev !== win.id) await this.nvim.call('win_gotoid', [prev])
  }

  async setWindowOption(win: EditorWindow, key: string, value: any): Promise<void> {
    await this.nvim.call('setwinvar', [win.id, `&${key}`, value])
  }

  async closeWindow(win: EditorWindow, _force: boolean): Promise<void> {
    try { await this.nvim.call('execute', [`silent! ${win.id}close!`]) } catch {}
  }

  // ── 光标 ──

  async windowGetCursor(win: EditorWindow): Promise<[number, number]> {
    const prev = await this.nvim.call('win_getid') as number
    await this.nvim.call('win_gotoid', [win.id])
    const pos = await this.nvim.call('getcurpos', []) as number[]
    if (prev !== win.id) await this.nvim.call('win_gotoid', [prev])
    return [pos[1], pos[2] - 1]  // Vim 1-indexed → 0-indexed
  }

  async windowSetCursor(win: EditorWindow, pos: [number, number]): Promise<void> {
    const prev = await this.nvim.call('win_getid') as number
    await this.nvim.call('win_gotoid', [win.id])
    await this.nvim.call('cursor', [pos[0], pos[1] + 1])
    if (prev !== win.id) await this.nvim.call('win_gotoid', [prev])
  }

  // ── 高亮定义 ──

  async defineHighlight(hl: HighlightDef): Promise<void> {
    let cmd = `highlight default ${hl.name}`
    if (hl.guibg) cmd += ` guibg=${hl.guibg}`
    if (hl.guifg) cmd += ` guifg=${hl.guifg}`
    if (hl.gui) cmd += ` gui=${hl.gui}`
    await this.nvim.command(cmd)
    // prop type 仅创建一次（防止 TUI 多次 open/close）
    const existing = await this.nvim.call('prop_type_get', [hl.name]) as any
    if (!existing || Object.keys(existing).length === 0) {
      try { await this.nvim.call('prop_type_add', [hl.name, { highlight: hl.name }]) } catch {}
    }
  }

  async defineHighlightLink(hl: string, link: string): Promise<void> {
    // Vim 无 NormalFloat 等 Neovim 专有 highlight group，跳过这些 link
    // (对应组已被 highlight default 定义，直接用其颜色)
    const targetExists = await this.nvim.call('hlget', [link]) as any[]
    if (targetExists.length === 0) return
    await this.nvim.command(`highlight default link ${hl} ${link}`)
    const existing = await this.nvim.call('prop_type_get', [hl]) as any
    if (!existing || Object.keys(existing).length === 0) {
      try { await this.nvim.call('prop_type_add', [hl, { highlight: hl }]) } catch {}
    }
  }

  // ── 屏幕信息 ──

  async screenSize(): Promise<{ lines: number; columns: number; cmdheight: number }> {
    const [editorLines, editorCols, cmdheight] = await Promise.all([
      this.nvim.call('getwinvar', [0, '&lines']) as Promise<number>,
      this.nvim.call('getwinvar', [0, '&columns']) as Promise<number>,
    ])  // Vim 的 &lines/&columns 要直接从全局读取
    const ch = await this.nvim.call('get', ['&cmdheight']) as number
    return { lines: editorLines, columns: editorCols, cmdheight: ch }
  }

  async termguicolors(): Promise<number> {
    return this.nvim.call('get', ['&termguicolors']) as Promise<number>
  }

  async normalHlBg(): Promise<number | null> {
    // Vim: hlget('Normal') → [{ctermfg, ctermbg, guifg, guibg, ...}]
    const hl = await this.nvim.call('hlget', ['Normal']) as any[]
    const bg = hl[0]?.guibg ?? null
    if (!bg) return null
    // 将 '#RRGGBB' 转为数字（与 Neovim 行为一致）
    return parseInt(bg.replace('#', ''), 16)
  }

  // ── 命令 / 函数 ──

  async executeCommand(cmd: string, truncate?: boolean): Promise<void> {
    await this.nvim.command(cmd, truncate)
  }

  async callFunction(name: string, args: any[]): Promise<any> {
    return this.nvim.call(name, args)
  }

  // ── 批量通知 ──

  pauseNotification(): void { /* no-op */ }

  submit(method: string, args: any[]): void {
    // Vim 不支持 atomic batch，立即执行
    this.nvim.call(method, args, true).catch(() => {})
  }

  async resumeNotification(): Promise<void> { /* no-op */ }

  // ── 原始 API ──

  async call(method: string, args: any[]): Promise<any> {
    return this.nvim.call(method, args)
  }
}
```

---

## tui.ts 修改清单

### render() 方法（核心修改）

```typescript
// 当前代码 - 直接 submit nvim_* API
editor.pauseNotification()
editor.submit('nvim_buf_set_option', [this.bufnr, 'modifiable', true])
editor.submit('nvim_buf_clear_namespace', [this.bufnr, this.ns, 0, -1])
editor.submit('nvim_buf_set_lines', [this.bufnr, 0, -1, false, result.lines])
editor.submit('nvim_buf_set_option', [this.bufnr, 'modifiable', false])
for (const h of result.highlights) {
  editor.submit('nvim_buf_set_extmark', [this.bufnr, this.ns, h.line, h.colStart, {
    end_col: h.colEnd, hl_group: h.hlGroup, hl_mode: 'combine',
  }])
}
await editor.resumeNotification()
```

改为：

```typescript
const buf = { id: this.bufnr }
editor.pauseNotification()   // Neovim: batch start; Vim: no-op
editor.bufferSetOption(buf, 'modifiable', true)
editor.bufferClearNamespace(buf, this.ns)
editor.bufferSetLines(buf, result.lines)
editor.bufferSetOption(buf, 'modifiable', false)
for (const h of result.highlights) {
  editor.bufferSetExtmark(buf, this.ns, h.line, h.colStart, {
    end_col: h.colEnd, hl_group: h.hlGroup, hl_mode: 'combine',
  })
}
await editor.resumeNotification()  // Neovim: batch flush; Vim: no-op
```

### init/dispose 生命周期

当前 `tui.ts` 不调用 `editor.init()` 和 `editor.dispose()` —— NvimEditor 不需要。VimEditor 需要：

在 `open()` 开头添加：

```typescript
async open() {
  this.editor = await createEditor()
  await this.editor.init()   // ← 新增：VimEditor 记录 mainWindowId
  // ...
}
```

在 `close()` 中 window 关闭后添加：

```typescript
async close() {
  // ... 现有关闭窗口的代码 ...
  await this.editor.dispose()  // ← 新增：VimEditor 清理 scratch buffer + 切回主窗口
  // ...
}
```

### open() 方法

| 位置 | 修改 |
|------|------|
| `open()` 开头 | `this.editor = await createEditor()` + **新增 `await this.editor.init()`** |
| backdrop 创建 | 添加守卫：`if (this._supportsBackdrop && ...)` |
| `WinEnter` autocmd | 添加守卫：`if (!_isVim) { workspace.registerAutocmd(...) }` |
| `CmdLineChanged` + `CmdLineLeave` | 添加守卫：仅在非 Vim 时注册 |
| `VimResized` | 条件分支：`resize`（Vim）vs `nvim_win_set_config`（Neovim） |

### handleKey('search')

当前：`feedkeys('/', 'n')` → 触发 CmdLineChanged

改为 Vim 路径。注意 Vim 不需要 `nohlsearch`（TUI 的搜索高亮是 prop_add 实现的，不是 Vim 的 `/` 搜索寄存器）：

```typescript
if (id === 'search') {
  if (s.showHelp) return
  if (/* is Vim */) {
    const raw = await editor.callFunction('input', ['Search: ', '']) as string
    if (raw) {
      this.state.setSearchQuery(raw)
    } else {
      // 用户取消了输入，清搜索
      this.state.setSearchQuery('')
    }
  } else {
    // Neovim: 现有行为
    this._inSearchMode = true
    await this.render()
    setTimeout(() => {
      if (this.winid) editor.callFunction('feedkeys', ['/', 'n']).catch(() => {})
    }, 16)
  }
  return
}
```

### close() 方法

| Neovim | Vim |
|--------|-----|
| `closeWindow(backdropWin)` | 跳过 backdrop |
| `closeWindow(mainWin)` | 同 |
| **新增 `await this.editor.dispose()`** | VimEditor 清理 scratch buffer + 切回主窗口 |
| disposables dispose（autocmds） | 不包含 CmdLineChanged / CmdLineLeave（Vim 未注册） |

### TUI 类新字段

```typescript
private _supportsBackdrop = false
```

在 `open()` 中赋值（使用 `has('nvim')` 检测）。

---

## VimResized 处理

当前 tui.ts VimResized autocmd 回调：

```typescript
// Neovim:
editor.submit('nvim_win_set_config', [this.winid, { width, height, row, col }])
if (this.backdropWinid) {
  editor.submit('nvim_win_set_config', [this.backdropWinid, { width: editorCols, height: editorLines }])
}
```

改为：

```typescript
if (this._supportsBackdrop && this.backdropWinid) {
  editor.submit('nvim_win_set_config', [this.backdropWinid, { width: editorCols, height: editorLines }])
}
editor.setWindowConfig({ id: this.winid }, { height: newHeight, width: newWidth, row: 0, col: 0 })
```

`VimEditor.setWindowConfig()` 内部只关心 `height`，忽略 Neovim 的浮窗位置参数。

---

## 搜索模式对比

| 特性 | Neovim | Vim |
|------|--------|-----|
| 触发 | `/` 键 → `feedkeys('/', 'n')` | `/` 键 → `input('Search: ')` |
| 输入方式 | 命令行 `/` + 实时更新 | 弹出 `input()` 对话框 |
| 实时反馈 | `CmdLineChanged` autocmd | 无（用户按 `<CR>` 后一次性更新） |
| 清除 | `<Esc>` / `<BS>` → `CmdLineLeave` → 清除 | `input()` 返回空字符串 → 清除 |
| 搜索高亮 | `appendHighlightedText()` 实时匹配 | 重新 render + prop 高亮搜索词 |

---

## 覆盖情况核对

### ✅ 完全覆盖的功能

- 全部 19 个键盘快捷键（q, Esc, ?, g?, i, u, R, U, X, C, c, 1-9, C-c, s, C-f, /, CR）
- 全部 14 个 highlight groups 定义和 link
- 全部 buffer 生命周期（创建、写入、清理、删除）
- 全部窗口操作（打开、调整大小、设选项、关闭）
- 光标保存和恢复
- 包列表渲染（header, tabs, sections, entries, details, logs）
- 帮助视图渲染（含 typewriter 动画）
- 所有 package 操作（install, update, uninstall, reinstall, batch update, cancel）
- 状态栏提示（statusMessage, progress）
- Tab 切换（1-9）
- 语言筛选（C-f QuickPick）
- 排序切换（s）
- 更新检查（C, c）
- 窗口关闭 + dirty 时 CocRestart
- CmdLine 编辑模式下 Tab 切换（通过 `isOpen()` 守卫）

### ❌ 不支持的功能（Vim 先天限制）

| 功能 | 原因 |
|------|------|
| backdrop 遮罩 | Vim 没有 winblend, 拆分窗口不需要 |
| WinEnter 自动关闭 | Vim WinEnter 行为不稳定（terminal 焦点问题） |
| CmdLineChanged 实时搜索 | Vim 没有此 autocmd |
| CmdLineLeave hook | 配合 CmdLineChanged, 不需要 |
| 浮窗居中 | 改为底部拆分窗口 |
| extmark `hl_mode: 'combine'` 叠加 | Vim prop_add 不支持叠加 |
| `nvim_call_atomic` 批处理 | Vim 无等价物，改为直接执行 |

### 功能覆盖总表

| 功能分类 | 总数 | 覆盖 | 不覆盖 |
|---------|------|------|--------|
| 键盘交互 | 19 | 19 | 0 |
| 渲染特征 | 25 | 23 | 2（backdrop × 2） |
| 窗口生命周期 | 10 | 10 | 0 |
| 高亮定义 | 16 | 16 | 0 |
| 搜索 | 4 | 3 | 1（实时性） |
| Package 操作 | 12 | 12 | 0 |
| **总计** | **86** | **83** | **3** |

---

## VimEditor 测试

```typescript
// vim-editor.test.ts

describe('VimEditor', () => {
  it('creates scratch buffer', async () => { /* bufadd + bufload + buftype=nofile */ })
  it('sets buffer lines via setbufline', async () => { /* lines + delete excess */ })
  it('clears buffer content and props', async () => { /* deletebufline + prop_clear */ })
  it('sets extmark via prop_add', async () => { /* 1-indexed translation */ })
  it('sets buffer options via setbufvar', async () => { /* &modifiable, &buftype etc */ })
  it('sets buffer keymaps via nnoremap <buffer>', async () => { /* silent, nowait */ })
  it('opens split window at bottom', async () => { /* :botright Nnew + buffer */ })
  it('resizes split window', async () => { /* win_gotoid + resize */ })
  it('sets window-local options', async () => { /* setwinvar(&cursorline) */ })
  it('closes split window', async () => { /* silent! close! */ })
  it('gets cursor position (1→0-indexed)', async () => { /* getcurpos → [row, col-1] */ })
  it('sets cursor position (0→1-indexed)', async () => { /* cursor(row, col+1) */ })
  it('defines highlight + prop type', async () => { /* :highlight + prop_type_add */ })
  it('defines highlight link + prop type', async () => { /* :highlight link + prop_type_add */ })
  it('returns screen dimensions', async () => { /* &lines, &columns, &cmdheight */ })
  it('reads termguicolors option', async () => { /* &termguicolors */ })
  it('reads Normal background color', async () => { /* hlget('Normal') → number */ })
  it('dispose cleans scratch buffers', async () => { /* bdelete! all */ })
  it('handles submit as immediate call', async () => { /* no batching */ })
  it('resumeNotification is no-op', async () => { /* no-op */ })
})
```
