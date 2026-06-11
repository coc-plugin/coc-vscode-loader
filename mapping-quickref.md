# VS Code ⇄ coc.nvim API 映射速查表

> vscode → coc：左列是 VS Code API，右列是 coc.nvim 等价物
> 标记 `≈` 表示签名不完全一致，见签名卡文档

---

## 基础类型

| VS Code | coc.nvim | 备注 |
|---------|----------|------|
| `Position` (class) | `Position` (interface) | ≈ vscode 有 translate/with/compareTo 等方法 |
| `Range` (class) | `Range` (interface) | ≈ vscode 有 contains/intersection/union |
| `Selection` | — | vscode 独有 |
| `Uri` (class) | `Uri` (class) | ≈ coc 构造器为 protected |
| `Uri` | `DocumentUri` (string) | coc 额外有 DocumentUri 类型别名 |
| `TextDocument` | `TextDocument` | ≈ coc 缺少 fileName/isUntitled/isDirty/validateRange 等 |
| `TextDocument` | `LinesTextDocument` | ≈ coc 扩展版，多了 bufnr/lineAt() |
| `TextLine` | `TextLine` | 完全相同 |
| `EndOfLine` (enum) | — | coc 无 |
| `Disposable` (class) | `Disposable` (interface) | ≈ 构造方式不同 |
| `EventEmitter<T>` | `Emitter<T>` | 命名不同 |
| `Event<T>` | `Event<T>` | 相同 |
| `CancellationToken` | `CancellationToken` | ≈ coc 多了 namespace |
| `CancellationTokenSource` | `CancellationTokenSource` | 相同 |
| `CancellationError` | `CancellationError` | 相同 |
| `Command` | `Command` | ≈ coc 少了 tooltip |
| `TextEdit` (class) | `TextEdit` (interface) | ≈ 构造函数 vs 工厂 |
| `WorkspaceEdit` (class) | `WorkspaceEdit` (interface) | ≈ class 方法 vs LSP 数据 |
| `SnippetString` | `SnippetString` | 相同 |
| `MarkdownString` | `MarkupContent` | 类型不同 |
| `MarkedString` | `MarkedString` | 相同 |
| `Hover` (class) | `Hover` (interface) | ≈ 类型不同 |
| `Diagnostic` (class) | `Diagnostic` (interface) | ≈ 构造函数 vs 工厂 |
| `DiagnosticSeverity` (enum 0-3) | `DiagnosticSeverity` (1-4) | 值偏移 |
| `DiagnosticCollection` | `DiagnosticCollection` | ≈ key 类型 Uri vs string |
| `CompletionItem` (class) | `CompletionItem` (interface) | ≈ 细节差异 |
| `CompletionList` (class) | `CompletionList` (interface) | ≈ 差异 |
| `CodeAction` (class) | `CodeAction` (interface) | ≈ 构造函数 vs 工厂 |
| `CodeActionKind` (class) | `CodeActionKind` (string alias) | ≈ coc 无 append/contains/intersects |
| `CodeLens` (class) | `CodeLens` (interface) | ≈ |
| `DocumentLink` (class) | `DocumentLink` (interface) | ≈ |
| `InlayHint` (class) | `InlayHint` (interface) | ≈ |
| `DocumentSymbol` (class) | `DocumentSymbol` (interface) | ≈ |
| `SymbolInformation` (class) | `SymbolInformation` (interface) | ≈ |
| `FoldingRange` (class) | `FoldingRange` (interface) | ≈ |
| `SelectionRange` (class) | `SelectionRange` (interface) | ≈ |
| `CallHierarchyItem` (class) | `CallHierarchyItem` (interface) | ≈ |
| `TypeHierarchyItem` (class) | `TypeHierarchyItem` (interface) | ≈ |

---

## 命名空间

### workspace

