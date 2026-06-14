# AGENTS.md — vscode-coc-loader

## What this repo is

Reference documentation for migrating VS Code extensions to coc.nvim + **converter CLI** (`converter/`) that automatically converts VS Code extensions to coc plugins.

## Platform

**Supported OS**: Linux, macOS. **Windows not supported.**

External commands required at runtime:
- `git`, `node`/`npm`/`npx` (Node.js >= 18), `curl`, `unzip`, `tar`/`gunzip`
- `python3` + `pip` (only if plugin has `pipPackages` in registry)
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

## Converter transforms

| Transform | What it does |
|-----------|-------------|
| `import-mapping` | `from 'vscode'` → `from 'coc.nvim'` + text-level API polyfills |
| `class-to-factory` | `new Xxx()` → `Xxx.create()` |
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
| `.fileName` → `Uri.parse($1.uri).fsPath` | coc 的 TextDocument 无 fileName 属性 |
| `{ fileName } = doc` 解构拆分 | 同上，处理解构写法 |
| `.uri.fsPath` → `Uri.parse($1.uri).fsPath` | coc 的 uri 是 file:// URI 字符串 |
| `getWordRangeAtPosition` → 内联实现 | coc 无此 API |

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
| `src/pipeline.ts` | Real install/update/uninstall flow (git / npx tsx / npm / node / cp) + pip install + binary server download + code patching (documentSelector, client.start guard) |
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
- **Package operations**: `i` install `u` update `X` uninstall `R` reinstall `<CR>` toggle details/logs
- **Mark & filter**: `x` toggle mark `f` cycle filter `s` cycle sort
- **Navigation**: `gg` / `G` jump to first / last package
- **Batch**: `U` update all (max 3 concurrent) `Z` uninstall all `D` cleanup orphaned
- **Update check**: `C` git ls-remote compares commits, shows `↑` when outdated
- **Other**: `/` search `q` close / `<Esc>` step-by-step cancel (help→search→marks→busy guard→close)
- **Detail view**: description / type / commit / source / languages / categories / homepage / serverBinary
- **Install logs**: `▶` compact line → `<CR>` expand full log with commands
- **Progress**: `[step/total]` + status text
- **Registry auto-fetch**: remote registry fetched in background when TUI opens
- **Binary server support**: auto-download + extract (.zip, .gz, .tar.gz) server binaries from GitHub Releases, patch generated code for command-mode startup, fix documentSelector and activationEvents
- **Pip packages**: auto-install Python dependencies via pip (e.g. ansible-lint), only uses `--break-system-packages` on Linux

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
| [v1.2.0](https://github.com/coc-plugin/coc-vscode-loader/milestone/1) | 2026-08 | Registry expansion: Angular, ESLint, YAML, etc. |
| [v1.3.0](https://github.com/coc-plugin/coc-vscode-loader/milestone/2) | 2026-10 | More transforms & bridge presets |
| [v2.0.0](https://github.com/coc-plugin/coc-vscode-loader/milestone/3) | 2026-12 | Stable ecosystem: 10+ plugins, full transform coverage |

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

### `snippets` step type（v1.2.6+）

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
  "name": "javascript-snippets",
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

## Pending

- [ ] Add more plugins to registry (ESLint, Angular, Code Spell Checker)
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

## Type sync workflow

- Type definitions (`vscode.d.ts`, `coc.d.ts`) are auto-synced daily to [`docs/types/`](./docs/types/)
- The sync CI workflow and script live in [coc-vscode-registry](https://github.com/coc-plugin/coc-vscode-registry)
- **Do not manually edit type files**
