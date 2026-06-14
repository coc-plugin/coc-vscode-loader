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
| `bridge` | 生成桥接代码（仅用于有不可移植 API 的插件，如 Volar） |
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

`id` 用于区分多个 LanguageClient 实例。默认值为插件名（`origPkg.name`），当插件需要启动多个 server 时，每个 `language-client` 步骤应指定不同的 `id`。

#### server.kind

| kind | 说明 | 生成的 LanguageClient 参数 |
|------|------|--------------------------|
| `module` | Node.js 模块，require() 后 spawn | `{ module: serverPath, transport }` |
| `binary` | 独立可执行文件 | `{ command: serverPath, args }`（不传 transport，LanguageClient 默认使用 stdio） |

`module` 支持 `transport` 参数（`ipc` 或 `stdio`），生成 `{ module: serverPath, transport: TransportKind.ipc }`。`binary` 不支持 `transport` 参数——`command` 模式默认使用 stdio，传 transport 会导致某些 server（如 Deno）收到意外的 `--stdio` 参数。

#### server.entry

| entry | 说明 |
|-------|------|
| `"main"`（默认） | `require.resolve(server.package)` → 用 package.json 的 main 字段 |
| `"bin"` | 从入口路径反推 package.json，读取 bin 字段。先尝试 `require.resolve(pkg)`，失败时自动回退到 `require.resolve(pkg/package.json)` |

`entry: "bin"` 解决 Prisma 问题：包的 `main` 字段指向库入口（不可 spawn），`bin` 字段指向实际服务器入口。生成的代码在**运行时**通过主入口路径反向查找 package.json 来解析 `bin` 字段，而不是使用 `require.resolve('pkg/package.json')`——因为现代 npm 包的 `exports` 字段可能阻止 `package.json` 子路径的解析。

`entry: "bin"` 也支持没有 `main` 字段的包（如 `@tailwindcss/language-server`），自动回退到 `require.resolve('pkg/package.json')`。

#### server.binName

当包的 `bin` 字段包含多个入口时，用 `binName` 指定具体使用哪一个。不指定时默认取第一个。

```json
{
  "kind": "module",
  "package": "@tailwindcss/language-server",
  "entry": "bin",
  "binName": "tailwindcss-language-server"
}
```

`@tailwindcss/language-server` 的 `bin` 字段有两个入口：`css-language-server` 和 `tailwindcss-language-server`，通过 `binName` 选择功能完整的 `tailwindcss-language-server`。

#### server.binary（仅 binary kind）

```json
"binary": {
  "repo": "denoland/deno",
  "asset": "deno-{{rust-target}}.zip",
  "binaryPath": "deno"
}
```

Pipeline 负责下载、解压、放置到 `build/server/`。

##### 模板变量

`asset` 和 `binaryPath` 支持以下模板变量，由 pipeline 在下载时替换：

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `{{version}}` | GitHub release 版本号（不含 v 前缀） | `1.45.0` |
| `{{platform}}` | 当前操作系统平台 | `darwin` / `linux` / `win32` |
| `{{arch}}` | CPU 架构 | `x64` / `arm64` |
| `{{rust-target}}` | Rust 编译目标三元组 | `x86_64-apple-darwin` / `x86_64-unknown-linux-gnu` / `aarch64-apple-darwin` |

`{{rust-target}}` 由 `{{platform}}` + `{{arch}}` 映射得出，适用于 Rust 项目发布的 binary assets。

#### server.args

传给 server 的 CLI 参数。仅 binary kind 使用。例如 Deno: `["lsp"]`、Taplo: `["lsp", "stdio"]`。

#### transport

| transport | 说明 |
|-----------|------|
| `"ipc"`（默认） | TransportKind.ipc，Node.js IPC |
| `"stdio"` | TransportKind.stdio，标准输入输出 |

#### languages

