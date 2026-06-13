# vscode-coc-loader

[![npm](https://img.shields.io/npm/v/coc-vscode-loader)](https://www.npmjs.com/package/coc-vscode-loader)
[![license](https://img.shields.io/github/license/coc-plugin/coc-vscode-loader)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/coc-plugin/coc-vscode-loader)](https://github.com/coc-plugin/coc-vscode-loader/stargazers)
[![last commit](https://img.shields.io/github/last-commit/coc-plugin/coc-vscode-loader)](https://github.com/coc-plugin/coc-vscode-loader)
[![open issues](https://img.shields.io/github/issues/coc-plugin/coc-vscode-loader)](https://github.com/coc-plugin/coc-vscode-loader/issues)

在 coc.nvim 中无缝运行 VS Code 扩展。

![TUI preview](https://raw.githubusercontent.com/coc-plugin/coc-vscode-loader/main/plugin/assets/tui-preview.png)

## Background

[coc.nvim](https://github.com/neoclide/coc.nvim)'s API is heavily influenced by the VS Code extension API — both use the same LSP protocol, similar provider systems, and comparable namespace structures. This makes it possible to mechanically convert VS Code extensions to run as coc.nvim plugins.

This repo contains two parts:
1. **Converter CLI** ([`converter/`](./converter/)) — automatically converts VS Code extensions to coc plugins
2. **Loader plugin** ([`plugin/`](./plugin/)) — coc.nvim plugin with a TUI to install/update/uninstall converted plugins

> 📖 API mapping docs and registry have been moved to [coc-vscode-registry](https://github.com/coc-plugin/coc-vscode-registry).

## Converter CLI

```bash
cd converter
# Create a convert config file for the plugin
echo '[{"type":"source","transforms":["import-mapping"],"entry":"src/extension.ts"}]' > convert.json
npx tsx src/cli.ts convert ../path/to/vscode-ext -o ./output --convert-file convert.json
cd ./output && npm install && node esbuild.mjs
```

**Quick conversion script:**

Use [`scripts/convert-plugin.sh`](./scripts/convert-plugin.sh) for one-step convert & install:

```bash
bash scripts/convert-plugin.sh <name> <github-repo> [subdir]
# Example:
bash scripts/convert-plugin.sh eslint microsoft/vscode-eslint
bash scripts/convert-plugin.sh volar vuejs/language-tools extensions/vscode
```

**Converter architecture:**

```
Input → Scan (API detection + classification → TS-bridge/Pure LSP/Direct API)
      → AST transforms (import / class-to-factory / provider-register / LanguageClient / enum-offset)
      → Missing API replacement (getWordRangeAtPosition / fileName polyfills)
      → Mark unsupported code (decoration / webview / tree data provider / env.openExternal)
      → Generate entry point (bridge code / LanguageClient / keep original extension.ts)
      → Generate package.json + esbuild external injection
      → Output coc plugin directory + migration report
```

> See [coc-vscode-registry/docs](https://github.com/coc-plugin/coc-vscode-registry/tree/main/docs) for full API mapping docs.

## Roadmap

| Milestone | Target | Focus |
|-----------|--------|-------|
| [v1.2.0](https://github.com/coc-plugin/coc-vscode-loader/milestone/1) | 2026-08 | Registry expansion: YAML, Tailwind CSS, Biome, Stylelint, Prettier |
| [v1.3.0](https://github.com/coc-plugin/coc-vscode-loader/milestone/2) | 2026-10 | More transforms + bridge presets + ESLint, Angular |
| [v2.0.0](https://github.com/coc-plugin/coc-vscode-loader/milestone/3) | 2026-12 | 20+ plugins, full coverage |

---

> 📖 API docs & registry — [coc-vscode-registry](https://github.com/coc-plugin/coc-vscode-registry)
>
> 📦 npm — [coc-vscode-loader](https://www.npmjs.com/package/coc-vscode-loader)

## Development

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

## FAQ

### Plugin installed but not working?

Close the TUI — it will auto-run `:CocRestart`. Or manually run `:CocRestart`.

### Which VS Code extensions are supported?

Check the [registry](https://github.com/coc-plugin/coc-vscode-registry/blob/main/registry.json) for the full list. Currently 14 plugins: Volar (Vue), Prisma, HTML CSS Support, Lua, Deno, TOML (Taplo), Ansible, YAML, Tailwind CSS, Biome, Stylelint, Prettier, Svelte, Astro, and more being added.

### How is this different from running the VS Code extension directly?

The converter rewrites VS Code API calls to coc.nvim equivalents. You get the same functionality without needing VS Code.

### Can I add my own extension?

Yes! Fork the [registry repo](https://github.com/coc-plugin/coc-vscode-registry), add an entry to `registry.json`, and submit a PR.

## Community & Support

- 💬 [Discussions](https://github.com/coc-plugin/coc-vscode-loader/discussions)
- 🐛 [Issues](https://github.com/coc-plugin/coc-vscode-loader/issues)
- 📖 [Documentation](https://github.com/coc-plugin/coc-vscode-registry)
- ⭐ Star the repo if you find it useful!
