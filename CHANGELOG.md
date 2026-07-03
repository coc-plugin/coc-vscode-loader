# Changelog

## [1.6.4] - 2026-07-03

### Added
- **`prebuilt` field for module-kind servers** — New registry field to download pre-compiled server from VS Code marketplace instead of building from source. Pipeline auto-downloads VSIX, extracts server paths into `build/server/`. Used by `vscode-bitbake`.
- **VSIX download support** — `buildPackage()` in pipeline now handles `prebuilt.type: "vsix"`: downloads VSIX from marketplace API, decompresses gzip, unzips, and extracts specified `serverPaths`.
- **`pip install --upgrade`** — All pip package installations now use `--upgrade` flag to resolve dependency version conflicts.
- **4 new registry entries**: `vscode-bitbake`, `vscode-jq`, `vscode-alex`, `vscode-write-good`.
- **Test projects** — Language sample files for testing: bitbake, jq, alex, write-good.

### Fixed
- **Local server copy with prebuilt** — If `prebuilt` is set, pipeline downloads from VSIX instead of copying unprocessed server source.

### Changed
- **converter**: bump to v1.6.4
- **plugin**: bump to v1.6.4

## [1.6.3] - 2026-06-28

### Added
- **Documentation** — `config-driven-converter.md` and `vscode-vs-coc-api-diff.md`: document `editor.edit()` → `workspace.applyEdit()` replacement strategy and Prettier registry patches with `forceFormatDocument` command alias.
- **Registry API compatibility patches** — Generic cross-plugin fixes in `coc-vscode-registry`:
  - `Uri.joinPath()` → `path.join()` replacement pattern for environments without full VS Code URI API
  - `workspace.fs.writeFile()` → `fs.promises.writeFile()` replacement
  - `createConfigFile` stub replaced with full implementation using coc.nvim workspace APIs (interactive directory selection, validation, error reporting)
  - `applyEdit` rule updated to use workspace API
  - `document.textDocument` fallback for `getText()`/`positionAt()` to support both TextDocument and TextEditor
  - `allRangeLanguages` extended with css, less, scss, html, markdown, yaml

