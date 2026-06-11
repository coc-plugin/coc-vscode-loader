# coc.nvim ⇄ VS Code API 映射速查表

> coc → vscode：左列是 coc API，右列是 vscode 等价物
> 标记 `≈` 表示签名不完全一致，见签名卡文档

---

## 基础类型

| coc.nvim | VS Code | 备注 |
|----------|---------|------|
| `Position` (interface) | `Position` (class) | ≈ coc 无 translate/with/compareTo 等方法 |
| `Range` (interface) | `Range` (class) | ≈ coc 无 contains/intersection/union |
| — | `Selection` | vscode 独有 |
| — | `Uri` (class) | coc 用 `DocumentUri = string` |
| `DocumentUri` (string) | `Uri` | 类型不同 |
| `TextDocument` | `TextDocument` | ≈ coc 缺少 fileName/isUntitled/isDirty/validateRange 等 |
| `LinesTextDocument` | `TextDocument` | ≈ coc 扩展版，多了 bufnr/lineAt() |
| `TextLine` | `TextLine` | 完全相同 |
| — | `EndOfLine` (enum) | coc 无 |
| `Disposable` (interface) | `Disposable` (class) | ≈ 构造方式不同 |
| `Emitter<T>` | `EventEmitter<T>` | 同名不同名 |
| `Event<T>` | `Event<T>` | 相同 |
| `CancellationToken` | `CancellationToken` | ≈ coc 多了 namespace |
| `CancellationTokenSource` | `CancellationTokenSource` | 相同 |
| `CancellationError` | `CancellationError` | 相同 |
| `Command` | `Command` | ≈ coc 少了 tooltip |
| `TextEdit` (interface) | `TextEdit` (class) | ≈ 工厂 vs 构造函数 |
| `WorkspaceEdit` (interface) | `WorkspaceEdit` (class) | ≈ LSP 数据 vs class 方法 |
| `SnippetString` | `SnippetString` | 相同 |
| `MarkupContent` | `MarkdownString` | 类型不同 |
| `MarkedString` | `MarkedString` | 相同 |
| `Hover` (interface) | `Hover` (class) | ≈ 类型不同 |
| `Diagnostic` (interface) | `Diagnostic` (class) | ≈ 工厂 vs 构造函数 |
| `DiagnosticSeverity` (1-4) | `DiagnosticSeverity` (enum 0-3) | 值偏移 |
| `DiagnosticCollection` | `DiagnosticCollection` | ≈ key 类型 string vs Uri |
| `CompletionItem` (interface) | `CompletionItem` (class) | ≈ 细节差异 |
| `CompletionList` (interface) | `CompletionList` (class) | ≈ 差异 |
| `CodeAction` (interface) | `CodeAction` (class) | ≈ 工厂 vs 构造函数 |
| `CodeActionKind` (string alias) | `CodeActionKind` (class) | ≈ coc 无 append/contains/intersects |
| `CodeLens` (interface) | `CodeLens` (class) | ≈ |
| `DocumentLink` (interface) | `DocumentLink` (class) | ≈ |
| `InlayHint` (interface) | `InlayHint` (class) | ≈ |
| `DocumentSymbol` (interface) | `DocumentSymbol` (class) | ≈ |
| `SymbolInformation` (interface) | `SymbolInformation` (class) | ≈ |
| `FoldingRange` (interface) | `FoldingRange` (class) | ≈ |
| `SelectionRange` (interface) | `SelectionRange` (class) | ≈ |
| `CallHierarchyItem` (interface) | `CallHierarchyItem` (class) | ≈ |
| `TypeHierarchyItem` (interface) | `TypeHierarchyItem` (class) | ≈ |

---

## 命名空间

### workspace

