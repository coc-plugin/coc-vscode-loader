# AGENTS.md — coc-vscode-loader

Monorepo with two independent packages. **Converter CLI** (`converter/`) transforms VS Code extensions into coc.nvim plugins. **Loader plugin** (`plugin/`) is a coc.nvim TUI for installing converted plugins from a remote registry.

## Key commands

```bash
# Root
npm test                    # delegates to converter npm test
git push                    # runs pre-push hook (npm test + npm run test:smoke)

# Converter (run from converter/ or root via npm run <cmd>)
npm test                    # check-tests → vitest (167 tests, 15 files)
npm run test:full           # tests + diff:check (baseline comparison)
npm run test:smoke          # full registry convert smoke test (requires registry clone)
npm run diff:baseline       # snapshot output for all registry entries
npm run diff:check          # detect side effects vs baseline
npm run build               # build converter (no-op, converter is tsx-driven)
npx tsx scripts/gen-fixtures.ts       # regen transform fixture outputs
npx tsx scripts/gen-pipeline-fixtures.ts # regen pipeline fixture outputs

# Plugin (run from plugin/)
npm run build               # bundle-converter + esbuild → lib/index.js
```

**Always run `npm test` + `npm run test:smoke` before pushing** (auto via `.githooks/pre-push`). Skip smoke with `SKIP_SMOKE=1 git push`. The file `dev.sh` is just `SKIP_SMOKE=1 git push` — read it before using.

CI (`.github/workflows/ci.yml`): 3 sequential jobs → `unit` (Node 20/22) → `diff` → `smoke`. The `registry-check.yml` workflow runs daily to detect upstream changes.

## Registry

`coc-vscode-registry/` must exist as a sibling directory (CI clones it fresh). **Registry edits go in the separate [coc-vscode-registry](https://github.com/coc-plugin/coc-vscode-registry) repo**, not here. PRs adding entries must include both `registry.json` changes and any needed converter changes.

Entry naming: `vscode-<short-name>`. Ordering: non-snippets by tech complexity + category first, then snippets by category.

`baseline.json` stores SHA-256 hashes of all converted output files. After changing converter code or registry entries, run `npm run diff:baseline` and commit the updated baseline.

For `kind: "module"` servers needing compilation, use `prebuilt` (`type: "vsix"`) to download pre-compiled server from marketplace instead of building.

## Architecture

- **Converter + plugin are independent packages** with their own `package.json`. Plugin bundles converter at build via `npm run bundle-converter`.
- **Converter works on source TS** via ts-morph AST transforms + text replacements in `convert.ts`. Does NOT run the source extension.
- **5 step generators**: `language-client`, `source`, `bridge`, `mark-unsupported`, `snippets` (registered in `converter/src/steps/index.ts`).
- **6 transforms**: `import-mapping`, `class-to-factory`, `provider-register`, `enum-offset`, `language-client`, `strip-volar` (`converter/src/transforms/`).
- **Every source file must have a `.test.ts`** with real test cases (enforced by check-tests on `npm test`). Exempt: `types.ts`, `index.ts`, `cli.ts`.
- **Fixture tests**: `converter/src/__fixtures__/<transform>/<case>/` with `input.ts` + `output.ts`. **Pipeline fixtures**: `converter/src/__fixtures__/pipeline/<case>/src/extension.ts` + `expected/`.
- **Type defs** in `docs/types/` (vscode.d.ts, coc.d.ts) are auto-synced from registry. Do not edit manually.
- **Switch** between local dev and npm release via `bash switch.sh local|npm|status` or `npm run switch:*`.

## Platform constraints

- Linux/macOS only. Windows not supported.
- Requires `git`, `node>=18`, `npm`, `npx`, `curl`, `unzip`, `tar`/`gunzip` on PATH.
- Optionally `python3+pip`, `go`, `cargo` depending on plugin type.
- Neovim 0.8+ (floating window) or Vim 9.0+ (split window).

## Code style

- No semicolons, single quotes, 2-space indent, LF endings, trailing newline (`.editorconfig`).
