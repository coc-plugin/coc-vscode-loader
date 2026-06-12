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
  serverBinary?: {
    repo: string
    asset: string       // "name-{{version}}-{{platform}}-{{arch}}.tar.gz"
    binaryPath?: string // relative path inside tarball, e.g. "bin/lua-language-server"
  }
}

const REMOTE_REGISTRY_URL = 'https://raw.githubusercontent.com/coc-plugin/coc-vscode-registry/main/registry.json'
const CACHE_PATH = path.join(os.homedir(), '.config', 'coc', 'converter-cache', 'registry.json')

let cached: PackageInfo[] | null = null

function loadCache(): PackageInfo[] | null {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'))
    }
  } catch { /* corrupted cache file */ }
  return null
}

export async function updateRegistry(): Promise<number> {
  const res = await fetch(REMOTE_REGISTRY_URL)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data: PackageInfo[] = await res.json()
  if (!Array.isArray(data)) throw new Error('Invalid registry format')
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true })
  fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2))
  cached = data
  return data.length
}

export function getAllPackages(): PackageInfo[] {
  if (cached) return cached
  cached = loadCache()
  return cached || []
}

export function getPackage(name: string): PackageInfo | undefined {
  return getAllPackages().find(p => p.name === name)
}
