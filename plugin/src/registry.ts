import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { execFile } from 'child_process'

export interface RegistrySource {
  type: 'github' | 'npm'
  repo?: string
  package?: string
  subdir?: string
}

export interface PackageInfo {
  name: string
  displayName: string
  description: string
  type: 'ts-bridge' | 'pure-lsp' | 'direct-api' | 'snippets'
  source: RegistrySource
  url: string
  languages: string[]
  categories: string[]
  minPluginVersion?: string // minimum coc-vscode-loader version required, e.g. "1.2.0"
  serverBinary?: {
    repo: string
    asset: string       // "name-{{version}}-{{platform}}-{{arch}}.tar.gz"
    binaryPath?: string // relative path inside tarball, e.g. "bin/lua-language-server"
    args?: string[]     // CLI args to start the LSP, e.g. ["lsp"] for deno
    targetAssets?: Array<{
      platform?: string // "darwin" | "linux" | "win32" (default: any)
      arch?: string     // "x64" | "arm64" (default: any)
      file: string      // asset filename template
      binaryPath?: string
    }>
  }
  pipPackages?: string[]  // Python packages to install via pip, e.g. ["ansible-lint"]
  goPackages?: string[]   // Go packages to install via go install, e.g. ["golang.org/x/tools/gopls@latest"]
  cargoPackages?: Array<{ crate: string; binary?: string } | string>  // Rust crates to install via cargo install, e.g. [{crate: "nil", binary: "nil"}]
  /** v2.0 config-driven conversion steps */
  convert?: any[]          // Array of ConvertStep, passed as --convert JSON to CLI
  /** User-visible installation notes/hints displayed in TUI detail popup */
  notes?: string
}

function pluginVersion(): string {
  try {
    return require('../package.json').version
  } catch {
    return '0.0.0'
  }
}

const REMOTE_REGISTRY_URL = 'https://raw.githubusercontent.com/coc-plugin/coc-vscode-registry/main/registry.json'
const CACHE_PATH = path.join(os.homedir(), '.config', 'coc', 'converter-cache', 'registry.json')

let cached: PackageInfo[] | null = null
let registryFetching: Promise<number> | null = null

// Detect if running in local dev mode by checking for coc-vscode-registry/ sibling
function getLocalRegistryPath(): string | null {
  try {
    const pluginDir = path.dirname(fs.realpathSync(__dirname))
    const local = path.join(pluginDir, '..', 'coc-vscode-registry', 'registry.json')
    if (fs.existsSync(local)) return local
  } catch { /* not in local dev mode */ }
  return null
}

function loadCache(): PackageInfo[] | null {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const data = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'))
      if (Array.isArray(data)) return data
    }
  } catch { /* corrupted cache file */ }
  return null
}

export type ProgressCallback = (msg: string) => void

/** Fetch JSON from URL, falling back to curl when Node.js fetch can't handle proxy env vars */
async function fetchRegistryJSON(url: string, onProgress?: ProgressCallback): Promise<PackageInfo[]> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 10000)
    let res: Response
    try {
      res = await fetch(url, { signal: ctrl.signal })
    } finally {
      clearTimeout(t)
    }
    if (res.ok) {
      const total = parseInt(res.headers.get('content-length') || '0')
      if (!res.body) throw new Error('Response has no body')
      const reader = res.body.getReader()
      const chunks: Uint8Array[] = []
      let received = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          chunks.push(value)
          received += value.length
          if (total && onProgress) {
            onProgress(`Downloading registry... ${Math.round((received / total) * 100)}%`)
          }
        }
      }
      if (onProgress) onProgress('Parsing registry entries...')
      const buf = new Uint8Array(received)
      let pos = 0
      for (const c of chunks) { buf.set(c, pos); pos += c.length }
      const text = new TextDecoder().decode(buf)
      const data: PackageInfo[] = JSON.parse(text)
      if (Array.isArray(data)) return data
    }
  } catch { /* fall through to curl */ }
  // curl respects lowercase http_proxy env vars that Node.js fetch ignores
  return new Promise((resolve, reject) => {
    if (onProgress) onProgress('Downloading registry (curl)...')
    execFile('curl', ['-sL', '--compressed', url], { encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(new Error(`curl failed: ${err.message}`))
      else {
        if (onProgress) onProgress('Parsing registry entries...')
        try {
          const data = JSON.parse(stdout)
          if (!Array.isArray(data)) reject(new Error('Invalid registry format'))
          else resolve(data)
        } catch (e: any) {
          reject(new Error(`Invalid JSON from registry: ${e.message}`))
        }
      }
    })
  })
}

