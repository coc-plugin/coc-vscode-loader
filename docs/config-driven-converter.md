# Converter v2.0 — Config-driven architecture

> Refactoring the converter from a heuristic regex engine to a declarative, config-driven engine.

## Problem

The current converter (v1.x) uses regexes to scan the entire project source code to guess the plugin's structure:

- `detectServerModules` searches all `.ts` files for strings containing "server" or "lsp"
- Guesses which npm packages are language servers
- Guesses whether to use `main` or `bin` as the entry point
- Pipeline then uses more regexes to post-process the generated code

The result: changing one plugin's rules can affect other plugins, and adding new plugins depends on luck.

## Solution: Config-driven

Each registry entry declares a `convert` field (array of steps) that precisely describes how to convert this plugin. The converter executes according to the declaration without making any guesses.

The configuration is passed to the converter via the pipeline: the pipeline reads `convert` from the registry and passes it to the CLI as the `--convert <JSON>` argument. The converter no longer scans or guesses on its own.

The `type` field (`pure-lsp`, `ts-bridge`, `direct-api`) is only used for TUI display and categorization when `convert` is present; it no longer affects conversion behavior.

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

## Conversion steps

Each `convert` is an array of steps executed in order. Step types:

| Type | Function |
|------|----------|
| `language-client` | Generate LanguageClient code |
| `source` | Copy source files + apply transforms |
| `bridge` | Generate bridge code (only for plugins with non-portable APIs, such as Volar) |
| `mark-unsupported` | Mark unsupported features |
| `snippets` | Convert pure Snippets extensions (v1.2.6+, see AGENTS.md) |

---

### `language-client`

Generates a coc.nvim LanguageClient that connects to the language server.

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

`id` is used to distinguish multiple LanguageClient instances. It defaults to the plugin name (`origPkg.name`). When a plugin needs to start multiple servers, each `language-client` step should specify a different `id`.

#### server.kind

| kind | Description | Generated LanguageClient parameters |
|------|-------------|-------------------------------------|
| `module` | Node.js module, spawn after require() | `{ module: serverPath, transport }`, supports `args` (v1.4.3+) to generate `{ module: serverPath, transport, args }` |
| `binary` | Standalone executable | `{ command: serverPath, args }` (no transport passed; LanguageClient defaults to stdio) |

`module` supports the `transport` parameter (`ipc` or `stdio`), generating `{ module: serverPath, transport: TransportKind.ipc }`. `binary` does not support the `transport` parameter — `command` mode defaults to stdio, and passing transport may cause some servers (like Deno) to receive unexpected `--stdio` arguments.

#### server.entry

| entry | Description |
|-------|-------------|
| `"main"` (default) | `require.resolve(server.package)` → uses package.json's main field |
| `"bin"` | Reverse-engineer package.json from the entry path, read the bin field. First tries `require.resolve(pkg)`, automatically falls back to `require.resolve(pkg/package.json)` on failure |

`entry: "bin"` solves the Prisma problem: the package's `main` field points to the library entry (not spawnable), while the `bin` field points to the actual server entry. The generated code resolves the `bin` field at **runtime** by reverse-looking up package.json from the main entry path, rather than using `require.resolve('pkg/package.json')` — because modern npm packages' `exports` field may block `package.json` subpath resolution.

`entry: "bin"` also supports packages without a `main` field (such as `@tailwindcss/language-server`), automatically falling back to `require.resolve('pkg/package.json')`.

#### server.binName

When a package's `bin` field contains multiple entries, use `binName` to specify which one to use. When not specified, defaults to the first one.

```json
{
  "kind": "module",
  "package": "@tailwindcss/language-server",
  "entry": "bin",
  "binName": "tailwindcss-language-server"
}
```

`@tailwindcss/language-server`'s `bin` field has two entries: `css-language-server` and `tailwindcss-language-server`. Use `binName` to select the fully-featured `tailwindcss-language-server`.

#### server.binary (binary kind only)

```json
"binary": {
  "repo": "denoland/deno",
  "asset": "deno-{{rust-target}}.zip",
  "binaryPath": "deno"
}
```

Pipeline handles downloading, extracting, and placing into `build/server/`.

##### Template variables

`asset` and `binaryPath` support the following template variables, replaced by the pipeline during download:

| Variable | Description | Example value |
|----------|-------------|---------------|
| `{{version}}` | GitHub release version number (without v prefix) | `1.45.0` |
| `{{platform}}` | Current OS platform | `darwin` / `linux` / `win32` |
| `{{arch}}` | CPU architecture | `x64` / `arm64` |
| `{{rust-target}}` | Rust compile target triple | `x86_64-apple-darwin` / `x86_64-unknown-linux-gnu` / `aarch64-apple-darwin` |

`{{rust-target}}` is derived from the mapping of `{{platform}}` + `{{arch}}` and is suitable for binary assets published by Rust projects.

#### server.args

CLI arguments passed to the server. Used for binary kind (default) and module kind (v1.4.3+). For example Deno: `["lsp"]`, Taplo: `["lsp", "stdio"]`, Angular: `["--ngProbeLocations", "{pluginDir}"]`.

##### Placeholders (module kind only, v1.4.3+)

| Placeholder | Runtime value | Description |
|-------------|---------------|-------------|
| `{dir}` | `__dirname` | Compiled output directory |
| `{pluginDir}` | `require('path').resolve(__dirname, '..')` | Plugin root directory |

Module kind's `args` are passed as an array in the generated serverOptions:
```typescript
{ module: serverPath, transport: TransportKind.ipc, args: ['--flag', require('path').resolve(__dirname, '..')] }
```

#### transport

| transport | Description |
|-----------|-------------|
| `"ipc"` (default) | TransportKind.ipc, Node.js IPC |
| `"stdio"` | TransportKind.stdio, standard input/output |

#### languages

Declares the document selector. Generates `documentSelector: [{ scheme: "file", language: "prisma" }]`.

#### multiRoot (not yet implemented)

When `true`: creates a LanguageClient instance for each workspace folder. Currently `multiRoot` exists in the type definition but the generated code does not use this parameter.

---

### `source`

Copies the parts of source files that use VS Code API and applies transforms. Covers non-LSP code (command registration, status bar, completion providers, etc.).

The scanner detects all files containing `from 'vscode'` or `require('vscode')`; these files are automatically copied and transforms are applied. There is no need to declare file names one by one — the scanner only does this, not any server detection.

```json
{
  "type": "source",
  "transforms": ["import-mapping", "enum-offset", "class-to-factory", "provider-register"],
  "entry": "src/extension.ts",
  "keepDeps": ["lodash", "execa"]
}
```

transforms are declared in the `source` step and only apply to files detected by the scanner.

| transform | Description |
|-----------|-------------|
| `import-mapping` | `from 'vscode'` → `from 'coc.nvim'` + text polyfills (showMessage, createStatusBarItem, etc.) |
| `enum-offset` | Add enum value difference comments |
| `class-to-factory` | `new SomeClass()` → `SomeClass.create()` |
| `provider-register` | Adapt provider registration signatures |
| `strip-volar` | Remove Volar-specific framework imports (like `@vue/vscode-snippets`, `@vue/vue-language-core`, etc.), only used in Volar entries |

#### Text post-processing (convert.ts)

