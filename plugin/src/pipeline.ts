import { StateManager } from './state'
import { getPackage, PackageInfo } from './registry'
import { spawn, execFile, execSync } from 'child_process'
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
    // In dev mode (symlink), the converter is at repo root
    path.join(base, '..', 'converter', 'src', 'cli.ts'),
    // In npm install, the converter is bundled inside the package
    path.join(base, 'converter', 'src', 'cli.ts'),
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

let _npmRegistry: string | undefined
let _npmRegistryInited = false
function npmRegistryUrl(): string | undefined {
  if (_npmRegistryInited) return _npmRegistry
  _npmRegistryInited = true
  if (process.env.COC_NPM_REGISTRY) {
    _npmRegistry = process.env.COC_NPM_REGISTRY
    return _npmRegistry
  }
  try {
    _npmRegistry = execSync('npm config get registry', { encoding: 'utf-8', timeout: 5000 }).trim()
    if (_npmRegistry === 'https://registry.npmjs.org/') _npmRegistry = undefined
  } catch {
    _npmRegistry = undefined
  }
  return _npmRegistry
}

function npmInstallArgs(): string[] {
  const args = ['install', '--legacy-peer-deps']
  const reg = npmRegistryUrl()
  if (reg) args.push('--registry', reg)
  return args
}

const CMD_TIMEOUT = 300_000 // 5 minutes

async function run(
  cmd: string, args: string[], cwd: string,
  onLine?: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: false })
    const timer = setTimeout(() => {
      if (settled) return; settled = true
      child.kill('SIGTERM')
      reject(new Error(`Timed out after ${CMD_TIMEOUT / 1000}s: ${cmd} ${args.join(' ')}`))
    }, CMD_TIMEOUT)
    let stderrBuf = ''
    const report = (text: string) => {
      onLine?.(text)
    }
    child.stdout.on('data', (d: Buffer) => report(d.toString()))
    child.stderr.on('data', (d: Buffer) => {
      const text = d.toString()
      stderrBuf += text
      report(text)
    })
    child.on('close', code => {
      if (settled) return; settled = true
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}\n${stderrBuf.trim()}`))
    })
    child.on('error', (e) => { if (settled) return; settled = true; clearTimeout(timer); reject(e) })
  })
}

async function downloadSource(
  info: PackageInfo, name: string,
  onProgress: (step: number, total: number, msg: string, cmd: string) => void,
): Promise<{ dir: string; updated: boolean }> {
  const srcDir = sourceDir(name)
  const cache = cacheDir(name)
  const repoUrl = `https://github.com/${info.source.repo}.git`
  let output = ''

  if (fs.existsSync(srcDir)) {
    onProgress(1, 5, 'Updating source...', `git -C ${srcDir} pull`)
    const log = (chunk: string) => {
      output += chunk
      onProgress(1, 5, 'Updating source...', chunk.trim())
    }
    await run('git', ['-C', srcDir, 'pull'], cache, log)
  } else {
    onProgress(1, 5, 'Cloning repository...', `git clone --depth=1 ${repoUrl}`)
    fs.mkdirSync(cache, { recursive: true })
    const log = (chunk: string) => onProgress(1, 5, 'Cloning repository...', chunk.trim())
    await run('git', ['clone', '--depth=1', repoUrl, srcDir], cache, log)
  }

  const dir = info.source.subdir ? path.join(srcDir, info.source.subdir) : srcDir
  const updated = !output.includes('Already up to date.')
  return { dir, updated }
}

