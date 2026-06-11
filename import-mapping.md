# Import 映射：VS Code → coc.nvim

> 完整对照 `from 'vscode'` 的导出名到 `from 'coc.nvim'` 的导出名。
> 标记 `≈` 表示签名/类型不完全一致。

---

## 1. 基础类型

| VS Code | coc.nvim | 完全一致？ |
|---------|----------|-----------|
| `CancellationToken` | `CancellationToken` | ≈ coc 多了 namespace |
| `CancellationTokenSource` | `CancellationTokenSource` | 是 |
| `CancellationError` | `CancellationError` | 是 |
| `Disposable` | `Disposable` | ≈ class vs interface |
| `Event<T>` | `Event<T>` | 是 |
| `EventEmitter<T>` | `Emitter<T>` | ≈ 命名不同 |
| — | `EventEmitter` | coc 无此名，用 Emitter |
| `Position` | `Position` | ≈ class vs interface |
| `Range` | `Range` | ≈ class vs interface |
| `Selection` | — | vscode 独有 |
| `TextDocument` | `TextDocument` | ≈ 缺少部分字段 |
| — | `LinesTextDocument` | coc 独有（extends TextDocument） |
| `TextLine` | `TextLine` | 是 |
| `EndOfLine` | — | vscode 独有 |
| `Uri` | `Uri` | ≈ class vs class（coc 构造器为 protected） |
| — | `DocumentUri` | coc 独有（`= string`） |
| `Command` | `Command` | ≈ coc 少 tooltip |
| `TextEdit` | `TextEdit` | ≈ class vs interface |
| — | `AnnotatedTextEdit` | coc 独有（LSP） |
| — | `SnippetTextEdit` | coc 独有 |
| `WorkspaceEdit` | `WorkspaceEdit` | ≈ class vs interface |
| — | `WorkspaceChange` | coc 独有 |
| `SnippetString` | `SnippetString` | 是 |
| `MarkdownString` | — | vscode 独有 |
| — | `MarkupContent` | coc 独有（LSP） |
| — | `MarkupKind` | coc 独有 |
| `MarkedString` | `MarkedString` | 是 |
| `Hover` | `Hover` | ≈ class vs interface，coc 无工厂方法 |
| `ThemeColor` | — | coc 无 |
| `ThemeIcon` | — | coc 无 |
| `IconPath` | — | vscode 独有 |
| `RelativePattern` | `RelativePattern` | 是 |
| `GlobPattern` | `GlobPattern` | 是 |
| `DocumentFilter` | `DocumentFilter` | 是 |
| `DocumentSelector` | `DocumentSelector` | 是 |
| `ProviderResult` | `ProviderResult` | 是 |

---

## 2. 诊断

| VS Code | coc.nvim | 完全一致？ |
|---------|----------|-----------|
| `Diagnostic` | `Diagnostic` | ≈ class vs interface，severity 值不同 |
| `DiagnosticSeverity` | `DiagnosticSeverity` | ≈ enum 0-3 vs 1-4 |
| `DiagnosticTag` | `DiagnosticTag` | ≈ enum vs namespace |
| `DiagnosticRelatedInformation` | `DiagnosticRelatedInformation` | ≈ |
| `DiagnosticCollection` | `DiagnosticCollection` | ≈ key 类型 Uri vs string |
| — | `CodeDescription` | coc 独有（LSP） |
| — | `DiagnosticItem` | coc 独有 |
| — | `DiagnosticProvider` | coc 独有 |
| — | `DiagnosticEventParams` | coc 独有（LSP） |

---

## 3. 补全

| VS Code | coc.nvim | 完全一致？ |
|---------|----------|-----------|
| `CompletionItem` | `CompletionItem` | ≈ class vs interface，coc `create(label)` 只接受 label，kind 需单独设 `item.kind =` |
| `CompletionItemKind` | `CompletionItemKind` | ≈ enum vs namespace + type，值偏移 1 (vscode Text=0, coc Text=1) |
| `CompletionList` | `CompletionList` | ≈ class vs interface |
| `CompletionTriggerKind` | `CompletionTriggerKind` | ≈ enum vs namespace + type，vscode `Invoke=0` vs coc `Invoked:1` |
| — | `InsertTextFormat` | coc 独有（LSP，vscode 用 `string \| SnippetString`） |
| — | `InsertTextMode` | coc 独有（LSP） |
| `CompletionItemTag` | `CompletionItemTag` | ≈ enum vs namespace + type |
| `InsertReplaceEdit` | `InsertReplaceEdit` | ≈ |
| `CompletionItemLabelDetails` | `CompletionItemLabelDetails` | 是 |
| — | `CompleteOption` | coc 独有 |
| — | `CompleteDoneItem` | coc 独有 |
| — | `CompleteResult` | coc 独有 |

