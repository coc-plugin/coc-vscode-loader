# VS Code Extension API vs coc.nvim API Complete Comparison

Comparison basis:
- VS Code: [`docs/types/vscode.d.ts`](./types/vscode.d.ts) (21235 lines)
- coc.nvim: [`docs/types/coc.d.ts`](./types/coc.d.ts) (13327 lines)

> Type files are auto-synced daily from [coc-vscode-registry](https://github.com/coc-plugin/coc-vscode-registry), do not edit manually.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Core Types](#2-core-types)
3. [Editor API](#3-editor-api)
4. [`window` Namespace](#4-window-namespace)
5. [`workspace` Namespace](#5-workspace-namespace)
6. [`languages` Namespace](#6-languages-namespace)
7. [`commands` Namespace](#7-commands-namespace)
8. [`extensions` Namespace](#8-extensions-namespace)
9. [`env` Namespace](#9-env-namespace)
10. [Provider Interface Comparison](#10-provider-interface-comparison)
11. [Completely Missing vscode Features](#11-completely-missing-vscode-features)
12. [coc Specific APIs (not in vscode)](#12-coc-specific-apisnot-in-vscode)

---

## 1. Overview

| Aspect | VS Code | coc.nvim |
|------|---------|----------|
| Total exports | ~524 (≈776 with internal types) | ~536 (≈653 with LSP internal types) |
| Namespaces | 15 (`window`, `workspace`, `languages`, `commands`, `env`, `extensions`, `debug`, `tasks`, `notebooks`, `scm`, `tests`, `authentication`, `l10n`, `chat`, `lm`) | 4 (`window`, `workspace`, `languages`, `commands`) + `snippetManager` |
| Architecture | Rich class + interface + enum + namespace | LSP-oriented, mostly interface + factory namespace, enum uses type alias |
| Uri | `class Uri` | `class Uri` + `type DocumentUri = string` |
| Document model | `TextDocument` (full) | `TextDocument` (simplified) + `LinesTextDocument` (extended) |
| LSP integration | Low-level wrapping | Native LSP types throughout |

---

## 2. Core Types

### 2.1 Position

| Item | VS Code (class) | coc.nvim (LSP interface) | Difference |
|------|-----------------|--------------------------|------|
| Type | `class` (has constructor) | `interface` | **Fundamentally different** |
| Field types | `line: number`, `character: number` | `line: uinteger`, `character: uinteger` | coc uses `uinteger` |
| isBefore() | Yes | **No** | vscode only |
| isBeforeOrEqual() | Yes | **No** | vscode only |
| isAfter() | Yes | **No** | vscode only |
| isAfterOrEqual() | Yes | **No** | vscode only |
| compareTo() | Yes | **No** | vscode only |
| translate() | Yes | **No** | vscode only |
| with() | Yes | **No** | vscode only |
| Construction | `new Position(1, 2)` | `Position.create(1, 2)` | Factory vs constructor |

### 2.2 Range

| Item | VS Code (class) | coc.nvim (interface) | Difference |
|------|-----------------|----------------------|------|
| isEmpty | `getter` | **No** | vscode only |
| isSingleLine | `getter` | **No** | vscode only |
| contains() | Yes | **No** | vscode only |
| intersection() | Yes | **No** | vscode only |
| union() | Yes | **No** | vscode only |
| with() | Yes | **No** | vscode only |

### 2.3 Selection

| Item | VS Code | coc.nvim |
|------|---------|----------|
| `class Selection extends Range` | Yes | **No** |
| anchor/active/isReversed | Yes | **No** |

### 2.4 Uri

| Item | VS Code | coc.nvim | Difference |
|------|---------|----------|------|
| `class Uri` | Yes | Yes | coc constructor is `protected` |
| scheme/authority/path/query/fragment/fsPath | Yes | Yes | Same |
| Uri.parse() / Uri.file() / Uri.from() | Yes | Yes | Same |
| with() / toString() / toJSON() | Yes | Yes | Same |
| Uri.joinPath() | Yes | **No** | vscode only |
| Uri.isUri() | **No** | Yes | coc only |
| `type DocumentUri = string` | **No** | Yes | coc only (LSP style) |

### 2.5 TextDocument

| Field/Method | VS Code | coc.nvim (TextDocument) | coc.nvim (LinesTextDocument) |
|-----------|---------|------------------------|----------------------------|
| uri | `Uri` | `DocumentUri` (string) | — |
| fileName | Yes | **No** | — |
| isUntitled | Yes | **No** | — |
| languageId | Yes | Yes | — |
| encoding | Yes | **No** | — |
| version | `number` | `integer` | — |
| isDirty | Yes | **No** | — |
| isClosed | Yes | **No** | — |
| save() | Yes | **No** | — |
| eol | `EndOfLine` enum | **No** | `eol: boolean` (extra field) |
| lineCount | `number` | `uinteger` | — |
| lineAt() | Yes (returns TextLine) | **No** | Yes (returns TextLine) |
| offsetAt() | Yes | Yes | — |
| positionAt() | Yes | Yes | — |
| getText(range?) | Yes | Yes | — |
| getWordRangeAtPosition() | Yes | **No** | — |
| validateRange() | Yes | **No** | — |
| validatePosition() | Yes | **No** | — |

### 2.6 TextLine

| Field | VS Code | coc.nvim | Difference |
|------|---------|----------|------|
| lineNumber, text, range, rangeIncludingLineBreak, firstNonWhitespaceCharacterIndex, isEmptyOrWhitespace | Same | Same | **Completely identical** |

### 2.7 EndOfLine

| Item | VS Code | coc.nvim |
|------|---------|----------|
| `enum EndOfLine { LF=1, CRLF=2 }` | Yes | **No** (uses `eol: boolean` instead) |

### 2.8 CancellationToken / CancellationTokenSource

| Type | VS Code | coc.nvim | Difference |
|------|---------|----------|------|
| CancellationToken | interface | interface (same fields) | coc additionally has `namespace` with `None`, `Cancelled`, `is()` |
| CancellationTokenSource | class | class | Mostly the same |
| CancellationError | class extends Error | class extends Error | Same |
| AbstractCancellationTokenSource | **No** | Yes (interface extends Disposable) | coc only |

### 2.9 Disposable

| Item | VS Code (class) | coc.nvim (interface) | Difference |
|------|-----------------|----------------------|------|
| dispose() | returns `any` | returns `void` | Different return type |
| Construction | `new Disposable(() => void)` | `Disposable.create(() => void)` | Factory vs constructor |
| Disposable.from() | Yes | **No** | vscode only |

### 2.10 Event / EventEmitter

| Item | VS Code | coc.nvim | Difference |
|------|---------|----------|------|
| Name | `EventEmitter<T>` | `Emitter<T>` | **Different naming** |
| fire() return | `void` | `any` | Different return type |
| EmitterOptions | **No** | Yes (onFirstListenerAdd/onLastListenerRemove) | coc only |
| Event.None | **No** | Yes | coc only |

### 2.11 Command

| Field | VS Code | coc.nvim | Difference |
|------|---------|----------|------|
| title | Yes | Yes | Same |
| command | Yes | Yes | Same |
| tooltip? | Yes | **No** | vscode only |
| arguments? | `any[]` | `LSPAny[]` | Different types |

### 2.12 MarkdownString

| Item | VS Code | coc.nvim |
|------|---------|----------|
| `class MarkdownString` | Yes (includes appendText/appendMarkdown/appendCodeblock, isTrusted, supportThemeIcons, supportHtml, baseUri) | **No** (coc uses `MarkedString = string \| {language, value}`) |

### 2.13 ThemeColor / ThemeIcon

| Item | VS Code | coc.nvim |
|------|---------|----------|
| `class ThemeColor` | Yes | **No** |
| `class ThemeIcon` | Yes (includes File/Folder statics, id, color) | **No** |

### 2.14 SnippetString

| Item | VS Code | coc.nvim | Difference |
|------|---------|----------|------|
| value | `string` | `string` | Same |
| appendText/appendTabstop/appendPlaceholder/appendChoice/appendVariable | Same | Same | **Same** |

### 2.15 TextEdit

| Item | VS Code (class) | coc.nvim (interface) | Difference |
|------|-----------------|----------------------|------|
| range | `Range` | `Range` | Same |
| newText | `string` | `string` | Same |
| Construction | `new TextEdit(range, newText)` | `TextEdit.replace/insert/del` | Factory vs constructor |

### 2.16 WorkspaceEdit

| Item | VS Code (class) | coc.nvim (interface) | Difference |
|------|-----------------|----------------------|------|
| Type | `class` with methods (replace/insert/delete/set/get/has/entries/size) | `interface` (pure LSP: changes/documentChanges) | **Completely different usage** |
| entries() / size | Yes | **No** | — |
| uri parameter | `Uri` | `DocumentUri` (string) | — |

### 2.17 Hover

| Item | VS Code (class) | coc.nvim (interface) | Difference |
|------|-----------------|----------------------|------|
| contents | `Array<MarkdownString \| MarkedString>` | `MarkupContent \| MarkedString \| MarkedString[]` | Different types |
| range? | Yes | Yes | Same |
| Construction | `new Hover(contents, range?)` | Direct object construction `{ contents, range }` | coc has no factory method |

### 2.18 Enum Value Offset (LSP 1-based vs vscode 0-based)

coc uses LSP protocol style (values starting from 1), while vscode mostly starts enums from 0. Besides `DiagnosticSeverity`, the following enums also have the same offset:

| Enum | vscode | coc | Difference |
|------|--------|-----|------|
| `CompletionItemKind` | `Text = 0` | `Text: 1` | Offset 1 |
| `SymbolKind` | `File = 0` | `File: 1` | Offset 1 |
| `DocumentHighlightKind` | `Text = 0` | `Text: 1` | Offset 1 |
| `InlineCompletionTriggerKind` | `Invoke = 0` | `Invoked: 1` | Offset 1 + naming difference |
| `CompletionTriggerKind` | `Invoke = 0` | `Invoked: 1` | Offset 1 + naming difference |
| `CodeActionTriggerKind` | `Invoke = 1` | `Invoked: 1` | Same value, naming difference |
| `SignatureHelpTriggerKind` | `Invoke = 1` | `Invoked: 1` | Same value, naming difference |

**Note on naming differences:** vscode uniformly uses `Invoke` (base verb form), coc follows LSP conventions using `Invoked` (past participle).

---

## 3. Editor API

### 3.1 TextEditor

| Field/Method | VS Code | coc.nvim | Difference |
|-----------|---------|----------|------|
| document | `TextDocument` | `TextDocument` | vscode: `uri` is Uri; coc: additional `bufnr`, `winid` |
| selection(s) | Yes | Yes | coc only has single selection (vscode has multi-cursor) |
| visibleRanges | Yes | Yes | Same |
| options | Yes | Yes | vscode includes tabSize/indentSize/insertSpaces/cursorStyle/lineNumbers; coc includes tabSize/insertSpaces and others |
| viewColumn | Yes | **No** | coc has no column concept |
| edit() | Yes | **No** | converter replaces with `workspace.applyEdit({ changes: { [doc.uri]: edits } })` — `Document.applyEdits()` returns success but doesn't modify buffer |
| insertSnippet() | Yes | **No** | coc uses `workspace.applyEdit` or `snippetManager` |
| setDecorations() | Yes | **No** | coc uses `BufferHighlight` / `highlight` API |
| revealRange() | Yes | **No** | coc uses `window.moveTo` |
| hide()/show() | Yes (deprecated) | **No** | — |

### 3.2 TextEditorEdit

| Method | VS Code | coc.nvim |
|------|---------|----------|
| replace / insert / delete / setEndOfLine | Yes | **No direct equivalent** (coc uses `TextEdit` operations) |

### 3.3 Decoration System

| Item | VS Code | coc.nvim |
|------|---------|----------|
| TextEditorDecorationType | Yes (key, dispose) | **No** — uses `BufferClearHighlight` / `BufferHighlight` |
| DecorationRenderOptions | Rich (backgroundColor, outline, border, gutterIcon, overviewRuler, before/after, etc.) | coc's highlight system is based on vim namespace highlights |
| Mechanism | Programmatic decoration | vim `nvim_buf_add_highlight` pattern |

### 3.4 ViewColumn

| Item | VS Code | coc.nvim |
|------|---------|----------|
| `enum ViewColumn { Active= -1, Beside= -2, One~Nine }` | Yes | **No** (Neovim has no column concept) |

---

## 4. `window` Namespace

### 4.1 Editor Related

| API | VS Code | coc.nvim | Difference |
|-----|---------|----------|------|
| activeTextEditor | Yes | **No** | converter injects polyfill using `workspace.getDocument()` approximation |
| visibleTextEditors | Yes | **No** | vscode only |
| onDidChangeActiveTextEditor | Yes | **No** | converter replaced with `workspace.onDidOpenTextDocument` |
| onDidChangeVisibleTextEditors | Yes | Yes | Same |
| **onDidChangeTextEditorSelection** | Yes | **No** | — |
| **onDidChangeTextEditorVisibleRanges** | Yes | **No** | — |
| **onDidChangeTextEditorOptions** | Yes | **No** | — |
| **onDidChangeTextEditorViewColumn** | Yes | **No** | — |
| **showTextDocument()** | Yes | **No** | coc has no equivalent API |

### 4.2 Message Dialogs

| API | VS Code | coc.nvim | Difference | Auto-conversion |
|-----|---------|----------|------|----------|
| showInformationMessage | Yes (4 overloads) | Yes (2 overloads) | coc lacks MessageOptions variant, coc's MsgTypes are `'error'\|'warning'\|'more'` | converter converts to `showMessage(msg, 'more')` |
| showWarningMessage | Yes (4 overloads) | Yes (2 overloads) | Same as above | converter converts to `showMessage(msg, 'warning')` |
| showErrorMessage | Yes (4 overloads) | Yes (2 overloads) | Same as above | converter converts to `showMessage(msg, 'error')` |

### 4.3 Input/Selection

| API | VS Code | coc.nvim | Difference |
|-----|---------|----------|------|
| showQuickPick | Yes (4 overloads) | Yes | Signatures are mostly the same |
| showWorkspaceFolderPick | Yes | **No** | — |
| createQuickPick() | Returns `QuickPick<T>` | Returns `Promise<QuickPick<T>>` | Sync vs Promise |
| showInputBox | Yes | **No** | coc uses `requestInput` and `createInputBox` instead |
| createInputBox() | Returns `InputBox` | Returns `Promise<InputBox>` (different parameters) | Completely different signature |

### 4.4 File Dialogs

| API | VS Code | coc.nvim |
|-----|---------|----------|
| showOpenDialog | Yes | **No** |
| showSaveDialog | Yes | **No** |

### 4.5 Output Channels

| API | VS Code | coc.nvim | Difference | Auto-conversion |
|-----|---------|----------|------|----------|
| createOutputChannel(name, languageId?) | Yes (2 params) | Yes (1 param) | coc has no `languageId` parameter, no LogOutputChannel. coc natively supports `window.createOutputChannel`, no conversion needed |
| OutputChannel.replace() | Yes | **No** | — |
| OutputChannel.clear() | `clear()` | `clear(keep?: number)` | coc can keep N lines |

### 4.6 Status Bar

| API | VS Code | coc.nvim | Difference |
|-----|---------|----------|------|
| createStatusBarItem(id, alignment?, priority?) | Yes (3 params) | `createStatusBarItem(priority?, option?)` | No id/alignment parameters |
| setStatusBarMessage | Yes (3 overloads) | **No** | — |
| StatusBarAlignment enum | Yes | **No** | coc uses numeric priority |
| StatusBarItem.id/name/alignment | Yes | **No** | — |
| StatusBarItem.tooltip/color/backgroundColor/command | Yes | **No** | — |

### 4.7 Terminal

| API | VS Code | coc.nvim | Difference |
|-----|---------|----------|------|
| createTerminal(options) | Returns `Terminal` | Returns `Promise<Terminal>` | Promise vs sync |
| activeTerminal | Yes | **No** | — |
| onDidChangeActiveTerminal | Yes | **No** | — |
| onDidChangeTerminalState | Yes | **No** | — |
| onDidOpenTerminal | Yes | Yes | Same |
| onDidCloseTerminal | Yes | Yes | Same |
| TerminalOptions.cwd | `string \| Uri` | `string` | Uri not supported |
| TerminalOptions.hideFromUser/message/iconPath/color/location/isTransient | Yes | **No** | — |
| Pseudoterminal / ExtensionTerminalOptions | Yes | **No** | — |
| Terminal.processId | `Thenable<number \| undefined>` | `Promise<number>` | Different types |
| Terminal.shellIntegration / state | Yes | **No** | — |

### 4.8 Progress

| API | VS Code | coc.nvim | Difference |
|-----|---------|----------|------|
| withProgress | Yes | Yes | `Thenable` vs `Promise` |
| withScmProgress | Yes | **No** | — |
| ProgressOptions | `{location, title?, cancellable?}` | `{title?, cancellable?}` | coc has no `location` field |

### 4.9 Tree View

| API | VS Code | coc.nvim | Difference |
|-----|---------|----------|------|
| createTreeView | Yes | Yes | Same signature |
| registerTreeDataProvider | Yes | **No** | — |

### 4.10 Webview

| API | VS Code | coc.nvim |
|-----|---------|----------|
| createWebviewPanel | Yes | **No** |
| registerWebviewPanelSerializer | Yes | **No** |
| registerWebviewViewProvider | Yes | **No** |

### 4.11 Other window APIs

| API | VS Code | coc.nvim |
|-----|---------|----------|
| tabGroups / Tab / TabGroup | Yes | **No** |
| state (WindowState) / onDidChangeWindowState | Yes | **No** |
| activeColorTheme / onDidChangeActiveColorTheme | Yes | **No** |
| registerUriHandler | Yes | **No** |
| registerTerminalLinkProvider / registerTerminalProfileProvider | Yes | **No** |
| registerFileDecorationProvider | Yes | **No** |
| registerCustomEditorProvider | Yes | **No** |

---

## 5. `workspace` Namespace

### 5.1 Properties

| API | VS Code | coc.nvim | Difference |
|-----|---------|----------|------|
| rootPath | `string \| undefined` | `string` | vscode can be undefined |
| workspaceFolders | `WorkspaceFolder[] \| undefined` | `ReadonlyArray<WorkspaceFolder>` | coc is always an array |
| name | `string \| undefined` | **No** | — |
| workspaceFile | `Uri \| undefined` | **No** | — |
| textDocuments | `TextDocument[]` | `ReadonlyArray<LinesTextDocument>` | Different types |
| **fs** (FileSystem) | Yes (readFile/writeFile/stat/readDirectory/createDirectory/delete/rename) | **No** | — |
| isTrusted | `boolean` | `= true` (hardcoded) | coc does not support trust mechanism |
| notebookDocuments | Yes | **No** | — |

### 5.2 Document Events

| API | VS Code | coc.nvim | Difference |
|-----|---------|----------|------|
| onDidOpenTextDocument | `Event<TextDocument>` | `Event<LinesTextDocument & {bufnr}>` | coc includes bufnr |
| onDidCloseTextDocument | `Event<TextDocument>` | `Event<LinesTextDocument & {bufnr}>` | Same as above |
| onDidChangeTextDocument | `Event<TextDocumentChangeEvent>` | `Event<DidChangeTextDocumentParams>` | **Different LSP format** |
| onWillSaveTextDocument | `Event<TextDocumentWillSaveEvent>` | `Event<WillSaveEvent>` | Different types |
| onDidSaveTextDocument | `Event<TextDocument>` | `Event<LinesTextDocument>` | Different types |
| onDidChangeConfiguration | `Event<ConfigurationChangeEvent>` | `Event<ConfigurationChangeEvent>` | **Same** |

### 5.3 File Events

| API | VS Code | coc.nvim | Difference |
|-----|---------|----------|------|
| onDidCreateFiles / onDidRenameFiles / onDidDeleteFiles | Yes | Yes | **Same** |
| onWillCreateFiles / onWillRenameFiles / onWillDeleteFiles | Yes | Yes | **Same** |

### 5.4 Functions

| API | VS Code | coc.nvim | Difference |
|-----|---------|----------|------|
| getConfiguration() | `Thenable<T>` | `Promise<T>` | Thenable vs Promise |
| openTextDocument(uri) | `Thenable<TextDocument>` | `Promise<Document>` | Different return types |
| openTextDocument(options) with `{language, content}` | Yes | **No** | coc cannot create virtual documents from in-memory content |
| registerTextDocumentContentProvider | Yes | Yes | **Same** |
| registerFileSystemProvider | Yes | **No** | — |
| createFileSystemWatcher | Yes | Yes | **Same** |
| findFiles | Yes | Yes | **Same** |
| applyEdit | Yes | Yes | **Same** |
| asRelativePath | Yes | Yes | **Same** |
| getWorkspaceFolder | `(uri: Uri)` | `(uri: string \| Uri)` | coc additionally accepts string |
| updateWorkspaceFolders | Yes | **No** | — |
| saveAll / save / saveAs | Yes | **No** | — |
| decode / encode (Uint8Array <-> string) | Yes | **No** | — |

### 5.5 WorkspaceFolder

| Field | VS Code | coc.nvim |
|------|---------|----------|
| uri | `Uri` | `string` |
| name | `string` | `string` |
| index | `number` | **No** |

---

## 6. `languages` Namespace

### 6.1 Basic Functions

| API | VS Code | coc.nvim | Difference |
|-----|---------|----------|------|
| getLanguages(): `Thenable<string[]>` | Yes | **No** (uses `workspace.languageIds` Set) | Alternative approach |
| setTextDocumentLanguage() | Yes | **No** | — |
| match(selector, document) | Yes | Yes | coc uses `TextDocumentMatch` instead of `TextDocument` |
| createDiagnosticCollection | Yes | Yes | **Same** |
| createLanguageStatusItem | Yes | **No** | — (converter replaces with no-op, supports `vscode.` prefix) |
| getDiagnostics / onDidChangeDiagnostics | Yes | **No** (coc provides in `diagnosticManager`, event named `onDidRefresh`) | Different location/naming |

### 6.2 Provider Registration Functions

| Registrar | VS Code Name | coc Name | Signature Difference |
|--------|-------------|---------|---------|
| CompletionItemProvider | `registerCompletionItemProvider` | `registerCompletionItemProvider` | coc has additional `name`, `shortcut`, `priority`, `allCommitCharacters` parameters |
| InlineCompletionItemProvider | `registerInlineCompletionItemProvider` | `registerInlineCompletionItemProvider` | **Same** |
| HoverProvider | `registerHoverProvider` | `registerHoverProvider` | **Same** |
| DefinitionProvider | `registerDefinitionProvider` | `registerDefinitionProvider` | **Same** |
| DeclarationProvider | `registerDeclarationProvider` | `registerDeclarationProvider` | **Same** |
| TypeDefinitionProvider | `registerTypeDefinitionProvider` | `registerTypeDefinitionProvider` | **Same** |
| ImplementationProvider | `registerImplementationProvider` | `registerImplementationProvider` | **Same** |
| ReferenceProvider | `registerReferenceProvider` | `registerReferencesProvider` | **Different naming** (coc is plural `References`) |
| DocumentHighlightProvider | `registerDocumentHighlightProvider` | `registerDocumentHighlightProvider` | **Same** |
| DocumentSymbolProvider | `registerDocumentSymbolProvider` | `registerDocumentSymbolProvider` | **Same** |
| WorkspaceSymbolProvider | `registerWorkspaceSymbolProvider` | `registerWorkspaceSymbolProvider` | **Same** |
| CodeActionsProvider | `registerCodeActionsProvider` | `registerCodeActionProvider` | **Different naming** (coc singular `Action`), coc has extra `clientId` parameter |
| CodeLensProvider | `registerCodeLensProvider` | `registerCodeLensProvider` | **Same** |
| Formatting | `registerDocumentFormattingEditProvider` | `registerDocumentFormatProvider` | **Different naming**, coc has extra `priority` |
| Range Formatting | `registerDocumentRangeFormattingEditProvider` | `registerDocumentRangeFormatProvider` | **Different naming**, coc has extra `priority` |
| OnType Formatting | `registerOnTypeFormattingEditProvider` | `registerOnTypeFormattingEditProvider` | coc uses `string[]` array vs vscode rest parameters |
| RenameProvider | `registerRenameProvider` | `registerRenameProvider` | **Same** |
| SignatureHelpProvider | `registerSignatureHelpProvider` | `registerSignatureHelpProvider` | coc lacks metadata overload |
| DocumentLinkProvider | `registerDocumentLinkProvider` | `registerDocumentLinkProvider` | **Same** |
| ColorProvider | `registerColorProvider` | `registerDocumentColorProvider` | **Different naming** |
| FoldingRangeProvider | `registerFoldingRangeProvider` | `registerFoldingRangeProvider` | **Same** |
| SelectionRangeProvider | `registerSelectionRangeProvider` | `registerSelectionRangeProvider` | **Same** |
| CallHierarchyProvider | `registerCallHierarchyProvider` | `registerCallHierarchyProvider` | **Same** |
| TypeHierarchyProvider | `registerTypeHierarchyProvider` | `registerTypeHierarchyProvider` | **Same** |
| LinkedEditingRangeProvider | `registerLinkedEditingRangeProvider` | `registerLinkedEditingRangeProvider` | **Same** |
| InlayHintsProvider | `registerInlayHintsProvider` | `registerInlayHintsProvider` | **Same** |
| SemanticTokensProvider | `registerDocumentSemanticTokensProvider` | `registerDocumentSemanticTokensProvider` | **Same** |
| RangeSemanticTokensProvider | `registerDocumentRangeSemanticTokensProvider` | `registerDocumentRangeSemanticTokensProvider` | **Same** |
| **EvaluatableExpressionProvider** | `registerEvaluatableExpressionProvider` | **No** | — |
| **InlineValuesProvider** | `registerInlineValuesProvider` | **No** (interface exists but no registration function) | Only `InlineValuesProvider` interface is exported, no registration entry point |
| **DocumentDropEditProvider** | `registerDocumentDropEditProvider` | **No** | — |
| **DocumentPasteEditProvider** | `registerDocumentPasteEditProvider` | **No** | — |

### 6.3 Configuration

| API | VS Code | coc.nvim |
|-----|---------|----------|
| setLanguageConfiguration | Yes | **No** |

---

## 7. `commands` Namespace

| API | VS Code | coc.nvim | Difference |
|-----|---------|----------|------|
| registerCommand | `(command, callback, thisArg?)` | `(id, impl, thisArg?, internal?)` | Different parameter names, coc has extra `internal` parameter and callback returns `void` instead of `any` |
| registerTextEditorCommand | Yes | **No** | — |
| executeCommand | `Thenable<T>` | `Promise<T>` | Thenable vs Promise |
| getCommands | `Thenable<string[]>` | **No** (coc has `commandList` + another `getCommands()` returning Vim command descriptions) | Completely different |

---

## 8. `extensions` Namespace

| API | VS Code | coc.nvim | Difference |
|-----|---------|----------|------|
| all | `Extension<any>[]` | `ReadonlyArray<Extension<any>>` | Mostly the same |
| getExtension | `getExtension(id)` | `getExtensionById(id)` | **Different naming** |
| onDidChange (extensions changed) | Yes | **No** (coc has `onDidLoadExtension`, `onDidActiveExtension`, `onDidUnloadExtension` three events) | Different granularity |

---

## 9. `env` Namespace

| API | VS Code | coc.nvim |
|-----|---------|----------|
| `namespace env` full | Yes (appName, appRoot, appHost, language, machineId, sessionId, remoteName, shell, clipboard, openExternal, uiKind, etc.) | **No** |
| `workspace.env: Env` | — | coc has (`runtimepath`, `extensionRoot`, `pid`, `columns`, `lines`, `version`, `isVim`, `isNvim` and other vim-specific properties) |

**Conclusion**: Completely different, coc's `env` describes the vim runtime environment, not vscode-like application environment.

---

## 10. Provider Interface Comparison

### 10.1 Common Difference Patterns

All provider interfaces in coc share the following common differences:
1. First parameter `document` uses `LinesTextDocument` instead of `TextDocument`
2. VS Code uses generics (e.g. `CompletionItemProvider<T>`), coc uses concrete types
3. Some providers in coc require additional parameters like `clientId` during registration

### 10.2 Specific Differences

| Provider | Difference Details |
|----------|---------|
| CompletionItemProvider | coc has additional `option: CompleteOption` field in context |
| CodeActionProvider | vscode `range: Range \| Selection` vs coc `range: Range` |
| DocumentRangeFormattingEditProvider | vscode has additional `provideDocumentRangesFormattingEdits` method, coc does not |
| TypeHierarchyProvider | vscode `prepareTypeHierarchy` returns `TypeHierarchyItem \| TypeHierarchyItem[]`, coc only returns `TypeHierarchyItem[]` |
| WorkspaceSymbolProvider | vscode has generic `<T extends SymbolInformation>`, coc is non-generic |
| SelectionRangeProvider | vscode `positions: readonly Position[]` vs coc `positions: Position[]` |
| FileSystemProvider | **Completely absent in coc** |
| TextDocumentContentProvider | Same |

---

## 11. Completely Missing vscode Features

The following vscode **complete namespaces or subsystems** are entirely absent in coc:

| # | vscode Namespace/Subsystem | Description |
|---|----------------------|------|
| 1 | **`notebooks`** | Notebook documents, editors, serialization, kernel selection, etc. all missing |
| 2 | **`scm`** | Source control management (Git integration, SourceControl, change tracking) |
| 3 | **`debug`** | Full debugger functionality (breakpoints, debug session, stack frames, etc.) |
| 4 | **`tests`** | Test controller, test run, test items, test coverage |
| 5 | **`tasks`** | Task system (TaskProvider, TaskExecution, Shell/ProcessExecution) |
| 6 | **`chat`** | GitHub Copilot Chat participants, conversation management |
| 7 | **`lm`** | Language Model API (LLM invocation) |
| 8 | **`authentication`** | Authentication providers, session management |
| 9 | **`l10n`** | Localization (t() function) |
| 10 | **`Clipboard`** | Clipboard read/write |
| 11 | **`FileSystem` / `FileSystemProvider`** | Custom file system provider |
| 12 | **`Webview` / `WebviewPanel`** | Webview panels, serialization, view providers |
| 13 | **`Tab` / `TabGroup` / `TabInput*`** | Tab and tab group management |
| 14 | **`CustomEditor`** | Custom editors (CustomTextEditorProvider / CustomReadonlyEditorProvider) |
| 15 | **`Comment` / `CommentThread` / `CommentController`** | Comment system (Review) |
| 16 | **`DataTransfer` / `DataTransferItem`** | Drag-and-drop data transfer |
| 17 | **`LanguageStatusItem`** | Language status item |
| 18 | **`TerminalLinkProvider` / `TerminalProfileProvider`** | Terminal links and profiles |
| 19 | **`FileDecorationProvider`** | File decorations |
| 20 | **`UriHandler`** | URI handler |
| 21 | **`LogOutputChannel`** | Log level output channel |

### 11.1 Features with Alternatives But Large Differences

| vscode Feature | coc Alternative | Difference |
|-------------|------------|------|
| Decoration API | `BufferHighlight` / `highlight` | vscode uses TextEditorDecorationType + setDecorations; coc is based on vim highlight API |
| showTextDocument | `window.moveTo` / manual buffer switching | coc has no direct equivalent |
| showInputBox | `window.requestInput` / `window.createInputBox` | Completely different signature |
| showOpenDialog / showSaveDialog | **No alternative** | — |
| Terminal (createTerminal) | `window.createTerminal`, `window.openTerminal` | Returns Promise, lacks many options |
| setLanguageConfiguration | `workspace.registerAutocmd` manual implementation | — |

---

## 12. coc Specific APIs (not in vscode)

coc has a large number of vim/neovim integration APIs that do not exist in vscode:

### 12.1 Vim Engine Integration

| API | Description |
|-----|------|
| `workspace.nvim` | Direct access to Neovim instance |
| `workspace.env: Env` | Vim runtime environment description (runtimepath, floating, textprop, etc.) |
| `workspace.isVim` / `workspace.isNvim` | Detect Vim type |
| `workspace.cwd` / `workspace.root` | Current path and workspace root |
| `workspace.filetypes` / `workspace.languageIds` | Supported file type and language collections |
| `workspace.pluginRoot` | Plugin root path |
| `workspace.channelNames` / `workspace.documents` | Channel and document lists |
| `workspace.folderPaths` / `workspace.workspaceFolder` | Folder paths |
| `workspace.floatSupported` | Whether floating windows are supported |
| `workspace.has(feature)` | Similar to vim's `has()` function |

### 12.2 Vim Specific Features

| API | Description |
|-----|------|
| `workspace.registerAutocmd` | Register vim autocmd |
| `workspace.registerKeymap` / `registerExprKeymap` / `registerLocalKeymap` | Register vim key mappings |
| `workspace.watchOption` / `watchGlobal` | Watch vim options/global variable changes |
| `workspace.createDatabase` / `createMru` / `createTask` | Coc data persistence utilities |
| `workspace.createFuzzyMatch` | Fuzzy matching |
| `workspace.expand` / `workspace.findUp` | File path utilities |
| `workspace.runCommand` / `workspace.resolveModule` | Run shell commands/resolve modules |
| `workspace.loadFile` / `workspace.openResource` | File loading |
| `workspace.computeWordRanges` | Compute word ranges |
| `workspace.getQuickfixItem` / `getQuickfixList` / `showLocations` | Quickfix list operations |
| `workspace.jumpTo` | Jump to position |
| `workspace.getDocument(bufnr)` | Get document by buffer number |

### 12.3 Window Specific APIs

| API | Description |
|-----|------|
| `window.createFloatFactory` | Floating window factory |
| `window.runTerminalCommand` / `window.openTerminal` | Terminal command operations |
| `window.showMenuPicker` / `window.showPickerDialog` | Menu/multi-select picker |
| `window.showPrompt` / `window.showDialog` / `window.showNotification` | Dialogs |
| `window.getCursorPosition` / `window.moveTo` / `window.getOffset` / `window.getCursorScreenPosition` | Cursor operations |
| `window.echoLines` | Output lines at the bottom of vim |
| `window.showOutputChannel` | Show output channel buffer |
| `window.openLocalConfig` | Open coc configuration file |
| `window.getSelectedRange` / `window.selectRange` | Visual selection operations |
| `window.diffHighlights` / `window.applyDiffHighlights` | Diff highlight management |
| `window.getVisibleRanges(bufnr, winid?)` | Get visible ranges by buffer/window |

---

## Summary

### Migration Difficulty Assessment

Difficulty of migrating from vscode plugins to coc (or the reverse):

| Category | Difficulty | Reason |
|------|------|------|
| LSP Provider (completion/hover/definitions, etc.) | ★☆☆ Easy | Interfaces are highly consistent, only need to adapt document types and registration parameters |
| Commands / Extensions | ★☆☆ Easy | Mostly consistent |
| Workspace operations | ★★☆ Moderate | getConfiguration/findFiles/createFileSystemWatcher consistent, but fs/notebook/saveAll missing |
| Editor operations | ★★★ Hard | Decoration/selection/editing APIs are completely different |
| UI Components | ★★★★ Very hard | statusbar/outputChannel/terminal exist but signatures differ; treeview/quickpick compatible but many differences |
| Completely missing features | ★★★★★ Cannot directly migrate | debug/notebook/scm/tests/chat/webview/customEditor/authentication |

### Converter Coverage

coc-vscode-loader's `import-mapping` transform + `convert.ts` text replacement layer provides extensive automatic adaptation. The converter handles:

- `window.show{Information,Warning,ErrorMessage}` → `Promise.resolve(window.showMessage(msg, severity))`
- `window.activeTextEditor` → polyfill using `workspace.getDocument()`
- `window.onDidChangeActiveTextEditor` → `workspace.onDidOpenTextDocument`
- `window.createOutputChannel` → `workspace.createOutputChannel` (drops languageId)
- `workspace.isTrusted` → `true` 
- `languages.createLanguageStatusItem` → no-op
- `languages.match` → `1` (always returns truthy)
- `authentication.getSession` → `undefined as any`
- `.uri.fsPath` → `Uri.parse(uri).fsPath`
- `.fileName` → `Uri.parse(doc.uri).fsPath`
- `getWordRangeAtPosition` → inline implementation
- `Location.create(Uri.file(x), y)` → `Location.create(x, Range.create(y, y))`
- `new WorkspaceEdit()` → `({ changes: {} })` + `.set()` → `.changes[]`
