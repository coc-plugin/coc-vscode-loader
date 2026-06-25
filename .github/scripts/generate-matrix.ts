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

function main() {
  let registry: RegistryEntry[] = []
  try {
    registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'))
  } catch (e) {
    console.error(`Failed to read registry: ${e}`)
    process.stdout.write('{"include":[]}')
    process.exit(0)
  }

  let baseline: Baseline = {}
  try {
    const raw = fs.readFileSync(BASELINE_PATH, 'utf-8')
    baseline = JSON.parse(raw)
    // Validate structure — each entry should be an object
    for (const [k, v] of Object.entries(baseline)) {
      if (typeof v !== 'object' || v === null) {
        throw new Error(`Entry "${k}" is not an object`)
      }
    }
  } catch (e) {
    console.error(`baseline.json corrupted: ${e}`)
    console.error('Run `npm run diff:baseline` to regenerate it.')
    process.stdout.write('{"include":[]}')
    process.exit(0)
  }

  const baselineKeys = Object.keys(baseline).filter(k => !k.startsWith('_'))
  if (baselineKeys.length === 0) {
    console.error('baseline.json is empty. Run `npm run diff:baseline` first to generate baseline entries.')
    process.stdout.write('{"include":[]}')
    process.exit(0)
  }

  const withBaseline: { name: string }[] = []
  const noBaseline: string[] = []
  const noSource: string[] = []
  const repoChanged: string[] = []

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

  const matrix = JSON.stringify({ include: withBaseline })
  process.stdout.write(matrix)

  if (noBaseline.length > 0)
    console.error(`Skipping ${noBaseline.length} entries without baseline (run npm run diff:baseline first): ${noBaseline.join(', ')}`)
  if (noSource.length > 0)
    console.error(`Skipping ${noSource.length} entries without source.repo: ${noSource.join(', ')}`)
  if (repoChanged.length > 0)
    console.error(`Repo changed for ${repoChanged.length} entries:\n  ${repoChanged.join('\n  ')}`)
  console.error(`Matrix: ${withBaseline.length} entries to check`)
}

main()