| coc.nvim | VS Code | 备注 |
|----------|---------|------|
| `workspace.rootPath` | `workspace.rootPath` | ≈ coc 无 undefined |
| `workspace.workspaceFolders` | `workspace.workspaceFolders` | ≈ 类型微差 |
| — | `workspace.name` | vscode 独有 |
| — | `workspace.workspaceFile` | vscode 独有 |
| `workspace.textDocuments` | `workspace.textDocuments` | ≈ coc 返回 LinesTextDocument |
| — | `workspace.fs` | vscode 独有 |
| `workspace.isTrusted` | `workspace.isTrusted` | ≈ coc 硬编码 true |
| `workspace.getConfiguration()` | `workspace.getConfiguration()` | 相同 |
| `workspace.openTextDocument(uri)` | `workspace.openTextDocument(uri)` | ≈ coc 返回 Document 而非 TextDocument |
| `workspace.openTextDocument(path)` | `workspace.openTextDocument(path)` | ≈ 同上 |
| — | `workspace.openTextDocument({language, content})` | vscode 独有 overload |
| `workspace.registerTextDocumentContentProvider` | `workspace.registerTextDocumentContentProvider` | 相同 |
| — | `workspace.registerFileSystemProvider` | vscode 独有 |
| `workspace.createFileSystemWatcher` | `workspace.createFileSystemWatcher` | 相同 |
| `workspace.findFiles` | `workspace.findFiles` | 相同 |
| `workspace.applyEdit` | `workspace.applyEdit` | 相同 |
| `workspace.asRelativePath` | `workspace.asRelativePath` | 相同 |
| `workspace.getWorkspaceFolder` | `workspace.getWorkspaceFolder` | ≈ coc 多接受 string |
| — | `workspace.updateWorkspaceFolders` | vscode 独有 |
| — | `workspace.saveAll` / `save` / `saveAs` | vscode 独有 |
| — | `workspace.decode` / `encode` | vscode 独有 |
| `workspace.onDidOpenTextDocument` | `workspace.onDidOpenTextDocument` | ≈ coc 事件带 bufnr |
| `workspace.onDidCloseTextDocument` | `workspace.onDidCloseTextDocument` | ≈ 同上 |
| `workspace.onDidChangeTextDocument` | `workspace.onDidChangeTextDocument` | ≈ coc 使用 LSP 格式 |
| `workspace.onDidSaveTextDocument` | `workspace.onDidSaveTextDocument` | ≈ |
| `workspace.onDidChangeConfiguration` | `workspace.onDidChangeConfiguration` | 相同 |
| `workspace.onDidCreateFiles` | `workspace.onDidCreateFiles` | 相同 |
| `workspace.onDidRenameFiles` | `workspace.onDidRenameFiles` | 相同 |
| `workspace.onDidDeleteFiles` | `workspace.onDidDeleteFiles` | 相同 |

### window

| coc.nvim | VS Code | 备注 |
|----------|---------|------|
| `window.activeTextEditor` | `window.activeTextEditor` | 相同 |
| `window.visibleTextEditors` | `window.visibleTextEditors` | 相同 |
| `window.onDidChangeActiveTextEditor` | `window.onDidChangeActiveTextEditor` | 相同 |
| `window.onDidChangeVisibleTextEditors` | `window.onDidChangeVisibleTextEditors` | 相同 |
| — | `window.onDidChangeTextEditorSelection` | vscode 独有 |
| — | `window.onDidChangeTextEditorVisibleRanges` | vscode 独有 |
| — | `window.onDidChangeTextEditorOptions` | vscode 独有 |
| — | `window.showTextDocument` | vscode 独有 |
| — | `window.createTextEditorDecorationType` | vscode 独有（coc 用 BufferHighlight） |
| `window.showInformationMessage` | `window.showInformationMessage` | ≈ coc 少 MessageOptions overload |
| `window.showWarningMessage` | `window.showWarningMessage` | ≈ 同上 |
| `window.showErrorMessage` | `window.showErrorMessage` | ≈ 同上 |
| `window.showQuickPick` | `window.showQuickPick` | 相同 |
| — | `window.showWorkspaceFolderPick` | vscode 独有 |
| — | `window.showInputBox` | vscode 独有（coc 用 requestInput） |
| `window.createQuickPick` | `window.createQuickPick` | ≈ coc 返回 Promise |
| `window.createInputBox` | `window.createInputBox` | ≈ 签名完全不同 |
| — | `window.showOpenDialog` | vscode 独有 |
| — | `window.showSaveDialog` | vscode 独有 |
| `window.createOutputChannel(name)` | `window.createOutputChannel(name, languageId?)` | ≈ coc 少 languageId |
| `window.createStatusBarItem(priority?, option?)` | `window.createStatusBarItem(id, alignment?, priority?)` | ≈ 参数不同 |
| — | `window.setStatusBarMessage` | vscode 独有 |
| `window.withProgress` | `window.withProgress` | ≈ Thenable vs Promise |
| `window.createTreeView` | `window.createTreeView` | 相同 |
| — | `window.registerTreeDataProvider` | vscode 独有 |
| `window.createTerminal(options)` | `window.createTerminal(options)` | ≈ coc 返回 Promise |
| `window.onDidOpenTerminal` | `window.onDidOpenTerminal` | 相同 |
| `window.onDidCloseTerminal` | `window.onDidCloseTerminal` | 相同 |

### languages

