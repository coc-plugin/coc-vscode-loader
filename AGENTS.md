# AGENTS.md — vscode-coc-loader

## What this repo is

Reference documentation for migrating VS Code extensions to coc.nvim + **converter CLI** (`converter/`) that automatically converts VS Code extensions to coc plugins.

## Platform

**Supported OS**: Linux, macOS. **Windows not supported.**

External commands required at runtime:
- `git`, `node`/`npm`/`npx` (Node.js >= 18), `curl`, `unzip`, `tar`/`gunzip`
- `python3` + `pip` (only if plugin has `pipPackages` in registry)
- `go` (only if plugin has `goPackages` in registry)
- `cargo` (only if plugin has `cargoPackages` in registry)
- Plugin pipeline runs all commands via `spawn(cmd, args, { shell: true })`

## Repo map

| File | Purpose |
|------|---------|
| `README.md` | Entry point |
| `converter/` | Source code: CLI conversion tool |
| `plugin/` | **coc-vscode-loader plugin** |
| `plugin/README.md` | Plugin docs and usage |
| `AGENTS.md` | Dev instructions for AI agents |
| `coc-vscode-registry/` | Local clone of [coc-vscode-registry](https://github.com/coc-plugin/coc-vscode-registry) — registry.json, presets.json (for dev mode) |
| `docs/` | API mapping docs, converter design, migration guides |
| `docs/types/` | Type definitions (vscode.d.ts, coc.d.ts) for reference |

## Registry 添加规则

`coc-vscode-registry/registry.json` 是一个扁平数组（当前 122 条），按技术含量从高到低排列，同组内按 `name` 字母序插入。

### 排列逻辑

整体分为两大段：**非 snippets**（type 为 `pure-lsp` / `ts-bridge` / `direct-api`）在前，**snippets** 在后。非 snippets 段按技术含量从高到低分组：

```
LSP (binary / module / bridge) → direct-api (API polyfill)
```

### 非 snippets 段插入位置

按以下语言/工具类别分组，组内按 `name` 字母序插入：

```
1.  C/C++                    — clangd (binary)
2.  Rust                     — rust-analyzer (binary)
3.  Go                       — go (binary via goPackages)
4.  Python                   — pyright (module), ruff (binary)
5.  Angular                  — ng-language-service (module)
6.  Vue                      — volar (ts-bridge)
7.  JS/TS                    — eslint (module+patches), biome (binary), deno (binary)
8.  Svelte                   — svelte (module)
9.  Astro                    — astro (module)
10. CSS/Style                — tailwindcss (module), stylelint (module), css-peek (module), html-css-support (direct-api), css-modules (direct-api)
11. PHP                      — intelephense (module)
12. Config/Shell/Infra       — lua, yaml, prisma, ansible, bash-language-server, docker, taplo
13. Formatter                — prettier-vscode (direct-api)
14. Other tools              — gitignore (direct-api), shellcheck (direct-api)
```

### snippets 段插入位置

按以下类别分组，组内按 `name` 字母序插入：

```
1.  Vue
2.  React / Next.js / SolidJS
3.  Angular
4.  Svelte
5.  CSS / Bootstrap
6.  JS / TS
7.  Python
8.  PHP
9.  C / Rust
10. Flutter / Dart
11. Express / NestJS / Spring Boot
12. Testing (Jest, Cypress, Playwright)
13. Database (MySQL, PostgreSQL)
14. Uni-app
15. Game Dev (Unity, Unreal)
16. Other
```

新插件不属于任何现有组时放在对应段的 Other 组末尾。

### 必需字段

```json
{
  "name": "vscode-<short-name>",
  "displayName": "Human-readable name",
  "description": "Brief description of what the extension does",
  "type": "pure-lsp | ts-bridge | direct-api | snippets",
  "source": { "type": "github", "repo": "owner/repo" },
  "url": "https://github.com/owner/repo",
  "languages": ["lang1", "lang2"],
  "categories": ["LSP", "Formatter", "Completion", "Linter", "Snippets"],
  "convert": [{ "type": "source" | "language-client" | "bridge" | "snippets", ... }]
}
```

### 可选字段

| 字段 | 适用 type | 说明 |
|------|-----------|------|
| `minPluginVersion` | 全部 | 最低 coc-vscode-loader 版本，低于此版本的客户端会过滤掉该条目 |
| `serverBinary` | pure-lsp (binary kind) | GitHub Release 二进制下载配置，含 `repo`、`asset`、`binaryPath`、可选 `args` 和 `targetAssets` |
| `pipPackages` | pure-lsp | Python pip 依赖，pipeline 自动安装 |
| `goPackages` | pure-lsp | Go 包，pipeline 执行 `go install` 编译到 `server/` |
| `cargoPackages` | pure-lsp | Rust crate，pipeline 执行 `cargo install --root` 编译后复制到 `server/` |

### convert 字段说明

`convert` 是数组，按执行顺序排列：

- **`language-client`** — 生成 `src/index.ts`，创建 LanguageClient 连接语言服务器。适用于 `pure-lsp` 类型。`server.kind` 可选 `module`（npm 包）或 `binary`（可执行文件）。binary 类型需要设置 `server.binary`（repo/asset/binaryPath）和可选 `args`。
- **`source`** — 用 import-mapping 等 transform 转换 TypeScript 源码。可选，有则保留原扩展的部分功能。
- **`bridge`** — 桥接预设（目前只有 `ts-bridge` 用于 Volar）。
- **`snippets`** — 纯 Snippets 扩展，复制 snippets JSON 文件并生成空壳 `src/index.ts`。

### 插件特有文本补丁

- 插件级别的文本修复（如修复原扩展自身 bug）用 `patches` 字段
- 不要写在 converter 通用逻辑里
- 使用 `patches` 时设 `minPluginVersion: "1.4.3"`

### 命名规范

- 名称统一用 `vscode-<repository-short-name>` 格式
- `displayName` 用原扩展的 displayName
- `languages` 包含所有触发语言（遵守原扩展的 activationEvents）

## Converter transforms

| Transform | What it does |
|-----------|-------------|
| `import-mapping` | `from 'vscode'` → `from 'coc.nvim'` + text-level API polyfills |
| `class-to-factory` | `new Xxx()` → `Xxx.create()`, `new TextEdit()` → `TextEdit.replace()`, `new WorkspaceEdit()` → `({ changes: {} })` |
| `provider-register` | Adapt provider registration signatures |
| `enum-offset` | Comment on enum value differences |
| `language-client` | LanguageClient signature adaptation |

### `import-mapping` 文本级替换（text-level polyfills）

`import-mapping` 除了 AST 层的导入重写，还会对源码做文本替换来适配 coc.nvim 的 API 差异：

| 替换 | 原因 |
|------|------|
| `await import(...)` → `require(...)` | coc 扩展运行在 CJS 沙箱 |
| `createStatusBarItem(name, alignment, priority)` → `createStatusBarItem(priority)` | coc API 参数不同 |
| `LanguageStatusSeverity.xxx` → `2` | coc 无此类型 |
| `new StatusBar()` → no-op mock | VS Code status bar 接口差异 |
| `workspace.isTrusted` → `true` | coc 无工作区信任概念 |
| `new CodeAction()` → try-catch safe | coc 的 CodeAction 构造器可能不可用 |
| `CodeActionKind.SourceFixAll.append(...)` → string literal | coc 的 CodeActionKind 是 string 别名 |
| `window.activeTextEditor` → polyfill | coc 无此属性，注入运行时兼容层 |
| `window.onDidChangeActiveTextEditor` → `workspace.onDidOpenTextDocument` | coc 使用不同事件名 |
| `languages.createLanguageStatusItem(...)` → no-op | coc 无此 API |
| `window.showOpenDialog(...)` → `void 0` | coc 无文件选择对话框 |
| `registerDocumentFormatProvider(sel, provider)` → `(sel, provider, 1)` | 默认 priority=1 避免被 LanguageClient 覆盖 |
| `workspace.workspaceFolders[` → `(workspace.workspaceFolders \|\| [])[` | coc 可能返回 undefined |
| 自动补 `workspace`/`Uri` import | 引入新 API 后自动补全 import |

### `convert.ts` 通用文本替换

converter 主流程在步骤执行后还会对所有输出源文件做一轮通用文本替换：

| 替换 | 原因 |
|------|------|
| `.fileName` → `Uri.parse($1.uri).fsPath` | coc 的 TextDocument 无 fileName 属性。加 `(?<![\w$])` negative lookbehind 避免匹配 `_document.fileName` |
| `{ fileName } = doc` 解构拆分 | 同上，处理解构写法 |
| `.uri.fsPath` → `Uri.parse($1.uri).fsPath` | coc 的 uri 是 file:// URI 字符串。要求首字符为 `[a-zA-Z_$]` 避免匹配 `0.uri.fsPath` |
| `getWordRangeAtPosition` → 内联实现 | coc 无此 API |
| `Location.create(Uri.file($1), $2)` → `Location.create($1, Range.create($2, $2))` | coc 的 Location.create 接受 `(string, Range)`，非 `(Uri, Position)` |
| `Uri`/`Range` 自动注入 import | 命名空间 import 无法用解构注入，自动补 `import { Uri }`/`import { Range }` |
| `(?:vscode\.)?workspace\.workspaceFolders` guard | 处理 `vscode.` 前缀，避免产生 `vscode.(...)` 语法错误 |
| `new WorkspaceEdit()` → `({ changes: {} })` | coc 的 WorkspaceEdit 是 interface，不可 new。第一参数含 `.uri` 的 `.set(uri, edits)` 同时转为 `.changes[uri] = edits` |

### 插件级文本补丁 `patches`（v1.4.2+）

插件特有的文本替换（如修复原扩展自身 bug）应通过 registry 的 `patches` 字段声明，不污染通用 converter：

**类型一：源码层 patches（source step）**

对转换后的 TypeScript/JavaScript 源文件做文本替换，在通用替换之后、写文件之前依次执行。

```json
{
  "type": "source",
  "transforms": ["import-mapping", "class-to-factory", "provider-register"],
  "patches": [
    { "find": "\\\\[a-zA-Z0-9\\\\._\\\\[\"']\\\\]", "replace": "[a-zA-Z0-9._[\"'-]" }
  ]
}
```

- `find`：RegExp 源的**转义后**字符串（与 `new RegExp(find, 'g')` 兼容）
- `replace`：替换文本

**类型二：Server 编译后 patches（language-client step）**

对 local language server 编译后的 JS 输出文件做文本替换，在 `tsc` 编译完成后、`esbuild` 打包之前执行。适用于修复 server 端 behavior（如禁用 pull diagnostics、注入事件钩子等）。

```json
{
  "type": "language-client",
  "server": {
    "kind": "module",
    "package": "../server/out/eslintServer.js",
    "patches": [
      {
        "file": "eslintServer.js",
        "find": "connection\\.listen\\(\\);",
        "replace": "connection.listen();\ndocuments.onDidOpen(...)..."
      }
    ]
  }
}
```

- `file`：相对于 `server/out/` 的文件路径（如 `"eslintServer.js"`、`"eslint.js"`）
- `find`：RegExp 源的**转义后**字符串
- `replace`：替换文本
- 所有 patch 通过 `server-patches.json` 写入 build 目录，由生成的 `esbuild.mjs` prebuild 段在构建时读取执行

### `class-to-factory` 的命名空间映射

部分 coc.nvim 类型是 interface（非 class），且 namespace 函数名不是 `.create()`：

| VS Code | coc.nvim | 原因 |
|---------|----------|------|
| `new TextEdit(range, text)` | `TextEdit.replace(range, text)` | coc 的 TextEdit 是 interface，只有 `TextEdit.replace/insert/del` |
| `new WorkspaceEdit()` | `({ changes: {} })` | coc 的 WorkspaceEdit 是 interface，不可 new |

通过 `NAMESPACE_MAP` 配置（`class-to-factory.ts`），新增类型只需添加一行映射：

```typescript
const NAMESPACE_MAP: Record<string, string> = {
  'TextEdit': 'TextEdit.replace',
}
```

`WorkspaceEdit` 不是通过 `NAMESPACE_MAP` 处理，而是在 `class-to-factory.ts` 和 `convert.ts` 的文本回退中做文本级替换：`new WorkspaceEdit()` → `({ changes: {} })`，同时 `.set(uri, edits)` → `.changes[uri] = edits`（在 `convert.ts` 的通用文本替换阶段）。

**Bridge preset system** (`converter/src/presets.ts` + `converter/src/steps/bridge.ts` + `coc-vscode-registry/presets.json`):
- Bridge logic is not used for source-based plugins
- Currently only `ts-bridge` preset exists for TypeScript bridge plugins (Volar)
- Adding a new bridge type: add preset definition in `converter/src/presets.ts`, code template in `converter/src/steps/bridge.ts` `BRIDGE_TEMPLATES`, and entry in [`coc-vscode-registry/presets.json`](https://github.com/coc-plugin/coc-vscode-registry/blob/main/presets.json)

## coc-tsserver PR

- PR: https://github.com/neoclide/coc-tsserver/pull/493
- Changes: `globalPlugins` + `pluginPaths` in configure, `typescript.tsserverRequest` command
- Pre-merge: `npm install ChuYanLon/coc-tsserver`

## Loader plugin

`plugin/` is a coc.nvim plugin that provides a TUI to install/update/uninstall converted plugins.

### Architecture

| File | Description |
|------|-------------|
| `src/index.ts` | Plugin entry + 8 CocCommands |
| `src/tui.ts` | TUI window management + rendering + key dispatch |
| `src/state.ts` | State management (debounced rendering) |
| `src/registry.ts` | Remote registry fetch + disk cache + version compatibility filter |
| `src/pipeline.ts` | Real install/update/uninstall flow (git / npx tsx / npm / node / cp) + pip install + go install + cargo install + binary server download + code patching (documentSelector, client.start guard) |
| `src/renderer.ts` | LineBuffer render engine (inspired by lazy.nvim) |

### Version compatibility (minPluginVersion)

Registry entries can specify `minPluginVersion` (e.g. `"1.1.2"`) to require a minimum `coc-vscode-loader` version.
- `registry.ts` reads plugin version from `package.json` at runtime via `pluginVersion()`
- `getAllPackages()` filters out entries whose `minPluginVersion` > current version
- Old plugin versions never see incompatible entries in the TUI
- Adding entries to the remote registry before release is safe — old clients will not see them

### TUI features

- Floating window, no border
- lazy.nvim-inspired render engine: per-segment `append(text, hl)` + extmark highlights
- 9 custom `CocConverter*` highlight groups linked to theme standard groups
- **Top buttons**: `coc-loader(H)` (Home)  `Install(I)`  `Update(U)`  `Check(C)`  `Help(?)`
- **Package operations**: `i` install `u` update `X` uninstall `R` reinstall `<CR>` detail popup
- **Filter & sort**: `f` cycle filter `s` cycle sort
- **Navigation**: `j`/`k` virtual scroll, `gg`/`G` first/last, `/` search
- **Batch**: `U` update all (max 3 concurrent)
- **Update check**: `C` git ls-remote compares commits, shows `↑` when outdated
- **Other**: `q` close / `<Esc>` close (language filter→search→busy guard)
- **Detail popup**: centered float window with syntax highlights — shows package info (installed/available) or live install log with full command output (active/failed)
- **Progress**: inline `[step/total]` status on package line
- **Registry auto-fetch**: remote registry fetched in background when TUI opens
- **Binary server support**: auto-download + extract (.zip, .gz, .tar.gz) server binaries from GitHub Releases, patch generated code for command-mode startup, fix documentSelector and activationEvents
- **Pip packages**: auto-install Python dependencies via pip (e.g. ansible-lint), only uses `--break-system-packages` on Linux
- **Go packages**: auto-install Go language servers via `go install` (e.g. gopls), binary placed in `server/` directory
- **Cargo packages**: auto-install Rust language servers via `cargo install --root` (e.g. nil), binary placed in `server/` directory
- **Global extensions**: `g:coc_loader_global_extensions` auto-installs extensions on activation
- **Smart name resolution**: `findPackage()` matches by exact name, displayName, or auto-prepends `vscode-` prefix
- **Auto-check updates**: silent check on startup, notifies only when updates found
- **Cache cleanup**: `loader.cleanCache` removes source/build directories
- **Export package list**: `loader.list` copies installed package names to clipboard

### Commands

| Command | Action |
|---------|--------|
| `:CocCommand loader.open` | Open TUI |
| `:CocCommand loader.install <name>` | Install a package |
| `:CocCommand loader.uninstall <name>` | Uninstall a package |
| `:CocCommand loader.update <name>` | Update a package |
| `:CocCommand loader.reinstall <name>` | Reinstall a package |
| `:CocCommand loader.uninstallAll` | Uninstall all (with confirm) |
| `:CocCommand loader.updateRegistry` | Fetch latest registry from remote |
| `:CocCommand loader.cleanCache` | Clean build cache for all packages |
| `:CocCommand loader.list` | List installed packages and copy to clipboard |

### Build

```bash
cd plugin
npm install
npm run build    # esbuild → lib/index.js
```

### Switch to local dev mode

```bash
bash switch.sh local    # symlink → plugin/
bash switch.sh npm      # revert to npm release
bash switch.sh status   # check current mode
```

After switching, restart coc: `:CocRestart`

### Install

```bash
cd ~/.config/coc/extensions
npm install coc-vscode-loader    # or
:CocInstall coc-vscode-loader
```

## Milestones

| Milestone | Target | Description |
|-----------|--------|-------------|
| [v1.3.0](https://github.com/coc-plugin/coc-vscode-loader/milestone/1) | 2026-06 | Registry expansion: PHP Intelephense, Rust Analyzer, ESLint |
| [v1.4.0](https://github.com/coc-plugin/coc-vscode-loader/milestone/2) | 2026-08 | More transforms, bridge presets, registry expansion |
| [v1.5.0](https://github.com/coc-plugin/coc-vscode-loader/milestone/4) | 2026-06 | Go/Cargo source install, `installToCoc` optimization, registry expansion |
| [v2.0.0](https://github.com/coc-plugin/coc-vscode-loader/milestone/3) | 2026-12 | Stable ecosystem: 10+ plugins, full transform coverage |

## `excludeDeps`（v1.5.7+）

`excludeDeps` 用于从源扩展的 `dependencies`/`devDependencies` 中排除不需要的包名，配合 `keepDeps` 精确控制输出 `package.json` 的依赖。

```json
{
  "type": "source",
  "excludeDeps": ["vsls", "@wdio", "husky", "tslint", "live-server"],
  "keepDeps": { "live-server": "^1.2.2", "http-shutdown": "^1.2.0" }
}
```

- `excludeDeps` 是字符串数组，支持前缀匹配（如 `@wdio` 会排除 `@wdio/cli`、`@wdio/local-runner` 等）
- `keepDeps` 中同名的 dep 会被重新加入，用于替换源扩展中错误的版本号或文件路径（如 `"file:lib\\live-server"`）

## keepDeps 版本解析策略（Converter v2.0）

`keepDeps` 的版本解析采用三步降级：

1. 源插件 `package.json` 的 `dependencies` → 找到则用
2. 源插件 `package.json` 的 `devDependencies` → 找到则用
3. 向上查找 workspace root `package.json`（monorepo 场景）
4. 全部失败 → 报错

若自动解析无法满足，registry 配置可改用对象语法手动指定版本号：

```json
"keepDeps": {
  "lodash": "^4.17.21",
  "@vue/language-core": "workspace:*"
}
```

数组语法（自动解析）和对象语法（手动指定）互斥。

### `snippets` step type（v1.3.0+）

用于纯 VS Code Snippets 扩展（无代码、无 LSP，只有 `contributes.snippets` JSON 文件）。

**核心原则**：coc-snippets 通过 **`package.json` 的 `contributes.snippets`** 发现片段文件（读取 `textmateProvider.ts:loadSnippetDefinition()`），不是通过目录名匹配。所以必须保留原始 `contributes.snippets` 声明和文件相对路径。

转换逻辑：
1. 读源 `package.json` 的 `contributes.snippets` → 得到 `{language → path}` 映射
2. 把每个 snippet JSON 文件复制到输出的**相同相对路径**（如 `./snippets/snippets.json` → `output/snippets/snippets.json`）
3. 生成空壳 `src/index.ts`（`export function activate() {}`）
4. `convert.ts` 保留 `origPkg.contributes.snippets` 到输出 `package.json`

Registry 条目示例：
```json
{
  "name": "vscode-javascript-snippets",
  "displayName": "JavaScript ES6 Snippets",
  "type": "snippets",
  "source": { "type": "github", "repo": "xabikos/vscode-javascript" },
  "languages": ["javascript"],
  "categories": ["Snippets"],
  "convert": [{ "type": "snippets" }]
}
```

实现文件：`converter/src/steps/snippets.ts`，在 `steps/index.ts` 注册。
`convert.ts` 中新增 `contributes.snippets` 的透传（在 package.json 生成阶段保留原声明）。

## Converter 关键模块

### Local server 支持（v1.4.2+）

当 language server 是源码中本地子目录（而非已发布 npm 包），可在 `server.package` 使用相对路径：

```json
{
  "type": "language-client",
  "server": {
    "kind": "module",
    "package": "../server/out/server"
  },
  "languages": ["css", "scss", "less"]
}
```

本地 server 的处理方式：
- **代码生成**：`require.resolve` + `path.join` 回退（无 npm 特有的 bin walking / package.json fallback）
- **Build**：esbuild.mjs 自动安装 `@types/node`、编译 `server/` 下的 TypeScript
- **Pipeline**：`buildPackage()` 自动从 source 拷贝 `server/` 目录到 build 目录
- **Hover fallback**：对 local server 自动注册直接 hover provider，先试 `textDocument/hover`，失败则从 `textDocument/definition` 结果读文件构造 hover 内容（语言标签从扩展名自动识别）

注意：`server/` 目录需要有自己的 `package.json` 和 `tsconfig.json`。

### `binName` 字段（v1.2.0+）

当 `server.kind === "module"` 且 `entry === "bin"` 时，可用 `binName` 指定 bin 字段的某个具体入口。适用于 `bin` 有多个值的包（如 `@tailwindcss/language-server` 有 `css-language-server` 和 `tailwindcss-language-server` 两个 bin）。

```json
{
  "kind": "module",
  "package": "@tailwindcss/language-server",
  "entry": "bin",
  "binName": "tailwindcss-language-server"
}
```

### 无 main 字段回退（v1.2.2+）

`entry: "bin"` 的解析逻辑：优先 `require.resolve(pkg)`，失败则回退到 `require.resolve(pkg/package.json)`。这对没有 `main` 字段只通过 `bin` 暴露入口的包（如 `@tailwindcss/language-server`）是必需的。

> 注意：`binName` 本身在 v1.2.0 可用，但无 main 字段回退在 v1.2.2 才加入。需要同时使用两者的 registry 条目（如 tailwindcss）应设 `minPluginVersion: "1.2.2"`。

### `args` 字段（v1.4.3+）

当 `server.kind === "module"` 时，可用 `args` 指定启动 language server 时传入的 CLI 参数（之前仅 `binary` kind 支持）。

```json
{
  "kind": "module",
  "package": "@angular/language-server",
  "entry": "bin",
  "binName": "ngserver",
  "args": [
    "--ngProbeLocations",
    "{pluginDir}",
    "--tsProbeLocations",
    "{pluginDir}",
    "--logToConsole"
  ]
}
```

支持以下占位符，会在代码生成时替换为运行时表达式：

| 占位符 | 运行时值 |
|--------|----------|
| `{dir}` | `__dirname`（编译输出目录） |
| `{pluginDir}` | `require('path').resolve(__dirname, '..')`（插件根目录） |

生成的 serverOptions 包含 `args` 数组：
```typescript
{ module: serverPath, transport: TransportKind.ipc, args: ['--ngProbeLocations', require('path').resolve(__dirname, '..'), ...] }
```

### `targetAssets` 字段（v1.5.0+）

当 GitHub Release 的二进制文件命名**因平台而异**（如 clangd 用 `mac`/`windows` 而非 `darwin`/`win32`），可用 `targetAssets` 覆盖默认的 `asset`/`binaryPath`：

```json
{
  "serverBinary": {
    "repo": "clangd/clangd",
    "asset": "clangd-linux-{{version}}.zip",
    "binaryPath": "clangd_{{version}}/bin/clangd",
    "targetAssets": [
      { "platform": "darwin", "file": "clangd-mac-{{version}}.zip", "binaryPath": "clangd_{{version}}/bin/clangd" },
      { "platform": "linux",  "file": "clangd-linux-{{version}}.zip", "binaryPath": "clangd_{{version}}/bin/clangd" },
      { "platform": "win32",  "file": "clangd-windows-{{version}}.zip", "binaryPath": "clangd_{{version}}/bin/clangd.exe" }
    ]
  }
}
```

匹配规则：按 `platform` + `arch` 查找，找到则用该条目的 `file` 和 `binaryPath`；不匹配则回退到顶层 `asset`/`binaryPath`。

| 字段 | 必需 | 说明 |
|------|------|------|
| `platform` | ❌ | 目标平台，`"darwin"` \| `"linux"` \| `"win32"`，缺省匹配所有 |
| `arch` | ❌ | 目标架构，`"x64"` \| `"arm64"`，缺省匹配所有 |
| `file` | ✅ | 该平台的 asset 文件名模板 |
| `binaryPath` | ❌ | 该平台的压缩包内二进制路径 |

## Pending

- [x] Angular Language Service (`vscode-ng-language-service`) — added to registry
- [x] `args` field for module-kind language servers — supports `{dir}` and `{pluginDir}` placeholders
- [x] ESLint added to registry (with server patches: diagnostic injection, pull diagnostics disabled, resolveSettings fix)
- [x] `server.patches` — local server 编译后文本补丁通用机制（v1.4.5+）
- [ ] Add more plugins to registry (Code Spell Checker)
- [ ] Add `vscode-languageclient` import rewrite to `import-mapping` transform
- [ ] Add more transforms (uri-mapping, more provider signatures)
- [ ] Add python-bridge / rust-bridge preset examples
- [ ] Implement keepDeps workspace root lookup for monorepo (step 3)
- [ ] Implement keepDeps object syntax fallback
- [x] `serverBinary` raw binary download: handled for non-archive assets (e.g. Biome)
- [x] JavaScript extension support (`.js` file copy + text-level replacements, `require('vscode')` → `require('coc.nvim')`)
- [x] Language-client step `initializationOptions` field (tsdk for Volar-based servers)
- [x] `snippets` step type — 纯 snippets 扩展自动转换
- [x] 20 snippet extensions 已录入 registry
- [x] Local server support — `server.package` 支持相对路径，自动编译 `server/` TypeScript、pipeline 自动拷贝
- [x] Pyright (`vscode-pyright`) — 加入 registry，module kind 自动安装 pyright npm 包
- [x] Go LSP (`vscode-go`) — 加入 registry，goPackages 支持自动 go install gopls
- [x] `targetAssets` — serverBinary per-platform 资产映射，支持非标准平台命名
- [x] `installToCoc` 优化 — 跳过 node_modules，选择性复制 + 重新 npm install
- [x] Code Runner (`vscode-code-runner`) — 加入 registry, direct-api, 12 patches

## TUI design

TUI 完全参照 Mason.nvim 的视觉风格和交互设计，目标 1:1 一致。详见 [`docs/tui-design.md`](./docs/tui-design.md)。

关键设计决策：
- Mason 色彩精确复制（金色 #DCA561 + 青色 #56B6C2 + 灰色 #888888）
- Mason 窗口选项一致（无 border、80%宽、90%高、backdrop 遮罩）
- Sections 按状态分组：Failed → Installing → Installed → Available
- Tabs 使用数字键 1-9 切换，格式 ` (N) Name `
- 包行：`◍ displayName`，展开详情/日志内联显示
- 不保留 Mason 没有的功能

### Mason 功能映射

- Header 金色居中 + `g?` 提示 ✓
- 安装/更新/卸载/检查更新 ✓
- `<CR>` 内联展开详情/日志 ✓
- 缩进链: 4sp→6sp→8sp ✓
- `<C-f>` 语言筛选: 预留
- `<C-c>` 取消安装: 待实现
- [x] `rimraf` 容错 — 删除前 chmod -R u+w，处理 Go 模块缓存只读目录

### goPackages / cargoPackages（v1.5.0+）

当 language server 不是 npm 包也没有 GitHub 预编译二进制时，可用源码编译安装：

| 字段 | 机制 | 示例 |
|------|------|------|
| `goPackages` | Pipeline 执行 `go install`，`GOBIN` 指向 `server/`，二进制直接输出到 `server/` | `["golang.org/x/tools/gopls@latest"]` |
| `cargoPackages` | Pipeline 执行 `cargo install --root`，从临时目录复制二进制到 `server/` | `[{ "crate": "nil", "binary": "nil" }]` |

Go/Cargo 编译缓存在 `build/.gopath/` 和 `build/.cargo-root/`，安装完成后自动清理。

### Pipeline 健壮性改进（v1.5.0+）

- **`rimraf` 容错**：删除前先 `chmod -R u+w`，处理 Go 模块缓存的 0555 只读目录
- **`cpdir` 改用 `fs.cp`**：Node.js 原生递归复制，正确处理符号链接和权限
- **`installToCoc` 优化**：只复制 `lib/`、`server/`、`package.json` 等必要文件，跳过 `node_modules/`，到目标目录后重新 `npm install`，避免 `cp -rL` 在大 `node_modules` 上的问题

## Testing

Every source file must have a corresponding `.test.ts` file. Run before pushing:

```bash
npm test                    # Unit tests (162) + check-tests + fixture tests
npm run test:full           # Unit tests + diff:check (registry baseline comparison)
npm run test:smoke          # Registry smoke test (converts all 128 entries, validates output + tsc --noEmit)
```

**Pre-push hook** runs `npm test` + `npm run test:smoke`. CI runs unit tests on push/PR (Node 20/22), then diff check, then smoke test.

### Fixture tests

Per-transform input/output pairs in `converter/src/__fixtures__/<transform>/<case>/`:

| Transform | Fixtures | What's tested |
|-----------|----------|---------------|
| `import-mapping` | 21 | `require('vscode')`, `createStatusBarItem`, `new CodeAction`, `workspace.isTrusted`, `window.activeTextEditor`, `editor.setDecorations`, `workspaceFolders` guard, etc. |
| `class-to-factory` | 8 | `new Position`/`new TextEdit`/`new WorkspaceEdit` → factory calls |
| `provider-register` | 6 | Provider renames, `registerCompletionItemProvider` signature adaptation |

Add a new fixture: create `<case>/input.ts` + `<case>/output.ts` in the appropriate transform directory. The test is auto-discovered.

After changing a transform's implementation, regenerate fixture outputs:
```bash
npx tsx scripts/gen-fixtures.ts
```

### Pipeline fixtures

Full `convert()` pipeline tests in `converter/src/__fixtures__/pipeline/<case>/`.
Tests `convert.ts` text replacements (`.uri.fsPath`, `Location.create`, `getWordRangeAtPosition`, WorkspaceEdit polyfill, etc.) on realistic multi-pattern source files.

After changing `convert.ts` text replacements:
```bash
npx tsx scripts/gen-pipeline-fixtures.ts
```

### Registry baseline diff (`converter/baseline.json`)

**Purpose**: Detect unintended side effects when changing converter code. Stores SHA-256 hashes of every converted output file for all 128 registry entries.

**Workflow**:

```bash
# Before changing converter code — capture current output
npm run diff:baseline

# Change converter code (transforms, text replacements, etc.)

# Check what changed
npm run diff:check
# → Reports which entries differ from baseline, and which files changed
# → Exits 1 only if REAL output changes detected (download errors ignored)

# If changes are intended (e.g. you fixed a bug)
npm run diff:baseline     # Update baseline
git add converter/baseline.json
git commit -m "..."

# If changes are unintended
# → Review and fix your converter code
```

**How it works**:
- `diff:baseline` — converts all 128 entries, hashes all output `.ts`/`.js`/`package.json`/`esbuild.mjs` files with SHA-256, writes to `converter/baseline.json`
- `diff:check` — reconverts entries, compares hashes against stored baseline, reports differences
- Source repos cached in `~/.cache/coc-converter-smoke/`

**Source commit tracking** (prevents false positives in CI):
Each baseline entry stores the source repo's `HEAD` commit hash in `_source.commit`.
When `diff:check` runs, it compares the current source commit against the stored one.
If the source repo has changed (upstream `main` advanced), the entry is **skipped** — not failed.
Only entries whose source is exactly the same as when baseline was generated are compared.

```json
{
  "vscode-prettier": {
    "_source": { "repo": "prettier/prettier-vscode", "commit": "abc123def..." },
    "src/index.ts": "sha256hash..."
  }
}
```

**CI integration**:
- `diff` job runs after `unit`, before `smoke`
- Shares repo cache with `smoke` job
- Fails CI only if converter changes affect entries with the same source code
- Entries whose source repo changed since baseline → skipped (not failure)
- Download errors (transient network issues) → skipped (not failure)

**When baseline becomes stale** (upstream plugin repos changed):
```bash
npm run diff:baseline     # Refresh baseline with current source
git add converter/baseline.json
git commit -m "chore: update baseline"
```

### check-tests enforcement

| Check | Trigger |
|-------|---------|
| `MISSING TEST` | Source file has no `.test.ts` |
| `EMPTY TEST` | Test file < 50 bytes |
| `NO TEST CASES` | Test file has no `it(` or `test(` calls |

### Smoke test cache

Repos cached in `~/.cache/coc-converter-smoke/`. Uses `git fetch --depth 1` for incremental updates.

```bash
NO_CACHE=1 npm run test:smoke    # Force re-download all repos
CACHE_TTL=1 npm run test:smoke   # Re-download repos older than 1 day
```

## Type sync workflow

- Type definitions (`vscode.d.ts`, `coc.d.ts`) are auto-synced daily to [`docs/types/`](./docs/types/)
- The sync CI workflow and script live in [coc-vscode-registry](https://github.com/coc-plugin/coc-vscode-registry)
- **Do not manually edit type files**

## GitHub image cache

When updating images in `README.md` (e.g. `plugin/assets/tui-preview.png`), GitHub's CDN (`raw.githubusercontent.com`) caches aggressively. Always append a cache-busting query parameter to the URL:

```markdown
<img src="https://raw.githubusercontent.com/coc-plugin/coc-vscode-loader/main/plugin/assets/tui-preview.png?v=<version>">
```

Use the current version number (e.g. `v=1.5.5`) as the parameter value so it changes with each release. Do NOT use timestamps or random values — version numbers are meaningful and auto-increment.
