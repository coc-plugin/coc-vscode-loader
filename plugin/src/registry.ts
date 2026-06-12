import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

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
  type: 'ts-bridge' | 'pure-lsp' | 'direct-api'
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
  }
  pipPackages?: string[]  // Python packages to install via pip, e.g. ["ansible-lint"]
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
      return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'))
    }
  } catch { /* corrupted cache file */ }
  return null
}

export async function updateRegistry(): Promise<number> {
  // Support local registry via env var (for development)
  const localPath = process.env.COC_REGISTRY_PATH || getLocalRegistryPath()
  if (localPath) {
    if (!fs.existsSync(localPath)) throw new Error(`Local registry not found: ${localPath}`)
    const data: PackageInfo[] = JSON.parse(fs.readFileSync(localPath, 'utf-8'))
    if (!Array.isArray(data)) throw new Error('Invalid registry format')
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true })
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2))
    cached = data
    return data.length
  }

  const res = await fetch(REMOTE_REGISTRY_URL)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data: PackageInfo[] = await res.json()
  if (!Array.isArray(data)) throw new Error('Invalid registry format')
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true })
  fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2))
  cached = data
  return data.length
}

function satisfiesVersion(required: string): boolean {
  const a = pluginVersion().split('.').map(Number)
  const b = required.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const va = a[i] || 0, vb = b[i] || 0
    if (va > vb) return true
    if (va < vb) return false
  }
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
