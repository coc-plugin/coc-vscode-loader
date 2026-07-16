import * as path from 'path'
import * as os from 'os'

function cocConfigDir(): string {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'coc')
  }
  return path.join(os.homedir(), '.config', 'coc')
}

const COC_CONFIG = cocConfigDir()
const EXTENSIONS_DIR = path.join(COC_CONFIG, 'extensions')
export const CACHE_ROOT = path.join(COC_CONFIG, 'converter-cache')

export const EXTENSIONS_NM_DIR = path.join(EXTENSIONS_DIR, 'node_modules')

export function cacheDir(name: string): string {
  return path.join(CACHE_ROOT, name)
}

export function sourceDir(name: string): string {
  return path.join(cacheDir(name), 'source')
}

export function buildDir(name: string): string {
  return path.join(cacheDir(name), 'build')
}

export function pluginDir(name: string): string {
  return path.join(EXTENSIONS_NM_DIR, `coc-${name}`)
}

export function extensionsPkgPath(): string {
  return path.join(EXTENSIONS_DIR, 'package.json')
}

export function metaPath(name: string): string {
  return path.join(cacheDir(name), 'meta.json')
}

export const SNAPSHOT_PATH = path.join(CACHE_ROOT, 'baseline-snapshot.json')
export const CHANGED_MARKERS_PATH = path.join(CACHE_ROOT, 'changed-markers.json')
export const REGISTRY_CACHE_PATH = path.join(CACHE_ROOT, 'registry.json')
