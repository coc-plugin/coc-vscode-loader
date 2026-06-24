# VS Code ⇄ coc.nvim API Mapping Quick Reference

> vscode → coc: Left column is VS Code API, right column is coc.nvim equivalent
> Mark `≈` indicates signatures are not fully identical, see signature document for details

---

## Basic Types

| VS Code | coc.nvim | Notes |
|---------|----------|-------|
| `Position` (class) | `Position` (interface) | ≈ vscode has translate/with/compareTo methods |
| `Range` (class) | `Range` (interface) | ≈ vscode has contains/intersection/union |
| `Selection` | — | vscode only |
| `Uri` (class) | `Uri` (class) | ≈ coc constructor is protected |
| `Uri` | `DocumentUri` (string) | coc also has DocumentUri type alias |
| `TextDocument` | `TextDocument` | ≈ coc lacks fileName/isUntitled/isDirty/validateRange |
| `TextDocument` | `LinesTextDocument` | ≈ coc extended version, adds bufnr/lineAt() |
| `TextLine` | `TextLine` | Identical |
| `EndOfLine` (enum) | — | coc has none |
| `Disposable` (class) | `Disposable` (interface) | ≈ Different construction method |
| `EventEmitter<T>` | `Emitter<T>` | Different naming |
| `Event<T>` | `Event<T>` | Same |
| `CancellationToken` | `CancellationToken` | ≈ coc has namespace |
| `CancellationTokenSource` | `CancellationTokenSource` | Same |
| `CancellationError` | `CancellationError` | Same |
| `Command` | `Command` | ≈ coc lacks tooltip |
| `TextEdit` (class) | `TextEdit` (interface) | ≈ Constructor vs factory |
| `WorkspaceEdit` (class) | `WorkspaceEdit` (interface) | ≈ Class method vs LSP data |
| `SnippetString` | `SnippetString` | Same |
| `MarkdownString` | `MarkupContent` | Different types |
| `MarkedString` | `MarkedString` | Same |
| `Hover` (class) | `Hover` (interface) | ≈ Different types |
| `Diagnostic` (class) | `Diagnostic` (interface) | ≈ Constructor vs factory |
| `DiagnosticSeverity` (enum 0-3) | `DiagnosticSeverity` (1-4) | Value offset |
| `DiagnosticCollection` | `DiagnosticCollection` | ≈ Key type Uri vs string |
| `CompletionItem` (class) | `CompletionItem` (interface) | ≈ Detail differences |
| `CompletionList` (class) | `CompletionList` (interface) | ≈ Differences |
| `CodeAction` (class) | `CodeAction` (interface) | ≈ Constructor vs factory |
| `CodeActionKind` (class) | `CodeActionKind` (string alias) | ≈ coc lacks append/contains/intersects |
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

## Namespaces

### workspace

| VS Code | coc.nvim | Notes |
|---------|----------|-------|
| `workspace.rootPath` | `workspace.rootPath` | ≈ vscode can be undefined |
| `workspace.workspaceFolders` | `workspace.workspaceFolders` | ≈ coc may return undefined, use `\|\| []` when accessing |
| `workspace.name` | — | vscode only |
| `workspace.workspaceFile` | — | vscode only |
| `workspace.textDocuments` | `workspace.textDocuments` | ≈ coc returns LinesTextDocument |
| `workspace.fs` | — | vscode only |
| `workspace.isTrusted` | — | coc has no such property, converter replaces with `true` |
| `workspace.getConfiguration()` | `workspace.getConfiguration()` | Same |
| `workspace.openTextDocument(uri)` | `workspace.openTextDocument(uri)` | ≈ coc returns Document instead of TextDocument |
| `workspace.openTextDocument(path)` | `workspace.openTextDocument(path)` | ≈ Same as above |
| `workspace.openTextDocument({language, content})` | — | vscode only overload |
| `workspace.registerTextDocumentContentProvider` | `workspace.registerTextDocumentContentProvider` | Same |
| `workspace.registerFileSystemProvider` | — | vscode only |
| `workspace.createFileSystemWatcher` | `workspace.createFileSystemWatcher` | Same |
| `workspace.findFiles` | `workspace.findFiles` | Same |
| `workspace.applyEdit` | `workspace.applyEdit` | Same |
| `workspace.asRelativePath` | `workspace.asRelativePath` | Same |
| `workspace.getWorkspaceFolder` | `workspace.getWorkspaceFolder` | ≈ coc also accepts string |
| `workspace.updateWorkspaceFolders` | — | vscode only |
| `workspace.saveAll` / `save` / `saveAs` | — | vscode only |
| `workspace.decode` / `encode` | — | vscode only |
| `workspace.onDidOpenTextDocument` | `workspace.onDidOpenTextDocument` | ≈ coc event includes bufnr |
| `workspace.onDidCloseTextDocument` | `workspace.onDidCloseTextDocument` | ≈ Same as above |
| `workspace.onDidChangeTextDocument` | `workspace.onDidChangeTextDocument` | ≈ coc uses LSP format |
| `workspace.onDidSaveTextDocument` | `workspace.onDidSaveTextDocument` | ≈ |
| `workspace.onDidChangeConfiguration` | `workspace.onDidChangeConfiguration` | Same |
| `workspace.onDidCreateFiles` | `workspace.onDidCreateFiles` | Same |
| `workspace.onDidRenameFiles` | `workspace.onDidRenameFiles` | Same |
| `workspace.onDidDeleteFiles` | `workspace.onDidDeleteFiles` | Same |

