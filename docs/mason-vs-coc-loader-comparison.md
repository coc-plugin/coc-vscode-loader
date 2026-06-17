# Mason.nvim vs coc-loader TUI 详细对比

## 概述

coc-loader TUI 设计目标为 **1:1 参照 Mason.nvim 的视觉风格和交互**。本文档逐项对比两者差异，标明实现状态。

---

## 一、窗口与视觉

### 1.1 窗口属性

| 属性 | Mason | coc-loader | 状态 |
|------|-------|------------|------|
| border | `"none"` (默认，可配置) | `"none"` | ✅ 效果同但不可配置 |
| 宽度 | `0.8 * columns` (float，支持整数固定值) | `floor(cols * 0.8)` | ✅ 等效 |
| 高度 | `0.9 * (lines-cmdheight)` (float) | `floor(availLines * 0.9)` | ✅ 等效 |
| zindex | 45 | 45 | ✅ |
| backdrop zindex | 44 | 44 | ✅ |
| backdrop blend | 60 (可配置 `ui.backdrop` 0-100) | 60 (写死) | △ 值一致但不可配置 |
| backdrop 条件 | `termguicolors + !transparent + backdrop≠100` | `termguicolors + !transparent` (缺 ≠100 检查) | ❌ 缺 backdrop=100 禁遮罩 |
| winhighlight | `NormalFloat:MasonNormal` | `NormalFloat:CocLoaderNormal` | ✅ 等效 |
| filetype | `mason` | `coc-loader` | ✅ 等效 |
| cursorline | 是 | 是 | ✅ |
| 行号/相对行号 | 否 | 否 | ✅ |
| signcolumn | 否 | 否 | ✅ |
| wrap/fold/spell | 否 | 否 | ✅ |
| border 可配置 | 是 — `settings.current.ui.border` | 否 | ❌ coc 写死 `"none"` |
| backdrop blend 可配置 | 是 — `settings.current.ui.backdrop` (0-100) | 否 (60 写死) | ❌ |
| 窗口大小可配置 | 是 — `ui.width`/`ui.height` | 否 | ❌ |
| icon 可配置 | 是 — `ui.icons.*` | 否 (写死 `◍`) | ❌ |

### 1.2 Backdrop

Mason 的 backdrop blend 默认 60 且可通过 `settings.ui.backdrop` 配置。coc-loader 写死 60，不可配置。
同时 Mason 在 `backdrop=100`（完全透明）时不创建 backdrop 窗口，coc-loader 无此边界检查。

### 1.3 VimResized 处理

| | Mason | coc-loader |
|--|-------|------------|
| 终端大小变化 | 有 — `VimResized` autocmd 重新渲染并更新窗口配置 | ❌ 无 |
| 行为 | 重新 `draw()` + `nvim_win_set_config` 调整大小 | 不做处理，窗口大小固定 |

### 1.4 WinEnter/WinLeave 自动关闭

| | Mason | coc-loader |
|--|-------|------------|
| 其他窗口获取焦点 | 有 — `WinEnter` autocmd 检测 buftype，非 prompt/nofile/help/terminal/quickfix 时自动关闭 | ✅ 同样实现 |
| 行为一致 | 是 | ✅ |

---

## 二、颜色与高亮

### 2.1 Mason 完整高亮组 vs coc-loader

```lua
-- Mason 的颜色定义 (colors.lua)
MasonBackdrop               = { bg = "#000000" }
MasonNormal                 = { link = "NormalFloat" }
MasonHeader                 = { bold = true, fg = "#222222", bg = "#DCA561" }
MasonHeaderSecondary        = { bold = true, fg = "#222222", bg = "#56B6C2" }
MasonHighlight              = { fg = "#56B6C2" }
MasonHighlightBlock         = { bg = "#56B6C2", fg = "#222222" }
MasonHighlightBlockBold     = { bg = "#56B6C2", fg = "#222222", bold = true }
MasonHighlightSecondary     = { fg = "#DCA561" }            -- 金色高亮
MasonHighlightBlockSecondary    = { bg = "#DCA561", fg = "#222222" }
MasonHighlightBlockBoldSecondary = { bg = "#DCA561", fg = "#222222", bold = true }
MasonLink                   = { link = "MasonHighlight" }
MasonMuted                  = { fg = "#888888" }
MasonMutedBlock             = { bg = "#888888", fg = "#222222" }
MasonMutedBlockBold         = { bg = "#888888", fg = "#222222", bold = true }
MasonError                  = { link = "ErrorMsg" }
MasonWarning                = { link = "WarningMsg" }
MasonHeading                = { bold = true }
```

