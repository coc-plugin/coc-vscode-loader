# AGENTS.md — vscode-coc-loader

## What this repo is

Reference documentation for migrating VS Code extensions to coc.nvim + **converter prototype** (`converter/`) that automatically converts VS Code extensions to coc plugins.

## Repo map

| File | Purpose |
|------|---------|
| `README.md` | Entry point |
| `types/vscode.d.ts` | Upstream VS Code extension API types (auto-synced) — moved to [coc-vscode-registry](https://github.com/coc-plugin/coc-vscode-registry) |
| `types/coc.d.ts` | Upstream coc.nvim API types (auto-synced) — moved to [coc-vscode-registry](https://github.com/coc-plugin/coc-vscode-registry) |
| `converter/` | Source code: CLI conversion tool |
| `plugin/` | **coc-loader plugin** |
| `plugin/README.md` | Plugin docs and usage |
| `logs/YYYY-MM-DD.md` | Daily sync change logs |
| `AGENTS.md` | Dev instructions for AI agents |

> 📖 API mapping docs and registry have been moved to [coc-vscode-registry](https://github.com/coc-plugin/coc-vscode-registry).

## Converter status

**Verified conversions:**

| Plugin | Type | Status | Key issues solved |
|--------|------|--------|-----------------|
| Volar (Vue) | TS-bridge | ✅ | tsserver/request bridge, typescriptServerPlugins, globalPlugins |
| Prisma | Pure LSP | ✅ | exports field restriction, bin entry detection |
| HTML CSS Support | Direct API | ✅ | class→factory, getWordRangeAtPosition polyfill, fileName→uri |

**Implemented transforms:**

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
| `src/index.ts` | Plugin entry + 7 CocCommands |
| `src/tui.ts` | TUI window management + rendering + key dispatch |
| `src/state.ts` | State management (debounced rendering) |
| `src/registry.ts` | Built-in registry + remote update cache |
| `src/pipeline.ts` | Real install/update/uninstall flow (git / npx tsx / npm / node / cp) |
| `src/renderer.ts` | LineBuffer render engine (inspired by lazy.nvim) |

### TUI features

- Floating window, no border
- lazy.nvim-inspired render engine: per-segment `append(text, hl)` + extmark highlights
- 9 custom `CocConverter*` highlight groups linked to theme standard groups
- **Top buttons**: `coc-loader(H)` Home  `Install(I)`  `Update(U)`  `Check(C)`  `Help(?)`
- **Package operations**: `i` install `u` update `X` uninstall `<CR>` toggle details/logs
- **Update check**: `C` git ls-remote compares commits, shows `↑` when outdated
- **Other**: `/` search `q` / `<Esc>` close (auto `:CocRestart` if changed)
- **Detail view**: description / type / commit / source / languages / categories / homepage
- **Install logs**: `▶` compact line → `<CR>` expand full log with commands
- **Progress**: `[step/total]` + status text

### Commands

| Command | Action |
|---------|--------|
| `:CocCommand loader.open` | Open TUI |
| `:CocCommand loader.install <name>` | Install a package |
| `:CocCommand loader.uninstall <name>` | Uninstall a package |
| `:CocCommand loader.update <name>` | Update a package |
| `:CocCommand loader.uninstallAll` | Uninstall all (with confirm) |
| `:CocCommand loader.updateRegistry` | Fetch latest registry from remote |

### Build

```bash
cd plugin
npm install
npm run build    # esbuild → lib/index.js
```

### Install

```bash
cd ~/.config/coc/extensions
npm install /path/to/coc-converter    # or
:CocInstall /path/to/coc-converter
```

## Pending (next session)

- [ ] Add more plugins to registry
- [ ] Add more transforms (uri-mapping, more provider signatures)
- [ ] Add python-bridge / rust-bridge preset examples
- [ ] Implement `--bridge` CLI option (force bridge mode)

## Type sync workflow (CI only)

- `.github/workflows/sync-types.yml` runs daily at 02:00 UTC, pushes to [coc-vscode-registry](https://github.com/coc-plugin/coc-vscode-registry)
- **Do not manually edit type files**
