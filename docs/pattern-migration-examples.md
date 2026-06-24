# VS Code → coc Common Pattern Migration Examples

> Each code comparison: left is the VS Code approach, right is the equivalent coc.nvim approach

---

## 1. Activation Function

```typescript
// VS Code
import * as vscode from 'vscode'

export function activate(context: vscode.ExtensionContext): void {
  // vscode's activate can be sync
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => { /* ... */ })
  )
}

// coc.nvim
import { ExtensionContext, workspace, window } from 'coc.nvim'

export async function activate(context: ExtensionContext): Promise<void> {
  // coc's activate supports async (sync also works, but async is safer)
  context.subscriptions.push(
    workspace.registerAutocmd({
      event: 'BufEnter',
      request: false,
      callback: () => { /* ... */ }
    })
  )
}
```

**Differences:**
- vscode's `activate` can return `void`; coc supports both, usually `Promise<void>`
- vscode uses `workspace.onDid*` events; coc uses `registerAutocmd` to register vim events
- vscode's `ExtensionContext` has `subscriptions: Disposable[]`; coc same

---

## 2. CompletionProvider

```typescript
// VS Code
import * as vscode from 'vscode'

languages.registerCompletionItemProvider(
  [{ language: 'typescript' }],  // selector
  {
    provideCompletionItems(document, position, token, context) {
      const item = new vscode.CompletionItem('console.log', vscode.CompletionItemKind.Method)
      return [item]
    },
  },
  '.'  // rest: each trigger char is a separate argument
)

// coc.nvim
import { CompletionItem, CompletionItemKind, InsertTextFormat } from 'coc.nvim'

languages.registerCompletionItemProvider(
  'my-completion',          // name
  'MY',                     // shortcut
  [{ language: 'typescript' }],  // selector
  {
    provideCompletionItems(document, position, token, context) {
      const item = CompletionItem.create('console.log')
      item.kind = CompletionItemKind.Method
      return [item] as CompletionItem[]
    },
  },
  ['.']                     // triggerCharacters
)
```

**Differences:**
| vscode | coc |
|--------|-----|
| `registerCompletionItemProvider(selector, provider, ...triggers)` | `registerCompletionItemProvider(name, shortcut, selector, provider, triggers?)` |
| `new CompletionItem(label, kind)` | `CompletionItem.create(label); item.kind = kind` |
| `context` does not have `option: CompleteOption` field | `context` additionally has `option: CompleteOption` field |

---

## 3. HoverProvider

```typescript
// VS Code
import * as vscode from 'vscode'

languages.registerHoverProvider(
  [{ language: 'python' }],
  {
    provideHover(document, position, token) {
      return new vscode.Hover(
        new vscode.MarkdownString('Hello from VS Code'),
        new vscode.Range(0, 0, 0, 10)
      )
    },
  }
)

// coc.nvim

languages.registerHoverProvider(
  [{ language: 'python' }],
  {
    provideHover(document, position, token) {
      return { contents: 'Hello from coc', range: Range.create(0, 0, 0, 10) }
    },
  }
)
```

**Differences:**
| vscode | coc |
|--------|-----|
| `new Hover(contents, range?)` | Construct `{ contents, range }` directly |
| contents: `MarkdownString[] \| MarkedString[]` | contents: `MarkupContent \| MarkedString \| MarkedString[]` |
| `new Range(sl, sc, el, ec)` | `Range.create(sl, sc, el, ec)` |

---

## 4. DiagnosticCollection

```typescript
// VS Code
import * as vscode from 'vscode'

const collection: vscode.DiagnosticCollection = vscode.languages.createDiagnosticCollection('my-linter')

function updateDiagnostics(uri: vscode.Uri, diagnostics: vscode.Diagnostic[]) {
  collection.set(uri, diagnostics)
  // clear: collection.set(uri, undefined)
}

// coc.nvim
import { Diagnostic, DiagnosticSeverity, DiagnosticCollection } from 'coc.nvim'

const collection: DiagnosticCollection = languages.createDiagnosticCollection('my-linter')

function updateDiagnostics(uri: string, diagnostics: Diagnostic[]) {
  collection.set(uri, diagnostics)
  // clear: collection.set(uri, null)
}
```

