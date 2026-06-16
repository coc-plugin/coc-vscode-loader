# Changelog

## [1.4.4] - 2026-06-16

### Fixed
- **converter/transforms/class-to-factory**: fix `CompletionItem.create(label, kind)` split — `depth === 0` was never matching commas inside `create()` args, causing all `item.kind` assignments to be silently dropped since v1.4.2. Now correctly uses `depth === 1` to find the argument-separating comma. Affects all plugins using `CompletionItem.create` with a kind argument (e.g. `vscode-html-css-support` missing completion icons)
- **converter/transforms/import-mapping**: add general `await import(...)` → `require(...)` and bare `import(...)` → `require(...)` replacement (was only converting `import('vscode')`), fixing `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` in coc.nvim's CJS sandbox (e.g. `coc-prettier-vscode`)

### Changed
- **plugin/pipeline**: npm install now uses `--no-audit --no-fund` to skip unnecessary audit/funding checks, speeding up dependency installation
- **plugin/pipeline**: use local `tsx` binary from converter's `node_modules` instead of `npx tsx`, avoiding first-time `npx` download delay
- **converter**: move `tsx` from devDependencies to dependencies (runtime requirement for converter CLI)
- **converter**: bump to v1.4.4
- **plugin**: bump to v1.4.4

## [1.4.3] - 2026-06-16

### Added
- **Angular Language Service** — `vscode-ng-language-service` (via `@angular/language-server`), pure-lsp type with `binName` + `args` support
- **`args` field for module-kind servers** — `language-client` step now supports `args` on `kind: "module"` server config. Supports `{dir}` and `{pluginDir}` placeholders resolved at codegen time

### Changed
- **converter**: bump to v1.4.3
- **plugin**: ensure converter/plugin version parity

## [1.4.2] - 2026-06-15

### Added
- **Registry website** — redesigned with dark/light theme toggle (persisted to localStorage); mobile-responsive layout with three breakpoints; new card fields: `minPluginVersion`, `pipPackages`, `serverBinary` labels; card animations, search icon, gradient accent colors

### Changed
- **converter**: bump to v1.4.2
- **plugin**: ensure converter/plugin version parity
- **README**: preview images now stacked vertically at 100% width

### Fixed
- **converter/presets**: removed dead bridge preset system (`presets.ts`, `presets.test.ts`)
- **plugin/pipeline**: `git fetch + reset --hard origin/HEAD` instead of `git pull` for safer shallow-clone updates
- **plugin/registry**: atomic cache writes via temp + rename; deduplicate concurrent registry fetch; filter pre-release versions in `satisfiesVersion`
- **plugin/state**: preserve busy status (`installing`/`updating`/`uninstalling`) during registry reconcile; cap progressLog at 500 entries
- **plugin/tui**: reorder keymap setup before render; add render failure and `showDetailPopupBusy` guards; remove unused `keyMap`/`focusLineOffset`
- **converter/transforms**: balanced paren matching for `CompletionItem.create` and `createStatusBarItem`; guarded `CodeAction` try-catch; handle bare `import()`, `import type`, and shebang/`use strict` header
- **converter/steps/snippets**: `parseShellCommand` for quoted build args; fix indentation
- **converter/steps/source**: warn on syntax errors in `.js` files; auto-inject Uri/workspace imports
- **converter/steps/language-client**: handle string `bin` field; isolate restart failures per client

## [1.4.1] - 2026-06-15

### Fixed
- **`client` variable hoisting in language-client step** — hoist `client` from block-level `const` to function-level `let` so bridge code injection `registerBridge(context, client)` can access it. Fixes `client is not defined` error in Volar and other ts-bridge plugins.
- **`_mainEntry` undeclared for binary servers** — add `let _mainEntry: string | undefined` declaration in binary server path code, preventing ReferenceError at runtime.
- **`initializationOptions` escaping** — remove harmful backtick/`${}` escaping that injected `\`` into generated code.
- **Multi-line volar imports** — `strip-volar` transform now uses `[\s\S]*?` instead of `.*` to handle multi-line `import { ... } from '@volar/vscode'`.
- **`await import()` scope** — narrow replacement from all `await import(...)` to only `await import('vscode')`, preserving non-vscode dynamic imports.
- **`workspace.workspaceFolders` guard** — extend guard from bracket-only access `[...]` to also cover property access (`.xxx`) and for-of iteration; preserve standalone truthiness checks.
- **Multiple trigger chars** — `provider-register` now wraps ALL trailing string arguments in an array instead of just the last one.
- **Node 18 compatibility** — replace `fs.readdirSync(dir, { recursive: true })` with manual directory walk.
- **spawn crash safety** — add missing `.on('error')` handlers to `rimraf()`/`cpdir()`; add `settled` guard to prevent double `reject()` in `run()`/`runWithOutput()`.
- **Binary path directory support** — create parent directories before `renameSync` when `binaryPath` contains subdirectories.
- **npm registry caching** — fix `npmRegistryUrl()` re-running `execSync` on every call.
- **State staleness** — `refreshPackages()` now recomputes `status` for existing entries against the filesystem.
- **Detail popup scrolling** — add j/k scrolling and dynamic height (up to 70% screen) for log detail popup.
- **WinEnter close** — allow `help`/`terminal`/`quickfix` buffer types without closing the TUI.

