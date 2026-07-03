# Windows Compatibility Plan

## Overview

coc-vscode-loader **does not support Windows** currently. This document analyzes all compatibility barriers in detail, with remediation plans prioritized by urgency.

**Goal**: Make the converter (CLI), plugin (TUI + pipeline) work properly on Windows 10/11.

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

### Current Status

All modules hardcode `path.join(os.homedir(), '.config', 'coc', ...)`, but on Windows, coc.nvim actually uses `%APPDATA%/coc` (i.e., `C:\Users\<user>\AppData\Roaming\coc`).

### Affected Files

| File | Purpose |
|------|---------|
| `plugin/src/pipeline.ts` | Cache, build, installToCoc |
| `plugin/src/registry.ts` | Local cache path |
| `plugin/src/index.ts` | Log path |
| `plugin/src/state.ts` | State persistence path |
| `plugin/src/tui.ts` | Log file reference |

### Remediation Plan

Create `plugin/src/paths.ts` to export all paths from a single source:

```typescript
import * as path from 'path'
import * as os from 'os'

function cocConfigDir(): string {
  if (process.platform === 'win32') {
    // Windows: %APPDATA%/coc
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'coc')
  }
  // macOS / Linux: ~/.config/coc
  return path.join(os.homedir(), '.config', 'coc')
}

export const COC_CONFIG = cocConfigDir()
export const EXTENSIONS_DIR = path.join(COC_CONFIG, 'extensions')
export const CACHE_DIR = path.join(COC_CONFIG, 'cache', 'coc-vscode-loader')
export const LOG_FILE = path.join(COC_CONFIG, 'coc-vscode-loader.log')
export const STATE_FILE = path.join(CACHE_DIR, 'state.json')
export const REGISTRY_CACHE = path.join(CACHE_DIR, 'registry.json')
```

### Migration Steps

1. Create `paths.ts`
2. Replace hardcoded paths in each module with `paths.ts` exports
3. Update all `import` statements

### Scope of Impact

- `pipeline.ts`: `CACHE_DIR`, `BUILD_DIR`, `INSTALL_DIR`, `EXTENSIONS_DIR`
- `registry.ts`: `REGISTRY_CACHE`
- `index.ts`: `LOG_FILE`
- `state.ts`: `STATE_FILE`

---

## 2. Missing Shell Commands

### Current Status

`pipeline.ts` calls external shell commands via `spawn()`, some of which do not exist on Windows.

### Command List

| Command | Line | Windows | Alternative |
|---------|------|---------|-------------|
| `unzip` | 475 | ❌ Not available | `adm-zip` npm package or `tar -xf` (built-in on Win10+) |
| `gunzip` | 481 | ❌ Not available | Node.js `zlib.createGunzip()` + `fs.createWriteStream()` |
| `rm -rf` | 659 | ❌ cmd has no such command | `fs.rmSync(dir, { recursive: true, force: true })` (Node 16.7+) |
| `chmod` | 658 | ⚠️ Not available but caught by try/catch | Skip (see Section 7) |
| `git` | Multiple | ✅ Git for Windows | Just ensure it's in PATH |
| `curl` | Multiple | ✅ Built-in on Win10+ `curl.exe` | Ensure it's in PATH |
| `tar` | 477 | ✅ Built-in on Win10+ `tar.exe` | Ensure it's in PATH |
| `npm` | Multiple | ✅ `npm.cmd` | Automatically resolved by Node.js |
| `npx` | Multiple | ✅ `npx.cmd` | Automatically resolved by Node.js |
| `node` | 383 | ✅ `node.exe` | Automatically resolved by Node.js |
| `go` | 336 | ✅ | Requires user installation |
| `cargo` | 357 | ✅ | Requires user installation |

### Remediation Plan

#### 2.1 Unified Archive Extraction

Merge the scattered `unzip` / `tar` / `gunzip` branches into a unified extraction function using Node.js standard library and `adm-zip`:

```typescript
// pipeline.ts — extractArchive()
import * as fs from 'fs'
import * as path from 'path'
import * as zlib from 'zlib'
import * as tar from 'tar'      // npm i tar
import AdmZip from 'adm-zip'    // npm i adm-zip

async function extractArchive(archivePath: string, destDir: string): Promise<void> {
  if (archivePath.endsWith('.zip')) {
    const zip = new AdmZip(archivePath)
    zip.extractAllTo(destDir, true)
  } else if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) {
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(archivePath)
        .pipe(zlib.createGunzip())
        .pipe(tar.extract({ cwd: destDir }))
        .on('finish', resolve)
        .on('error', reject)
    })
  } else if (archivePath.endsWith('.gz')) {
    // Single-file gzip (not tar)
    const outPath = path.join(destDir, path.basename(archivePath, '.gz'))
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(archivePath)
        .pipe(zlib.createGunzip())
        .pipe(fs.createWriteStream(outPath))
        .on('finish', resolve)
        .on('error', reject)
    })
  } else {
    throw new Error(`Unsupported archive format: ${archivePath}`)
  }
}
```

#### 2.2 `rm -rf` Replacement

```typescript
// Before (line 659):
await spawnPromise('rm', ['-rf', dir])

// After:
fs.rmSync(dir, { recursive: true, force: true })
```

> **Note**: The `chmod -R u+w` + `rm -rf` pattern used for Go cache cleanup in `pipeline.ts` can be directly replaced with `fs.rmSync(dir, { recursive: true, force: true })`. Node.js 18+ `fs.rm` does not require chmod first.

