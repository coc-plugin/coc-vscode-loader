# VS Code API 在 coc.nvim 中的可实现性分析

分析依据 coc.nvim 当前架构（本质是 Neovim/Vim 插件，通过 Node.js 运行，以 LSP 为核心），评估每个 VS Code API 能否在 coc.nvim 中实现。

---

## 1. 可以实现（已有或容易适配）

这些 API coc 已有，只需要简单的重命名/参数适配即可映射。

| # | VS Code API | Coc 对应 | 适配方式 |
|---|-------------|----------|---------|
| 1 | `Position` class (translate/with/compareTo) | `Position` interface | 写一个包装 class，包装 LSP Position。纯计算逻辑，无平台依赖 |
| 2 | `Range` class (contains/intersection/union) | `Range` interface | 同上，纯计算逻辑 |
| 3 | `Selection` class | **无** | 基于 Range class 扩展，纯数据逻辑 |
| 4 | `MarkdownString` class | **无** | 纯数据类，无平台依赖，可以直接实现 |
| 5 | `ThemeColor` | **无** | 简单的 id 包装，可以直接实现 |
| 6 | `WorkspaceEdit` class methods | `WorkspaceEdit` interface | 写一个 wrapper class 封装 LSP 的 changes/documentChanges 结构 |
| 7 | `CodeActionKind` class (append/contains/intersects) | `type CodeActionKind = string` | 实现 class 包装字符串，纯逻辑 |
| 8 | `InlayHint` class | `InlayHint` interface | 同上，直接包装 |
| 9 | `Hover` class | `Hover` interface | 同上 |
| 10 | `CodeLens` class | `CodeLens` interface | 同上 |
| 11 | `DocumentLink` class | `DocumentLink` interface | 同上 |
| 12 | `Disposable.from()` | `Disposable.create()` | 只是工厂方法命名不同 |
| 13 | `EventEmitter` (命名) | `Emitter` | 别名即可 |
| 14 | Provider 注册名统一（reference→references 等） | 命名不同 | 加别名函数即可 |
| 15 | `registerOnTypeFormattingEditProvider` 参数风格 | `string[]` vs rest | 包装函数 |
| 16 | `commands.registerCommand` 参数 | `internal` 参数 | 可选参数适配 |
| 17 | `extensions.getExtension` | `getExtensionById` | 别名 |
| 18 | `workspace.getWorkspaceFolder(Uri)` | 接受 `string \| Uri` | 加 Uri 处理 |
| 19 | `languages.match` 用 TextDocument | 用 TextDocumentMatch | 类型适配 |
| 20 | `createTerminal` 返回 Promise vs 同步 | Promise | 加同步版本或兼容层 |
| 21 | `TextEdit` class | `TextEdit` interface | 与 WorkspaceEdit 同理 |

### 1.1 Provider 签名差异适配

所有 Provider 的 `document` 参数从 `TextDocument` 变 `LinesTextDocument`：
- `LinesTextDocument` extends `TextDocument`，额外提供 `lineAt()`、`lines`、`end`、`bufnr`
- **可以兼容**：在接口层面适配即可，coc 内部完全可以用 `LinesTextDocument` 满足 vscode 的 `TextDocument` 接口需求

---

## 2. 理论上可以实现（需工作量）

这些 API coc 没有，但 Neovim 有能力支持，需要实现。