**Differences:**
| vscode | coc |
|--------|-----|
| `collection.set(uri: Uri, ...)` | `collection.set(uri: string, ...)` |
| Use `undefined` to clear | Use `null` to clear |
| `new Diagnostic(range, msg, severity?)` | `Diagnostic.create(range, msg, severity?, code?)` |
| `DiagnosticSeverity.Error` = `0` | `DiagnosticSeverity.Error` = `1` |

---

## 5. StatusBarItem

```typescript
// VS Code
import * as vscode from 'vscode'

const item: vscode.StatusBarItem = vscode.window.createStatusBarItem(
  'my-status',                           // id
  vscode.StatusBarAlignment.Left,       // alignment
  0                                      // priority
)
item.text = 'Hello'
item.tooltip = 'Click me'
item.command = 'my.command'            // ⚠️ coc has no command property
item.backgroundColor = new vscode.ThemeColor(...)  // ⚠️ coc does not have
item.show()

// coc.nvim
import { window, StatusBarItem } from 'coc.nvim'

const item: StatusBarItem = window.createStatusBarItem(0, { progress: false })
item.text = 'Hello'
item.isProgress = false
item.show()
```

**Differences:**
| vscode | coc |
|--------|-----|
| `createStatusBarItem(id, alignment?, priority?)` | `createStatusBarItem(priority?, opts?)` |
| Has `id`/`name`/`alignment`/`tooltip`/`color`/`backgroundColor`/`command` | Not available |
| No `isProgress` | Has `isProgress` (coc only) |

---

## 6. OutputChannel

```typescript
// VS Code
import * as vscode from 'vscode'

const channel: vscode.OutputChannel = vscode.window.createOutputChannel(
  'My Extension',
  'log'  // ⚠️ coc does not support languageId
)
channel.appendLine('hello world')
channel.show(true)  // preserveFocus

// coc.nvim
import { window, OutputChannel } from 'coc.nvim'

const channel: OutputChannel = window.createOutputChannel('My Extension')
channel.appendLine('hello world')
channel.show()
```

**Differences:**
| vscode | coc |
|--------|-----|
| `createOutputChannel(name, languageId?)` | `createOutputChannel(name)` |
| `show(preserveFocus?)` / `show(column?, preserveFocus?)` | `show()` no parameters |
| `clear()` | `clear(keep?: number)` |
| No `content` property | Has `content` property (coc only) |
| Has `replace()` | Not available |

---

## 7. Workspace.getConfiguration

```typescript
// VS Code
import * as vscode from 'vscode'

const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('myExtension')
const value: string | undefined = config.get<string>('someKey')
const value2: string = config.get<string>('someKey', 'default')

// coc.nvim
import { workspace, WorkspaceConfiguration } from 'coc.nvim'

const config: WorkspaceConfiguration = workspace.getConfiguration('myExtension')
const value: string | undefined = config.get<string>('someKey')
const value2: string = config.get<string>('someKey', 'default')
```

**Identical.**

---

## 8. applyEdit (WorkspaceEdit)

```typescript
// VS Code
import * as vscode from 'vscode'

const edit = new vscode.WorkspaceEdit()
edit.replace(
  vscode.Uri.file('/path/to/file.ts'),
  new vscode.Range(1, 0, 1, 10),
  'new text'
)
await vscode.workspace.applyEdit(edit)

// coc.nvim
import { workspace, WorkspaceEdit, TextEdit, Range, Position } from 'coc.nvim'

const edit: WorkspaceEdit = {
  changes: {
    ['file:///path/to/file.ts']: [
      TextEdit.replace(Range.create(1, 0, 1, 10), 'new text')
    ]
  }
}
await workspace.applyEdit(edit)
```

**Differences:**
| vscode | coc |
|--------|-----|
| Uses `WorkspaceEdit` class's `replace/insert/delete` methods | Construct LSP `WorkspaceEdit` object directly |
| Uri uses `Uri.file()`/`Uri.parse()` | Uri uses string |
| `new TextEdit(range, newText)` constructor | `TextEdit.replace()` factory method |

---

## 9. TreeView

