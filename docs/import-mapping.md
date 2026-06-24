# Import Mapping: VS Code → coc.nvim

> Complete mapping of exports from `from 'vscode'` to `from 'coc.nvim'`.
> `≈` marks that signatures/types are not exactly the same.

---

## 1. Basic Types

| VS Code | coc.nvim | Exact Match? |
|---------|----------|-----------|
| `CancellationToken` | `CancellationToken` | ≈ coc has namespace |
| `CancellationTokenSource` | `CancellationTokenSource` | Yes |
| `CancellationError` | `CancellationError` | Yes |
| `Disposable` | `Disposable` | ≈ class vs interface |
| `Event<T>` | `Event<T>` | Yes |
| `EventEmitter<T>` | `Emitter<T>` | ≈ different name |
| — | `EventEmitter` | coc does not have this name, use Emitter |
| `Position` | `Position` | ≈ class vs interface |
| `Range` | `Range` | ≈ class vs interface |
| `Selection` | — | vscode only |
| `TextDocument` | `TextDocument` | ≈ missing some fields |
| — | `LinesTextDocument` | coc only (extends TextDocument) |
| `TextLine` | `TextLine` | Yes |
| `EndOfLine` | — | vscode only |
| `Uri` | `Uri` | ≈ class vs class (coc constructor is protected) |
| — | `DocumentUri` | coc only (`= string`) |
| `Command` | `Command` | ≈ coc missing tooltip |
| `TextEdit` | `TextEdit` | ≈ class vs interface |
| — | `AnnotatedTextEdit` | coc only (LSP) |
| — | `SnippetTextEdit` | coc only |
| `WorkspaceEdit` | `WorkspaceEdit` | ≈ class vs interface |
| — | `WorkspaceChange` | coc only |
| `SnippetString` | `SnippetString` | Yes |
| `MarkdownString` | — | vscode only |
| — | `MarkupContent` | coc only (LSP) |
| — | `MarkupKind` | coc only |
| `MarkedString` | `MarkedString` | Yes |
| `Hover` | `Hover` | ≈ class vs interface, coc has no factory method |
| `ThemeColor` | — | coc does not have |
| `ThemeIcon` | — | coc does not have |
| `IconPath` | — | vscode only |
| `RelativePattern` | `RelativePattern` | Yes |
| `GlobPattern` | `GlobPattern` | Yes |
| `DocumentFilter` | `DocumentFilter` | Yes |
| `DocumentSelector` | `DocumentSelector` | Yes |
| `ProviderResult` | `ProviderResult` | Yes |

---

## 2. Diagnostics

| VS Code | coc.nvim | Exact Match? |
|---------|----------|-----------|
| `Diagnostic` | `Diagnostic` | ≈ class vs interface, severity values differ |
| `DiagnosticSeverity` | `DiagnosticSeverity` | ≈ enum 0-3 vs 1-4 |
| `DiagnosticTag` | `DiagnosticTag` | ≈ enum vs namespace |
| `DiagnosticRelatedInformation` | `DiagnosticRelatedInformation` | ≈ |
| `DiagnosticCollection` | `DiagnosticCollection` | ≈ key type Uri vs string |
| — | `CodeDescription` | coc only (LSP) |
| — | `DiagnosticItem` | coc only |
| — | `DiagnosticProvider` | coc only |
| — | `DiagnosticEventParams` | coc only (LSP) |

---

## 3. Completion

| VS Code | coc.nvim | Exact Match? |
|---------|----------|-----------|
| `CompletionItem` | `CompletionItem` | ≈ class vs interface, coc `create(label)` only accepts label, kind needs separate `item.kind =` |
| `CompletionItemKind` | `CompletionItemKind` | ≈ enum vs namespace + type, values offset by 1 (vscode Text=0, coc Text=1) |
| `CompletionList` | `CompletionList` | ≈ class vs interface |
| `CompletionTriggerKind` | `CompletionTriggerKind` | ≈ enum vs namespace + type, vscode `Invoke=0` vs coc `Invoked:1` |
| — | `InsertTextFormat` | coc only (LSP, vscode uses `string \| SnippetString`) |
| — | `InsertTextMode` | coc only (LSP) |
| `CompletionItemTag` | `CompletionItemTag` | ≈ enum vs namespace + type |
| `InsertReplaceEdit` | `InsertReplaceEdit` | ≈ |
| `CompletionItemLabelDetails` | `CompletionItemLabelDetails` | Yes |
| — | `CompleteOption` | coc only |
| — | `CompleteDoneItem` | coc only |
| — | `CompleteResult` | coc only |