| # | VS Code API | 实现可行性 | 方案 |
|---|-------------|-----------|------|
| 1 | `TextLine` (vscode 已有，但 coc 的 TextDocument 没有 lineAt 方法) | **可 - 低** | 已存在于 `LinesTextDocument`，需要提升到基础 `TextDocument` |
| 2 | `EndOfLine` enum | **可 - 低** | 枚举定义 + 文档属性 |
| 3 | `workspace.fs` (FileSystem) | **可 - 中** | Coc 运行在 Node.js，可以直接用 `fs/promises` 实现 `readFile/writeFile/stat/readDirectory/rename/delete`。难点：需要在 FileSystemProvider 层面支持可插拔的自定义文件系统 |
| 4 | `workspace.name` | **可 - 低** | 从 workspaceFolder 推断 |
| 5 | `workspace.saveAll()/save()/saveAs()` | **可 - 中** | 调用 Neovim 的 write 命令或 Node.js fs |
| 6 | `workspace.updateWorkspaceFolders()` | **可 - 中** | 维护 workspace folder 列表 |
| 7 | `workspace.decode()/encode()` | **可 - 低** | `TextEncoder/TextDecoder` |
| 8 | `openTextDocument()` 带 content 选项 | **可 - 中** | 创建临时 buffer 或内存 document |
| 9 | `getLanguages()` | **可 - 低** | 从 `workspace.languageIds` Set 转换 |
| 10 | `setTextDocumentLanguage()` | **可 - 中** | 调用 nvim_buf_set_option 改 filetype |
| 11 | `setLanguageConfiguration()` | **可 - 中** | 设置 buffer 的 indent/comment 等选项 |
| 12 | `window.showTextDocument()` | **可 - 中** | 打开 buffer 窗口 |
| 13 | `window.showInputBox()` | **可 - 中** | 已有 `window.requestInput()`，包装一下签名 |
| 14 | `window.showOpenDialog()/showSaveDialog()` | **可 - 难** | Terminal 环境无原生文件对话框。可用 `vim.ui.select` 或 fzf 模拟，但体验差很多 |
| 15 | `window.setStatusBarMessage()` | **可 - 低** | 调用 `nvim_echo` 或 `vim.notify` |
| 16 | `window.activeTerminal` | **可 - 中** | 追踪 terminal buffer |
| 17 | `window.onDidChangeActiveTerminal` | **可 - 中** | 监听 BufEnter 事件 |
| 18 | `window.onDidChangeTerminalState` | **可 - 中** | 监听终端进程状态 |
| 19 | `window.onDidChangeTextEditorSelection` | **可 - 中** | 监听 Neovim 的 `TextChanged` 或 `CursorMoved` 事件 |
| 20 | `window.onDidChangeTextEditorVisibleRanges` | **可 - 中** | 监听 `WinScrolled` 事件 |
| 21 | `window.onDidChangeTextEditorOptions` | **可 - 中** | 监听 OptionSet |
| 22 | `window.createTextEditorDecorationType` | **可 - 难** | Vim 的 highlight 系统不如 CSS 灵活。gutter icon、overviewRuler、before/after 伪元素等无法实现。但基本的高亮（背景色、下划线、颜色）可以实现 |
| 23 | `window.registerTreeDataProvider` | **可 - 中** | 已有 `createTreeView`，需要加 provider 注册入口 |
| 24 | `window.withScmProgress` | **可 - 低** | 只是进度包装 |
| 25 | `DiagnosticCollection` 用 Uri | **可 - 低** | 用 `uri.toString()` 做 key 转换 |
| 26 | `Diagnostic` class | **可 - 低** | 包装 LSP Diagnostic + code 的 `{value, target}` 形式 |
| 27 | `DiagnosticSeverity` 枚举值 (0-3 vs 1-4) | **可 - 低** | 加减 1 即可 |
| 28 | `TextDocument.fileName/isUntitled/isDirty/isClosed/encoding/eol` | **可 - 中** | 需要从 Neovim 获取 buffer 信息。大部分可以通过 `nvim_buf_get_var/option` 获取 |
| 29 | `TextDocument.save()` | **可 - 中** | 调用 nvim_buf_call + `:write` |
| 30 | `TextDocument.getWordRangeAtPosition()` | **可 - 中** | 用 `nvim_get_current_line` + 正则 |
| 31 | `TextDocument.validateRange()/validatePosition()` | **可 - 低** | 纯计算，钳制值即可 |
| 32 | `window.registerUriHandler` | **可 - 中** | 注册协议处理器 |
| 33 | `window.registerTerminalLinkProvider` | **可 - 中** | 终端链接检测 |
| 34 | `window.registerFileDecorationProvider` | **可 - 中** | 文件图标装饰 |
| 35 | `l10n` namespace | **可 - 低** | 纯文本本地化函数 |
| 36 | `authentication` namespace | **可 - 中** | 需要一个认证存储和 GUI 交互（OAuth 流程需要浏览器） |
| 37 | `extensions.onDidChange` | **可 - 低** | 已有三个细分事件，合并即可 |
| 38 | `Uri` class | **可 - 中** | 包装 `URI.parse/URI.file`（vscode-uri npm 包可直接复用） |
| 39 | `CompletionItem` class | **可 - 低** | 包装 LSP CompletionItem |
| 40 | `CompletionList` class | **可 - 低** | 同上 |
| 41 | `DocumentSymbol` class | **可 - 低** | 同上 |
| 42 | `SymbolInformation` class | **可 - 低** | 同上 |
| 43 | `CodeAction` class | **可 - 低** | 同上 + `data` 字段迁移 |
| 44 | `SignatureInformation` class | **可 - 低** | 同上 |
| 45 | `ParameterInformation` class | **可 - 低** | 同上 |
| 46 | `CallHierarchyItem` class | **可 - 低** | 同上 |
| 47 | `TypeHierarchyItem` class | **可 - 低** | 同上 |
| 48 | `LinkedEditingRanges` class | **可 - 低** | 同上 |
| 49 | `SelectionRange` class | **可 - 低** | 同上 |
| 50 | `EvaluatableExpression` class | **可 - 低** | 同上 |
| 51 | `InlineValue` 系列 | **可 - 低** | 同上（但只有 debug 场景有用） |
| 52 | `SnippetTextEdit` | **可 - 低** | 结合 SnippetString + TextEdit |
| 53 | `NotebookEdit` | **可 - 低** | notebook 不实现但类型可以存在 |
| 54 | `WorkspaceEditEntryMetadata` | **可 - 低** | 接口定义 |
| 55 | `TextDocumentWillSaveEvent` / `WillSaveEvent` | **可 - 中** | 监听 BufWritePre 事件 |
| 56 | `TextDocumentChangeEvent` (替代 DidChangeTextDocumentParams) | **可 - 中** | 包装 LSP event |
| 57 | `window.activeColorTheme` / `onDidChangeActiveColorTheme` | **可 - 中** | 检测 vim 的 background 选项 |
| 58 | `window.state` / `onDidChangeWindowState` | **可 - 中** | 监听 FocusGained/FocusLost |
| 59 | `env` namespace（部分） | **可 - 中** | language/appRoot/appName/machineId/sessionId/clipboard/openExternal 可以实现。clipboard 可以用 Neovim 的 clipboard provider |
| 60 | `tasks` namespace（简化版） | **可 - 中** | Neovim 有 job control API，可以实现 TaskProvider/TaskExecution 的子集 |

