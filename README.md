# vscode-coc-loader

[![npm](https://img.shields.io/npm/v/coc-vscode-loader)](https://www.npmjs.com/package/coc-vscode-loader)
[![license](https://img.shields.io/github/license/coc-plugin/coc-vscode-loader)](LICENSE)
[![CI](https://github.com/coc-plugin/coc-vscode-loader/actions/workflows/ci.yml/badge.svg)](https://github.com/coc-plugin/coc-vscode-loader/actions/workflows/ci.yml)
[![GitHub stars](https://img.shields.io/github/stars/coc-plugin/coc-vscode-loader)](https://github.com/coc-plugin/coc-vscode-loader/stargazers)
[![last commit](https://img.shields.io/github/last-commit/coc-plugin/coc-vscode-loader)](https://github.com/coc-plugin/coc-vscode-loader)
[![open issues](https://img.shields.io/github/issues/coc-plugin/coc-vscode-loader)](https://github.com/coc-plugin/coc-vscode-loader/issues)
[![Editor](https://img.shields.io/badge/editor-Neovim%200.8%2B%20%7C%20Vim%209.0%2B-blue)]()

<p align="center">
  <img src="https://raw.githubusercontent.com/coc-plugin/coc-vscode-loader/main/plugin/assets/tui-preview.png?v=1.5.8" alt="TUI preview" width="100%">
</p>
<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/coc-plugin/coc-vscode-registry@main/assets/registry-preview.png?v=1.5.8" alt="Registry preview" width="100%">
</p>

在 coc.nvim 中无缝运行 VS Code 扩展。支持 **Neovim 0.8+** 和 **Vim 9.0+**。

[![Browse Registry](https://img.shields.io/badge/🌐_Browse_Available_Extensions-coc--plugin.github.io-blue?style=for-the-badge)](https://coc-plugin.github.io/coc-vscode-registry/)

---

## Quick Start

Install the loader plugin:

```vim
:CocInstall coc-vscode-loader
```

Then open the TUI to browse and install available extensions:

```vim
:CocCommand loader.open
```

Or auto-install extensions via vim variable (no TUI needed):

```vim
" .vimrc
let g:coc_loader_global_extensions = ['vscode-pyright', 'vscode-eslint']
```

```lua
-- init.lua
vim.g.coc_loader_global_extensions = { 'vscode-pyright', 'vscode-eslint' }
```

Browse all available extensions online: [coc-plugin.github.io/coc-vscode-registry](https://coc-plugin.github.io/coc-vscode-registry/)

---

## Convert Your Own Plugin

Use the one-step conversion script:

```bash
bash scripts/convert-plugin.sh <name> <github-repo> [subdir]
# Examples:
bash scripts/convert-plugin.sh eslint microsoft/vscode-eslint
bash scripts/convert-plugin.sh volar vuejs/language-tools extensions/vscode
```

For manual conversion:

```bash
cd converter
echo '[{"type":"source","transforms":["import-mapping"],"entry":"src/extension.ts"}]' > convert.json
npx tsx src/cli.ts convert ../path/to/vscode-ext -o ./output --convert-file convert.json
cd ./output && npm install && node esbuild.mjs
```

> 📖 See [`docs/`](./docs/) for full API mapping docs and converter design.

---

## Background

[coc.nvim](https://github.com/neoclide/coc.nvim)'s API is heavily influenced by the VS Code extension API — both use the same LSP protocol, similar provider systems, and comparable namespace structures. This makes it possible to mechanically convert VS Code extensions to run as coc.nvim plugins.

This repo contains two parts:

1. **Converter CLI** ([`converter/`](./converter/)) — automatically converts VS Code extensions to coc plugins
2. **Loader plugin** ([`plugin/`](./plugin/)) — coc.nvim plugin with a TUI to install/update/uninstall converted plugins

### Converter architecture

```
Input → Steps pipeline (source → language-client → bridge → snippets)
      → AST transforms (import / class-to-factory / provider-register / enum-offset)
      → Text replacements (getWordRangeAtPosition / fileName / Uri polyfills)
      → Mark unsupported code (decoration / webview / tree data provider / env.openExternal)
      → Generate entry point (bridge code / LanguageClient / keep original extension.ts)
      → Generate package.json + esbuild external injection
      → Output coc plugin directory + migration report
```

---

## Development

### Testing

Three test suites, each catching different issues:

```bash
npm test                    # Unit tests (162) + fixture tests + test coverage check
npm run test:full           # Unit tests + registry baseline diff
npm run test:smoke          # Registry smoke test (all 128 entries — validates output structure)
```

| Suite | What it catches | CI |
|-------|----------------|----|
| `npm test` | Transform/fixture correctness (fast, ~1s) | ✅ |
| `npm run test:full` | Unintended side effects on all 128 registry entries | ❌ (manual) |
| `npm run test:smoke` | Registry entry conversion completeness | ✅ |

**Baseline diff** (`npm run diff:baseline` / `npm run diff:check`):
Before changing converter code, snapshot current output; after changes, compare to detect which plugins are affected. See `AGENTS.md` for full workflow.

**Pre-push hook** — `git push` automatically runs `npm test` + `npm run test:smoke`. Configure once:

```bash
git config core.hooksPath .githooks
# Or just run npm install (pre-configured via postinstall)
```

Skip with `git push --no-verify` (use sparingly).

**GitHub Actions CI** — three sequential jobs:
1. `unit` (Node 20/22): unit tests + fixture tests
2. `diff`: registry baseline check (detects unintended converter side effects)
3. `smoke`: full registry conversion (validates output structure)

### Switch between local dev and npm release

```bash
# Check current mode
bash switch.sh status

# Use local development version
bash switch.sh local

# Use npm published version
bash switch.sh npm
```

Or via npm scripts:

```bash
npm run switch:status
npm run switch:local
npm run switch:npm
```

> **Note for npm 11+**: `switch.sh npm` temporarily removes `file:` dependencies from `extensions/package.json` to avoid reify errors, then restores them automatically.

After switching, run `:CocRestart` in Neovim.

### Build

```bash
npm run build          # build everything
cd plugin && npm run build  # build plugin only
```

## Requirements

### OS
- **Linux** ✅ Fully supported
- **macOS** ✅ Fully supported
- **Windows** ❌ Not supported (no planned support)

### Editor

| Editor | TUI | Notes |
|--------|-----|-------|
| **Neovim** 0.8+ | ✅ 完整浮窗 + extmark | 推荐，完整 Mason 风格体验 |
| **Vim** 9.0+ | ✅ 拆分窗口 + prop_add | 底部拆分窗口，无 backdrop 遮罩，无实时搜索 |

### External commands

These must be installed and available on `PATH`:

| Command | Required by | Notes |
|---------|-------------|-------|
| `git` | Source download & update checks | |
| `node` / `npm` / `npx` | Plugin build, converter runtime | Node.js >= 18 |
| `curl` | Registry fetch fallback, binary server download | |
| `unzip` | Binary server extraction | |
| `tar` / `gunzip` | Binary server extraction | |
| `python3` | Pip package installation (e.g. ansible-lint) | Only if plugin requires pip packages |
| `pip` (via `python3 -m pip`) | Python dependency installation | Only if plugin requires pip packages |
| `npx` | Runs converter CLI (`npx tsx`) | |

All commands are pre-installed on typical macOS/Linux development machines or available via the system package manager (`apt`, `brew`, etc.).

---

## FAQ

### Plugin installed but not working?

Close the TUI — it will auto-run `:CocRestart`. Or manually run `:CocRestart`.

### Which VS Code extensions are supported?

Browse the [registry website](https://coc-plugin.github.io/coc-vscode-registry/) or check [registry.json](https://github.com/coc-plugin/coc-vscode-registry/blob/main/registry.json). Includes LSP servers, direct-API plugins, and snippet extensions for most languages.

### How is this different from running the VS Code extension directly?

The converter rewrites VS Code API calls to coc.nvim equivalents. You get the same functionality without needing VS Code.

### Can I add my own extension?

Yes! See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full workflow. In short:
1. Add an entry to the [registry repo](https://github.com/coc-plugin/coc-vscode-registry)
2. Run `npm test` + `npm run test:smoke` to verify
3. Submit a PR

---

---

## Community & Support

- 💬 [Discussions](https://github.com/coc-plugin/coc-vscode-loader/discussions)
- 🐛 [Issues](https://github.com/coc-plugin/coc-vscode-loader/issues)
- 📖 [API mapping docs](./docs/import-mapping.md) · [Converter design](./docs/converter-design-v2.md) · [Registry website](https://coc-plugin.github.io/coc-vscode-registry/)
- ⭐ Star the repo if you find it useful!
