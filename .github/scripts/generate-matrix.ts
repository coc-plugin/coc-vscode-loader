import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(SCRIPT_DIR, '../..')
const REGISTRY_PATH = path.resolve(ROOT, 'coc-vscode-registry/registry.json')
const BASELINE_PATH = path.resolve(ROOT, 'converter/baseline.json')

interface RegistryEntry {
  name: string
  source?: { type: string; repo?: string }
}

interface Baseline { [name: string]: { _source?: { repo?: string; commit?: string } } }

function main() {
  let registry: RegistryEntry[] = []
  try {
    registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'))
  } catch (e) {
    console.error(`Failed to read registry: ${e}`)
    process.exit(1)
  }

  let baseline: Baseline = {}
  try {
    baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8'))
  } catch (e) {
    console.error(`Failed to read baseline: ${e}`)
    process.exit(1)
  }

  const withBaseline: { name: string }[] = []
  const noBaseline: string[] = []
  const noSource: string[] = []

  for (const entry of registry) {
    if (!entry.source?.repo) {
      noSource.push(entry.name)
      continue
    }
    if (baseline[entry.name]) {
      withBaseline.push({ name: entry.name })
    } else {
      noBaseline.push(entry.name)
    }
  }

  // Output matrix as JSON to stdout — captured by workflow as step output
  const matrix = JSON.stringify({ include: withBaseline })
  process.stdout.write(matrix)

  // Log info to stderr — visible in workflow logs, not captured as output
  if (noBaseline.length > 0) {
    console.error(`Skipping ${noBaseline.length} entries without baseline (run npm run diff:baseline first): ${noBaseline.join(', ')}`)
  }
  if (noSource.length > 0) {
    console.error(`Skipping ${noSource.length} entries without source.repo: ${noSource.join(', ')}`)
  }
  console.error(`Matrix: ${withBaseline.length} entries to check`)
}

main()
