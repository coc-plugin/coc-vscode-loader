# converter — vscode → coc 转换器原型

将 VS Code 扩展自动转换为 coc.nvim 插件的 CLI 工具。

## 用法

```bash
# 转换一个 VS Code 扩展目录
npx tsx src/cli.ts convert ./vscode-ext/ -o ./coc-ext/

# 安装到 coc
cd ./coc-ext && npm install && npm run build
cd ~/.config/coc/extensions && npm install /path/to/coc-ext
```

## 已验证的转换

| 插件 | 类型 | 自动检测 | 构建 | 功能 | 备注 |
|------|------|---------|------|------|------|
| Volar (Vue) | TS 桥接型 | `@vue/language-server` + `typescript` | ✅ | ✅ | 需要修改版 coc-tsserver |
| Prisma | 纯 LSP | `@prisma/language-server` | ✅ | ✅ | 自动检测 bin 入口 |
| HTML CSS Support | 直接 API | — | ✅ | ✅ | 自动处理 API 差异 |

### 插件分类

| 类型 | 说明 | 处理方式 | 示例 |
|------|------|---------|------|
| **TS 桥接型** | 依赖 TypeScript LSP 的语言插件 | 生成 `tsserver/request` 桥接 + `typescriptServerPlugins` | Volar |
| **纯 LSP** | 使用 LanguageClient 的标准 LSP 插件 | 生成 LanguageClient 入口 + 服务器依赖注入 | Prisma |
| **直接 API** | 不使用 LanguageClient，直接调用 API | 保留原 `extension.ts` 为入口，不做桥接 | HTML CSS Support |

TS 桥接型插件需要修改版 coc-tsserver（[PR #493](https://github.com/neoclide/coc-tsserver/pull/493)）：

```bash
cd ~/.config/coc/extensions
npm install ChuYanLon/coc-tsserver --legacy-peer-deps
```

## 架构

```
输入：VS Code 扩展目录
  │
  ├─ scanner        分析 API → 检测插件类型
  ├─ transforms/    AST 变换
  │   ├─ import-mapping      from 'vscode' → from 'coc.nvim'
  │   ├─ class-to-factory    new Xxx() → Xxx.create()
  │   ├─ provider-register   补齐注册函数签名差异
  │   └─ language-client     LanguageClient 签名适配
  ├─ mark-unsupported  标记/替换缺失 API（getWordRangeAtPosition、fileName 等）
  ├─ generate src/index.ts   主入口（含自动桥接/纯 LSP 两种模板）
  ├─ generate package.json   依赖/配置/esbuild external
  └─ generate esbuild.mjs    构建配置
```

## 文件结构

| 文件 | 行数 | 说明 |
|------|------|------|
| `src/cli.ts` | 28 | CLI 入口 |
| `src/convert.ts` | ~440 | 主流程 + 模板生成 + API 替换 |
| `src/scanner.ts` | 136 | API 扫描 + 插件分类 |
| `src/transforms/import-mapping.ts` | 47 | import 替换 |
| `src/transforms/language-client.ts` | 48 | LanguageClient 适配 |
| `src/transforms/class-to-factory.ts` | 40 | new Xxx() → Xxx.create() |
| `src/transforms/provider-register.ts` | 49 | provider 注册签名补齐 |
| **总计** | **~790** | |

## 已处理的 API 差异

| API | VS Code | coc.nvim | 处理方式 |
|-----|---------|----------|---------|
| import | `from 'vscode'` | `from 'coc.nvim'` | 直接替换 |
| Position/Range/Location 等 | `new Xxx()` | `Xxx.create()` | AST 替换 |
| EventEmitter | `EventEmitter<T>` | `Emitter<T>` | 直接替换 |
| registerCompletionItemProvider | `(sel, p, ...t)` | `(name, shortcut, sel, p, t?)` | 补齐参数 |
| registerCodeActionsProvider | `registerCodeActionsProvider` | `registerCodeActionProvider` | 重命名 |
| registerReferenceProvider | `registerReferenceProvider` | `registerReferencesProvider` | 重命名 |
| documentSelector | `[{ language: 'xxx' }]` | 相同 | 自动从 package.json 推断 |
| getWordRangeAtPosition | `document.getWordRangeAtPosition()` | 不存在 | 替换为手动计算 |
| fileName | `document.fileName` | 不存在 | 替换为 `document.uri` |
| createTextEditorDecorationType | `window.createTextEditorDecorationType()` | 不存在 | 标记 TODO |
| createWebviewPanel | `window.createWebviewPanel()` | 不存在 | 标记 TODO |

### 缺失 API 处理策略

当 VS Code 的 API 在 coc 中不存在时，优先从 VS Code 源码寻找实现方案：

1. 在 [VS Code 源码](https://github.com/microsoft/vscode) 中找到该 API 的实现
2. 评估复杂度：
   - **简单逻辑**（如 `getWordRangeAtPosition`）→ 直接实现内联 polyfill
   - **复杂逻辑**（如 decoration、webview）→ 标记 TODO，说明原因
3. polyfill 优先使用 coc 已有 API 组合实现，避免引入新依赖

已知 VS Code API 实现位置：
- `getWordRangeAtPosition` → `src/vs/editor/common/core/wordHelper.ts`
- `TextDocument.fileName` → coc 用 `document.uri` 替代（`DocumentUri = string`）
- decoration 系统 → `src/vs/editor/common/viewModel/viewDecorations.ts`

## 关键设计

- **零硬编码** — 服务器包名从源码自动检测
- **bin 入口回退** — 自动检测并优先使用 `package.json` 的 `bin` 入口
- **esbuild external 自动注入** — 检测到的服务器包自动标记为 external
- **TS 桥接型自动注入** — `typescriptServerPlugins` + `tsserver/request` 转发
- **插件分类** — 自动识别 TS 桥接/纯 LSP/直接 API 三种类型，不同处理
- **缺失 API 处理** — 能替换的替换，不能替换的标记 TODO
