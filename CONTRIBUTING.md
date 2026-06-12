# Contributing

Thanks for your interest in contributing to coc-vscode-loader!

## How to contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Run the build (`cd plugin && npm run build`)
5. Commit with a clear message
6. Push and open a Pull Request

## Code style

- Follow existing patterns in the codebase
- No semicolons in TypeScript
- Single quotes for strings
- 2-space indentation
- See `.editorconfig` for editor settings

## Adding a new plugin to the registry

The package registry is no longer built-in. To add a new plugin:

1. Fork the [coc-vscode-registry](https://github.com/coc-plugin/coc-vscode-registry) repo
2. Edit `registry.json` with the package info (GitHub source and subdir)
3. Submit a PR to that repo
4. Once merged, run `:CocCommand loader.updateRegistry` to fetch the updated list

## Project structure

```
coc-vscode-loader/
├── converter/     CLI conversion tool (AST transforms)
├── plugin/        coc.nvim plugin (coc-vscode-loader)
└── examples/      Test cases
```

## Areas we need help with

- **Add new plugins** to the [registry](https://github.com/coc-plugin/coc-vscode-registry) — see `CONTRIBUTING.md` there
- **Implement more transforms** — check `converter/src/transforms/` for patterns
- **Provider signature coverage** — extend `provider-register.ts` with more adapters
- **Bridge presets** — add python-bridge, rust-bridge examples to `presets.ts`
- **Test with real extensions** — pick a VS Code extension and run the converter

## Questions?

Open an issue at https://github.com/coc-plugin/coc-vscode-loader/issues
