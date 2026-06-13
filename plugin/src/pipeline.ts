import { StateManager } from './state'
import { getPackage, PackageInfo } from './registry'
import { spawn } from 'child_process'
import { window as cocWindow } from 'coc.nvim'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

const CACHE_ROOT = path.join(os.homedir(), '.config', 'coc', 'converter-cache')

function cacheDir(name: string): string {
  return path.join(CACHE_ROOT, name)
}

function sourceDir(name: string): string {
  return path.join(cacheDir(name), 'source')
}

function buildDir(name: string): string {
  return path.join(cacheDir(name), 'build')
}

function pluginDir(name: string): string {
  return path.join(os.homedir(), '.config', 'coc', 'extensions', 'node_modules', `coc-${name}`)
}

function converterCliPath(): string {
  const base = path.resolve(__dirname, '..')
  const candidates = [
    path.join(base, 'converter', 'src', 'cli.ts'),
    path.join(base, '..', 'converter', 'src', 'cli.ts'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  throw new Error(
    'converter CLI not found. ' +
    'Please set $COC_CONVERTER_PATH to the converter/ directory, ' +
    'or ensure it is at the same level as coc-converter/'
  )
}

const CMD_TIMEOUT = 300_000 // 5 minutes

async function run(
  cmd: string, args: string[], cwd: string,
  onLine?: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: true })
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Timed out after ${CMD_TIMEOUT / 1000}s: ${cmd} ${args.join(' ')}`))
    }, CMD_TIMEOUT)
    const handler = (data: Buffer) => {
      const text = data.toString()
      onLine?.(text)
    }
    child.stdout.on('data', handler)
    child.stderr.on('data', handler)
    let stderrBuf = ''
    child.stderr.on('data', (d: Buffer) => { stderrBuf += d.toString() })
    child.on('close', code => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}\n${stderrBuf.trim()}`))
    })
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
  })
}

async function downloadSource(
  info: PackageInfo, name: string,
  onProgress: (step: number, total: number, msg: string, cmd: string) => void,
): Promise<string> {
  const srcDir = sourceDir(name)
  const cache = cacheDir(name)
  const repoUrl = `https://github.com/${info.source.repo}.git`

  const log = (chunk: string) => onProgress(1, 5, chunk.trim(), '')
  if (fs.existsSync(srcDir)) {
    onProgress(1, 5, 'Updating source...', `git -C ${srcDir} pull`)
    await run('git', ['-C', srcDir, 'pull'], cache, log)
  } else {
    onProgress(1, 5, 'Cloning repository...', `git clone --depth=1 ${repoUrl}`)
    fs.mkdirSync(cache, { recursive: true })
    await run('git', ['clone', '--depth=1', repoUrl, srcDir], cache, log)
  }

  return info.source.subdir ? path.join(srcDir, info.source.subdir) : srcDir
}

async function convertSource(
  inputDir: string, name: string,
  onProgress: (step: number, total: number, msg: string, cmd: string) => void,
): Promise<void> {
  const build = buildDir(name)
  if (fs.existsSync(build)) fs.rmSync(build, { recursive: true })

  const cli = converterCliPath()
  const converterDir = path.resolve(path.dirname(path.dirname(cli)))

  // Install converter deps if missing (e.g. when installed from npm)
  if (!fs.existsSync(path.join(converterDir, 'node_modules', 'commander'))) {
    onProgress(2, 5, 'Installing converter dependencies...', '')
    const log = (chunk: string) => onProgress(2, 5, chunk.trim(), '')
    await run('npm', ['install', '--legacy-peer-deps', '--production'], converterDir, log)
  }

  onProgress(2, 5, 'Converting...', `converter convert ${inputDir} -o ${build}`)
  const log = (chunk: string) => onProgress(2, 5, chunk.trim(), '')
  await run('npx', ['tsx', cli, 'convert', inputDir, '-o', build], cacheDir(name), log)
}

