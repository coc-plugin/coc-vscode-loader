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

1. Edit `plugin/registry.json` and `plugin/src/registry.ts`
2. Add the package info with GitHub source and subdir (if applicable)
3. Verify by installing via `:CocCommand loader.install <name>`

## Project structure

```
coc-vscode-loader/
├── converter/     CLI conversion tool
├── plugin/        coc.nvim plugin (coc-vscode-loader)
├── examples/      Test cases
├── types/         Type definitions (auto-synced)
```

## Questions?

Open an issue at https://github.com/coc-plugin/coc-vscode-loader/issues