### window

| VS Code | coc.nvim | Notes |
|---------|----------|-------|
| `window.activeTextEditor` | — | coc has no such property, converter injects polyfill using `workspace.getDocument()` approximation |
| `window.visibleTextEditors` | — | vscode only |
| `window.onDidChangeActiveTextEditor` | `workspace.onDidOpenTextDocument` | coc has no such event, converter replaces with `workspace.onDidOpenTextDocument` |
| `window.onDidChangeVisibleTextEditors` | `window.onDidChangeVisibleTextEditors` | Same |
| `window.onDidChangeTextEditorSelection` | — | vscode only |
| `window.onDidChangeTextEditorVisibleRanges` | — | vscode only |
| `window.onDidChangeTextEditorOptions` | — | vscode only |
| `window.showTextDocument` | — | vscode only |
| `window.createTextEditorDecorationType` | — | vscode only (coc uses BufferHighlight) |
| `window.showInformationMessage` | `window.showMessage` | converter auto-converts to `showMessage(msg, 'more')` |
| `window.showWarningMessage` | `window.showMessage` | converter auto-converts to `showMessage(msg, 'warning')` |
| `window.showErrorMessage` | `window.showMessage` | converter auto-converts to `showMessage(msg, 'error')` |
| `window.showQuickPick` | `window.showQuickPick` | Same |
| `window.showWorkspaceFolderPick` | — | vscode only |
| `window.showInputBox` | — | vscode only (coc uses requestInput) |
| `window.createQuickPick` | `window.createQuickPick` | ≈ coc returns Promise |
| `window.createInputBox` | `window.createInputBox` | ≈ Signatures are completely different |
| `window.showOpenDialog` | — | vscode only, converter replaces with `void 0` |
| `window.showSaveDialog` | — | vscode only |
| `window.createOutputChannel(name, languageId?)` | `window.createOutputChannel(name)` | coc natively supports, no languageId parameter |
| `window.createStatusBarItem(id, alignment?, priority?)` | `window.createStatusBarItem(priority?, option?)` | ≈ Different parameters, converter discards first two parameters |
| `languages.createLanguageStatusItem` | — | vscode only, converter replaces with no-op (supports `vscode.` prefix) |
| `window.setStatusBarMessage` | — | vscode only |
| `window.withProgress` | `window.withProgress` | ≈ Thenable vs Promise |
| `window.createTreeView` | `window.createTreeView` | Same |
| `window.registerTreeDataProvider` | — | vscode only |
| `window.createTerminal(options)` | `window.createTerminal(options)` | ≈ coc returns Promise |
| `window.onDidOpenTerminal` | `window.onDidOpenTerminal` | Same |
| `window.onDidCloseTerminal` | `window.onDidCloseTerminal` | Same |

### languages

