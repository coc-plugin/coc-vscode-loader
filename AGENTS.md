# AGENTS.md — vscode-coc-loader

## What this repo is

Reference documentation for migrating VS Code extensions to coc.nvim + **converter prototype** (`converter/`) that automatically converts VS Code extensions to coc plugins.

## Repo map

| File | Purpose |
|------|---------|
| `README.md` | Entry point with doc table of contents |
| `vscode.d.ts` | Upstream VS Code extension API types (auto-synced) |
| `coc.d.ts` | Upstream coc.nvim API types (auto-synced) |
| `vscode-vs-coc-api-diff.md` | Full API diff (vscode vs coc) |
| `mapping-quickref.md` | Fast bidirectional API lookup |
| `import-mapping.md` | Import name mapping: `vscode` → `coc.nvim` |
| `provider-signature-card.md` | Provider registration signatures side-by-side |
| `pattern-migration-examples.md` | Migration code examples for common patterns |
| `manifest-activation-mapping.md` | `package.json` / `activationEvents` / `contributes` mapping |
| `vscode-api-feasibility.md` | Feasibility analysis of porting vscode APIs to coc |
| `converter-design-v2.md` | Converter architecture + bridge preset system |
| `converter/README.md` | Converter tool docs and usage |
| `volar-migration-guide.md` | Volar (Vue) migration case study |
| `logs/YYYY-MM-DD.md` | Daily sync change logs (auto-generated) |

## Converter status

**Verified conversions:**

| Plugin | Type | Status | Key issues solved |
|--------|------|--------|-----------------|
| Volar (Vue) | TS-bridge | ✅ | tsserver/request bridge, typescriptServerPlugins, globalPlugins |
| Prisma | Pure LSP | ✅ | exports field restriction, bin entry detection |
| HTML CSS Support | Direct API | ✅ | class→factory, getWordRangeAtPosition polyfill, fileName→uri |

**Implemented transforms:**

| Transform | What it does |
|-----------|-------------|
| `import-mapping` | `from 'vscode'` → `from 'coc.nvim'` |
| `class-to-factory` | `new Xxx()` → `Xxx.create()` |
| `provider-register` | Adapt provider registration signatures |
| `enum-offset` | Comment on enum value differences |
| `language-client` | LanguageClient signature adaptation |

**Bridge preset system** (`converter/src/presets.ts`):
- Bridge logic is preset-driven, not hardcoded in convert.ts
- Currently only `ts-bridge` preset exists
- Adding a new bridge type: edit presets.ts + scanner.ts

## coc-tsserver PR

- PR: https://github.com/neoclide/coc-tsserver/pull/493
- Changes: `globalPlugins` + `pluginPaths` in configure, `typescript.tsserverRequest` command
- Pre-merge: `npm install ChuYanLon/coc-tsserver`

## Pending (next session)

- [ ] Add more transforms (uri-mapping, more provider signatures)
- [ ] Build registry system (JSON config for conversion parameters)
- [ ] coc-converter package manager plugin
- [ ] Test more plugins (Angular, ESLint, JSON)
- [ ] Add python-bridge / rust-bridge preset examples

## Type sync workflow (CI only)

- `.github/workflows/sync-types.yml` runs daily at 02:00 UTC
- **Do not manually edit `vscode.d.ts` or `coc.d.ts`**

## Language

All documentation is written in Chinese (zh-CN).
