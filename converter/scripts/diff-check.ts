#!/usr/bin/env node
/**
 * Registry baseline diff tool.
 *
 * Stores output file hashes in coc-vscode-registry/baseline.json (committed to git).
 * CI runs `npm run diff:check` to verify converter changes don't break existing plugins.
 *
 * Usage:
 *   npm run diff:baseline       # Generate and update baseline.json
 *   npm run diff:check          # Compare current output against baseline (exit 1 if changed)
 *   npm run diff:check --verbose  # Show per-file details
 */
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'
import { execFileSync } from 'child_process'
import { convert } from '../src/convert.js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REGISTRY_PATH = path.resolve(__dirname, '../../coc-vscode-registry/registry.json')
const BASELINE_PATH = path.resolve(__dirname, '../../coc-vscode-registry/baseline.json')
const PRESETS_PATH = path.resolve(__dirname, '../../coc-vscode-registry/presets.json')
const CACHE_DIR = path.join(os.homedir(), '.cache', 'coc-converter-smoke')
const TEST_OUTPUT = path.join(os.tmpdir(), 'coc-diff-output')
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '6', 10)
const VERBOSE = process.argv.includes('--verbose')

interface RegistryEntry {
  name: string; displayName: string; type: string
  source: { type: string; repo?: string; package?: string; subdir?: string }
  convert: any[]
}

/** Baseline format: { entryName: { fileRelPath: "sha256hex" } } */
type Baseline = Record<string, Record<string, string>>

function cacheDir(e: RegistryEntry): string {
  return path.join(CACHE_DIR, e.name.replace(/[^a-z0-9_-]/gi, '_'))
}

async function processEntry(entry: RegistryEntry, presets: any): Promise<{ name: string; error?: string; hashes?: Record<string, string> }> {
  const cachePath = cacheDir(entry)
  let inputDir: string | null = null

  if (fs.existsSync(cachePath) && fs.existsSync(path.join(cachePath, '.git'))) {
    inputDir = cachePath
    if (entry.source.subdir) inputDir = path.join(cachePath, entry.source.subdir)
  } else if (entry.source.type === 'github' && entry.source.repo) {
    try {
      fs.mkdirSync(cachePath, { recursive: true })
      const url = `https://github.com/${entry.source.repo}.git`
      execFileSync('git', ['clone', '--depth', '1', '--single-branch', url, cachePath], { stdio: 'pipe', timeout: 300000 })
      inputDir = entry.source.subdir ? path.join(cachePath, entry.source.subdir) : cachePath
    } catch (e: any) {
      return { name: entry.name, error: `source download: ${e.message}` }
    }
  } else if (entry.source.type === 'npm' && entry.source.package) {
    try {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-'))
      execFileSync('npm', ['pack', entry.source.package], { cwd: tmp, stdio: 'pipe', timeout: 60000 })
      const tarball = fs.readdirSync(tmp).find(f => f.endsWith('.tgz'))
      if (!tarball) throw new Error('npm pack produced no tarball')
      fs.mkdirSync(cachePath, { recursive: true })
      execFileSync('tar', ['xzf', path.join(tmp, tarball)], { cwd: cachePath, stdio: 'pipe' })
      if (fs.existsSync(path.join(cachePath, 'package'))) {
        for (const f of fs.readdirSync(path.join(cachePath, 'package')))
          fs.cpSync(path.join(cachePath, 'package', f), path.join(cachePath, f), { recursive: true })
        fs.rmSync(path.join(cachePath, 'package'), { recursive: true, force: true })
      }
      fs.rmSync(tmp, { recursive: true, force: true })
      inputDir = cachePath
    } catch (e: any) {
      return { name: entry.name, error: `source download: ${e.message}` }
    }
  }

  if (!inputDir || !fs.existsSync(inputDir)) {
    return { name: entry.name, error: 'source not available' }
  }

  const outputDir = path.join(TEST_OUTPUT, entry.name)
  fs.mkdirSync(outputDir, { recursive: true })

  try {
    await convert({ input: inputDir, output: outputDir, convert: entry.convert, presets })
  } catch (e: any) {
    return { name: entry.name, error: `convert: ${(e as Error).message}` }
  }

  // Hash key output files
  const hashes: Record<string, string> = {}
  const isSnippets = entry.convert.some(s => s.type === 'snippets')
  function collect(dir: string, prefix: string) {
    if (!fs.existsSync(dir)) return
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      const rel = prefix ? `${prefix}/${e.name}` : e.name
      if (e.isDirectory()) {
        if (e.name !== 'node_modules' && e.name !== '.git') collect(full, rel)
      } else if (isSnippets ? e.name === 'package.json' || e.name.endsWith('.json') : e.name.endsWith('.ts') || e.name === 'package.json' || e.name === 'esbuild.mjs') {
        try {
          const content = fs.readFileSync(full, 'utf-8')
          hashes[rel] = crypto.createHash('sha256').update(content).digest('hex')
        } catch {}
      }
    }
  }
  collect(outputDir, '')

  return { name: entry.name, hashes }
}