---

## 3. Python Binary Naming

### Current Status

Hardcoded Unix Python3 paths, with the command name fixed as `python3`:

```typescript
const PYTHON_PATHS = [
  '/opt/homebrew/bin/python3',
  '/usr/local/bin/python3',
  '/usr/bin/python3',
]
```

### Remediation Plan

Use `which`/`where` for dynamic lookup, and add `python` as a fallback:

```typescript
async function findPython(): Promise<string> {
  const candidates = process.platform === 'win32'
    ? ['python', 'python3', 'py']
    : ['python3', 'python']

  for (const cmd of candidates) {
    try {
      // On Windows, use `where` instead of `which`
      const whichCmd = process.platform === 'win32' ? 'where' : 'which'
      await spawnPromise(whichCmd, [cmd])
      return cmd
    } catch {
      continue
    }
  }
  throw new Error('Python not found. Install Python and ensure it is in PATH.')
}
```

---

## 4. Process Signals

### Current Status

```typescript
child.kill('SIGTERM')
```

Windows does not support `SIGTERM`; Node.js falls back to `SIGKILL` (forceful termination).

### Remediation Plan

```typescript
function killProcess(child: ChildProcess): void {
  if (process.platform === 'win32') {
    // Windows: Use taskkill to ensure the child process tree is also terminated
    if (child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'])
    }
  } else {
    child.kill('SIGTERM')
    // Force kill after 5s
    setTimeout(() => { child.kill('SIGKILL') }, 5000)
  }
}
```

---

## 5. Bash Scripts in Generated Code

### Current Status

`converter/src/convert.ts` injects a bash postinstall script into the generated `package.json`:

```typescript
scripts['postinstall'] = 'if [ -d server ] && [ -f server/package.json ]; then (cd server && npm install --legacy-peer-deps); fi'
```

### Remediation Plan

Switch to a Node.js script saved as `scripts/postinstall.js`, output alongside the generated `esbuild.mjs`:

```javascript
// scripts/postinstall.js — automatically written by the generator
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const serverDir = path.join(__dirname, 'server')
const serverPkg = path.join(serverDir, 'package.json')

if (fs.existsSync(serverDir) && fs.existsSync(serverPkg)) {
  execSync('npm install --legacy-peer-deps', { cwd: serverDir, stdio: 'inherit' })
}
```

`convert.ts` changes to:

```typescript
scripts['postinstall'] = 'node scripts/postinstall.js'
// Also write scripts/postinstall.js to the output directory
generatedFiles.push({
  path: 'scripts/postinstall.js',
  content: postinstallScriptContent,
})
```

---

## 6. tsc Output Parsing

### Current Status

`convert.ts` uses regex to parse tsc compilation errors, with hardcoded `/` separator:

```typescript
const errorFiles = new Set(checkOut.match(/^src\/(.+?\.ts)\(/gm))
```

On Windows, tsc output paths use `\`, which the regex cannot match.

### Remediation Plan

Make the separator platform-independent:

```typescript
const sep = path.sep === '\\' ? '\\\\' : '/'
const re = new RegExp(`^src${sep}(.+?\\.ts)\\(`, 'gm')
const errorFiles = new Set(checkOut.match(re))
```

---

## 7. chmod Permission Settings

### Current Status

Multiple places use `fs.chmodSync(path, 0o755)` to set binary executable permissions.

### Remediation Plan

Windows does not distinguish executable permissions. Wrap with a conditional skip:

```typescript
function setExecutable(filePath: string): void {
  if (process.platform !== 'win32') {
    fs.chmodSync(filePath, 0o755)
  }
  // Windows: No action needed, .exe extension is sufficient
}
```

> **Note**: The current try/catch already handles this (`chmod` failure is caught), but an explicit skip is cleaner and more reliable.

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

### 9.2 Windows-Specific Tests

| Test Item | Verification Method |
|-----------|-------------------|
| Coc config directory resolution | `getCocConfigDir()` returns `%APPDATA%/coc` |
| Archive extraction | Test `.zip`, `.tar.gz`, `.gz` formats separately |
| Python lookup | `findPython()` returns `python` instead of `python3` |
| Process termination | `killProcess()` calls `taskkill` |
| No bash artifacts | Check `postinstall` in output `package.json` |
| chmod skip | No error on Windows |
| tsc error parsing | `src\foo.ts(10,5)` can be matched correctly |
| Binary download | Downloads Windows platform asset |
| pip installation | `--break-system-packages` is not used on Windows |
| Full installation flow | Install one each of Volar / Deno / Tailwind CSS |

### 9.3 Known Infeasible Items

| Feature | Reason |
|---------|--------|
| `switch.sh local` symlink | Windows requires administrator privileges or Developer Mode to create symlinks; does not block core functionality |

---

## Priority Timeline

| Phase | Content | Estimated Effort |
|-------|---------|-----------------|
| **P0** | Path system unification (`paths.ts`) | Half day |
| **P0** | Archive extraction refactoring (`extractArchive`) | Half day |
| **P1** | Python lookup + process signals + chmod | 2 hours |
| **P1** | postinstall bash → Node.js script | 2 hours |
| **P1** | Cross-platform tsc error parsing | 1 hour |
| **P2** | `switch.sh` → Node.js rewrite | Half day |
| **P2** | `dev.sh` → Node.js rewrite | 1 hour |
| **Verification** | Windows VM/CI end-to-end testing | Half day |

**Total**: Approximately 2-3 person-days.
