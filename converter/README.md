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

详见 [AGENTS.md](../AGENTS.md#local-server-%E6%94%AF%E6%8C%81v142).

## Architecture

```
Input: VS Code extension directory
  │
  ├─ scanner        Analyze API → detect plugin type
  ├─ transforms/    AST transforms
  │   ├─ import-mapping      from 'vscode' → from 'coc.nvim'
  │   ├─ class-to-factory    new Xxx() → Xxx.create()
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
npm test                    # Unit tests (115 tests, 15 files) + coverage check
npm run test:smoke          # Registry smoke test — converts all 113 entries
npm run test:watch          # Watch mode for development
npm run check:tests         # Verify every source file has a matching test
```

**Unit tests** cover all transforms, steps, scanner, and the main convert flow:

| Test file | Tests | What it covers |
|-----------|-------|----------------|
| `transforms/import-mapping.test.ts` | 21 | All text-level replacements |
| `transforms/class-to-factory.test.ts` | 7 | `new Xxx()` → `Xxx.create()` |
| `transforms/provider-register.test.ts` | 7 | Provider signature adaptation |
| `transforms/enum-offset.test.ts` | 3 | Enum value offset annotations |
| `transforms/strip-volar.test.ts` | 4 | Volar framework import stripping |
| `steps/source.test.ts` | 8 | File copy, transforms pipeline, keepDeps |
| `steps/snippets.test.ts` | 4 | Snippet file copy and error handling |
| `steps/language-client.test.ts` | 5 | LanguageClient code generation |
| `steps/bridge.test.ts` | 4 | Bridge preset resolution and code injection |
| `steps/mark-unsupported.test.ts` | 7 | Unsupported API marking |
| `convert.test.ts` | 15 | Full conversion pipeline (text replacements, output generation, step orchestration) |
| `registry-validation.test.ts` | 12 | Registry.json schema (113 entries) |
| `scanner.test.ts` | 6 | API scanner detection |
| `presets.test.ts` | 5 | Bridge preset definitions |
| `transforms/language-client.test.ts` | 5 | LanguageClient AST adaptation |

**Smoke test** — `npm run test:smoke` clones all 113 registry entries and runs the full converter on each, validating output structure. Repos are cached and updated incrementally via `git fetch`.

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
├── smoke-test.ts           Registry smoke test (113 entries)
└── check-tests.ts          Test coverage enforcement
```

Each source file has a corresponding `.test.ts` with unit tests — see [Testing](#testing) above.

## Handled API differences

| API | VS Code | coc.nvim | Handling |
|-----|---------|----------|----------|
| import | `from 'vscode'` | `from 'coc.nvim'` | Direct replace |
| Position/Range/Location etc. | `new Xxx()` | `Xxx.create()` | AST replace |
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
