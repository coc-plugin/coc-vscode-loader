# Vue Volar → coc.nvim 迁移指南

以 `@vue/language-tools`（Volar）为例，展示 LSP 类 VS Code 插件如何迁移到 coc.nvim。

---

## 1. 架构总览

```
@vue/language-tools/
├── extensions/vscode/          ← 薄客户端（需转换）
│   └── src/
│       ├── extension.ts         ← 主入口 + LanguageClient
│       ├── config.ts            ← 配置定义
│       ├── rangeFormatting.ts   ← 格式范围限制（纯逻辑）
│       ├── interpolationDecorators.ts  ← UI 装饰（可删）
│       ├── reactivityVisualization.ts  ← UI 装饰（可删）
│       ├── reactivityAnalysisPlugin.ts ← UI 插件（可删）
│       ├── focusMode.ts                ← UI 聚焦（可删）
│       └── welcome.ts                  ← Webview 欢迎页（可删）
├── packages/
│   └── language-server/        ← LSP 服务端（零改动）
```

**核心原则：** LSP 服务端完全不变，只转换 VS Code 客户端代码。

---

## 2. 逐文件迁移方案

### 前置条件

安装修改版 coc-tsserver（PR [#493](https://github.com/neoclide/coc-tsserver/pull/493)，合并前使用 fork）：

```bash
cd ~/.config/coc/extensions
npm install ChuYanLon/coc-tsserver --legacy-peer-deps
```

### 🟢 2.1 `extension.ts` — 主入口

**VS Code 写法（简化）：**

```typescript
import * as vscode from 'vscode'
import * as lsp from '@volar/vscode/node'

const client = new lsp.LanguageClient(
  'vue',
  'Vue',
  {
    run: {
      module: serverPath,
      transport: lsp.TransportKind.ipc,
    },
    debug: {
      module: serverPath,
      transport: lsp.TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] },
    },
  },
  {
    documentSelector: [{ language: 'vue' }],
    outputChannel: logger,
  },
)
client.start()
```

**coc 等价写法：**

```typescript
import { LanguageClient, TransportKind } from 'coc.nvim'

const client = new LanguageClient(
  'vue',
  'Vue',
  {
    module: serverPath,
    transport: TransportKind.ipc,
    args: ['--tsdk=' + tsdk],
  },
  {
    documentSelector: ['vue'],
    outputChannel: logger,
  },
)
client.start()
```

**差异对照：**

| 项目 | VS Code | coc.nvim |
|------|---------|----------|
| import | `@volar/vscode/node` | `coc.nvim` |
| `run` / `debug` 分拆 | 有 | 合并为一个 serverOptions |
| `TransportKind` | `lsp.TransportKind` | `TransportKind` |
| middleware | `@volar/vscode` 提供 | 直接传对象 |
| `onNotification` | `client.onNotification` | 相同 |
| `client.start()` | 返回 void | 相同 |

### 🟢 2.2 `config.ts` — 配置

**VS Code：**
```typescript
import { defineConfig } from 'reactive-vscode'
export const config = defineConfig(scopedConfigs)
```

**coc：**
```typescript
import { workspace } from 'coc.nvim'
const config = workspace.getConfiguration('vue')
export { config }
```

coc 的配置通过 `workspace.getConfiguration('vue')` 直接读取 `package.json` 中 `contributes.configuration` 定义的属性。

### 🟢 2.3 `rangeFormatting.ts` — 纯逻辑

**VS Code：**
```typescript
import * as vscode from 'vscode'
type X = vscode.TextDocument
type Y = vscode.TextEdit
```

**coc：**
```typescript
import { TextDocument, TextEdit, Range, Position } from 'coc.nvim'
```

只改类型 import，逻辑零改动。

### 🟡 2.4 VS Code 特有 API 处理

以下 API 在 coc 中没有直接等价，需要适配：

| VS Code API | 出现位置 | coc 替代方案 |
|-------------|---------|-------------|
| `window.createTextEditorDecorationType` | `interpolationDecorators.ts` `reactivityVisualization.ts` `focusMode.ts` | `workspace.nvim.call('nvim_buf_add_highlight', ...)` 或**删掉** |
| `editor.setDecorations(type, ranges)` | 同上 | **删掉** |
| `window.createWebviewPanel` | `welcome.ts` | **删掉**（欢迎页非核心功能） |
| `env.openExternal(uri)` | `welcome.ts` | `workspace.nvim.call('denops#request', 'open', uri)` |
| `FoldingRange` executeCommand | `focusMode.ts` | **删掉** |
| `extensions.getExtension(id)` | `extension.ts` | `extensions.getExtensionById(id)` |
| `showInputBox()` | `extension.ts` (middleware) | `window.requestInput()` |
| `Position.compareTo` | `reactivityVisualization.ts` | 手动比较 `line` 和 `character` |

### 🔴 2.5 可直接删除的 VS Code 专有功能

| 功能 | 原因 |
|------|------|
| `patchTypeScriptExtension()` | 猴子补丁 VS Code 内置 TS 扩展，coc 不需要 |
| `interpolationDecorators` | UI 装饰，非核心功能 |
| `reactivityVisualization` | UI 可视化，非核心功能 |
| `reactivityAnalysisPlugin` | 依赖 decoration，非核心功能 |
| `focusMode` | decoration 动画，非核心功能 |
| `welcome.ts` | Webview 欢迎页，coc 无此能力 |

---

## 3. package.json 转换

```jsonc
// VS Code
{
  "engines": { "vscode": "^1.88.0" },
  "activationEvents": ["onLanguage"],
  "main": "./main.js",
  "contributes": {
    "commands": [ /* ... */ ],
    "configuration": { /* ... 配置项完全保留 ... */ },
    "languages": [{ "id": "vue", "extensions": [".vue"] }],
    "grammars": [ /* 语法文件, coc 不支持 */ ],
    "menus": [ /* coc 不支持 */ ]
  }
}

// coc.nvim
{
  "engines": { "coc": "^0.0.82" },
  "activationEvents": ["onLanguage:vue"],
  "main": "lib/index.js",
  "contributes": {
    "commands": [ /* 保留命令 */ ],
    "configuration": { /* 保留, 去掉 markdownDescription、enumDescriptions 等不支持字段 */ }
  }
}
```

### 需要修改的字段

| 字段 | VS Code | coc.nvim |
|------|---------|----------|
| `engines.vscode` | `"^1.88.0"` | 删掉 |
| `engines.coc` | 无 | `"^0.0.82"` |
| `main` | `"./main.js"` | `"lib/index.js"` |
| `activationEvents` | `["onLanguage"]` | `["onLanguage:vue"]` |
| `contributes.languages` | 完整语言定义 | **保留** |
| `contributes.grammars` | TextMate 语法 | **删掉**（coc 用 vim 语法） |
| `contributes.menus` | 右键菜单 | **删掉** |
| `contributes.configuration.properties` | 含 `markdownDescription`/`scope`/`enumDescriptions` | **删掉不支持字段** |

---

## 4. 实际转换量估算

```
文件总数:          8
需转换文件:        3 (extension.ts, config.ts, rangeFormatting.ts)
可删除文件:        5 (无关 UI 功能)

代码行数:
  总行数:          ~1000
  需转换:          ~200
  可删除:          ~600
  纯逻辑保留:      ~100

自动化程度:        ~85% 可自动处理
```

---

## 5. 通用模式总结

从 Volar 看 LSP 类插件的迁移，每次只需要做这几件事：

1. **改 import** — `from 'vscode'` → `from 'coc.nvim'`
2. **改 LanguageClient** — 合并 `run/debug` 选项
3. **删 UI 代码** — decoration / webview / menu 直接删
4. **删 TS 补丁** — `patchTypeScriptExtension` 类 hack
5. **精简 package.json** — engines / grammars / menus

Volar 的完整转换代码示例见 `pattern-migration-examples.md` 中的 LanguageClient 模式。