## [1.4.0] - 2026-06-15

### Added
- **Test infrastructure** — 115 unit tests across 15 test files covering all transforms, steps, scanner, and the main conversion pipeline
- **Registry smoke test** — `npm run test:smoke` converts all 112 registry entries, validates output structure. `git fetch --depth 1` for incremental repo updates
- **Test coverage check** — `npm run check:tests` verifies every source file has a valid `.test.ts` with `it()`/`test()` calls
- **Pre-push hook** — automatic `npm test` + `npm run test:smoke` on every `git push`
- **GitHub Actions CI** — unit tests on push/PR (Node 20/22); smoke test after unit passes

### Fixed
- **`{ fileName }` destructuring** — `const { fileName } = document` now correctly converted to `Uri.parse(document.uri).fsPath` (was gated on `.fileName` check)
- **`require('vscode')` single-quote detection** — `source.ts` now also checks for single-quoted `require('vscode')` (was double-quote only)
- **`@vscode/` filter** — changed from `'@vscode/'` to `'@vscode/test-electron'` to avoid filtering out runtime deps like `@vscode/l10n`
- **devDeps priority** — `dependencies` now correctly override `devDependencies` (was reversed), matching npm behavior
- **Nested parens in import-mapping** — `setDecorations`, `createLanguageStatusItem`, `showOpenDialog`, `authentication.getSession` regexes now use paren-balanced matching instead of `[^)]+`
- **pluginName in provider-register** — `TransformContext` now receives `pluginName` from `origPkg` instead of always resolving to `"output"`
- **Scanner JS support** — scanner now detects `.js` files with vscode imports
- **CLI error messages** — `--presets-file` parse failure now shows error message (was silent)

### Changed
- TUI search: active query displayed in header bar, matched text highlighted in package list
- Cursor no longer jumps on install/update (focusIndex synced to actual cursor before actions)
- Detail popup extmarks now batched via `pauseNotification`/`resumeNotification`
- ESM `require()` dead code removed from `source.ts:resolveDepVersion`
- Documentation updated: README, CONTRIBUTING, converter/README, PR template, AGENTS.md

## [1.3.0] - 2026-06-15

### Added
- **Registry expansion: 4 packages** — PHP Intelephense (17.5M), Rust Analyzer (6.3M), Simple React Snippets (6.4M), JS JSX Snippets (1.4M)
- **Converter fix** — `language-client` step now correctly handles module-based servers without `bin` field: `if (!serverPath)` → `if (!serverPath && !_mainEntry)`, preventing false "Cannot find language server" errors

## [1.2.9] - 2026-06-15

### Fixed
- **Snippets converter** — when snippet source files don't exist at expected paths, warn with clear message instead of crashing; add `build` field support for repos that generate snippets via compile step (e.g. `vscode-es7-react-snippets` needs `npm run compile`)
- **Registry data quality** — corrected repo URLs for `vscode-jquery-snippets` and `vscode-java-imports-snippets`; added `subdir` for `vscode-bootstrap-v4`; removed 4 broken entries (`vscode-tensorflow`, `vscode-asp-net-core`, `vscode-bootstrap4`, `vscode-material2`)
- **Snippets path fallback** — when `ss.languages` resolves no paths from `contributes.snippets`, populate with default `./snippets/{lang}.json` paths instead of throwing

## [1.2.7] - 2026-06-15

