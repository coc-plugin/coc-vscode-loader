# AGENTS.md — coc-vscode-loader

## What this repo is

Reference documentation for migrating coc.nvim plugins to VS Code. **Not a code project** — no package.json, no build/test/lint commands, no TypeScript compilation.

## Repo map

| File | Purpose |
|------|---------|
| `README.md` | Entry point with doc table of contents |
| `vscode.d.ts` | Upstream VS Code extension API types (auto-synced) |
| `coc.d.ts` | Upstream coc.nvim API types (auto-synced) |
| `vscode-vs-coc-api-diff.md` | Full API diff (vscode vs coc) |
| `mapping-quickref.md` | Fast bidirectional API lookup |
| `import-mapping.md` | Import name mapping: `coc.nvim` → `vscode` |
| `provider-signature-card.md` | Provider registration signatures side-by-side |
| `pattern-migration-examples.md` | Migration code examples for common patterns |
| `manifest-activation-mapping.md` | `package.json` / `activationEvents` / `contributes` mapping |
| `vscode-api-feasibility.md` | Feasibility analysis of porting vscode APIs to coc |
| `logs/YYYY-MM-DD.md` | Daily sync change logs (auto-generated) |

## Type sync workflow (CI only)

- `.github/workflows/sync-types.yml` runs daily at 02:00 UTC
- Downloads `vscode.d.ts` from vscode `main` branch and `coc.d.ts` from coc.nvim `master`
- Compares with local copies; if changed, commits the update
- Logs API additions/removals to `logs/YYYY-MM-DD.md`
- Requires `ripgrep` (`rg`) — installed in CI via apt
- **Do not manually edit `vscode.d.ts` or `coc.d.ts`** — they are overwritten by the sync script

## Branches

- `main` — primary branch
- `master` — stale, kept for compatibility
- `sync/types-YYYY-MM-DD` — push branches created by CI sync (not long-lived)

## Language

All documentation is written in Chinese (zh-CN).

## Key conversions to know

- coc `Emitter<T>` → vscode `EventEmitter<T>` (different name)
- coc `DocumentUri = string` → vscode `Uri` class
- coc `CodeActionKind = string` alias → vscode `CodeActionKind` class
- coc `LinesTextDocument` (extends `TextDocument`) — vscode has no equivalent
- `DiagnosticSeverity` values are offset by 1 (coc: 1-4, vscode: 0-3)
- Provider registration in coc takes extra `name` + `shortcut` args vs vscode just `selector`
