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
  └─ generate esbuild.mjs    Build config
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

## File structure

| File | Lines | Description |
|------|-------|-------------|
| `src/cli.ts` | 59 | CLI entry |
| `src/convert.ts` | 461 | Main flow + template generation + API replacement |
| `src/scanner.ts` | 52 | API scanner + plugin classification |
| `src/transforms/import-mapping.ts` | 193 | Import replacement |
| `src/transforms/language-client.ts` | 48 | LanguageClient adaptation |
| `src/transforms/class-to-factory.ts` | 53 | new Xxx() → Xxx.create() |
| `src/transforms/provider-register.ts` | 61 | Provider registration signature fixes |
| `src/transforms/enum-offset.ts` | 32 | Enum value offset annotations |
| **Total** | **~959** | |

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
