# VS Code → coc 常见模式转换示例

> 每一段代码对比：左侧是 VS Code 写法，右侧是等价的 coc.nvim 写法

---

## 1. 激活函数

```typescript
// VS Code
import * as vscode from 'vscode'

export function activate(context: vscode.ExtensionContext): void {
  // vscode 的 activate 可以是 sync
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => { /* ... */ })
  )
}

// coc.nvim
import { ExtensionContext, workspace, window } from 'coc.nvim'

export async function activate(context: ExtensionContext): Promise<void> {
  // coc 的 activate 是 async
  context.subscriptions.push(
    workspace.registerAutocmd({
      event: 'BufEnter',
      request: false,
      callback: () => { /* ... */ }
    })
  )
}
```

**差异：**
- vscode 的 `activate` 可返回 `void`；coc 返回 `Promise<void>`
- vscode 用 `workspace.onDid*` 事件；coc 用 `registerAutocmd` 注册 vim 事件
- vscode 的 `ExtensionContext` 含 `subscriptions: Disposable[]`；coc 同

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
  '.'  // rest: 每个 trigger char 是单独参数
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

**差异点：**
| vscode | coc |
|--------|-----|
| `registerCompletionItemProvider(selector, provider, ...triggers)` | `registerCompletionItemProvider(name, shortcut, selector, provider, triggers?)` |
| `new CompletionItem(label, kind)` | `CompletionItem.create(label); item.kind = kind` |
| `context` 不含 `option: CompleteOption` 字段 | `context` 多 `option: CompleteOption` 字段 |

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

**差异点：**
| vscode | coc |
|--------|-----|
| `new Hover(contents, range?)` | 直接构造 `{ contents, range }` 对象 |
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

**差异点：**
| vscode | coc |
|--------|-----|
| `collection.set(uri: Uri, ...)` | `collection.set(uri: string, ...)` |
| 清空用 `undefined` | 清空用 `null` |
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
item.command = 'my.command'            // ⚠️ coc 无 command 属性
item.backgroundColor = new vscode.ThemeColor(...)  // ⚠️ coc 无
item.show()

// coc.nvim
import { window, StatusBarItem } from 'coc.nvim'

const item: StatusBarItem = window.createStatusBarItem(0, { progress: false })
item.text = 'Hello'
item.isProgress = false
item.show()
```

**差异点：**
| vscode | coc |
|--------|-----|
| `createStatusBarItem(id, alignment?, priority?)` | `createStatusBarItem(priority?, opts?)` |
| 有 `id`/`name`/`alignment`/`tooltip`/`color`/`backgroundColor`/`command` | 无 |
| 无 `isProgress` | 有 `isProgress`（coc 独有） |

---

## 6. OutputChannel

```typescript
// VS Code
import * as vscode from 'vscode'

const channel: vscode.OutputChannel = vscode.window.createOutputChannel(
  'My Extension',
  'log'  // ⚠️ coc 不支持 languageId
)
channel.appendLine('hello world')
channel.show(true)  // preserveFocus

// coc.nvim
import { window, OutputChannel } from 'coc.nvim'

const channel: OutputChannel = window.createOutputChannel('My Extension')
channel.appendLine('hello world')
channel.show()
```

**差异点：**
| vscode | coc |
|--------|-----|
| `createOutputChannel(name, languageId?)` | `createOutputChannel(name)` |
| `show(preserveFocus?)` / `show(column?, preserveFocus?)` | `show()` 无参数 |
| `clear()` | `clear(keep?: number)` |
| 无 `content` 属性 | 有 `content` 属性（coc 独有） |
| 有 `replace()` | 无 |

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

**相同。**

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

**差异点：**
| vscode | coc |
|--------|-----|
| 用 `WorkspaceEdit` class 的 `replace/insert/delete` 方法 | 直接构造 LSP `WorkspaceEdit` 对象 |
| Uri 用 `Uri.file()`/`Uri.parse()` | Uri 用字符串 |
| `new TextEdit(range, newText)` 构造函数 | `TextEdit.replace()` 工厂方法 |

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
      iconPath: new vscode.ThemeIcon('symbol-file'),  // ⚠️ coc 无
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

**差异点：**
| vscode | coc |
|--------|-----|
| `iconPath`（`Uri \| ThemeIcon`） | `TreeItem.icon`（自定义 `{text, hlGroup}`） |
| `tooltip: string \| MarkdownString` | `tooltip: string \| MarkupContent` |
| 有 `contextValue` | 无 |
| 有 `checkboxState` | 无 |

---

## 10. QuickPick

```typescript
// VS Code
import * as vscode from 'vscode'

