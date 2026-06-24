# Feasibility Analysis of VS Code API in coc.nvim

Based on coc.nvim's current architecture (essentially a Neovim/Vim plugin running on Node.js with LSP as its core), this analysis evaluates whether each VS Code API can be implemented in coc.nvim.

---

## 1. Implementable (Existing or Easy to Adapt)

These APIs already exist in coc and only need simple renaming/parameter adaptation to map.

| # | VS Code API | Coc Equivalent | Adaptation Method |
|---|-------------|----------|---------|
| 1 | `Position` class (translate/with/compareTo) | `Position` interface | Write a wrapper class wrapping LSP Position. Pure computation logic, no platform dependency |
| 2 | `Range` class (contains/intersection/union) | `Range` interface | Same as above, pure computation logic |
| 3 | `Selection` class | **None** | Extend based on Range class, pure data logic |
| 4 | `MarkdownString` class | **None** | Pure data class, no platform dependency, can be directly implemented |
| 5 | `ThemeColor` | **None** | Simple id wrapper, can be directly implemented |
| 6 | `WorkspaceEdit` class methods | `WorkspaceEdit` interface | Write a wrapper class encapsulating LSP's changes/documentChanges structure |
| 7 | `CodeActionKind` class (append/contains/intersects) | `type CodeActionKind = string` | Implement class wrapping string, pure logic |
| 8 | `InlayHint` class | `InlayHint` interface | Same as above, direct wrapper |
| 9 | `Hover` class | `Hover` interface | Same as above |
| 10 | `CodeLens` class | `CodeLens` interface | Same as above |
| 11 | `DocumentLink` class | `DocumentLink` interface | Same as above |
| 12 | `Disposable.from()` | `Disposable.create()` | Just different factory method naming |
| 13 | `EventEmitter` (naming) | `Emitter` | Just an alias |
| 14 | Provider registration name unification (reference→references, etc.) | Different naming | Just add alias function |
| 15 | `registerOnTypeFormattingEditProvider` parameter style | `string[]` vs rest | Wrapper function |
| 16 | `commands.registerCommand` parameters | `internal` parameter | Optional parameter adaptation |
| 17 | `extensions.getExtension` | `getExtensionById` | Alias |
| 18 | `workspace.getWorkspaceFolder(Uri)` | Accepts `string \| Uri` | Add Uri handling |
| 19 | `languages.match` with TextDocument | Uses TextDocumentMatch | Type adaptation |
| 20 | `createTerminal` returns Promise vs sync | Promise | Add sync version or compatibility layer |
| 21 | `TextEdit` class | `TextEdit` interface | Same as WorkspaceEdit |

### 1.1 Provider Signature Difference Adaptation

All Provider `document` parameters change from `TextDocument` to `LinesTextDocument`:
- `LinesTextDocument` extends `TextDocument`, additionally provides `lineAt()`, `lines`, `end`, `bufnr`
- **Compatible**: Adapt at the interface level; coc can fully use `LinesTextDocument` to satisfy vscode's `TextDocument` interface requirements internally

---

## 2. Theoretically Implementable (Requires Effort)

These APIs are not available in coc, but Neovim has the capability to support them and they need to be implemented.

