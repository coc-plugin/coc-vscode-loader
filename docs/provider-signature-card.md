# Provider Registration Signature Card — VS Code vs coc.nvim

> vscode unified pattern: `(selector: DocumentSelector, provider, ...)`
> coc unified pattern: `(name: string, shortcut: string, selector: DocumentSelector | null, provider, ...)`

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
  name: string,                    // extra: unique provider identifier
  shortcut: string,               // extra: completion menu abbreviation
  selector: DocumentSelector | null,  // can be null
  provider: CompletionItemProvider,
  triggerCharacters?: string[],   // array vs rest parameter
  priority?: number,              // extra: priority
  allCommitCharacters?: string[]  // extra: global commit chars
): Disposable
```

**Differences:** coc adds `name`, `shortcut`, `priority`, `allCommitCharacters`. `triggerCharacters` is an optional array instead of a required rest parameter. `selector` can be `null`.

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

**Same.**

---

## 3. HoverProvider

```typescript
// VS Code
languages.registerHoverProvider(
  selector: DocumentSelector,
  provider: HoverProvider
): Disposable

// coc.nvim — same signature
```

**Same.**

---

## 4. DefinitionProvider / DeclarationProvider / TypeDefinitionProvider / ImplementationProvider

```typescript
// VS Code — all four share the same signature
languages.registerDefinitionProvider(
  selector: DocumentSelector,
  provider: DefinitionProvider
): Disposable

// coc.nvim — same signature
```

**Same.**

---

## 5. ReferenceProvider

```typescript
// VS Code
languages.registerReferenceProvider(
  selector: DocumentSelector,
  provider: ReferenceProvider
): Disposable

// coc.nvim
languages.registerReferencesProvider(  // ⚠️ different name: plural References
  selector: DocumentSelector,
  provider: ReferenceProvider
): Disposable
```

**Differences:** `registerReferenceProvider` (vscode) vs `registerReferencesProvider` (coc).

---

## 6. DocumentHighlightProvider

**Same.**

---

## 7. DocumentSymbolProvider

```typescript
// VS Code
languages.registerDocumentSymbolProvider(
  selector: DocumentSelector,
  provider: DocumentSymbolProvider,
  metadata?: DocumentSymbolProviderMetadata
): Disposable

// coc.nvim — same signature
```

**Same.**

---

## 8. WorkspaceSymbolProvider

```typescript
// VS Code
languages.registerWorkspaceSymbolProvider(
  provider: WorkspaceSymbolProvider<T>
): Disposable

// coc.nvim — same signature (but without generics)
```

**Same** (type parameter differences ignored).

---

## 9. CodeActionProvider

```typescript
// VS Code
languages.registerCodeActionsProvider(  // ⚠️ plural Actions
  selector: DocumentSelector,
  provider: CodeActionProvider,
  metadata?: CodeActionProviderMetadata
): Disposable

// coc.nvim
languages.registerCodeActionProvider(   // ⚠️ singular Action
  selector: DocumentSelector,
  provider: CodeActionProvider,
  clientId?: string,                    // extra: client ID
  codeActionKinds?: ReadonlyArray<string>  // metadata as simple array
): Disposable
```

**Differences:** different names (Actions vs Action), `metadata` object replaced with `clientId + codeActionKinds[]`.

---

## 10. CodeLensProvider

**Same.**

---

## 11. DocumentFormattingEditProvider

```typescript
// VS Code
languages.registerDocumentFormattingEditProvider(
  selector: DocumentSelector,
  provider: DocumentFormattingEditProvider
): Disposable

// coc.nvim
languages.registerDocumentFormatProvider(  // ⚠️ different name
  selector: DocumentSelector,
  provider: DocumentFormattingEditProvider,
  priority?: number                       // extra: priority
): Disposable
```

**Differences:** `registerDocumentFormat` (coc) vs `registerDocumentFormattingEdit` (vscode), coc adds `priority`.

---

## 12. DocumentRangeFormattingEditProvider

```typescript
// VS Code
languages.registerDocumentRangeFormattingEditProvider(
  selector: DocumentSelector,
  provider: DocumentRangeFormattingEditProvider
): Disposable

// coc.nvim
languages.registerDocumentRangeFormatProvider(  // ⚠️ different name
  selector: DocumentSelector,
  provider: DocumentRangeFormattingEditProvider,
  priority?: number
): Disposable
```

**Differences:** Same as above.

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
  triggerCharacters: string[]  // ⚠️ array instead of rest parameter
): Disposable
```

**Differences:** vscode uses rest parameters, coc uses an array.

---

## 14. RenameProvider

**Same.**

---

## 15. SignatureHelpProvider

```typescript
// VS Code — has 2 overloads
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

// coc.nvim — only 1
languages.registerSignatureHelpProvider(
  selector: DocumentSelector,
  provider: SignatureHelpProvider,
  triggerCharacters?: string[]
): Disposable
```

**Differences:** coc does not have the `SignatureHelpProviderMetadata` overload.

---

## 16. DocumentLinkProvider

**Same.**

---

## 17. DocumentColorProvider