---

## 4. CodeAction / CodeLens

| VS Code | coc.nvim | 完全一致？ |
|---------|----------|-----------|
| `CodeAction` | `CodeAction` | ≈ class vs interface |
| `CodeActionKind` | `CodeActionKind` | ≈ class vs string alias |
| `CodeActionContext` | `CodeActionContext` | ≈ |
| `CodeActionTriggerKind` | `CodeActionTriggerKind` | ≈ enum vs namespace，命名不同 vscode `Invoke` vs coc `Invoked` |
| `CodeLens` | `CodeLens` | ≈ class vs interface |

---

## 5. 文档符号

| VS Code | coc.nvim | 完全一致？ |
|---------|----------|-----------|
| `SymbolKind` | `SymbolKind` | ≈ enum vs namespace，值偏移 1 (vscode File=0, coc File=1) |
| `SymbolTag` | `SymbolTag` | ≈ enum vs namespace |
| `DocumentSymbol` | `DocumentSymbol` | ≈ class vs interface |
| `SymbolInformation` | `SymbolInformation` | ≈ class vs interface |
| — | `BaseSymbolInformation` | coc 独有（LSP） |
| — | `WorkspaceSymbol` | coc 独有（LSP） |
| `DocumentHighlight` | `DocumentHighlight` | ≈ class vs interface |
| `DocumentHighlightKind` | `DocumentHighlightKind` | ≈ enum vs namespace，值偏移 1 (vscode Text=0, coc Text=1) |

---

## 6. SignatureHelp

| VS Code | coc.nvim | 完全一致？ |
|---------|----------|-----------|
| `SignatureHelp` | `SignatureHelp` | ≈ class vs interface |
| `SignatureInformation` | `SignatureInformation` | ≈ class vs interface |
| `ParameterInformation` | `ParameterInformation` | ≈ class vs interface |

---

## 7. 引用 / 定义

| VS Code | coc.nvim | 完全一致？ |
|---------|----------|-----------|
| `Location` | `Location` | ≈ class vs interface |
| `LocationLink` | `LocationLink` | ≈ class vs interface |
| `ReferenceContext` | `ReferenceContext` | 是 |
| — | `Declaration` | coc 无顶层类型（直接用 Location[]） |
| — | `DeclarationLink` | coc 独有 |

---

## 8. 折叠 / 选择

| VS Code | coc.nvim | 完全一致？ |
|---------|----------|-----------|
| `FoldingRange` | `FoldingRange` | ≈ class vs interface |
| `FoldingRangeKind` | `FoldingRangeKind` | ≈ |
| `SelectionRange` | `SelectionRange` | ≈ class vs interface |

---

## 9. 层次

| VS Code | coc.nvim | 完全一致？ |
|---------|----------|-----------|
| `CallHierarchyItem` | `CallHierarchyItem` | ≈ class vs interface |
| `CallHierarchyIncomingCall` | `CallHierarchyIncomingCall` | ≈ |
| `CallHierarchyOutgoingCall` | `CallHierarchyOutgoingCall` | ≈ |
| `TypeHierarchyItem` | `TypeHierarchyItem` | ≈ class vs type alias |
| `LinkedEditingRanges` | `LinkedEditingRanges` | ≈ class vs interface |

---

## 10. InlayHint / 语义令牌

| VS Code | coc.nvim | 完全一致？ |
|---------|----------|-----------|
| `InlayHint` | `InlayHint` | ≈ class vs type alias |
| `InlayHintKind` | `InlayHintKind` | ≈ enum vs namespace |
| `InlayHintLabelPart` | `InlayHintLabelPart` | ≈ |
| `SemanticTokensLegend` | `SemanticTokensLegend` | 是 |
| `SemanticTokens` | `SemanticTokens` | 是 |
| `SemanticTokensEdit` | `SemanticTokensEdit` | 是 |
| `SemanticTokensEdits` | `SemanticTokensEdits` | 是 |
| `SemanticTokensBuilder` | `SemanticTokensBuilder` | 是 |