---

## 4. CodeAction / CodeLens

| VS Code | coc.nvim | Exact Match? |
|---------|----------|-----------|
| `CodeAction` | `CodeAction` | ≈ class vs interface |
| `CodeActionKind` | `CodeActionKind` | ≈ class vs string alias |
| `CodeActionContext` | `CodeActionContext` | ≈ |
| `CodeActionTriggerKind` | `CodeActionTriggerKind` | ≈ enum vs namespace, different name vscode `Invoke` vs coc `Invoked` |
| `CodeLens` | `CodeLens` | ≈ class vs interface |

---

## 5. Document Symbols

| VS Code | coc.nvim | Exact Match? |
|---------|----------|-----------|
| `SymbolKind` | `SymbolKind` | ≈ enum vs namespace, values offset by 1 (vscode File=0, coc File=1) |
| `SymbolTag` | `SymbolTag` | ≈ enum vs namespace |
| `DocumentSymbol` | `DocumentSymbol` | ≈ class vs interface |
| `SymbolInformation` | `SymbolInformation` | ≈ class vs interface |
| — | `BaseSymbolInformation` | coc only (LSP) |
| — | `WorkspaceSymbol` | coc only (LSP) |
| `DocumentHighlight` | `DocumentHighlight` | ≈ class vs interface |
| `DocumentHighlightKind` | `DocumentHighlightKind` | ≈ enum vs namespace, values offset by 1 (vscode Text=0, coc Text=1) |

---

## 6. SignatureHelp

| VS Code | coc.nvim | Exact Match? |
|---------|----------|-----------|
| `SignatureHelp` | `SignatureHelp` | ≈ class vs interface |
| `SignatureInformation` | `SignatureInformation` | ≈ class vs interface |
| `ParameterInformation` | `ParameterInformation` | ≈ class vs interface |

---

## 7. References / Definitions

| VS Code | coc.nvim | Exact Match? |
|---------|----------|-----------|
| `Location` | `Location` | ≈ class vs interface |
| `LocationLink` | `LocationLink` | ≈ class vs interface |
| `ReferenceContext` | `ReferenceContext` | Yes |
| — | `Declaration` | coc has no top-level type (uses Location[] directly) |
| — | `DeclarationLink` | coc only |

---

## 8. Folding / Selection

| VS Code | coc.nvim | Exact Match? |
|---------|----------|-----------|
| `FoldingRange` | `FoldingRange` | ≈ class vs interface |
| `FoldingRangeKind` | `FoldingRangeKind` | ≈ |
| `SelectionRange` | `SelectionRange` | ≈ class vs interface |

---

## 9. Hierarchy

| VS Code | coc.nvim | Exact Match? |
|---------|----------|-----------|
| `CallHierarchyItem` | `CallHierarchyItem` | ≈ class vs interface |
| `CallHierarchyIncomingCall` | `CallHierarchyIncomingCall` | ≈ |
| `CallHierarchyOutgoingCall` | `CallHierarchyOutgoingCall` | ≈ |
| `TypeHierarchyItem` | `TypeHierarchyItem` | ≈ class vs type alias |
| `LinkedEditingRanges` | `LinkedEditingRanges` | ≈ class vs interface |

---

## 10. InlayHint / Semantic Tokens

| VS Code | coc.nvim | Exact Match? |
|---------|----------|-----------|
| `InlayHint` | `InlayHint` | ≈ class vs type alias |
| `InlayHintKind` | `InlayHintKind` | ≈ enum vs namespace |
| `InlayHintLabelPart` | `InlayHintLabelPart` | ≈ |
| `SemanticTokensLegend` | `SemanticTokensLegend` | Yes |
| `SemanticTokens` | `SemanticTokens` | Yes |
| `SemanticTokensEdit` | `SemanticTokensEdit` | Yes |
| `SemanticTokensEdits` | `SemanticTokensEdits` | Yes |
| `SemanticTokensBuilder` | `SemanticTokensBuilder` | Yes |

