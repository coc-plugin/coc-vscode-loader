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
npx tsx src/cli.ts convert ../path/to/vscode-ext -o ./output
cd ./output && npm install && npm run build
```

**Verified conversions:**

| Plugin | Type | Status | Notes |
|--------|------|--------|-------|
| Volar (Vue) | TS-bridge | ✅ | Requires modified coc-tsserver (PR #493) |
| Prisma | Pure LSP | ✅ | Auto-detects bin entry |
| HTML CSS Support | Direct API | ✅ | Handles new→create, missing API polyfills |

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
      → Mark unsupported code (decoration / webview / complex missing APIs)
      → Generate entry point (bridge code / LanguageClient / keep original extension.ts)
      → Generate package.json + esbuild external injection
      → Output coc plugin directory + migration report
```

> See [coc-vscode-registry/docs](https://github.com/coc-plugin/coc-vscode-registry/tree/main/docs) for full API mapping docs.

## Roadmap

| Milestone | Target | Focus |
|-----------|--------|-------|
| [v1.2.0](https://github.com/coc-plugin/coc-vscode-loader/milestone/1) | 2026-08 | Registry expansion: Angular, ESLint, YAML |
| [v1.3.0](https://github.com/coc-plugin/coc-vscode-loader/milestone/2) | 2026-10 | More transforms + bridge presets |
| [v2.0.0](https://github.com/coc-plugin/coc-vscode-loader/milestone/3) | 2026-12 | 10+ plugins, full coverage |

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

## FAQ

### Plugin installed but not working?

Close the TUI — it will auto-run `:CocRestart`. Or manually run `:CocRestart`.

### Which VS Code extensions are supported?

Currently Volar (Vue), Prisma, and HTML CSS Support. More are being added to the [registry](https://github.com/coc-plugin/coc-vscode-registry).

### How is this different from running the VS Code extension directly?

The converter rewrites VS Code API calls to coc.nvim equivalents. You get the same functionality without needing VS Code.

### Can I add my own extension?

Yes! Fork the [registry repo](https://github.com/coc-plugin/coc-vscode-registry), add an entry to `registry.json`, and submit a PR.

## Community & Support

- 💬 [Discussions](https://github.com/coc-plugin/coc-vscode-loader/discussions)
- 🐛 [Issues](https://github.com/coc-plugin/coc-vscode-loader/issues)
- 📖 [Documentation](https://github.com/coc-plugin/coc-vscode-registry)
- ⭐ Star the repo if you find it useful!