| # | VS Code API | Implementation Feasibility | Solution |
|---|-------------|-----------|------|
| 1 | `TextLine` (available in vscode, but coc's TextDocument doesn't have lineAt method) | **Feasible - Low** | Already exists in `LinesTextDocument`, needs to be promoted to base `TextDocument` |
| 2 | `EndOfLine` enum | **Feasible - Low** | Enum definition + document property |
| 3 | `workspace.fs` (FileSystem) | **Feasible - Medium** | Coc runs on Node.js, can directly use `fs/promises` to implement `readFile/writeFile/stat/readDirectory/rename/delete`. Challenge: Needs to support pluggable custom file systems at the FileSystemProvider level |
| 4 | `workspace.name` | **Feasible - Low** | Infer from workspaceFolder |
| 5 | `workspace.saveAll()/save()/saveAs()` | **Feasible - Medium** | Call Neovim's write command or Node.js fs |
| 6 | `workspace.updateWorkspaceFolders()` | **Feasible - Medium** | Maintain workspace folder list |
| 7 | `workspace.decode()/encode()` | **Feasible - Low** | `TextEncoder/TextDecoder` |
| 8 | `openTextDocument()` with content option | **Feasible - Medium** | Create temporary buffer or in-memory document |
| 9 | `getLanguages()` | **Feasible - Low** | Convert from `workspace.languageIds` Set |
| 10 | `setTextDocumentLanguage()` | **Feasible - Medium** | Call nvim_buf_set_option to change filetype |
| 11 | `setLanguageConfiguration()` | **Feasible - Medium** | Set buffer indent/comment and other options |
| 12 | `window.showTextDocument()` | **Feasible - Medium** | Open buffer window |
| 13 | `window.showInputBox()` | **Feasible - Medium** | Already have `window.requestInput()`, wrap the signature |
| 14 | `window.showOpenDialog()/showSaveDialog()` | **Feasible - Difficult** | Terminal environment has no native file dialog. Can simulate with `vim.ui.select` or fzf, but much worse experience |
| 15 | `window.setStatusBarMessage()` | **Feasible - Low** | Call `nvim_echo` or `vim.notify` |
| 16 | `window.activeTerminal` | **Feasible - Medium** | Track terminal buffer |
| 17 | `window.onDidChangeActiveTerminal` | **Feasible - Medium** | Listen to BufEnter event |
| 18 | `window.onDidChangeTerminalState` | **Feasible - Medium** | Listen to terminal process state |
| 19 | `window.onDidChangeTextEditorSelection` | **Feasible - Medium** | Listen to Neovim's `TextChanged` or `CursorMoved` events |
| 20 | `window.onDidChangeTextEditorVisibleRanges` | **Feasible - Medium** | Listen to `WinScrolled` event |
| 21 | `window.onDidChangeTextEditorOptions` | **Feasible - Medium** | Listen to OptionSet |
| 22 | `window.createTextEditorDecorationType` | **Feasible - Difficult** | Vim's highlight system is not as flexible as CSS. Gutter icons, overviewRuler, before/after pseudo-elements, etc. cannot be implemented. But basic highlights (background color, underline, color) can be implemented |
| 23 | `window.registerTreeDataProvider` | **Feasible - Medium** | Already have `createTreeView`, need to add provider registration entry |
| 24 | `window.withScmProgress` | **Feasible - Low** | Just a progress wrapper |
| 25 | `DiagnosticCollection` with Uri | **Feasible - Low** | Use `uri.toString()` for key conversion |
| 26 | `Diagnostic` class | **Feasible - Low** | Wrap LSP Diagnostic + code's `{value, target}` form |
| 27 | `DiagnosticSeverity` enum values (0-3 vs 1-4) | **Feasible - Low** | Add/subtract 1 |
| 28 | `TextDocument.fileName/isUntitled/isDirty/isClosed/encoding/eol` | **Feasible - Medium** | Need to get buffer information from Neovim. Most can be obtained via `nvim_buf_get_var/option` |
| 29 | `TextDocument.save()` | **Feasible - Medium** | Call nvim_buf_call + `:write` |
| 30 | `TextDocument.getWordRangeAtPosition()` | **Feasible - Medium** | Use `nvim_get_current_line` + regex |
| 31 | `TextDocument.validateRange()/validatePosition()` | **Feasible - Low** | Pure computation, just clamp values |
| 32 | `window.registerUriHandler` | **Feasible - Medium** | Register protocol handler |
| 33 | `window.registerTerminalLinkProvider` | **Feasible - Medium** | Terminal link detection |
| 34 | `window.registerFileDecorationProvider` | **Feasible - Medium** | File icon decoration |
| 35 | `l10n` namespace | **Feasible - Low** | Plain text localization function |
| 36 | `authentication` namespace | **Feasible - Medium** | Requires authentication storage and GUI interaction (OAuth flow needs browser) |
| 37 | `extensions.onDidChange` | **Feasible - Low** | Already have three specific events, just merge them |
| 38 | `Uri` class | **Feasible - Medium** | Wrap `URI.parse/URI.file` (vscode-uri npm package can be reused directly) |
| 39 | `CompletionItem` class | **Feasible - Low** | Wrap LSP CompletionItem |
| 40 | `CompletionList` class | **Feasible - Low** | Same as above |
| 41 | `DocumentSymbol` class | **Feasible - Low** | Same as above |
| 42 | `SymbolInformation` class | **Feasible - Low** | Same as above |
| 43 | `CodeAction` class | **Feasible - Low** | Same as above + `data` field migration |
| 44 | `SignatureInformation` class | **Feasible - Low** | Same as above |
| 45 | `ParameterInformation` class | **Feasible - Low** | Same as above |
| 46 | `CallHierarchyItem` class | **Feasible - Low** | Same as above |
| 47 | `TypeHierarchyItem` class | **Feasible - Low** | Same as above |
| 48 | `LinkedEditingRanges` class | **Feasible - Low** | Same as above |
| 49 | `SelectionRange` class | **Feasible - Low** | Same as above |
| 50 | `EvaluatableExpression` class | **Feasible - Low** | Same as above |
| 51 | `InlineValue` series | **Feasible - Low** | Same as above (but only useful in debug scenarios) |
| 52 | `SnippetTextEdit` | **Feasible - Low** | Combine SnippetString + TextEdit |
| 53 | `NotebookEdit` | **Feasible - Low** | Notebook not implemented but type can exist |
| 54 | `WorkspaceEditEntryMetadata` | **Feasible - Low** | Interface definition |
| 55 | `TextDocumentWillSaveEvent` / `WillSaveEvent` | **Feasible - Medium** | Listen to BufWritePre event |
| 56 | `TextDocumentChangeEvent` (replaces DidChangeTextDocumentParams) | **Feasible - Medium** | Wrap LSP event |
| 57 | `window.activeColorTheme` / `onDidChangeActiveColorTheme` | **Feasible - Medium** | Detect vim's background option |
| 58 | `window.state` / `onDidChangeWindowState` | **Feasible - Medium** | Listen to FocusGained/FocusLost |
| 59 | `env` namespace (partial) | **Feasible - Medium** | language/appRoot/appName/machineId/sessionId/clipboard/openExternal can be implemented. clipboard can use Neovim's clipboard provider |
| 60 | `tasks` namespace (simplified) | **Feasible - Medium** | Neovim has job control API, can implement a subset of TaskProvider/TaskExecution |