---

## 3. 无法实现（根本原因）

这些 API **无法在 coc.nvim 中实现**，因为 Neovim/Vim 平台从根本上不支持所需的基础设施。

### 3.1 需要 GUI/Web 渲染引擎

| # | VS Code API | 无法实现的理由 |
|---|-------------|--------------|
| 1 | **`WebviewPanel` / `createWebviewPanel`** | 需要内置 Chromium/HTML 渲染引擎。Neovim 只有 TUI 文本界面。虽然可以用 `nvim_open_win` 创建浮动窗口，但无法渲染 HTML/CSS/JS。**无法解决** |
| 2 | **`registerWebviewPanelSerializer`** | 同上，依赖 webview |
| 3 | **`registerWebviewViewProvider`** | 同上，在侧栏中嵌入 webview |
| 4 | **`CustomEditorProvider` / `CustomTextEditorProvider` / `CustomReadonlyEditorProvider`** | 自定义编辑器依赖 webview 或完整的编辑器替代界面。Neovim 没有可嵌入的自定义编辑框架 |
| 5 | **`chat` namespace** | GitHub Copilot Chat 有独立的 UI（webview 聊天面板）。没有 webview 就无法渲染聊天界面。而且 lm（language model）API 也依赖 chat 上下文 |
| 6 | **`lm` namespace** | Language Model API 是为 Copilot 设计的，调用需要 chat 基础设施。核心是 LLM 聊天补全，在 TUI 下可以用浮动窗口模拟但体验差距大 |
| 7 | **`ThemeIcon` (with id)** | （部分可实现）`ThemeIcon.File/Folder` 含义是文件图标主题中的图标，Neovim 没有"文件图标主题"概念。vim-devicons 等插件用字符，不是 icon class |

