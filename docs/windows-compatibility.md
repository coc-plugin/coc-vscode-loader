# Windows 兼容性计划

## 概述

当前 coc-vscode-loader **不支持 Windows**。本文档详细分析所有兼容性壁垒，按优先级排列整改方案。

**目标**: 使 converter (CLI)、plugin (TUI + pipeline) 在 Windows 10/11 上正常工作。

---

## 目录

1. [路径系统 — Coc 配置目录](#1-路径系统--coc-配置目录)
2. [Shell 命令缺失 — unzip / gunzip / rm -rf](#2-shell-命令缺失)
3. [Python 二进制命名](#3-python-二进制命名)
4. [进程信号 — SIGTERM](#4-进程信号)
5. [生成代码中的 Bash 脚本](#5-生成代码中的-bash-脚本)
6. [tsc 输出解析](#6-tsc-输出解析)
7. [chmod 权限设置](#7-chmod-权限设置)
8. [Shell 脚本迁移](#8-shell-脚本迁移)
9. [验证清单](#9-验证清单)

---

## 1. 路径系统 — Coc 配置目录

### 现状

所有模块硬编码 `path.join(os.homedir(), '.config', 'coc', ...)`，Windows 下 coc.nvim 实际使用 `%APPDATA%/coc`（即 `C:\Users\<user>\AppData\Roaming\coc`）。

### 波及文件

| 文件 | 用途 |
|------|------|
| `plugin/src/pipeline.ts` | 缓存、构建、installToCoc |
| `plugin/src/registry.ts` | 本地缓存路径 |
| `plugin/src/index.ts` | 日志路径 |
| `plugin/src/state.ts` | 状态持久化路径 |
| `plugin/src/tui.ts` | 日志文件引用 |

### 整改方案

新建 `plugin/src/paths.ts`，统一导出所有路径：

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

### 迁移步骤

1. 创建 `paths.ts`
2. 逐模块替换硬编码路径为 `paths.ts` 导出
3. 更新所有 `import` 语句

### 影响范围

- `pipeline.ts`: `CACHE_DIR`, `BUILD_DIR`, `INSTALL_DIR`, `EXTENSIONS_DIR`
- `registry.ts`: `REGISTRY_CACHE`
- `index.ts`: `LOG_FILE`
- `state.ts`: `STATE_FILE`

---

## 2. Shell 命令缺失

### 现状

`pipeline.ts` 通过 `spawn()` 调用外部 shell 命令，部分命令 Windows 不存在。

### 命令清单

| 命令 | 行号 | Windows | 替代方案 |
|------|------|---------|----------|
| `unzip` | 475 | ❌ 不存在 | `adm-zip` npm 包或 `tar -xf`（Win10+ 内置） |
| `gunzip` | 481 | ❌ 不存在 | Node.js `zlib.createGunzip()` + `fs.createWriteStream()` |
| `rm -rf` | 659 | ❌ cmd 无此命令 | `fs.rmSync(dir, { recursive: true, force: true })`（Node 16.7+） |
| `chmod` | 658 | ⚠️ 不存在但 try/catch 兜底 | 跳过（见第 7 节） |
| `git` | 多处 | ✅ Git for Windows | 确保在 PATH 中即可 |
| `curl` | 多处 | ✅ Win10+ 内置 `curl.exe` | 确保在 PATH 中 |
| `tar` | 477 | ✅ Win10+ 内置 `tar.exe` | 确保在 PATH 中 |
| `npm` | 多处 | ✅ `npm.cmd` | 自动由 Node.js 解析 |
| `npx` | 多处 | ✅ `npx.cmd` | 自动由 Node.js 解析 |
| `node` | 383 | ✅ `node.exe` | 自动由 Node.js 解析 |
| `go` | 336 | ✅ | 需用户安装 |
| `cargo` | 357 | ✅ | 需用户安装 |

### 整改方案

#### 2.1 压缩包解压统一

将分散的 `unzip` / `tar` / `gunzip` 分支合并为统一的解压函数，使用 Node.js 标准库和 `adm-zip`：

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

#### 2.2 `rm -rf` 替换

```typescript
// Before (line 659):
await spawnPromise('rm', ['-rf', dir])

// After:
fs.rmSync(dir, { recursive: true, force: true })
```

> **注意**: `pipeline.ts` 中 Go 缓存清理的 `chmod -R u+w` + `rm -rf` 模式，可直接替换为 `fs.rmSync(dir, { recursive: true, force: true })`，Node.js 18+ 的 `fs.rm` 不需要先 chmod。

---

## 3. Python 二进制命名

### 现状

硬编码 Unix Python3 路径，且命令名固定为 `python3`：

```typescript
const PYTHON_PATHS = [
  '/opt/homebrew/bin/python3',
  '/usr/local/bin/python3',
  '/usr/bin/python3',
]
```

### 整改方案

使用 `which`/`where` 动态查找，并加入 `python` 备选：

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

## 4. 进程信号

### 现状

```typescript
child.kill('SIGTERM')
```

Windows 不支持 `SIGTERM`，Node.js 会回退为 `SIGKILL`（强制终止）。

### 整改方案

```typescript
function killProcess(child: ChildProcess): void {
  if (process.platform === 'win32') {
    // Windows: 用 taskkill 确保子进程树也被终止
    if (child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'])
    }
  } else {
    child.kill('SIGTERM')
    // 5s 后强制 kill
    setTimeout(() => { child.kill('SIGKILL') }, 5000)
  }
}
```

---

## 5. 生成代码中的 Bash 脚本

### 现状

`converter/src/convert.ts` 在生成的 `package.json` 中注入 bash 后安装脚本：

```typescript
scripts['postinstall'] = 'if [ -d server ] && [ -f server/package.json ]; then (cd server && npm install --legacy-peer-deps); fi'
```

### 整改方案

改用 Node.js 脚本，存为 `scripts/postinstall.js`，由生成的 `esbuild.mjs` 一同输出：

```javascript
// scripts/postinstall.js — 自动由生成器写入
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const serverDir = path.join(__dirname, 'server')
const serverPkg = path.join(serverDir, 'package.json')

if (fs.existsSync(serverDir) && fs.existsSync(serverPkg)) {
  execSync('npm install --legacy-peer-deps', { cwd: serverDir, stdio: 'inherit' })
}
```

`convert.ts` 改为：

```typescript
scripts['postinstall'] = 'node scripts/postinstall.js'
// 同时写入 scripts/postinstall.js 到输出目录
generatedFiles.push({
  path: 'scripts/postinstall.js',
  content: postinstallScriptContent,
})
```

---

## 6. tsc 输出解析

### 现状

`convert.ts` 用正则解析 tsc 编译错误，硬编码 `/` 分隔符：

```typescript
const errorFiles = new Set(checkOut.match(/^src\/(.+?\.ts)\(/gm))
```

Windows 下 tsc 输出路径使用 `\`，正则无法匹配。

### 整改方案

使分隔符与平台无关：

```typescript
const sep = path.sep === '\\' ? '\\\\' : '/'
const re = new RegExp(`^src${sep}(.+?\\.ts)\\(`, 'gm')
const errorFiles = new Set(checkOut.match(re))
```

---

## 7. chmod 权限设置

### 现状

多处 `fs.chmodSync(path, 0o755)` 设置二进制可执行权限。

### 整改方案

Windows 不区分可执行权限。包一层条件跳过：

```typescript
function setExecutable(filePath: string): void {
  if (process.platform !== 'win32') {
    fs.chmodSync(filePath, 0o755)
  }
  // Windows: 不需要操作，.exe 后缀已足够
}
```

> **注意**: 当前 try/catch 已兜底 (`chmod` 失败被捕获)，但显式跳过更清晰可靠。

---

## 8. Shell 脚本迁移

### 现状

| 脚本 | 用途 | 是否阻塞 Windows |
|------|------|------------------|
| `dev.sh` | 测试 + push | ❌ 低优先级，可用 `SKIP_SMOKE=1 git push` 替代 |
| `switch.sh` | 切换 dev/npm 模式 | ⚠️ 中等，可用 Node.js 重写 |
| `scripts/convert-plugin.sh` | CLI 转换入口 | ⚠️ 中等 |
| `scripts/test-*.sh` | 测试工具 | ❌ 低优先级，可用 `npm test` 替代 |

### 整改方案

`dev.sh` 和 `switch.sh` 重写为 `.mjs` 文件，使其跨平台：

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

// ... 其余逻辑等同 switch.sh
```

---

## 9. 验证清单

### 9.1 单元测试通过

```bash
npm test                    # 117 tests
npm run test:smoke          # 128 registry entries
```

### 9.2 Windows 专项测试

| 测试项 | 验证方法 |
|--------|----------|
| Coc 配置目录解析 | `getCocConfigDir()` 返回 `%APPDATA%/coc` |
| 压缩包解压 | 分别测试 `.zip`, `.tar.gz`, `.gz` 格式 |
| Python 查找 | `findPython()` 返回 `python` 而非 `python3` |
| 进程终止 | `killProcess()` 调用 `taskkill` |
| 无 bash 生成物 | 检查输出 `package.json` 的 `postinstall` |
| chmod 跳过 | Windows 下不报错 |
| tsc 错误解析 | `src\foo.ts(10,5)` 能被正确匹配 |
| 二进制下载 | 下载 Windows 平台 asset |
| pip 安装 | `--break-system-packages` 不在 Windows 下使用 |
| 完整安装流程 | 安装 Volar / Deno / Tailwind CSS 各一个 |

### 9.3 已知不可行项

| 功能 | 原因 |
|------|------|
| `switch.sh local` symlink | Windows 下需要管理员权限或 Developer Mode 才能创建符号链接，不阻塞核心功能 |

---

## 优先级时间线

| Phase | 内容 | 预计工时 |
|-------|------|----------|
| **P0** | 路径系统统一 (`paths.ts`) | 半天 |
| **P0** | 压缩包解压重构 (`extractArchive`) | 半天 |
| **P1** | Python 查找 + 进程信号 + chmod | 2 小时 |
| **P1** | postinstall bash → Node.js 脚本 | 2 小时 |
| **P1** | tsc 错误解析跨平台 | 1 小时 |
| **P2** | `switch.sh` → Node.js 重写 | 半天 |
| **P2** | `dev.sh` → Node.js 重写 | 1 小时 |
| **验证** | Windows VM/CI 端到端测试 | 半天 |

**总计**: 约 2-3 人天。