```typescript
// VS Code
languages.registerColorProvider(
  selector: DocumentSelector,
  provider: DocumentColorProvider
): Disposable

// coc.nvim
languages.registerDocumentColorProvider(  // ⚠️ different name
  selector: DocumentSelector,
  provider: DocumentColorProvider
): Disposable
```

**Differences:** `registerColorProvider` (vscode) vs `registerDocumentColorProvider` (coc).

---

## 18. FoldingRangeProvider / SelectionRangeProvider / LinkedEditingRangeProvider

**Same.**

---

## 19. CallHierarchyProvider / TypeHierarchyProvider

**Same.**

---

## 20. InlayHintsProvider

**Same.**

---

## 21. SemanticTokensProvider (Document + Range)

**Same.**

---

## 22. TextDocumentContentProvider

```typescript
// Not from the languages namespace, but from workspace
workspace.registerTextDocumentContentProvider(
  scheme: string,
  provider: TextDocumentContentProvider
): Disposable
```

**Same.**

---

## 23. vscode-only Providers (coc doesn't have)

```typescript
// The following don't exist in coc (InlineValuesProvider interface exists, but no registration function)
languages.registerEvaluatableExpressionProvider(selector, provider)
languages.registerInlineValuesProvider(selector, provider)
languages.registerDocumentDropEditProvider(selector, provider, metadata?)
languages.registerDocumentPasteEditProvider(selector, provider, metadata)
window.registerTreeDataProvider(viewId, provider)
window.registerTerminalLinkProvider(provider)
window.registerTerminalProfileProvider(id, provider)
```

---

## Quick Conversion Table

| vscode registration function | coc registration function | Parameter Adjustments |
|----------------|-------------|---------|
| `registerCompletionItemProvider(sel,p,...t)` | `registerCompletionItemProvider(n,s,sel,p,t?,pri?,ac?)` | adds n,s,pri,ac; t from rest to array |
| `registerInlineCompletionItemProvider(sel,p)` | `registerInlineCompletionItemProvider(sel,p)` | unchanged |
| `registerHoverProvider(sel,p)` | `registerHoverProvider(sel,p)` | unchanged |
| `registerDefinitionProvider(sel,p)` | `registerDefinitionProvider(sel,p)` | unchanged |
| `registerReferenceProvider(sel,p)` | `registerReferencesProvider(sel,p)` | function name adds s |
| `registerDocumentHighlightProvider(sel,p)` | `registerDocumentHighlightProvider(sel,p)` | unchanged |
| `registerDocumentSymbolProvider(sel,p,m?)` | `registerDocumentSymbolProvider(sel,p,m?)` | unchanged |
| `registerWorkspaceSymbolProvider(p)` | `registerWorkspaceSymbolProvider(p)` | unchanged |
| `registerCodeActionsProvider(sel,p,m?)` | `registerCodeActionProvider(sel,p,cid?,kinds?)` | function name drops s; metadata split into cid/kinds |
| `registerCodeLensProvider(sel,p)` | `registerCodeLensProvider(sel,p)` | unchanged |
| `registerDocumentFormattingEditProvider(sel,p)` | `registerDocumentFormatProvider(sel,p,pri?)` | shortened function name; adds priority |
| `registerDocumentRangeFormattingEditProvider(sel,p)` | `registerDocumentRangeFormatProvider(sel,p,pri?)` | same as above |
| `registerOnTypeFormattingEditProvider(sel,p,...t)` | `registerOnTypeFormattingEditProvider(sel,p,t[])` | rest parameter becomes array |
| `registerRenameProvider(sel,p)` | `registerRenameProvider(sel,p)` | unchanged |
| `registerSignatureHelpProvider(sel,p,...t)` or `(sel,p,meta)` | `registerSignatureHelpProvider(sel,p,t?)` | rest becomes array; no metadata |
| `registerDocumentLinkProvider(sel,p)` | `registerDocumentLinkProvider(sel,p)` | unchanged |
| `registerColorProvider(sel,p)` | `registerDocumentColorProvider(sel,p)` | function name adds Document |
| `registerFoldingRangeProvider(sel,p)` | `registerFoldingRangeProvider(sel,p)` | unchanged |
| `registerSelectionRangeProvider(sel,p)` | `registerSelectionRangeProvider(sel,p)` | unchanged |
| `registerCallHierarchyProvider(sel,p)` | `registerCallHierarchyProvider(sel,p)` | unchanged |
| `registerTypeHierarchyProvider(sel,p)` | `registerTypeHierarchyProvider(sel,p)` | unchanged |
| `registerLinkedEditingRangeProvider(sel,p)` | `registerLinkedEditingRangeProvider(sel,p)` | unchanged |
| `registerInlayHintsProvider(sel,p)` | `registerInlayHintsProvider(sel,p)` | unchanged |
| `registerDocumentSemanticTokensProvider(sel,p,l)` | `registerDocumentSemanticTokensProvider(sel,p,l)` | unchanged |
| `registerDocumentRangeSemanticTokensProvider(sel,p,l)` | `registerDocumentRangeSemanticTokensProvider(sel,p,l)` | unchanged |