### 3.2 需要 VS Code 编辑器架构

| # | VS Code API | 无法实现的理由 |
|---|-------------|--------------|
| 8 | **`debug` namespace** | VS Code 的调试器是深度集成的：有 Debug Adapter Protocol 的完整实现、调用栈视图、变量查看/修改、Watch 表达式、断点管理 UI、调试工具条。Neovim 有 nvim-dap 插件提供 DAP 客户端，但 coc.nvim 作为一个补全框架，没有也不应该提供完整的调试器。这不是 coc 的设计目标 |
| 9 | **`breakpoints` / `Breakpoint` 系列** | 依赖 debug namespace |
| 10 | **`comment` / `CommentController` / `CommentThread`** | 文件内注释系统需要编辑器边栏和行内 UI（例如 GitHub Pull Request 的代码审查注释）。Neovim 没有这种内联注释 UI 框架 |
| 11 | **`scm` namespace** | 源代码管理需要文件状态装饰、内联 diff 视图、暂存/取消暂存 UI、提交编辑器。虽然 Neovim 有 gitsigns 等插件，但 coc 作为一个单独的 Node.js 进程很难提供完整的 SCM API |
| 12 | **`Tab` / `TabGroup` / `TabInput*`** | VS Code 的标签化编辑器模型（preview tabs、pinned tabs、split tabs、tab groups）跟 Neovim 的 buffer/window/tabpage 模型完全不同。概念上无法映射 |
| 13 | **`ViewColumn`** | VS Code 有列式多编辑器布局（最多 3 列），Neovim 的窗口是自由分割的，没有"列"的固定概念 |
| 14 | **`TextEditor.viewColumn`** | 同上，编辑器没有"列号" |
| 15 | **`window.tabGroups`** | 依赖 Tab/TabGroup 概念 |
| 16 | **`showNotebookDocument` / `visibleNotebookEditors` / `activeNotebookEditor`** | 笔记本文档需要 cell 编辑器 UI，不是普通文本 buffer 能模拟的 |

### 3.3 需要 VS Code 插件运行时机制

| # | VS Code API | 无法实现的理由 |
|---|-------------|--------------|
| 17 | **`tests` namespace** | VS Code 的测试 API（TestController/TestRun/TestItem）集成了测试资源管理器 UI、测试覆盖高亮、测试运行进度。Neovim 没有测试资源管理器的概念。虽然有 vim-test 等插件，但跟 coc 的架构不兼容 |
| 18 | **`ExtensionTerminalOptions` / `Pseudoterminal`** | `Pseudoterminal` 允许扩展自己实现一个"终端"（通过 write/close 回调）。这需要 VS Code 的终端进程管理和 pty 层。Neovim 的 `:terminal` 是内置的，不支持自定义终端后端 |
| 19 | **`DataTransfer` / `DataTransferFile` / `DataTransferItem`** | 拖放 API 依赖操作系统的拖放事件。Neovim 在 TUI 模式下没有拖放事件 |
| 20 | **`registerDocumentDropEditProvider` / `registerDocumentPasteEditProvider`** | 同上，依赖拖放和剪贴板的富媒体粘贴。Neovim 没有粘贴事件拦截 API |
| 21 | **`CustomExecution` / `ShellExecution` / `ProcessExecution`** | 这是 tasks API 的一部分，依赖 VS Code 的任务执行引擎 |

### 3.4 需要 VS Code 的 SCM/Explorer 集成