After step execution, convert.ts performs the following text replacements on all output source files:
- `.fileName` → `Uri.parse($1.uri).fsPath` (coc's TextDocument has no fileName property). Added `(?<![\w$])` negative lookbehind to avoid matching `_document.fileName`
- `const { fileName, ...rest } = doc` destructure → split into `{ ...rest } = doc; const fileName = Uri.parse(doc.uri).fsPath`
- `.uri.fsPath` → `Uri.parse($1.uri).fsPath` (coc's uri is a file:// URI string). First character restricted to `[a-zA-Z_$]` to avoid matching array indices
- `getWordRangeAtPosition` → inline word boundary calculation

After introducing `Uri.parse()`, automatically adds `Uri` to the `from 'coc.nvim'` import.

#### entry

The `source` step copies all `.ts/.tsx` files to the output directory and applies transforms to files containing `from 'vscode'`. `entry` specifies the esbuild entry point (only used when there is no `language-client` step).

When both `language-client` and `source` steps exist, `src/index.ts` is a self-contained entry point that does **NOT import** files from the `source` step. The `source` step files only serve as supplements (they are bundled by esbuild only when indirectly referenced by other files).

Steps are only responsible for generating source code. After step execution, the pipeline calls esbuild to bundle all source code into `lib/index.js`.

#### activationEvents (optional)

Declares the plugin's activation events, only used when there is no `language-client` step. The pipeline reads this field and writes it to the output `package.json`'s `activationEvents`.

```json
{
  "type": "source",
  "transforms": ["import-mapping"],
  "entry": "src/extension.ts",
  "activationEvents": ["onLanguage:html", "onCommand:extension.sayHello"]
}
```

When a `language-client` step exists, activationEvents are automatically generated by that step.

#### keepDeps

List of runtime dependencies to preserve from the original package.json. Used to retain non-server dependencies (such as lodash, chokidar, etc.).

Version resolution rules (three-step fallback):

```
1. Look for the package name in the original package.json's dependencies → use if found
2. Not found → look in devDependencies → use if found
3. Not found → look upward in workspace root (../package.json, ../../package.json...) dependencies/devDependencies → use if found (handles monorepo scenarios, not yet implemented)
4. All failed → report error, prompt manual version completion (not yet implemented, currently silently returns undefined)
```

If auto-resolution all fails, you can use object syntax in the registry to manually specify version numbers:

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

The array syntax (auto-resolve) and object syntax (manual specification) are mutually exclusive; mixing them will cause an error.

---

### `bridge`

Uses preset code generators to produce standalone entry code. Used for **plugins with a large number of non-portable APIs**, whose source code cannot be fully converted via `import-mapping`.

Principle: use `source` when possible. `bridge` is a fallback strategy, only used when `import-mapping` cannot handle it.

Current presets:

| Preset | Applicable plugins | Generated content |
|--------|--------------------|-------------------|
| `ts-bridge` | Volar | TypeScript plugin bridge code: `activate()` entry point, TS language service middleware, command forwarding layer |

Bridge steps work in conjunction with other steps: `bridge` generates the core bridge layer, `source` converts the non-bridge parts of the original source code, and both are bundled together via esbuild.

```json
{
  "type": "bridge",
  "preset": "ts-bridge"
}
```

Bridge code is generated by built-in safe templates in the converter; no executable code is stored in the registry. Adding a new preset requires two steps:

1. Add a new type in `BRIDGE_TEMPLATES` in `converter/src/steps/bridge.ts` (audited code template)
2. Add a preset definition in [coc-vscode-registry/presets.json](https://github.com/coc-plugin/coc-vscode-registry/blob/main/presets.json) that references this type

```typescript
// converter/src/steps/bridge.ts
const BRIDGE_TEMPLATES = {
  'custom-bridge': (opts) => ({
    code: `...`,                      // Safe template code
    injectExts: opts.extensions || [], // coc extensions to activate
    injectSvcs: opts.services || [],   // Services to start
    callAfter: 'registerBridge(...)',  // Callback after client starts
    extraDeps: ['typescript'],         // Extra dependencies
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

Marks unsupported features, adding warning comments in the generated code without producing executable code.

```json
{
  "type": "mark-unsupported",
  "features": ["decoration", "webview", "tree-data-provider", "open-external"]
}
```

Supported features:

| feature | Warning content |
|---------|-----------------|
| `decoration` | "Decoration API is not supported in coc.nvim" |
| `webview` | "Webview API is not supported in coc.nvim" |
| `tree-data-provider` | "Tree data provider is not supported" |
| `open-external` | "env.openExternal has no equivalent" |

---

### `snippets`

Converts pure Snippets extensions (v1.2.6+). Automatically reads the source `package.json`'s `contributes.snippets`, copies JSON files and generates an empty entry point.

```json
{
  "type": "snippets"
}
```

Output:
- `./snippets/*.json` — Copied from source extension at the original relative path
- `src/index.ts` — Empty shell entry (just `export function activate() {}`)

> coc-snippets discovers snippet files through `package.json`'s `contributes.snippets`, so `convert.ts` preserves the original declaration. Snippet JSON files must be placed at the **original relative path**.

---

## Output package.json generation

The output plugin's `package.json` is generated by the converter after step execution (not by the pipeline). Generation rules:

| Field | Source |
|-------|--------|
| `name` | `origPkg.name` + `"coc-"` prefix (e.g. `coc-prisma`) |
| `main` | Fixed to `"lib/index.js"` |
| `activationEvents` | Collected from each step: `language-client` auto-generates `onLanguage:<lang>`; `source.activationEvents` is passed through directly |
| `contributes` | Passed through from the original plugin's `package.json` `contributes.configuration` and `contributes.commands`; the bridge step additionally generates `typescriptServerPlugins` |
| `dependencies` | server dependencies + `keepDeps` resolution results + original `dependencies` (filtered) |
| `devDependencies` | Fixed `esbuild: "^0.28.0"` |

---

## Complete examples

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

`keepDeps` preserves the original dependencies outside the server. The converter automatically reads version numbers from the source `package.json`.

### Angular Language Service

```json
{
  "name": "ng-language-service",
  "displayName": "Angular Language Service",
  "type": "pure-lsp",
  "languages": ["html", "typescript"],
  "categories": ["LSP"],
  "convert": [
    {
      "type": "language-client",
      "server": {
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
      },
      "languages": ["html", "typescript"]
    },
    {
      "type": "source",
      "transforms": ["import-mapping"]
    }
  ]
}
```

`@angular/language-server`'s `requireOverride` intercepts `require('typescript/lib/tsserverlibrary')` and finds TypeScript via the `--tsProbeLocations` parameter. `{pluginDir}` expands to `require('path').resolve(__dirname, '..')` (plugin root directory) in the generated code, allowing the server to discover `node_modules/typescript` and `node_modules/@angular/language-service`.

Requires `minPluginVersion: "1.4.3"` (module kind `args` support was added in this version).

Generated code structure:

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
  "name": "vscode-volar",
  "displayName": "Volar (Vue)",
  "description": "Vue language support — template/script/style IntelliSense",
  "type": "ts-bridge",
  "languages": ["vue"],
  "categories": ["LSP", "TypeScript"],
  "minPluginVersion": "1.2.0",
  "notes": "Vue IntelliSense requires coc-tsserver-dev (not coc-tsserver) due to an unmerged PR for globalPlugins support. See: https://github.com/neoclide/coc-tsserver/pull/493",
  "convert": [
    {
      "type": "bridge",
      "preset": "ts-bridge"
    },
    {
      "type": "language-client",
      "server": {
        "kind": "module",
        "package": "@vue/language-server",
        "entry": "main"
      },
      "languages": ["vue"]
    },
    {
      "type": "source",
      "transforms": ["import-mapping", "strip-volar"]
    }
  ]
}
```

Volar uses three steps: `bridge` generates TypeScript bridge code, `language-client` creates a LanguageClient to connect to the Vue language server, and `source` converts the remaining source code (using `strip-volar` to remove Volar-specific framework imports).

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

Prettier uses the `source` step to directly convert prettier-vscode's source code (rather than a bridge generator). The `import-mapping` text replacement layer handles its specific APIs:
- `window.activeTextEditor` → runtime polyfill
- `languages.createLanguageStatusItem` → no-op (supports `vscode.` prefix)
- `registerDocumentFormatProvider(sel, provider, 1)` → priority=1 to avoid being overridden by tsserver
- `{ fileName } = doc` destructure split → convert.ts generic handling

**Required registry patches** (in `patches` field):
- `editor.edit()` → `workspace.applyEdit()` — `Document.applyEdits()` returns success but doesn't modify Neovim buffer
- `document.getText()` → `(document.textDocument || document).getText()` — handles both `Document` and `TextDocument` types
- `document.positionAt(` → `(document.textDocument || document).positionAt(` — same reason
- `forceFormatDocument` + `formatFile` commands registration — adds `prettier.formatFile` alias

`keepDeps: ["prettier"]` retains the prettier runtime dependency (the original package.json had prettier filtered out).

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

`@tailwindcss/language-server` has no `main` field, only exposes entry points via `bin` (`css-language-server` and `tailwindcss-language-server`). Uses `binName` to specify the full-featured `tailwindcss-language-server`. `entry: "bin"`'s `require.resolve` falls back to `require.resolve('pkg/package.json')`.

Requires `minPluginVersion: "1.2.2"` (because `binName` and `require.resolve` fallback logic were added in this version).

### Haskell（New plugin example）

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

## Validation rules

Validation is divided into two phases: CI time (PR phase) and conversion time (when converter is executing):

### CI time validation (`scripts/test-regression.sh`)

| Condition | Validation method |
|-----------|-------------------|
| `kind: "module"` + `package` | `npm view <package>` exists |
| `entry: "bin"` | `npm view <package> --json` has bin field |
| `binName` | The name exists in `npm view <package> --json`'s bin |
| `entry: "bin"` + no `main` field | `npm view <package> --json` has no main, auto-fallback to `require.resolve('pkg/package.json')` |
| `kind: "binary"` + `binary.repo` | GitHub API `repos/<repo>/releases/latest` is accessible |
| `type: "snippets"` or `convert` contains `snippets` | Source `package.json`'s `contributes.snippets` exists and is non-empty |
| `kind: "binary"` + `binary.asset` | Asset matches a published release after template variable rendering |
| `bridge.preset` | Preset is registered |

### Conversion time validation (when converter is executing)

| Condition | Validation |
|-----------|------------|
| `languages` | Non-empty array |
| `source.entry` | File exists in source directory |
| `transforms` | Each transform is registered |
| `keepDeps` (array syntax) | Each package name can be found in source package.json's dependency/devDependency |
| `keepDeps` (object syntax) | Version not validated (manually specified, no auto-resolution) |
| Dependency version (array syntax) | Can be found in source package.json |
| `bridge.preset` | Preset is registered |

---

## Migration plan

### Phase 1: Infrastructure (completed ✅)

- [x] Add complete step type definitions in `converter/src/types.ts`
- [x] Update `cli.ts`: add `--convert <JSON>` parameter to receive step configuration
- [x] Update `pipeline.ts`: read `convert` from registry and pass it to the CLI
- [x] Refactor `convert.ts` core loop: execute by steps, no heuristic scanning
- [x] Add `language-client` code generator (module/binary)
- [x] Add `source` code generator (copy + transforms + esbuild)
- [x] Add `bridge` code generator (preset system)
- [x] Add `mark-unsupported` code generator
- [x] Add `snippets` code generator (v1.2.6+)
- [x] Add step validation logic
- [x] Delete heuristic functions like `detectServerModules`
- [x] Remove regex-based post-processing in pipeline (documentSelector, activationEvents, bin-walking, etc.)
- [x] Keep pipeline: npm install, esbuild, binary download, pip install

### Phase 2: Registry migration (completed ✅)

- [x] Add `convert` configuration for all 7 existing plugins
- [x] Verify each generated plugin works correctly (Prisma ✅ Volar ✅ Deno ✅ Taplo ✅ Lua ✅ Ansible ✅ HTML CSS ✅)

### Phase 3: Testing (completed ✅)

- [x] Create `scripts/test-regression.sh` (36 tests covering all step types and edge cases)
- [x] 165 unit tests (15 files), including fixture tests
- [x] Smoke test (`test:smoke`): fully convert 128 registry entries, validate output structure
- [x] Baseline diff (`diff:check`): compare output file SHA-256 fingerprints, detect unexpected changes
- [x] `check-tests` enforcement: each source file must have a corresponding `.test.ts` containing at least one `it()`
- [x] Pre-commit hook auto-runs `npm test`

### Pending fixes

- [ ] `keepDeps` step 3 workspace root lookup (monorepo scenario)
- [ ] `keepDeps` should report an error on resolution failure instead of silently returning
- [ ] `multiRoot` support for multiple workspace folders
- [ ] CI validation rules for registry entries (`npm view` server package existence, etc.)

---

## Deletion checklist

After deletion, these code are no longer needed:

| File | Deletion content |
|------|------------------|
| `converter/src/convert.ts` | `detectServerModules()` function |
| `converter/src/convert.ts` | All regex-based server detection logic |
| `converter/src/scanner.ts` | Can be kept for detecting `from 'vscode'`, remove server-related detection |
| `plugin/src/pipeline.ts` | documentSelector regex replacement |
| `plugin/src/pipeline.ts` | activationEvents regex replacement |
| `plugin/src/pipeline.ts` | config.get() to binary path regex replacement |

---

## Comparison: Old vs New

| Dimension | v1.x (heuristic) | v2.0 (config-driven) |
|-----------|------------------|----------------------|
| Adding new plugins | Tweak regexes, may affect existing plugins | Write JSON declaration, fully isolated |
| Debugging | What did the regex match? Unknown | Each step independently validated, precise errors |
| Reliability | Works if guesses are correct, breaks if not | What is declared is deterministic |
| Mixed types | Not supported (pure-lsp vs direct-api binary choice) | Step arrays can be combined |
| Testing | Manual testing | Configuration is the test case |
| Learning cost | Need to understand 500 lines of regex logic | Just need to understand 6 JSON fields |