| VS Code | coc.nvim | 备注 |
|---------|----------|------|
| `workspace.rootPath` | `workspace.rootPath` | ≈ vscode 可 undefined |
| `workspace.workspaceFolders` | `workspace.workspaceFolders` | ≈ 类型微差 |
| `workspace.name` | — | vscode 独有 |
| `workspace.workspaceFile` | — | vscode 独有 |
| `workspace.textDocuments` | `workspace.textDocuments` | ≈ coc 返回 LinesTextDocument |
| `workspace.fs` | — | vscode 独有 |
| `workspace.isTrusted` | `workspace.isTrusted` | ≈ coc 硬编码 true |
| `workspace.getConfiguration()` | `workspace.getConfiguration()` | 相同 |
| `workspace.openTextDocument(uri)` | `workspace.openTextDocument(uri)` | ≈ coc 返回 Document 而非 TextDocument |
| `workspace.openTextDocument(path)` | `workspace.openTextDocument(path)` | ≈ 同上 |
| `workspace.openTextDocument({language, content})` | — | vscode 独有 overload |
| `workspace.registerTextDocumentContentProvider` | `workspace.registerTextDocumentContentProvider` | 相同 |
| `workspace.registerFileSystemProvider` | — | vscode 独有 |
| `workspace.createFileSystemWatcher` | `workspace.createFileSystemWatcher` | 相同 |
| `workspace.findFiles` | `workspace.findFiles` | 相同 |
| `workspace.applyEdit` | `workspace.applyEdit` | 相同 |
| `workspace.asRelativePath` | `workspace.asRelativePath` | 相同 |
| `workspace.getWorkspaceFolder` | `workspace.getWorkspaceFolder` | ≈ coc 多接受 string |
| `workspace.updateWorkspaceFolders` | — | vscode 独有 |
| `workspace.saveAll` / `save` / `saveAs` | — | vscode 独有 |
| `workspace.decode` / `encode` | — | vscode 独有 |
| `workspace.onDidOpenTextDocument` | `workspace.onDidOpenTextDocument` | ≈ coc 事件带 bufnr |
| `workspace.onDidCloseTextDocument` | `workspace.onDidCloseTextDocument` | ≈ 同上 |
| `workspace.onDidChangeTextDocument` | `workspace.onDidChangeTextDocument` | ≈ coc 使用 LSP 格式 |
| `workspace.onDidSaveTextDocument` | `workspace.onDidSaveTextDocument` | ≈ |
| `workspace.onDidChangeConfiguration` | `workspace.onDidChangeConfiguration` | 相同 |
| `workspace.onDidCreateFiles` | `workspace.onDidCreateFiles` | 相同 |
| `workspace.onDidRenameFiles` | `workspace.onDidRenameFiles` | 相同 |
| `workspace.onDidDeleteFiles` | `workspace.onDidDeleteFiles` | 相同 |

### window

| VS Code | coc.nvim | 备注 |
|---------|----------|------|
| `window.activeTextEditor` | `window.activeTextEditor` | 相同 |
| `window.visibleTextEditors` | `window.visibleTextEditors` | 相同 |
| `window.onDidChangeActiveTextEditor` | `window.onDidChangeActiveTextEditor` | 相同 |
| `window.onDidChangeVisibleTextEditors` | `window.onDidChangeVisibleTextEditors` | 相同 |
| `window.onDidChangeTextEditorSelection` | — | vscode 独有 |
| `window.onDidChangeTextEditorVisibleRanges` | — | vscode 独有 |
| `window.onDidChangeTextEditorOptions` | — | vscode 独有 |
| `window.showTextDocument` | — | vscode 独有 |
| `window.createTextEditorDecorationType` | — | vscode 独有（coc 用 BufferHighlight） |
| `window.showInformationMessage` | `window.showInformationMessage` | ≈ coc 少 MessageOptions overload |
| `window.showWarningMessage` | `window.showWarningMessage` | ≈ 同上 |
| `window.showErrorMessage` | `window.showErrorMessage` | ≈ 同上 |
| `window.showQuickPick` | `window.showQuickPick` | 相同 |
| `window.showWorkspaceFolderPick` | — | vscode 独有 |
| `window.showInputBox` | — | vscode 独有（coc 用 requestInput） |
| `window.createQuickPick` | `window.createQuickPick` | ≈ coc 返回 Promise |
| `window.createInputBox` | `window.createInputBox` | ≈ 签名完全不同 |
| `window.showOpenDialog` | — | vscode 独有 |
| `window.showSaveDialog` | — | vscode 独有 |
| `window.createOutputChannel(name, languageId?)` | `window.createOutputChannel(name)` | ≈ coc 少 languageId |
| `window.createStatusBarItem(id, alignment?, priority?)` | `window.createStatusBarItem(priority?, option?)` | ≈ 参数不同 |
| `window.setStatusBarMessage` | — | vscode 独有 |
| `window.withProgress` | `window.withProgress` | ≈ Thenable vs Promise |
| `window.createTreeView` | `window.createTreeView` | 相同 |
| `window.registerTreeDataProvider` | — | vscode 独有 |
| `window.createTerminal(options)` | `window.createTerminal(options)` | ≈ coc 返回 Promise |
| `window.onDidOpenTerminal` | `window.onDidOpenTerminal` | 相同 |
| `window.onDidCloseTerminal` | `window.onDidCloseTerminal` | 相同 |

### languages

