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

function extensionsPkgPath(): string {
  return path.join(os.homedir(), '.config', 'coc', 'extensions', 'package.json')
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
    'Ensure the converter/ directory is at the same level as the plugin in dev mode, ' +
    'or reinstall coc-vscode-loader to get the bundled converter.'
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
  const args = ['install', '--legacy-peer-deps', '--no-audit', '--no-fund']
  const reg = npmRegistryUrl()
  if (reg) args.push('--registry', reg)
  return args
}

const CMD_TIMEOUT = 300_000 // 5 minutes

async function run(
  cmd: string, args: string[], cwd: string,
  onLine?: (line: string) => void,
  env?: Record<string, string>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: false, env: env ? { ...process.env, ...env } : undefined })
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

  let beforeHead = ''
  try {
    beforeHead = (await runWithOutput('git', ['-C', srcDir, 'rev-parse', 'HEAD'], cache)).trim()
  } catch {}

  if (fs.existsSync(srcDir)) {
    // Use fetch + reset instead of pull for shallow clone safety (handles default branch rename, force push)
    onProgress(1, 5, 'Updating source...', `git -C ${srcDir} fetch origin`)
    const log = (chunk: string) => {
      onProgress(1, 5, 'Updating source...', chunk.trim())
    }
    await run('git', ['-C', srcDir, 'fetch', '--depth', '1', 'origin'], cache, log)
    await run('git', ['-C', srcDir, 'reset', '--hard', 'origin/HEAD'], cache)
  } else {
    onProgress(1, 5, 'Cloning repository...', `git clone --depth=1 ${repoUrl}`)
    fs.mkdirSync(cache, { recursive: true })
    const log = (chunk: string) => onProgress(1, 5, 'Cloning repository...', chunk.trim())
    await run('git', ['clone', '--depth=1', repoUrl, srcDir], cache, log)
  }

  const dir = info.source.subdir ? path.join(srcDir, info.source.subdir) : srcDir
  let updated = true
  if (beforeHead) {
    try {
      const afterHead = (await runWithOutput('git', ['-C', srcDir, 'rev-parse', 'HEAD'], cache)).trim()
      updated = afterHead !== beforeHead
    } catch {}
  }
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

  // Use local tsx binary from converter's node_modules (avoids npx download)
  const tsxPath = path.join(converterDir, 'node_modules', '.bin', 'tsx')
  const tsxArgs = [cli, 'convert', inputDir, '-o', build, '--convert-file', convertFile]
  if (fs.existsSync(presetsFile)) tsxArgs.push('--presets-file', presetsFile)

  onProgress(2, 5, 'Converting...', `converter convert ${inputDir} -o ${build}`)
  const log = (chunk: string) => onProgress(2, 5, chunk.trim(), '')
  if (fs.existsSync(tsxPath)) {
    await run(tsxPath, tsxArgs, cacheDir(name), log)
  } else {
    await run('npx', ['tsx', ...tsxArgs], cacheDir(name), log)
  }
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
    // --break-system-packages needed on Linux (PEP 668); check pip version for support
    if (process.platform === 'linux') {
      try {
        const verOut = await runWithOutput(pythonBin, ['-m', 'pip', '--version'], build)
        const m = verOut.match(/^pip\s+(\d+)\.(\d+)/)
        if (m) {
          const pipMajor = parseInt(m[1]), pipMinor = parseInt(m[2])
          if (pipMajor > 21 || (pipMajor === 21 && pipMinor >= 3)) pipArgs.push('--break-system-packages')
        }
      } catch {}
    }
    onProgress(3, 5, 'Installing pip packages...', `${pythonBin} -m pip install ${info.pipPackages.join(' ')}`)
    await run(pythonBin, pipArgs.concat(...info.pipPackages), build, pipLog)
  }

  // Install Go packages via go install (e.g. gopls)
  if (info.goPackages?.length) {
    const serverDir = path.join(build, 'server')
    fs.mkdirSync(serverDir, { recursive: true })
    for (const pkg of info.goPackages) {
      const goLog = (chunk: string) => onProgress(3, 5, chunk.trim(), '')
      const gopath = path.join(build, '.gopath')
      const gocache = path.join(build, '.gocache')
      try {
        onProgress(3, 5, `Installing Go package: ${pkg}`, `go install ${pkg}`)
        await run('go', ['install', pkg], build, goLog, { GOPATH: gopath, GOBIN: serverDir, GOCACHE: gocache })
      } catch (e: any) {
        onProgress(3, 5, `Warning: go install failed (${e.message})`, '')
      } finally {
        await rimraf(gopath).catch(() => {})
        await rimraf(gocache).catch(() => {})
      }
    }
  }

  // Install Cargo packages via cargo install (e.g. nil)
  if (info.cargoPackages?.length) {
    const serverDir = path.join(build, 'server')
    fs.mkdirSync(serverDir, { recursive: true })
    for (const cp of info.cargoPackages) {
      const cargoLog = (chunk: string) => onProgress(3, 5, chunk.trim(), '')
      const crate = typeof cp === 'string' ? cp : cp.crate
      const binName = typeof cp === 'string' ? cp : (cp.binary || cp.crate)
      onProgress(3, 5, `Installing Cargo package: ${crate}`, `cargo install ${crate}`)
      const tmpRoot = path.join(build, '.cargo-root')
      try {
        await run('cargo', ['install', crate, '--root', tmpRoot], build, cargoLog)
        const src = path.join(tmpRoot, 'bin', binName)
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(serverDir, binName))
          fs.chmodSync(path.join(serverDir, binName), 0o755)
        }
      } catch (e: any) {
        onProgress(3, 5, `Warning: cargo install failed (${e.message})`, '')
      } finally {
        await rimraf(tmpRoot).catch(() => {})
      }
    }
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
  const arch = (() => {
    const a = os.arch()
    if (a === 'arm64') return 'arm64'
    if (a === 'x64') return 'x64'
    console.warn(`  unsupported arch "${a}", falling back to x64 — binary download may fail`)
    return 'x64'
  })()
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
        await run('gunzip', ['-f', filename], build)
        fs.renameSync(path.join(build, outName), path.join(serverDir, outName))
      } else {
        // Raw binary: move to server dir, creating subdirs if needed
        const binName = sb.binaryPath || filename
        const destPath = path.join(serverDir, binName)
        fs.mkdirSync(path.dirname(destPath), { recursive: true })
        fs.renameSync(path.join(build, filename), destPath)
      }
      try {
        const chmodRecursive = (d: string) => {
          for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
            const fp = path.join(d, entry.name)
            if (entry.isDirectory()) chmodRecursive(fp)
            else fs.chmodSync(fp, 0o755)
          }
        }
        chmodRecursive(serverDir)
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
      if (sb.binaryPath || filename.match(/\.(zip|tar\.gz|tgz|gz)$/)) {
        const archivePath = path.join(build, filename)
        if (fs.existsSync(archivePath)) await rimraf(archivePath)
      }
    } catch (e: any) {
      onProgress(4, 5, `Warning: serverBinary setup failed (${e.message})`, 'install server binary manually')
    }
  }
}