export async function updateRegistry(onProgress?: ProgressCallback): Promise<number> {
  // Local dev mode: read from local coc-vscode-registry/registry.json
  const localPath = process.env.COC_REGISTRY_PATH || getLocalRegistryPath()
  if (localPath) {
    if (!fs.existsSync(localPath)) throw new Error(`Local registry not found: ${localPath}`)
    if (onProgress) onProgress('Reading local registry...')
    const data: PackageInfo[] = JSON.parse(fs.readFileSync(localPath, 'utf-8'))
    if (!Array.isArray(data)) throw new Error('Invalid registry format')
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true })
    const tmp = CACHE_PATH + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
    fs.renameSync(tmp, CACHE_PATH)
    cached = data
    return data.length
  }

  // npm mode: fetch from remote (with curl fallback for proxy compatibility)
  if (registryFetching) return registryFetching
  registryFetching = (async () => {
    const data: PackageInfo[] = await fetchRegistryJSON(REMOTE_REGISTRY_URL, onProgress)
    if (!Array.isArray(data)) throw new Error('Invalid registry format')
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true })
    // Atomic write via temp + rename to avoid corruption on crash
    const tmp = CACHE_PATH + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
    fs.renameSync(tmp, CACHE_PATH)
    cached = data
    if (onProgress) onProgress(`Registry updated: ${data.length} packages`)
    return data.length
  })()
  try { return await registryFetching } finally { registryFetching = null }
}

function satisfiesVersion(required: string): boolean {
  const fullVersion = pluginVersion()
  // Pre-release versions: strip suffix, compare base. If equal, pre-release < release
  const baseVersion = fullVersion.replace(/-.*$/, '')
  const requiredBase = required.replace(/-.*$/, '')
  const a = baseVersion.split('.').map(Number)
  const b = requiredBase.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const va = a[i], vb = b[i]
    if (va === undefined || vb === undefined) break
    if (isNaN(va) || isNaN(vb)) return false
    if (va > vb) return true
    if (va < vb) return false
  }
  // Both have same base version — check pre-release status
  // If both are pre-release with same base, it's OK (they match)
  // If current is pre-release but required is release, current < required
  const currentPre = fullVersion.includes('-')
  const requiredPre = required.includes('-')
  if (currentPre && !requiredPre) return false
  return true
}

export function getAllPackages(): PackageInfo[] {
  if (!cached) {
    cached = loadCache() || []
  }
  return cached.filter(p => !p.minPluginVersion || satisfiesVersion(p.minPluginVersion))
}

export function getPackage(name: string): PackageInfo | undefined {
  return getAllPackages().find(p => p.name === name)
}

export function findPackage(query: string): PackageInfo | undefined {
  const all = getAllPackages()
  // 1. Exact match on name
  const exact = all.find(p => p.name === query)
  if (exact) return exact

  // 2. Case-insensitive match on displayName
  const ql = query.toLowerCase()
  const byDisplay = all.find(p => p.displayName.toLowerCase() === ql)
  if (byDisplay) return byDisplay

  // 3. Auto-prepend vscode- then match name
  const prefixed = `vscode-${query.replace(/^vscode-/, '')}`
  return all.find(p => p.name === prefixed)
}
