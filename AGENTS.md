# AGENTS.md — coc-vscode-loader

Monorepo with two independent packages. **Converter CLI** (`converter/`) transforms VS Code extensions into coc.nvim plugins, runs source TS via tsx (no build). **Loader plugin** (`plugin/`) is a coc.nvim TUI for installing converted plugins from a remote registry.

## Commands

```bash
# Root (zero own deps; only coordinator scripts)
npm test                    # → converter unit tests (check:tests + vitest)
npm run test:full           # unit + diff:check
npm run test:smoke          # full registry (network, slow; skip with SKIP_SMOKE=1)
npm run diff:baseline       # snapshot SHA-256 hashes of converted output
npm run diff:check          # fail if output changed vs baseline
npm run build               # BROKEN — converter has no build script, this fails at build:converter step; use build:plugin
npm run build:plugin        # bundle-converter + esbuild → plugin/lib/index.js
npm run switch:local|npm|status
npm run pr                  # bash scripts/create-pr.sh

# Converter (converter/ — all deps live here)
npm test                    # check:tests → vitest run
npm run check:tests         # every source file must have matching .test.ts
npm run test:watch          # vitest watch mode
npm run convert             # tsx src/cli.ts (CLI entrypoint)
npm run test:smoke          # tsx scripts/smoke-test.ts (needs coc-vscode-registry/ sibling)

# Plugin (plugin/)
npm run build               # bundle-converter + esbuild → lib/index.js
npm install                 # triggers prepare script = full build
npm test                    # coc-test integration tests (needs vim/nvim + Node >=22.14; runs esbuild first)
npm run test:vim            # same suite on Vim
npm run test:watch          # coc-test watch mode

# Smoke test overrides
NO_CACHE=1 npm run test:smoke        # re-clone all repos (default: cached)
CONCURRENCY=12 npm run test:smoke    # parallel downloads (default 8)
CACHE_TTL=14 npm run test:smoke      # cache TTL in days (default 7)
VERBOSE=1 npm run test:smoke         # detailed output
```

**Pre-push hook** (`.githooks/pre-push`, auto-configured by `npm run postinstall`): runs `npm test` + `npm run test:smoke`. Skip with `SKIP_SMOKE=1 git push` or `git push --no-verify`.

**After switching** (`switch.sh local|npm`): run `:CocRestart` in Neovim for changes to take effect.

## CI (`.github/workflows/ci.yml`)

3 serial jobs (`fail-fast: false`), OS matrix:
- `unit` → ubuntu-24.04, macos-14, windows-2022 × Node 20/22
- `diff` → ubuntu-24.04, macos-14 × Node 22 (Windows skipped — platform output differences)
- `smoke` → same 3 OS × Node 22, full registry

`registry-check.yml` runs 2x daily (00:00/12:00 Beijing), detects upstream changes, creates PRs on output delta.

`plugin-test.yml` runs the coc-test integration suite on ubuntu-24.04 × Node 22, matrix nvim/vim.

CI runs `npm ci` in `converter/` (not root). Registry cloned fresh as sibling `coc-vscode-registry/`.

## Registry

`coc-vscode-registry/` must exist as sibling directory. **Registry edits go in [separate repo](https://github.com/coc-plugin/coc-vscode-registry)** — not here. Entry naming: `vscode-<short-name>`. File layout: `registry.json` (entries) + `presets.json` (bridge presets) — these paths are hardcoded in `converter/scripts/smoke-test.ts`, `converter/scripts/diff-check.ts`, and `.github/scripts/*`.

`converter/baseline.json` stores SHA-256 hashes. After changing converter code or registry entries, run `npm run diff:baseline` and commit. Use `npm run diff:check -- --verbose` for per-file detail on changes.

For `kind: "module"` servers needing compilation, prefer `prebuilt` (`type: "vsix"`) to download pre-compiled server.

## Architecture

- **Converter + plugin are independent** with own `package.json`. Plugin bundles converter at build (`npm run bundle-converter` — copies `../converter` → `plugin/converter/` + npm install).
- **5 step generators**: `language-client`, `source`, `bridge`, `mark-unsupported`, `snippets` (registered in `converter/src/steps/index.ts`).
- **6 transforms**: `import-mapping`, `class-to-factory`, `provider-register`, `enum-offset`, `language-client`, `strip-volar` (`converter/src/transforms/`).
- **Inline text replacements** in `converter/src/convert.ts` (applied to ALL output files regardless of transforms): `getWordRangeAtPosition` → coc polyfill, `.fileName` → `Uri.parse($1.uri).fsPath`, `.uri.fsPath` → `Uri.parse($1.uri).fsPath`, `new WorkspaceEdit()` → `({ changes: {} })`, `.set(uri, edits)` → `.changes[uri] = edits`, `Location.create(Uri.file(...), ...)` → `Location.create(..., Range.create(...))`.
- **Every source file must have `.test.ts`** (enforced by `check:tests`). Exempt: `types.ts`, `index.ts`, `cli.ts`. Tests must be >50 bytes with `it()`/`test()`.
- **Fixture tests**: `converter/src/__fixtures__/<transform>/<case>/input.ts` + `output.ts`. **Pipeline fixtures**: `converter/src/__fixtures__/pipeline/<case>/src/extension.ts` + `expected/`.
- **Infra scripts**: `converter/scripts/` (smoke-test, diff-check, check-tests, fixture generators). `.github/scripts/` (registry-check matrix generation + entry checker).

## Gotchas

- **No eslint/prettier/tsc** — style enforced only by `.editorconfig` (2-space indent, single quotes, no semicolons, LF). No typecheck step.
- **coc-test needs recent Node** — plugin integration tests require Node >=22.14 (coc-test engines + rolldown bindings), even though the repo otherwise targets Node >=18. First run downloads the coc.nvim source from GitHub; on slow networks use `--coc-path` with a pre-downloaded checkout.
- **Bridge TS version hazard** — TS 7+ removed `ts.server.protocol`. Bridge plugins (like Volar) cap dependency to `<7.0.0` via runtime detection. Same range (`>=5.0.0 <7.0.0`) is used to compile local module servers.
- **Plugin `prepare` script** — `npm install` in `plugin/` auto-runs `bundle-converter + esbuild`. Installing deps = full build. Plugin esbuild.mjs supports `--watch` flag. `plugin/converter/` and `plugin/lib/` are gitignored build artifacts (created by bundle-converter/esbuild) — never commit them.
- **Code injection system** — steps inject imports/code via `codeInjections` into previously generated files.
- **Smoke test cache** — `~/.cache/coc-converter-smoke/` (git fetch, TTL 7 days).
- **Switch script** (`switch.sh local|npm`) — modifies `~/.config/coc/extensions/package.json`. Run `:CocRestart` after switching.
- **TypeScript 7 used in converter** (`converter/package.json` has `"typescript": "^7.0.2"`).
- **Converter CLI entrypoint**: `converter/src/cli.ts`. Export: `convert()` in `converter/src/convert.ts`.

## Platform constraints

Requires: `git`, `node>=18`, `npm`, `npx`, `curl`, `tar`. Linux additionally: `unzip`, `gunzip`. Optional: `python3+pip`, `go`, `cargo`.

## Reference files

- `docs/` — converter design docs, API mapping tables
- `docs/types/` (vscode.d.ts, coc.d.ts) — auto-synced; do not edit manually
