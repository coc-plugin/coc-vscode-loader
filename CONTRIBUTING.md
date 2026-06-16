# Contributing

Thanks for your interest in contributing to coc-vscode-loader!

## How the two repos work together

Running a VS Code extension on coc.nvim requires two parts:

```
coc-vscode-loader          ← Parser (converter): transforms VS Code extension source code
  └─ converter/               AST transforms, LanguageClient generation, entry injection
  
coc-vscode-registry        ← Registry: defines which plugins are available and how to convert them
  └─ registry.json            Each plugin's source address + convert configuration
```

**When adding a new plugin, the first question is: can the converter already handle it?**

---

## Workflow for adding a new plugin

```
You want to run a VS Code extension on coc.nvim
                  │
                  ▼
     Check what VS Code APIs the extension uses
                  │
        ┌─────────┴──────────┐
        ▼                    ▼
  Converter can handle    Converter CANNOT handle
  (pure LSP, standard     (uses uncovered APIs,
   API calls)              new provider types, etc.)
        │                    │
        │                    ├─ 1. Add new transform in converter/
        │                    ├─ 2. Add new provider adapter in converter/
        │                    └─ 3. Possibly add new bridge preset
        │                    │
        ▼                    ▼
  Registry entry only    Registry entry + converter PR
  (steps 1-3 below)     (both repos must change)
```

---

## Step-by-step

### 1. Classify the plugin type

| Type | Description | Example | Converter ready? |
|------|-------------|---------|-----------------|
| `pure-lsp` | Pure LSP via LanguageClient | Prisma, YAML | Yes (`language-client` step) |
| `ts-bridge` | Depends on TS language server | Volar, Angular | Yes (`ts-bridge` preset) |
| `direct-api` | Direct coc.nvim API calls, no language server | HTML CSS Support | Check if APIs are covered |
| New type | None of the above | — | Need new bridge preset or transform |

### 2. Configure the `convert` field

The `convert` array in `registry.json` tells the converter what to do:

```jsonc
{
  "name": "my-plugin",
  "type": "pure-lsp",   // ← only used for TUI display, does NOT affect conversion
  "source": {
    "type": "github",
    "repo": "owner/repo",
    "subdir": "extensions/vscode"
  },
  "languages": ["mylang"],
  // Optional install fields:
  "pipPackages": ["ansible-lint"],       // Python pip dependencies
  "goPackages": ["golang.org/x/tools/gopls@latest"],  // Go packages (go install)
  "cargoPackages": [{ "crate": "nil", "binary": "nil" }],  // Rust crates (cargo install)
  "serverBinary": { "repo": "org/repo", "asset": "name-{{platform}}-{{arch}}.tar.gz", "binaryPath": "bin/server" },
  "convert": [
    // Step type 1: Generate LanguageClient entry to launch an LSP server
    {
      "type": "language-client",
      "server": {
        "kind": "module",         // "module" → npm package, "binary" → download binary
        "package": "some-lsp-server",
        "entry": "bin",           // "main" or "bin"; use binName for multi-bin packages
        "args": ["--flag", "{pluginDir}"]  // CLI arguments (v1.4.3+); supports {dir} and {pluginDir} placeholders
      },
      "languages": ["mylang"]
    },
    // Step type 2: Apply AST transforms to source files
    {
      "type": "source",
      "transforms": ["import-mapping", "class-to-factory", "provider-register"]
    },
    // Step type 3: Bridge code (ts-bridge, etc.)
    {
      "type": "bridge",
      "preset": "ts-bridge"
    },
    // Step type 4: Mark unsupported APIs
    {
      "type": "mark-unsupported"
    }
  ]
}
```

### 3. If the converter doesn't meet your needs

When the converter doesn't cover the APIs or patterns your plugin uses, extend it first — then configure the registry:

**Case A: Missing AST transform**
- Add a new transform in `converter/src/transforms/`
- Add the transform to the transforms array in `converter/src/types.ts`
- Register the new transform case in the main flow (`converter/src/convert.ts`)
- Reference the new transform name in the registry's `convert` field

**Case B: Missing provider adapter**
- Extend `converter/src/transforms/provider-register.ts` with the new signature

**Case C: Need a new bridge preset**
- Add a new preset in `converter/src/steps/bridge.ts`

### 4. Update docs

If your change adds or modifies a converter feature, update:
- [`converter/README.md`](./converter/README.md) — file structure, transform list
- [`docs/import-mapping.md`](./docs/import-mapping.md) — API mapping table

### 5. Verify

```bash
# Run all unit tests (116 tests, 15 test files)
npm test

# Run registry smoke test (converts all 114 entries)
npm run test:smoke

# Validate registry JSON format
python3 -c "import json; json.load(open('coc-vscode-registry/registry.json'))"
```

**Pre-push hook** automatically runs `npm test` + `npm run test:smoke` on every `git push`. See [.githooks/pre-push](../.githooks/pre-push).

### 6. Submit a PR

- **Registry entry only** → PR to [coc-vscode-registry](https://github.com/coc-plugin/coc-vscode-registry)
- **Both registry and converter changes** → PR to this repo (coc-vscode-loader), including the registry entry
  - Both changes must be in the same PR — otherwise the plugin won't work
  - **Checklist:** Update converter tests in `converter/src/**/*.test.ts`; run `npm test` + `npm run test:smoke` before submitting

---

## Code style

- No semicolons in TypeScript
- Single quotes for strings
- 2-space indentation
- See `.editorconfig`

## Questions?

Open an issue at https://github.com/coc-plugin/coc-vscode-loader/issues