async function buildPackage(
  name: string, inputDir: string, info: PackageInfo,
  onProgress: (step: number, total: number, msg: string, cmd: string) => void,
): Promise<void> {
  const build = buildDir(name)

  const npmLog = (chunk: string) => onProgress(3, 5, chunk.trim(), '')
  onProgress(3, 5, 'Installing dependencies...', 'npm install --legacy-peer-deps')
  await run('npm', ['install', '--legacy-peer-deps'], build, npmLog)

  // Run postinstall if present (some extensions download servers here)
  onProgress(3, 5, 'Running postinstall...', 'npm run postinstall')
  await run('npm', ['run', 'postinstall', '--if-present'], build, npmLog).catch(() => {})
  // Install pip packages if configured in registry
  if (info.pipPackages?.length) {
    const pipLog = (chunk: string) => onProgress(3, 5, chunk.trim(), '')
    // Try multiple python binary paths (coc's process may not have Homebrew in PATH)
    const pythonPaths = [
      '/opt/homebrew/bin/python3',
      '/usr/local/bin/python3',
      '/usr/bin/python3',
      'python3',
    ]
    let pythonBin = ''
    for (const p of pythonPaths) {
      if (p === 'python3') {
        try { await run('python3', ['--version'], build); pythonBin = 'python3'; break } catch { continue }
      } else if (fs.existsSync(p)) {
        pythonBin = p; break
      }
    }
    if (!pythonBin) throw new Error('python3 not found, cannot install pip packages: ' + info.pipPackages.join(', '))
    const pipArgs = ['-m', 'pip', 'install']
    // --break-system-packages needed on Linux and macOS (PEP 668); check Python version for support
    if (process.platform === 'linux' || process.platform === 'darwin') {
      try {
        const verOut = await runWithOutput(pythonBin, ['--version'], build)
        const m = verOut.match(/^Python\s+(\d+)\.(\d+)/)
        if (m) {
          const pyMajor = parseInt(m[1]), pyMinor = parseInt(m[2])
          if (pyMajor > 3 || (pyMajor === 3 && pyMinor >= 11)) pipArgs.push('--break-system-packages')
        }
      } catch {}
    }
    onProgress(3, 5, 'Installing pip packages...', `${pythonBin} -m pip install ${info.pipPackages.join(' ')}`)
    await run(pythonBin, pipArgs.concat(...info.pipPackages), build, pipLog)
  }

  // Check for server directory in original source and install its deps
  const serverDir = path.join(inputDir, 'server')
  if (fs.existsSync(serverDir) && fs.existsSync(path.join(serverDir, 'package.json'))) {
    onProgress(3, 5, 'Installing server dependencies...', `npm install in ${serverDir}`)
    await run('npm', ['install', '--legacy-peer-deps'], serverDir, npmLog)
    const destServer = path.join(build, 'server')
    if (fs.existsSync(destServer)) fs.rmSync(destServer, { recursive: true })
    fs.cpSync(serverDir, destServer, { recursive: true })
  }

  onProgress(4, 5, 'Building...', 'node esbuild.mjs')
  const buildLog = (chunk: string) => onProgress(4, 5, chunk.trim(), '')
  await run('node', ['esbuild.mjs'], build, buildLog)

  // Download binary language server from GitHub release (configured in registry)
  if (info.serverBinary) {
    const sb = info.serverBinary
    onProgress(4, 5, 'Downloading language server...', `fetching ${sb.repo}`)
    try {
      const tagRes = await fetch(`https://api.github.com/repos/${sb.repo}/releases/latest`)
      if (!tagRes.ok) throw new Error(`GitHub API: HTTP ${tagRes.status}`)
      const tagData: any = await tagRes.json()
      const tag: string = tagData.tag_name
      const version = tag.replace(/^v/, '')

      // Template variables
      const archMap: Record<string, string> = {
        arm64: 'aarch64', x64: 'x86_64',
      }
      const platformMap: Record<string, string> = {
        darwin: 'apple-darwin', linux: 'unknown-linux-gnu', win32: 'pc-windows-msvc',
      }
      const arch = os.arch() === 'arm64' ? 'arm64' : 'x64'
      const platform: string = process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux'
      const rawArch = archMap[arch] || arch
      const rustTarget = `${rawArch}-${platformMap[platform] || platform}`

      const filename = sb.asset
        .replace(/\{\{version}}/g, version)
        .replace(/\{\{platform}}/g, platform)
        .replace(/\{\{arch}}/g, arch)
        .replace(/\{\{raw-arch}}/g, rawArch)
        .replace(/\{\{rust-target}}/g, rustTarget)
      const url = `https://github.com/${sb.repo}/releases/download/${tag}/${filename}`

      onProgress(4, 5, 'Downloading...', `curl ${filename}`)
      await run('curl', ['-#SL', url, '-o', path.join(build, filename)], build)
      onProgress(4, 5, 'Extracting...', filename)

      const serverDir = path.join(build, 'server')
      fs.mkdirSync(serverDir, { recursive: true })

      if (filename.endsWith('.zip')) {
        await run('unzip', ['-o', filename, '-d', serverDir], build)
      } else if (filename.endsWith('.gz') && !filename.endsWith('.tar.gz')) {
        // Single-file gzip: decompress then move to server dir
        const outName = filename.replace(/\.gz$/, '')
        await run('gunzip', [filename], build)
        fs.renameSync(path.join(build, outName), path.join(serverDir, outName))
      } else {
        await run('tar', ['xzf', filename, '-C', serverDir], build)
      }
      // Make server binary executable (run BEFORE rmSync in case it fails)
      try {
        fs.readdirSync(serverDir).forEach(f => {
          fs.chmodSync(path.join(serverDir, f), 0o755)
        })
      } catch {}
      if (sb.binaryPath || filename.match(/\.(zip|gz)$/)) {
        const archivePath = path.join(build, filename)
        if (fs.existsSync(archivePath)) fs.rmSync(archivePath)
      }

      // Wire server binary path into generated lib/index.js
      const indexPath = path.join(build, 'lib', 'index.js')
      if (fs.existsSync(indexPath)) {
        const binPath = (sb.binaryPath || sb.asset.split(/-?\{\{/)[0])
          .replace(/\{\{version}}/g, version)
          .replace(/\{\{platform}}/g, platform)
          .replace(/\{\{arch}}/g, arch)
          .replace(/\{\{raw-arch}}/g, rawArch)
          .replace(/\{\{rust-target}}/g, rustTarget)
        let code = fs.readFileSync(indexPath, 'utf-8')

        // Replace module-based LanguageClient with command-based for binary servers
        const svrArgs = sb.args?.length ? JSON.stringify(sb.args) : '[]'
        code = code.replace(
          /\{ module:\s*serverModule,\s*transport:\s*\w+\.TransportKind\.\w+\s*\}/,
          `{ command: serverModule, args: ${svrArgs} }`,
        )

        // Replace require.resolve calls with direct binary path
        const serverPath = `require('path').join(__dirname, '..', 'server', '${binPath}')`
        code = code.replace(
          /try\s*\{[^}]*?require\.resolve\([^)]+\)\s*;?\s*\}\s*catch\s*\{\s*\}/g,
          `try { serverModule = ${serverPath} } catch {}`,
        )

        // Replace config-based server path resolution with direct binary path
        // Converter generates: let serverModule = config.get("server.path", "");
        // We need: let serverModule = require('path').join(...server/deno);
        code = code.replace(
          /let\s+serverModule\s*=\s*config\.get\([^)]+\)\s*;?\s*/g,
          `let serverModule = ${serverPath};`,
        )

        fs.writeFileSync(indexPath, code)
      }
    } catch (e: any) {
      onProgress(4, 5, `Warning: serverBinary setup failed (${e.message})`, 'install server binary manually')
    }
  }

  // Fix documentSelector for ALL extensions (not just serverBinary):
  // generated code uses config namespace (e.g. "evenBetterToml") but coc needs
  // the actual language ID (e.g. "toml"). The languages come from registry entry.
  const docSelPath = path.join(build, 'lib', 'index.js')
  if (fs.existsSync(docSelPath)) {
    let code = fs.readFileSync(docSelPath, 'utf-8')

    // Fix documentSelector: generated code uses config namespace (e.g. "evenBetterToml")
    const langSelector = info.languages.map(l => `{ scheme: "file", language: "${l}" }`).join(', ')
    code = code.replace(
      /documentSelector:\s*\[\s*\{[^}]*?language:\s*['"][^'"]*['"][^}]*\}\s*\]/,
      `documentSelector: [${langSelector}]`,
    )

    // Wrap client.start() in a guard to prevent disposed connection errors
    // when the server and client initialize asynchronously
    code = code.replace(
      /client\.start\(\);/g,
      "client.start().catch(() => {/* init may complete async */});",
    )

    fs.writeFileSync(docSelPath, code)
  }

  // Fix activationEvents in package.json: use actual language IDs instead of whatever
  // converter picked up (e.g. "cargoLock" → "toml")
  const pkgPath = path.join(build, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
      const events = pkg.activationEvents || []
      const langEvents = info.languages.map(l => `onLanguage:${l}`)
      const newEvents = events.filter((e: string) => !e.startsWith('onLanguage:')).concat(langEvents)
      if (newEvents.length > 0 && JSON.stringify(newEvents) !== JSON.stringify(events)) {
        pkg.activationEvents = newEvents
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
      }
    } catch {}
  }
}