| VS Code | coc.nvim | 备注 |
|---------|----------|------|
| `languages.match` | `languages.match` | ≈ coc 用 TextDocumentMatch |
| `languages.createDiagnosticCollection` | `languages.createDiagnosticCollection` | 相同 |
| `languages.getLanguages` | — | vscode 独有（coc 用 workspace.languageIds） |
| `languages.setTextDocumentLanguage` | — | vscode 独有 |
| `languages.setLanguageConfiguration` | — | vscode 独有 |
| `languages.createLanguageStatusItem` | — | vscode 独有 |
| `languages.getDiagnostics` | — | vscode 独有 |
| `languages.registerCompletionItemProvider` | `languages.registerCompletionItemProvider` | ≈ coc 多 name/shortcut/priority 参数 |
| `languages.registerInlineCompletionItemProvider` | `languages.registerInlineCompletionItemProvider` | 相同 |
| `languages.registerHoverProvider` | `languages.registerHoverProvider` | 相同 |
| `languages.registerDefinitionProvider` | `languages.registerDefinitionProvider` | 相同 |
| `languages.registerDeclarationProvider` | `languages.registerDeclarationProvider` | 相同 |
| `languages.registerTypeDefinitionProvider` | `languages.registerTypeDefinitionProvider` | 相同 |
| `languages.registerImplementationProvider` | `languages.registerImplementationProvider` | 相同 |
| `languages.registerReferenceProvider` | `languages.registerReferencesProvider` | ≈ 命名不同 |
| `languages.registerDocumentHighlightProvider` | `languages.registerDocumentHighlightProvider` | 相同 |
| `languages.registerDocumentSymbolProvider` | `languages.registerDocumentSymbolProvider` | 相同 |
| `languages.registerWorkspaceSymbolProvider` | `languages.registerWorkspaceSymbolProvider` | 相同 |
| `languages.registerCodeActionsProvider` | `languages.registerCodeActionProvider` | ≈ 命名不同，参数不同 |
| `languages.registerCodeLensProvider` | `languages.registerCodeLensProvider` | 相同 |
| `languages.registerDocumentFormattingEditProvider` | `languages.registerDocumentFormatProvider` | ≈ 命名不同 |
| `languages.registerDocumentRangeFormattingEditProvider` | `languages.registerDocumentRangeFormatProvider` | ≈ 命名不同 |
| `languages.registerOnTypeFormattingEditProvider` | `languages.registerOnTypeFormattingEditProvider` | ≈ 参数形式不同 |
| `languages.registerRenameProvider` | `languages.registerRenameProvider` | 相同 |
| `languages.registerSignatureHelpProvider` | `languages.registerSignatureHelpProvider` | ≈ coc 少 metadata overload |
| `languages.registerDocumentLinkProvider` | `languages.registerDocumentLinkProvider` | 相同 |
| `languages.registerColorProvider` | `languages.registerDocumentColorProvider` | ≈ 命名不同 |
| `languages.registerFoldingRangeProvider` | `languages.registerFoldingRangeProvider` | 相同 |
| `languages.registerSelectionRangeProvider` | `languages.registerSelectionRangeProvider` | 相同 |
| `languages.registerCallHierarchyProvider` | `languages.registerCallHierarchyProvider` | 相同 |
| `languages.registerTypeHierarchyProvider` | `languages.registerTypeHierarchyProvider` | 相同 |
| `languages.registerLinkedEditingRangeProvider` | `languages.registerLinkedEditingRangeProvider` | 相同 |
| `languages.registerInlayHintsProvider` | `languages.registerInlayHintsProvider` | 相同 |
| `languages.registerDocumentSemanticTokensProvider` | `languages.registerDocumentSemanticTokensProvider` | 相同 |
| `languages.registerDocumentRangeSemanticTokensProvider` | `languages.registerDocumentRangeSemanticTokensProvider` | 相同 |

### commands

| VS Code | coc.nvim | 备注 |
|---------|----------|------|
| `commands.registerCommand(command, callback, thisArg?)` | `commands.registerCommand(id, impl, thisArg?, internal?)` | ≈ coc 多 internal 参数 |
| `commands.registerTextEditorCommand` | — | vscode 独有 |
| `commands.executeCommand` | `commands.executeCommand` | ≈ Thenable vs Promise |
| `commands.getCommands` | `commands.commandList` / `getCommands()` | ≈ coc 另有 `getCommands()` 返回 Vim 命令描述 |

### extensions

| VS Code | coc.nvim | 备注 |
|---------|----------|------|
| `extensions.all` | `extensions.all` | 相同 |
| `extensions.getExtension(id)` | `extensions.getExtensionById(id)` | ≈ 命名不同 |
| — | `extensions.onDidLoadExtension` | coc 独有 |
| `extensions.onDidChange` | `extensions.onDidActiveExtension` | ≈ 拆分事件 |
| — | `extensions.onDidUnloadExtension` | coc 独有 |
| — | `extensions.getExtensionState` / `isActivated` | coc 独有 |

---

## Provider 接口（document 参数差异）

所有 LSP Provider 的 document 参数类型差异：

| VS Code | coc |
|---------|-----|
| `provideXxx(document: TextDocument, ...)` | `provideXxx(document: LinesTextDocument, ...)` |

`LinesTextDocument` 比 `TextDocument` 多了 `bufnr: number`、`lineAt()`、`lines: TextLine[]`、`end: Position`、`eol: boolean`。
