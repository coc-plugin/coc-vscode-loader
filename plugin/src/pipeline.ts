import { StateManager } from './state'
import { getPackage, PackageInfo } from './registry'
import { spawn, execSync } from 'child_process'
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
  const cwd = process.cwd()
  const candidates = [
    path.join(base, 'converter', 'src', 'cli.ts'),
    path.join(base, '..', 'converter', 'src', 'cli.ts'),
    path.join(cwd, 'converter', 'src', 'cli.ts'),
    path.join(cwd, '..', 'converter', 'src', 'cli.ts'),
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

async function run(
  cmd: string, args: string[], cwd: string,
  onLine: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: true })
    const lines: string[] = []
    const handler = (data: Buffer) => {
      const text = data.toString()
      lines.push(text)
      onLine(text)
    }
    child.stdout.on('data', handler)
    child.stderr.on('data', handler)
    child.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`))
    })
    child.on('error', reject)
  })
}

async function downloadSource(
  info: PackageInfo, name: string,
  onProgress: (step: number, total: number, msg: string, cmd: string) => void,
): Promise<string> {
  const srcDir = sourceDir(name)
  const cache = cacheDir(name)
  const repoUrl = `https://github.com/${info.source.repo}.git`

  if (fs.existsSync(srcDir)) {
    onProgress(1, 5, 'Updating source...', `git -C ${srcDir} pull`)
    await run('git', ['-C', srcDir, 'pull'], cache, () => {})
  } else {
    onProgress(1, 5, 'Cloning repository...', `git clone --depth=1 ${repoUrl}`)
    fs.mkdirSync(cache, { recursive: true })
    await run('git', ['clone', '--depth=1', repoUrl, srcDir], cache, () => {})
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
  onProgress(2, 5, 'Converting...', `converter convert ${inputDir} -o ${build}`)
  await run('npx', ['tsx', cli, 'convert', inputDir, '-o', build], cacheDir(name), () => {})
}

async function buildPackage(
  name: string,
  onProgress: (step: number, total: number, msg: string, cmd: string) => void,
): Promise<void> {
  const build = buildDir(name)

  onProgress(3, 5, 'Installing dependencies...', 'npm install --legacy-peer-deps')
  await run('npm', ['install', '--legacy-peer-deps'], build, () => {})

  onProgress(4, 5, 'Building...', 'node esbuild.mjs')
  await run('node', ['esbuild.mjs'], build, () => {})
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

function saveMeta(name: string): void {
  const srcDir = sourceDir(name)
  try {
    const log = execSync(`git -C "${srcDir}" log -1 --format="%h|%s|%ar"`, { encoding: 'utf-8' }).toString().trim()
    const [commit, msg, date] = log.split('|')
    fs.writeFileSync(metaPath(name), JSON.stringify({ commit, msg, date, updatedAt: Date.now() }, null, 2))
  } catch {}
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
    await buildPackage(name, prog)
    await installToCoc(name, prog)
    saveMeta(name)
    state.setDirty()
    state.setPackageStatus(name, 'installed')
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
          }
        })
      }
    } catch {}
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
    await buildPackage(name, prog)
    await installToCoc(name, prog)
    saveMeta(name)
    state.setDirty()
    state.setPackageStatus(name, 'installed')
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
          }
        })
      }
    } catch {}
  } catch (e: any) {
    state.setPackageStatus(name, 'failed', { error: e.message })
  }
}

async function runWithOutput(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: true })
    let out = ''
    child.stdout.on('data', (d: Buffer) => { out += d.toString() })
    child.stderr.on('data', (d: Buffer) => { out += d.toString() })
    child.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error(`exit ${code}`)))
    child.on('error', reject)
  })
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
    } catch {}
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
