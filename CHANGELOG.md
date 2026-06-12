# Changelog

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