async function convertSource(
  inputDir: string, name: string, info: PackageInfo,
  onProgress: (step: number, total: number, msg: string, cmd: string) => void,
): Promise<void> {
  const build = buildDir(name)
  await rimraf(build)

  const cli = converterCliPath()
  const converterDir = path.resolve(path.dirname(path.dirname(cli)))

  // Install converter deps if missing (e.g. when installed from npm)
  if (!fs.existsSync(path.join(converterDir, 'node_modules', 'commander'))) {
    onProgress(2, 5, 'Installing converter dependencies...', '')
    const log = (chunk: string) => onProgress(2, 5, chunk.trim(), '')
    await run('npm', [...npmInstallArgs(), '--omit=dev'], converterDir, log)
  }

  // Build convert config from registry entry
  if (!info.convert || !Array.isArray(info.convert) || info.convert.length === 0) {
    throw new Error(`Registry entry "${name}" has no "convert" config. Please update the registry.`)
  }

  // Write convert config to temp file to avoid shell escaping issues with JSON
  const convertFile = path.join(cacheDir(name), 'convert-config.json')
  fs.mkdirSync(path.dirname(convertFile), { recursive: true })
  fs.writeFileSync(convertFile, JSON.stringify(info.convert))

  // Fetch presets from remote registry (cached in cache dir)
  const presetsFile = path.join(cacheDir(name), 'presets-config.json')
  const registryDir = path.resolve(__dirname, '..', '..', 'coc-vscode-registry')
  const localPresets = path.join(registryDir, 'presets.json')
  if (fs.existsSync(localPresets)) {
    // Local dev mode: read from local coc-vscode-registry clone
    fs.writeFileSync(presetsFile, fs.readFileSync(localPresets))
  } else {
    // npm mode: fetch from remote (cached globally)
    const globalPresetsCache = path.join(os.homedir(), '.config', 'coc', 'converter-cache', 'presets.json')
    if (!fs.existsSync(globalPresetsCache)) {
      const presetsUrl = 'https://raw.githubusercontent.com/coc-plugin/coc-vscode-registry/main/presets.json'
      try {
        const res = await fetch(presetsUrl)
        if (res.ok) {
          fs.mkdirSync(path.dirname(globalPresetsCache), { recursive: true })
          fs.writeFileSync(globalPresetsCache, await res.text())
        }
      } catch {
        // fetch may fail with lowercase http_proxy - fallback to curl
        try {
          const out = await new Promise<string>((resolve, reject) => {
            execFile('curl', ['-sL', presetsUrl], { encoding: 'utf-8', maxBuffer: 1024 * 1024 }, (err, stdout) => err ? reject(err) : resolve(stdout))
          })
          if (out) {
            fs.mkdirSync(path.dirname(globalPresetsCache), { recursive: true })
            fs.writeFileSync(globalPresetsCache, out)
          }
        } catch {}
      }
    }
    if (fs.existsSync(globalPresetsCache)) {
      fs.writeFileSync(presetsFile, fs.readFileSync(globalPresetsCache))
    }
  }

  const args = ['tsx', cli, 'convert', inputDir, '-o', build, '--convert-file', convertFile]
  if (fs.existsSync(presetsFile)) args.push('--presets-file', presetsFile)

  onProgress(2, 5, 'Converting...', `converter convert ${inputDir} -o ${build}`)
  const log = (chunk: string) => onProgress(2, 5, chunk.trim(), '')
  await run('npx', args, cacheDir(name), log)
}

