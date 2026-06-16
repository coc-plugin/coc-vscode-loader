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
| YAML | Pure LSP | npm package server |
| Tailwind CSS | Pure LSP | npm package server, bin entry |
| Biome | Pure LSP | Binary server download |
| Stylelint | Pure LSP | npm package server |
| Prettier | Direct API | Source transforms |
| Svelte | Pure LSP | npm package server |
| Astro | Pure LSP | npm package server |
| Lua | Pure LSP | npm package server |
| gitignore | Direct API | Source transforms |
| CSS Peek | Pure LSP | Local server (TypeScript source in `server/`) |
| Angular Language Service | Pure LSP | npm package server (`@angular/language-server`), `binName` + `args` with `{pluginDir}` |
| Pyright | Pure LSP | npm package server (`pyright` → `pyright-langserver`), `binName` |
| Go | Pure LSP | Source-compiled binary server (`go install gopls`) |
| Docker | Pure LSP | npm package server (`dockerfile-language-server-nodejs`) |
| Bash IDE | Pure LSP | npm package server (`bash-language-server`) |

See the [registry](https://github.com/coc-plugin/coc-vscode-registry) for the full list and latest status.

### Plugin types

| Type | Description | Approach | Example |
|------|-------------|----------|---------|
| **TS bridge** | Language plugins depending on TypeScript LSP | Generate `tsserver/request` bridge + `typescriptServerPlugins` | Volar |
| **Pure LSP** | Standard LSP using LanguageClient | Generate LanguageClient entry + server dependency injection | Prisma |
| **Direct API** | Direct coc.nvim API calls (no LanguageClient) | Keep original `extension.ts` as entry, no bridge | HTML CSS Support |

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

详见 [AGENTS.md](../AGENTS.md#gopackages--cargopackagesv150).

详见 [AGENTS.md](../AGENTS.md#%E6%8F%92%E4%BB%B6%E7%BA%A7%E6%96%87%E6%9C%AC%E8%A1%A5%E4%B8%81-patchessource-step).

## Architecture

```
Input: VS Code extension directory
  │
  ├─ scanner        Analyze API → detect plugin type
  ├─ transforms/    AST transforms
  │   ├─ import-mapping      from 'vscode' → from 'coc.nvim'
  │   ├─ class-to-factory    new Xxx() → Xxx.create() / TextEdit.replace()
  │   ├─ provider-register   Adapt provider registration signatures
  │   ├─ language-client     Adapt LanguageClient signatures
  │   └─ enum-offset         Comment on enum value offsets
  ├─ mark-unsupported  Replace/mark missing APIs (getWordRangeAtPosition, fileName, etc.)
  ├─ generate src/index.ts   Main entry (bridge / LanguageClient / direct templates)
  ├─ generate package.json   Dependencies / esbuild external config
  ├─ generate esbuild.mjs    Build config + server TypeScript compilation
  └─ local server hover fallback  (only for relative-path servers)
```

## Bridge preset system

Bridge logic is preset-driven rather than hardcoded:

```typescript
// presets.ts - all bridge presets defined here
const PRESETS = {
  'ts-bridge': {
    notification: 'tsserver/request',
    responseNotification: 'tsserver/response',
    handler: { type: 'command', command: 'typescript.tsserverRequest' },
    extraDeps: ['typescript'],
  },
  // future: python-bridge, rust-bridge, etc.
}
```

`convert.ts` only calls `getActivePresets()` + `generateBridgeCode()`, it never touches bridge logic directly.
Adding a new bridge type = add a new preset in `presets.ts`, no changes to main flow.

See [../docs/converter-design-v2.md](../docs/converter-design-v2.md).

## Testing

```bash
npm test                    # Unit tests (116 tests, 14 files) + coverage check
npm run test:smoke          # Registry smoke test — converts all 121 entries
npm run test:watch          # Watch mode for development
npm run check:tests         # Verify every source file has a matching test
```

**Unit tests** cover all transforms, steps, scanner, and the main convert flow:

| Test file | Tests | What it covers |
|-----------|-------|----------------|
| `transforms/import-mapping.test.ts` | 22 | All text-level replacements + real transform Uri injection |
| `transforms/class-to-factory.test.ts` | 7 | `new Xxx()` → `Xxx.create()` / `TextEdit.replace()` |
| `convert.test.ts` | 17 | Full conversion pipeline (text replacements, output generation, step orchestration, patches) |
| `registry-validation.test.ts` | 12 | Registry.json schema (121 entries) |
| `scanner.test.ts` | 6 | API scanner detection |
| `presets.test.ts` | 5 | Bridge preset definitions |
| `transforms/language-client.test.ts` | 5 | LanguageClient AST adaptation |

**Smoke test** — `npm run test:smoke` clones all 121 registry entries and runs the full converter on each, validating output structure. Repos are cached and updated incrementally via `git fetch`.

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
├── presets.ts              Bridge preset definitions
├── types.ts                Type definitions
├── steps/
│   ├── index.ts            Step registry
│   ├── source.ts           Source file copy + transforms
│   ├── snippets.ts         Snippet conversion
│   ├── language-client.ts  LanguageClient code generation
│   ├── bridge.ts           Bridge preset code generation
│   └── mark-unsupported.ts Unsupported API marking
└── transforms/
    ├── import-mapping.ts   Import replacement
    ├── class-to-factory.ts new Xxx() → Xxx.create()
    ├── provider-register.ts Provider signature fixes
    ├── language-client.ts   LanguageClient AST adaptation
    ├── strip-volar.ts      Volar framework stripping
    └── enum-offset.ts      Enum value offset annotations
scripts/
├── smoke-test.ts           Registry smoke test (114 entries)
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
| documentSelector | `[{ language: 'xxx' }]` | Same | Auto-infer from package.json |
| getWordRangeAtPosition | `document.getWordRangeAtPosition()` | Not available | Inline word boundary calculation |
| fileName | `document.fileName` | Not available | Replace with `document.uri` |
| Location.create | `Location(Uri.file(path), pos)` | `Location(path, Range.create(pos, pos))` | convert.ts: auto‑wrap pos in Range |
| createTextEditorDecorationType | `window.createTextEditorDecorationType()` | Not available | Mark TODO |
| createWebviewPanel | `window.createWebviewPanel()` | Not available | Mark TODO |

### Missing API strategy

When a VS Code API has no coc.nvim equivalent, the approach is:

1. Find the [VS Code source](https://github.com/microsoft/vscode) implementation
2. Evaluate complexity:
   - **Simple** (e.g. `getWordRangeAtPosition`) → inline polyfill
   - **Complex** (e.g. decoration, webview) → mark TODO with explanation
3. Polyfill using existing coc APIs where possible, avoid new dependencies

Known VS Code API source locations:
- `getWordRangeAtPosition` → `src/vs/editor/common/core/wordHelper.ts`
- `TextDocument.fileName` → coc uses `document.uri` instead (`DocumentUri = string`)
- Decoration system → `src/vs/editor/common/viewModel/viewDecorations.ts`

## Key design decisions

- **Zero hardcoding** — server package names auto-detected from source
- **Bin entry fallback** — auto-detect and prefer `package.json` bin entry
- **Auto esbuild external injection** — detected server packages marked as external
- **Auto TS bridge injection** — `typescriptServerPlugins` + `tsserver/request` forwarding
- **Plugin classification** — auto-detect TS bridge / pure LSP / direct API
- **Missing API handling** — polyfill where possible, mark TODO otherwise