| Mason 组 | coc-loader 对应 | 状态 |
|----------|----------------|------|
| `MasonBackdrop` | `CocLoaderBackdrop` guibg=#000000 | ✅ |
| `MasonNormal` | `CocLoaderNormal` link NormalFloat | ✅ |
| `MasonHeader` | `CocLoaderHeader` guibg=#DCA561 guifg=#222222 gui=bold | ✅ |
| `MasonHeaderSecondary` | `CocLoaderHeaderSec` guibg=#56B6C2 guifg=#222222 gui=bold | ✅ |
| `MasonHighlight` | `CocLoaderHighlight` guifg=#56B6C2 | ✅ |
| `MasonHighlightBlock` | `CocLoaderHighlightBlock` guibg=#56B6C2 guifg=#222222 | ✅ |
| `MasonHighlightBlockBold` | 无 (`CocLoaderTabActive` 代替) | △ 功能等效但无通用组 |
| `MasonHighlightSecondary` | ❌ 无 (金色 fg 用 `CocLoaderWarning` 替代，语义不对) | ❌ |
| `MasonHighlightBlockSecondary` | ❌ 无 | ❌ |
| `MasonHighlightBlockBoldSecondary` | ❌ 无 (金色背景粗体块) | ❌ |
| `MasonLink` | ❌ 无 (link 到 CocLoaderHighlight) | ❌ |
| `MasonMuted` | `CocLoaderMuted` guifg=#888888 | ✅ |
| `MasonMutedBlock` | `CocLoaderMutedBlock` guibg=#888888 guifg=#222222 | ✅ |
| `MasonMutedBlockBold` | ❌ 无 | ❌ |
| `MasonError` | `CocLoaderError` link ErrorMsg | ✅ |
| `MasonWarning` | `CocLoaderWarning` **guifg=#DCA561** | ❌ **应为 link WarningMsg** |
| `MasonHeading` | `CocLoaderHeading` gui=bold | ✅ |
| — (无) | `CocLoaderSearchMatch` link Search | △ coc 特有 |
| — (无) | `CocLoaderHighlightBlock` 不带 bold | △ coc 特有 |

### 2.2 coc-loader 缺失的高亮组

