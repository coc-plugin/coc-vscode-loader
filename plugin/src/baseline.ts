import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { getAllPackages } from './registry'

const SNAPSHOT_PATH = path.join(os.homedir(), '.config', 'coc', 'converter-cache', 'baseline-snapshot.json')
const CHANGED_MARKERS_PATH = path.join(os.homedir(), '.config', 'coc', 'converter-cache', 'changed-markers.json')

export function pluginVersion(): string {
  try {
    return require('../package.json').version
  } catch {
    return '0.0.0'
  }
}

function packagedBaselinePath(): string {
  const base = path.resolve(__dirname, '..')
  const candidates = [
    // Dev mode: converter/ is sibling of plugin/
    path.join(base, '..', 'converter', 'baseline.json'),
    // npm mode: converter/ is bundled inside plugin/
    path.join(base, 'converter', 'baseline.json'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return ''
}

export interface BaselineEntry {
  [file: string]: string
}

interface SnapshotData {
  version: string
  baseline: Record<string, BaselineEntry>
  timestamp: number
}

export interface ChangedFile {
  file: string
  oldHash: string
  newHash: string
}

export interface WhatChangedEntry {
  name: string
  status: 'changed' | 'unchanged' | 'new'
  files: ChangedFile[]
  totalFiles: number
}

export function readPackagedBaseline(): Record<string, BaselineEntry> | null {
  const p = packagedBaselinePath()
  if (!p) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {
    return null
  }
}

export function readSnapshot(): SnapshotData | null {
  try {
    return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'))
  } catch {
    return null
  }
}

export function saveSnapshot(): boolean {
  const baseline = readPackagedBaseline()
  if (!baseline) return false
  const data: SnapshotData = {
    version: pluginVersion(),
    baseline,
    timestamp: Date.now(),
  }
  try {
    fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true })
    const tmp = SNAPSHOT_PATH + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(data))
    fs.renameSync(tmp, SNAPSHOT_PATH)
    return true
  } catch {
    return false
  }
}

export function whatChanged(): {
  oldVersion: string
  newVersion: string
  changed: WhatChangedEntry[]
} {
  const newBaseline = readPackagedBaseline()
  const snapshot = readSnapshot()

  const newVersion = pluginVersion()
  const oldVersion = snapshot?.version || '(none)'

  if (!newBaseline) {
    return { oldVersion, newVersion: oldVersion, changed: [] }
  }

  if (!snapshot) {
    saveSnapshot()
    return { oldVersion, newVersion, changed: [] }
  }

  const allPkgs = getAllPackages()
  const oldBaseline = snapshot.baseline
  const changed: WhatChangedEntry[] = []

  for (const pkg of allPkgs) {
    const name = pkg.name
    const oldEntry = oldBaseline[name]
    const newEntry = newBaseline[name]
    if (!newEntry && !oldEntry) continue

    if (!oldEntry) {
      changed.push({ name, status: 'new', files: [], totalFiles: Object.keys(newEntry || {}).length })
      continue
    }
    if (!newEntry) continue

    const files: ChangedFile[] = []
    const allFiles = new Set([...Object.keys(oldEntry), ...Object.keys(newEntry)])
    for (const file of allFiles) {
      if (file.startsWith('_')) continue
      const oldHash = oldEntry[file]
      const newHash = newEntry[file]
      if (oldHash !== newHash) {
        files.push({ file, oldHash: oldHash || '', newHash: newHash || '' })
      }
    }

    if (files.length > 0 || Object.keys(oldEntry).length !== Object.keys(newEntry).length) {
      changed.push({ name, status: 'changed', files, totalFiles: Object.keys(newEntry).length })
    }
  }

  return { oldVersion, newVersion, changed }
}

export function autoCheck(): WhatChangedEntry[] {
  const snapshot = readSnapshot()
  if (!snapshot) {
    saveSnapshot()
    return []
  }

  // Same version: re-apply persisted changed markers
  if (snapshot.version === pluginVersion()) {
    return readChangedMarkers().map(name => ({
      name, status: 'changed' as const, files: [], totalFiles: 0
    }))
  }

  // Version changed: full comparison
  const result = whatChanged()
  const changed = result.changed.filter(e => e.status === 'changed')
  // Save snapshot first — only write markers if snapshot persisted successfully,
  // to keep markers and snapshot in sync across restarts
  const snapshotSaved = saveSnapshot()
  if (snapshotSaved && changed.length > 0) {
    // Merge with existing markers — don't clear stale markers from previous
    // version comparisons (e.g. pre-release → release with same baseline)
    const existing = readChangedMarkers()
    const merged = [...new Set([...existing, ...changed.map(e => e.name)])]
    writeChangedMarkers(merged)
  }
  return snapshotSaved ? changed : []
}

export function markChecked(): void {
  saveSnapshot()
}

function readChangedMarkers(): string[] {
  try {
    return JSON.parse(fs.readFileSync(CHANGED_MARKERS_PATH, 'utf-8'))
  } catch { return [] }
}

function writeChangedMarkers(names: string[]): void {
  try {
    fs.mkdirSync(path.dirname(CHANGED_MARKERS_PATH), { recursive: true })
    fs.writeFileSync(CHANGED_MARKERS_PATH + '.tmp', JSON.stringify(names))
    fs.renameSync(CHANGED_MARKERS_PATH + '.tmp', CHANGED_MARKERS_PATH)
  } catch {}
}

export function clearChangedMarker(name: string): void {
  const markers = readChangedMarkers()
  if (!markers.includes(name)) return
  writeChangedMarkers(markers.filter(n => n !== name))
}


