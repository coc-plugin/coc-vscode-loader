# AGENTS.md — vscode-coc-loader

## What this repo is

Reference documentation for migrating VS Code extensions to coc.nvim + **converter CLI** (`converter/`) that automatically converts VS Code extensions to coc plugins.

## Platform

**Supported OS**: Linux, macOS. **Windows not supported.**

External commands required at runtime:
- `git`, `node`/`npm`/`npx` (Node.js >= 18), `curl`, `unzip`, `tar`/`gunzip`
- `python3` + `pip` (only if plugin has `pipPackages` in registry)
- Plugin pipeline runs all commands via `spawn(cmd, args, { shell: true })`

## Repo map

| File | Purpose |
|------|---------|
| `README.md` | Entry point |
| `converter/` | Source code: CLI conversion tool |
| `plugin/` | **coc-vscode-loader plugin** |
| `plugin/README.md` | Plugin docs and usage |
| `AGENTS.md` | Dev instructions for AI agents |
| `coc-vscode-registry/` | Local clone of [coc-vscode-registry](https://github.com/coc-plugin/coc-vscode-registry) — registry.json, type defs, API mapping docs |

> 📖 Type definitions, API mapping docs and registry have been moved to [coc-vscode-registry](https://github.com/coc-plugin/coc-vscode-registry).

## Converter transforms

| Transform | What it does |
|-----------|-------------|
| `import-mapping` | `from 'vscode'` → `from 'coc.nvim'` |
| `class-to-factory` | `new Xxx()` → `Xxx.create()` |
| `provider-register` | Adapt provider registration signatures |
| `enum-offset` | Comment on enum value differences |
| `language-client` | LanguageClient signature adaptation |

**Bridge preset system** (`converter/src/presets.ts`):
- Bridge logic is preset-driven, not hardcoded in convert.ts
- Currently only `ts-bridge` preset exists
- Adding a new bridge type: edit presets.ts + scanner.ts

## coc-tsserver PR

- PR: https://github.com/neoclide/coc-tsserver/pull/493
- Changes: `globalPlugins` + `pluginPaths` in configure, `typescript.tsserverRequest` command
- Pre-merge: `npm install ChuYanLon/coc-tsserver`

## Loader plugin

`plugin/` is a coc.nvim plugin that provides a TUI to install/update/uninstall converted plugins.

### Architecture

| File | Description |
|------|-------------|
| `src/index.ts` | Plugin entry + 8 CocCommands |
| `src/tui.ts` | TUI window management + rendering + key dispatch |
| `src/state.ts` | State management (debounced rendering) |
| `src/registry.ts` | Remote registry fetch + disk cache + version compatibility filter |
| `src/pipeline.ts` | Real install/update/uninstall flow (git / npx tsx / npm / node / cp) + pip install + binary server download + code patching (documentSelector, client.start guard) |
| `src/renderer.ts` | LineBuffer render engine (inspired by lazy.nvim) |

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
- **Package operations**: `i` install `u` update `X` uninstall `R` reinstall `<CR>` toggle details/logs
- **Mark & filter**: `x` toggle mark `f` cycle filter `s` cycle sort
- **Navigation**: `gg` / `G` jump to first / last package
- **Batch**: `U` update all (max 3 concurrent) `Z` uninstall all `D` cleanup orphaned
- **Update check**: `C` git ls-remote compares commits, shows `↑` when outdated
- **Other**: `/` search `q` close / `<Esc>` step-by-step cancel (help→search→marks→busy guard→close)
- **Detail view**: description / type / commit / source / languages / categories / homepage / serverBinary
- **Install logs**: `▶` compact line → `<CR>` expand full log with commands
- **Progress**: `[step/total]` + status text
- **Registry auto-fetch**: remote registry fetched in background when TUI opens
- **Binary server support**: auto-download + extract (.zip, .gz, .tar.gz) server binaries from GitHub Releases, patch generated code for command-mode startup, fix documentSelector and activationEvents
- **Pip packages**: auto-install Python dependencies via pip (e.g. ansible-lint), only uses `--break-system-packages` on Linux

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
| [v1.2.0](https://github.com/coc-plugin/coc-vscode-loader/milestone/1) | 2026-08 | Registry expansion: Angular, ESLint, YAML, etc. |
| [v1.3.0](https://github.com/coc-plugin/coc-vscode-loader/milestone/2) | 2026-10 | More transforms & bridge presets |
| [v2.0.0](https://github.com/coc-plugin/coc-vscode-loader/milestone/3) | 2026-12 | Stable ecosystem: 10+ plugins, full transform coverage |

## Pending

- [ ] Add more plugins to registry
- [ ] Add more transforms (uri-mapping, more provider signatures)
- [ ] Add python-bridge / rust-bridge preset examples

## Type sync workflow

- Type definitions (`vscode.d.ts`, `coc.d.ts`) are auto-synced daily to [coc-vscode-registry](https://github.com/coc-plugin/coc-vscode-registry)
- CI workflow and script live in that repo
- **Do not manually edit type files**