| 缺失组 | 用途 | Mason 中的使用位置 |
|--------|------|-------------------|
| `MasonHighlightSecondary` (fg=#DCA561) | 帮助视图中金色强调文本 | `p.highlight_secondary()` in help views |
| `MasonHighlightBlockSecondary` | 块 | 未直接使用? 但 palette 定义了 |
| `MasonHighlightBlockBoldSecondary` | 帮助视图时 tab 块用金色 | `use_secondary_highlight` in `tabs.lua` |
| `MasonMutedBlockBold` | 粗体灰色块 | 用于 info.registry 进度百分比 |
| `MasonLink` | link 到 MasonHighlight | 通用 |

### 2.3 `CocLoaderWarning` 色值偏差

- Mason: `MasonWarning` = `link WarningMsg`（继承主题的 WarningMsg 色）
- coc-loader: `CocLoaderWarning` = `guifg=#DCA561`（硬编码金色，与 WarningMsg 无关）

这意味着 coc-loader 的 warning 颜色与主题 WarningMsg 解耦，始终显示金色。这是一个有意或无意的不一致。

---

## 三、布局结构

### 3.1 Mason 页面结构

```
Mason:
  ┌─ Header ──────────────────────────────┐  ← 金色背景，居中
  │     mason.nvim v2.3.1                  │
  │     press g? for help                  │
  ├─ Language Filter bar ─────────────────┤
  │     Language Filter: press <C-f> ...   │
  ├─ Tabs ────────────────────────────────┤
  │     (1) All  (2) LSP  (3) DAP ...     │
  ├─ Main ────────────────────────────────┤
  │   Failed (1)                           │
  │     ◍ vscode-eslint                    │
  │   Installing (2)                        │
  │     ◍ rust-analyzer                     │
  │       ▶ # [5/24] some output           │
  │   Queued (1) ← 独特                    │
  │     ◍ stylua                           │
  │   Installed (15)                       │
  │     ◍ lua-language-server [new v...]   │  ← 有新版提示
  │   Available (106)                      │
  │     ◍ vscode-javascript-snippets       │
  └───────────────────────────────────────┘
```

### 3.2 coc-loader 页面结构

```
coc-loader:
  ┌─ Header ──────────────────────────────┐
  │     coc-loader v1.5.x                  │
  │     press g? for help                  │
  ├─ Tabs ────────────────────────────────┤
  │     (1) All  (2) LSP  (3) Snippets     │
  ├─ Main ────────────────────────────────┤
  │   Failed (1)                           │
  │     ◍ vscode-eslint                    │
  │   Installing (2)                        │
  │     ◍ rust-analyzer                     │
  │       ▶ # [5/24] some output           │
  │   Queued (1)                            │
  │     ◍ stylua                           │
  │   Installed (15)                       │
  │     ◍ lua-language-server              │
  │   Available (106)                      │
  │     ◍ vscode-javascript-snippets       │
  └───────────────────────────────────────┘
```

### 3.3 布局差异

| 功能 | Mason | coc-loader | 状态 |
|------|-------|------------|------|
| Header 金色居中 + version | ✅ | ✅ | ✅ |
| Header 居中 `g?` 提示 | ✅ | ✅ | ✅ |
| Language Filter 提示行 | ✅ 显示当前语言过滤或提示 | ❌ 无此组件 | ❌ |
| Tabs 栏 | ✅ `(N) Name` 格式，5个固定：All, LSP, DAP, Linter, Formatter | ✅ `(N) Name` 格式，前6个 categories + All | △ 不同（Mason 固定，coc 动态） |
| **Queued 分区** | ✅ 有 "Queued" 区，显示等待并发槽的包 | ✅ 有 "Queued" 区 | ✅ |
| Registry 更新进度 | ✅ 在 Installed 头部显示进度条 "updating registry 60%" | ❌ 只有 statusMessage 文字提示 | ❌ |
| 过期包数量提示 | ✅ Installed 头部显示 "Press U to update 3 packages (rust-analyzer, ...)" | ❌ 只有 statusMessage | ❌ |
| Section 顺序 | Failed → **Installing → Queued** → Installed → Available | Failed → **Installing → Queued** → Updating → Uninstalling → Installed → Available | ✅ (顺序一致，coc 额外有 Updating/Uninstalling 区) |

---

## 四、Tabs (视图切换)

### 4.1 Tab 内容

| | Mason | coc-loader |
|--|-------|------------|
| 固定 tabs | All, LSP, DAP, Linter, Formatter (5个硬编码) | All + 前6个 categories (动态) |
| 切换键 | 1-5 (数字键) | 1-9 (数字键) |
| Tab 格式 | `(N) Name` 青色块(活跃) / 灰色块(非活跃) | 同 Mason |
| 活跃 tab 视效 | `MasonHighlightBlockBold` (青色背景) | `CocLoaderTabActive` (青色背景) | ✅ |
| 非活跃 tab 视效 | `MasonMutedBlock` (灰色背景) | `CocLoaderTabInactive` (灰色背景) | ✅ |

### 4.2 Tab 差异

- Mason tabs **固定 5 个**（All, LSP, DAP, Linter, Formatter）；coc-loader 根据 registry categories 动态生成（All + 最多 6 个）
- 帮助视图时，Mason tabs 激活色从**青色**变为**金色**（`MasonHighlightBlockBoldSecondary`），coc-loader 不改变
- Tab 切换时：若光标在窗口 >75% 位置，Mason 自动 `set_sticky_cursor("tabs")` 跳回 tab 行；coc-loader 不做任何处理

---

## 五、包条目渲染

### 5.1 基本行

```
  ◍ displayName
```

| 属性 | Mason | coc-loader | 状态 |
|------|-------|------------|------|
| 缩进 | 4sp + icon + name | 同 Mason | ✅ |
| icon 值 | 可配置 (默认 `◍`) | `◍` | ✅ |
| icon 颜色 | 已装=青色，安装中=青色，未装=灰色，失败=红色 | 同 Mason | ✅ |
| name 粗体 | 展开/状态转换时 `p.Bold` | 展开时 `CocLoaderHeading` | ✅ |
| deprecated 标记 | `deprecated` 黄色警告标注 | ❌ 无 | ❌ |
| aliases 显示 | `(alias-name)` 灰色 | ❌ 无 | ❌ |
| 搜索模式关键词 | `(keywords: ...)` 灰色显示包搜索关键词 | ❌ 无 | ❌ |
| 新版诊断 | `[new version available: ...]` diagnostics | ❌ 无 | ❌ |
| firewall 标记 | `(firewall active)` 青色 | ❌ 无 (无此概念) | ❌ |

### 5.2 安装中/更新中

```
  ◍ displayName $ npm install        ← Mason 有 latest_spawn 命令显示
    ▶ # [5/24] some log line         ← Mason 用 short_tailed_output
    ▼ Displaying full log            ← 切换后完整输出
      line 1
      line 2
```

| 属性 | Mason | coc-loader | 状态 |
|------|-------|------------|------|
| `▶ # [N/N] msg` tail | ✅ short_tailed_output | ✅ progress + lastLog 行 | ✅ |
| `▼ Displaying full log` | ✅ Bold 标题 | ✅ CocLoaderHeading | ✅ |
| 展开完整日志 | ✅ 每行 `p.muted` 灰色，缩进 12sp | ✅ 每行 `CocLoaderMuted`，缩进 8sp | ✅ |
| `<CR>` 切换 tail/full | ✅ | ✅ | ✅ |
| 日志行限制 | 无（全部保留） | 有 500 行上限 | ✅ |
| latest_spawn 命令显示 | ✅ `$ npm install` 灰色在行尾 | ❌ 无 | ❌ |
| 终止状态显示 | ✅ `(cancelling)` 灰色 | ❌ 无 | ❌ |
| 失败状态 | Mason 在 Installing 区复用 InstallingPackageComponent，显示红色 icon | coc-loader 移到 Failed 区重新渲染 | △ |

### 5.3 Queued 包

| 属性 | Mason | coc-loader |
|------|-------|------------|
| 存在 | ✅ Queued 分区，青色 icon + name | ✅ Queued 分区，青色 icon + name |
| 取消 | ✅ `<C-c>` 取消 | ✅ `<C-c>` 取消 |
| 行为 | 等待并发槽的包显示于此，安装开始后移入 Installing | 同 Mason |

### 5.4 LSP Settings Schema 浏览器 (❌ coc-loader 缺失)

Mason 在已装包的展开详情中，如果该 LSP server 有配置 schema，会显示一行：

```
  ↓ LSP server configuration schema (press enter to collapse)
      description: ...
      type: String
      default: ...
```

这是一个**交互式树状查看器**，支持多层嵌套展开/折叠：
- Object nodes: `→ key` (折叠) / `↓ key` (展开)
- Leaf nodes: 显示 description、type（语法高亮 String/Boolean/Number）、default 值、enum 值及描述
- 使用 `INDENT` 层叠样式缩进，根级别 object 始终展开
- 每个包的展开状态独立保存在 `state.packages.states[pkg.name].expanded_json_schemas` 和 `expanded_json_schema_keys` 中
- 触发键: `<CR>`（与展开详情同一按键）

实现文件：`json-schema.lua`（约 183 行）。

### 5.5 展开详情

```
  ◍ displayName (bold)
    description line 1               ← p.Comment 灰色
    description line 2

    installed version   1.2.3         ← p.muted + p.Bold
    purl                pkg:github...
    homepage            https://...
    languages           lua
    categories          LSP
    executables         stylua        ← Mason 显示链接的二进制
```

| 属性 | Mason | coc-loader | 状态 |
|------|-------|------------|------|
| 描述 | ✅ `p.Comment` 灰色多行 | ✅ `CocLoaderMuted` 灰色多行 | ✅ |
| 属性表格 | ✅ 自动列宽对齐 | ✅ 固定列宽 | ✅ |
| version 行 | 显示 `installed version` 或版本（已装）/ `version` + 最新（未装） | 显示 commit hash | △ 不同（Mason 显示 semver，coc 显示 git commit） |
| latest version 行 | 有新版本时额外 `latest version` 行 | ❌ 无 | ❌ |
| purl 行 | ✅ 显示 `purl: pkg:github/...` (青色) | ❌ 无 purl 概念 | ❌ |
| homepage | ✅ | ✅ | ✅ |
| languages | ✅ (`p.Bold` 粗体) | ✅ (`CocLoaderHeading` 粗体) | ✅ |
| categories | ✅ | ✅ | ✅ |
| executables 表 | ✅ 显示链接的可执行文件 | ❌ 无（coc 插件无此概念） | ❌ |
| deprecation 消息 | ✅ 未装包有 `deprecation:` 黄色警告 | ❌ 无 | ❌ |
| LSP settings schema | ✅ 可展开 JSON schema | ❌ 无 | ❌ |

---

## 六、按键映射

### 6.1 按键对照表

| 按键 | Mason 效果 | coc-loader 效果 | 状态 |
|------|-----------|----------------|------|
| `1`-`5` (Mason) / `1`-`9` (coc) | 切换 tab | 切换 tab | ✅ |
| `i` | 安装光标所在包 | 安装光标所在包 | ✅ |
| `u` | 更新/重装光标所在包 | 更新光标所在包 | ✅ |
| `U` | 更新所有过期包 | 更新所有已安装包 | ✅ (差异见下) |
| `C` | 检查所有包的新版本 | 刷新 registry + 检查所有更新 | ✅ |
| `c` | 检查单包的新版本 | 更新信息弹出 | ✅ |
| `X` | 卸载 | 卸载 | ✅ |
| `<CR>` | 展开/收起详情或日志 | 展开/收起详情或日志 | ✅ |
| `g?` | 切换帮助视图 | 切换帮助视图 | ✅ |
| `q` | 关闭窗口 | 关闭窗口 | ✅ |
| `<Esc>` | 关闭/取消搜索/清除语言过滤/关闭窗口 | 逐级取消(帮助→搜索→过滤→关闭) | ✅ |
| `<C-c>` | **取消安装** | ✅ 有 (cancelPackage) | ✅ |
| `<C-f>` | **打开语言选择器 (`vim.ui.select`)** | ✅ 有 | ✅ |
| `/` | **进入搜索模式** (neovim 原生) | ✅ 实现搜索过滤 + 文本高亮 | ✅ |

### 6.2 按键作用域

| 属性 | Mason | coc-loader | 状态 |
|------|-------|------------|------|
| 全局按键 | ✅ 对 buffer 内所有行生效 | ✅ 所有注册的按键 | ✅ |
| 行级按键 | ✅ 只对特定行生效（如 `<C-c>` 只在 installing 包行生效） | ❌ 所有按键全局 | ❌ |
| 效果分发 | effect → payload 模式，按 effect 名查找 handler | if/else 硬编码链 | ❌ |
| 可配置性 | 所有 keymaps 可通过 `settings.current.ui.keymaps` 重映射 | 写死 | ❌ |

Mason 的按键有**作用域**概念：一个 keybind 节点可以声明只对特定行生效（如 `<C-c>` cancel 只出现在正在安装的包行上），也可以声明为全局（如 `q` 关闭窗口）。coc-loader 的 `handleKey()` 对所有按键全局响应，没有行级约束。

### 6.3 coc-loader 特有按键（Mason 没有）

| 按键 | 效果 |
|------|------|
| `f` | 循环切换 viewFilter (all → installed → not-installed) |
| `s` | 循环切换排序 (default → name → status → type) |
| `Z` | 卸载所有已安装包 |
| `D` | 清理孤儿包 |
| `x` | 标记/取消标记包 |
| `R` | 重装包 (卸载后安装) |
| `gg` / `G` | 虚拟滚动首/尾行(Neovim 原生支持) |

---

## 七、功能差异详细说明

### 7.1 Queued 分区 (✅ coc-loader 已实现)

Mason 在 `max_concurrent_installers = 4` 的限制下，超出并发数的安装请求会进入 Queued。
用户可以在 Queued 区看到等待中的包，并可以用 `<C-c>` 取消。

coc-loader 的 `runConcurrent()` 同样限制并发数为 3（可通过参数调整），超出部分显示在 Queued 区，安装开始后自动移入 Installing。

### 7.2 取消安装 (❌ coc-loader 缺失)

Mason 支持 `<C-c>` 取消正在安装或队列中的包。内部通过 `InstallHandle:terminate()` 终止子进程。

coc-loader 的 handler 不检测也不支持取消。正在运行的 `git clone` / `npm install` / `npx tsx` 无法通过 UI 中断。

### 7.3 语言筛选 (△ coc-loader 只有 stub)

Mason 的 `<C-f>` 调用 `vim.ui.select()` 弹出语言选择器，选中后页面只显示该语言的包，且 Header 下方会多一行 `Language Filter: <lang> press <Esc> to clear`。

coc-loader 的 `handleKey('language-filter')` 仅显示 "not yet implemented"。

### 7.4 搜索模式 (❌ coc-loader 缺失)

Mason 利用 Neovim 原生的 `/` 搜索命令 (`CmdLineEnter`/`CmdLineLeave` autocmd)，进入搜索模式后：
- 包行尾显示 `(keywords: ...)` 灰色关键词
- `<Esc>` 清除搜索
- Header 显示 `(search mode, press <Esc> to clear)`

coc-loader 有 `/` 搜索实现（`setSearchQuery` + `appendHighlightedText`），但也只做到了文本高亮，没有搜索模式的 UI 变化（搜索关键词提示等）。实际上这已经可以工作，因为没有像 Mason 那样显式的 "search mode" 状态变化。

实际上更仔细看，coc-loader 确实有搜索功能：
- tui.ts setupKeymaps 里没有注册 `/` 键
- 但 state.ts 有 `setSearchQuery` 和 `getFilteredPackages` 搜索过滤逻辑
- 搜索功能的入口似乎缺失

所以: 搜索过滤逻辑存在，但没有在 TUI 中注册 `/` 键，无法触发。

### 7.5 空 section "No packages." (❌ coc-loader 缺失)

Mason 在每个空 section 显示 `No packages.` 居中灰色文字。coc-loader 直接跳过空 section（`if (entries.length === 0) return`），不显示任何提示。

### 7.6 虚拟文本 (❌ coc-loader 缺失)

Mason 使用 `VIRTUAL_TEXT` 节点（通过 `nvim_buf_set_extmark` 的 `virt_text` 实现）在不占用 buffer 行的情况下显示附加信息。用于：
- Registry 更新进度条（Installed 头部）
- 过期包预览（Installed 头部）

coc-loader 把所有文本写入实际 buffer 行，占用滚动空间。

### 7.7 Sticky Cursor (❌ coc-loader 无此概念)

Mason 的 `StickyCursor` 是核心 UX 特性之一：
- 在渲染树中声明 `StickyCursor { id = "tabs" }`，渲染时记录该行号
- 切 tab 后，如果光标位置超过窗口 75%，自动 `set_sticky_cursor("tabs")` 将光标移回 tab 行
- 其他 sticky 标记：每个包有自己的 `{name}-installed`、`{name}-uninstalled`、`{name}-installing`
- 渲染更新后自动恢复光标到正确位置

coc-loader 的 `render()` 只是简单地把光标钳位到 `Math.min(prevCursor[0], result.lines.length)`，不会跨渲染持久化记忆光标应停在哪一行。

### 7.8 Registry 更新进度 (❌ coc-loader 缺失)

Mason 在 Installed 头部动态显示（使用虚拟文本，不占用 buffer 行）：
```
Installed (15) updating registries [60% ████████        ]
```

coc-loader 只在 statusMessage 中显示 "Fetching registry..." / "Updating registry..."，完成后自动消失。

### 7.9 过期包提示 (❌ coc-loader 缺失)

Mason 的 `check_new_package_versions()` 在 registry 更新后**自动执行**（受 `check_outdated_packages_on_open = true` 控制），Installed 头部显示（虚拟文本）：
```
Installed (15) Press U to update 3 packages (rust-analyzer, lua-language-server, ...)
```

coc-loader 的 `checkUpdates()` 需要用户按 `C` 才手动触发，结果显示在 statusMessage 中短暂显示（3-5秒后消失）。

### 7.10 新版本诊断 (❌ coc-loader 缺失)

Mason 在包行上显示 diagnostics（Neovim diagnostic API）：
- **INFO**: `new version available: 1.2.3 → 2.0.0`（sign column 中显示）
- **WARN**: `deprecated: xxx`（已装废弃包）

coc-loader 的 `hasUpdate` 只存储在状态中，在 `<CR>` 展开详情和 `c` 按键时才查看，没有视觉提示。

### 7.13 Help 视图内容 (❌ coc-loader 相差甚远)

#### Mason 帮助视图

Mason 的帮助视图非常丰富，按当前 tab 显示不同内容：

**按 tab 分类的教育内容：**
- `All` tab: 无额外教育内容
- `LSP` tab: 解释什么是 LSP 协议
- `DAP` tab: 解释什么是 DAP 协议
- `Linter` tab: 解释什么是 Linter
- `Formatter` tab: 解释什么是 Formatter

**通用帮助内容：**
- Mason log 文件路径
- 注册表列表
- 键盘快捷键表（双向：功能→按键）
- Debugging 指南（`:help mason-debugging`、`:checkhealth mason`）
- "如何使用已装包" 指南
- "缺包？" 引导（贡献链接）
- 可展开的当前设置面板 (`<CR>` 切换)

**动画：**
- Header 打字机动画逐字显示 `:help`（80ms/字）
- Retro 飞船 ASCII art + 波浪线（动画移动）+ 赞助信息

#### coc-loader 帮助视图

```
  coc-loader v1.5.x
  press ? help | q quit
  ──────────────────────────────────────────────────

  coc-loader v1.5.1 — VS Code extension loader for coc.nvim

  Keymaps:
    1-9        Switch view tab
    i          Install package under cursor
    u          Update package under cursor
    U          Update all installed packages
    C          Check for updates
    X          Uninstall package under cursor
    <CR>       Toggle package details
    g? / ?     Toggle this help
    q / <Esc>  Close window
    c          Check package version

  ──────────────────────────────────────────────────

  View tabs:
    All        All packages
    <category> Filter by category

  q to return
```

只有按键映射表，**无**教育内容、注册表信息、debug 指南、设置面板、动画等。

### 7.12 Header 动画 (❌ coc-loader 缺失)

Mason 打开帮助视图时有打字机动画：
- Header 从空开始逐字显示 `:help`（80ms/字）
- 底部有飞船赞助动画（`ship_animation`，每 250ms 移动，35 步）
- 赞助信息链接在飞船气球上

coc-loader 帮助视图只是静态文本，无任何动画。

### 7.14 导航键支持

| 操作 | Mason | coc-loader | 备注 |
|------|-------|------------|------|
| `j` / `k` | ✅ Neovim 原生光标移动 | ✅ Neovim 原生 | 两者一样 |
| `gg` / `G` | ✅ Neovim 原生 | ✅ Neovim 原生 | 两者一样 |
| `<C-d>` / `<C-u>` | ✅ Neovim 原生 | ✅ Neovim 原生 | 两者一样 |
| `H` / `M` / `L` | ✅ Neovim 原生 | ✅ Neovim 原生 | 两者一样 |
| 鼠标滚轮 | ✅ Neovim 原生 | ✅ Neovim 原生 | 两者一样 |

---

## 八、架构差异

| 维度 | Mason | coc-loader |
|------|-------|------------|
| 渲染引擎 | 声明式虚拟节点树 (`INode`)，渲染器递归遍历，按 type 分发 | 命令式 `LineBuffer` 链式构建 + 手动 highight 收集 |
| 状态管理 | `create_state_container(vim.deepcopy(initial), debounced(draw))` — immutable 式 mutate | `StateManager` 发布订阅 + `process.nextTick` 防抖 |
| 按键系统 | 声明式 `Keybind(key, effect, payload)` 节点嵌入渲染树，按 line 注册 keymap，`dispatch_effect()` 全局/行级分发 | 统一 `handleKey(id)` 函数，通过 `CocConverterDispatch` VimL bridge 映射键→ID |
| 效果系统 | `effects` 表 (key=effect name → function)，payload 传递对象 | 硬编码 `if/else` 链 (`id === 'i'`, `id === 'u'`, ...) |
| 光标恢复 | `StickyCursor { id }` 节点系统，跨渲染按 ID 追踪持久化 | 简单行号 `Math.min(prevCursor[0], lines.length)` |
| 高亮系统 | `nvim_buf_add_highlight` (行内) | `nvim_buf_set_extmark` (支持 combine mode) |
| 虚拟文本 | ✅ `VIRTUAL_TEXT` 节点类型 | ❌ 无 |
| Diagnostics | ✅ `DIAGNOSTICS` 节点类型 → `vim.diagnostic.set` | ❌ 无 |
| 包安装 | 异步 `InstallHandle` + event 驱动 (state_change/spawn_handle/stdout/stderr/terminate) | 同步 `spawn` + onData callback |
| 取消安装 | `InstallHandle:terminate()` | ❌ 无此能力 |
| 窗口管理 | `display.new_view_only_win()` 工厂，backdrop/window 各一个浮动窗口 | 手动 createBuffer + openFloatWindow |
| 渲染防抖 | `vim.schedule` + queued flag | `rendering` + `pendingRender` 锁 |
| 自动调整 | `VimResized` autocmd 触发 re-render + `nvim_win_set_config` | ❌ 无 |
| 可配置性 | 通过 `settings.current.ui.*` 可配置 border/backdrop/width/height/icons/keymaps | 全部写死 |

### 8.1 架构优势对比

| 方面 | Mason 优势 | coc-loader 优势 |
|------|-----------|----------------|
| 可维护性 | 声明式组件树，功能解耦清晰，每组件独立文件 | 全部在一个 `tui.ts` + `state.ts` 中，简单直接 |
| 扩展性 | 添加新 Keybind = 新增一行声明 + effects 表加一个 handler | 添加新按键 = if 链加一个分支 |
| 渲染性能 | 每次全量重建虚拟树再渲染 | 类似性能（都写 buffer + extmark） |
| 调试难度 | 虚拟树 + effect 分发，调试需追踪多层 | 线性流程，容易理解 |
| 学习曲线 | 需理解自定义的 UI 框架（Node/When/CascadingStyle/HlTextNode） | 标准 TypeScript + Neovim API |

---

## 九、总结

### ✅ 已实现的 Mason 核心功能（相同 36项）

| # | 功能 | 备注 |
|---|------|------|
| 1 | 无边框浮动窗口 | border=none |
| 2 | 80%宽 90%高居中 | Mason 比例完全一致 |
| 3 | zindex 45 | 窗口 + backdrop (44) |
| 4 | backdrop 遮罩 | zindex 44, blend 60 |
| 5 | NormalFloat 链接 | CocLoaderNormal |
| 6 | filetype 设置 | coc-loader |
| 7 | cursorline 高亮当前行 |
| 8 | 禁用行号/相对行号/signcolumn/spell/wrap/fold |
| 9 | 金色 Header 居中 | #DCA561 |
| 10 | Header 中 `g?` 提示 |
| 11 | Tab 栏 `(N) Name` 格式 |
| 12 | Tab 活跃=青块，非活跃=灰块 |
| 13 | 数字键 1-9 切换 tab |
| 14 | Section 分组 (Failed/Installing/Queued/Installed/Available) |
| 15 | `◍` icon，按状态着色 |
| 16 | `i` 安装 |
| 17 | `u` 更新 |
| 18 | `U` 全部更新 | 并发 3 |
| 19 | `X` 卸载 |
| 20 | `C` 检查更新 | + registry 刷新 |
| 21 | `c` 单包检查 |
| 22 | `<CR>` 展开/收起详情 |
| 23 | `<CR>` 展开/收起日志 |
| 24 | `▶ # [N/N] msg` tail 日志 |
| 25 | `▼ Displaying full log` |
| 26 | `g?` 帮助视图 |
| 27 | `q` / `<Esc>` 关闭 |
| 28 | WinEnter 自动关闭 |
| 29 | 展开详情的属性表格 | commit/type/source/languages/categories/homepage |
| 30 | 描述多行显示 |
| 31 | 展开时 name 粗体 |
| 32 | cursorline 恢复 | 简单钳位 |
| 33 | 500 行日志上限 |
| 34 | 自动 `:CocRestart` 在变更后 |
| 35 | Mason 相同 icon 值 `◍` |
| 36 | Mason 相同布局缩进 | 4sp-6sp-8sp |

### ❌ 缺失的 Mason 核心功能（33项，按重要度排序）

| # | 功能 | 重要度 | 说明 |
|--|------|--------|------|
| 5 | **过期包提示** | ★★☆ | 只在 statusMessage 中短暂显示 |
| 6 | **Registry 更新进度条** | ★☆☆ | 仅文字提示 |
| 7 | **Sticky cursor** | ★☆☆ | 跨渲染光标追踪 |
| 8 | **新版本 diagnostics** | ★☆☆ | sign column 提示 |
| 9 | **latest_spawn 命令显示** | ★☆☆ | 行尾显示安装命令 |
| 10 | **VimResized 处理** | ★☆☆ | 终端大小变化时调窗口 |
| 11 | **deprecated 标注** | ★☆☆ | 对废弃包的视觉提示（含 diagnostics WARN） |
| 12 | **aliases 显示** | ★☆☆ | 包别名显示 |
| 13 | **搜索模式 UI** | ★☆☆ | 显示 keywords 等 |
| 14 | **Help 视图教育内容** | ★★☆ | Mason 有 per-tab 分类说明 + debug 指南 + 贡献引导 |
| 15 | **Help 视图可展开设置面板** | ☆☆☆ | `<CR>` 展开当前 settings inspect |
| 16 | **Help 视图飞船动画** | ☆☆☆ | ASCII art 动画 + 赞助信息 |
| 17 | **Header 打字机动画** | ☆☆☆ | 打开帮助时逐字显示 `:help` |
| 18 | **JSON Schema 浏览器** | ☆☆☆ | 交互式展开 LSP server 配置 schema（约 183 行组件） |
| 19 | **行级按键作用域** | ★★☆ | Mason 按键只对特定行生效，coc 全部全局 |
| 20 | **按键/图标/窗口全部可配置** | ★★☆ | Mason 通过 settings 暴露所有 keymaps/icons/border/backdrop |
| 21 | **backdrop=100 不创建遮罩** | ☆☆☆ | coc 缺边界检查 |
| 22 | **Tab 切换时光标跳转 75%** | ☆☆☆ | Mason 跳回 tab 行 |
| 23 | **帮助视图 tab 金色切换** | ☆☆☆ | Mason 帮助视图 tabs 变金色 |
| 24 | **executables 表** | ☆☆☆ | coc 插件无此概念 |
| 25 | **`:MasonLog` 等效** | ☆☆☆ | coc 无日志查看命令 |
| 26 | **`MasonHighlightSecondary` 缺失** | ☆☆☆ | fg=#DCA561 金色高亮组 |
| 27 | **`MasonHighlightBlockBoldSecondary` 缺失** | ☆☆☆ | 金色背景粗体块（帮助视图 tab） |
| 28 | **`MasonMutedBlockBold` 缺失** | ☆☆☆ | 粗体灰色块（registry 进度） |
| 29 | **`CocLoaderWarning` 色值偏差** | ☆☆☆ | 应为 link WarningMsg，实为 guifg=#DCA561 |
| 30 | **虚拟文本节点** | ☆☆☆ | Mason 用 virt_text 显示进度条等，不占 buffer 行 |
| 31 | **诊断集成** | ☆☆☆ | Mason 用 `vim.diagnostic.set` 显示版本/废弃信息 |
| 32 | **`syntax clear` 清语法** | ☆☆☆ | Mason 打开窗口时执行 |
| 33 | **`vim.schedule` 关闭防 crash** | ☆☆☆ | Mason 闭包 schedule 避免 which-key segfault |

### △ coc-loader 独有功能（Mason 没有）

| # | 功能 | 说明 |
|---|------|------|
| 1 | `f` 循环 viewFilter | 按 all/installed/not-installed 筛选 |
| 2 | `s` 循环排序 | default/name/status/type |
| 3 | `Z` 全部卸载 | 确认后卸载所有 |
| 4 | `R` 重装 | 卸载后重新安装 |
| 5 | Tab 动态生成 | 基于 categories，最多 9 个 |
| 6 | `<Esc>` 逐级取消 | 语言筛选→搜索→关闭 |
| 7 | **`g:coc_loader_global_extensions`** | 配置列表自动安装扩展 |
| 8 | **智能包名解析 (`findPackage`)** | 支持 displayName 和自动补 `vscode-` 前缀 |
| 9 | **`loader.cleanCache`** | 清理 build cache |
| 10 | **`loader.list`** | 导出已装包列表到剪贴板 |
| 11 | **自动检查更新** | 启动时静默检查，有更新才通知 |
| 12 | **Updating/Uninstalling 分区** | Mason 归入 Installing，coc 区分显示 |