function extensionsPkgPath(): string {
  return path.join(os.homedir(), '.config', 'coc', 'extensions', 'package.json')
}

async function installToCoc(
  name: string,
  onProgress: (step: number, total: number, msg: string, cmd: string) => void,
): Promise<void> {
  const src = buildDir(name)
  const dest = pluginDir(name)

  onProgress(5, 5, 'Installing to coc...', `copy to ${dest} + register in extensions/package.json`)

  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true })
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.cpSync(src, dest, { recursive: true })

  const pkgPath = extensionsPkgPath()
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
  pkg.dependencies = pkg.dependencies || {}
  const depName = `coc-${name}`
  if (!pkg.dependencies[depName]) {
    pkg.dependencies[depName] = `file:${dest}`
    pkg.lastUpdate = Date.now()
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
  }
}

function metaPath(name: string): string {
  return path.join(cacheDir(name), 'meta.json')
}

async function saveMeta(name: string): Promise<void> {
  const srcDir = sourceDir(name)
  try {
    const log = await runWithOutput('git', ['-C', srcDir, 'log', '-1', '--format=%h|%s|%ar'], srcDir)
    const [commit, msg, date] = log.split('|')
    fs.writeFileSync(metaPath(name), JSON.stringify({ commit, msg, date, updatedAt: Date.now() }, null, 2))
  } catch { /* non-critical: commit tracking metadata */ }
}

