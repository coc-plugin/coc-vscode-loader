# VS Code Extension API vs coc.nvim API 完整对比

对比依据：
- VS Code: `src/vscode-dts/vscode.d.ts` (21235 行)
- coc.nvim: `typings/index.dts` (13327 行)

---

## 目录

1. [总览](#1-总览)
2. [核心类型](#2-核心类型)
3. [编辑器 API](#3-编辑器-api)
4. [`window` 命名空间](#4-window-命名空间)
5. [`workspace` 命名空间](#5-workspace-命名空间)
6. [`languages` 命名空间](#6-languages-命名空间)
7. [`commands` 命名空间](#7-commands-命名空间)
8. [`extensions` 命名空间](#8-extensions-命名空间)
9. [`env` 命名空间](#9-env-命名空间)
10. [Provider 接口对比](#10-provider-接口对比)
11. [完整缺失的 vscode 功能](#11-完整缺失的-vscode-功能)
12. [coc 特有 API（vscode 没有的）](#12-coc-特有-apivscode-没有的)

---

## 1. 总览

| 方面 | VS Code | coc.nvim |
|------|---------|----------|
| 导出总数 | ~524 (≈776 含内部类型) | ~536 (≈653 含 LSP 内部类型) |
| 命名空间 | 15 (`window`, `workspace`, `languages`, `commands`, `env`, `extensions`, `debug`, `tasks`, `notebooks`, `scm`, `tests`, `authentication`, `l10n`, `chat`, `lm`) | 4 (`window`, `workspace`, `languages`, `commands`) + `snippetManager` |
| 架构 | 丰富的 class + interface + enum + namespace | 偏 LSP 风格，多数为 interface + factory namespace，enum 用 type alias |
| Uri 方案 | `class Uri` | `class Uri` + `type DocumentUri = string` |
| 文档模型 | `TextDocument` (完整) | `TextDocument` (精简) + `LinesTextDocument` (扩展) |
| LSP 集成 | 底层封装 | 原生 LSP 类型贯穿始终 |

---

## 2. 核心类型

### 2.1 Position

| 项目 | VS Code (class) | coc.nvim (LSP interface) | 差异 |
|------|-----------------|--------------------------|------|
| 类型 | `class` (有 constructor) | `interface` | **根本不同** |
| 字段类型 | `line: number`, `character: number` | `line: uinteger`, `character: uinteger` | coc 用 `uinteger` |
| isBefore() | 有 | **无** | vscode 独有 |
| isBeforeOrEqual() | 有 | **无** | vscode 独有 |
| isAfter() | 有 | **无** | vscode 独有 |
| isAfterOrEqual() | 有 | **无** | vscode 独有 |
| compareTo() | 有 | **无** | vscode 独有 |
| translate() | 有 | **无** | vscode 独有 |
| with() | 有 | **无** | vscode 独有 |
| 构造方式 | `new Position(1, 2)` | `Position.create(1, 2)` | 工厂 vs 构造函数 |

### 2.2 Range

| 项目 | VS Code (class) | coc.nvim (interface) | 差异 |
|------|-----------------|----------------------|------|
| isEmpty | `getter` | **无** | vscode 独有 |
| isSingleLine | `getter` | **无** | vscode 独有 |
| contains() | 有 | **无** | vscode 独有 |
| intersection() | 有 | **无** | vscode 独有 |
| union() | 有 | **无** | vscode 独有 |
| with() | 有 | **无** | vscode 独有 |

### 2.3 Selection

| 项目 | VS Code | coc.nvim |
|------|---------|----------|
| `class Selection extends Range` | 有 | **无** |
| anchor/active/isReversed | 有 | **无** |

### 2.4 Uri

| 项目 | VS Code | coc.nvim | 差异 |
|------|---------|----------|------|
| `class Uri` | 有 | 有 | coc 构造器为 `protected` |
| scheme/authority/path/query/fragment/fsPath | 有 | 有 | 相同 |
| Uri.parse() / Uri.file() / Uri.from() | 有 | 有 | 相同 |
| with() / toString() / toJSON() | 有 | 有 | 相同 |
| Uri.joinPath() | 有 | **无** | vscode 独有 |
| Uri.isUri() | **无** | 有 | coc 独有 |
| `type DocumentUri = string` | **无** | 有 | coc 独有（LSP 风格） |

### 2.5 TextDocument

| 字段/方法 | VS Code | coc.nvim (TextDocument) | coc.nvim (LinesTextDocument) |
|-----------|---------|------------------------|----------------------------|
| uri | `Uri` | `DocumentUri` (string) | — |
| fileName | 有 | **无** | — |
| isUntitled | 有 | **无** | — |
| languageId | 有 | 有 | — |
| encoding | 有 | **无** | — |
| version | `number` | `integer` | — |
| isDirty | 有 | **无** | — |
| isClosed | 有 | **无** | — |
| save() | 有 | **无** | — |
| eol | `EndOfLine` enum | **无** | `eol: boolean` (额外字段) |
| lineCount | `number` | `uinteger` | — |
| lineAt() | 有 (返回 TextLine) | **无** | 有 (返回 TextLine) |
| offsetAt() | 有 | 有 | — |
| positionAt() | 有 | 有 | — |
| getText(range?) | 有 | 有 | — |
| getWordRangeAtPosition() | 有 | **无** | — |
| validateRange() | 有 | **无** | — |
| validatePosition() | 有 | **无** | — |

### 2.6 TextLine

| 字段 | VS Code | coc.nvim | 差异 |
|------|---------|----------|------|
| lineNumber, text, range, rangeIncludingLineBreak, firstNonWhitespaceCharacterIndex, isEmptyOrWhitespace | 一致 | 一致 | **完全相同** |

### 2.7 EndOfLine

| 项目 | VS Code | coc.nvim |
|------|---------|----------|
| `enum EndOfLine { LF=1, CRLF=2 }` | 有 | **无** (用 `eol: boolean` 替代) |

### 2.8 CancellationToken / CancellationTokenSource

| 类型 | VS Code | coc.nvim | 差异 |
|------|---------|----------|------|
| CancellationToken | interface | interface (同字段) | coc 额外有 `namespace` 含 `None`, `Cancelled`, `is()` |
| CancellationTokenSource | class | class | 基本相同 |
| CancellationError | class extends Error | class extends Error | 相同 |
| AbstractCancellationTokenSource | **无** | 有 (interface extends Disposable) | coc 独有 |

### 2.9 Disposable

| 项目 | VS Code (class) | coc.nvim (interface) | 差异 |
|------|-----------------|----------------------|------|
| dispose() | 返回 `any` | 返回 `void` | 返回值不同 |
| 构造方式 | `new Disposable(() => void)` | `Disposable.create(() => void)` | 工厂 vs 构造函数 |
| Disposable.from() | 有 | **无** | vscode 独有 |

### 2.10 Event / EventEmitter

| 项目 | VS Code | coc.nvim | 差异 |
|------|---------|----------|------|
| 名称 | `EventEmitter<T>` | `Emitter<T>` | **命名不同** |
| fire() 返回 | `void` | `any` | 返回值不同 |
| EmitterOptions | **无** | 有 (onFirstListenerAdd/onLastListenerRemove) | coc 独有 |
| Event.None | **无** | 有 | coc 独有 |

### 2.11 Command

| 字段 | VS Code | coc.nvim | 差异 |
|------|---------|----------|------|
| title | 有 | 有 | 相同 |
| command | 有 | 有 | 相同 |
| tooltip? | 有 | **无** | vscode 独有 |
| arguments? | `any[]` | `LSPAny[]` | 类型不同 |

### 2.12 MarkdownString

| 项目 | VS Code | coc.nvim |
|------|---------|----------|
| `class MarkdownString` | 有 (含 appendText/appendMarkdown/appendCodeblock, isTrusted, supportThemeIcons, supportHtml, baseUri) | **无** (coc 用 `MarkedString = string \| {language, value}`) |

### 2.13 ThemeColor / ThemeIcon

| 项目 | VS Code | coc.nvim |
|------|---------|----------|
| `class ThemeColor` | 有 | **无** |
| `class ThemeIcon` | 有 (含 File/Folder 静态, id, color) | **无** |

### 2.14 SnippetString

| 项目 | VS Code | coc.nvim | 差异 |
|------|---------|----------|------|
| value | `string` | `string` | 相同 |
| appendText/appendTabstop/appendPlaceholder/appendChoice/appendVariable | 一致 | 一致 | **相同** |

### 2.15 TextEdit

| 项目 | VS Code (class) | coc.nvim (interface) | 差异 |
|------|-----------------|----------------------|------|
| range | `Range` | `Range` | 相同 |
| newText | `string` | `string` | 相同 |
| 构造 | `new TextEdit(range, newText)` | `TextEdit.replace/insert/del` | 工厂 vs 构造函数 |

### 2.16 WorkspaceEdit

| 项目 | VS Code (class) | coc.nvim (interface) | 差异 |
|------|-----------------|----------------------|------|
| 类型 | `class` 有 methods (replace/insert/delete/set/get/has/entries/size) | `interface` (纯 LSP: changes/documentChanges) | **完全不同的使用方式** |
| entries() / size | 有 | **无** | — |
| uri 参数 | `Uri` | `DocumentUri` (string) | — |

### 2.17 Hover

| 项目 | VS Code (class) | coc.nvim (interface) | 差异 |
|------|-----------------|----------------------|------|
| contents | `Array<MarkdownString \| MarkedString>` | `MarkupContent \| MarkedString \| MarkedString[]` | 类型不同 |
| range? | 有 | 有 | 相同 |
| 构造 | `new Hover(contents, range?)` | 直接构造 `{ contents, range }` 对象 | coc 无工厂方法 |

### 2.18 枚举值偏移（LSP 1-based vs vscode 0-based）

coc 使用 LSP 协议风格（值从 1 开始），而 vscode 多数枚举从 0 开始。除 `DiagnosticSeverity` 外，以下枚举也存在相同偏移：

| 枚举 | vscode | coc | 差异 |
|------|--------|-----|------|
| `CompletionItemKind` | `Text = 0` | `Text: 1` | 偏移 1 |
| `SymbolKind` | `File = 0` | `File: 1` | 偏移 1 |
| `DocumentHighlightKind` | `Text = 0` | `Text: 1` | 偏移 1 |
| `InlineCompletionTriggerKind` | `Invoke = 0` | `Invoked: 1` | 偏移 1 + 命名不同 |
| `CompletionTriggerKind` | `Invoke = 0` | `Invoked: 1` | 偏移 1 + 命名不同 |
| `CodeActionTriggerKind` | `Invoke = 1` | `Invoked: 1` | 值相同，命名不同 |
| `SignatureHelpTriggerKind` | `Invoke = 1` | `Invoked: 1` | 值相同，命名不同 |

**注意命名差异：** vscode 统一使用 `Invoke`（动词原形），coc 遵循 LSP 规范使用 `Invoked`（过去分词）。

---

## 3. 编辑器 API

### 3.1 TextEditor

| 字段/方法 | VS Code | coc.nvim | 差异 |
|-----------|---------|----------|------|
| document | `TextDocument` | `TextDocument` | vscode: `uri` 是 Uri；coc: 多 `bufnr`, `winid` |
| selection(s) | 有 | 有 | coc 只有 single selection (vscode 有多光标) |
| visibleRanges | 有 | 有 | 相同 |
| options | 有 | 有 | vscode 含 tabSize/indentSize/insertSpaces/cursorStyle/lineNumbers；coc 含 tabSize/insertSpaces 及其他 |
| viewColumn | 有 | **无** | coc 没有列概念 |
| edit() | 有 | 有 | 相同模式 |
| insertSnippet() | 有 | **无** | coc 用 `workspace.applyEdit` 或 `snippetManager` |
| setDecorations() | 有 | **无** | coc 用 `BufferHighlight` / `highlight` API |
| revealRange() | 有 | **无** | coc 用 `window.moveTo` |
| hide()/show() | 有 (deprecated) | **无** | — |

### 3.2 TextEditorEdit

| 方法 | VS Code | coc.nvim |
|------|---------|----------|
| replace / insert / delete / setEndOfLine | 有 | **无直接等价** (coc 用 `TextEdit` 操作) |

### 3.3 Decoration System

| 项目 | VS Code | coc.nvim |
|------|---------|----------|
| TextEditorDecorationType | 有 (key, dispose) | **无** — 用 `BufferClearHighlight` / `BufferHighlight` |
| DecorationRenderOptions | 丰富 (backgroundColor, outline, border, gutterIcon, overviewRuler, before/after 等) | coc 的 highlight 系统基于 vim 的命名空间高亮 |
| 机制 | 程序化 decoration | vim `nvim_buf_add_highlight` 模式 |

### 3.4 ViewColumn

| 项目 | VS Code | coc.nvim |
|------|---------|----------|
| `enum ViewColumn { Active= -1, Beside= -2, One~Nine }` | 有 | **无** (Neovim 没有列概念) |

---

## 4. `window` 命名空间

### 4.1 编辑器相关

| API | VS Code | coc.nvim | 差异 |
|-----|---------|----------|------|
| activeTextEditor | 有 | 有 | 相同 |
| visibleTextEditors | 有 | 有 | 相同 |
| onDidChangeActiveTextEditor | 有 | 有 | 相同 |
| onDidChangeVisibleTextEditors | 有 | 有 | 相同 |
| **onDidChangeTextEditorSelection** | 有 | **无** | — |
| **onDidChangeTextEditorVisibleRanges** | 有 | **无** | — |
| **onDidChangeTextEditorOptions** | 有 | **无** | — |
| **onDidChangeTextEditorViewColumn** | 有 | **无** | — |
| **showTextDocument()** | 有 | **无** | coc 无等价 API |

### 4.2 消息对话框

| API | VS Code | coc.nvim | 差异 |
|-----|---------|----------|------|
| showInformationMessage | 有 (4 overloads) | 有 (2 overloads) | coc 缺少 MessageOptions 变体 |
| showWarningMessage | 有 (4 overloads) | 有 (2 overloads) | 同上 |
| showErrorMessage | 有 (4 overloads) | 有 (2 overloads) | 同上 |

### 4.3 输入/选择

| API | VS Code | coc.nvim | 差异 |
|-----|---------|----------|------|
| showQuickPick | 有 (4 overloads) | 有 | 签名基本一致 |
| showWorkspaceFolderPick | 有 | **无** | — |
| createQuickPick() | 返回 `QuickPick<T>` | 返回 `Promise<QuickPick<T>>` | 同步 vs Promise |
| showInputBox | 有 | **无** | coc 用 `requestInput` 和 `createInputBox` 替代 |
| createInputBox() | 返回 `InputBox` | 返回 `Promise<InputBox>` (参数不同) | 签名完全不同 |

### 4.4 文件对话框

| API | VS Code | coc.nvim |
|-----|---------|----------|
| showOpenDialog | 有 | **无** |
| showSaveDialog | 有 | **无** |

### 4.5 输出通道

| API | VS Code | coc.nvim | 差异 |
|-----|---------|----------|------|
| createOutputChannel(name, languageId?) | 有 (2 params) | 有 (1 param) | coc 没有 `languageId` 参数, 无 LogOutputChannel |
| OutputChannel.replace() | 有 | **无** | — |
| OutputChannel.clear() | `clear()` | `clear(keep?: number)` | coc 可保留 N 行 |

### 4.6 状态栏

| API | VS Code | coc.nvim | 差异 |
|-----|---------|----------|------|
| createStatusBarItem(id, alignment?, priority?) | 有 (3 params) | `createStatusBarItem(priority?, option?)` | 无 id/alignment 参数 |
| setStatusBarMessage | 有 (3 overloads) | **无** | — |
| StatusBarAlignment enum | 有 | **无** | coc 用数字优先级 |
| StatusBarItem.id/name/alignment | 有 | **无** | — |
| StatusBarItem.tooltip/color/backgroundColor/command | 有 | **无** | — |

### 4.7 终端

| API | VS Code | coc.nvim | 差异 |
|-----|---------|----------|------|
| createTerminal(options) | 返回 `Terminal` | 返回 `Promise<Terminal>` | Promise vs 同步 |
| activeTerminal | 有 | **无** | — |
| onDidChangeActiveTerminal | 有 | **无** | — |
| onDidChangeTerminalState | 有 | **无** | — |
| onDidOpenTerminal | 有 | 有 | 相同 |
| onDidCloseTerminal | 有 | 有 | 相同 |
| TerminalOptions.cwd | `string \| Uri` | `string` | Uri 不支持 |
| TerminalOptions.hideFromUser/message/iconPath/color/location/isTransient | 有 | **无** | — |
| Pseudoterminal / ExtensionTerminalOptions | 有 | **无** | — |
| Terminal.processId | `Thenable<number \| undefined>` | `Promise<number>` | 类型不同 |
| Terminal.shellIntegration / state | 有 | **无** | — |

### 4.8 进度

| API | VS Code | coc.nvim | 差异 |
|-----|---------|----------|------|
| withProgress | 有 | 有 | `Thenable` vs `Promise` |
| withScmProgress | 有 | **无** | — |
| ProgressOptions | `{location, title?, cancellable?}` | `{title?, cancellable?}` | coc 无 `location` 字段 |

### 4.9 树状视图

| API | VS Code | coc.nvim | 差异 |
|-----|---------|----------|------|
| createTreeView | 有 | 有 | 签名相同 |
| registerTreeDataProvider | 有 | **无** | — |

### 4.10 Webview

| API | VS Code | coc.nvim |
|-----|---------|----------|
| createWebviewPanel | 有 | **无** |
| registerWebviewPanelSerializer | 有 | **无** |
| registerWebviewViewProvider | 有 | **无** |

### 4.11 其他 window API

| API | VS Code | coc.nvim |
|-----|---------|----------|
| tabGroups / Tab / TabGroup | 有 | **无** |
| state (WindowState) / onDidChangeWindowState | 有 | **无** |
| activeColorTheme / onDidChangeActiveColorTheme | 有 | **无** |
| registerUriHandler | 有 | **无** |
| registerTerminalLinkProvider / registerTerminalProfileProvider | 有 | **无** |
| registerFileDecorationProvider | 有 | **无** |
| registerCustomEditorProvider | 有 | **无** |

---

## 5. `workspace` 命名空间

### 5.1 属性

| API | VS Code | coc.nvim | 差异 |
|-----|---------|----------|------|
| rootPath | `string \| undefined` | `string` | vscode 可 undefined |
| workspaceFolders | `WorkspaceFolder[] \| undefined` | `ReadonlyArray<WorkspaceFolder>` | coc 始终是数组 |
| name | `string \| undefined` | **无** | — |
| workspaceFile | `Uri \| undefined` | **无** | — |
| textDocuments | `TextDocument[]` | `ReadonlyArray<LinesTextDocument>` | 类型不同 |
| **fs** (FileSystem) | 有 (readFile/writeFile/stat/readDirectory/createDirectory/delete/rename) | **无** | — |
| isTrusted | `boolean` | `= true` (硬编码) | coc 不支持信任机制 |
| notebookDocuments | 有 | **无** | — |

### 5.2 文档事件

| API | VS Code | coc.nvim | 差异 |
|-----|---------|----------|------|
| onDidOpenTextDocument | `Event<TextDocument>` | `Event<LinesTextDocument & {bufnr}>` | coc 带 bufnr |
| onDidCloseTextDocument | `Event<TextDocument>` | `Event<LinesTextDocument & {bufnr}>` | 同上 |
| onDidChangeTextDocument | `Event<TextDocumentChangeEvent>` | `Event<DidChangeTextDocumentParams>` | **LSP 格式不同** |
| onWillSaveTextDocument | `Event<TextDocumentWillSaveEvent>` | `Event<WillSaveEvent>` | 类型不同 |
| onDidSaveTextDocument | `Event<TextDocument>` | `Event<LinesTextDocument>` | 类型不同 |
| onDidChangeConfiguration | `Event<ConfigurationChangeEvent>` | `Event<ConfigurationChangeEvent>` | **相同** |

### 5.3 文件事件

| API | VS Code | coc.nvim | 差异 |
|-----|---------|----------|------|
| onDidCreateFiles / onDidRenameFiles / onDidDeleteFiles | 有 | 有 | **相同** |
| onWillCreateFiles / onWillRenameFiles / onWillDeleteFiles | 有 | 有 | **相同** |

### 5.4 函数

| API | VS Code | coc.nvim | 差异 |
|-----|---------|----------|------|
| getConfiguration() | `Thenable<T>` | `Promise<T>` | Thenable vs Promise |
| openTextDocument(uri) | `Thenable<TextDocument>` | `Promise<Document>` | 返回类型不同 |
| openTextDocument(options) with `{language, content}` | 有 | **无** | coc 不能用内存内容创建虚拟文档 |
| registerTextDocumentContentProvider | 有 | 有 | **相同** |
| registerFileSystemProvider | 有 | **无** | — |
| createFileSystemWatcher | 有 | 有 | **相同** |
| findFiles | 有 | 有 | **相同** |
| applyEdit | 有 | 有 | **相同** |
| asRelativePath | 有 | 有 | **相同** |
| getWorkspaceFolder | `(uri: Uri)` | `(uri: string \| Uri)` | coc 额外接受 string |
| updateWorkspaceFolders | 有 | **无** | — |
| saveAll / save / saveAs | 有 | **无** | — |
| decode / encode (Uint8Array <-> string) | 有 | **无** | — |

### 5.5 WorkspaceFolder

| 字段 | VS Code | coc.nvim |
|------|---------|----------|
| uri | `Uri` | `string` |
| name | `string` | `string` |
| index | `number` | **无** |

---

## 6. `languages` 命名空间

### 6.1 基础函数

| API | VS Code | coc.nvim | 差异 |
|-----|---------|----------|------|
| getLanguages(): `Thenable<string[]>` | 有 | **无** (用 `workspace.languageIds` Set) | 替代方式 |
| setTextDocumentLanguage() | 有 | **无** | — |
| match(selector, document) | 有 | 有 | coc 用 `TextDocumentMatch` 替代 `TextDocument` |
| createDiagnosticCollection | 有 | 有 | **相同** |
| createLanguageStatusItem | 有 | **无** | — |
| getDiagnostics / onDidChangeDiagnostics | 有 | **无** (coc 在 `diagnosticManager` 提供, 事件名为 `onDidRefresh`) | 位置/命名不同 |

### 6.2 Provider 注册函数

| 注册器 | VS Code 名称 | coc 名称 | 签名差异 |
|--------|-------------|---------|---------|
| CompletionItemProvider | `registerCompletionItemProvider` | `registerCompletionItemProvider` | coc 多了 `name`, `shortcut`, `priority`, `allCommitCharacters` 参数 |
| InlineCompletionItemProvider | `registerInlineCompletionItemProvider` | `registerInlineCompletionItemProvider` | **相同** |
| HoverProvider | `registerHoverProvider` | `registerHoverProvider` | **相同** |
| DefinitionProvider | `registerDefinitionProvider` | `registerDefinitionProvider` | **相同** |
| DeclarationProvider | `registerDeclarationProvider` | `registerDeclarationProvider` | **相同** |
| TypeDefinitionProvider | `registerTypeDefinitionProvider` | `registerTypeDefinitionProvider` | **相同** |
| ImplementationProvider | `registerImplementationProvider` | `registerImplementationProvider` | **相同** |
| ReferenceProvider | `registerReferenceProvider` | `registerReferencesProvider` | **命名不同** (coc 是复数 `References`) |
| DocumentHighlightProvider | `registerDocumentHighlightProvider` | `registerDocumentHighlightProvider` | **相同** |
| DocumentSymbolProvider | `registerDocumentSymbolProvider` | `registerDocumentSymbolProvider` | **相同** |
| WorkspaceSymbolProvider | `registerWorkspaceSymbolProvider` | `registerWorkspaceSymbolProvider` | **相同** |
| CodeActionsProvider | `registerCodeActionsProvider` | `registerCodeActionProvider` | **命名不同** (coc 单数 `Action`), coc 多 `clientId` 参数 |
| CodeLensProvider | `registerCodeLensProvider` | `registerCodeLensProvider` | **相同** |
| Formatting | `registerDocumentFormattingEditProvider` | `registerDocumentFormatProvider` | **命名不同**, coc 多 `priority` |
| Range Formatting | `registerDocumentRangeFormattingEditProvider` | `registerDocumentRangeFormatProvider` | **命名不同**, coc 多 `priority` |
| OnType Formatting | `registerOnTypeFormattingEditProvider` | `registerOnTypeFormattingEditProvider` | coc 用 `string[]` 数组 vs vscode rest 参数 |
| RenameProvider | `registerRenameProvider` | `registerRenameProvider` | **相同** |
| SignatureHelpProvider | `registerSignatureHelpProvider` | `registerSignatureHelpProvider` | coc 缺少 metadata overload |
| DocumentLinkProvider | `registerDocumentLinkProvider` | `registerDocumentLinkProvider` | **相同** |
| ColorProvider | `registerColorProvider` | `registerDocumentColorProvider` | **命名不同** |
| FoldingRangeProvider | `registerFoldingRangeProvider` | `registerFoldingRangeProvider` | **相同** |
| SelectionRangeProvider | `registerSelectionRangeProvider` | `registerSelectionRangeProvider` | **相同** |
| CallHierarchyProvider | `registerCallHierarchyProvider` | `registerCallHierarchyProvider` | **相同** |
| TypeHierarchyProvider | `registerTypeHierarchyProvider` | `registerTypeHierarchyProvider` | **相同** |
| LinkedEditingRangeProvider | `registerLinkedEditingRangeProvider` | `registerLinkedEditingRangeProvider` | **相同** |
| InlayHintsProvider | `registerInlayHintsProvider` | `registerInlayHintsProvider` | **相同** |
| SemanticTokensProvider | `registerDocumentSemanticTokensProvider` | `registerDocumentSemanticTokensProvider` | **相同** |
| RangeSemanticTokensProvider | `registerDocumentRangeSemanticTokensProvider` | `registerDocumentRangeSemanticTokensProvider` | **相同** |
| **EvaluatableExpressionProvider** | `registerEvaluatableExpressionProvider` | **无** | — |
| **InlineValuesProvider** | `registerInlineValuesProvider` | **无** (接口存在但无注册函数) | 仅有 `InlineValuesProvider` 接口导出，无注册入口 |
| **DocumentDropEditProvider** | `registerDocumentDropEditProvider` | **无** | — |
| **DocumentPasteEditProvider** | `registerDocumentPasteEditProvider` | **无** | — |

### 6.3 Configuration

| API | VS Code | coc.nvim |
|-----|---------|----------|
| setLanguageConfiguration | 有 | **无** |

---

## 7. `commands` 命名空间

| API | VS Code | coc.nvim | 差异 |
|-----|---------|----------|------|
| registerCommand | `(command, callback, thisArg?)` | `(id, impl, thisArg?, internal?)` | 参数名不同，coc 有额外 `internal` 参数且 callback 返回 `void` 而非 `any` |
| registerTextEditorCommand | 有 | **无** | — |
| executeCommand | `Thenable<T>` | `Promise<T>` | Thenable vs Promise |
| getCommands | `Thenable<string[]>` | **无** (coc 有 `commandList` + 另有一个 `getCommands()` 返回 Vim 命令描述) | 完全不同 |

---

## 8. `extensions` 命名空间

| API | VS Code | coc.nvim | 差异 |
|-----|---------|----------|------|
| all | `Extension<any>[]` | `ReadonlyArray<Extension<any>>` | 基本一致 |
| getExtension | `getExtension(id)` | `getExtensionById(id)` | **命名不同** |
| onDidChange (extensions changed) | 有 | **无** (coc 有 `onDidLoadExtension`, `onDidActiveExtension`, `onDidUnloadExtension` 三个事件) | 细分不同 |

---

## 9. `env` 命名空间

| API | VS Code | coc.nvim |
|-----|---------|----------|
| `namespace env` 完整 | 有 (appName, appRoot, appHost, language, machineId, sessionId, remoteName, shell, clipboard, openExternal, uiKind 等) | **无** |
| `workspace.env: Env` | — | coc 有 (`runtimepath`, `extensionRoot`, `pid`, `columns`, `lines`, `version`, `isVim`, `isNvim` 等 vim 专属属性) |

**结论**: 完全不同，coc 的 `env` 是 vim 运行时环境描述，而非 vscode 那样的应用环境。

---

## 10. Provider 接口对比

### 10.1 通用差异模式

所有 provider 接口在 coc 中都有以下共性差异：
1. 第一个参数 `document` 用 `LinesTextDocument` 代替 `TextDocument`
2. VS Code 用泛型（如 `CompletionItemProvider<T>`），coc 用具体类型
3. 部分 provider coc 要求在注册时额外传入 `clientId` 等参数

### 10.2 具体差异

| Provider | 差异详情 |
|----------|---------|
| CompletionItemProvider | coc 额外 `option: CompleteOption` 字段在 context 中 |
| CodeActionProvider | vscode `range: Range \| Selection` vs coc `range: Range` |
| DocumentRangeFormattingEditProvider | vscode 有额外 `provideDocumentRangesFormattingEdits` 方法，coc 没有 |
| TypeHierarchyProvider | vscode `prepareTypeHierarchy` 返回 `TypeHierarchyItem \| TypeHierarchyItem[]`，coc 仅返回 `TypeHierarchyItem[]` |
| WorkspaceSymbolProvider | vscode 有泛型 `<T extends SymbolInformation>`，coc 非泛型 |
| SelectionRangeProvider | vscode `positions: readonly Position[]` vs coc `positions: Position[]` |
| FileSystemProvider | **coc 完全不存在** |
| TextDocumentContentProvider | 相同 |

---

## 11. 完整缺失的 vscode 功能

以下 vscode **完整命名空间或子系统**在 coc 中完全不存在：

| # | vscode 命名空间/子系统 | 说明 |
|---|----------------------|------|
| 1 | **`notebooks`** | 笔记本文档、编辑器、序列化、内核选择等全部缺失 |
| 2 | **`scm`** | 源代码管理（Git 集成、SourceControl、变更追踪） |
| 3 | **`debug`** | 调试器全部功能（breakpoints、debug session、stack frames 等） |
| 4 | **`tests`** | 测试控制器、测试运行、测试项、测试覆盖 |
| 5 | **`tasks`** | 任务系统（TaskProvider、TaskExecution、Shell/ProcessExecution） |
| 6 | **`chat`** | GitHub Copilot Chat 参与者、对话管理 |
| 7 | **`lm`** | Language Model API (LLM 调用) |
| 8 | **`authentication`** | 认证提供商、session 管理 |
| 9 | **`l10n`** | 本地化（t() 函数） |
| 10 | **`Clipboard`** | 剪贴板读写 |
| 11 | **`FileSystem` / `FileSystemProvider`** | 自定义文件系统提供者 |
| 12 | **`Webview` / `WebviewPanel`** | Webview 面板、序列化、视图提供者 |
| 13 | **`Tab` / `TabGroup` / `TabInput*`** | 标签页和标签组管理 |
| 14 | **`CustomEditor`** | 自定义编辑器（CustomTextEditorProvider / CustomReadonlyEditorProvider） |
| 15 | **`Comment` / `CommentThread` / `CommentController`** | 注释系统（Review） |
| 16 | **`DataTransfer` / `DataTransferItem`** | 拖放数据传输 |
| 17 | **`LanguageStatusItem`** | 语言状态项 |
| 18 | **`TerminalLinkProvider` / `TerminalProfileProvider`** | 终端链接和配置文件 |
| 19 | **`FileDecorationProvider`** | 文件装饰 |
| 20 | **`UriHandler`** | URI 处理器 |
| 21 | **`LogOutputChannel`** | 日志级别输出通道 |

### 11.1 有替代但差异大的功能

| vscode 功能 | coc 替代方式 | 差异 |
|-------------|------------|------|
| Decoration API | `BufferHighlight` / `highlight` | vscode 用 TextEditorDecorationType + setDecorations；coc 基于 vim 高亮 API |
| showTextDocument | `window.moveTo` / 手动切换 buffer | coc 没有直接等价 |
| showInputBox | `window.requestInput` / `window.createInputBox` | 签名完全不同 |
| showOpenDialog / showSaveDialog | **无替代** | — |
| Terminal (createTerminal) | `window.createTerminal`, `window.openTerminal` | 返回 Promise，缺少很多 options |
| setLanguageConfiguration | `workspace.registerAutocmd` 手动实现 | — |

---

## 12. coc 特有 API（vscode 没有的）

coc 有大量 vim/neovim 集成的 API，这些在 vscode 中不存在：

### 12.1 Vim 引擎集成

| API | 说明 |
|-----|------|
| `workspace.nvim` | 直接访问 Neovim 实例 |
| `workspace.env: Env` | Vim 运行时环境描述（runtimepath, floating, textprop 等） |
| `workspace.isVim` / `workspace.isNvim` | 检测 Vim 类型 |
| `workspace.cwd` / `workspace.root` | 当前路径和工作区根 |
| `workspace.filetypes` / `workspace.languageIds` | 支持的文件类型和语言集合 |
| `workspace.pluginRoot` | 插件根路径 |
| `workspace.channelNames` / `workspace.documents` | 通道和文档列表 |
| `workspace.folderPaths` / `workspace.workspaceFolder` | 文件夹路径 |
| `workspace.floatSupported` | 是否支持浮动窗口 |
| `workspace.has(feature)` | 类似 vim 的 `has()` 函数 |

### 12.2 Vim 专属功能

| API | 说明 |
|-----|------|
| `workspace.registerAutocmd` | 注册 vim autocmd |
| `workspace.registerKeymap` / `registerExprKeymap` / `registerLocalKeymap` | 注册 vim 键映射 |
| `workspace.watchOption` / `watchGlobal` | 监听 vim 选项/全局变量变化 |
| `workspace.createDatabase` / `createMru` / `createTask` | Coc 数据持久化工具 |
| `workspace.createFuzzyMatch` | 模糊匹配 |
| `workspace.expand` / `workspace.findUp` | 文件路径工具 |
| `workspace.runCommand` / `workspace.resolveModule` | 运行 shell 命令/解析模块 |
| `workspace.loadFile` / `workspace.openResource` | 文件加载 |
| `workspace.computeWordRanges` | 计算词范围 |
| `workspace.getQuickfixItem` / `getQuickfixList` / `showLocations` | Quickfix 列表操作 |
| `workspace.jumpTo` | 跳转到位置 |
| `workspace.getDocument(bufnr)` | 通过 buffer 号获取文档 |

### 12.3 Window 特有 API

| API | 说明 |
|-----|------|
| `window.createFloatFactory` | 浮动窗口工厂 |
| `window.runTerminalCommand` / `window.openTerminal` | 终端命令操作 |
| `window.showMenuPicker` / `window.showPickerDialog` | 菜单/多选拾取器 |
| `window.showPrompt` / `window.showDialog` / `window.showNotification` | 对话框 |
| `window.getCursorPosition` / `window.moveTo` / `window.getOffset` / `window.getCursorScreenPosition` | 光标操作 |
| `window.echoLines` | 在 vim 底部输出行 |
| `window.showOutputChannel` | 显示输出通道 buffer |
| `window.openLocalConfig` | 打开 coc 配置文件 |
| `window.getSelectedRange` / `window.selectRange` | 可视化选择操作 |
| `window.diffHighlights` / `window.applyDiffHighlights` | 差异高亮管理 |
| `window.getVisibleRanges(bufnr, winid?)` | 按 buffer/窗口获取可见范围 |

---

## 总结

### 适配难度评估

从 vscode 插件迁移到 coc（或反方向）的难度：

| 类别 | 难度 | 原因 |
|------|------|------|
| LSP Provider (completion/hover/定义等) | ★☆☆ 容易 | 接口高度一致，仅需适配 document 类型和注册参数 |
| Commands / Extensions | ★☆☆ 容易 | 基本一致 |
| Workspace 操作 | ★★☆ 中等 | getConfiguration/findFiles/createFileSystemWatcher 一致，但 fs/notebook/saveAll 缺失 |
| 编辑器操作 | ★★★ 较难 | decoration/selection/编辑 API 完全不同 |
| UI 组件 | ★★★★ 很难 | statusbar/outputChannel/terminal 有但签名不同；treeview/quckpick 兼容但差异多 |
| 完整缺失功能 | ★★★★★ 无法直接迁移 | debug/notebook/scm/tests/chat/webview/customEditor/authentication |
