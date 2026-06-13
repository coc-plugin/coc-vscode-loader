# Converter v2.0 — Config-driven architecture

> 将转换器从启发式正则引擎重构为声明式配置驱动引擎。

## 问题

当前转换器（v1.x）用正则扫描整个项目源码来猜测插件的结构：

- `detectServerModules` 在所有 `.ts` 文件中搜索包含 "server" 或 "lsp" 的字符串
- 猜哪些 npm 包是 language server
- 猜用 `main` 还是 `bin` 作为入口
- Pipeline 再用更多正则去后处理生成的代码

结果是：改一个插件的规则可能影响其他插件，加新插件靠运气。

## 方案：配置驱动

每个 registry 条目声明一个 `convert` 字段（步骤数组），精确描述如何转换这个插件。转换器按声明执行，不做任何猜测。

配置通过 pipeline 传递给 converter：pipeline 从 registry 读取 `convert`，以 `--convert <JSON>` 参数传给 CLI。converter 不再自己扫描或猜测。

`type` 字段（`pure-lsp`、`ts-bridge`、`direct-api`）在 `convert` 存在时仅用于 TUI 显示和分类，不再影响转换行为。

```jsonc
{
  "name": "prisma",
  "type": "pure-lsp",
  "convert": [
    { "type": "language-client", "server": { "kind": "module", "package": "@prisma/language-server", "entry": "bin" }, "languages": ["prisma"] },
    { "type": "source", "transforms": ["import-mapping", "enum-offset"] }
  ]
}
```

## 转换步骤

每个 `convert` 是一个步骤数组，按顺序执行。步骤类型：

| 类型 | 功能 |
|------|------|
| `language-client` | 生成 LanguageClient 代码 |
| `source` | 复制源文件 + 应用 transforms |
| `bridge` | 生成桥接代码（Volar 类） |
| `mark-unsupported` | 标记不支持的功能 |

---

### `language-client`

生成 coc.nvim 的 LanguageClient，连接 language server。

```json
{
  "type": "language-client",
  "id": "main-ls",
  "server": {
    "kind": "module",
    "package": "@prisma/language-server",
    "entry": "bin"
  },
  "transport": "ipc",
  "languages": ["prisma"],
  "multiRoot": false
}
```

#### server.kind

| kind | 说明 | 生成的 LanguageClient 参数 |
|------|------|--------------------------|
| `module` | Node.js 模块，require() 后 spawn | `{ module: serverPath, transport }` |
| `binary` | 独立可执行文件 | `{ command: serverPath, args }`（binary 默认使用 stdio 通信） |

`transport` 与 `kind` 正交。`module` + `stdio` 生成 `{ module: serverPath, transport: TransportKind.stdio }`（这里的 `stdio` 是 transport 值，不是 kind）。

#### server.entry

| entry | 说明 |
|-------|------|
| `"main"`（默认） | `require.resolve(server.package)` → 用 package.json 的 main 字段 |
| `"bin"` | 从 `require.resolve(server.package + '/package.json')` 读取 bin 字段 |

`entry: "bin"` 解决 Prisma 问题：包的 `main` 字段指向库入口（不可 spawn），`bin` 字段指向实际服务器入口。生成的代码在**运行时**解析 `bin` 字段，不是转换时。

#### server.binary（仅 binary kind）

```json
"binary": {
  "repo": "denoland/deno",
  "asset": "deno-{{rust-target}}.zip",
  "binaryPath": "deno"
}
```

Pipeline 负责下载、解压、放置到 `build/server/`。

#### server.args

传给 server 的 CLI 参数。仅 binary kind 使用。例如 Deno: `["lsp"]`、Taplo: `["lsp", "stdio"]`。

#### transport

| transport | 说明 |
|-----------|------|
| `"ipc"`（默认） | TransportKind.ipc，Node.js IPC |
| `"stdio"` | TransportKind.stdio，标准输入输出 |

#### languages

声明文档选择器。生成 `documentSelector: [{ scheme: "file", language: "prisma" }]`。

#### multiRoot

`true` 时：为每个 workspace folder 创建一个 LanguageClient 实例。

---

### `source`

复制源文件中使用了 VS Code API 的部分，应用 transforms。覆盖非 LSP 代码（命令注册、状态栏、补全提供者等）。

扫描器检测所有包含 `from 'vscode'` 或 `require('vscode')` 的文件，这些文件会被自动复制并应用 transforms。不需要逐个声明文件名——扫描器只做这个，不做任何 server 检测。

```json
{
  "type": "source",
  "transforms": ["import-mapping", "enum-offset", "class-to-factory", "provider-register"],
  "entry": "src/extension.ts",
  "keepDeps": ["lodash", "execa"]
}
```

transforms 在 `source` 步骤中声明，只对扫描器检测到的文件生效。