---

## 3. Not Implementable (Root Causes)

These APIs **cannot be implemented in coc.nvim** because the Neovim/Vim platform fundamentally does not support the required infrastructure.

### 3.1 Requires GUI/Web Rendering Engine

| # | VS Code API | Reason for Not Being Implementable |
|---|-------------|--------------|
| 1 | **`WebviewPanel` / `createWebviewPanel`** | Requires built-in Chromium/HTML rendering engine. Neovim only has TUI text interface. While floating windows can be created with `nvim_open_win`, HTML/CSS/JS cannot be rendered. **Cannot be resolved** |
| 2 | **`registerWebviewPanelSerializer`** | Same as above, depends on webview |
| 3 | **`registerWebviewViewProvider`** | Same as above, embed webview in sidebar |
| 4 | **`CustomEditorProvider` / `CustomTextEditorProvider` / `CustomReadonlyEditorProvider`** | Custom editors depend on webview or a complete editor replacement interface. Neovim does not have an embeddable custom editor framework |
| 5 | **`chat` namespace** | GitHub Copilot Chat has its own UI (webview chat panel). Without webview, the chat interface cannot be rendered. Furthermore, the lm (language model) API also depends on chat context |
| 6 | **`lm` namespace** | Language Model API is designed for Copilot, invocation requires chat infrastructure. The core is LLM chat completion, which can be simulated with floating windows in TUI but the experience gap is large |
| 7 | **`ThemeIcon` (with id)** | (Partially implementable) `ThemeIcon.File/Folder` refers to icons in the file icon theme; Neovim has no concept of "file icon theme". Plugins like vim-devicons use characters, not icon classes |

### 3.2 Requires VS Code Editor Architecture

| # | VS Code API | Reason for Not Being Implementable |
|---|-------------|--------------|
| 8 | **`debug` namespace** | VS Code's debugger is deeply integrated: it has a complete implementation of the Debug Adapter Protocol, call stack view, variable inspection/modification, Watch expressions, breakpoint management UI, and debug toolbar. Neovim has the nvim-dap plugin providing a DAP client, but coc.nvim as a completion framework does not and should not provide a full debugger. This is not coc's design goal |
| 9 | **`breakpoints` / `Breakpoint` series** | Depends on debug namespace |
| 10 | **`comment` / `CommentController` / `CommentThread`** | In-file comment system requires editor sidebar and inline UI (e.g., GitHub Pull Request code review comments). Neovim does not have this kind of inline comment UI framework |
| 11 | **`scm` namespace** | Source control management requires file status decorations, inline diff views, stage/unstage UI, and commit editor. Although Neovim has plugins like gitsigns, coc as a separate Node.js process can hardly provide a complete SCM API |
| 12 | **`Tab` / `TabGroup` / `TabInput*`** | VS Code's tabbed editor model (preview tabs, pinned tabs, split tabs, tab groups) is fundamentally different from Neovim's buffer/window/tabpage model. Conceptually not mappable |
| 13 | **`ViewColumn`** | VS Code has a column-based multi-editor layout (up to 3 columns), while Neovim's windows are freely split without a fixed "column" concept |
| 14 | **`TextEditor.viewColumn`** | Same as above, editor has no "column number" |
| 15 | **`window.tabGroups`** | Depends on Tab/TabGroup concept |
| 16 | **`showNotebookDocument` / `visibleNotebookEditors` / `activeNotebookEditor`** | Notebook documents require cell editor UI, which cannot be simulated by ordinary text buffers |

