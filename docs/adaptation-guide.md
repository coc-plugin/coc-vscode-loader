# Extension Adaptation Assessment Guide

## Development Environment Improvements

| Change | Description |
|------|------|
| `switch.sh local` | Automatically writes to `extensions/package.json` dependencies, making the plugin discoverable by coc |
| `registry.ts` | Automatically detects local development mode, uses `coc-vscode-registry/registry.json` |
| `minPluginVersion` | Registry entries support the `minPluginVersion` field, unpublished versions are invisible to old users |
| `server.args` (module kind) | `args` field supports module kind LSP launch parameters (v1.4.3+), supports `{dir}` and `{pluginDir}` placeholders |
| `binaryPath` field | Specifies the binary file path inside the archive, defaults to the package name when not specified |
| `targetAssets` | Per-platform binary asset mapping (v1.5.0+), supports non-standard platform naming (e.g., clangd uses `mac` instead of `darwin`) |
| `server.patches` | Server post-compilation text patches (v1.4.5+), executed via `server-patches.json` + esbuild prebuild section |
| `goPackages` / `cargoPackages` | Go/Rust source compilation LSP installation (v1.5.0+), `go install` / `cargo install --root` |
| `excludeDeps` / `keepDeps` | Precisely controls output `package.json` dependencies (v1.5.7+), excludes/retains specified dependencies |
| `prebuilt` | Download pre-compiled server from VS Code marketplace instead of building from source (v1.6.4+). `{ type: "vsix", publisher: "...", extension: "...", version: "...", serverPaths: ["server"] }` |
| Registry entries | Currently **134 entries** (34 pure-lsp, 1 ts-bridge, 7 direct-api, 92 snippets) |

### Version Compatibility Mechanism

```
registry.json entry                    coc-vscode-loader version
┌─────────────────────┐               ┌──────────────────┐
│ name: "deno"        │               │ package.json     │
│ minPluginVersion:    │──compare──→   │ version: 1.6.4   │
│   "1.1.2"           │               │                  │
└─────────────────────┘               └──────────────────┘

1.1.2 <= 1.6.4 → visible, user can install
1.7.0 > 1.6.4 → hidden, user cannot see
```

This allows submitting new extensions to the registry in advance; they become visible to users automatically after release.

Current version: **v1.6.4** (see `converter/package.json` and `plugin/package.json`).

---

## Practical Case: Live Server (`direct-api`)

### Extension Overview
- Repository: `ritwickdey/vscode-live-server`
- Type: `direct-api` (pure Node.js HTTP server, no LSP)
- Core logic: Starts an HTTP server with WebSocket live reload

### Conversion Challenges and Solutions

| Challenge | Solution |
|------|------|
| `LiveShareHelper` — VS Live Share integration | 3 patches to remove import/instantiation/dispose |
| `StatusBarAlignment` — coc has no such type | Remove import, modify `createStatusBarItem(100)` |
| `workspace.saveAll()` — coc has no such API | Comment it out with a patch |
| `window.activeTextEditor.document.fileName` — coc has no activeTextEditor | converter polyfill + additional URI patch |
| `workspaceFolders[0].uri.fsPath` — converter regex doesn't cover `[0]` | Additional patch |
| `.find(...).uri.fsPath` — Same as above | Additional patch |
| Dependency pollution — original extension has 20+ devDeps + vsls | `excludeDeps` filter + `keepDeps` specify runtime dependencies |
| Status bar Octicon icon | Patch replaced with Unicode symbols (● Go Live / ● Port / ◌) |
| Activation timing — `onCommand` causes status bar not to show | `activationEvents` add `"*"` |

### Key Configuration Snippet

```json
{
  "type": "source",
  "excludeDeps": ["vsls", "@wdio", "husky", "tslint", "live-server"],
  "keepDeps": { "live-server": "^1.2.2", "http-shutdown": "^1.2.0", "ips": "^2.1.3", "opn": "^6.0.0" },
  "patches": [
    { "find": "workspaceFolders\\[0\\]\\.uri\\.fsPath", "replace": "Uri.parse(workspaceFolders[0].uri).fsPath" },
    { "find": "await workspace\\.saveAll\\(\\);", "replace": "// workspace.saveAll not available in coc.nvim" }
  ]
}
```

### Current Status
- Build: ✅ Conversion → npm install → esbuild full pipeline passes
- Runtime: ✅ Server startup (`http://127.0.0.1:5500`), live reload, status bar display all work normally

> Last updated: 2026-06-21
> Analysis method: Read GitHub source code per extension + actually run `converter convert` → `npm install` → `node esbuild.mjs` full pipeline verification
