# coc → VS Code 常见模式转换示例

> 每一段代码对比：左侧是 coc.nvim 写法，右侧是等价的 VS Code 写法

---

## 1. 激活函数

```typescript
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

// VS Code
import * as vscode from 'vscode'

export function activate(context: vscode.ExtensionContext): void {
  // vscode 的 activate 可以是 sync
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => { /* ... */ })
  )
}
```

**差异：**
- coc 的 `activate` 返回 `Promise<void>`；vscode 可返回 `void`
- coc 用 `registerAutocmd` 注册 vim 事件；vscode 用 `workspace.onDid*` 事件
- coc 的 `ExtensionContext` 含 `subscriptions: Disposable[]`；vscode 同

---

## 2. CompletionProvider

```typescript
// coc.nvim
import { CompletionItem, CompletionItemKind, InsertTextFormat } from 'coc.nvim'

languages.registerCompletionItemProvider(
  'my-completion',          // name
  'MY',                     // shortcut
  [{ language: 'typescript' }],  // selector
  {
    provideCompletionItems(document, position, token, context) {
      return [
        CompletionItem.create('console.log', CompletionItemKind.Method),
      ] as CompletionItem[]
    },
  },
  ['.']                     // triggerCharacters
)

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
```

**差异点：**
| coc | vscode |
|-----|--------|
| `registerCompletionItemProvider(name, shortcut, selector, provider, triggers?)` | `registerCompletionItemProvider(selector, provider, ...triggers)` |
| `CompletionItem.create(label, kind)` | `new CompletionItem(label, kind)` |
| `context` 多 `option: CompleteOption` 字段 | `context` 不包含 |

---

## 3. HoverProvider

```typescript
// coc.nvim
import { Hover } from 'coc.nvim'

languages.registerHoverProvider(
  [{ language: 'python' }],
  {
    provideHover(document, position, token) {
      return Hover.create('Hello from coc', Range.create(0, 0, 0, 10))
    },
  }
)

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
```

**差异点：**
| coc | vscode |
|-----|--------|
| `Hover.create(contents, range?)` | `new Hover(contents, range?)` |
| contents: `MarkupContent \| MarkedString \| MarkedString[]` | contents: `MarkdownString[] \| MarkedString[]` |
| `Range.create(sl, sc, el, ec)` | `new Range(sl, sc, el, ec)` |

---

## 4. DiagnosticCollection

```typescript
// coc.nvim
import { Diagnostic, DiagnosticSeverity, DiagnosticCollection } from 'coc.nvim'

const collection: DiagnosticCollection = languages.createDiagnosticCollection('my-linter')

function updateDiagnostics(uri: string, diagnostics: Diagnostic[]) {
  collection.set(uri, diagnostics)
  // clear: collection.set(uri, null)
}

// VS Code
import * as vscode from 'vscode'

const collection: vscode.DiagnosticCollection = vscode.languages.createDiagnosticCollection('my-linter')

function updateDiagnostics(uri: vscode.Uri, diagnostics: vscode.Diagnostic[]) {
  collection.set(uri, diagnostics)
  // clear: collection.set(uri, undefined)
}
```

**差异点：**
| coc | vscode |
|-----|--------|
| `collection.set(uri: string, ...)` | `collection.set(uri: Uri, ...)` |
| 清空用 `null` | 清空用 `undefined` |
| `Diagnostic.create(range, msg, severity?, code?)` | `new Diagnostic(range, msg, severity?)` |
| `DiagnosticSeverity.Error` = `1` | `DiagnosticSeverity.Error` = `0` |

---

## 5. StatusBarItem

```typescript
// coc.nvim
import { window, StatusBarItem } from 'coc.nvim'

const item: StatusBarItem = window.createStatusBarItem(0, { progress: false })
item.text = 'Hello'
item.isProgress = false
item.show()

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
```

**差异点：**
| coc | vscode |
|-----|--------|
| `createStatusBarItem(priority?, opts?)` | `createStatusBarItem(id, alignment?, priority?)` |
| 无 `id`/`name`/`alignment`/`tooltip`/`color`/`backgroundColor`/`command` | 全部有 |
| 有 `isProgress`（coc 独有） | 无 |

---

## 6. OutputChannel

```typescript
// coc.nvim
import { window, OutputChannel } from 'coc.nvim'

const channel: OutputChannel = window.createOutputChannel('My Extension')
channel.appendLine('hello world')
channel.show()

// VS Code
import * as vscode from 'vscode'

const channel: vscode.OutputChannel = vscode.window.createOutputChannel(
  'My Extension',
  'log'  // ⚠️ coc 不支持 languageId
)
channel.appendLine('hello world')
channel.show(true)  // preserveFocus
```

**差异点：**
| coc | vscode |
|-----|--------|
| `createOutputChannel(name)` | `createOutputChannel(name, languageId?)` |
| `show()` 无参数 | `show(preserveFocus?)` / `show(column?, preserveFocus?)` |
| `clear(keep?: number)` | `clear()` |
| 有 `content` 属性（coc 独有） | 无 |
| 无 `replace()` | 有 `replace()` |

---

## 7. Workspace.getConfiguration

