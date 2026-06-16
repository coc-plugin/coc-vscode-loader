# TUI Design — coc-loader

## 设计来源

TUI 完全参照 [mason.nvim](https://github.com/mason-org/mason.nvim) 的 UI 设计，包括视觉风格、交互方式和功能集。

## 视觉布局

```
┌───────────────────────────────────────────────────────────────────┐
│                                                                   │
│   mason.nvim v1.5.0  press ? for help       ← Header (gold+cyan) │
│                                                                   │
│   (1) All  (2) LSP  (3) Snippets  (4) ...  ← Tabs (cyan/gray)   │
│                                                                   │
│   Installed (15)                           ← Section heading     │
│     ◍ vscode-eslint                        ← Installed (cyan)    │
│     ◍ pyright                                                     │
│                                                                   │
│   Available (106)                          ← Section heading     │
│     ◍ vscode-javascript-snippets           ← Uninstalled (gray)  │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## 颜色方案

直接复制 mason.nvim 的默认配色:

| Highlight 组 | 用途 | 前景 | 背景 | 粗体 |
|---|---|---|---|---|
| `CocLoaderHeader` | 标题 "mason.nvim" | #222222 | #DCA561 (金色) | yes |
| `CocLoaderHeaderSec` | 版本号 "vX.X.X" | #222222 | #56B6C2 (青色) | yes |
| `CocLoaderTabActive` | 当前选中的 tab | #222222 | #56B6C2 (青色) | yes |
| `CocLoaderTabInactive` | 未选中的 tab | #222222 | #888888 (灰色) | no |
| `CocLoaderHeading` | Section 标题 (如 "Installed") | 继承 | 无 | yes |
| `CocLoaderHighlight` | 已安装图标 + 高亮 | #56B6C2 | 无 | no |
| `CocLoaderMuted` | 未安装图标 + 辅助文本 | #888888 | 无 | no |
| `CocLoaderError` | 失败图标 | 链接到 ErrorMsg | 无 | no |
| `CocLoaderSearchMatch` | 搜索匹配高亮 | 链接到 Search | 无 | no |

## 架构

```
plugin/src/tui.ts
├── TUI class
│   ├── open()                 创建浮动窗口 + 定义高亮 + 设置按键 + 异步加载 registry
│   ├── handleKey(id)          Mason 按键分发
│   ├── setupKeymaps()         Neovim buffer keymaps
│   ├── close()                关闭窗口 + 可选 CocRestart
│   ├── render()               节流的全量渲染 + extmark 高亮 + 光标恢复
│   ├── renderPackageList()    主布局: header → tabs → 分组 sections
│   ├── renderSection()        一个 status 分组的渲染 (Failed/Installing/Installed/Available)
│   ├── renderEntry()          单个 package 行 (◍ icon + name + progress)
│   ├── renderHelp()           帮助视图
│   ├── appendHighlightedText() 搜索关键字高亮
│   ├── showDetailPopup()      Mason 风格的详情/日志浮动窗口
│   ├── updateDetailPopup()    实时更新详情窗口内容 + 语法高亮
│   └── closeDetailPopup()     关闭详情窗口
```

## 状态分组 (Sections)

完全参照 Mason，按安装状态分组，顺序固定：

1. **Failed** — 安装失败的包 (有则显示)
2. **Installing** — 正在安装/更新/卸载的包
3. **Installed** — 已成功安装的包
4. **Available** — 尚未安装的包 (Mason 原文 "Uninstalled"，显示为 "Available")

## Tab 系统

Tabs = "All" + 前 6 个 category。通过数字键 1-N 切换:

| 键 | Tab | categoryFilter |
|---|---|---|
| `1` | All | null |
| `2` | 第一个 category | "Snippets" |
| `3` | 第二个 category | "LSP" |
| ... | ... | ... |

当前 category 通过 `getCategories()` 从所有 package 的 `categories` 字段动态提取。

## 按键映射 (Mason 标准)

| 键 | 动作 | 条件 |
|---|---|---|
| `1`-`9` | 切换 tab | - |
| `i` | 安装包 | status === 'not-installed' |
| `u` | 更新包 | status === 'installed' |
| `U` | 更新所有已安装 | 至少 1 个已安装 |
| `C` | 检查更新 | - |
| `X` | 卸载包 | status === 'installed' |
| `<CR>` | 打开详情/日志浮动窗口 | 光标在 package 行 |
| `?` | 切换帮助视图 | - |
| `q` | 关闭窗口 | - |
| `<Esc>` | 关闭帮助 → 清除 category → 关闭 | 级联 |

## 和 Mason 的差异

| 功能 | Mason | coc-loader |
|---|---|---|
| Tab 内容 | 固定 All/LSP/DAP/Linter/Formatter | 动态: All + categories |
| 包图标 | `◍` + 颜色区分 | 同 Mason |
| Section 分组 | Failed/Installing/Queued/Installed/Uninstalled | Failed/Installing/Installed/Available (无 Queued) |
| 内联展开 | <CR> 在列表内展开详情 | <CR> 弹出浮动窗口 (后续改为内联) |
| 语言筛选 | `<C-f>` 弹窗选语言 | 暂无 |
| 搜索 | `/` + keywords 显示 | `/` + name/description 匹配 |
| 安装日志 | 内联 tail + toggle | 浮动窗口展示全日志 |

## 关键文件

| 文件 | 职责 |
|---|---|
| `plugin/src/tui.ts` | TUI 窗口管理 + 渲染 + 按键处理 |
| `plugin/src/state.ts` | 状态管理 (packages, filters, batch) |
| `plugin/src/renderer.ts` | LineBuffer 渲染引擎 (segment 追加 → text + extmark) |
| `plugin/src/pipeline.ts` | 安装/更新/卸载流程 |
| `plugin/src/registry.ts` | Registry 获取 + 缓存 + 版本过滤 |
| `plugin/src/index.ts` | CocCommand 注册 + TUI 生命周期 |