### 3.3 Requires VS Code Extension Runtime Mechanism

| # | VS Code API | Reason for Not Being Implementable |
|---|-------------|--------------|
| 17 | **`tests` namespace** | VS Code's testing API (TestController/TestRun/TestItem) integrates test explorer UI, test coverage highlighting, and test run progress. Neovim has no concept of a test explorer. Although there are plugins like vim-test, they are incompatible with coc's architecture |
| 18 | **`ExtensionTerminalOptions` / `Pseudoterminal`** | `Pseudoterminal` allows extensions to implement their own "terminal" (via write/close callbacks). This requires VS Code's terminal process management and pty layer. Neovim's `:terminal` is built-in and does not support custom terminal backends |
| 19 | **`DataTransfer` / `DataTransferFile` / `DataTransferItem`** | Drag and drop API depends on OS-level drag and drop events. Neovim in TUI mode has no drag and drop events |
| 20 | **`registerDocumentDropEditProvider` / `registerDocumentPasteEditProvider`** | Same as above, depends on drag and drop and clipboard rich media paste. Neovim has no paste event interception API |
| 21 | **`CustomExecution` / `ShellExecution` / `ProcessExecution`** | This is part of the tasks API, depends on VS Code's task execution engine |

### 3.4 Requires VS Code SCM/Explorer Integration

| # | VS Code API | Reason for Not Being Implementable |
|---|-------------|--------------|
| 22 | **`FileDecorationProvider`** | File decorations (badges, colors) are displayed in VS Code's file explorer. Neovim has no built-in file explorer, so there is no place to display decorations. Plugins like NvimTree have their own decoration mechanisms |
| 23 | **`scm` (complete)** | SCM needs to display SCM status in multiple places such as file explorer, editor, and status bar. Neovim does not have a unified SCM display framework |

### 3.5 Requires VS Code Low-Level Platform Capabilities

| # | VS Code API | Reason for Not Being Implementable |
|---|-------------|--------------|
| 24 | **`FileSystemProvider`** | Custom virtual file systems require VS Code's file system abstraction layer. coc can use LSP's `workspace/configuration` and file operation requests, but cannot implement pluggable virtual file systems (like `memfs`, `zipfs`). Because coc does not control how Neovim reads and writes files |
| 25 | **`AuthenticationProvider` / `getSession`** | (Partially implementable) OAuth flow requires opening a browser for authentication. This can be done in a TUI environment (`openExternal`), but the experience is not as good as VS Code. However, authentication token storage and management can be implemented |
| 26 | **`window.showOpenDialog`/`showSaveDialog` (native)** | Native file dialog depends on the GUI framework Electron. In TUI it can be simulated with fzf/vim.ui.select, but the caller expects `Uri[]`, which can be replaced with a file picker |
| 27 | **`env.clipboard`** | (Partially implementable) Neovim has `vim.fn.getreg('+')` to read the system clipboard, but cannot provide VS Code's `Clipboard` interface (readText/writeText Promise style). Technically implementable but coc does not have this API |

### 3.6 Not Implementable Due to Different Design Philosophies

| # | VS Code API | Reason for Not Being Implementable |
|---|-------------|--------------|
| 28 | **`TextEditorDecorationType` full rendering options** | VS Code's decoration supports `before`/`after` pseudo-elements, `outline`, `border-radius`, `gutterIconSize`, `overviewRulerLane`, and other CSS-level rendering controls. Neovim's highlight only supports basic attributes like foreground color, background color, bold, italic, underline, strikethrough, etc. CSS-style decoration options (border, outline, opacity, letterSpacing, etc.) **cannot be implemented at all** |
| 29 | **`StatusBarAlignment`** | VS Code's status bar supports left/right alignment. Vim's status bar is a simple string that does not support multi-region alignment. Although it can be formatted with `%l` etc., it cannot achieve VS Code's level of precision |
| 30 | **`StatusBarItem.id/name/alignment/tooltip/color/backgroundColor/command`** | A Vim status bar item is essentially a string. Color can be set with `%#HL#` escape sequences (limited support), tooltip is meaningless (because TUI has no tooltip concept), and command click requires Neovim's `statusline` click events (only Neovim 0.10+ with limited support). Cannot be fully implemented |
| 31 | **`TerminalOptions.location/iconPath/color/hideFromUser/message/isTransient`** | Neovim's terminal opens in a buffer, with no concept of "location selection" (editor area or panel area), icons, color markers, hide from user, message prompts, or transient terminals |
| 32 | **`env.uiKind`** | VS Code distinguishes between desktop and web UI. Neovim is a TUI, with no concept of UI kind |
| 33 | **`env.remoteName`** | Remote identifier for VS Code Remote Development. coc has no remote concept |
| 34 | **`env.appHost` / `env.appRoot` / `env.appName`** | VS Code's desktop application environment information. Not applicable to Neovim |
| 35 | **`env.shell`** | VS Code's integrated shell information. Neovim does not track this |

