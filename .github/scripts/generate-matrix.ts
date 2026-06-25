import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(SCRIPT_DIR, '../..')
const REGISTRY_PATH = path.resolve(ROOT, 'coc-vscode-registry/registry.json')
const BASELINE_PATH = path.resolve(ROOT, 'converter/baseline.json')

interface RegistryEntry {
  name: string
  displayName?: string
  source?: { type: string; repo?: string }
  minPluginVersion?: string
}

interface Baseline { [name: string]: { _source?: { repo?: string; commit?: string } } }

function writeMatrix(json: string) {
  // Output to stdout — captured by $(...) in workflow
  process.stdout.write(json + '\n')
}

function main() {
  let registry: RegistryEntry[] = []
  try {
    registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'))
  } catch (e) {
    console.error(`Failed to read registry: ${e}`)
    writeMatrix('{"include":[]}')
    process.exit(0)
  }

  let baseline: Baseline = {}
  try {
    const raw = fs.readFileSync(BASELINE_PATH, 'utf-8')
    baseline = JSON.parse(raw)
    for (const [k, v] of Object.entries(baseline)) {
      if (typeof v !== 'object' || v === null) {
        throw new Error(`Entry "${k}" is not an object`)
      }
    }
  } catch (e) {
    console.error(`baseline.json corrupted: ${e}`)
    console.error('Run `npm run diff:baseline` to regenerate it.')
    writeMatrix('{"include":[]}')
    process.exit(0)
  }

  const baselineKeys = Object.keys(baseline).filter(k => !k.startsWith('_'))
  if (baselineKeys.length === 0) {
    console.error('baseline.json is empty. Run `npm run diff:baseline` first to generate baseline entries.')
    writeMatrix('{"include":[]}')
    process.exit(0)
  }

  const withBaseline: { name: string }[] = []
  const noBaseline: string[] = []
  const noSource: string[] = []
  const repoChanged: string[] = []
  const orphanedBaselines: string[] = []

  const registryNames = new Set(registry.map(e => e.name))

  // A5: Detect baseline entries whose name no longer exists in registry (renamed or removed)
  for (const key of baselineKeys) {
    if (!registryNames.has(key)) {
      orphanedBaselines.push(key)
    }
  }

  for (const entry of registry) {
    if (!entry.source?.repo) {
      noSource.push(entry.name)
      continue
    }

    const be = baseline[entry.name]
    if (!be) {
      noBaseline.push(entry.name)
      continue
    }

    // A4: Detect if source.repo changed since baseline was generated
    const oldRepo = be._source?.repo
    if (oldRepo && oldRepo !== entry.source.repo) {
      repoChanged.push(`${entry.name}: ${oldRepo} → ${entry.source.repo}`)
    }

    withBaseline.push({ name: entry.name })
  }

  writeMatrix(JSON.stringify({ include: withBaseline }))

  if (noBaseline.length > 0)
    console.error(`Skipping ${noBaseline.length} entries without baseline (run npm run diff:baseline first): ${noBaseline.join(', ')}`)
  if (noSource.length > 0)
    console.error(`Skipping ${noSource.length} entries without source.repo: ${noSource.join(', ')}`)
  if (repoChanged.length > 0)
    console.error(`Repo changed for ${repoChanged.length} entries:\n  ${repoChanged.join('\n  ')}`)
  if (orphanedBaselines.length > 0)
    console.error(`Orphaned baseline entries (removed from registry or renamed):\n  ${orphanedBaselines.join('\n  ')}`)
  console.error(`Matrix: ${withBaseline.length} entries to check`)
}

main()