| # | VS Code API | 无法实现的理由 |
|---|-------------|--------------|
| 22 | **`FileDecorationProvider`** | 文件装饰（badge、颜色）显示在 VS Code 的文件浏览器中。Neovim 没有内置文件浏览器，所以没有显示装饰的地方。NvimTree 等插件有自己的装饰机制 |
| 23 | **`scm`（完整）** | SCM 需要在文件浏览器、编辑器、状态栏等多处显示 SCM 状态。Neovim 没有统一的 SCM 展示框架 |

### 3.5 需要 VS Code 底层平台能力

| # | VS Code API | 无法实现的理由 |
|---|-------------|--------------|
| 24 | **`FileSystemProvider`** | 自定义虚拟文件系统需要 VS Code 的文件系统抽象层。coc 可以用 LSP 的 `workspace/configuration` 和文件操作请求，但无法实现可插拔的虚拟文件系统（如 `memfs`、`zipfs`）。因为 coc 不控制 Neovim 如何读写文件 |
| 25 | **`AuthenticationProvider` / `getSession`** | （部分可实现）OAuth 流程需要打开浏览器进行认证。在 TUI 环境下可以做到（`openExternal`），但体验不如 VS Code。不过认证 token 的存储和管理是可以实现的 |
| 26 | **`window.showOpenDialog`/`showSaveDialog`（原生）** | 原生文件对话框依赖 GUI 框架 Electron。在 TUI 下可以用 fzf/vim.ui.select 模拟，但调用方期望的是 `Uri[]`，可以用文件选择器替代 |
| 27 | **`env.clipboard`** | （部分可实现）Neovim 有 `vim.fn.getreg('+')` 可读系统剪贴板，但无法提供 VS Code 的 `Clipboard` 接口（readText/writeText Promise 风格）。技术上可以实现但 coc 没有此 API |

### 3.6 设计哲学不同无法实现

| # | VS Code API | 无法实现的理由 |
|---|-------------|--------------|
| 28 | **`TextEditorDecorationType` 完整渲染选项** | VS Code 的 decoration 支持 `before`/`after` 伪元素、`outline`、`border-radius`、`gutterIconSize`、`overviewRulerLane` 等 CSS 级别的渲染控制。Neovim 的 highlight 只支持前景色、背景色、粗体、斜体、下划线、删除线等基本属性。CSS 类的 decoration options（border、outline、opacity、letterSpacing 等）**完全无法实现** |
| 29 | **`StatusBarAlignment`** | VS Code 的状态栏支持左/右对齐。Vim 的状态栏是简单字符串，不支持多区域对齐。虽然可以通过 `%l` 等格式化，但无法达到 VS Code 的精细度 |
| 30 | **`StatusBarItem.id/name/alignment/tooltip/color/backgroundColor/command`** | Vim 状态栏项本质是一个字符串。颜色可以用 `%#HL#` 转义序列（有限支持），tooltip 无意义（因为 TUI 无 tooltip 概念），command 点击需要 Neovim 的 `statusline` 点击事件（仅 Neovim 0.10+ 有限支持）。无法完整实现 |
| 31 | **`TerminalOptions.location/iconPath/color/hideFromUser/message/isTransient`** | Neovim 的 terminal 在 buffer 中打开，没有"位置选择"（在 editor 区域还是 panel 区域）、图标、颜色标记、隐藏用户、消息提示、临时终端等概念 |
| 32 | **`env.uiKind`** | VS Code 区分桌面版和 Web 版 UI。Neovim 是 TUI，没有 UI kind 的概念 |
| 33 | **`env.remoteName`** | VS Code Remote Development 的 Remote 标识。coc 没有 remote 概念 |
| 34 | **`env.appHost` / `env.appRoot` / `env.appName`** | VS Code 的桌面应用环境信息。Neovim 不适用 |
| 35 | **`env.shell`** | VS Code 集成的 shell 信息。Neovim 不跟踪 |

---

## 4. 完整缺失功能汇总

### 4.1 完全无法实现（根本性限制）

