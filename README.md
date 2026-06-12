# vscode-coc-loader

![TUI preview](https://raw.githubusercontent.com/coc-plugin/coc-vscode-loader/main/plugin/assets/tui-preview.png)

Run VS Code extensions seamlessly in coc.nvim.

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

## Reference

- `types/vscode.d.ts`, `types/coc.d.ts` — see [coc-vscode-registry/types](https://github.com/coc-plugin/coc-vscode-registry/tree/main/types)