```typescript
// coc.nvim
import { workspace, WorkspaceConfiguration } from 'coc.nvim'

const config: WorkspaceConfiguration = workspace.getConfiguration('myExtension')
const value: string | undefined = config.get<string>('someKey')
const value2: string = config.get<string>('someKey', 'default')

// VS Code
import * as vscode from 'vscode'

const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('myExtension')
const value: string | undefined = config.get<string>('someKey')
const value2: string = config.get<string>('someKey', 'default')
```

**相同。**

---

## 8. applyEdit (WorkspaceEdit)

```typescript
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

// VS Code
import * as vscode from 'vscode'

const edit = new vscode.WorkspaceEdit()
edit.replace(
  vscode.Uri.file('/path/to/file.ts'),
  new vscode.Range(1, 0, 1, 10),
  'new text'
)
await vscode.workspace.applyEdit(edit)
```

**差异点：**
| coc | vscode |
|-----|--------|
| 直接构造 LSP `WorkspaceEdit` 对象 | 用 `WorkspaceEdit` class 的 `replace/insert/delete` 方法 |
| Uri 用字符串 | Uri 用 `Uri.file()`/`Uri.parse()` |
| `TextEdit.replace()` 工厂方法 | `new TextEdit(range, newText)` 构造函数 |

---

## 9. TreeView

```typescript
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
```

**差异点：**
| coc | vscode |
|-----|--------|
| `TreeItem.icon`（自定义 `{text, hlGroup}`） | `iconPath`（`Uri \| ThemeIcon`） |
| `TreeItem.tooltip: string \| MarkupContent` | `tooltip: string \| MarkdownString` |
| 无 `contextValue` | 有 |
| 无 `checkboxState` | 有 |

---

## 10. QuickPick

```typescript
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
```

**差异点：**
| coc | vscode |
|-----|--------|
| `createQuickPick()` 返回 `Promise<QuickPick<T>>` | 返回 `QuickPick<T>`（同步） |
| `picker.show()` 返回 `Promise<T[]>` | `picker.show()` 返回 `void` |
| 交互模式：Promise 式 | 交互模式：事件驱动（`onDidAccept`, `onDidChangeSelection`） |
| 无 `onDidTriggerButton`、`buttons` | 有 |

---

## 11. SnippetString

```typescript
// coc.nvim
import { SnippetString } from 'coc.nvim'

const snippet = new SnippetString()
snippet.appendText('console.log(')
snippet.appendPlaceholder('hello')
snippet.appendText(')')
// value: 'console.log(${1:hello})'

// VS Code — 完全一样
const snippet = new SnippetString()
snippet.appendText('console.log(')
snippet.appendPlaceholder('hello')
snippet.appendText(')')
```

**相同。**

---

## 12. Terminal

```typescript
// coc.nvim
import { window, Terminal } from 'coc.nvim'

const term: Terminal = await window.createTerminal({
  name: 'My Terminal',
  shellPath: '/bin/bash',
  cwd: '/tmp'
})

// VS Code
import * as vscode from 'vscode'

const term: vscode.Terminal = vscode.window.createTerminal({
  name: 'My Terminal',
  shellPath: '/bin/bash',
  cwd: vscode.Uri.file('/tmp'),  // ⚠️ coc 只接受 string
  iconPath: new vscode.ThemeIcon('terminal'),  // ⚠️ coc 无
})
```

**差异点：**
| coc | vscode |
|-----|--------|
| `createTerminal()` 返回 `Promise<Terminal>` | 返回 `Terminal`（同步） |
| `cwd: string` | `cwd: string \| Uri` |
| 无 `iconPath`/`color`/`hideFromUser`/`location`/`isTransient`/`message` | 全部有 |
| 无 `shellIntegration`/`state` | 有 |
| 有 `bufnr`（coc 独有） | 无 |

---

## 13. 诊断 (Diagnostics)

```typescript
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

// VS Code
import * as vscode from 'vscode'

const diag = new vscode.Diagnostic(
  new vscode.Range(0, 0, 0, 10),
  'This is an error',
  vscode.DiagnosticSeverity.Error  // = 0 !
)
diag.code = 'my-lint'
```

**差异点：**
| coc | vscode |
|-----|--------|
| `Diagnostic.create(range, msg, severity?)` | `new Diagnostic(range, msg, severity?)` |
| `DiagnosticSeverity.Error = 1` | `DiagnosticSeverity.Error = 0` |
| - Warning: 2 | - Warning: 1 |
| - Information: 3 | - Information: 2 |
| - Hint: 4 | - Hint: 3 |
| code 类型: `integer \| string` | code 类型: `string \| number \| {value, target}` |
| 有 `data: LSPAny?`（coc 独有） | 无 |

---

## 14. 配置监听

```typescript
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

// VS Code
import * as vscode from 'vscode'

vscode.workspace.onDidChangeConfiguration((e) => {
  if (e.affectsConfiguration('myExt')) {
    const val = vscode.workspace.getConfiguration('myExt').get('key')
  }
})
```

`onDidChangeConfiguration` 签名字段基本相同。coc 额外有 `watchOption`/`watchGlobal`（vim 特有）。