async function buildPackage(
  name: string, inputDir: string, info: PackageInfo,
  onProgress: (step: number, total: number, msg: string, cmd: string) => void,
): Promise<void> {
  const build = buildDir(name)

  // Copy local language server from source if configured with a relative path
  const hasLocalServer = (info.convert || []).some(s =>
    (s as any).type === 'language-client' && (s as any).server?.kind === 'module'
    && typeof (s as any).server?.package === 'string'
    && ((s as any).server.package.startsWith('./') || (s as any).server.package.startsWith('../'))
  )
  if (hasLocalServer && inputDir) {
    const srcServer = path.join(inputDir, 'server')
    const destServer = path.join(build, 'server')
    if (fs.existsSync(srcServer)) {
      onProgress(3, 5, 'Copying language server...', `cp ${srcServer} → ${destServer}`)
      await rimraf(destServer)
      await cpdir(srcServer, destServer)
    }
  }

  const npmLog = (chunk: string) => onProgress(3, 5, chunk.trim(), '')
  onProgress(3, 5, 'Installing dependencies...', `npm ${npmInstallArgs().join(' ')}`)
  await run('npm', npmInstallArgs(), build, npmLog)

  // Run postinstall if present (some extensions download servers here)
  onProgress(3, 5, 'Running postinstall...', 'npm run postinstall')
  try {
    await run('npm', ['run', 'postinstall', '--if-present'], build, npmLog)
  } catch (e: any) {
    onProgress(3, 5, `Warning: postinstall failed (${e.message})`, 'may affect plugin functionality')
  }
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
    onProgress(3, 5, 'Installing server dependencies...', `npm ${npmInstallArgs().join(' ')} in ${serverDir}`)
    await run('npm', npmInstallArgs(), serverDir, npmLog)
    const destServer = path.join(build, 'server')
    await rimraf(destServer)
    await cpdir(serverDir, destServer)
  }

  onProgress(4, 5, 'Building...', 'node esbuild.mjs')
  const buildLog = (chunk: string) => onProgress(4, 5, chunk.trim(), '')
  await run('node', ['esbuild.mjs'], build, buildLog)

  // Resolve template variables {{...}} in lib/index.js (generated by language-client step)
  // Must run AFTER esbuild since lib/index.js is created by it
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
  const indexPath = path.join(build, 'lib', 'index.js')
  if (fs.existsSync(indexPath)) {
    let code = fs.readFileSync(indexPath, 'utf-8')
    for (const [key, val] of [['platform', platform], ['arch', arch], ['raw-arch', rawArch], ['rust-target', rustTarget]] as [string, string][]) {
      code = code.replace(new RegExp(`\\{\\{${key}}}`, 'g'), val)
    }
    if (code !== fs.readFileSync(indexPath, 'utf-8')) {
      fs.writeFileSync(indexPath, code)
    }
  }

  // Download binary language server from GitHub release (configured in registry)
  if (info.serverBinary) {
    const sb = info.serverBinary
    onProgress(4, 5, 'Downloading language server...', `fetching ${sb.repo}`)
    try {
      // Use curl for GitHub API (fetch doesn't respect lowercase http_proxy env vars)
      let tagData: any
      try {
        const tagRes = await fetch(`https://api.github.com/repos/${sb.repo}/releases/latest`)
        if (!tagRes.ok) throw new Error(`HTTP ${tagRes.status}`)
        tagData = await tagRes.json()
      } catch {
        const out = await new Promise<string>((resolve, reject) => {
          execFile('curl', ['-sL', `https://api.github.com/repos/${sb.repo}/releases/latest`], { encoding: 'utf-8', maxBuffer: 1024 * 1024 }, (err, stdout) => err ? reject(err) : resolve(stdout))
        })
        tagData = JSON.parse(out)
      }
      const tag: string = tagData.tag_name
      const version = tag.replace(/^v/, '')

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
      } else if (filename.endsWith('.tar.gz') || filename.endsWith('.tgz')) {
        await run('tar', ['xzf', filename, '-C', serverDir], build)
      } else if (filename.endsWith('.gz') && !filename.endsWith('.tar.gz')) {
        // Single-file gzip: decompress then move to server dir
        const outName = filename.replace(/\.gz$/, '')
        await run('gunzip', [filename], build)
        fs.renameSync(path.join(build, outName), path.join(serverDir, outName))
      } else {
        // Raw binary: move to server dir, creating subdirs if needed
        const binName = sb.binaryPath || filename
        const destPath = path.join(serverDir, binName)
        fs.mkdirSync(path.dirname(destPath), { recursive: true })
        fs.renameSync(path.join(build, filename), destPath)
      }
      try {
        fs.readdirSync(serverDir).forEach(f => {
          fs.chmodSync(path.join(serverDir, f), 0o755)
        })
      } catch {}
      // Resolve {{version}} in lib/index.js (only available after GitHub API call)
      if (version) {
        const verPath = path.join(build, 'lib', 'index.js')
        if (fs.existsSync(verPath)) {
          let vc = fs.readFileSync(verPath, 'utf-8')
          if (vc.includes('{{version}}')) {
            fs.writeFileSync(verPath, vc.replace(/\{\{version}}/g, version))
          }
        }
      }
      if (sb.binaryPath || filename.match(/\.(zip|gz)$/)) {
        const archivePath = path.join(build, filename)
        if (fs.existsSync(archivePath)) await rimraf(archivePath)
      }
    } catch (e: any) {
      onProgress(4, 5, `Warning: serverBinary setup failed (${e.message})`, 'install server binary manually')
    }
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

  await rimraf(dest)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  await cpdir(src, dest)

  const pkgPath = extensionsPkgPath()
  const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) : { dependencies: {} }
  pkg.dependencies = pkg.dependencies || {}
  const depName = `coc-${name}`
  if (!pkg.dependencies[depName]) {
    pkg.dependencies[depName] = `file:${dest}`
  }
  pkg.lastUpdate = Date.now()
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
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
    })
  }

  state.setPackageStatus(name, 'installing', { progress: 'Starting...' })

  try {
    const { dir: input } = await downloadSource(info, name, prog)
    await convertSource(input, name, info, prog)
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

function rimraf(dir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(dir)) return resolve()
    spawn('rm', ['-rf', dir], { stdio: 'ignore' })
      .on('close', code => code === 0 ? resolve() : reject(new Error(`rm -rf exited ${code}`)))
      .on('error', (e) => reject(e))
  })
}

