# Mason Parity Tasks

目标：使 coc-loader TUI 与 Mason.nvim 视觉和交互 1:1 一致。

根据 [mason-vs-coc-loader-comparison.md](./mason-vs-coc-loader-comparison.md) 整理的任务列表，按优先级分组。

---

## P0 — 核心功能缺失（用户体验关键）

### P0.1 取消安装 `<C-c>`

**文件**: `tui.ts`, `pipeline.ts`

- pipeline 层：给 `installPackage`/`updatePackage`/`uninstallPackage` 返回一个 `cancel()` 函数，终止子进程（`spawn` 的 `child.kill()`）
- `PackageEntry` 状态加 `cancelling`
- state 层：加 `cancelPackage(name)` 方法
- TUI 层：`handleKey` 注册 `<C-c>` → `cancelPackage`
- 安装中的包行显示 `(cancelling)` 灰色

### P0.2 Queued 分区

**文件**: `state.ts`, `tui.ts`, `pipeline.ts`

- pipeline 里 `runConcurrent` 维护一个等待队列，队列中的包状态设为 `queued`
- `state.ts` 的 `Status` 类型加 `queued`
- `tui.ts` 的 `renderPackageList` 加 Queued section（在 Installing 之后）
- Queued 包 icon 青色，可 `<C-c>` 取消

### P0.3 语言筛选 `<C-f>`

**文件**: `tui.ts`

- `handleKey('language-filter')` 调用 `workspace.nvim.call('coc#ui#select', ...)` 弹出语言选择器
- 选完后设 `categoryFilter` 为对应语言
- 或直接用 `vim.ui.select`（需检查 coc.nvim 是否暴露）
- Header 下方加 Language Filter 提示行（同 Mason）

### P0.4 搜索模式 `/`

**文件**: `tui.ts`

- `setupKeymaps` 中注册 `'/'` 键
- 搜索模式启动时，状态设 `searchMode = true`
- Header 显示 `(search mode, press <Esc> to clear)`
- 包行尾显示搜索匹配关键词（已有 `appendHighlightedText`）

### P0.5 过期包提示

**文件**: `tui.ts`, `state.ts`

- `checkUpdates` 执行完后，Installed 头部显示（虚拟文本）：
  ```
  Installed (15) Press U to update 3 packages (rust-analyzer, ...)
  ```
- 虚拟文本用 `nvim_buf_set_extmark` 的 `virt_text` 实现，不占 buffer 行
- 或在 Installed header 行追加文本（简单方案）

### P0.6 帮助视图丰富化

**文件**: `tui.ts`

按 Mason 风格重写帮助视图：
- 增加 per-tab 教育内容（LSP/DAP/Linter/Formatter 说明）
- 注册表信息
- Debug 指南（检查 health 等）
- 贡献引导
- 按键映射表双向展示（功能→按键 + 按键→功能）
- 可展开的设置面板（`<CR>`），显示当前 loader 配置
- `:CocCommand loader.log` 日志查看命令（等效 Mason 的 `:MasonLog`）

---

## P1 — 视觉与 UX 对齐

### P1.1 高亮组补齐

**文件**: `tui.ts`

新增：
| 组名 | 定义 |
|------|------|
| `CocLoaderHighlightBlockBold` | guibg=#56B6C2 guifg=#222222 gui=bold（当前 `CocLoaderTabActive` 无 bold） |
| `CocLoaderHighlightSecondary` | guifg=#DCA561 |
| `CocLoaderHighlightBlockBoldSecondary` | guibg=#DCA561 guifg=#222222 gui=bold |
| `CocLoaderMutedBlockBold` | guibg=#888888 guifg=#222222 gui=bold |
| `CocLoaderLink` | link CocLoaderHighlight |

修复：
- `CocLoaderWarning` → `link WarningMsg`（当前为 guifg=#DCA561）

### P1.2 VimResized 处理

**文件**: `tui.ts`

- 注册 `VimResized` autocmd
- 重新计算窗口尺寸
- 调用 `nvim_win_set_config` 更新浮动窗口大小

### P1.3 Tab 切换粘性光标

**文件**: `tui.ts`

- 切 tab 后检测光标位置
- 若光标行 > 窗口 75% 高度，自动跳回 tab 行

### P1.4 Registry 更新进度条

**文件**: `tui.ts`, `registry.ts`