---

## 11. Terminal / Output / StatusBar

| VS Code | coc.nvim | Exact Match? |
|---------|----------|-----------|
| `Terminal` | `Terminal` | ≈ coc has additional bufnr |
| `TerminalOptions` | `TerminalOptions` | ≈ coc missing many options |
| `TerminalExitStatus` | `TerminalExitStatus` | Yes |
| `Pseudoterminal` | — | vscode only |
| `ExtensionTerminalOptions` | — | vscode only |
| `TerminalProfile` | — | vscode only |
| `StatusBarAlignment` | — | vscode only |
| `StatusBarItem` | `StatusBarItem` | ≈ coc missing many properties |
| `OutputChannel` | `OutputChannel` | ≈ coc has additional content, missing replace |

---

## 12. TreeView

| VS Code | coc.nvim | Exact Match? |
|---------|----------|-----------|
| `TreeItem` | `TreeItem` | ≈ coc uses icon instead of iconPath |
| `TreeItemCollapsibleState` | `TreeItemCollapsibleState` | Yes |
| `TreeDataProvider` | `TreeDataProvider` | Yes |
| `TreeView` | `TreeView` | ≈ coc has additional windowId/show |
| `TreeViewOptions` | `TreeViewOptions` | ≈ |

---

## 13. QuickPick / InputBox

| VS Code | coc.nvim | Exact Match? |
|---------|----------|-----------|
| `QuickPickItem` | `QuickPickItem` | ≈ coc missing kind/iconPath/detail/buttons |
| — | `QuickPickOptions` | coc does not have this interface |
| `QuickPick<T>` | `QuickPick<T>` | ≈ coc has additional vim properties like loading/maxHeight |
| `InputBox` | `InputBox` | ≈ coc has additional vim properties like borderhighlight/bufnr |
| `MessageItem` | `MessageItem` | Yes |
| `MessageOptions` | `MessageOptions` | Yes |

---

## 14. Color

| VS Code | coc.nvim | Exact Match? |
|---------|----------|-----------|
| `Color` | `Color` | ≈ class vs interface |
| `ColorInformation` | `ColorInformation` | ≈ class vs interface |
| `ColorPresentation` | `ColorPresentation` | ≈ class vs interface |

---

## 15. Providers (Interface Names)

| VS Code | coc.nvim | Exact Match? |
|---------|----------|-----------|
| `CompletionItemProvider` | `CompletionItemProvider` | ≈ vscode has generics |
| `InlineCompletionItemProvider` | `InlineCompletionItemProvider` | Yes |
| `HoverProvider` | `HoverProvider` | Yes |
| `DefinitionProvider` | `DefinitionProvider` | Yes |
| `DeclarationProvider` | `DeclarationProvider` | Yes |
| `TypeDefinitionProvider` | `TypeDefinitionProvider` | Yes |
| `ImplementationProvider` | `ImplementationProvider` | Yes |
| `ReferenceProvider` | `ReferenceProvider` | Yes |
| `DocumentHighlightProvider` | `DocumentHighlightProvider` | Yes |
| `DocumentSymbolProvider` | `DocumentSymbolProvider` | Yes |
| `WorkspaceSymbolProvider` | `WorkspaceSymbolProvider` | Yes |
| `CodeActionProvider` | `CodeActionProvider` | Yes |
| `CodeLensProvider` | `CodeLensProvider` | Yes |
| `DocumentFormattingEditProvider` | `DocumentFormattingEditProvider` | Yes |
| `DocumentRangeFormattingEditProvider` | `DocumentRangeFormattingEditProvider` | Yes |
| `OnTypeFormattingEditProvider` | `OnTypeFormattingEditProvider` | Yes |
| `SignatureHelpProvider` | `SignatureHelpProvider` | Yes |
| `RenameProvider` | `RenameProvider` | Yes |
| `DocumentLinkProvider` | `DocumentLinkProvider` | Yes |
| `DocumentColorProvider` | `DocumentColorProvider` | Yes |
| `FoldingRangeProvider` | `FoldingRangeProvider` | Yes |
| `SelectionRangeProvider` | `SelectionRangeProvider` | Yes |
| `CallHierarchyProvider` | `CallHierarchyProvider` | Yes |
| `TypeHierarchyProvider` | `TypeHierarchyProvider` | Yes |
| `LinkedEditingRangeProvider` | `LinkedEditingRangeProvider` | Yes |
| `InlayHintsProvider` | `InlayHintsProvider` | Yes |
| `DocumentSemanticTokensProvider` | `DocumentSemanticTokensProvider` | Yes |
| `DocumentRangeSemanticTokensProvider` | `DocumentRangeSemanticTokensProvider` | Yes |
| `InlineValuesProvider` | `InlineValuesProvider` | ≈ interface exists, but no available registration function |
| `EvaluatableExpressionProvider` | — | coc does not have |

