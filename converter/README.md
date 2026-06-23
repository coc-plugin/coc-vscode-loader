# converter — vscode → coc converter prototype

CLI tool that automatically converts VS Code extensions to coc.nvim plugins.

## Usage

```bash
# Create a convert config (describe how to transform the plugin)
echo '[{"type":"source","transforms":["import-mapping"],"entry":"src/extension.ts"}]' > convert.json

# Convert a VS Code extension directory
npx tsx src/cli.ts convert ./vscode-ext/ -o ./coc-ext/ --convert-file convert.json

# Build and install to coc
cd ./coc-ext && npm install && node esbuild.mjs
cd ~/.config/coc/extensions && npm install /path/to/coc-ext
```

## Verified conversions

| Plugin | Type | Notes |
|--------|------|-------|
| Volar (Vue) | TS bridge | Requires modified coc-tsserver |
| Prisma | Pure LSP | Auto-detects bin entry |
| HTML CSS Support | Direct API | Handles API differences |
| Deno | Pure LSP | Binary server download |
| TOML (Taplo) | Pure LSP | Binary server download |
| Ansible | Pure LSP | npm package server + pip install |
| Live Server | Direct API | Source transforms + patches (excludeDeps, workspace.saveAll, activeTextEditor polyfill) |
| YAML | Pure LSP | npm package server |
| Tailwind CSS | Pure LSP | npm package server, bin entry |
| Biome | Pure LSP | Binary server download |
| Stylelint | Pure LSP | npm package server |
| Prettier | Direct API | Source transforms |
| Svelte | Pure LSP | npm package server |
| Astro | Pure LSP | npm package server |
| Lua | Pure LSP | Binary server download |
| gitignore | Direct API | Source transforms |
| CSS Peek | Pure LSP | Local server (TypeScript source in `server/`) |
| Angular Language Service | Pure LSP | npm package server (`@angular/language-server`), `binName` + `args` with `{pluginDir}` |
| Pyright | Pure LSP | npm package server (`pyright` → `pyright-langserver`), `binName` |
| Go | Pure LSP | Source-compiled binary server (`go install gopls`) |
| Docker | Pure LSP | npm package server (`dockerfile-language-server-nodejs`) |
| Bash IDE | Pure LSP | npm package server (`bash-language-server`) |
| clangd | Pure LSP | Binary server with per-platform assets (`targetAssets`) |

