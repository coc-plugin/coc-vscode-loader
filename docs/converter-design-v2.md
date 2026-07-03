# vscode → coc Converter — Final Design

## Core Concept

**A single coc plugin as the package manager.** Users install it once, then operate just like mason:

```
:CocInstall coc-vscode-loader
:CocCommand loader.install vscode-volar     ← Download VS Code plugin → Convert → Install
:CocCommand loader.open              ← TUI management interface
:CocCommand loader.uninstall vscode-volar   ← Uninstall
```

> Current version: **v1.6.4** — see [CHANGELOG.md](../CHANGELOG.md)
> Registry: **134 entries**, covering four types: pure-lsp, direct-api, ts-bridge, snippets

---

## 1. Plugin Classification

| Type | Features | Representative | Automation Level |
|------|----------|---------------|-----------------|
| Pure LSP | No external dependencies, direct LanguageClient connection | ESLint, JSON, HTML, YAML | **~95%** |
| TS Bridge | Needs to communicate with TypeScript language server | Volar | **~85%** + bridge config |
| Pure LSP (ng) | Standalone LSP server, connected via LanguageClient | Angular Language Service | **~95%** |
| Pure Snippets | No code, only JSON snippet files | 92 snippet extensions | **100%** |
| direct-api | Directly exposes API, converted via import-mapping | Prettier, Code Runner | **~80-95%** |

### Special Handling of TS Bridge Plugins

Volar v3 architecture requires the LSP client to bridge `tsserver/request` ↔ `tsserver/response`:

```
Vue Language Server                    TypeScript Server
       │                                      │
       │── tsserver/request (#1, cmd, args) ──▶│
       │                                      │
       │◀─ tsserver/response (#1, body) ──────│
       │                                      │
```

VS Code's implementation relies on the built-in `typescript.tsserverRequest` command, which coc doesn't have. Solution:

1. **Modify coc-tsserver**: Add `globalPlugins` support + register `typescript.tsserverRequest` command (PR [#493](https://github.com/neoclide/coc-tsserver/pull/493))
2. **Plugin package.json**: Declare `typescriptServerPlugins` contribution
3. **Converter's registry**: Mark the plugin as "TS bridge type", automatically perform the above two steps during installation

---

## 2. Overall Architecture — Configuration-Driven (v2.0)

```
                     ┌──────────────────────┐
                    │   Input: VS Code Plugin   │
                    │   (directory / npm / git)  │
                     └────────┬─────────────┘
                              ▼
           ┌──────────────────────────────────┐
           │     registry → convert[]         │
           │   Declarative step array, precisely describes conversion strategy │
           │   No more heuristic scanning/guessing          │
           └────────┬─────────────────────────┘
                    ▼
           ┌──────────────────────────────────┐
           │     steps/ (step generator - registration pattern)  │
           │   ├ language-client (module/binary)│
           │   ├ source (copy + 5 transforms)  │
           │   ├ bridge (BRIDGE_TEMPLATES)     │
           │   ├ snippets (JSON copy + stub)   │
           │   └ mark-unsupported (remove features)   │
           └────────┬─────────────────────────┘
                    ▼
           ┌──────────────────────────────────┐
           │     convert.ts (main flow)            │
           │   ├ Scan files containing `from 'vscode'` │
           │   ├ Execute generators in step order           │
           │   ├ Merge generated files + code injections│
           │   ├ Apply text replacement layer + patches     │
           │   ├ Generate package.json / esbuild.mjs│
           │   └ Output conversion report                   │
           └────────┬─────────────────────────┘
                    ▼
           ┌─────────────────────────────┐
           │    Output: coc plugin directory + report   │
           └─────────────────────────────┘
```

---

## 3. Bridge Preset System

The bridge logic is driven by preset + `BRIDGE_TEMPLATES`, defined in `converter/src/steps/bridge.ts`. `convert.ts` doesn't care about bridge details, it only registers step generators.

### Currently Built-in Presets

The `type` field defined in [`coc-vscode-registry/presets.json`](https://github.com/coc-plugin/coc-vscode-registry/blob/main/presets.json) maps to `BRIDGE_TEMPLATES` in `converter/src/steps/bridge.ts`:

| Preset | BRIDGE_TEMPLATE Type | Purpose |
|--------|----------------------|---------|
| `ts-bridge` | `tsserver-forward` | Volar's TypeScript bridge |

Currently only **1** bridge template (`tsserver-forward`). The `prettier` preset is deprecated, use `source` step instead.

```typescript
// BRIDGE_TEMPLATES in bridge.ts (currently the only one)
'tsserver-forward': (opts) => ({
  code: `client.onNotification('tsserver/request', async ([seq, command, args]: [number, string, any]) => {
    try {
      const result = await commands.executeCommand<any>('${command}', command, args, { isAsync: true, lowPriority: true })
      client.sendNotification('tsserver/response', [seq, result?.body])
    } catch { client.sendNotification('tsserver/response', [seq, undefined]) }
  })`,
  injectExts: opts.extensions || [],
  injectSvcs: opts.services || [],
  callAfter: 'registerBridge(context, client)',
  extraDeps: ['typescript'],
}),
```

### Adding a New Bridge

Just add a new type in `BRIDGE_TEMPLATES` in `bridge.ts` + add a preset definition in `coc-vscode-registry/presets.json`. No need to modify `convert.ts`.

---

## 4. Registry (coc-vscode-registry)

The registry has been separated into its own [coc-vscode-registry](https://github.com/coc-plugin/coc-vscode-registry) repository, [`registry.json`](https://github.com/coc-plugin/coc-vscode-registry/blob/main/registry.json).

Currently **134 entries**, distributed by type:

| type | Count | Description |
|------|-------|-------------|
| `snippets` | 92 | Pure code snippet extensions |
| `pure-lsp` | 29 | Pure LSP servers |
| `direct-api` | 6 | Direct API calls |
| `ts-bridge` | 1 | TS bridge type (Volar) |

Entry format:

```typescript
{
  name: string
  displayName: string
  description: string
  type: 'ts-bridge' | 'pure-lsp' | 'direct-api' | 'snippets'
  source: { type: 'github'; repo: string; subdir?: string }
  url: string
  languages: string[]
  categories: string[]
  convert: Step[]  // conversion steps
  minPluginVersion?: string  // minimum coc-vscode-loader version
}
```

Registry data is fetched at runtime by `plugin/src/registry.ts`, the converter no longer has a built-in fixed list.

---

## 5. Conversion Flow (Configuration-Driven)

```
convert <input-vscode-ext> -o <output-dir> --convert <json>
  │
  ├─ 1. Read --convert step configuration (from registry entry)
  │     No more server detection/type guessing
  │
  ├─ 2. Scan files containing `from 'vscode'` / `require('vscode')`
  │
  ├─ 3. Execute generators in step order (5 registered steps)
  │     Each step outputs generatedFiles + keepDeps + codeInjections
  │
  │     ├─ language-client generates LanguageClient code (module/binary)
  │     │   kind: module → { module, transport, args? }
  │     │   kind: binary → { command, args }
  │     │   Supports patches (text replacements after server compilation)
  │     │
  │     ├─ source converts TypeScript source (5 transforms)
  │     │   ├ import-mapping        from 'vscode' → from 'coc.nvim' + text polyfills
  │     │   ├ class-to-factory      new Xxx() → Xxx.create()
  │     │   ├ provider-register     rename registration functions + fill signatures
  │     │   ├ enum-offset           comment reminders for enum value differences
  │     │   └ strip-volar           remove Volar framework imports (@vue/vscode-snippets etc.)
  │     │
  │     ├─ bridge generates bridge code (BRIDGE_TEMPLATES)
  │     │   Currently only `tsserver-forward` (Volar's TS bridge)
  │     │
  │     ├─ snippets copies JSON files + generates stub activate()
  │     │
  │     └─ mark-unsupported marks unsupported features
  │
  ├─ 4. Text replacement layer (applied to all output .ts/.js)
  │     ├─ .fileName → Uri.parse($1.uri).fsPath
  │     ├─ .uri.fsPath → Uri.parse($1.uri).fsPath (destructure split)
  │     ├─ getWordRangeAtPosition → inline word boundary computation
  │     ├─ Location.create(Uri.file(x), y) → Location.create(x, Range.create(y, y))
  │     ├─ new WorkspaceEdit() → ({ changes: {} })
  │     ├─ .set(uri, edits) → .changes[uri] = edits
  │     └─ Auto-inject Uri/Range import
  │
  ├─ 5. Apply plugin-level patches (per-entry find/replace from registry)
  │
  ├─ 6. Generate package.json + esbuild.mjs + coc-convert.json
  │     ├─ dependencies (server deps + keepDeps, supports excludeDeps filtering)
  │     ├─ activationEvents (collected from each step)
  │     ├─ typescriptServerPlugins (ts-bridge type)
  │     ├─ esbuild external auto-injection
  │     └─ server-patches.json (post-compilation server patches)
  │
  └─ 7. Output conversion report
```

---

## 6. Plugin Classification Verification

Verified through actual conversion of 134 registry entries:

| Category | Verification Method | Representative Entry |
|----------|-------------------|---------------------|
| pure-lsp (module) | language-client generation + npm install + esbuild | ESLint, Pyright, Tailwind CSS |
| pure-lsp (binary) | GitHub Release download + extract + code generation | Deno, Biome, Clangd |
| pure-lsp (goPackages) | `go install` compiles to server/ | gopls |
| pure-lsp (cargoPackages) | `cargo install --root` compiles to server/ | Code supported, currently no entry uses it |
| pure-lsp (pipPackages) | `pip install` installs dependencies | ansible-lint |
| direct-api | source conversion + API polyfills | Prettier, Code Runner, CSS Modules |
| ts-bridge | bridge template + source conversion | Volar |
| snippets | JSON file copy + stub entry | 92 snippet extensions |

---

## 7. Current Status

### Implemented (v1.6.4)

| Module | Location | Content |
|--------|----------|---------|
| 5 step generators | `converter/src/steps/` | language-client, source, bridge, snippets, mark-unsupported |
| 5 transforms | `converter/src/transforms/` | import-mapping, class-to-factory, provider-register, enum-offset, strip-volar |
| Text replacement layer | `converter/src/convert.ts` | .fileName, .uri.fsPath, getWordRangeAtPosition, WorkspaceEdit polyfill, etc. |
| Plugin-level patches | registry `patches` field | find/replace text replacement, supports source level and post-server-compilation |
| CLI | `converter/src/cli.ts` | `convert <input> -o <output> --convert <json>` |
| Bridge preset system | `converter/src/steps/bridge.ts` | BRIDGE_TEMPLATES + presets.json driven |
| Pipeline | `plugin/src/pipeline.ts` | git clone, convert, npm install, esbuild, binary download, pip/go/cargo install, installToCoc |
| TUI | `plugin/src/tui.ts` | Mason-style floating window, 9 tabs, filter/sort/search, inline logs |
| 11 CocCommands | `plugin/src/index.ts` | 10 user commands (open/install/uninstall/update/reinstall/uninstallAll/updateRegistry/cleanCache/list/whatChanged) + 1 internal (dispatch) |
| 134 registry entries | coc-vscode-registry/registry.json | 34 pure-lsp + 1 ts-bridge + 7 direct-api + 92 snippets, covering LSP, Formatter, Linter, Completion |
| Baseline diff system | `converter/baseline.json` | SHA-256 output file fingerprint + diff:check |

### Testing

| Test Type | Count | Description |
|-----------|-------|-------------|
| Unit tests | **167** (15 files) | vitest, includes fixture tests |
| Full test | `npm run test:full` | Unit tests + diff:check |
| Smoke test | `npm run test:smoke` | Full conversion of 134 entries and verify output structure |
| Regression check | `npm run diff:check` | Output file hash comparison, detect unexpected changes |

### Pending

- [ ] More provider signature adaptation (InlineValuesProvider has interface but no registration function)
- [ ] python-bridge / rust-bridge preset examples
- [ ] keepDeps workspace root lookup (monorepo scenario step 3)
- [ ] keepDeps reports error on resolution failure instead of silently returning
- [ ] multiRoot support for multiple workspace folders
- [ ] CI verification: auto `npm view` to verify server package existence