### Added
- **Virtual scrolling** — replaced page-based navigation (`[`/`]`) with `j`/`k` per-package scroll; `scrollOffset` + `focusIndex` replace `currentPage` + `PAGE_SIZE`; only visible packages rendered based on window height (supports 100k+ entries)
- **Detail popup** — floating window with dual-mode (log/info) and syntax highlighting via extmarks; auto-refresh during install/update; scroll to end in log mode
- **Focus management** — cursor tracking moved from reactive `AppState` to local `TUI` fields; direct `nvim_win_set_cursor` positioning skips unnecessary re-renders
- **Byte-aware commit message truncation** — long commit msgs clipped in middle (preserving hash + date) with `…` ellipsis, `Buffer.from` byte-length for correct CJK/emoji rendering
- `LineBuffer.currentByteLen()` for measuring rendered line byte lengths
- `I` key batch install for marked packages
- Filter cache in `StateManager` — avoids redundant sort/filter on every render
- `getInstalledSet()` — single `readdirSync` replaces N `existsSync` calls
- **Snippets converter** — build script support (`build` field in config); fail fast on missing snippet files with clear error messages
- **Intra-package `j`/`k` navigation** — scroll through detail/log lines within same package before moving to next/previous
- **Detail popup height** — log mode uses fixed 20 lines for full command output visibility; info mode uses content-based sizing capped at 20

### Fixed
- `pauseNotification`/`resumeNotification` imbalance — wrapped in try/finally to prevent Neovim RPC deadlock
- `runConcurrent` aborting all remaining work on single failure — per-item `.catch(() => {})` + `Promise.allSettled`
- `uninstallPackage` missing `await` in command handler
- `checkUpdates` concurrency race (added `checkUpdatesBusy` lock) + stale snapshot iteration
- Focus index jumping on scroll — scrollOffset now follows focusIndex instead of clamping forward
- Removed redundant `[installed]` status text (icon already indicates status)
- Removed unused `appendLog` parameter from `setPackageStatus`
- `lastUpdate` not refreshed on reinstall
- Postinstall failures silently swallowed — now reported as warning
- `downloadSource` no longer overwrites progress with raw git output
- Update short-circuits on "Already up to date." — skips convert/build/install
- Converter: nested `NewExpression` replacement order (inner before outer)
- Converter: paren-balancing for `registerCompletionItemProvider` trigger chars
- Converter: multi-root `LanguageClient` leak — track all clients in array
- Converter: template injection in `initializationOptions` (escape backticks/`${}`)
- Converter: missing `require('vscode')` single-quote variant in scanner

## [1.2.6] - 2026-06-14

### Added
- **Registry expansion: 114 packages** — 99 snippet extensions added (JavaScript, React, Vue, Angular, Bootstrap, Flutter, Django, Laravel, Svelte, etc.)
- TUI pagination: `[`/`]` prev/next page, `gg`/`G` first/last page (PAGE_SIZE=50)
- TUI flat package list (removed Installed/Available sections, use `f` to filter)
- Registry download: `--compressed` curl flag + 20MB maxBuffer for 5000+ entries

### Fixed
- Web registry: broken "Load more" buttons due to missing event listeners on dynamic DOM

## [1.2.5] - 2026-06-13

### Fixed
- npm publish missing `converter/node_modules/`: `files` field now includes full `converter/` directory

## [1.2.4] - 2026-06-13

### Fixed
- Performance: replaced all `fs.rmSync`/`fs.cpSync` with async system `rm -rf`/`cp -r` for fast install/uninstall
- Presets fetch: fallback to `curl` when `fetch` fails (lowercase `http_proxy` compatibility)
- Import `execFile` at top level instead of inline `require` calls
- `import-mapping` MAPPINGS: namespace identifier incorrectly renamed causing `vscode2` errors
- Regression from [1.1.7]: `vscode` MAPPINGS entry retained despite module specifier rewrite

## [1.2.3] - 2026-06-13
- Import-mapping: add `authentication.getSession` → `undefined` polyfill (coc has no auth API)
- Import-mapping: add `editor.setDecorations` → no-op polyfill (decoration API not available in coc)
- Raw binary server download support for non-archive assets (e.g. Biome binary from GitHub releases)
- `.tar.gz` / `.tgz` archive extraction support in serverBinary download pipeline
- **JavaScript extension support**: source step now copies `.js` files and applies text-level replacements (`require('vscode')` → `require('coc.nvim')`, `.fileName`/`.uri.fsPath` polyfills, `window.activeTextEditor` polyfill, `window.onDidChangeActiveTextEditor` mapping)
- Text-level replacements in `convert.ts` now also process `.js` files