| # | 功能 | 分类 | 根本限制 |
|---|------|------|---------|
| 1 | Webview (panel/view/serializer) | GUI/渲染 | Neovim 无 HTML 渲染引擎 |
| 2 | Notebooks | GUI/渲染 | cell 编辑器需要 webview 或自定义编辑器 |
| 3 | Chat / LM API | GUI/渲染 | Copilot Chat 面板依赖 webview |
| 4 | CustomEditor | GUI/渲染 | 自定义编辑器需要 webview |
| 5 | Debug (完整) | 编辑器架构 | DAP UI 需要侧栏、工具条、内联装饰 |
| 6 | Comment system | 编辑器架构 | 行内注释 UI 需要 VS Code 的边栏系统 |
| 7 | SCM (完整) | 编辑器架构 | 文件状态装饰和 diff 编辑器 |
| 8 | Tests | 编辑器架构 | 测试资源管理器和覆盖率高亮 |
| 9 | Tab/TabGroup | 编辑器架构 | Buffer/window 模型完全不同 |
| 10 | Pseudoterminal | 插件运行时 | 自定义终端后端需要 pty 集成 |
| 11 | DataTransfer/Drop | 插件运行时 | TUI 无拖放事件 |
| 12 | FileSystemProvider | 平台能力 | coc 不控制 Neovim 文件 IO |
| 13 | Decoration CSS 属性 | 设计哲学 | Vim highlight 能力有限 |
| 14 | StatusBar 丰富属性 | 设计哲学 | Vim 状态栏是纯文本 |
| 15 | 编辑器列/标签概念 | 设计哲学 | Neovim 编辑器模型不同 |

### 4.2 理论上可实现但 coc 未实现

| # | 功能 | 工作量 | 障碍 |
|---|------|--------|------|
| 1 | Uri class | 低 | 直接复用 `vscode-uri` npm 包 |
| 2 | Position/Range/Selection class | 低 | 纯计算逻辑 |
| 3 | MarkdownString class | 低 | 纯数据类 |
| 4 | ThemeColor | 低 | 简单包装 |
| 5 | CodeActionKind class | 低 | 纯字符串操作 |
| 6 | WorkspaceEdit class | 低 | 包装 LSP 结构 |
| 7 | EndOfLine enum | 低 | 枚举定义 |
| 8 | Disposable.from() | 低 | 工厂方法 |
| 9 | EventEmitter → Emitter 别名 | 低 | 重导出 |
| 10 | Provider 注册名统一 | 低 | 别名函数 |
| 11 | workspace.fs | 中 | Node.js fs wrapper |
| 12 | TextDocument 完整属性 | 中 | 映射 buffer 属性 |
| 13 | showTextDocument | 中 | 打开 buffer 窗口 |
| 14 | showInputBox | 中 | 包装已有 |
| 15 | showOpenDialog | 难 | Terminal 无原生对话框 |
| 16 | Decoration (基本高亮) | 中 | 映射到 Neovim highlight |
| 17 | Debug (简化版 DAP 集成) | 很大 | 需要类似 nvim-dap 的集成层 |

---

## 5. 结论

### 核心结论

**可实现的 API ≠ 应该实现的 API**。coc.nvim 的设计定位是 Neovim/Vim 的补全和语言工具框架，不是 VS Code 的克隆。以下原则决定了实现优先级：

1. **LSP 相关 API 应该优先实现** — 这些是 coc 的核心价值（completion、hover、diagnostics、code action 等）
2. **UI 抽象层尽量适配** — statusbar、outputChannel、quickPick 等 UI 组件可以有不同的实现方式，关键 API 签名一致即可
3. **不跨平台的功能不做** — Webview、自定义编辑器、Chat 等功能依赖 Electron/Chromium，不适合 TUI 编辑器

### 百分比概览

| 类别 | 数量（大致） | 占比 |
|------|------------|------|
| 已有/容易适配 | ~80 | ~45% |
| 理论上可实现的 | ~60 | ~34% |
| 无法实现的 | ~38 | ~21% |
| **总计 (vscode 导出 API)** | **~178** | **100%** |