See the [registry](https://github.com/coc-plugin/coc-vscode-registry) for the full list and latest status.

### Plugin types

| Type | Description | Approach | Example |
|------|-------------|----------|---------|
| **TS bridge** | Language plugins depending on TypeScript LSP | Generate `tsserver/request` bridge + `typescriptServerPlugins` | Volar |
| **Pure LSP** | Standard LSP using LanguageClient | Generate LanguageClient entry + server dependency injection | Prisma |
| **Direct API** | Direct coc.nvim API calls (no LanguageClient) | Source transforms, keep original extension.ts | HTML CSS Support |
| **Snippets** | 纯 VS Code Snippets（无代码） | 复制 JSON 文件 + 生成空壳入口 | vue-snippets |

TS bridge plugins require a modified coc-tsserver ([PR #493](https://github.com/neoclide/coc-tsserver/pull/493)):

```bash
cd ~/.config/coc/extensions
npm install ChuYanLon/coc-tsserver --legacy-peer-deps
```

## Local server support

当 language server 是源码中本地子目录（非 npm 包），可在 `server.package` 使用相对路径：

```json
{ "kind": "module", "package": "../server/out/server" }
```

自动处理：
- 简化代码生成（无 bin walking）
- esbuild.mjs 自动安装 `@types/node` + 编译 server TypeScript
- pipeline 自动拷贝 server 目录
- 注册 hover fallback provider

### Server patches (`server.patches`, v1.4.5+)

对 local server 编译后的 JS 输出文件做文本替换，适用于修复 server 端 behavior（如禁用 pull diagnostics、注入事件钩子等）。通过 registry 的 `server.patches` 声明：

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

- `file`：相对于 `server/out/` 的文件路径
- `find`：RegExp 源的转义后字符串（与 `new RegExp(find, 'g')` 兼容）
- `replace`：替换文本
- 所有 patch 通过 `server-patches.json` 写入 build 目录，由 `esbuild.mjs` prebuild 段在构建时读取执行

## Source-compiled server support (v1.5.0+)

当 language server 是 Go 或 Rust 项目时，pipeline 可用源码编译安装：

| 字段 | 机制 | 示例 |
|------|------|------|
| `goPackages` | Pipeline 执行 `go install`，`GOBIN` 指向 `server/` | `["golang.org/x/tools/gopls@latest"]` |
| `cargoPackages` | Pipeline 执行 `cargo install --root`，从临时目录复制二进制到 `server/` | `[{ "crate": "nil", "binary": "nil" }]` |

详见 [AGENTS.md](../AGENTS.md#gopackages--cargopackagesv150)（goPackages/cargoPackages）和 [AGENTS.md](../AGENTS.md#%E6%8F%92%E4%BB%B6%E7%BA%A7%E6%96%87%E6%9C%AC%E8%A1%A5%E4%B8%81-patchessource-step)（patches）。

## Architecture

```
Input: VS Code extension directory
  │
  ├─ 1. Scanner    Detect files using VS Code API (`from 'vscode'` / `require('vscode')`)
  │
  ├─ 2. Steps pipeline (逐步骤执行，每个步骤注册为 generator)
  │   ├─ language-client    Generate LanguageClient (module/binary server)
  │   ├─ source             Copy + apply transforms (见下方)
  │   ├─ bridge             Generate bridge code (BRIDGE_TEMPLATES)
  │   ├─ snippets           Copy snippets JSON + 生成空壳 activate()
  │   └─ mark-unsupported   Remove unsupported API calls
  │
  │   source 内部调用的 transforms:
  │   ├─ import-mapping     from 'vscode' → from 'coc.nvim' + 文本 polyfills
  │   ├─ class-to-factory   new Xxx() → Xxx.create() / TextEdit.replace()
  │   ├─ provider-register  Adapt provider registration signatures
  │   ├─ enum-offset        Comment on enum value offsets
  │   └─ strip-volar        Remove Volar framework imports
  │
  ├─ 3. Text replacements (convert.ts 对所有输出文件执行)
  │   ├─ .fileName → Uri.parse($1.uri).fsPath
  │   ├─ .uri.fsPath → Uri.parse($1.uri).fsPath
  │   ├─ getWordRangeAtPosition → inline polyfill
  │   ├─ Location.create(Uri.file(x), y) → Location.create(x, Range.create(y, y))
  │   ├─ new WorkspaceEdit() → ({ changes: {} })
  │   ├─ .set(uri, edits) → .changes[uri] = edits
  │   └─ 自动注入 Uri/Range import
  │
  ├─ 4. Plugin patches   Registry 中声明的 per-entry find/replace
  │
  ├─ 5. Generate output files
  │   ├─ src/index.ts + src/bridge.ts（language-client / bridge 生成）
  │   ├─ package.json（dependencies, activationEvents, typescriptServerPlugins）
  │   ├─ esbuild.mjs（含 server TypeScript 编译）
  │   ├─ coc-convert.json（转换元信息）
  │   └─ server-patches.json（server 编译后补丁）
  │
  └─ 6. Output coc plugin directory + 转换报告
```

## Bridge preset system

Bridge logic lives in `converter/src/steps/bridge.ts`, driven by `BRIDGE_TEMPLATES`:

```typescript
// bridge.ts - all bridge templates defined here
const BRIDGE_TEMPLATES = {
  'tsserver-forward': (opts) => ({
    code: `client.onNotification('tsserver/request', ...)`,
    injectExts: opts.extensions || [],
    injectSvcs: opts.services || [],
    callAfter: 'registerBridge(context, client)',
    extraDeps: ['typescript'],
  }),
}
```

Bridge presets are defined in [`coc-vscode-registry/presets.json`](https://github.com/coc-plugin/coc-vscode-registry/blob/main/presets.json) and map to safe, audited templates in `bridge.ts`. Adding a new bridge type = add template in `bridge.ts` + entry in `presets.json`. See [../docs/converter-design-v2.md](../docs/converter-design-v2.md).

## Testing

```bash
npm test                    # Unit tests (165) + fixture tests + test coverage check
npm run test:smoke          # Registry smoke test (all 128 entries — validates output structure)
npm run test:watch          # Watch mode for development
npm run check:tests         # Verify every source file has a matching test
```

**Unit tests** cover all transforms, steps, scanner, and the main convert flow:

| Test file | Tests | What it covers |
|-----------|-------|----------------|
| `transforms/import-mapping.test.ts` | 25 | All text-level replacements + real transform Uri injection |
| `transforms/class-to-factory.test.ts` | 11 | `new Xxx()` → `Xxx.create()` / `TextEdit.replace()` |
| `convert.test.ts` | 21 | Full conversion pipeline (text replacements, output generation, step orchestration, patches, excludeDeps) |
| `registry-validation.test.ts` | 12 | Registry.json schema validation |
| `scanner.test.ts` | 6 | API scanner detection |
| `steps/language-client.test.ts` | — | LanguageClient code generation |
| `steps/bridge.test.ts` | — | Bridge template generation |
| `steps/snippets.test.ts` | — | Snippets conversion |
| `steps/source.test.ts` | — | Source step + transforms |
| `steps/mark-unsupported.test.ts` | — | Mark unsupported step |
| `transforms/provider-register.test.ts` | — | Provider register transform |
| `transforms/enum-offset.test.ts` | — | Enum offset transform |
| `transforms/language-client.test.ts` | 5 | LanguageClient AST adaptation |
| `transforms/strip-volar.test.ts` | — | Volar framework stripping |
| `transforms/__fixtures__.test.ts` | — | Auto-discovered fixture tests |

> 总计 **165 tests** (15 files)，覆盖全部 5 种步骤生成器和 5 种 transform。

**Smoke test** — `npm run test:smoke` clones all 128 registry entries and runs the full converter on each, validating output structure. Repos are cached and updated incrementally via `git fetch`.

```bash
# Force re-clone all repos
NO_CACHE=1 npm run test:smoke

# Run with more concurrent downloads
CONCURRENCY=12 npm run test:smoke
```

## File structure

```
src/
├── cli.ts                  CLI entry
├── convert.ts              Main flow + template generation + API replacement
├── scanner.ts              API scanner
├── types.ts                Type definitions
├── steps/
│   ├── index.ts            Step registry
│   ├── source.ts           Source file copy + transforms
│   ├── snippets.ts         Snippet conversion
│   ├── language-client.ts  LanguageClient code generation
│   ├── bridge.ts           Bridge preset code generation
│   └── mark-unsupported.ts Unsupported API marking
└── transforms/
    ├── import-mapping.ts   Import replacement + 文本 polyfills
    ├── class-to-factory.ts new Xxx() → Xxx.create()
    ├── provider-register.ts Provider signature fixes
    ├── enum-offset.ts      Enum value offset annotations
    └── strip-volar.ts      Volar framework stripping
scripts/
├── smoke-test.ts           Registry smoke test (128 entries)
└── check-tests.ts          Test coverage enforcement
```

Each source file has a corresponding `.test.ts` with unit tests — see [Testing](#testing) above.

## Handled API differences

| API | VS Code | coc.nvim | Handling |
|-----|---------|----------|----------|
| import | `from 'vscode'` | `from 'coc.nvim'` | Direct replace |
| Position/Range/Location etc. | `new Xxx()` | `Xxx.create()` | AST replace |
| TextEdit | `new TextEdit(range, text)` | `TextEdit.replace(range, text)` | Namespace map (not .create()) |
| EventEmitter | `EventEmitter<T>` | `Emitter<T>` | Direct replace |
| registerCompletionItemProvider | `(sel, p, ...t)` | `(name, shortcut, sel, p, t?)` | Pad arguments |
| registerCodeActionsProvider | `registerCodeActionsProvider` | `registerCodeActionProvider` | Rename |
| registerReferenceProvider | `registerReferenceProvider` | `registerReferencesProvider` | Rename |
| CompletionItem.create | `new CompletionItem(label, kind)` | `CompletionItem.create(label)` + `item.kind = kind` | kind set separately |
| Trigger characters | `" "` (string) | `[" "]` (array) | Rest param → array |
| CompletionItemKind enum | `Value = 11`, `Enum = 12` | `Value = 12`, `Enum = 13` | Offset by 1, symbols auto-adapt |
| documentSelector | `[{ language: 'xxx' }]` | Same | 从 registry `languages` 字段生成 |
| getWordRangeAtPosition | `document.getWordRangeAtPosition()` | Not available | Inline word boundary polyfill |
| fileName | `document.fileName` | Not available | `Uri.parse(doc.uri).fsPath` |
| Location.create | `Location(Uri.file(path), pos)` | `Location(path, Range.create(pos, pos))` | convert.ts: auto‑wrap pos in Range |
| createTextEditorDecorationType | `window.createTextEditorDecorationType()` | Not available | Mark TODO |
| createWebviewPanel | `window.createWebviewPanel()` | Not available | Mark TODO |

### Missing API strategy

When a VS Code API has no coc.nvim equivalent, the approach is:

1. **文本级 polyfill**（在 `import-mapping.ts` 的 `textPolyfills` 中声明）→ 如 `showMessage`、`activeTextEditor`、`workspace.isTrusted`
2. **通用文本替换**（在 `convert.ts` 的文本替换层处理）→ 如 `.fileName`、`.uri.fsPath`、`getWordRangeAtPosition`
3. **Per-entry patches**（registry 的 `patches` 字段）→ 对特定插件做精确替换
4. **不可移植 API**（`mark-unsupported` 步骤）→ 标记 `/* TODO: <explanation> */`（webview、decoration、自定义编辑器等）

## Key design decisions

- **Config-driven** — server packages explicitly declared in registry `convert` config, no auto-detection
- **Bin entry fallback** — `entry: "bin"` auto-resolves `bin` field at runtime; `require.resolve` 自动回退到 `pkg/package.json`
- **Auto esbuild external injection** — configured server packages marked as external
- **Auto TS bridge injection** — `typescriptServerPlugins` + `tsserver/request` forwarding via bridge step
- **Plugin classification** — determined by registry `type` field, no auto-detection needed
- **Missing API handling** — polyfill where possible (showMessage, activeTextEditor, fileName), mark TODO otherwise (webview, decoration)
- **Baseline diff system** — SHA-256 输出文件指纹库，检测 converter 变更的非预期影响