async function installToCoc(
  name: string,
  onProgress: (step: number, total: number, msg: string, cmd: string) => void,
): Promise<void> {
  const src = buildDir(name)
  const dest = pluginDir(name)

  onProgress(5, 5, 'Installing to coc...', `copy to ${dest} + register in extensions/package.json`)

  await rimraf(dest)
  fs.mkdirSync(dest, { recursive: true })
  // Copy only essential files — skip node_modules/ (huge, causes cp issues with symlinks)
  const essentials = ['lib', 'server', 'package.json', 'esbuild.mjs', 'coc-convert.json']
  for (const item of essentials) {
    const srcPath = path.join(src, item)
    if (fs.existsSync(srcPath)) {
      const destPath = path.join(dest, item)
      if (fs.statSync(srcPath).isDirectory()) {
        await fs.promises.cp(srcPath, destPath, { recursive: true, dereference: true, force: true })
      } else {
        fs.copyFileSync(srcPath, destPath)
      }
    }
  }
  // Re-install npm deps in the plugin directory (needed for plugins with custom deps like pyright)
  onProgress(5, 5, 'Installing dependencies...', `npm install in ${dest}`)
  const npmLog = (chunk: string) => onProgress(5, 5, chunk.trim(), '')
  await run('npm', npmInstallArgs(), dest, npmLog)

  const pkgPath = extensionsPkgPath()
  let pkg: Record<string, any>
  try {
    pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) : { dependencies: {} }
  } catch {
    pkg = { dependencies: {} }
  }
  pkg.dependencies = pkg.dependencies || {}
  const depName = `coc-${name}`
  if (!pkg.dependencies[depName]) {
    pkg.dependencies[depName] = `file:${dest}`
  }
  // Mark as locked so CocUpdate skips it (avoid npm registry 404)
  const lockedArr = pkg.locked || []
  if (!lockedArr.includes(depName)) {
    lockedArr.push(depName)
  }
  pkg.locked = lockedArr
  pkg.lastUpdate = Date.now()
  const tmp = pkgPath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(pkg, null, 2))
  fs.renameSync(tmp, pkgPath)
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
    // chmod before rm to handle Go module cache (dirs are 0555 = unwritable, rm -rf fails)
    try { execSync(`chmod -R u+w ${dir}`, { timeout: 10000 }) } catch {}
    spawn('rm', ['-rf', dir], { stdio: 'ignore' })
      .on('close', code => code === 0 ? resolve() : reject(new Error(`rm -rf exited ${code}`)))
      .on('error', (e) => reject(e))
  })
}

function cpdir(src: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const parent = path.dirname(dest)
    if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true })
    // Use Node.js fs.cp (available since Node 16) — handles symlinks and permissions better than cp -rL
    fs.cp(src, dest, { recursive: true, dereference: true, errorOnExist: false, force: true }, (err) => {
      if (err) reject(new Error(`cpdir failed: ${err.message}`))
      else resolve()
    })
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
    }
    const lockedArr = pkg.locked || []
    const idx = lockedArr.indexOf(depName)
    if (idx !== -1) {
      lockedArr.splice(idx, 1)
      pkg.locked = lockedArr
    }
    pkg.lastUpdate = Date.now()
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))

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
    child.stderr.on('data', (d: Buffer) => { /* discard stderr to avoid corrupting output parsing */ })
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
    const p = fn(item).catch((e: any) => {
      console.warn(`runConcurrent: ${e.message}`)
    }).finally(() => { pool.delete(p) })
    pool.add(p)
    if (pool.size >= concurrency) {
      await Promise.race(pool)
      // Wait a tick to let .finally() microtask drain before checking pool size
      await new Promise(r => setImmediate(r))
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
