# Windows Compatibility

## Overview

coc-vscode-loader **supports Windows** as of v1.7. This document tracks implementation status and remaining work.

**Status**: P0 and P1 items implemented. P2 (shell script migration) and verification pending.

---

## Table of Contents

1. [Path System — Coc Config Directory](#1-path-system--coc-config-directory)
2. [Missing Shell Commands — unzip / gunzip / rm -rf](#2-missing-shell-commands)
3. [Python Binary Naming](#3-python-binary-naming)
4. [Process Signals — SIGTERM](#4-process-signals)
5. [Bash Scripts in Generated Code](#5-bash-scripts-in-generated-code)
6. [tsc Output Parsing](#6-tsc-output-parsing)
7. [chmod Permission Settings](#7-chmod-permission-settings)
8. [Shell Script Migration](#8-shell-script-migration)
9. [Verification Checklist](#9-verification-checklist)

---

## 1. Path System — Coc Config Directory

### Implementation Status: ✅ Done (v1.7)

All hardcoded paths consolidated into `plugin/src/paths.ts`. On Windows, uses `%APPDATA%/coc`; on Linux/macOS, uses `~/.config/coc`.

### Files Migrated

- `plugin/src/pipeline.ts` — imports `cacheDir`, `sourceDir`, `buildDir`, `pluginDir`, `extensionsPkgPath`, `CACHE_ROOT`
- `plugin/src/registry.ts` — imports `CACHE_ROOT`, `REGISTRY_CACHE_PATH`
- `plugin/src/index.ts` — imports `CACHE_ROOT`
- `plugin/src/state.ts` — imports `EXTENSIONS_NM_DIR`, `CACHE_ROOT`
- `plugin/src/baseline.ts` — imports `SNAPSHOT_PATH`, `CHANGED_MARKERS_PATH`

---

## 2. Missing Shell Commands

### Implementation Status: ✅ Done (v1.7)

Replaced all platform-specific shell commands with cross-platform alternatives:

| Command | Replacement |
|---------|-------------|
| `unzip` | `tar -xf` on Windows (Win10+ `tar.exe` handles zip), `unzip` on Linux |
| `gunzip` | Node.js `zlib.createGunzip()` via `gunzipFile()` helper |
| `rm -rf` | `fs.rmSync(dir, { recursive: true, force: true })` via `rimraf()` |
| `chmod` | `chmodRecursiveSync()` — no-op on Windows (`.exe` extension sufficient) |

---

## 3. Python Binary Naming

### Implementation Status: ✅ Done (v1.7)

Python lookup now uses platform-specific candidate lists:
- **Windows**: `['python', 'py', 'python3']`
- **Linux/macOS**: `['/opt/homebrew/bin/python3', '/usr/local/bin/python3', '/usr/bin/python3', 'python3', 'python']`

---

## 4. Process Signals

### Implementation Status: ✅ Done (v1.7)

All `child.kill('SIGTERM')` calls replaced with cross-platform `killChild()`:
- **Windows**: uses `taskkill /pid <pid> /f /t` to terminate process tree
- **Linux/macOS**: uses `child.kill('SIGTERM')`

---

## 5. Bash Scripts in Generated Code

### Implementation Status: ✅ Done (v1.7)

Generated `package.json` uses `"postinstall": "node scripts/postinstall.js"` instead of a bash one-liner. The `scripts/postinstall.js` file is written alongside `esbuild.mjs` in the output directory.

---

## 6. tsc Output Parsing

### Implementation Status: ✅ Done (v1.7)

Regex in generated `esbuild.mjs` uses `[/\\\\]` character class to match both `/` and `\` path separators, making tsc error parsing platform-independent.

---

## 7. chmod Permission Settings

### Implementation Status: ✅ No Change Needed

`chmod` calls are harmless on Windows (Node.js only changes the read-only attribute). Existing `try/catch` wrappers already prevent errors.

---

## 8. Shell Script Migration

### Current Status

| Script | Purpose | Blocks Windows? |
|--------|---------|-----------------|
| `dev.sh` | Test + push | ❌ Low priority, can be replaced with `SKIP_SMOKE=1 git push` |
| `switch.sh` | Toggle dev/npm mode | ⚠️ Medium, can be rewritten in Node.js |
| `scripts/convert-plugin.sh` | CLI conversion entry | ⚠️ Medium |
| `scripts/test-*.sh` | Test utilities | ❌ Low priority, can be replaced with `npm test` |

### Remediation Plan

Rewrite `dev.sh` and `switch.sh` as `.mjs` files to make them cross-platform:

```javascript
// switch.mjs
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

const mode = process.argv[2] // 'local' | 'npm' | 'status'
const home = os.homedir()

function cocExtensionsDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA, 'coc', 'extensions')
  }
  return path.join(home, '.config', 'coc', 'extensions')
}

// ... remaining logic same as switch.sh
```

---

## 9. Verification Checklist

### 9.1 Unit Tests Pass

```bash
npm test                    # 167 tests (15 test files)
npm run test:smoke          # 134 registry entries
```

### 9.2 Windows-Specific Tests (Pending)

| Test Item | Verification Method |
|-----------|-------------------|
| Coc config directory resolution | `paths.ts` returns `%APPDATA%/coc` |
| Archive extraction | `.zip` via `tar -xf` (Win10+), `.gz` via `zlib.createGunzip()` |
| Python lookup | Falls back to `python` / `py` on Windows |
| Process termination | `killChild()` calls `taskkill` |
| No bash artifacts | `postinstall` in output `package.json` is `node scripts/postinstall.js` |
| tsc error parsing | `src\foo.ts(10,5)` matched by `[/\\]` character class |
| Binary download | Downloads Windows platform asset (`win32`) |
| pip installation | `--break-system-packages` not applied on Windows |
| Full installation flow | Install one each of Volar / Deno / Tailwind CSS |

### 9.3 Known Infeasible Items

| Feature | Reason |
|---------|--------|
| `switch.sh local` symlink | Windows requires administrator privileges or Developer Mode to create symlinks; does not block core functionality |

---

## Implementation Status

| Phase | Item | Status |
|-------|------|--------|
| **P0** | Path system unification (`paths.ts`) | ✅ Implemented |
| **P0** | Archive extraction / `rm -rf` | ✅ Implemented |
| **P1** | Python lookup + process signals | ✅ Implemented |
| **P1** | postinstall bash → Node.js script | ✅ Implemented |
| **P1** | Cross-platform tsc error parsing | ✅ Implemented |
| **P1** | chmod permission handling | ✅ No action needed (try/catch already sufficient) |
| **P2** | `switch.sh` → Node.js rewrite | ❌ Pending |
| **P2** | `dev.sh` → Node.js rewrite | ❌ Pending |
| **Verification** | Windows VM/CI end-to-end testing | ❌ Pending |

**Remaining work**: ~1 person-day (shell script migration + verification).