```typescript
// VS Code
import * as vscode from 'vscode'

class MyProvider implements vscode.TreeDataProvider<MyItem> {
  getTreeItem(element: MyItem): vscode.TreeItem {
    return {
      label: element.name,
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      iconPath: new vscode.ThemeIcon('symbol-file'),  // ⚠️ coc not available
    }
  }
  getChildren(element?: MyItem): vscode.ProviderResult<MyItem[]> {
    return []
  }
}

vscode.window.createTreeView<MyItem>('myView', {
  treeDataProvider: new MyProvider()
})

// coc.nvim
import { window, TreeDataProvider, TreeItem, TreeItemCollapsibleState } from 'coc.nvim'

class MyProvider implements TreeDataProvider<MyItem> {
  getTreeItem(element: MyItem): TreeItem {
    return {
      label: element.name,
      collapsibleState: TreeItemCollapsibleState.None,
    }
  }
  getChildren(element?: MyItem): ProviderResult<MyItem[]> {
    return []
  }
}

window.createTreeView<MyItem>('myView', {
  treeDataProvider: new MyProvider()
})
```

**Differences:**
| vscode | coc |
|--------|-----|
| `iconPath` (`Uri \| ThemeIcon`) | `TreeItem.icon` (custom `{text, hlGroup}`) |
| `tooltip: string \| MarkdownString` | `tooltip: string \| MarkupContent` |
| Has `contextValue` | Not available |
| Has `checkboxState` | Not available |

---

## 10. QuickPick

```typescript
// VS Code
import * as vscode from 'vscode'

const items: vscode.QuickPickItem[] = [
  { label: 'Item 1', description: 'desc 1' },
  { label: 'Item 2', description: 'desc 2' },
]
const picker = vscode.window.createQuickPick()  // sync
picker.items = items
picker.show()  // event-driven, does not return Promise
picker.onDidAccept(() => {
  const selected = picker.selectedItems[0]
  picker.dispose()
})

// coc.nvim
import { window, QuickPickItem } from 'coc.nvim'

const items: QuickPickItem[] = [
  { label: 'Item 1', description: 'desc 1' },
  { label: 'Item 2', description: 'desc 2' },
]
const picker = await window.createQuickPick<QuickPickItem>()  // ⚠️ Promise
picker.items = items
const selected = await picker.show()
picker.dispose()
```

**Differences:**
| vscode | coc |
|--------|-----|
| `createQuickPick()` returns `QuickPick<T>` (sync) | Returns `Promise<QuickPick<T>>` |
| `picker.show()` returns `void` | `picker.show()` returns `Promise<T[]>` |
| Interaction: event-driven (`onDidAccept`, `onDidChangeSelection`) | Interaction: Promise-based |
| Has `onDidTriggerButton`, `buttons` | Not available |

---

## 11. SnippetString

```typescript
// VS Code
const snippet = new SnippetString()
snippet.appendText('console.log(')
snippet.appendPlaceholder('hello')
snippet.appendText(')')

// coc.nvim — completely identical
const snippet = new SnippetString()
snippet.appendText('console.log(')
snippet.appendPlaceholder('hello')
snippet.appendText(')')
```

**Identical.**

---

## 12. Terminal

```typescript
// VS Code
import * as vscode from 'vscode'

const term: vscode.Terminal = vscode.window.createTerminal({
  name: 'My Terminal',
  shellPath: '/bin/bash',
  cwd: vscode.Uri.file('/tmp'),  // ⚠️ coc only accepts string
  iconPath: new vscode.ThemeIcon('terminal'),  // ⚠️ coc not available
})

// coc.nvim
import { window, Terminal } from 'coc.nvim'

const term: Terminal = await window.createTerminal({
  name: 'My Terminal',
  shellPath: '/bin/bash',
  cwd: '/tmp'
})
```

**Differences:**
| vscode | coc |
|--------|-----|
| `createTerminal()` returns `Terminal` (sync) | Returns `Promise<Terminal>` |
| `cwd: string \| Uri` | `cwd: string` |
| Has `iconPath`/`color`/`hideFromUser`/`location`/`isTransient`/`message` | Not available |
| Has `shellIntegration`/`state` | Not available |
| No `bufnr` | Has `bufnr` (coc only) |