---

## 11. Terminal / Output / StatusBar

| VS Code | coc.nvim | 完全一致？ |
|---------|----------|-----------|
| `Terminal` | `Terminal` | ≈ coc 多了 bufnr |
| `TerminalOptions` | `TerminalOptions` | ≈ coc 少了大量选项 |
| `TerminalExitStatus` | `TerminalExitStatus` | 是 |
| `Pseudoterminal` | — | vscode 独有 |
| `ExtensionTerminalOptions` | — | vscode 独有 |
| `TerminalProfile` | — | vscode 独有 |
| `StatusBarAlignment` | — | vscode 独有 |
| `StatusBarItem` | `StatusBarItem` | ≈ coc 少了大量属性 |
| `OutputChannel` | `OutputChannel` | ≈ coc 多了 content，少了 replace |

---

## 12. TreeView

| VS Code | coc.nvim | 完全一致？ |
|---------|----------|-----------|
| `TreeItem` | `TreeItem` | ≈ coc 用 icon 替代 iconPath |
| `TreeItemCollapsibleState` | `TreeItemCollapsibleState` | 是 |
| `TreeDataProvider` | `TreeDataProvider` | 是 |
| `TreeView` | `TreeView` | ≈ coc 多了 windowId/show |
| `TreeViewOptions` | `TreeViewOptions` | ≈ |

---

## 13. QuickPick / InputBox

| VS Code | coc.nvim | 完全一致？ |
|---------|----------|-----------|
| `QuickPickItem` | `QuickPickItem` | ≈ coc 少 kind/iconPath/detail/buttons |
| — | `QuickPickOptions` | coc 无此接口 |
| `QuickPick<T>` | `QuickPick<T>` | ≈ coc 多 loading/maxHeight 等 vim 属性 |
| `InputBox` | `InputBox` | ≈ coc 多 borderhighlight/bufnr 等 vim 属性 |
| `MessageItem` | `MessageItem` | 是 |
| `MessageOptions` | `MessageOptions` | 是 |

---

## 14. 颜色

| VS Code | coc.nvim | 完全一致？ |
|---------|----------|-----------|
| `Color` | `Color` | ≈ class vs interface |
| `ColorInformation` | `ColorInformation` | ≈ class vs interface |
| `ColorPresentation` | `ColorPresentation` | ≈ class vs interface |

---

## 15. Providers（接口名）

| VS Code | coc.nvim | 完全一致？ |
|---------|----------|-----------|
| `CompletionItemProvider` | `CompletionItemProvider` | ≈ vscode 有泛型 |
| `InlineCompletionItemProvider` | `InlineCompletionItemProvider` | 是 |
| `HoverProvider` | `HoverProvider` | 是 |
| `DefinitionProvider` | `DefinitionProvider` | 是 |
| `DeclarationProvider` | `DeclarationProvider` | 是 |
| `TypeDefinitionProvider` | `TypeDefinitionProvider` | 是 |
| `ImplementationProvider` | `ImplementationProvider` | 是 |
| `ReferenceProvider` | `ReferenceProvider` | 是 |
| `DocumentHighlightProvider` | `DocumentHighlightProvider` | 是 |
| `DocumentSymbolProvider` | `DocumentSymbolProvider` | 是 |
| `WorkspaceSymbolProvider` | `WorkspaceSymbolProvider` | 是 |
| `CodeActionProvider` | `CodeActionProvider` | 是 |
| `CodeLensProvider` | `CodeLensProvider` | 是 |
| `DocumentFormattingEditProvider` | `DocumentFormattingEditProvider` | 是 |
| `DocumentRangeFormattingEditProvider` | `DocumentRangeFormattingEditProvider` | 是 |
| `OnTypeFormattingEditProvider` | `OnTypeFormattingEditProvider` | 是 |
| `SignatureHelpProvider` | `SignatureHelpProvider` | 是 |
| `RenameProvider` | `RenameProvider` | 是 |
| `DocumentLinkProvider` | `DocumentLinkProvider` | 是 |
| `DocumentColorProvider` | `DocumentColorProvider` | 是 |
| `FoldingRangeProvider` | `FoldingRangeProvider` | 是 |
| `SelectionRangeProvider` | `SelectionRangeProvider` | 是 |
| `CallHierarchyProvider` | `CallHierarchyProvider` | 是 |
| `TypeHierarchyProvider` | `TypeHierarchyProvider` | 是 |
| `LinkedEditingRangeProvider` | `LinkedEditingRangeProvider` | 是 |
| `InlayHintsProvider` | `InlayHintsProvider` | 是 |
| `DocumentSemanticTokensProvider` | `DocumentSemanticTokensProvider` | 是 |
| `DocumentRangeSemanticTokensProvider` | `DocumentRangeSemanticTokensProvider` | 是 |
| `InlineValuesProvider` | `InlineValuesProvider` | ≈ 接口存在，但无注册函数可用 |
| `EvaluatableExpressionProvider` | — | coc 无 |

