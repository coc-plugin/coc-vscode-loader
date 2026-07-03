# AGENTS.md — coc-vscode-loader

## What this repo is

Monorepo with two independent packages. **Converter CLI** (`converter/`) transforms VS Code extensions into coc.nvim plugins. **Loader plugin** (`plugin/`) is a coc.nvim TUI for installing/converted plugins from a remote registry.

## Key commands

```bash
# Converter (run from converter/)
npm test                    # check-tests → vitest (167 tests, 15 files)
npm run test:full           # tests + diff:check (registry baseline comparison)
npm run test:smoke          # full 134-entry registry convert smoke test
npm run diff:baseline       # snapshot current output for all entries
npm run diff:check          # detect unintended side effects vs baseline
npx tsx scripts/gen-fixtures.ts        # re-gen transform fixture outputs
npx tsx scripts/gen-pipeline-fixtures.ts # re-gen pipeline fixture outputs

# Plugin (run from plugin/)
npm run build               # esbuild → lib/index.js

# Root
npm test                    # delegates to converter npm test
git push runs pre-push hook → npm test + npm run test:smoke (skip with --no-verify)
```

**Always run `npm test` + `npm run test:smoke` before pushing.** Pre-push hook in `.githooks/pre-push`.

CI (`.github/workflows/ci.yml`): `unit` (Node 20/22) → `diff` → `smoke`.

## Registry quirk

`coc-vscode-registry/` must exist as a sibling directory. CI clones it fresh:
```
git clone --depth 1 --single-branch https://github.com/coc-plugin/coc-vscode-registry.git
```

**134 entries** in `registry.json`. Adding an entry must follow the ordering rules (non-snippets by tech complexity + category, then snippets by category; see existing entries for placement). Naming: `vscode-<short-name>`.

For `kind: "module"` servers that require compilation (TypeScript, wasm, etc.), use `prebuilt` field to download pre-compiled server from VSIX instead of building from source:

```json
"prebuilt": {
  "type": "vsix",
  "publisher": "yocto-project",
  "extension": "yocto-bitbake",
  "version": "2.9.0",
  "serverPaths": ["server"]
}
```

The pipeline downloads the VSIX from marketplace, extracts the server paths, and places them in `build/server/`.

`baseline.json` stores SHA-256 hashes of all converted output files + source commit for each entry. After adding/changing a registry entry or modifying converter code, run `npm run diff:baseline` and commit the updated baseline.

## Architecture gotchas

- **Converter and plugin are independent packages** with their own `package.json`. The plugin bundles a copy of the converter at build time via `npm run bundle-converter`.
- **Registry editing**: Registry entries live in the **separate** `coc-vscode-registry` repo (subtree/clone), not in this repo. PRs that add entries must include both the changed `registry.json` and any needed converter changes.
- **Converter works on source TypeScript files** via ts-morph AST transforms + text-level replacements in `convert.ts`. It does NOT run the source extension.
- **5 registered step generators**: `language-client`, `source`, `bridge`, `mark-unsupported`, `snippets` (registered in `converter/src/steps/index.ts`).
- **6 transforms**: `import-mapping`, `class-to-factory`, `provider-register`, `enum-offset`, `language-client`, `strip-volar` (in `converter/src/transforms/`).
- **Every source file must have a `.test.ts`** — enforced by check-tests on `npm test`.
- **Fixture tests** at `converter/src/__fixtures__/<transform>/<case>/` with `input.ts` + `output.ts` in each case dir.
- **Pipeline fixtures** at `converter/src/__fixtures__/pipeline/<case>/` with `src/extension.ts` + `expected/src/extension.ts`.

## TUI platform constraints

- Linux/macOS only. Windows not supported.
- Needs `git`, `node>=18`, `npm`, `npx`, `curl`, `unzip`, `tar`/`gunzip` on PATH.
- Optionally `python3+pip`, `go`, `cargo` depending on plugin type.
- Neovim 0.8+ (floating window) or Vim 9.0+ (split window) required.

## dev.sh

`bash dev.sh` runs the converter on a subset of registry entries for fast iteration. Read it before using.

## Type sync

Type defs in `docs/types/` (vscode.d.ts, coc.d.ts) are auto-synced from coc-vscode-registry. **Do not edit manually.**

## Code style

- No semicolons, single quotes, 2-space indent (enforced by `.editorconfig`).