---

## 13. Diagnostics

```typescript
// VS Code
import * as vscode from 'vscode'

const diag = new vscode.Diagnostic(
  new vscode.Range(0, 0, 0, 10),
  'This is an error',
  vscode.DiagnosticSeverity.Error  // = 0 !
)
diag.code = 'my-lint'

// coc.nvim
import { Diagnostic, DiagnosticSeverity, languages } from 'coc.nvim'

const diag = Diagnostic.create(
  Range.create(0, 0, 0, 10),
  'This is an error',
  DiagnosticSeverity.Error,
  'my-lint',
  undefined,  // source
  []          // relatedInformation
)
// DiagnosticSeverity.Error = 1
```

**Differences:**
| vscode | coc |
|--------|-----|
| `new Diagnostic(range, msg, severity?)` | `Diagnostic.create(range, msg, severity?)` |
| `DiagnosticSeverity.Error = 0` | `DiagnosticSeverity.Error = 1` |
| - Warning: 1 | - Warning: 2 |
| - Information: 2 | - Information: 3 |
| - Hint: 3 | - Hint: 4 |
| code type: `string \| number \| {value, target}` | code type: `integer \| string` |
| No `data: LSPAny?` | Has `data: LSPAny?` (coc only) |

---

## 14. Configuration Watching

```typescript
// VS Code
import * as vscode from 'vscode'

vscode.workspace.onDidChangeConfiguration((e) => {
  if (e.affectsConfiguration('myExt')) {
    const val = vscode.workspace.getConfiguration('myExt').get('key')
  }
})

// coc.nvim
import { workspace } from 'coc.nvim'

// coc method 1: onDidChangeConfiguration
workspace.onDidChangeConfiguration((e) => {
  if (e.affectsConfiguration('myExt')) {
    const val = workspace.getConfiguration('myExt').get('key')
  }
})

// coc method 2 (vim specific): watchOption
workspace.watchOption('tabstop', (newVal) => { /* ... */ })

// coc method 3 (vim specific): watchGlobal
workspace.watchGlobal('g:my_var', () => { /* ... */ })
```

`onDidChangeConfiguration` signature fields are basically the same. coc additionally has `watchOption`/`watchGlobal` (vim specific).

---

## 15. LanguageClient + tsserver Bridge (TS Plugin)

Some language servers (like Volar v3) need the LSP client to bridge `tsserver/request` ↔ `tsserver/response`, forwarding TypeScript requests to tsserver:

```typescript
// VS Code
import * as vscode from 'vscode'
import { LanguageClient } from 'vscode-languageclient/node'

const client = new LanguageClient('vue', { ... }, {
  documentSelector: [{ language: 'vue' }],
})

client.onNotification('tsserver/request', ([seq, command, args]) => {
  vscode.commands.executeCommand('typescript.tsserverRequest', command, args, { isAsync: true })
    .then(res => client.sendNotification('tsserver/response', [seq, res?.body]))
})

// coc.nvim
import { LanguageClient, commands } from 'coc.nvim'

const client = new LanguageClient('vue', 'Vue Language Server', { ... }, {
  documentSelector: [{ language: 'vue' }],
})

client.onNotification('tsserver/request', async ([seq, command, args]) => {
  const result = await commands.executeCommand('typescript.tsserverRequest', command, args, { isAsync: true })
  client.sendNotification('tsserver/response', [seq, result?.body])
})
```

**Note:** The `typescript.tsserverRequest` command is provided by coc-tsserver (PR [#493](https://github.com/neoclide/coc-tsserver/pull/493)). Before the PR is merged, use our [fork](https://github.com/ChuYanLon/coc-tsserver):

```bash
cd ~/.config/coc/extensions
npm install ChuYanLon/coc-tsserver --legacy-peer-deps
```

At the same time, you need to declare the `typescriptServerPlugins` contribution in `package.json`, and coc-tsserver will automatically load the plugin.

```jsonc
// coc plugin package.json
{
  "contributes": {
    "typescriptServerPlugins": [
      {
        "name": "@vue/typescript-plugin",
        "languages": ["vue"],
        "enableForWorkspaceTypeScriptVersions": true
      }
    ]
  }
}
```
