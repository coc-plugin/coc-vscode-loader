# TUI Design — coc-loader

## 设计来源

TUI 完全参照 [mason.nvim](https://github.com/mason-org/mason.nvim) 的 UI 设计，包括视觉风格、交互方式和功能集。
目标是与 Mason 保持 1:1 一致，差异最小化。

## 视觉布局

```
┌───────────────────────────────────────────────────────────────────┐
│                                                                   │
│               coc-loader v1.5.1                     ← 金色背景，居中
│               press g? for help                     ← 提示，居中    │
│                                                                   │
│   (1) All  (2) LSP  (3) Snippets …                 ← Tab 栏      │
│                                                                   │
│   Installing (2)                                                    │
│     ◍ packagename                                   ← 青色 icon   │
│       ▶ # [2/5] Converting...                       ← tail 日志    │
│                                                                   │
│   Installed (15)                                                    │
│     ◍ vscode-eslint                                 ← 青色 icon   │
│       VS Code ESLint extension                      ← 展开的详情   │
│                                                                   │
│   Available (106)                                                    │
│     ◍ vscode-javascript-snippets                    ← 灰色 icon   │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## 颜色方案

Mason 默认配色精确复制:

| Highlight 组 | 用途 | 前景 | 背景 | 粗体 |
|---|---|---|---|---|
| `CocLoaderHeader` | 标题 | #222222 | #DCA561 (金色) | yes |
| `CocLoaderHeaderSec` | 版本号 (仅帮助动画) | #222222 | #56B6C2 (青色) | yes |
| `CocLoaderTabActive` | 当前 tab | #222222 | #56B6C2 (青色) | yes |
| `CocLoaderTabInactive` | 未选中 tab | #222222 | #888888 (灰色) | no |
| `CocLoaderHeading` | Section 标题 + 粗体文本 | 继承 | 无 | yes |
| `CocLoaderHighlight` | 已安装 icon + 高亮文本 | #56B6C2 | 无 | no |
| `CocLoaderMuted` | 未安装 icon + 辅助文本 | #888888 | 无 | no |
| `CocLoaderError` | 失败状态 | 链接 ErrorMsg | 无 | no |
| `CocLoaderSearchMatch` | 搜索命中 | 链接 Search | 无 | no |
| `CocLoaderWarning` | 警告 | #DCA561 | 无 | no |
| `CocLoaderBackdrop` | 背景遮罩 | 无 | #000000 | no |
| `CocLoaderNormal` | 窗口正常文本 | 链接 NormalFloat | 无 | no |
| `CocLoaderHighlightBlock` | 色块 (通用) | #222222 | #56B6C2 | no |
| `CocLoaderMutedBlock` | 灰色块 (通用) | #222222 | #888888 | no |

## 窗口结构

```
plugin/src/tui.ts
├── TUI class
│   ├── open()                 浮动窗口 + 高亮 + 按键 + 异步 registry
│   ├── handleKey(id)          Mason 按键分发
│   ├── setupKeymaps()         按键映射
│   ├── close()                关闭窗口 + backdrop + CocRestart
│   ├── render()               节流渲染 + extmark + 行号光标恢复
│   ├── renderPackageList()    整体布局: header → tabs → sections
│   ├── renderSection()        单个 status 分组
│   ├── renderEntry()          包行 (icon + name) + 展开详情/日志
│   ├── renderExpandedInfo()   行内展开: 描述 + 属性表格
│   ├── renderHelp()           帮助视图
│   ├── appendHighlightedText() 搜索高亮
│   ├── getTabs()              动态 tab 列表
```

## 窗口选项

| 选项 | Mason | coc-loader |
|---|---|---|
| `border` | `"none"` (默认) | `"none"` |
| `width` | `0.8 * columns` | `floor(cols * 0.8)` |
| `height` | `0.9 * (lines-cmdheight)` | `floor(availLines * 0.9)` |
| `zindex` | 45 | 45 |
| `winhighlight` | `NormalFloat:MasonNormal` | `NormalFloat:CocLoaderNormal` |
| backdrop zindex | 44 | 44 |
| backdrop blend | 60 | 60 |
| 背景条件 | `termguicolors + !transparent` | 同 Mason |
| `filetype` | `mason` | `coc-loader` |

## 状态分组 (Sections)

顺序固定:

1. **Failed** — 安装失败的包 (有则显示)
2. **Installing** — 正在安装/更新/卸载的包
3. **Installed** — 已成功安装的包
4. **Available** — 尚未安装的包

## Tab 系统

Tabs = "All" + 前 6 个 category。数字键 1-9 切换。

Tab 格式: ` (N) Name `，活跃=青色背景块，不活跃=灰色背景块。
块间 1 个空格间隔。

## 包条目渲染

```
  ◍ displayName                    ← 4sp + icon(Cyan/Gray/Red) + name
    ▶ # [step/total] message       ← 6sp (tail 日志，灰色)
    ▼ Displaying full log          ← 6sp (展开后，粗体)
      [step/total] message         ← 8sp (全部日志 summary，灰色)

  ◍ displayName                    ← 展开详情时 name 粗体
    description                    ← 6sp (灰色)
                                    ← 空行
    version        abc1234         ← label(灰色) + value(高亮/粗体)
    type           pure-lsp
    source         github:owner/repo
    languages      javascript
    categories     LSP, Linter
    homepage       https://...
                                    ← 尾部空行
```

## 按键映射

| 键 | 动作 | 条件 |
|---|---|---|
| `1`-`9` | 切换 tab | - |
| `i` | 安装包 | status === 'not-installed' |
| `u` | 更新包 | status === 'installed' |
| `U` | 更新所有已安装 | 至少 1 个已安装 |
| `C` | 更新 registry + 检查所有更新 | - |
| `c` | 检查单包更新 | 光标在包行 |
| `X` | 卸载包 | status === 'installed' |
| `<CR>` | 展开/收起详情或日志 | 光标在包行 |
| `g?` / `?` | 切换帮助 | - |
| `q` / `<Esc>` | 关闭窗口 | - |
| `<C-f>` | 语言筛选 (预留) | - |

## Mason 功能映射

| Mason | coc-loader | 状态 |
|---|---|---|
| Header 金色标题 | `coc-loader vX.X.X` 金色 | ✓ |
| Header 居中 + `g?` 提示 | 同 Mason | ✓ |
| Tab 1-5 | Tab 1-9 (动态 categories) | ✓ |
| Tab 格式 ` (N) Name ` | 同 Mason | ✓ |
| `i` 安装 / `u` 更新 / `X` 卸载 | 同 Mason | ✓ |
| `U` 全部更新 | 同 Mason | ✓ |
| `C` 检查更新 | 同 Mason (+ registry 刷新) | ✓ |
| `c` 检查单包版本 | 同 Mason | ✓ |
| `<CR>` 展开详情/日志 | 同 Mason (内联) | ✓ |
| `▼ Displaying full log` | 同 Mason | ✓ |
| `▶ # [N/N] message` tail | 同 Mason | ✓ |
| 详情: 描述 + 属性表格 | 同 Mason | ✓ |
| 展开时名称粗体 | 同 Mason | ✓ |
| `g?` 帮助键 | 同 Mason | ✓ |
| `<C-f>` 语言筛选 | 预留 | △ |
| `<C-c>` 取消安装 | 暂无 | ✗ |
| Sticky cursor | 暂无 (行号恢复) | △ |
| Queued 分区 | 无概念 | ✗ |
| 安装日志存行 | structered (summary) | △ |

## 关键文件

| 文件 | 职责 |
|---|---|
| `plugin/src/tui.ts` | TUI 窗口 + 渲染 + 按键 |
| `plugin/src/state.ts` | 状态管理 |
| `plugin/src/renderer.ts` | LineBuffer 渲染引擎 |
| `plugin/src/pipeline.ts` | 安装/更新/卸载流程 |
| `plugin/src/registry.ts` | Registry 获取 + 缓存 + 版本过滤 |
| `plugin/src/index.ts` | CocCommand 注册 + 生命周期 |