| coc.nvim | VS Code | 备注 |
|----------|---------|------|
| `languages.match` | `languages.match` | ≈ coc 用 TextDocumentMatch |
| `languages.createDiagnosticCollection` | `languages.createDiagnosticCollection` | 相同 |
| — | `languages.getLanguages` | vscode 独有（coc 用 workspace.languageIds） |
| — | `languages.setTextDocumentLanguage` | vscode 独有 |
| — | `languages.setLanguageConfiguration` | vscode 独有 |
| — | `languages.createLanguageStatusItem` | vscode 独有 |
| — | `languages.getDiagnostics` | vscode 独有 |
| `languages.registerCompletionItemProvider` | `languages.registerCompletionItemProvider` | ≈ coc 多 name/shortcut/priority 参数 |
| `languages.registerInlineCompletionItemProvider` | `languages.registerInlineCompletionItemProvider` | 相同 |
| `languages.registerHoverProvider` | `languages.registerHoverProvider` | 相同 |
| `languages.registerDefinitionProvider` | `languages.registerDefinitionProvider` | 相同 |
| `languages.registerDeclarationProvider` | `languages.registerDeclarationProvider` | 相同 |
| `languages.registerTypeDefinitionProvider` | `languages.registerTypeDefinitionProvider` | 相同 |
| `languages.registerImplementationProvider` | `languages.registerImplementationProvider` | 相同 |
| `languages.registerReferencesProvider` | `languages.registerReferenceProvider` | ≈ 命名不同 |
| `languages.registerDocumentHighlightProvider` | `languages.registerDocumentHighlightProvider` | 相同 |
| `languages.registerDocumentSymbolProvider` | `languages.registerDocumentSymbolProvider` | 相同 |
| `languages.registerWorkspaceSymbolProvider` | `languages.registerWorkspaceSymbolProvider` | 相同 |
| `languages.registerCodeActionProvider` | `languages.registerCodeActionsProvider` | ≈ 命名不同，参数不同 |
| `languages.registerCodeLensProvider` | `languages.registerCodeLensProvider` | 相同 |
| `languages.registerDocumentFormatProvider` | `languages.registerDocumentFormattingEditProvider` | ≈ 命名不同 |
| `languages.registerDocumentRangeFormatProvider` | `languages.registerDocumentRangeFormattingEditProvider` | ≈ 命名不同 |
| `languages.registerOnTypeFormattingEditProvider` | `languages.registerOnTypeFormattingEditProvider` | ≈ 参数形式不同 |
| `languages.registerRenameProvider` | `languages.registerRenameProvider` | 相同 |
| `languages.registerSignatureHelpProvider` | `languages.registerSignatureHelpProvider` | ≈ coc 少 metadata overload |
| `languages.registerDocumentLinkProvider` | `languages.registerDocumentLinkProvider` | 相同 |
| `languages.registerDocumentColorProvider` | `languages.registerColorProvider` | ≈ 命名不同 |
| `languages.registerFoldingRangeProvider` | `languages.registerFoldingRangeProvider` | 相同 |
| `languages.registerSelectionRangeProvider` | `languages.registerSelectionRangeProvider` | 相同 |
| `languages.registerCallHierarchyProvider` | `languages.registerCallHierarchyProvider` | 相同 |
| `languages.registerTypeHierarchyProvider` | `languages.registerTypeHierarchyProvider` | 相同 |
| `languages.registerLinkedEditingRangeProvider` | `languages.registerLinkedEditingRangeProvider` | 相同 |
| `languages.registerInlayHintsProvider` | `languages.registerInlayHintsProvider` | 相同 |
| `languages.registerDocumentSemanticTokensProvider` | `languages.registerDocumentSemanticTokensProvider` | 相同 |
| `languages.registerDocumentRangeSemanticTokensProvider` | `languages.registerDocumentRangeSemanticTokensProvider` | 相同 |

### commands

| coc.nvim | VS Code | 备注 |
|----------|---------|------|
| `commands.registerCommand(id, impl, thisArg?, internal?)` | `commands.registerCommand(command, callback, thisArg?)` | ≈ coc 多 internal 参数 |
| — | `commands.registerTextEditorCommand` | vscode 独有 |
| `commands.executeCommand` | `commands.executeCommand` | ≈ Thenable vs Promise |
| `commands.commandList` | `commands.getCommands` | ≈ 完全不同 |

### extensions

| coc.nvim | VS Code | 备注 |
|----------|---------|------|
| `extensions.all` | `extensions.all` | 相同 |
| `extensions.getExtensionById(id)` | `extensions.getExtension(id)` | ≈ 命名不同 |
| `extensions.onDidLoadExtension` | — | coc 独有 |
| `extensions.onDidActiveExtension` | `extensions.onDidChange` | ≈ 拆分事件 |
| `extensions.onDidUnloadExtension` | — | coc 独有 |
| `extensions.getExtensionState` / `isActivated` | — | coc 独有 |

---

## Provider 接口（document 参数差异）

所有 LSP Provider 的 document 参数类型差异：

| coc | VS Code | 
|-----|---------|
| `provideXxx(document: LinesTextDocument, ...)` | `provideXxx(document: TextDocument, ...)` |

`LinesTextDocument` 比 `TextDocument` 多了 `bufnr: number`、`lineAt()`、`lines: TextLine[]`、`end: Position`、`eol: boolean`。