function cpdir(src: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const parent = path.dirname(dest)
    if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true })
    spawn('cp', ['-r', src, dest], { stdio: 'ignore' })
      .on('close', code => code === 0 ? resolve() : reject(new Error(`cp -r exited ${code}`)))
      .on('error', (e) => reject(e))
  })
}

export async function uninstallPackage(state: StateManager, name: string): Promise<void> {
  state.setPackageStatus(name, 'uninstalling', { progress: '[1/3] Removing from coc...' })

  try {
    await rimraf(pluginDir(name))

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

    await rimraf(cacheDir(name))

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
    })
  }

  state.setPackageStatus(name, 'updating', { progress: 'Starting...' })

  try {
    const { dir: input, updated } = await downloadSource(info, name, prog)
    if (!updated) {
      state.setPackageStatus(name, 'installed')
      cocWindow.showInformationMessage(`coc-${name} is already up to date`)
      return
    }
    await convertSource(input, name, info, prog)
    await buildPackage(name, input, info, prog)
    await installToCoc(name, prog)
    await saveMeta(name)
    state.setDirty()
    state.setPackageStatus(name, 'installed')
    cocWindow.showInformationMessage(`coc-${name} updated`)
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
    let settled = false
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: false })
    const timer = setTimeout(() => {
      if (settled) return; settled = true
      child.kill('SIGTERM')
      reject(new Error(`Timed out after ${CMD_TIMEOUT / 1000}s: ${cmd} ${args.join(' ')}`))
    }, CMD_TIMEOUT)
    let out = ''
    child.stdout.on('data', (d: Buffer) => { out += d.toString() })
    child.stderr.on('data', (d: Buffer) => { out += d.toString() })
    child.on('close', code => {
      if (settled) return; settled = true
      clearTimeout(timer)
      code === 0 ? resolve(out.trim()) : reject(new Error(`exit ${code}`))
    })
    child.on('error', (e) => { if (settled) return; settled = true; clearTimeout(timer); reject(e) })
  })
}

export async function runConcurrent<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency = 3,
): Promise<void> {
  const pool = new Set<Promise<void>>()
  for (const item of items) {
    const p = fn(item).catch(() => {}).finally(() => pool.delete(p))
    pool.add(p)
    if (pool.size >= concurrency) {
      await Promise.race(pool)
    }
  }
  await Promise.allSettled(pool)
}

let checkUpdatesBusy = false

export async function checkUpdates(state: StateManager): Promise<void> {
  if (checkUpdatesBusy) return
  checkUpdatesBusy = true
  try {
    const s = state.getState()
    const results: Record<string, boolean> = {}

    state.setStatusMessage('Checking for updates...')

    for (const pkg of s.packages) {
      if (pkg.status !== 'installed' || !pkg.commit) continue
      const live = state.getPackage(pkg.info.name)
      if (!live || live.status !== 'installed' || !live.commit) continue
      state.setStatusMessage(`Checking ${pkg.info.displayName}...`)
      try {
        const out = await runWithOutput('git', ['ls-remote', `https://github.com/${pkg.info.source.repo}.git`, 'HEAD'], os.homedir())
        const remote = out.split('\t')[0]
        if (remote) results[pkg.info.name] = remote.substring(0, 7) !== live.commit
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
  } finally {
    checkUpdatesBusy = false
  }
}