| transform | 说明 |
|-----------|------|
| `import-mapping` | `from 'vscode'` → `from 'coc.nvim'` |
| `enum-offset` | 添加 enum 值差异注释 |
| `class-to-factory` | `new SomeClass()` → `SomeClass.create()` |
| `provider-register` | 适配 provider 注册签名 |

#### entry

`source` 步骤对指定 entry 文件应用 transforms 后复制到输出目录，作为 esbuild 入口。

当 `language-client` 和 `source` 步骤同时存在时，`source` 的 entry 会被 `language-client` 生成的 `index.ts` import：

```typescript
// src/index.ts（由 language-client 步骤生成）
import './extension'   // 由 source 步骤转换后的 entry
```

esbuild 将两者打包为一个 `lib/index.js`。

#### keepDeps

从原始 package.json 保留的运行时依赖列表。用于保留非 server 的依赖（如 lodash、chokidar 等）。

版本的解析规则：

```
1. 在原始 package.json 的 dependencies 里找包名 → 找到则用
2. 没找到 → 在 devDependencies 里找 → 找到则用
3. 都没找到 → 报错，提示人工补全版本号
```

---

### `bridge`

使用预设代码生成器生成桥接代码。当前只有一个预设 `ts-bridge`（Volar 用），架构支持扩展。

```json
{
  "type": "bridge",
  "preset": "ts-bridge",
  "options": {
    "registerCommands": true
  }
}
```

添加新预设：
1. 在 `converter/src/presets/` 下新建文件，导出 `PresetGenerator` 接口的实现
2. 在 `converter/src/presets/index.ts` 注册
3. registry 里直接通过 `preset` 名字引用

```typescript
// converter/src/presets/types.ts
interface PresetGenerator {
  name: string
  generate(context: PresetContext): GeneratedCode
}
```

---

### `mark-unsupported`

标记不支持的功能，在生成的代码里加警告注释，不产生可执行代码。

```json
{
  "type": "mark-unsupported",
  "features": ["decoration", "webview", "tree-data-provider", "open-external"]
}
```

支持的 feature：

| feature | 警告内容 |
|---------|----------|
| `decoration` | "Decoration API is not supported in coc.nvim" |
| `webview` | "Webview API is not supported in coc.nvim" |
| `tree-data-provider` | "Tree data provider is not supported" |
| `open-external` | "env.openExternal has no equivalent" |

---

## 完整示例

### Prisma

```json
{
  "name": "prisma",
  "displayName": "Prisma",
  "type": "pure-lsp",
  "languages": ["prisma"],
  "categories": ["LSP"],
  "convert": [
    {
      "type": "language-client",
      "server": {
        "kind": "module",
        "package": "@prisma/language-server",
        "entry": "bin"
      },
      "languages": ["prisma"]
    },
    {
      "type": "source",
      "transforms": ["import-mapping", "enum-offset"],
      "entry": "src/extension.ts",
      "keepDeps": ["@hono/node-server", "prisma-6-language-server"]
    }
  ]
}
```

`keepDeps` 保留了 server 外的原始依赖。converter 自动从源 `package.json` 读取版本号。

生成的代码结构：

```typescript
// src/index.ts (generated entry)
import { LanguageClient, TransportKind, services } from 'coc.nvim'
// ... server resolution, client creation, registration ...

// src/extension.ts (original, with transforms)
// import { commands, window } from 'vscode' → import { commands, window } from 'coc.nvim'
// Original command registrations and non-LSP code preserved
```

### Deno

```json
{
  "name": "deno",
  "displayName": "Deno",
  "description": "Deno language support",
  "type": "pure-lsp",
  "languages": ["javascript", "typescript", "javascriptreact", "typescriptreact"],
  "categories": ["LSP"],
  "convert": [
    {
      "type": "language-client",
      "server": {
        "kind": "binary",
        "package": "deno",
        "binary": {
          "repo": "denoland/deno",
          "asset": "deno-{{rust-target}}.zip",
          "binaryPath": "deno"
        },
        "args": ["lsp"]
      },
      "languages": ["javascript", "typescript", "javascriptreact", "typescriptreact"]
    },
    {
      "type": "source",
      "transforms": ["import-mapping"]
    }
  ]
}
```

### Volar

```json
{
  "name": "volar",
  "displayName": "Volar (Vue)",
  "description": "Vue language support",
  "type": "ts-bridge",
  "languages": ["vue"],
  "categories": ["LSP", "TypeScript"],
  "convert": [
    {
      "type": "bridge",
      "preset": "ts-bridge"
    },
    {
      "type": "source",
      "transforms": ["import-mapping"]
    }
  ]
}
```

### HTML CSS Support

```json
{
  "name": "html-css-support",
  "displayName": "HTML CSS Support",
  "description": "CSS class name completion for HTML attributes",
  "type": "direct-api",
  "languages": ["html", "css"],
  "categories": ["Completion"],
  "convert": [
    {
      "type": "source",
      "transforms": ["import-mapping", "class-to-factory", "provider-register"],
      "entry": "src/extension.ts"
    }
  ]
}
```

