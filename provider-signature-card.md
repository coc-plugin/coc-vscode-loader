# Provider 注册签名卡 — coc.nvim vs VS Code

> coc 统一模式：`(name: string, shortcut: string, selector: DocumentSelector | null, provider, ...)`
> vscode 统一模式：`(selector: DocumentSelector, provider, ...)`

---

## 1. CompletionItemProvider

```typescript
// VS Code
languages.registerCompletionItemProvider(
  selector: DocumentSelector,
  provider: CompletionItemProvider,
  ...triggerCharacters: string[]
): Disposable

// coc.nvim
languages.registerCompletionItemProvider(
  name: string,                    // 额外：provider 唯一标识
  shortcut: string,               // 额外：补全菜单显示缩写
  selector: DocumentSelector | null,  // 可为 null
  provider: CompletionItemProvider,
  triggerCharacters?: string[],   // 数组 vs rest 参数
  priority?: number,              // 额外：优先级
  allCommitCharacters?: string[]  // 额外：全局 commit chars
): Disposable
```

**差异：** coc 多了 `name`、`shortcut`、`priority`、`allCommitCharacters`。`triggerCharacters` 是可选数组而非必填 rest 参数。`selector` 可为 `null`。

---

## 2. InlineCompletionItemProvider

```typescript
// VS Code
languages.registerInlineCompletionItemProvider(
  selector: DocumentSelector,
  provider: InlineCompletionItemProvider
): Disposable

// coc.nvim
languages.registerInlineCompletionItemProvider(
  selector: DocumentSelector,
  provider: InlineCompletionItemProvider
): Disposable
```

**相同。**

---

## 3. HoverProvider

```typescript
// VS Code
languages.registerHoverProvider(
  selector: DocumentSelector,
  provider: HoverProvider
): Disposable

// coc.nvim — 相同签名
```

**相同。**

---

## 4. DefinitionProvider / DeclarationProvider / TypeDefinitionProvider / ImplementationProvider

```typescript
// VS Code — 四者签名相同
languages.registerDefinitionProvider(
  selector: DocumentSelector,
  provider: DefinitionProvider
): Disposable

// coc.nvim — 相同签名
```

**相同。**

---

## 5. ReferenceProvider

```typescript
// VS Code
languages.registerReferenceProvider(
  selector: DocumentSelector,
  provider: ReferenceProvider
): Disposable

// coc.nvim
languages.registerReferencesProvider(  // ⚠️ 命名不同：复数 References
  selector: DocumentSelector,
  provider: ReferenceProvider
): Disposable
```

**差异：** `registerReferenceProvider` (vscode) vs `registerReferencesProvider` (coc)。

---

## 6. DocumentHighlightProvider

**相同。**

---

## 7. DocumentSymbolProvider

```typescript
// VS Code
languages.registerDocumentSymbolProvider(
  selector: DocumentSelector,
  provider: DocumentSymbolProvider,
  metadata?: DocumentSymbolProviderMetadata
): Disposable

// coc.nvim — 相同签名
```

**相同。**

---

## 8. WorkspaceSymbolProvider

```typescript
// VS Code
languages.registerWorkspaceSymbolProvider(
  provider: WorkspaceSymbolProvider<T>
): Disposable

// coc.nvim — 相同签名（但无泛型）
```

**相同**（类型参数差异忽略）。

---

## 9. CodeActionProvider

```typescript
// VS Code
languages.registerCodeActionsProvider(  // ⚠️ 复数 Actions
  selector: DocumentSelector,
  provider: CodeActionProvider,
  metadata?: CodeActionProviderMetadata
): Disposable

// coc.nvim
languages.registerCodeActionProvider(   // ⚠️ 单数 Action
  selector: DocumentSelector,
  provider: CodeActionProvider,
  clientId?: string,                    // 额外：客户端 ID
  codeActionKinds?: ReadonlyArray<string>  // meta 数据用简单数组
): Disposable
```

