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

## Registry Entry Rules

`coc-vscode-registry/registry.json` is a flat array (currently 128 entries), ordered by technical complexity descending, with alphabetical `name` ordering within groups.

### Ordering Logic

The array is split into two segments: **non-snippets** (type `pure-lsp` / `ts-bridge` / `direct-api`) first, then **snippets**. The non-snippets segment is ordered by technical complexity descending:

```
LSP (binary / module / bridge) → direct-api (API polyfill)
```

### Non-snippets Insertion Position

Grouped by language/tool category, ordered alphabetically by `name` within each group:

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
14. Other tools              — gitignore (direct-api)
```

### Snippets Insertion Position

Grouped by category, ordered alphabetically by `name` within each group:

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

Plugins not belonging to any existing group are placed at the end of the corresponding segment's Other group.

### Required Fields

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

### Optional Fields

| Field | Applies to | Description |
|-------|-----------|-------------|
| `minPluginVersion` | All | Minimum coc-vscode-loader version; entries below this version are filtered out |
| `serverBinary` | pure-lsp (binary kind) | GitHub Release binary download config with `repo`, `asset`, `binaryPath`, optional `args` and `targetAssets` |
| `pipPackages` | pure-lsp | Python pip dependencies, auto-installed by pipeline |
| `goPackages` | pure-lsp | Go packages, pipeline runs `go install` to compile into `server/` |
| `cargoPackages` | pure-lsp | Rust crates, pipeline runs `cargo install --root` then copies to `server/` |
| `notes` | All | User-visible install hints shown in TUI detail popup (e.g. manual steps or caveats) |

### convert Field Description

`convert` is an array, executed in order:

- **`language-client`** — generates `src/index.ts`, creates a LanguageClient to connect to the language server. Applies to `pure-lsp` type. `server.kind` can be `module` (npm package) or `binary` (executable). Binary type requires `server.binary` (repo/asset/binaryPath) and optional `args`.
- **`source`** — applies transforms like import-mapping to TypeScript source. Optional; preserves part of the original extension's functionality.
- **`bridge`** — bridge preset (currently only `ts-bridge` for Volar).
- **`snippets`** — pure Snippets extension, copies snippets JSON files and generates a stub `src/index.ts`.

### Plugin-Specific Text Patches

- Plugin-level text fixes (e.g. fixing bugs in the original extension) use the `patches` field
- Do not put them in the converter's general logic
- When using `patches`, set `minPluginVersion: "1.4.3"`

### Naming Convention

- Names follow the `vscode-<repository-short-name>` format
- `displayName` uses the original extension's displayName
- `languages` includes all trigger languages (following the original extension's activationEvents)

## Converter transforms

| Transform | What it does |
|-----------|-------------|
| `import-mapping` | `from 'vscode'` → `from 'coc.nvim'` + text-level API polyfills |
| `class-to-factory` | `new Xxx()` → `Xxx.create()`, `new TextEdit()` → `TextEdit.replace()`, `new WorkspaceEdit()` → `({ changes: {} })` |
| `provider-register` | Adapt provider registration signatures |
| `enum-offset` | Comment on enum value differences |
| `language-client` | LanguageClient signature adaptation |

### `import-mapping` Text-Level Polyfills

`import-mapping` applies text-level replacements on source code in addition to AST-level import rewriting to adapt to coc.nvim API differences:

| Replacement | Reason |
|------|------|
| `await import(...)` → `require(...)` | coc extensions run in CJS sandbox |
| `createStatusBarItem(name, alignment, priority)` → `createStatusBarItem(priority)` | Different coc API parameters |
| `LanguageStatusSeverity.xxx` → `2` | coc has no such type |
| `new StatusBar()` → no-op mock | VS Code status bar API differences |
| `workspace.isTrusted` → `true` | coc has no workspace trust concept |
| `new CodeAction()` → try-catch safe | coc's CodeAction constructor may be unavailable |
| `CodeActionKind.SourceFixAll.append(...)` → string literal | coc's CodeActionKind is a string alias |
| `window.activeTextEditor` → polyfill | coc has no such property, injects runtime compatibility layer |
| `window.onDidChangeActiveTextEditor` → `workspace.onDidOpenTextDocument` | coc uses different event name |
| `languages.createLanguageStatusItem(...)` → no-op (supports `vscode.` prefix) | coc has no such API |
| `window.showOpenDialog(...)` → `void 0` (supports `vscode.` prefix) | coc has no file picker dialog |
| `window.showInformationMessage(msg)` → `Promise.resolve(window.showMessage(msg, 'more'))` (supports `vscode.` prefix) | coc uses showMessage with severity parameter (`'error'`/`'warning'`/`'more'`), wraps Promise.resolve to preserve `.then()` chaining |
| `window.showWarningMessage(msg)` → `Promise.resolve(window.showMessage(msg, 'warning'))` (same) | Same, auto-strips extra arguments (buttons, options, etc.) |
| `window.showErrorMessage(msg)` → `Promise.resolve(window.showMessage(msg, 'error'))` (same) | Same |
| `languages.match(...)` → `1` | coc has no such API, returns truthy value assuming match |
| `registerDocumentFormatProvider(sel, provider)` → `(sel, provider, 1)` | Default priority=1 to avoid being overridden by LanguageClient |
| `workspace.workspaceFolders[` → `(workspace.workspaceFolders \|\| [])[` | coc may return undefined |
| Auto-inject `workspace`/`Uri` import | Automatically adds imports after introducing new APIs |

### `convert.ts` Generic Text Replacements

The converter main flow applies a round of generic text replacements to all output source files after step execution:

| Replacement | Reason |
|------|------|
| `.fileName` → `Uri.parse($1.uri).fsPath` | coc's TextDocument has no fileName property. Added `(?<![\w$])` negative lookbehind to avoid matching `_document.fileName` |
| `{ fileName } = doc` destructure split | Same, handles destructuring syntax |
| `.uri.fsPath` → `Uri.parse($1.uri).fsPath` | coc's uri is a file:// URI string. Requires first character `[a-zA-Z_$]` to avoid matching `0.uri.fsPath` |
| `getWordRangeAtPosition` → inline implementation | coc has no such API |
| `Location.create(Uri.file($1), $2)` → `Location.create($1, Range.create($2, $2))` | coc's Location.create accepts `(string, Range)`, not `(Uri, Position)` |
| `Uri`/`Range` auto-inject import | Namespace imports can't use destructuring injection, auto-adds `import { Uri }`/`import { Range }` |
| `(?:vscode\.)?workspace\.workspaceFolders` guard | Handles `vscode.` prefix, avoids producing `vscode.(...)` syntax errors |
| `new WorkspaceEdit()` → `({ changes: {} })` | coc's WorkspaceEdit is an interface, cannot be instantiated with new. `.set(uri, edits)`/`.set(document.uri, edits)` also converted to `.changes[uri] = edits` |

### Plugin-Specific Text Patches `patches` (v1.4.2+)

Plugin-specific text replacements (e.g. fixing bugs in the original extension) should be declared via the registry `patches` field, not in the generic converter:

**Type 1: Source-level patches (source step)**

Applied to converted TypeScript/JavaScript source files, after generic replacements but before writing to disk.

```json
{
  "type": "source",
  "transforms": ["import-mapping", "class-to-factory", "provider-register"],
  "patches": [
    { "find": "\\\\[a-zA-Z0-9\\\\._\\\\[\"']\\\\]", "replace": "[a-zA-Z0-9._[\"'-]" }
  ]
}
```

- `find`: **Escaped** RegExp source string (compatible with `new RegExp(find, 'g')`)
- `replace`: Replacement text

**Type 2: Server post-compilation patches (language-client step)**

Applied to compiled JS output of a local language server, after `tsc` compilation but before `esbuild` bundling. Suitable for fixing server-side behavior (e.g. disabling pull diagnostics, injecting event hooks).

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

- `file`: Path relative to `server/out/` (e.g. `"eslintServer.js"`, `"eslint.js"`)
- `find`: **Escaped** RegExp source string
- `replace`: Replacement text
- All patches written to `server-patches.json` in the build directory, read and executed by the generated `esbuild.mjs` prebuild section

### `class-to-factory` Namespace Mapping

Some coc.nvim types are interfaces (not classes), and their namespace function names are not `.create()`:

| VS Code | coc.nvim | Reason |
|---------|----------|------|
| `new TextEdit(range, text)` | `TextEdit.replace(range, text)` | coc's TextEdit is an interface, only `TextEdit.replace/insert/del` exist |
| `new WorkspaceEdit()` | `({ changes: {} })` | coc's WorkspaceEdit is an interface, cannot be instantiated with `new` |

Configured via `NAMESPACE_MAP` (`class-to-factory.ts`), adding a new type only requires one line: 

```typescript
const NAMESPACE_MAP: Record<string, string> = {
  'TextEdit': 'TextEdit.replace',
}
```

`WorkspaceEdit` is not handled via `NAMESPACE_MAP`; instead it's done via text-level replacement in `class-to-factory.ts` and `convert.ts`: `new WorkspaceEdit()` → `({ changes: {} })`, and `.set(uri, edits)` → `.changes[uri] = edits` (in `convert.ts` generic text replacement phase).

**Bridge preset system** (`converter/src/steps/bridge.ts` + `coc-vscode-registry/presets.json`):
- Bridge logic is not used for source-based plugins
- Currently only `ts-bridge` preset exists for TypeScript bridge plugins (Volar)
- Adding a new bridge type: add template in `converter/src/steps/bridge.ts` `BRIDGE_TEMPLATES`, and entry in [`coc-vscode-registry/presets.json`](https://github.com/coc-plugin/coc-vscode-registry/blob/main/presets.json)

## coc-tsserver PR

- PR: https://github.com/neoclide/coc-tsserver/pull/493
- Changes: `globalPlugins` + `pluginPaths` in configure, `typescript.tsserverRequest` command
- Pre-merge: `npm install ChuYanLon/coc-tsserver`

## Loader plugin

`plugin/` is a coc.nvim plugin that provides a TUI to install/update/uninstall converted plugins.

### Architecture

| File | Description |
|------|-------------|
| `src/index.ts` | Plugin entry + 11 CocCommands |
| `src/tui.ts` | TUI window management + rendering + key dispatch |
| `src/state.ts` | State management (debounced rendering) |
| `src/registry.ts` | Remote registry fetch + disk cache + version compatibility filter |
| `src/pipeline.ts` | Real install/update/uninstall flow (git / npx tsx / npm / node / cp) + pip install + go install + cargo install + binary server download + code patching (documentSelector, client.start guard) |
| `src/renderer.ts` | LineBuffer render engine (inspired by lazy.nvim) |
| `src/editor-api.ts` | Editor abstraction interface (Nvim/Vim backends) |
| `src/editor-factory.ts` | Editor backend auto-detection + instantiation |
| `src/nvim-editor.ts` | Neovim backend (floating window + extmark) |
| `src/vim-editor.ts` | Vim backend (split window + text properties) |

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
- **Cross-version change detection**: on startup after upgrade, compares packaged `baseline.json` against saved snapshot, marks affected plugins with `[changed]` in TUI and notifies user
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
| `:CocCommand loader.whatChanged` | Cross-version impact analysis |
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
| [v1.5.0](https://github.com/coc-plugin/coc-vscode-loader/milestone/4) | 2026-09 | Go/Cargo source install, `installToCoc` optimization, registry expansion |
| [v2.0.0](https://github.com/coc-plugin/coc-vscode-loader/milestone/3) | 2026-12 | Stable ecosystem: 10+ plugins, full transform coverage |

## `excludeDeps` (v1.5.7+)

`excludeDeps` filters out unwanted package names from the source extension's `dependencies`/`devDependencies`, used with `keepDeps` to precisely control the output `package.json` dependencies.

```json
{
  "type": "source",
  "excludeDeps": ["vsls", "@wdio", "husky", "tslint", "live-server"],
  "keepDeps": { "live-server": "^1.2.2", "http-shutdown": "^1.2.0" }
}
```

- `excludeDeps` is a string array supporting prefix matching (e.g. `@wdio` excludes `@wdio/cli`, `@wdio/local-runner`, etc.)
- `keepDeps` re-adds same-named deps, used to replace incorrect version numbers or file paths (e.g. `"file:lib\\live-server"`)

## keepDeps Version Resolution Strategy (Converter v2.0)

`keepDeps` version resolution uses a three-step fallback:

1. Source plugin `package.json` `dependencies` → use if found
2. Source plugin `package.json` `devDependencies` → use if found
3. Walk up to workspace root `package.json` (monorepo scenario)
4. All fail → error

If auto-resolution is insufficient, registry config can use object syntax to manually specify versions:

```json
"keepDeps": {
  "lodash": "^4.17.21",
  "@vue/language-core": "workspace:*"
}
```

Array syntax (auto-resolve) and object syntax (manual) are mutually exclusive.

### `snippets` step type (v1.3.0+)

For pure VS Code Snippets extensions (no code, no LSP, only `contributes.snippets` JSON files).

**Core principle**: coc-snippets discovers snippet files via **`package.json` `contributes.snippets`** (reads `textmateProvider.ts:loadSnippetDefinition()`), not by directory name matching. So the original `contributes.snippets` declaration and relative paths must be preserved.

Conversion logic:
1. Read source `package.json` `contributes.snippets` → get `{language → path}` mapping
2. Copy each snippet JSON file to output at the **same relative path** (e.g. `./snippets/snippets.json` → `output/snippets/snippets.json`)
3. Generate stub `src/index.ts` (`export function activate() {}`)
4. `convert.ts` preserves `origPkg.contributes.snippets` to output `package.json`

Registry entry example: 
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

Implementation file: `converter/src/steps/snippets.ts`, registered in `steps/index.ts`.
`convert.ts` passes through `contributes.snippets` (preserves the original declaration during package.json generation).

## Converter Key Modules

### Local server support (v1.4.2+)

When the language server is a local subdirectory in the source code (not a published npm package), use a relative path in `server.package`:

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

Local server handling:
- **Code generation**: `require.resolve` + `path.join` fallback (no npm-specific bin walking / package.json fallback)
- **Build**: esbuild.mjs auto-installs `@types/node`, compiles TypeScript under `server/`
- **Pipeline**: `buildPackage()` automatically copies `server/` directory from source to build directory
- **Hover fallback**: auto-registers direct hover provider for local servers, tries `textDocument/hover` first, falls back to reading files from `textDocument/definition` results to construct hover content (language tag auto-detected from extension)

Note: `server/` directory needs its own `package.json` and `tsconfig.json`.

### `binName` field (v1.2.0+)

When `server.kind === "module"` and `entry === "bin"`, use `binName` to specify a specific bin entry. Useful for packages with multiple bin values (e.g. `@tailwindcss/language-server` has both `css-language-server` and `tailwindcss-language-server` bins).

```json
{
  "kind": "module",
  "package": "@tailwindcss/language-server",
  "entry": "bin",
  "binName": "tailwindcss-language-server"
}
```

### No main field fallback (v1.2.2+)

`entry: "bin"` resolution: prefer `require.resolve(pkg)`, fall back to `require.resolve(pkg/package.json)` on failure. Required for packages without a `main` field that only expose entry via `bin` (e.g. `@tailwindcss/language-server`).

> Note: `binName` itself is available since v1.2.0, but no-main fallback was added in v1.2.2. Registry entries needing both (e.g. tailwindcss) should set `minPluginVersion: "1.2.2"`.

### `args` field (v1.4.3+)

When `server.kind === "module"`, use `args` to specify CLI arguments passed when starting the language server (previously only `binary` kind supported).

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

Supports the following placeholders, replaced at code generation time with runtime expressions:

| Placeholder | Runtime value |
|--------|----------|
| `{dir}` | `__dirname` (compiled output directory) |
| `{pluginDir}` | `require('path').resolve(__dirname, '..')` (plugin root directory) |

Generated serverOptions includes the `args` array: 
```typescript
{ module: serverPath, transport: TransportKind.ipc, args: ['--ngProbeLocations', require('path').resolve(__dirname, '..'), ...] }
```

### `targetAssets` field (v1.5.0+)

When GitHub Release binaries use **platform-specific naming** (e.g. clangd uses `mac`/`windows` instead of `darwin`/`win32`), use `targetAssets` to override the default `asset`/`binaryPath`:

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

Matching: looks up by `platform` + `arch`, uses the matched entry's `file` and `binaryPath`; falls back to top-level `asset`/`binaryPath` on no match.

| Field | Required | Description |
|------|------|------|
| `platform` | ❌ | Target platform, `"darwin"` \| `"linux"` \| `"win32"`, omitted matches all |
| `arch` | ❌ | Target architecture, `"x64"` \| `"arm64"`, omitted matches all |
| `file` | ✅ | Platform-specific asset filename template |
| `binaryPath` | ❌ | Binary path inside the platform archive |

## Pending

- [x] Angular Language Service (`vscode-ng-language-service`) — added to registry
- [x] `args` field for module-kind language servers — supports `{dir}` and `{pluginDir}` placeholders
- [x] ESLint added to registry (with server patches: diagnostic injection, pull diagnostics disabled, resolveSettings fix)
- [x] `server.patches` — local server post-compilation text patch mechanism (v1.4.5+)
- [ ] Add more plugins to registry (Code Spell Checker)
- [ ] Add `vscode-languageclient` import rewrite to `import-mapping` transform
- [ ] Add more transforms (uri-mapping, more provider signatures)
- [ ] Add python-bridge / rust-bridge preset examples
- [ ] Implement keepDeps workspace root lookup for monorepo (step 3)
- [ ] Implement keepDeps object syntax fallback
- [x] `serverBinary` raw binary download: handled for non-archive assets (e.g. Biome)
- [x] JavaScript extension support (`.js` file copy + text-level replacements, `require('vscode')` → `require('coc.nvim')`)
- [x] Language-client step `initializationOptions` field (tsdk for Volar-based servers)
- [x] `snippets` step type — automatic pure snippets conversion
- [x] 92 snippet extensions added to registry
- [x] Local server support — `server.package` supports relative paths, auto-compiles `server/` TypeScript, pipeline auto-copies
- [x] Pyright (`vscode-pyright`) — added to registry, module kind auto-installs pyright npm package
- [x] Go LSP (`vscode-go`) — added to registry, goPackages support for auto go install gopls
- [x] `targetAssets` — serverBinary per-platform asset mapping, supports non-standard platform names
- [x] `installToCoc` optimization — skips node_modules, selective copy + re-run npm install
- [x] Code Runner (`vscode-code-runner`) — added to registry, direct-api, 11 patches

## TUI design

TUI matches Mason.nvim's visual style and interaction design, aiming for 1:1 consistency.

Key design decisions:
- Mason colors replicated exactly (gold #DCA561 + cyan #56B6C2 + gray #888888)
- Mason window options identical (no border, 80% width, 90% height, backdrop overlay)
- Sections grouped by status: Failed → Installing → Installed → Available
- Tabs use number keys 1-9, format ` (N) Name `
- Package line: `◍ displayName`, expand details/log inline
- No features that Mason doesn't have

### Mason Feature Mapping

- Header gold centered + `g?` hint ✓
- Install/Update/Uninstall/Check updates ✓
- `<CR>` expand details/log inline ✓
- Indent chain: 4sp→6sp→8sp ✓
- `<C-f>` language filter: reserved
- `<C-c>` cancel install: pending
- [x] `rimraf` error handling — chmod -R u+w before delete, handling Go module cache read-only directories

### goPackages / cargoPackages (v1.5.0+)

When the language server is not an npm package and has no prebuilt GitHub Release binary, use source compilation:

| Field | Mechanism | Example |
|------|------|------|
| `goPackages` | Pipeline runs `go install`, `GOBIN` points to `server/`, binary output directly to `server/` | `["golang.org/x/tools/gopls@latest"]` |
| `cargoPackages` | Pipeline runs `cargo install --root`, copies binary from temp dir to `server/` | `[{ "crate": "nil", "binary": "nil" }]` |

Go/Cargo build cache stored in `build/.gopath/` and `build/.cargo-root/`, cleaned up after installation.

### Pipeline Robustness Improvements (v1.5.0+)

- **`rimraf` error handling**: chmod -R u+w before delete, handling Go module cache read-only directories
- **`cpdir` switched to `fs.cp`**: Node.js native recursive copy, correctly handles symlinks and permissions
- **`installToCoc` optimization**: only copies `lib/`, `server/`, `package.json` etc., skips `node_modules/`, then re-runs `npm install` at destination, avoiding `cp -rL` issues on large `node_modules`

## Testing

Every source file must have a corresponding `.test.ts` file. Run before pushing:

```bash
npm test                    # Unit tests (165) + check-tests + fixture tests
npm run test:full           # Unit tests + diff:check (registry baseline comparison)
npm run test:smoke          # Registry smoke test (converts all 128 entries, validates output structure)
```

**Pre-push hook** runs `npm test`. CI runs unit tests on push/PR (Node 20/22), then diff check, then smoke test.

### Fixture tests

Per-transform input/output pairs in `converter/src/__fixtures__/<transform>/<case>/`:

| Transform | Fixtures | What's tested |
|-----------|----------|---------------|
| `import-mapping` | 22 | `require('vscode')`, `createStatusBarItem`, `new CodeAction`, `workspace.isTrusted`, `window.activeTextEditor`, `editor.setDecorations`, `workspaceFolders` guard, `vscode.languages.createLanguageStatusItem`, etc. |
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
  "vscode-prettier-vscode": {
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

Use the current version number (e.g. `v=1.5.9`) as the parameter value so it changes with each release. Do NOT use timestamps or random values — version numbers are meaningful and auto-increment.