### Haskell（新插件示例）

```json
{
  "name": "haskell",
  "displayName": "Haskell",
  "description": "Haskell language support — completion, diagnostics, hover",
  "type": "pure-lsp",
  "url": "https://github.com/haskell/haskell-language-server",
  "languages": ["haskell"],
  "categories": ["LSP"],
  "convert": [
    {
      "type": "language-client",
      "server": {
        "kind": "binary",
        "package": "haskell-language-server",
        "binary": {
          "repo": "haskell/haskell-language-server",
          "asset": "haskell-language-server-{{version}}-{{platform}}-{{arch}}.tar.gz",
          "binaryPath": "haskell-language-server-{{version}}/bin/haskell-language-server"
        }
      },
      "languages": ["haskell"]
    }
  ]
}
```

---

## 验证规则

验证分为 CI 时（PR 阶段）和转换时（converter 执行时）两个阶段：

### CI 时验证（`scripts/test-regression.sh` 中）

| 条件 | 验证方式 |
|------|----------|
| `kind: "module"` + `package` | `npm view <package>` 存在 |
| `entry: "bin"` | `npm view <package> --json` 有 bin 字段 |
| `kind: "binary"` + `binary.repo` | GitHub API `repos/<repo>/releases/latest` 可访问 |
| `kind: "binary"` + `binary.asset` | asset 模板变量渲染后匹配已发布的 release |
| `bridge.preset` | 预设已注册 |

### 转换时验证（converter 执行时）

| 条件 | 验证 |
|------|------|
| `languages` | 非空数组 |
| `source.entry` | 文件在源码目录存在 |
| `transforms` | 每个 transform 已注册 |
| `keepDeps` | 在源 package.json 能找到 |
| 依赖版本号 | 在源 package.json 能找到，或手动指定 |
| `bridge.preset` | 预设已注册 |

---

## 迁移计划

### Phase 1: 基础设施（单次）

- [ ] 在 `converter/src/types.ts` 添加完整步骤类型定义
- [ ] 更新 `cli.ts`：添加 `--convert <JSON>` 参数接收步骤配置
- [ ] 更新 `pipeline.ts`：从 registry 读取 `convert`，传入 CLI
- [ ] 重构 `convert.ts` 核心循环：按步骤执行，不做启发式扫描
- [ ] 添加 `language-client` 代码生成器（module/binary）
- [ ] 添加 `source` 代码生成器（copy + transforms + esbuild）
- [ ] 添加 `bridge` 代码生成器（preset 系统）
- [ ] 添加 `mark-unsupported` 代码生成器
- [ ] 添加步骤验证逻辑
- [ ] 删除 `detectServerModules` 等启发式函数
- [ ] 删除 pipeline 中的正则后处理（documentSelector、activationEvents、bin-walking 等）
- [ ] 保留 pipeline：npm install、esbuild、binary download、pip install

### Phase 2: Registry 迁移（单次）

- [ ] 为全部 7 个现有插件添加 `convert` 配置
- [ ] 逐个验证生成的插件能正常工作

### Phase 3: 测试（持续）

- [ ] 创建 `scripts/test-regression.sh`
- [ ] 遍历 registry，对每个条目执行：
      clone → convert → npm install → esbuild → require 验证
- [ ] CI：每次 PR 自动跑回归测试

---

## 删除清单

删除后，这些代码不再需要：

| 文件 | 删除内容 |
|------|----------|
| `converter/src/convert.ts` | `detectServerModules()` 函数 |
| `converter/src/convert.ts` | 所有基于正则的 server 检测逻辑 |
| `converter/src/scanner.ts` | 可以保留用于检测 `from 'vscode'`，去掉 server 相关检测 |
| `plugin/src/pipeline.ts` | documentSelector 正则替换 |
| `plugin/src/pipeline.ts` | activationEvents 正则替换 |
| `plugin/src/pipeline.ts` | config.get() 替换为 binary path 的正则 |

---

## 对比：旧 vs 新

| 维度 | v1.x（启发式） | v2.0（配置驱动） |
|------|---------------|-----------------|
| 加新插件 | 调正则，可能影响已有插件 | 写 JSON 声明，完全隔离 |
| 调试 | 正则匹配了什么？不知道 | 每个步骤独立验证，错误精确 |
| 可靠性 | 猜对就能用，猜错就炸 | 声明的就是确定的 |
| 混合类型 | 不支持（pure-lsp vs direct-api 二选一） | 步骤数组可以组合 |
| 测试 | 手动测试 | 配置即测试用例 |
| 学习成本 | 需要理解 500 行正则逻辑 | 理解 5 个 JSON 字段即可 |