export async function installPackage(state: StateManager, name: string): Promise<void> {
  const info = getPackage(name)
  if (!info) { state.setPackageStatus(name, 'failed', { error: `Unknown package: ${name}` }); return }

  const prog = (step: number, total: number, msg: string, cmd: string) => {
    state.setPackageStatus(name, 'installing', {
      progress: `[${step}/${total}] ${msg}`,
      logEntry: `[${step}/${total}] ${msg}\n  $ ${cmd}`,
      appendLog: true,
    })
  }

  state.setPackageStatus(name, 'installing', { progress: 'Starting...' })

  try {
    const input = await downloadSource(info, name, prog)
    await convertSource(input, name, prog)
    await buildPackage(name, input, info, prog)
    await installToCoc(name, prog)
    await saveMeta(name)
    state.setDirty()
    state.setPackageStatus(name, 'installed')
    cocWindow.showInformationMessage(`coc-${name} installed`)
    // Update commit in state
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath(name), 'utf-8'))
      if (meta.commit) {
        state.mutate(s => {
          const p = s.packages.find(p => p.info.name === name)
          if (p) {
            p.commit = meta.commit
            p.commitMsg = meta.msg
            p.commitDate = meta.date
            p.updated = true
          }
        })
      }
    } catch { /* non-critical: commit display */ }
  } catch (e: any) {
    state.setPackageStatus(name, 'failed', { error: e.message })
  }
}

export async function uninstallPackage(state: StateManager, name: string): Promise<void> {
  state.setPackageStatus(name, 'uninstalling', { progress: '[1/3] Removing from coc...' })

  try {
    const dest = pluginDir(name)
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true })
    }

    state.setPackageStatus(name, 'uninstalling', { progress: '[2/3] Removing from package.json...' })

    const pkgPath = extensionsPkgPath()
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    pkg.dependencies = pkg.dependencies || {}
    const depName = `coc-${name}`
    if (pkg.dependencies[depName]) {
      delete pkg.dependencies[depName]
      pkg.lastUpdate = Date.now()
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
    }

    state.setPackageStatus(name, 'uninstalling', { progress: '[3/3] Removing cache...' })

    const cache = cacheDir(name)
    if (fs.existsSync(cache)) {
      fs.rmSync(cache, { recursive: true })
    }

    state.setPackageStatus(name, 'not-installed')
    state.setDirty()
    cocWindow.showInformationMessage(`coc-${name} uninstalled`)
  } catch (e: any) {
    state.setPackageStatus(name, 'failed', { error: e.message })
  }
}

