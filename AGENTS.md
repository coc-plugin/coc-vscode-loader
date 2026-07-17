# AGENTS.md — coc-vscode-loader

Monorepo with two independent packages. **Converter CLI** (`converter/`) transforms VS Code extensions into coc.nvim plugins, runs source TS via tsx (no build). **Loader plugin** (`plugin/`) is a coc.nvim TUI for installing converted plugins from a remote registry.

## Commands

```bash
# Root
npm test                    # → converter unit tests (check:tests + vitest)
npm run test:full           # unit + diff:check
npm run test:smoke          # full registry (133 entries, network, slow)
npm run diff:baseline       # snapshot SHA-256 hashes of converted output
npm run diff:check          # fail if output changed vs baseline
npm run build:plugin        # bundle-converter + esbuild → plugin/lib/index.js
npm run build               # BROKEN — converter has no build script; use build:plugin
npm run switch:local|npm|status

# Converter (from converter/ or root)
npm test                    # check:tests → vitest run
npm run check:tests         # every source file must have matching .test.ts
npm run convert             # tsx src/cli.ts (CLI entrypoint)

# Plugin (from plugin/ or root: npm run build:plugin)
npm run build               # bundle-converter + esbuild → lib/index.js

# Smoke test overrides
NO_CACHE=1 npm run test:smoke        # re-clone all repos (default: cached)
CONCURRENCY=12 npm run test:smoke    # parallel downloads (default 8)
CACHE_TTL=14 npm run test:smoke      # cache TTL in days (default 7)
```

**Pre-push hook** (`.githooks/pre-push`, enabled by postinstall): runs `npm test` + `npm run test:smoke`. Skip with `SKIP_SMOKE=1 git push`, `bash dev.sh`, or `git push --no-verify`.

## CI (`.github/workflows/ci.yml`)

3 serial jobs, all `fail-fast: false`, OS matrix:
- `unit` → ubuntu-24.04, macos-14, windows-2022 × Node 20/22
- `diff` → ubuntu-24.04, macos-14 × Node 22 (Windows skipped — platform output differences)
- `smoke` → same 3 OS × Node 22, full registry (133 entries)

`registry-check.yml` runs 2x daily (00:00/12:00 Beijing), detects upstream changes, creates PRs on output delta.

## Registry

`coc-vscode-registry/` must exist as sibling directory (CI clones it fresh). **Registry edits go in [separate repo](https://github.com/coc-plugin/coc-vscode-registry)** — not here. Entry naming: `vscode-<short-name>`.

`baseline.json` stores SHA-256 hashes. After changing converter code or registry entries, run `npm run diff:baseline` and commit.

For `kind: "module"` servers needing compilation, prefer `prebuilt` (`type: "vsix"`) to download pre-compiled server.

## Architecture

- **Converter + plugin are independent** with own `package.json`. Plugin bundles converter at build (`npm run bundle-converter` — copies `../converter` → `plugin/converter/` + npm install).
- **5 step generators**: `language-client`, `source`, `bridge`, `mark-unsupported`, `snippets` (registered in `converter/src/steps/index.ts`).
- **6 transforms**: `import-mapping`, `class-to-factory`, `provider-register`, `enum-offset`, `language-client`, `strip-volar` (`converter/src/transforms/`).
- **Every source file must have `.test.ts`** (enforced by `check:tests`). Exempt: `types.ts`, `index.ts`, `cli.ts`. Tests must be >50 bytes with `it()`/`test()`.
- **Fixture tests**: `converter/src/__fixtures__/<transform>/<case>/input.ts` + `output.ts`. **Pipeline fixtures**: `converter/src/__fixtures__/pipeline/<case>/src/extension.ts` + `expected/`.

## Gotchas

- **No eslint/prettier/tsc** — style enforced only by `.editorconfig` (2-space indent, single quotes, no semicolons, LF). No typecheck step.
- **Bridge TS version hazard** — TS 7+ removed `ts.server.protocol`. Bridge plugins (like Volar) cap dependency to `<7.0.0` via runtime detection.
- **Plugin `prepare` script** — `npm install` in `plugin/` auto-runs `bundle-converter + esbuild`. Installing deps = full build.
- **Code injection system** — steps inject imports/code via `codeInjections` into previously generated files.
- **Smoke test cache** — `~/.cache/coc-converter-smoke/` (git fetch, TTL 7 days).
- **Switch script** (`switch.sh local|npm`) — modifies `~/.config/coc/extensions/package.json`.
- **TypeScript 7 used in converter** (`converter/package.json` has `"typescript": "^7.0.2"`).
- **Converter CLI entrypoint**: `converter/src/cli.ts`. Export: `convert()` in `converter/src/convert.ts`.

## Platform constraints

Requires: `git`, `node>=18`, `npm`, `npx`, `curl`, `tar`. Linux additionally: `unzip`, `gunzip`. Optional: `python3+pip`, `go`, `cargo`.

## Reference files

- `TODO.md` — planned registry entries with blocker notes
- `docs/` — converter design docs, API mapping tables
- `docs/types/` (vscode.d.ts, coc.d.ts) — auto-synced; do not edit manually
