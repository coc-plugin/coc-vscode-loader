# AGENTS.md — coc-vscode-loader

Monorepo with two independent packages. **Converter CLI** (`converter/`) transforms VS Code extensions into coc.nvim plugins. **Loader plugin** (`plugin/`) is a coc.nvim TUI for installing converted plugins from a remote registry.

## Key commands

```bash
# Root
npm test                    # delegates to npm run test:converter
npm run test:full           # unit tests + diff:check
npm run test:smoke          # full registry conversion (134 entries, network, slow)
npm run diff:baseline       # snapshot SHA-256 hashes of converted output
npm run diff:check          # detect side effects vs baseline
npm run build               # converter (no-op) + plugin build
npm run switch:local|npm|status  # switch between local dev and npm release

# Converter (run from converter/ or root)
npm test                    # check:tests → vitest run
npm run check:tests         # every source file must have matching .test.ts
npx tsx scripts/gen-fixtures.ts
npx tsx scripts/gen-pipeline-fixtures.ts
bash scripts/convert-plugin.sh <name> <repo> [subdir]  # one-step convert + install

# Plugin (run from plugin/)
npm run build               # bundle-converter + esbuild → lib/index.js

# Smoke test env overrides
NO_CACHE=1 npm run test:smoke             # re-clone all repos (default: cached)
CONCURRENCY=12 npm run test:smoke         # parallel downloads (default 8)
CACHE_TTL=14 npm run test:smoke           # cache TTL in days (default 7)
```

**Pre-push hook** (`.githooks/pre-push`) — set up by `npm install` postinstall. Runs `npm test` + `npm run test:smoke`. Skip with `SKIP_SMOKE=1 git push`, `bash dev.sh`, or `git push --no-verify`.

CI (`.github/workflows/ci.yml`): 3 jobs, all with OS matrix.
- `unit`: `ubuntu-24.04`, `macos-14`, `windows-2022` × Node 20/22, `fail-fast: false`
- `diff`: `ubuntu-24.04`, `macos-14` × Node 22 (baseline comparison — Windows skipped due to platform output differences)
- `smoke`: same 3 OS × Node 22, full registry conversion (134 entries)
- `registry-check.yml` runs daily (00:00/12:00 Beijing) detecting upstream changes

## Registry

`coc-vscode-registry/` must exist as a sibling directory (CI clones it fresh). **Registry edits go in the separate [coc-vscode-registry](https://github.com/coc-plugin/coc-vscode-registry) repo**, not here. PRs adding entries must include both `registry.json` changes and any needed converter changes.

Entry naming: `vscode-<short-name>`. Non-snippets by tech complexity + category first, then snippets by category.

`baseline.json` stores SHA-256 hashes of all converted output. After changing converter code or registry entries, run `npm run diff:baseline` and commit — CI diff:check will fail otherwise.

For `kind: "module"` servers needing compilation, use `prebuilt` (`type: "vsix"`) to download pre-compiled server from marketplace instead of building.

## Architecture

- **Converter + plugin are independent packages** with own `package.json`. Plugin bundles converter at build via `npm run bundle-converter` (copies `../converter` → `plugin/converter/` + npm install).
- **Converter runs source TS via tsx** — no build step. Any syntax error in `converter/src/` breaks runtime.
- **5 step generators**: `language-client`, `source`, `bridge`, `mark-unsupported`, `snippets` (registered in `converter/src/steps/index.ts`).
- **6 transforms**: `import-mapping`, `class-to-factory`, `provider-register`, `enum-offset`, `language-client`, `strip-volar` (`converter/src/transforms/`).
- **Every source file must have a `.test.ts`** with real test cases (enforced by `npm run check:tests`). Exempt: `types.ts`, `index.ts`, `cli.ts`. Tests must be >50 bytes with `it()`/`test()`.
- **Fixture tests**: `converter/src/__fixtures__/<transform>/<case>/` with `input.ts` + `output.ts`. **Pipeline fixtures**: `converter/src/__fixtures__/pipeline/<case>/src/extension.ts` + `expected/`.

## Gotchas

- **No eslint/prettier/tsc** — style enforced only by `.editorconfig` (2-space indent, single quotes, no semicolons, LF). No typecheck step exists.
- **Bridge TS version hazard** — TS 7+ removed `ts.server.protocol`. Bridge plugins (like Volar) cap dependency to `<7.0.0` via runtime detection.
- **Plugin `prepare` script** — `npm install` in `plugin/` triggers `bundle-converter + esbuild`. Installing deps means full build.
- **Code injection system** — steps can inject imports and code before/after markers into previously generated files via `codeInjections`.
- **Smoke test cache** — repos cached in `~/.cache/coc-converter-smoke/` (git fetch, TTL 7 days). `NO_CACHE=1` to force re-clone.
- **Switch script modifies coc state** — `switch.sh local|npm` removes installed plugins, replaces symlink, rebuilds `~/.config/coc/extensions/package.json`.
- **Windows support** — paths auto-detect `%APPDATA%/coc`, binary names have `.exe` variants. See `docs/windows-compatibility.md`.

## Platform constraints

Requires: `git`, `node>=18`, `npm`, `npx`, `curl`, `tar`. Linux additionally: `unzip`, `gunzip`. Optional: `python3+pip`, `go`, `cargo`.

## Reference files

- `TODO.md` — planned registry entries with blocker notes
- `docs/` — converter design docs, API mapping tables
- `docs/types/` (vscode.d.ts, coc.d.ts) — auto-synced from registry; do not edit manually