| VS Code | coc.nvim | Notes |
|---------|----------|-------|
| `languages.match` | `languages.match` | ≈ coc uses TextDocumentMatch |
| `languages.createDiagnosticCollection` | `languages.createDiagnosticCollection` | Same |
| `languages.getLanguages` | — | vscode only (coc uses workspace.languageIds) |
| `languages.setTextDocumentLanguage` | — | vscode only |
| `languages.setLanguageConfiguration` | — | vscode only |
| `languages.createLanguageStatusItem` | — | vscode only, converter replaces with no-op (supports `vscode.` prefix) |
| `languages.registerDocumentFormattingEditProvider` | `languages.registerDocumentFormatProvider` | ≈ Different naming, converter adds priority=1 by default |
| `languages.registerDocumentRangeFormattingEditProvider` | `languages.registerDocumentRangeFormatProvider` | ≈ Same as above |
| `languages.getDiagnostics` | — | vscode only |
| `languages.registerCompletionItemProvider` | `languages.registerCompletionItemProvider` | ≈ coc has additional name/shortcut/priority parameters |
| `languages.registerInlineCompletionItemProvider` | `languages.registerInlineCompletionItemProvider` | Same |
| `languages.registerHoverProvider` | `languages.registerHoverProvider` | Same |
| `languages.registerDefinitionProvider` | `languages.registerDefinitionProvider` | Same |
| `languages.registerDeclarationProvider` | `languages.registerDeclarationProvider` | Same |
| `languages.registerTypeDefinitionProvider` | `languages.registerTypeDefinitionProvider` | Same |
| `languages.registerImplementationProvider` | `languages.registerImplementationProvider` | Same |
| `languages.registerReferenceProvider` | `languages.registerReferencesProvider` | ≈ Different naming |
| `languages.registerDocumentHighlightProvider` | `languages.registerDocumentHighlightProvider` | Same |
| `languages.registerDocumentSymbolProvider` | `languages.registerDocumentSymbolProvider` | Same |
| `languages.registerWorkspaceSymbolProvider` | `languages.registerWorkspaceSymbolProvider` | Same |
| `languages.registerCodeActionsProvider` | `languages.registerCodeActionProvider` | ≈ Different naming, different parameters |
| `languages.registerCodeLensProvider` | `languages.registerCodeLensProvider` | Same |
| `languages.registerDocumentFormattingEditProvider` | `languages.registerDocumentFormatProvider` | ≈ Different naming |
| `languages.registerDocumentRangeFormattingEditProvider` | `languages.registerDocumentRangeFormatProvider` | ≈ Different naming |
| `languages.registerOnTypeFormattingEditProvider` | `languages.registerOnTypeFormattingEditProvider` | ≈ Different parameter format |
| `languages.registerRenameProvider` | `languages.registerRenameProvider` | Same |
| `languages.registerSignatureHelpProvider` | `languages.registerSignatureHelpProvider` | ≈ coc lacks metadata overload |
| `languages.registerDocumentLinkProvider` | `languages.registerDocumentLinkProvider` | Same |
| `languages.registerColorProvider` | `languages.registerDocumentColorProvider` | ≈ Different naming |
| `languages.registerFoldingRangeProvider` | `languages.registerFoldingRangeProvider` | Same |
| `languages.registerSelectionRangeProvider` | `languages.registerSelectionRangeProvider` | Same |
| `languages.registerCallHierarchyProvider` | `languages.registerCallHierarchyProvider` | Same |
| `languages.registerTypeHierarchyProvider` | `languages.registerTypeHierarchyProvider` | Same |
| `languages.registerLinkedEditingRangeProvider` | `languages.registerLinkedEditingRangeProvider` | Same |
| `languages.registerInlayHintsProvider` | `languages.registerInlayHintsProvider` | Same |
| `languages.registerDocumentSemanticTokensProvider` | `languages.registerDocumentSemanticTokensProvider` | Same |
| `languages.registerDocumentRangeSemanticTokensProvider` | `languages.registerDocumentRangeSemanticTokensProvider` | Same |

### commands

| VS Code | coc.nvim | Notes |
|---------|----------|-------|
| `commands.registerCommand(command, callback, thisArg?)` | `commands.registerCommand(id, impl, thisArg?, internal?)` | ≈ coc has additional internal parameter |
| `commands.registerTextEditorCommand` | — | vscode only |
| `commands.executeCommand` | `commands.executeCommand` | ≈ Thenable vs Promise |
| `commands.getCommands` | `commands.commandList` / `getCommands()` | ≈ coc also has `getCommands()` returning Vim command descriptions |

### extensions

| VS Code | coc.nvim | Notes |
|---------|----------|-------|
| `extensions.all` | `extensions.all` | Same |
| `extensions.getExtension(id)` | `extensions.getExtensionById(id)` | ≈ Different naming |
| — | `extensions.onDidLoadExtension` | coc only |
| `extensions.onDidChange` | `extensions.onDidActiveExtension` | ≈ Split events |
| — | `extensions.onDidUnloadExtension` | coc only |
| — | `extensions.getExtensionState` / `isActivated` | coc only |

---

## Provider Interfaces (document parameter differences)

Document parameter type differences for all LSP Providers:

| VS Code | coc |
|---------|-----|
| `provideXxx(document: TextDocument, ...)` | `provideXxx(document: LinesTextDocument, ...)` |

`LinesTextDocument` has `bufnr: number`, `lineAt()`, `lines: TextLine[]`, `end: Position`, `eol: boolean` in addition to `TextDocument`.