---

## 16. 命名空间

| VS Code | coc.nvim | 完全一致？ |
|---------|----------|-----------|
| `workspace` | `workspace` | ≈ 见详细文档 |
| `window` | `window` | ≈ 见详细文档 |
| `languages` | `languages` | ≈ 见详细文档 |
| `commands` | `commands` | ≈ 见详细文档 |
| `extensions` | `extensions` | ≈ getExtensionById vs getExtension |
| `env` | — | vscode 独有 |
| `debug` | — | vscode 独有 |
| `tasks` | — | vscode 独有 |
| `notebooks` | — | vscode 独有 |
| `scm` | — | vscode 独有 |
| `tests` | — | vscode 独有 |
| `chat` | — | vscode 独有 |
| `lm` | — | vscode 独有 |
| `authentication` | — | vscode 独有 |
| `l10n` | — | vscode 独有 |
| — | `snippetManager` | coc 独有 |

---

## 17. LSP 类型（coc 独有，无 vscode 等价）

这些是 LSP 协议中的类型，coc 直接暴露但在 vscode 中不直接暴露：

| coc.nvim | 说明 |
|----------|------|
| `integer`、`uinteger`、`decimal` | LSP 数值类型 |
| `LSPAny`、`LSPObject`、`LSPArray` | LSP 通用类型 |
| `TextDocumentIdentifier` | LSP 文档 ID |
| `VersionedTextDocumentIdentifier` | LSP 带版本 |
| `OptionalVersionedTextDocumentIdentifier` | LSP 可选版本 |
| `TextDocumentItem` | LSP 文档创建 |
| `TextDocumentEdit` | LSP 文档编辑 |
| `CreateFile` / `RenameFile` / `DeleteFile` | LSP 文件操作 |
| `ChangeAnnotation` / `ChangeAnnotationIdentifier` | LSP 变更注解 |
| `TextEditChange` | LSP 编辑变更 |
| `ConfigurationItem`、`ConfigurationParams` | LSP 配置参数 |
| `ColorProviderMiddleware` | LSP middleware |
| `ConfigurationWorkspaceMiddleware` | LSP middleware |
| `DiagnosticProviderMiddleware` | LSP middleware |
| `CallHierarchyMiddleware` | LSP middleware |
| `DeclarationMiddleware` | LSP middleware |
| 各种 `*RegistrationOptions`、`*Signature` | LSP 注册/特征类型 |

---

## 18. Vim 特有 API（coc 独有）

以下类型 coc 有，VS Code 没有：

| coc.nvim | 说明 |
|----------|------|
| `Buffer` | Neovim buffer 操作 |
| `BufferHighlight` / `BufferClearHighlight` | buffer 高亮 |
| `BufferSync` / `BufferSyncItem` | buffer 同步 |
| `Autocmd` / `AugroupOption` | vim autocmd |
| `KeymapOption` / `BufferKeymapOption` | 键映射 |
| `Neovim` | Neovim 实例 |
| `Env` (workspace.env) | vim 环境信息 |
| `Dialog` / `DialogButton` / `DialogConfig` | vim 浮动对话框 |
| `AnsiHighlight` / `AnsiItem` / `ansiparse` | ANSI 颜色解析 |
| `ApplyKind` | LSP 应用类别 |
| `CompleteOption` / `CompleteDoneItem` / `CompleteResult` | 补全信息 |
| `CursorPosition` | 光标位置（含 screen 坐标） |
| `CommandItem` | 命令列表项 |
| `Channel`、`ChannelOption` | Nvim 通道 |
| `ConfigurationInspect` | 配置检查结果 |
| `ChildProcessInfo` | 子进程信息 |
| `VimCommand` / `VimCommandDescription` | Vim 命令描述 |
| `IsKeywordOption` | 关键词字符配置 |
