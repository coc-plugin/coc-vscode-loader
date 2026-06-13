# Changelog

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