const items: vscode.QuickPickItem[] = [
  { label: 'Item 1', description: 'desc 1' },
  { label: 'Item 2', description: 'desc 2' },
]
const picker = vscode.window.createQuickPick()  // 同步
picker.items = items
picker.show()  // 事件驱动，不返回 Promise
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

**差异点：**
| vscode | coc |
|--------|-----|
| `createQuickPick()` 返回 `QuickPick<T>`（同步） | 返回 `Promise<QuickPick<T>>` |
| `picker.show()` 返回 `void` | `picker.show()` 返回 `Promise<T[]>` |
| 交互模式：事件驱动（`onDidAccept`, `onDidChangeSelection`） | 交互模式：Promise 式 |
| 有 `onDidTriggerButton`、`buttons` | 无 |

---

## 11. SnippetString

```typescript
// VS Code
const snippet = new SnippetString()
snippet.appendText('console.log(')
snippet.appendPlaceholder('hello')
snippet.appendText(')')

// coc.nvim — 完全一样
const snippet = new SnippetString()
snippet.appendText('console.log(')
snippet.appendPlaceholder('hello')
snippet.appendText(')')
```

**相同。**

---

## 12. Terminal

```typescript
// VS Code
import * as vscode from 'vscode'

const term: vscode.Terminal = vscode.window.createTerminal({
  name: 'My Terminal',
  shellPath: '/bin/bash',
  cwd: vscode.Uri.file('/tmp'),  // ⚠️ coc 只接受 string
  iconPath: new vscode.ThemeIcon('terminal'),  // ⚠️ coc 无
})

// coc.nvim
import { window, Terminal } from 'coc.nvim'

const term: Terminal = await window.createTerminal({
  name: 'My Terminal',
  shellPath: '/bin/bash',
  cwd: '/tmp'
})
```

**差异点：**
| vscode | coc |
|--------|-----|
| `createTerminal()` 返回 `Terminal`（同步） | 返回 `Promise<Terminal>` |
| `cwd: string \| Uri` | `cwd: string` |
| 有 `iconPath`/`color`/`hideFromUser`/`location`/`isTransient`/`message` | 无 |
| 有 `shellIntegration`/`state` | 无 |
| 无 `bufnr` | 有 `bufnr`（coc 独有） |

---

## 13. 诊断 (Diagnostics)

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

**差异点：**
| vscode | coc |
|--------|-----|
| `new Diagnostic(range, msg, severity?)` | `Diagnostic.create(range, msg, severity?)` |
| `DiagnosticSeverity.Error = 0` | `DiagnosticSeverity.Error = 1` |
| - Warning: 1 | - Warning: 2 |
| - Information: 2 | - Information: 3 |
| - Hint: 3 | - Hint: 4 |
| code 类型: `string \| number \| {value, target}` | code 类型: `integer \| string` |
| 无 `data: LSPAny?` | 有 `data: LSPAny?`（coc 独有） |

---

## 14. 配置监听

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

// coc 方式一：onDidChangeConfiguration
workspace.onDidChangeConfiguration((e) => {
  if (e.affectsConfiguration('myExt')) {
    const val = workspace.getConfiguration('myExt').get('key')
  }
})

// coc 方式二（vim 特有）：watchOption
workspace.watchOption('tabstop', (newVal) => { /* ... */ })

// coc 方式三（vim 特有）：watchGlobal
workspace.watchGlobal('g:my_var', () => { /* ... */ })
```

`onDidChangeConfiguration` 签名字段基本相同。coc 额外有 `watchOption`/`watchGlobal`（vim 特有）。

---

## 15. LanguageClient + tsserver 桥接（TS 插件专用）

某些语言服务器（如 Volar v3）需要 LSP 客户端做 `tsserver/request` ↔ `tsserver/response` 桥接，将 TypeScript 请求转发给 tsserver：

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

**注意：** `typescript.tsserverRequest` 命令由 coc-tsserver 提供（PR [#493](https://github.com/neoclide/coc-tsserver/pull/493)）。PR 合并前需使用我们的 [fork](https://github.com/ChuYanLon/coc-tsserver)：

```bash
cd ~/.config/coc/extensions
npm install ChuYanLon/coc-tsserver --legacy-peer-deps
```

同时需要在 `package.json` 中声明 `typescriptServerPlugins` contribution，coc-tsserver 会自动加载插件。

```jsonc
// coc 插件 package.json
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