---

## 4. Summary of All Missing Features

### 4.1 Completely Not Implementable (Fundamental Limitations)

| # | Feature | Category | Fundamental Limitation |
|---|------|------|---------|
| 1 | Webview (panel/view/serializer) | GUI/Rendering | Neovim has no HTML rendering engine |
| 2 | Notebooks | GUI/Rendering | Cell editor requires webview or custom editor |
| 3 | Chat / LM API | GUI/Rendering | Copilot Chat panel depends on webview |
| 4 | CustomEditor | GUI/Rendering | Custom editor requires webview |
| 5 | Debug (complete) | Editor Architecture | DAP UI requires sidebar, toolbar, inline decorations |
| 6 | Comment system | Editor Architecture | Inline comment UI requires VS Code's sidebar system |
| 7 | SCM (complete) | Editor Architecture | File status decorations and diff editor |
| 8 | Tests | Editor Architecture | Test explorer and coverage highlighting |
| 9 | Tab/TabGroup | Editor Architecture | Buffer/window model is fundamentally different |
| 10 | Pseudoterminal | Extension Runtime | Custom terminal backend requires pty integration |
| 11 | DataTransfer/Drop | Extension Runtime | TUI has no drag and drop events |
| 12 | FileSystemProvider | Platform Capability | coc does not control Neovim file IO |
| 13 | Decoration CSS properties | Design Philosophy | Vim highlight capability is limited |
| 14 | StatusBar rich properties | Design Philosophy | Vim status bar is plain text |
| 15 | Editor column/tab concepts | Design Philosophy | Neovim editor model is different |

### 4.2 Theoretically Implementable But Not Yet in coc

| # | Feature | Effort | Obstacle |
|---|------|--------|------|
| 1 | Uri class | Low | Reuse `vscode-uri` npm package directly |
| 2 | Position/Range/Selection class | Low | Pure computation logic |
| 3 | MarkdownString class | Low | Pure data class |
| 4 | ThemeColor | Low | Simple wrapper |
| 5 | CodeActionKind class | Low | Pure string operations |
| 6 | WorkspaceEdit class | Low | Wrap LSP structure |
| 7 | EndOfLine enum | Low | Enum definition |
| 8 | Disposable.from() | Low | Factory method |
| 9 | EventEmitter → Emitter alias | Low | Re-export |
| 10 | Provider registration name unification | Low | Alias function |
| 11 | workspace.fs | Medium | Node.js fs wrapper |
| 12 | TextDocument complete properties | Medium | Map buffer properties |
| 13 | showTextDocument | Medium | Open buffer window |
| 14 | showInputBox | Medium | Wrap existing |
| 15 | showOpenDialog | Difficult | Terminal has no native dialog |
| 16 | Decoration (basic highlights) | Medium | Map to Neovim highlight |
| 17 | Debug (simplified DAP integration) | Very Large | Requires an integration layer similar to nvim-dap |

---

## 5. Conclusion

### Core Conclusion

**Implementable APIs ≠ APIs that should be implemented**. coc.nvim's design positioning is a completion and language tool framework for Neovim/Vim, not a clone of VS Code. The following principles determine implementation priorities:

1. **LSP-related APIs should be prioritized** — These are coc's core value (completion, hover, diagnostics, code action, etc.)
2. **UI abstraction layer should be adapted as much as possible** — UI components like statusbar, outputChannel, quickPick can have different implementations; the key is consistent API signatures
3. **Don't implement features that won't work across platforms** — Webview, custom editors, Chat, and other features depend on Electron/Chromium and are not suitable for TUI editors

### Percentage Overview

| Category | Quantity (Approximate) | Percentage |
|------|------------|------|
| Existing/Easy to Adapt | ~80 | ~45% |
| Theoretically Implementable | ~60 | ~34% |
| Not Implementable | ~38 | ~21% |
| **Total (vscode exported APIs)** | **~178** | **100%** |