**差异：** 命名不同（Actions vs Action），`metadata` 对象换成 `clientId + codeActionKinds[]`。

---

## 10. CodeLensProvider

**相同。**

---

## 11. DocumentFormattingEditProvider

```typescript
// VS Code
languages.registerDocumentFormattingEditProvider(
  selector: DocumentSelector,
  provider: DocumentFormattingEditProvider
): Disposable

// coc.nvim
languages.registerDocumentFormatProvider(  // ⚠️ 命名不同
  selector: DocumentSelector,
  provider: DocumentFormattingEditProvider,
  priority?: number                       // 额外：优先级
): Disposable
```

**差异：** `registerDocumentFormat` (coc) vs `registerDocumentFormattingEdit` (vscode)，coc 多了 `priority`。

---

## 12. DocumentRangeFormattingEditProvider

```typescript
// VS Code
languages.registerDocumentRangeFormattingEditProvider(
  selector: DocumentSelector,
  provider: DocumentRangeFormattingEditProvider
): Disposable

// coc.nvim
languages.registerDocumentRangeFormatProvider(  // ⚠️ 命名不同
  selector: DocumentSelector,
  provider: DocumentRangeFormattingEditProvider,
  priority?: number
): Disposable
```

**差异：** 同上。

---

## 13. OnTypeFormattingEditProvider

```typescript
// VS Code
languages.registerOnTypeFormattingEditProvider(
  selector: DocumentSelector,
  provider: OnTypeFormattingEditProvider,
  firstTriggerCharacter: string,
  ...moreTriggerCharacters: string[]
): Disposable

// coc.nvim
languages.registerOnTypeFormattingEditProvider(
  selector: DocumentSelector,
  provider: OnTypeFormattingEditProvider,
  triggerCharacters: string[]  // ⚠️ 数组而非 rest 参数
): Disposable
```

**差异：** vscode 用 rest 参数，coc 用数组。

---

## 14. RenameProvider

**相同。**

---

## 15. SignatureHelpProvider

```typescript
// VS Code — 有 2 个 overloads
// Overload 1:
languages.registerSignatureHelpProvider(
  selector: DocumentSelector,
  provider: SignatureHelpProvider,
  ...triggerCharacters: string[]
): Disposable
// Overload 2:
languages.registerSignatureHelpProvider(
  selector: DocumentSelector,
  provider: SignatureHelpProvider,
  metadata: SignatureHelpProviderMetadata  // ⚠️ metadata overload
): Disposable

// coc.nvim — 只有 1 个
languages.registerSignatureHelpProvider(
  selector: DocumentSelector,
  provider: SignatureHelpProvider,
  triggerCharacters?: string[]
): Disposable
```

**差异：** coc 没有 `SignatureHelpProviderMetadata` overload。

---

## 16. DocumentLinkProvider

**相同。**

---

## 17. DocumentColorProvider

```typescript
// VS Code
languages.registerColorProvider(
  selector: DocumentSelector,
  provider: DocumentColorProvider
): Disposable

// coc.nvim
languages.registerDocumentColorProvider(  // ⚠️ 命名不同
  selector: DocumentSelector,
  provider: DocumentColorProvider
): Disposable
```

**差异：** `registerColorProvider` (vscode) vs `registerDocumentColorProvider` (coc)。

---

## 18. FoldingRangeProvider / SelectionRangeProvider / LinkedEditingRangeProvider

**相同。**

---

## 19. CallHierarchyProvider / TypeHierarchyProvider

**相同。**

---

## 20. InlayHintsProvider

**相同。**

---

## 21. SemanticTokensProvider (Document + Range)

**相同。**

---

## 22. TextDocumentContentProvider

```typescript
// 不是 languages namespace 的，是 workspace 的
workspace.registerTextDocumentContentProvider(
  scheme: string,
  provider: TextDocumentContentProvider
): Disposable
```

**相同。**

---

## 23. vscode 独有 Provider（coc 无）

