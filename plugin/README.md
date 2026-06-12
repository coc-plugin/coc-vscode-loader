# coc-vscode-loader

VS Code extension → coc.nvim plugin loader with TUI package manager.

Install/update/uninstall converted VS Code extensions via a floating terminal UI.

## Install

```bash
cd ~/.config/coc/extensions
npm install /path/to/coc-vscode-loader
# or :CocInstall /path/to/coc-vscode-loader
```

## TUI Keymaps

| Key | Action |
|-----|--------|
| `I` | Install mode (button highlight) |
| `U` | Update all installed packages |
| `C` | Check for remote updates (git ls-remote commit compare) |
| `Z` | Uninstall all installed packages (with confirmation) |
| `H` | Home (reset all state) |
| `?` | Help |
| `i` | Install package under cursor |
| `u` | Update package under cursor |
| `X` / `x` | Uninstall package under cursor |
| `<CR>` | Toggle details (commit / type / source) or install log |
| `/` | Search filter |
| `q` / `<Esc>` | Close (auto `:CocRestart` if changes detected) |

## Commands

| Command | Action |
|---------|--------|
| `:CocCommand loader.open` | Open TUI |
| `:CocCommand loader.install <name>` | Install a package |
| `:CocCommand loader.uninstall <name>` | Uninstall a package |
| `:CocCommand loader.update <name>` | Update a package |
| `:CocCommand loader.uninstallAll` | Uninstall all (with confirmation) |
| `:CocCommand loader.updateRegistry` | Fetch latest registry from remote |

## Features

- **Real conversion pipeline** — git clone → converter → npm install → esbuild → register to coc
- **Incremental cache** — source/ keeps git repo, updates via git pull only
- **Commit tracking** — records commit SHA after install, visible in detail view
- **Update check** — `C` key compares against remote HEAD, shows `↑` when outdated
- **Auto restart** — `:CocRestart` triggered automatically on close when changes detected
- **Registry hot-reload** — `:CocCommand loader.updateRegistry` fetches remote registry
- **Install logs** — real command output per step, expandable

## Architecture

| File | Description |
|------|-------------|
| `src/index.ts` | Plugin entry + 7 CocCommands |
| `src/tui.ts` | TUI window management + rendering + key dispatch |
| `src/state.ts` | State management (debounced rendering) |
| `src/registry.ts` | Built-in registry + remote update cache |
| `src/pipeline.ts` | Real install/update/uninstall flow (git + npx tsx + npm + node + cp) |
| `src/renderer.ts` | LineBuffer render engine (inspired by lazy.nvim) |

## Build

```bash
npm install
npm run build    # esbuild → lib/index.js
```