export async function updatePackage(state: StateManager, name: string): Promise<void> {
  const info = getPackage(name)
  if (!info) { state.setPackageStatus(name, 'failed', { error: `Unknown package: ${name}` }); return }

  const prog = (step: number, total: number, msg: string, cmd: string) => {
    state.setPackageStatus(name, 'updating', {
      progress: `[${step}/${total}] ${msg}`,
      logEntry: `[${step}/${total}] ${msg}\n  $ ${cmd}`,
      appendLog: true,
    })
  }

  state.setPackageStatus(name, 'updating', { progress: 'Starting...' })

  try {
    const input = await downloadSource(info, name, prog)
    await convertSource(input, name, prog)
    await buildPackage(name, input, info, prog)
    await installToCoc(name, prog)
    await saveMeta(name)
    state.setDirty()
    state.setPackageStatus(name, 'installed')
    cocWindow.showInformationMessage(`coc-${name} installed`)
    // Update commit in state
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath(name), 'utf-8'))
      if (meta.commit) {
        state.mutate(s => {
          const p = s.packages.find(p => p.info.name === name)
          if (p) {
            p.commit = meta.commit
            p.commitMsg = meta.msg
            p.commitDate = meta.date
            p.updated = true
          }
        })
      }
    } catch { /* non-critical: commit display */ }
  } catch (e: any) {
    state.setPackageStatus(name, 'failed', { error: e.message })
  }
}

function walkDir(dir: string): string[] {
  const files: string[] = []
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) files.push(...walkDir(p))
      else files.push(p)
    }
  } catch { /* non-critical: file listing */ }
  return files
}

async function runWithOutput(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: true })
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Timed out after ${CMD_TIMEOUT / 1000}s: ${cmd} ${args.join(' ')}`))
    }, CMD_TIMEOUT)
    let out = ''
    child.stdout.on('data', (d: Buffer) => { out += d.toString() })
    child.stderr.on('data', (d: Buffer) => { out += d.toString() })
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(out.trim()) : reject(new Error(`exit ${code}`)) })
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
  })
}

export async function runConcurrent<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency = 3,
): Promise<void> {
  const pool = new Set<Promise<void>>()
  for (const item of items) {
    const p = fn(item).finally(() => pool.delete(p))
    pool.add(p)
    if (pool.size >= concurrency) {
      await Promise.race(pool)
    }
  }
  await Promise.all(pool)
}

export async function checkUpdates(state: StateManager): Promise<void> {
  const s = state.getState()
  const results: Record<string, boolean> = {}

  state.setStatusMessage('Checking for updates...')

  for (const pkg of s.packages) {
    if (pkg.status !== 'installed' || !pkg.commit) continue
    state.setStatusMessage(`Checking ${pkg.info.displayName}...`)
    try {
      const out = await runWithOutput('git', ['ls-remote', `https://github.com/${pkg.info.source.repo}.git`, 'HEAD'], os.homedir())
      const remote = out.split('\t')[0]
      if (remote) results[pkg.info.name] = remote.substring(0, 7) !== pkg.commit
    } catch { /* non-critical: git ls-remote may fail offline */ }
  }

  const updateCount = Object.values(results).filter(Boolean).length
  state.mutate(s => {
    for (const p of s.packages) {
      if (results[p.info.name] !== undefined) p.hasUpdate = results[p.info.name]
    }
    s.statusMessage = undefined
  })

  if (updateCount > 0) {
    state.setStatusMessage(`Found ${updateCount} package(s) with updates. Use 'u' to update.`)
    setTimeout(() => state.setStatusMessage(), 5000)
  } else {
    state.setStatusMessage('All packages up to date.')
    setTimeout(() => state.setStatusMessage(), 3000)
  }
}