async function processAll(registry: RegistryEntry[], presets: any, label: string): Promise<Baseline> {
  if (fs.existsSync(TEST_OUTPUT)) fs.rmSync(TEST_OUTPUT, { recursive: true, force: true })

  const baseline: Baseline = {}
  let completed = 0
  let failed = 0
  const startTime = Date.now()
  const total = registry.length
  const pool = new Set<Promise<void>>()

  for (const entry of registry) {
    const p = (async () => {
      const result = await processEntry(entry, presets)
      completed++
      process.stdout.write(`\r  [${((completed/total)*100).toFixed(0)}%] ${completed}/${total}  ${label}`)

      if (result.error) {
        failed++
        baseline[entry.name] = { _error: result.error }
      } else if (result.hashes) {
        baseline[entry.name] = result.hashes
      }
    })()
    pool.add(p)
    p.finally(() => pool.delete(p))
    if (pool.size >= CONCURRENCY) await Promise.race(pool)
  }
  await Promise.allSettled(pool)
  console.log('')

  if (fs.existsSync(TEST_OUTPUT)) fs.rmSync(TEST_OUTPUT, { recursive: true, force: true })

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
  console.log(`\n  ${completed} done in ${elapsed}s — ${total - failed} ok, ${failed} failed`)
  return baseline
}

async function baseline() {
  const registry: RegistryEntry[] = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'))
  const presets = fs.existsSync(PRESETS_PATH) ? JSON.parse(fs.readFileSync(PRESETS_PATH, 'utf-8')) : undefined
  console.log(`Generating baseline for ${registry.length} entries...\n`)

  const baselineData = await processAll(registry, presets, 'baseline')

  // Write baseline.json
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baselineData, null, 2))
  console.log(`\nBaseline written to ${path.relative(path.resolve(__dirname, '../..'), BASELINE_PATH)}`)
  console.log(`  ${Object.keys(baselineData).length} entries, ${Object.values(baselineData).reduce((s, e) => s + Object.keys(e).length, 0)} files`)
}

async function check() {
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error('No baseline.json found. Run `npm run diff:baseline` first.')
    process.exit(1)
  }

  const baseline: Baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8'))
  const registry: RegistryEntry[] = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'))
  const presets = fs.existsSync(PRESETS_PATH) ? JSON.parse(fs.readFileSync(PRESETS_PATH, 'utf-8')) : undefined

  // Filter to entries that exist in baseline (skip new entries not yet baselined)
  const knownEntries = registry.filter(e => baseline[e.name] !== undefined)
  const newEntries = registry.filter(e => baseline[e.name] === undefined)
  if (newEntries.length > 0) {
    console.log(`  ${newEntries.length} new entries not in baseline (run diff:baseline to add)`)
  }

  console.log(`Checking ${knownEntries.length} entries against baseline...\n`)
  const current = await processAll(knownEntries, presets, 'check')

  // Diff
  let changed = 0
  let failed = 0
  let unchanged = 0
  const changes: Array<{ name: string; files: Array<{ rel: string; status: 'changed' | 'new' | 'missing' | 'error' }>; error?: string }> = []

  for (const name of Object.keys(current)) {
    const curFiles = current[name]
    const baseFiles = baseline[name]

    if (curFiles._error) {
      failed++
      changes.push({ name, files: [], error: curFiles._error })
      continue
    }

    const fileChanges: Array<{ rel: string; status: 'changed' | 'new' | 'missing' | 'error' }> = []
    const allRels = new Set([...Object.keys(curFiles), ...Object.keys(baseFiles)])

    for (const rel of allRels) {
      if (rel === '_error') continue
      if (curFiles[rel] && !baseFiles[rel]) {
        fileChanges.push({ rel, status: 'new' })
      } else if (!curFiles[rel] && baseFiles[rel]) {
        fileChanges.push({ rel, status: 'missing' })
      } else if (curFiles[rel] !== baseFiles[rel]) {
        fileChanges.push({ rel, status: 'changed' })
      }
    }

    if (fileChanges.length > 0) {
      changed++
      changes.push({ name, files: fileChanges })
    } else {
      unchanged++
    }
  }

  // Report
  console.log(`\nResults:`)
  console.log(`  ${unchanged} unchanged`)
  console.log(`  ${changed} changed`)
  console.log(`  ${failed} failed\n`)

  if (changes.length > 0) {
    for (const c of changes) {
      if (c.error) {
        console.log(`  ✗ ${c.name} — ${c.error}`)
      } else {
        const icons = c.files.map(f =>
          f.status === 'changed' ? '~' : f.status === 'new' ? '+' : f.status === 'missing' ? '-' : '?'
        ).join('')
        console.log(`  ${icons} ${c.name}`)
        if (VERBOSE) {
          for (const f of c.files) {
            const icon = f.status === 'changed' ? '~' : f.status === 'new' ? '+' : '-'
            console.log(`      ${icon} ${f.rel}`)
          }
        }
      }
    }
    console.log('')
    console.log('⚠  Converter changes affect existing plugin output!')
    console.log('   Review the changes above.')
    console.log('   If intentional, update baseline: npm run diff:baseline')
    console.log('')
    process.exit(1)
  }

  console.log('✓ All entries match baseline — no unintended side effects.\n')
}

async function main() {
  const cmd = process.argv[2]
  if (!cmd || cmd === 'check' || cmd === '--check') {
    await check()
  } else if (cmd === 'baseline' || cmd === '--baseline') {
    await baseline()
  } else {
    console.error('Usage: tsx diff-check.ts [baseline|check]')
    process.exit(1)
  }
}

main().catch(e => { console.error('\nFatal:', e); process.exit(1) })