声明文档选择器。生成 `documentSelector: [{ scheme: "file", language: "prisma" }]`。

#### multiRoot（暂未实现）

`true` 时：为每个 workspace folder 创建一个 LanguageClient 实例。当前 `multiRoot` 在类型定义中存在但生成代码未使用该参数。

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

#### 文本后处理（convert.ts）

步骤执行后，convert.ts 对所有输出源文件执行以下文本替换：
- `.fileName` → `Uri.parse($1.uri).fsPath`（coc 的 TextDocument 无 fileName 属性）
- `const { fileName, ...rest } = doc` 解构 → 拆分为 `{ ...rest } = doc; const fileName = Uri.parse(doc.uri).fsPath`
- `.uri.fsPath` → `Uri.parse($1.uri).fsPath`
- `getWordRangeAtPosition` → 内联词边界计算

引入 `Uri.parse()` 后自动将 `Uri` 补入 `from 'coc.nvim'` import。

#### entry

`source` 步骤复制所有 `.ts/.tsx` 文件到输出目录，对含 `from 'vscode'` 的文件应用 transforms。`entry` 指定 esbuild 入口（仅在无 `language-client` 步骤时使用）。

当 `language-client` 和 `source` 步骤同时存在时，`src/index.ts` 是自包含的入口，**不 import** `source` 步骤的文件。`source` 步骤的文件仅作为补充（被其他文件间接引用时才会被 esbuild 打包）。

步骤只负责生成源码。pipeline 在步骤执行后调用 esbuild，将所有源码打包为 `lib/index.js`。

#### activationEvents（可选）

声明插件的激活事件，仅在无 `language-client` 步骤时使用。pipeline 读取此字段写入输出 `package.json` 的 `activationEvents`。

```json
{
  "type": "source",
  "transforms": ["import-mapping"],
  "entry": "src/extension.ts",
  "activationEvents": ["onLanguage:html", "onCommand:extension.sayHello"]
}
```

当存在 `language-client` 步骤时，activationEvents 由该步骤自动生成。

#### keepDeps

从原始 package.json 保留的运行时依赖列表。用于保留非 server 的依赖（如 lodash、chokidar 等）。

版本的解析规则（三步降级）：

```
1. 在原始 package.json 的 dependencies 里找包名 → 找到则用
2. 没找到 → 在 devDependencies 里找 → 找到则用
3. 没找到 → 向上查找 workspace root（../package.json, ../../package.json...）的 dependencies/devDependencies → 找到则用（处理 monorepo 场景，暂未实现）
4. 都没找到 → 报错，提示人工补全版本号（暂未实现，当前静默返回 undefined）
```

如果自动解析均失败，可改用对象语法在 registry 中手动指定版本号：

```json
{
  "type": "source",
  "transforms": ["import-mapping"],
  "entry": "src/extension.ts",
  "keepDeps": {
    "lodash": "^4.17.21",
    "@vue/language-core": "workspace:*"
  }
}
```

数组语法（自动解析）和对象语法（手动指定）二选一，混用时报错。

---

### `bridge`

使用预设代码生成器生成独立入口代码。用于 **有大量不可移植 API 的插件**，这些插件的源码无法通过 `import-mapping` 完整转换。

原则：能用 `source` 优先用 `source`。`bridge` 是兜底策略，仅在 `import-mapping` 无法处理时使用。

当前预设：

| 预设 | 适用插件 | 生成内容 |
|------|----------|----------|
| `ts-bridge` | Volar | TypeScript 插件桥接代码：`activate()` 入口、TS 语言服务中间件、命令转发层 |

Bridge 步骤与其他步骤配合：`bridge` 生成核心桥接层，`source` 转换原始源码中的非桥接部分，两者通过 esbuild 合并打包。

```json
{
  "type": "bridge",
  "preset": "ts-bridge"
}
```

Bridge 代码由 converter 内置的安全模板生成，不在 registry 中存放可执行代码。添加新预设需要两步：