---

## 16. Namespaces

| VS Code | coc.nvim | Exact Match? |
|---------|----------|-----------|
| `workspace` | `workspace` | ≈ see detailed docs |
| `window` | `window` | ≈ see detailed docs |
| `languages` | `languages` | ≈ see detailed docs |
| `commands` | `commands` | ≈ see detailed docs |
| `extensions` | `extensions` | ≈ getExtensionById vs getExtension |
| `env` | — | vscode only |
| `debug` | — | vscode only |
| `tasks` | — | vscode only |
| `notebooks` | — | vscode only |
| `scm` | — | vscode only |
| `tests` | — | vscode only |
| `chat` | — | vscode only |
| `lm` | — | vscode only |
| `authentication` | — | vscode only |
| `l10n` | — | vscode only |
| — | `snippetManager` | coc only |

---

## 17. LSP Types (coc only, no vscode equivalent)

These are types from the LSP protocol that coc exposes directly but vscode does not:

| coc.nvim | Description |
|----------|------|
| `integer`、`uinteger`、`decimal` | LSP numeric types |
| `LSPAny`、`LSPObject`、`LSPArray` | LSP generic types |
| `TextDocumentIdentifier` | LSP document ID |
| `VersionedTextDocumentIdentifier` | LSP versioned |
| `OptionalVersionedTextDocumentIdentifier` | LSP optional version |
| `TextDocumentItem` | LSP document creation |
| `TextDocumentEdit` | LSP document edit |
| `CreateFile` / `RenameFile` / `DeleteFile` | LSP file operations |
| `ChangeAnnotation` / `ChangeAnnotationIdentifier` | LSP change annotations |
| `TextEditChange` | LSP edit changes |
| `ConfigurationItem`、`ConfigurationParams` | LSP configuration params |
| `ColorProviderMiddleware` | LSP middleware |
| `ConfigurationWorkspaceMiddleware` | LSP middleware |
| `DiagnosticProviderMiddleware` | LSP middleware |
| `CallHierarchyMiddleware` | LSP middleware |
| `DeclarationMiddleware` | LSP middleware |
| Various `*RegistrationOptions`、`*Signature` | LSP registration/signature types |

---

## 18. Vim-specific API (coc only)

The following types are available in coc but not in VS Code:

| coc.nvim | Description |
|----------|------|
| `Buffer` | Neovim buffer operations |
| `BufferHighlight` / `BufferClearHighlight` | buffer highlights |
| `BufferSync` / `BufferSyncItem` | buffer sync |
| `Autocmd` / `AugroupOption` | vim autocmd |
| `KeymapOption` / `BufferKeymapOption` | key mappings |
| `Neovim` | Neovim instance |
| `Env` (workspace.env) | vim environment info |
| `Dialog` / `DialogButton` / `DialogConfig` | vim floating dialogs |
| `AnsiHighlight` / `AnsiItem` / `ansiparse` | ANSI color parsing |
| `ApplyKind` | LSP apply kind |
| `CompleteOption` / `CompleteDoneItem` / `CompleteResult` | completion info |
| `CursorPosition` | cursor position (includes screen coordinates) |
| `CommandItem` | command list item |
| `Channel`、`ChannelOption` | Nvim channels |
| `ConfigurationInspect` | configuration inspection result |
| `ChildProcessInfo` | child process info |
| `VimCommand` / `VimCommandDescription` | Vim command description |
| `IsKeywordOption` | keyword character configuration |
