# coc-vscode-loader

![TUI preview](https://raw.githubusercontent.com/coc-plugin/coc-vscode-loader/main/plugin/assets/tui-preview.png?v=1.5.6)

VS Code extension → coc.nvim plugin loader with TUI package manager.

Install/update/uninstall converted VS Code extensions via a floating terminal UI.

## Install

```vim
:CocInstall coc-vscode-loader
```

Or via npm:

```bash
cd ~/.config/coc/extensions
npm install coc-vscode-loader
```

## TUI Keymaps

| Key | Action |
|-----|--------|
| `I` | Install mode (button highlight) |
| `U` | Update all installed packages (max 3 concurrent) |
| `C` | Check for remote updates (git ls-remote commit compare) |

| `H` | Home (reset all state) |
| `?` | Help |
| `i` | Install package under cursor |
| `u` | Update package under cursor |
| `X` | Uninstall package under cursor |
| `R` | Reinstall package under cursor |
| `f` | Cycle filter: all → installed → available |
| `s` | Cycle sort: default → name → status → type |
| `j` / `k` | Scroll through packages (virtual scroll) |
| `gg` | Jump to first package |
| `G` | Jump to last package |
| `<CR>` | Open detail popup (info / install log with syntax highlights) |
| `/` | Search filter |
| `q` | Close (auto `:CocRestart` if changes detected) |
| `<Esc>` | Language filter→Search→Close |

## Commands

| Command | Action |
|---------|--------|
| `:CocCommand loader.open` | Open TUI |
| `:CocCommand loader.install <name>` | Install a package |
| `:CocCommand loader.uninstall <name>` | Uninstall a package |
| `:CocCommand loader.update <name>` | Update a package |
| `:CocCommand loader.reinstall <name>` | Reinstall a package (uninstall + install) |
| `:CocCommand loader.uninstallAll` | Uninstall all (with confirmation) |
| `:CocCommand loader.updateRegistry` | Fetch latest registry from remote |
| `:CocCommand loader.cleanCache` | Clean build cache for all packages |
| `:CocCommand loader.list` | List installed packages (copied to clipboard) |

## Global Extensions (auto-install)

Define extensions to auto-install on plugin activation via vim variable:

```vim
" .vimrc
let g:coc_loader_global_extensions = ['vscode-pyright', 'vscode-eslint', 'vscode-lua']
```

```lua
-- init.lua
vim.g.coc_loader_global_extensions = { 'vscode-pyright', 'vscode-eslint', 'vscode-lua' }
```

On next `:CocRestart`, the plugin will fetch the registry and install any missing extensions concurrently (max 3 at a time). Installed extensions are skipped.

## Features

- **Real conversion pipeline** — git clone → converter → npm install → esbuild → register to coc
- **Source-compiled servers** — pipeline auto-installs Go servers via `go install` (`goPackages`) and Rust servers via `cargo install` (`cargoPackages`), binaries go to `server/` directory
- **Binary server download** — auto-downloads pre-built server binaries from GitHub Releases (`.zip`, `.tar.gz`, `.gz`)
- **Local server build** — auto-copies `server/` directory from source, installs deps, compiles TypeScript during build
- **Pip install** — auto-installs Python packages via `pip` for plugins that need them (e.g. ansible-lint)
- **Auto-fetch registry** — remote registry fetched in background when TUI opens, no manual refresh needed
- **Virtual scrolling** — `j`/`k` smooth scroll through packages, handles 100k+ registry entries
- **Incremental cache** — source/ keeps git repo, updates via git pull only
- **Commit tracking** — records commit SHA after install, visible in detail view
- **Update check** — `C` key compares against remote HEAD, shows `↑` when outdated
- **Auto restart** — `:CocRestart` triggered automatically on close when changes detected
- **Manual registry update** — `:CocCommand loader.updateRegistry` also available for re-fetch
- **Detail popup** — `<CR>` opens centered float window with package info or live install log (syntax highlighted, auto-scroll to latest)
- **Filter & sort** — `f` cycle view filter, `s` cycle sort order (name/status/type)
- **Concurrency limit** — max 3 parallel operations for `U` (Update All)
- **Desktop notifications** — `showInformationMessage` on install/update/uninstall complete
- **Auto-check updates** — silent check on startup, notifies only when updates found
- **Cache cleanup** — `:CocCommand loader.cleanCache` removes build artifacts
- **Export package list** — `:CocCommand loader.list` copies installed package names to clipboard

## Architecture

| File | Description |
|------|-------------|
| `src/index.ts` | Plugin entry + 8 CocCommands |
| `src/tui.ts` | TUI window management + rendering + key dispatch |
| `src/state.ts` | State management (debounced rendering) |
| `src/registry.ts` | Remote registry fetch + disk cache |
| `src/pipeline.ts` | Real install/update/uninstall flow (git + npx tsx + npm + node + cp). Handles local servers (copies `server/` dir, installs deps), binary server download, Go/Cargo source-compiled servers, pip install. |
| `src/renderer.ts` | LineBuffer render engine (inspired by lazy.nvim) |

## Build

```bash
npm install
npm run build    # esbuild → lib/index.js
```