1. 在 `converter/src/steps/bridge.ts` 的 `BRIDGE_TEMPLATES` 中添加新类型（经审计的代码模板）
2. 在 [coc-vscode-registry/presets.json](https://github.com/coc-plugin/coc-vscode-registry/blob/main/presets.json) 中添加预设定义，引用该类型

```typescript
// converter/src/steps/bridge.ts
const BRIDGE_TEMPLATES = {
  'custom-bridge': (opts) => ({
    code: `...`,                      // 安全模板代码
    injectExts: opts.extensions || [], // 需要激活的 coc 扩展
    injectSvcs: opts.services || [],   // 需要启动的服务
    callAfter: 'registerBridge(...)',  // client 启动后的回调
    extraDeps: ['typescript'],         // 额外依赖
  }),
}
```

```json
// https://github.com/coc-plugin/coc-vscode-registry/blob/main/presets.json
{
  "custom-bridge": {
    "type": "custom-bridge",
    "options": {
      "extensions": ["coc-xxx"],
      "services": ["xxx"]
    }
  }
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

## 输出 package.json 生成

输出插件的 `package.json` 由 converter 在步骤执行后生成（而非 pipeline）。生成规则：

| 字段 | 来源 |
|------|------|
| `name` | `origPkg.name` + `"coc-"` 前缀（如 `coc-prisma`） |
| `main` | 固定为 `"lib/index.js"` |
| `activationEvents` | 从各步骤收集：`language-client` 自动生成 `onLanguage:<lang>`；`source.activationEvents` 直接透传 |
| `contributes` | 从原始插件 `package.json` 的 `contributes.configuration` 和 `contributes.commands` 透传；bridge 步骤额外生成 `typescriptServerPlugins` |
| `dependencies` | server 依赖 + `keepDeps` 解析结果 + 原始 `dependencies`（过滤后） |
| `devDependencies` | 固定 `esbuild: "^0.28.0"` |

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
// src/index.ts is self-contained — does NOT import extension.ts
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

### Prettier

```json
{
  "name": "prettier-vscode",
  "displayName": "Prettier",
  "description": "Code formatter using Prettier",
  "type": "direct-api",
  "languages": ["javascript", "typescript", "css", "html", "json", "yaml", "markdown", "scss", "less"],
  "categories": ["Formatter"],
  "minPluginVersion": "1.2.2",
  "convert": [
    {
      "type": "source",
      "transforms": ["import-mapping", "class-to-factory", "provider-register", "enum-offset"],
      "entry": "src/extension.ts",
      "activationEvents": ["*"],
      "keepDeps": ["prettier"]
    }
  ]
}
```

Prettier 使用 `source` 步骤直接转换 prettier-vscode 的源码（而非 bridge 生成器）。`import-mapping` 的文本替换层处理了其特有的 API：
- `window.activeTextEditor` → runtime polyfill
- `languages.createLanguageStatusItem` → no-op
- `registerDocumentFormatProvider(sel, provider, 1)` → priority=1 避免被 tsserver 覆盖
- `{ fileName } = doc` 解构拆分 → convert.ts 通用处理

`keepDeps: ["prettier"]` 保留 prettier 运行时依赖（原始 package.json 过滤掉了 prettier）。

### Tailwind CSS IntelliSense

```json
{
  "name": "tailwindcss",
  "displayName": "Tailwind CSS IntelliSense",
  "description": "Tailwind CSS class name completion, hover preview, and linting",
  "type": "pure-lsp",
  "source": {
    "type": "github",
    "repo": "tailwindlabs/tailwindcss-intellisense",
    "subdir": "packages/vscode-tailwindcss"
  },
  "languages": ["css", "html", "javascript", "typescript", "vue", "svelte", "scss"],
  "categories": ["LSP", "Completion"],
  "minPluginVersion": "1.2.2",
  "convert": [
    {
      "type": "language-client",
      "server": {
        "kind": "module",
        "package": "@tailwindcss/language-server",
        "entry": "bin",
        "binName": "tailwindcss-language-server"
      },
      "languages": ["css", "html", "javascript", "typescript", "vue", "svelte", "scss"]
    },
    {
      "type": "source",
      "transforms": ["import-mapping"]
    }
  ]
}
```

`@tailwindcss/language-server` 无 `main` 字段，仅通过 `bin` 暴露入口（`css-language-server` 和 `tailwindcss-language-server`）。取用 `binName` 指定完整版 `tailwindcss-language-server`。`entry: "bin"` 的 `require.resolve` 会回退到 `require.resolve('pkg/package.json')`。

需要 `minPluginVersion: "1.2.2"`（因为 `binName` 和 `require.resolve` 回退逻辑在该版本才加入）。

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
| `binName` | `npm view <package> --json` 的 bin 中包含该名称 |
| `entry: "bin"` + 无 `main` 字段 | `npm view <package> --json` 无 main，自动回退 `require.resolve('pkg/package.json')` |
| `kind: "binary"` + `binary.repo` | GitHub API `repos/<repo>/releases/latest` 可访问 |
| `kind: "binary"` + `binary.asset` | asset 模板变量渲染后匹配已发布的 release |
| `bridge.preset` | 预设已注册 |

### 转换时验证（converter 执行时）

| 条件 | 验证 |
|------|------|
| `languages` | 非空数组 |
| `source.entry` | 文件在源码目录存在 |
| `transforms` | 每个 transform 已注册 |
| `keepDeps`（数组语法） | 每个包名在源 package.json 的 dependency/devDependency 能找到 |
| `keepDeps`（对象语法） | 不验证版本号（手动指定，无自动解析） |
| 依赖版本号（数组语法） | 在源 package.json 能找到 |
| `bridge.preset` | 预设已注册 |

---

## 迁移计划

### Phase 1: 基础设施（已完成 ✅）

- [x] 在 `converter/src/types.ts` 添加完整步骤类型定义
- [x] 更新 `cli.ts`：添加 `--convert <JSON>` 参数接收步骤配置
- [x] 更新 `pipeline.ts`：从 registry 读取 `convert`，传入 CLI
- [x] 重构 `convert.ts` 核心循环：按步骤执行，不做启发式扫描
- [x] 添加 `language-client` 代码生成器（module/binary）
- [x] 添加 `source` 代码生成器（copy + transforms + esbuild）
- [x] 添加 `bridge` 代码生成器（preset 系统）
- [x] 添加 `mark-unsupported` 代码生成器
- [x] 添加步骤验证逻辑
- [x] 删除 `detectServerModules` 等启发式函数
- [x] 删除 pipeline 中的正则后处理（documentSelector、activationEvents、bin-walking 等）
- [x] 保留 pipeline：npm install、esbuild、binary download、pip install

### Phase 2: Registry 迁移（已完成 ✅）

- [x] 为全部 7 个现有插件添加 `convert` 配置
- [x] 逐个验证生成的插件能正常工作（Prisma ✅ Volar ✅ Deno ✅ Taplo ✅ Lua ✅ Ansible ✅ HTML CSS ✅）

### Phase 3: 测试（待办）

- [x] 创建 `scripts/test-regression.sh`（36 项测试，覆盖全部步骤类型和 edge cases）
- [ ] 遍历 registry，对每个条目执行：
      clone → convert → npm install → esbuild → require 验证
- [ ] CI：每次 PR 自动跑回归测试

### 待修复

- [ ] `keepDeps` 第 3 步 workspace root 查找
- [ ] `keepDeps` 解析失败时报错而非静默返回
- [ ] `multiRoot` 支持多 workspace folder
- [ ] CI 验证规则中 registry 条目的校验（`npm view` server 包存在性等）

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