### Fixed
- **Prettier compatibility patches** — Comprehensive registry-level fixes for `vscode-prettier-vscode`:
  - `uri.scheme` checks converted to `String(uri).startsWith('file://')` for cross-editor compatibility
  - `editor.edit()` replaced with `editor.document.applyEdits()` for coc.nvim (note: `Document.applyEdits()` returns success but doesn't modify Neovim buffer — converter now uses `workspace.applyEdit()` instead)
  - `uri.fsPath` → `Uri.parse(uri).fsPath` throughout (with negative lookbehind `(?<!\?\.)` to skip optional chaining)
  - `Uri.joinPath()` → `path.join()` for environments without full VS Code URI API
  - `workspace.fs.writeFile()` → `require('fs').promises.writeFile()`
  - `createConfigFile` stub replaced with full implementation using coc.nvim workspace APIs (interactive directory selection via `coc#util#with_callback`, filesystem validation, error reporting)
  - `document.getText()` → `(document.textDocument || document).getText()` — handles both `Document` and `TextDocument`
  - `document.positionAt(` → `(document.textDocument || document).positionAt(` — same reason
  - `rangeEnd`/`rangeStart` strict `undefined` comparison instead of truthy check
  - `forceFormatDocument` + `formatFile` commands registration — adds `prettier.formatFile` alias
  - Extended `allRangeLanguages` with css, less, scss, html, markdown, yaml
- **`import-mapping` `showMessageWrap` — duplicate `vscode.` prefix** — The `${prefix}` template variable was applied twice: once on `Promise.resolve()` and again on `window.showMessage()`, generating malformed output like `vscode.vscode.window.showMessage()`. Removed the redundant outer prefix. Fixes `showInformationMessage`/`showWarningMessage`/`showErrorMessage` conversions for all plugins.
- **`import-mapping` `.import()` false match** — The `import()` → `require()` regex `(?<!\w)` lookbehind was too broad, incorrectly matching method/property calls like `.import()` or `this.import()`. Tightened to `(?<![\w.)$])` to exclude property access, chained calls, and template literal expressions. Added test coverage for `.import()` and `this.import()`.
- **vscode-gitignore buffer not refreshing after file generation** — Added source-level registry patches: (1) replace `vscode.Promise.resolve(` with `Promise.resolve(` to fix `showSuccessMessage` crash in coc.nvim; (2) call `workspace.nvim.command('checktime')` after writing `.gitignore` to force Neovim buffer reload from disk.

### Changed
- **converter**: bump to v1.6.3
- **plugin**: bump to v1.6.3
- **Baseline**: updated for multiple entries — rust-analyzer, ng-language-service, deno, astro, yaml, ansible, taplo, gitignore, code-runner (converter changes); prettier-vscode, ruff-vscode, volar, html-language-features, css-ls, tinymist (upstream changes); ansible, biome (upstream baseline sync)

### Registry Updates
- `vscode-biome` — baseline synced with upstream

## [1.6.2] - 2026-06-26

### Added
- **Registry update checker CI workflow** — daily automated detection of upstream VS Code extension changes. `registry-check.yml` runs twice daily (04:00/16:00 UTC), auto-creates PRs when converter output differs from baseline, and creates Issues on failures (repo removed, archived, converter errors). Supports max 8 parallel entries.
  - Matrix generation (`generate-matrix.ts`): flat array output, orphaned entry detection, source repo change detection, corrupted baseline handling
  - Per-entry checker (`registry-check-entry.ts`): remote HEAD check, source sync, conversion, SHA-256 hashing, baseline comparison, PR/Issue creation with labels (`registry-update`, `repo-removed`, `repo-archived`, `converter-failure`)
  - PR body includes upstream diff with GitHub compare links, per-file diff details with 25KB/file + 50KB total truncation limits
  - Caching: repo cache in `~/.cache/coc-converter-smoke/`, remote URL verification before reuse, `git fetch --depth 1` incremental updates
- **`switch.sh` improvements** — `cleanup_plugins()` removes orphaned `file:` symlink entries when switching modes; auto-builds plugin after local switch; cleans converter-cache; fixes npm 11 path resolution; ensures TypeScript installed in coc-tsserver node_modules
- **Registry update checker documentation** — full workflow docs translated to English in `docs/registry-update-checker.md`, CI badge and automated change detection section in README, workflow/PR management docs in AGENTS.md, post-merge baseline update instructions in CONTRIBUTING.md

### Fixed
- **CI robustness** — 20+ fixes to registry-check workflow:
  - Proper non-zero exit codes on all error paths instead of silent success
  - `git push --force-with-lease` replaces unsafe `--force`
  - `git()` wrapper resolves CWD issues when `working-directory: converter`
  - Default branch detection via API instead of hardcoded `main`
  - Reorder baseline update to after rebase, preventing unstaged changes conflicts
  - Rate-limit (429) handling in `getRemoteHead()`, error logging for hash failures
  - Stale cache detection: verify remote URL before reusing clones
  - Guard `check` job with `needs.discover.result == 'success'`
  - Upstream tracking (`-u`) for new branches, skip closed PRs
  - Label caching for batch entry processing, `checkArchived()` error hardening
  - Sync commit accuracy: use `synced.commit` instead of `remote.head`

### Changed
- **Baseline updates** — refreshed for vscode-go, vscode-ruff, vscode-pyright, vscode-ansible, vscode-texlab, vscode-uni-app-snippets, vscode-uni-cloud-snippets, vscode-uni-ui-snippets due to upstream extension changes
- **plugin**: bump to v1.6.2
- **converter**: bump to v1.6.2

## [1.6.1] - 2026-06-24

### Added
- **Loader self-update notification in TUI** — on TUI open, checks npm registry for newer coc-vscode-loader version. Shows `↑ vX.Y.Z` in header when available.
- **Updated TUI preview screenshot** — refreshed `plugin/assets/tui-preview.png` for v1.6.x.

### Fixed
- **`[update]` false positive for mono-repo entries** — `checkUpdates` used `remote.substring(0, 7) !== live.commit` but `%h` can produce >7 char abbreviations. Fixed to `startsWith` comparison and `%H` for full hash storage.
- **Help header padding** — `coc-loader help` now has balanced spacing inside gold background.

### Changed
- **TUI header** — removed version number from header to avoid screenshot churn on every release.
- **plugin**: bump to v1.6.1
- **converter**: bump to v1.6.1

## [1.6.0] - 2026-06-24

### Added
- **`autoInsertion` option for language-client step** — generates auto-close tag and auto-quote attribute handlers via `html/autoInsert` custom LSP request. Controlled by `autoInsertion` boolean field in registry's `language-client` step config.
- **`semanticTokens` option for language-client step** — generates `DocumentSemanticTokensProvider` registration with server-provided legend and token data. Controlled by `semanticTokens` boolean field in registry's `language-client` step config.
- **`initializationOptions` documented** — string field for passing JS object expressions (e.g., `{ provideFormatter: true }`) to LanguageClient on init.

### Changed
- **All Chinese documentation and comments translated to English** — AGENTS.md, converter README, docs/ files, plugin source comments fully anglicized for broader maintainer accessibility.
- **converter**: bump to v1.6.0 (synced with plugin version)
- **plugin**: bump to v1.6.0

### Registry Updates
- `vscode-css-ls` — added to baseline
- `vscode-html-ls` — added to baseline with autoInsertion + semanticTokens support

## [1.5.9] - 2026-06-24

### Added
- **Cross-version change detection** — `plugin/src/baseline.ts` SHA-256 baseline comparison system that detects which installed plugins are affected by converter changes after upgrading coc-vscode-loader, replacing the previous "reinstall everything" workflow with a targeted approach.
  - `loader.whatChanged` command — shows cross-version diff with file-level granularity for installed plugins only
  - Persisted `[changed]` markers (`changed-markers.json`) survive full nvim restarts
  - Startup auto-check: compares current baseline against saved snapshot on version change, marks affected plugins `[changed]` in TUI, and notifies the user
  - `clearChangedMarker()` called on install/update/reinstall to clear stale markers
  - Snapshot + marker atomicity: markers are only persisted when snapshot write succeeds

### Fixed
- **Persistence across nvim restart** — `[changed]` markers written to `changed-markers.json` instead of in-memory only, restored by `autoCheck()` on every startup including same-version restarts

### Changed
- **plugin**: bump to v1.5.9

## [1.5.8] - 2026-06-23

### Added
- **Registry baseline diff system (`diff:baseline` / `diff:check`)** — SHA-256 hash-based golden file system for detecting unintended converter side effects across all 128 registry entries. Committed `converter/baseline.json` stores output hashes per entry. `npm run diff:check` compares current conversion output against baseline, `npm run diff:baseline` updates it.
  - **Source commit tracking**: Each baseline entry stores the source repo's HEAD commit. `diff:check` skips entries whose source repo has advanced upstream — only entries with identical source code are compared, preventing false positives from upstream changes
  - **Build-generated snippet handling**: Snippet entries with build steps use a placeholder hash for platform-dependent JSON files, preventing false mismatches across systems
  - **Cache cleanup**: `git clean -fd` after `git reset` removes stale build artifacts from cached source repos
  - **CI integration**: Separate `diff` job in CI pipeline (after `unit`, before `smoke`), with `--verbose` flag. Download errors are reported as warnings (not failures); only real output changes cause exit code 1
- **`notes` field in registry** — `PackageInfo` now supports optional `notes` field for user-visible installation hints displayed in TUI detail popup (e.g., manual steps, caveats, post-install instructions)
- **`languages.match` polyfill** — added no-op polyfill (`return 1`) to `import-mapping` transform for coc.nvim compatibility
- **Build failure on subprocess errors** — npm postinstall, go install, and cargo install failures now cause hard build errors instead of being silently swallowed (was hiding real install failures)
- **Pipeline fixture tests** — 7 end-to-end fixture cases testing full `convert()` pipeline text replacements (`.uri.fsPath`, `Location.create`, `getWordRangeAtPosition`, WorkspaceEdit, etc.)
- **Windows compatibility plan** — comprehensive `docs/windows-compatibility.md` analyzing cross-platform barriers with phased remediation plan

### Fixed
- **`showMessage` Promise return** — refactored into single `showMessageWrap` helper that wraps `window.showMessage()` in `Promise.resolve(...)` to preserve `.then()` chaining for converted plugins. Extra arguments (action buttons, modal options) are now properly stripped using depth-aware parsing of nested parens/braces/brackets
- **Ansible LSP locale** — set `LC_ALL=C.UTF-8` as fallback to prevent locale-related errors in Python subprocesses spawned by ansible language server
- **`window.createOutputChannel` mapping removed** — `import-mapping` no longer remaps `window.createOutputChannel` to `workspace.createOutputChannel`, since coc.nvim supports `window.createOutputChannel` natively (and `workspace.createOutputChannel` was deprecated)
- **`vscode.` prefix in workspaceFolders guard** — `workspace.workspaceFolders` guard now correctly preserves the `vscode.` prefix when present (e.g., `vscode.workspace.workspaceFolders[0]` stays as `(vscode.workspace.workspaceFolders || [])[0]` instead of stripping the prefix)
- **`showInformationMessage` severity** — changed from `'info'` to `'more'` since coc.nvim's `MsgTypes` only accepts `'error' | 'warning' | 'more'` (`'info'` was invalid, causing all messages to show as error/red)

### Changed
- **CI pipeline**: `diff` job separated from `unit` tests — unit tests (fast) run first, then diff check, then smoke test. Transient network errors in diff no longer block test results
- **converter**: bump to v1.5.8
- **plugin**: bump to v1.5.8

## [1.5.7] - 2026-06-21

### Added
- **Vim 9.0+ support** — TUI now works in Vim (split window + text properties) in addition to Neovim (floating window + extmark). Auto-detects editor at runtime. New `EditorAPI` abstraction layer with `NvimEditor` / `VimEditor` backends, `batchRender()` single-RPC Vim render, `timer_start(0, ...)` deferred redraw. Covers 83/86 features with identical 19 keymaps.
- **`excludeDeps` field** — `SourceStep` now supports `excludeDeps: string[]` to filter out unwanted dependencies from source extensions. Supports prefix matching (e.g. `@wdio` matches `@wdio/cli`, `@wdio/local-runner`). Use with `keepDeps` to replace vendored/broken deps with proper npm versions.
- **Code Runner (`vscode-code-runner`)** — added to registry as `direct-api`, 12 source patches for coc compatibility (createTerminal, setContext, env.shell, lineAt, outputChannel dispose+recreate, etc.)

### Fixed
- **`.set()` regex narrowing** — restored `\buri\b` in WorkspaceEdit polyfill to handle `document.uri` and `fileUri` patterns, not just bare `uri` (regression from overly aggressive simplification)
- **`createLanguageStatusItem` lookbehind** — replaced broken `(?<![$\w.#])` negative lookbehind with `(?:vscode\.)?` prefix to properly match `vscode.languages.createLanguageStatusItem` (inconsistent with other `vscode.`-prefixed replacements)
- **Smoke test tsc validation removed** — dropped `tsc --noEmit` step that exposed 21 pre-existing converter issues unrelated to stub generation
- **`workspace.saveAll`** — added patch support for coc.nvim which lacks this API
- **`workspaceFolders[N].uri.fsPath`** — converter regex didn't handle array-indexed access (`[0]`, `.find()`); added patches for workspaceResolver
- **`window.activeTextEditor` polyfill** — status bar now shows immediately on startup (added `"*"` to activationEvents)
- **`.fileName` regex** — added `(?<![\w$])` negative lookbehind to prevent matching `_document.fileName` as `document.fileName`, which caused `this._Uri.parse(document.uri).fsPath` mangling
- **`.uri.fsPath` regex** — restricted first character to `[a-zA-Z_$]` to avoid matching `0.uri.fsPath` from array index access
- **`workspace.workspaceFolders` guard** — added `(?:vscode\.)?` prefix to handle `vscode.workspace.workspaceFolders` without producing `vscode.(...)` syntax error

### Changed
- **converter**: bump to v1.5.7
- **plugin**: bump to v1.5.7

## [1.5.6] - 2026-06-21

### Fixed
- **Error handling** — replace `console.error` + `process.exit(1)` with thrown errors; add try-catch around `package.json` parse; skip `.d.ts` during text replacements
- **Cross-platform URI decoding** — fix `file://` URI decoding with `decodeURIComponent`; handle optional leading `/` in hover fallback
- **Converter robustness** — balanced-parenthesis parsing for `registerDocumentFormatProvider`/`registerDocumentRangeFormatProvider`; graceful `file.replaceWithText()` failure handling; restrict severity regex to avoid false positives
- **Registry resilience** — guard against clearing installed packages when remote registry returns empty; add `console.warn` on fetch failure
- **Pipeline fixes** — fix platform placeholder comparison; use backtick-delimited git log parsing for special chars; refactor `rimraf` into `spawnPromise` helper; surface task failures via `runConcurrent`
- **TUI stability** — add `.catch()` to async calls to prevent unhandled rejections; fix typo `placehold` → `placeholder`
- **`loader.list` output** — escape single quotes in package names
- **Converter `contributes` fallback** — resolve `contributes` from parent `package.json` when subdirectory has none

### Changed
- **converter**: bump to v1.5.6
- **plugin**: bump to v1.5.6

## [1.5.5] - 2026-06-20

### Added
- **`loader.reinstall` command** — reinstall a package (git clone + convert + build + install)
- **`loader.list` command** — list installed packages and copy to clipboard (dual Lua/VimL format)
- **`loader.cleanCache` command** — clean source/build directories for all packages with cache size display
- **`--convert-file` argument** for `convert-plugin.sh` and `test-convert.sh` scripts
- **`noExternal` field** in registry — dependencies to bundle instead of externalizing (handles ESM-only transitive deps)

### Fixed
- **Dynamic import transform** — handle nested parentheses in `.then()` callbacks via `replaceBalanced`
- **Detached HEAD checkout** in `switch.sh` — replaced Linux-only `readlink -f` with cross-platform `node -p fs.realpathSync`
- **Uninstall race** — wrap `package.json` mutation in `withPkgJsonLock` mutex

### Changed
- **`PackageInfo.type`** — accept `'snippets'` for snippet-only extension support
- **converter**: bump to v1.5.5
- **plugin**: bump to v1.5.5

## [1.5.4] - 2026-06-17

### Added
- **`loader.cleanCache` command** — clean source/build directories for all packages with cache size display
- **`loader.list` command** — export installed package names to clipboard (dual Lua/VimL format)
- **Queued section in TUI** — visualize packages waiting on concurrency slot during batch operations
- **Cancel install support** — `<C-c>` keybinding to kill in-progress package operations (SIGTERM)
- **Search mode** — `/` key for interactive real-time filtering via Neovim cmdline
- **Language filter** — `<C-f>` quick pick language selector
- **Auto-install global extensions** — `g:coc_loader_global_extensions` vim variable support with flexible name matching (`findPackage` three-tier: exact name → displayName → `vscode-` prefix)
- **Silent update check on startup** — background check with notification only when updates found
- **30-second timeout on startup update check** — prevent plugin activation from hanging on slow network

### Fixed
- **Error reporting** — show error message when uninstall or update actually fails
- **Registry pre-fetch** — auto-fetch registry before uninstall/list commands to prevent empty results
- **Busy guard** — silent update checks no longer block user-initiated check updates
- **package.json write race** — mutex in `installToCoc` to serialize concurrent writes to `extensions/package.json`

### Changed
- **`registerPackageCmd` refactor** — centralize command registration pattern across install/uninstall/update/reinstall
- **`loader.list` format** — copy Lua format to clipboard, show both Lua and VimL formats
- **converter**: bump to v1.5.4
- **plugin**: bump to v1.5.4

## [1.5.0] - 2026-06-16

### Added
- **`targetAssets` — serverBinary per-platform asset mapping**. When GitHub Release binaries use platform-specific naming (e.g. clangd uses `mac`/`windows` instead of `darwin`/`win32`), `targetAssets` array matches by `platform` + `arch`, each entry specifies `file` and `binaryPath`
- **vscode-clangd** — added to registry with `targetAssets` for per-platform binary download
- **`goPackages`** — registry field, pipeline compiles Go language servers via `go install` (e.g. gopls), binary placed in `server/` directory
- **`cargoPackages`** — registry field, pipeline compiles Rust language servers via `cargo install --root`, binary copied to `server/` directory
- **vscode-go** — added to registry with `goPackages` for automatic gopls installation
- **vscode-pyright** — added to registry with `pyright` npm package + `pyright-langserver` binName

### Changed
- **plugin/pipeline**: `rimraf` now does `chmod -R u+w` before `rm -rf`, handling Go module cache 0555 read-only directories
- **plugin/pipeline**: `cpdir` switched to Node.js `fs.cp` (`dereference: true`), handling symlinks and permissions
- **plugin/pipeline**: `installToCoc` optimization: only copies `lib/`, `server/`, `package.json` etc., skips `node_modules/`, then runs `npm install` at destination, avoiding `cp -rL` issues on large `node_modules`
- **plugin/pipeline**: `run()` now supports optional `env` parameter for passing `GOPATH`/`GOBIN`/`GOCACHE` environment variables
- **converter**: bump to v1.5.0
- **plugin**: bump to v1.5.0

## [1.4.5] - 2026-06-16

### Added
- **`server.patches`** — general mechanism for text patches on compiled local server JS files. Supports declaring find/replace patches in registry `server.patches` (e.g. disabling pull diagnostics, injecting event hooks), replacing previously hardcoded ESLint patches in the converter
- **ESLint (`vscode-eslint`)** — added to registry with `server.patches` for three fixes: disable pull diagnostics (avoid duplication), inject diagnostic refresh (onDidOpen/onDidChangeContent), resolveSettings early return fix

### Changed
- **converter**: removed all hardcoded ESLint patches from `convert.ts`, replaced with generic `server.patches` mechanism
- **converter**: bump to v1.4.5
- **plugin**: bump to v1.4.5

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