```typescript
// 以下在 coc 中不存在
languages.registerEvaluatableExpressionProvider(selector, provider)
languages.registerInlineValuesProvider(selector, provider)
languages.registerDocumentDropEditProvider(selector, provider, metadata?)
languages.registerDocumentPasteEditProvider(selector, provider, metadata)
window.registerTreeDataProvider(viewId, provider)
window.registerTerminalLinkProvider(provider)
window.registerTerminalProfileProvider(id, provider)
```

---

## 快速转换表

| coc 注册函数 | vscode 注册函数 | 参数调整 |
|-------------|----------------|---------|
| `registerCompletionItemProvider(n,s,sel,p,t?,pri?,ac?)` | `registerCompletionItemProvider(sel,p,...t)` | 去掉 n,s,pri,ac；t 变 rest |
| `registerInlineCompletionItemProvider(sel,p)` | `registerInlineCompletionItemProvider(sel,p)` | 不变 |
| `registerHoverProvider(sel,p)` | `registerHoverProvider(sel,p)` | 不变 |
| `registerDefinitionProvider(sel,p)` | `registerDefinitionProvider(sel,p)` | 不变 |
| `registerReferencesProvider(sel,p)` | `registerReferenceProvider(sel,p)` | 函数名去 s |
| `registerDocumentHighlightProvider(sel,p)` | `registerDocumentHighlightProvider(sel,p)` | 不变 |
| `registerDocumentSymbolProvider(sel,p,m?)` | `registerDocumentSymbolProvider(sel,p,m?)` | 不变 |
| `registerWorkspaceSymbolProvider(p)` | `registerWorkspaceSymbolProvider(p)` | 不变 |
| `registerCodeActionProvider(sel,p,cid?,kinds?)` | `registerCodeActionsProvider(sel,p,m?)` | 函数名 +s；cid/kinds 合成 metadata |
| `registerCodeLensProvider(sel,p)` | `registerCodeLensProvider(sel,p)` | 不变 |
| `registerDocumentFormatProvider(sel,p,pri?)` | `registerDocumentFormattingEditProvider(sel,p)` | 补全函数名；去 priority |
| `registerDocumentRangeFormatProvider(sel,p,pri?)` | `registerDocumentRangeFormattingEditProvider(sel,p)` | 同上 |
| `registerOnTypeFormattingEditProvider(sel,p,t[])` | `registerOnTypeFormattingEditProvider(sel,p,...t)` | 数组展开为 rest |
| `registerRenameProvider(sel,p)` | `registerRenameProvider(sel,p)` | 不变 |
| `registerSignatureHelpProvider(sel,p,t?)` | `registerSignatureHelpProvider(sel,p,...t)` 或 `(sel,p,meta)` | 数组 vs rest；无 metadata |
| `registerDocumentLinkProvider(sel,p)` | `registerDocumentLinkProvider(sel,p)` | 不变 |
| `registerDocumentColorProvider(sel,p)` | `registerColorProvider(sel,p)` | 函数名去 Document |
| `registerFoldingRangeProvider(sel,p)` | `registerFoldingRangeProvider(sel,p)` | 不变 |
| `registerSelectionRangeProvider(sel,p)` | `registerSelectionRangeProvider(sel,p)` | 不变 |
| `registerCallHierarchyProvider(sel,p)` | `registerCallHierarchyProvider(sel,p)` | 不变 |
| `registerTypeHierarchyProvider(sel,p)` | `registerTypeHierarchyProvider(sel,p)` | 不变 |
| `registerLinkedEditingRangeProvider(sel,p)` | `registerLinkedEditingRangeProvider(sel,p)` | 不变 |
| `registerInlayHintsProvider(sel,p)` | `registerInlayHintsProvider(sel,p)` | 不变 |
| `registerDocumentSemanticTokensProvider(sel,p,l)` | `registerDocumentSemanticTokensProvider(sel,p,l)` | 不变 |
| `registerDocumentRangeSemanticTokensProvider(sel,p,l)` | `registerDocumentRangeSemanticTokensProvider(sel,p,l)` | 不变 |