### Fixed
- `import-mapping` MAPPINGS: removed `'vscode': 'coc.nvim'` entry which incorrectly renamed the namespace identifier, causing `vscode2` runtime errors
- Language-client step: trailing comma when `initializationOptions` is not set (broke all LSP clients)
- ServerBinary download: `rustTarget` variable scope bug causing silent download failures
- ServerBinary download: fall back to `curl` for GitHub API when `fetch` fails (proxy compatibility)
- ServerBinary download: template variable resolution runs after esbuild creates `lib/index.js`
- Performance: replaced all `fs.rmSync`/`fs.cpSync` with async system commands (`rm -rf`/`cp -r`) for install/uninstall operations

## [1.1.7] - 2026-06-13

### Fixed
- Registry fetch hanging with lowercase `http_proxy` env vars: fall back to `curl` when
  Node.js `fetch` times out
- Local dev mode now fetches remote registry first, falls back to local file (instead of
  always reading local file)

## [1.1.5] - 2026-06-13

### Fixed
- TUI showing zero packages indefinitely after opening: explicitly call `render()` after
  background registry fetch completes, instead of relying on `notify()` → `render()` chain

## [1.1.4] - 2026-06-13

### Fixed
- Prisma LSP stuck at "starting": converter no longer strips server module bin-walking code,
  allowing `@prisma/language-server` to resolve its `bin` entry (`dist/bin.js`) instead of
  the library `main` entry
- Prisma install failure: `detectServerModules` regex no longer false-matches `${serverUrl}`
  template literal placeholders in webview HTML generation code
- Ansible pip install failure on macOS 14.4+: `--break-system-packages` now applied on
  macOS (darwin) with runtime Python >= 3.11 version check
- TUI not refreshing after operations complete: added `pendingRender` flag to re-render
  when state updates arrive during an in-progress render
- Concurrent `uninstallPackage` calls no longer race on `extensions/package.json`
  (added missing `await`s)
- `pkg.dependencies` guard: `installToCoc` and `uninstallPackage` now handle missing
  `dependencies` key in `extensions/package.json`
- `satisfiesVersion` no longer breaks on pre-release version strings (e.g. `1.1.3-alpha`)
- Error messages from failed CLI commands now include stderr output for easier debugging

### Added
- All registry packages now require `minPluginVersion: "1.1.3"`
- Config-based server path replacement for binary servers in built packages

## [1.1.1] - 2026-06-12

### Added
- Auto-fetch remote registry in background when TUI opens
- `StateManager.refreshPackages()` to merge updated registry entries

### Changed
- `switch.sh npm` handles npm 11 reify changes (backup/restore `file:` deps)
- Remote registry now sole source of packages (built-in removed)
- Background registry fetch is silent (no startup notification)

## [1.1.0] - 2026-06-12

### Changed
- Binary language server download support via `serverBinary` in registry

## [1.0.3] - 2026-06-12

### Added
- `scripts/convert-plugin.sh` for one-step convert & install

## [1.0.2] - 2026-06-12

### Added
- TUI preview image in README

### Changed
- Install instructions for npm published package
- Image path uses repo-relative URL for npm compatibility

## [1.0.1] - 2026-06-12

### Added
- npm package metadata (keywords, repo, license, homepage)

### Changed
- Bump to 1.0.1 for npm publish

## [1.0.0] - 2026-06-12

### Added
- Real conversion pipeline: git clone → converter → npm install → esbuild → install to coc
- TUI: `C` key for checking remote updates via `git ls-remote`, with `↑` indicator
- TUI: status messages during operations (checking, installing, etc.)
- Registry hot-update: `:CocCommand loader.updateRegistry` fetches from remote
- Commit SHA tracking: installed packages show current commit in detail view
- `coc-vscode-registry` standalone repo for API docs and registry

### Changed
- `pipeline.ts`: simulated steps → real git/npm/tsx operations
- `state.ts`: added `dirty`, `hasUpdate`, `statusMessage` for better UX
- `tui.ts`: auto-restart coc on close when changes detected
- Renamed plugin: `coc-converter` → `coc-vscode-loader`
- Renamed commands: `converter.*` → `loader.*`
- Registry reduced to 3 verified packages (Volar, Prisma, HTML CSS Support)
- Repo restructured: `plugin/`, `examples/`, `types/` layout

### Removed
- Unverified packages (Angular, ESLint, JSON, YAML) from built-in registry
- Simulated sleep-based pipeline steps
- API docs moved to standalone repo