- registry 更新时，在 Installed 头部用虚拟文本显示进度条
- `registry.ts` 的 `ProgressCallback` 已可传进度消息
- 格式：`Installed (15) updating registries [60% ████████        ]`

### P1.5 新版本 diagnostics

**文件**: `tui.ts`, `state.ts`

- 对有更新的包，用 `vim.diagnostic.set` 在 sign column 显示 INFO 级别的 "new version available"
- 对废弃包显示 WARN

### P1.6 latest_spawn 命令显示

**文件**: `tui.ts`, `pipeline.ts`

- pipeline 安装时，记录当前执行的 shell 命令
- 在包行尾灰色显示 `$ npm install` / `$ git clone ...`

### P1.7 aliases 显示

**文件**: `tui.ts`, `state.ts`

- `PackageInfo` 有 `aliases` 字段时，包行上 `displayName` 后灰色显示 `(alias-name)`
- 搜索时 aliases 也参与匹配

### P1.8 `syntax clear` 清语法

**文件**: `tui.ts`

- `open()` 中执行 `nvim.command('syntax clear')`，避免 Neovim 语法高亮干扰 extmark

### P1.9 `vim.schedule` 关闭防 crash

**文件**: `tui.ts`

- `close()` 用 `vim.schedule` 包装，避免 which-key 等插件导致 segfault（Mason #1102 的 workaround）

### P1.10 空 section "No packages."

**文件**: `tui.ts`

- `renderSection` 中当 `entries.length === 0` 时，不跳过而是居中显示 `No packages.` 灰色

### P1.11 backdrop=100 不创建遮罩

**文件**: `tui.ts`

- `open()` 中 backdrop 创建条件增加 `backdrop !== 100` 检查

---

## P2 — 架构改进

### P2.1 行级按键作用域

**文件**: `tui.ts`

- `handleKey` 对特定按键（如 `<C-c>`）检查当前行包状态
- 只有 installing/updating/uninstalling 状态的行才响应
- 声明式：建一个 effect → payload 映射表替换 if/else 链

### P2.2 Sticky cursor 系统

**文件**: `tui.ts`, `state.ts`

- `AppState` 加 `stickyCursor: Map<string, number>`（name → line）
- 渲染时恢复光标到 sticky 位置
- 包操作（开始安装/安装完成）时更新 sticky 位置

### P2.3 虚拟文本节点

**文件**: `renderer.ts`, `tui.ts`

- `LineBuffer` 加 `virtText(text, hl, line)` 方法
- 渲染时生成 extmark virt_text，不占用 buffer 行
- 用于进度条、过期提示等

---

## P3 — 低优先级/装饰性

### P3.1 帮助视图动画

**文件**: `tui.ts`

- Header 打字机动画逐字显示 `:help`（80ms/字）
- 可选的飞船 ASCII art + 赞助信息

### P3.2 Tab 帮助视图金色切换

**文件**: `tui.ts`

- 帮助视图打开时，tab 活跃色从青色变金色（`CocLoaderHighlightBlockBoldSecondary`）

### P3.3 可配置 UI

**文件**: 新增 `settings.ts`, `tui.ts`

- 通过 coc settings 暴露配置：`border`、`backdrop`、`width`、`height`、`icons`
- 读 `workspace.getConfiguration('loader.ui')`
- 在 `open()` 和 `render()` 中使用配置值

### P3.4 JSON Schema 浏览器

**文件**: 新增 `json-schema.ts`, `tui.ts`

- 在已装包展开详情中，如果 package 有 settings schema，显示可展开树
- 支持多层嵌套，`<CR>` 展开/折叠
- 状态独立保存在 `PackageEntry.expandedJsonSchema`

---

## 实施顺序建议

```
Phase 1 (P0):
  P0.1 取消安装 → P0.3 语言筛选 → P0.4 搜索模式 → P0.6 帮助视图

Phase 2 (P0+P1):
  P0.2 Queued → P0.5 过期提示 → P1.1 高亮组 → P1.2 VimResized

Phase 3 (P1):
  P1.3 Sticky tab → P1.4 进度条 → P1.5 Diagnostics → P1.6 命令显示

Phase 4 (P2):
  P2.1 行级作用域 → P2.2 Sticky cursor → P2.3 虚拟文本

Phase 5 (P3):
  动画 → 配置化 → JSON Schema
```
