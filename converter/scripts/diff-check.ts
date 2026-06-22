#!/usr/bin/env node
/**
 * Registry golden diff tool.
 *
 * Usage:
 *   npm run diff:baseline       # Store golden output for all entries
 *   npm run diff:check          # Compare current output against baseline
 *   npm run diff:check --verbose  # Full diff output
 *
 * Stores baseline in ~/.cache/coc-converter-diff/baseline/
 * Uses cached repos from ~/.cache/coc-converter-smoke/ if available.
 */
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { execFileSync } from 'child_process'
import { convert } from '../src/convert.js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REGISTRY_PATH = path.resolve(__dirname, '../../coc-vscode-registry/registry.json')
const PRESETS_PATH = path.resolve(__dirname, '../../coc-vscode-registry/presets.json')
const CONVERTER_ROOT = path.resolve(__dirname, '..')
const CACHE_DIR = path.join(os.homedir(), '.cache', 'coc-converter-smoke')
const DIFF_DIR = path.join(os.homedir(), '.cache', 'coc-converter-diff')
const BASELINE_DIR = path.join(DIFF_DIR, 'baseline')
const TEST_OUTPUT = path.join(os.tmpdir(), 'coc-diff-output')
const VERBOSE = process.argv.includes('--verbose')

interface RegistryEntry {
  name: string; displayName: string; type: string
  source: { type: string; repo?: string; package?: string; subdir?: string }
  convert: any[]
}

function cacheDir(e: RegistryEntry): string {
  return path.join(CACHE_DIR, e.name.replace(/[^a-z0-9_-]/gi, '_'))
}

function symlinkOrCopy(src: string, dest: string) {
  try { fs.rmSync(dest, { recursive: true, force: true }) } catch {}
  try { fs.symlinkSync(src, dest, 'dir') } catch {
    fs.cpSync(src, dest, { recursive: true })
  }
}

async function processEntry(entry: RegistryEntry, presets: any): Promise<{ name: string; error?: string; files?: Record<string, string> }> {
  // Use cached source if available
  const cachePath = cacheDir(entry)
  let inputDir: string | null = null

  if (fs.existsSync(cachePath) && fs.existsSync(path.join(cachePath, '.git'))) {
    inputDir = cachePath
    const src = entry.source
    if (src.subdir) inputDir = path.join(cachePath, src.subdir)
  } else if (entry.source.type === 'github' && entry.source.repo) {
    // Download fresh
    try {
      const dest = cachePath
      fs.mkdirSync(dest, { recursive: true })
      const url = `https://github.com/${entry.source.repo}.git`
      execFileSync('git', ['clone', '--depth', '1', '--single-branch', url, dest], { stdio: 'pipe', timeout: 300000 })
      inputDir = entry.source.subdir ? path.join(dest, entry.source.subdir) : dest
    } catch (e: any) {
      return { name: entry.name, error: `download: ${e.message}` }
    }
  } else if (entry.source.type === 'npm' && entry.source.package) {
    // npm packages
    try {
      const dest = cachePath
      fs.mkdirSync(dest, { recursive: true })
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-'))
      execFileSync('npm', ['pack', entry.source.package], { cwd: tmp, stdio: 'pipe', timeout: 60000 })
      const tarball = fs.readdirSync(tmp).find(f => f.endsWith('.tgz'))
      if (!tarball) throw new Error('npm pack produced no tarball')
      execFileSync('tar', ['xzf', path.join(tmp, tarball)], { cwd: dest, stdio: 'pipe' })
      if (fs.existsSync(path.join(dest, 'package'))) {
        for (const f of fs.readdirSync(path.join(dest, 'package')))
          fs.cpSync(path.join(dest, 'package', f), path.join(dest, f), { recursive: true })
        fs.rmSync(path.join(dest, 'package'), { recursive: true, force: true })
      }
      fs.rmSync(tmp, { recursive: true, force: true })
      inputDir = dest
    } catch (e: any) {
      return { name: entry.name, error: `download: ${e.message}` }
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
    return { name: entry.name, error: `convert: ${e.message}` }
  }

  // Collect key output files
  const files: Record<string, string> = {}
  const relDir = outputDir
  function collect(dir: string, prefix: string) {
    if (!fs.existsSync(dir)) return
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      const rel = prefix ? `${prefix}/${e.name}` : e.name
      if (e.isDirectory()) {
        if (e.name !== 'node_modules') collect(full, rel)
      } else if (e.name.endsWith('.ts') || e.name.endsWith('.js') || e.name === 'package.json' || e.name === 'esbuild.mjs') {
        try {
          files[rel] = fs.readFileSync(full, 'utf-8')
        } catch {}
      }
    }
  }
  collect(relDir, '')

  return { name: entry.name, files }
}

async function baseline() {
  const registry: RegistryEntry[] = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'))
  const presets = fs.existsSync(PRESETS_PATH) ? JSON.parse(fs.readFileSync(PRESETS_PATH, 'utf-8')) : undefined
  console.log(`Baseline: ${registry.length} entries\n`)

  if (fs.existsSync(TEST_OUTPUT)) fs.rmSync(TEST_OUTPUT, { recursive: true, force: true })
  if (fs.existsSync(BASELINE_DIR)) fs.rmSync(BASELINE_DIR, { recursive: true, force: true })
  fs.mkdirSync(BASELINE_DIR, { recursive: true })

  let completed = 0
  let failed = 0
  const startTime = Date.now()

  const CONCURRENCY = parseInt(process.env.CONCURRENCY || '6', 10)
  const pool = new Set<Promise<void>>()

  for (const entry of registry) {
    const p = (async () => {
      const result = await processEntry(entry, presets)
      if (result.error) {
        failed++
        console.log(`  FAIL  ${entry.name}: ${result.error}`)
      } else {
        // Save to baseline
        const entryDir = path.join(BASELINE_DIR, entry.name)
        fs.mkdirSync(entryDir, { recursive: true })
        for (const [rel, content] of Object.entries(result.files!)) {
          const fp = path.join(entryDir, rel)
          fs.mkdirSync(path.dirname(fp), { recursive: true })
          fs.writeFileSync(fp, content)
        }
      }
      completed++
      process.stdout.write(`\r  [${((completed/registry.length)*100).toFixed(0)}%] ${completed}/${registry.length}`)
    })()
    pool.add(p)
    p.finally(() => pool.delete(p))
    if (pool.size >= CONCURRENCY) await Promise.race(pool)
  }
  await Promise.allSettled(pool)
  console.log('')

  if (fs.existsSync(TEST_OUTPUT)) fs.rmSync(TEST_OUTPUT, { recursive: true, force: true })

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
  console.log(`\nDone in ${elapsed}s — ${completed - failed} saved, ${failed} failed`)
}

async function check() {
  if (!fs.existsSync(BASELINE_DIR)) {
    console.error('No baseline found. Run `npm run diff:baseline` first.')
    process.exit(1)
  }

  const registry: RegistryEntry[] = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'))
  const presets = fs.existsSync(PRESETS_PATH) ? JSON.parse(fs.readFileSync(PRESETS_PATH, 'utf-8')) : undefined
  console.log(`Diff check: ${registry.length} entries\n`)

  if (fs.existsSync(TEST_OUTPUT)) fs.rmSync(TEST_OUTPUT, { recursive: true, force: true })

  let completed = 0
  let changed = 0
  let failed = 0
  let unchanged = 0
  const changes: Array<{ name: string; diffs: string[] }> = []
  const startTime = Date.now()

  const CONCURRENCY = parseInt(process.env.CONCURRENCY || '6', 10)
  const pool = new Set<Promise<void>>()

  for (const entry of registry) {
    const p = (async () => {
      const baselineDir = path.join(BASELINE_DIR, entry.name)
      const hasBaseline = fs.existsSync(baselineDir)
      const result = await processEntry(entry, presets)
      completed++
      process.stdout.write(`\r  [${((completed/registry.length)*100).toFixed(0)}%] ${completed}/${registry.length}`)

      if (result.error) {
        failed++
        changes.push({ name: entry.name, diffs: [result.error] })
        return
      }
      if (!hasBaseline) {
        changed++
        changes.push({ name: entry.name, diffs: ['NEW (no baseline)'] })
        return
      }

      // Diff against baseline
      const fileDiffs: string[] = []
      for (const [rel, currentContent] of Object.entries(result.files!)) {
        const baselineFile = path.join(baselineDir, rel)
        if (!fs.existsSync(baselineFile)) {
          fileDiffs.push(`+ ${rel} (new file)`)
          continue
        }
        const baselineContent = fs.readFileSync(baselineFile, 'utf-8')
        if (currentContent !== baselineContent) {
          fileDiffs.push(`~ ${rel} (content changed)`)
        }
      }

      if (fileDiffs.length > 0) {
        changed++
        changes.push({ name: entry.name, diffs: fileDiffs })
      } else {
        unchanged++
      }
    })()
    pool.add(p)
    p.finally(() => pool.delete(p))
    if (pool.size >= CONCURRENCY) await Promise.race(pool)
  }
  await Promise.allSettled(pool)
  console.log('')

  if (fs.existsSync(TEST_OUTPUT)) fs.rmSync(TEST_OUTPUT, { recursive: true, force: true })

  // Report
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
  console.log(`\n${completed} done in ${elapsed}s`)
  console.log(`  ${unchanged} unchanged`)
  console.log(`  ${changed} changed`)
  console.log(`  ${failed} failed\n`)

  if (changes.length > 0) {
    // Sort: failed first, then new, then changed
    changes.sort((a, b) => {
      const aScore = a.diffs[0]?.startsWith('download') ? 0 : a.diffs[0] === 'NEW (no baseline)' ? 1 : a.diffs.some(d => d.startsWith('~') || d.startsWith('+')) ? 2 : 3
      const bScore = b.diffs[0]?.startsWith('download') ? 0 : b.diffs[0] === 'NEW (no baseline)' ? 1 : b.diffs.some(d => d.startsWith('~') || d.startsWith('+')) ? 2 : 3
      return aScore - bScore
    })

    for (const c of changes) {
      const icon = c.diffs[0]?.startsWith('download') ? '⚠' : c.diffs[0] === 'NEW (no baseline)' ? '➕' : c.diffs.some(d => d.startsWith('~') || d.startsWith('+')) ? '✎' : '✗'
      console.log(`  ${icon} ${c.name}`)
      for (const d of c.diffs.slice(0, 5)) {
        console.log(`      ${d}`)
      }
      if (c.diffs.length > 5) console.log(`      ... and ${c.diffs.length - 5} more`)
    }
    console.log('')
  }

  if (changed > 0 || failed > 0) {
    console.log('⚠  Changes detected — review before committing.\n')
    console.log('  To update baseline:')
    console.log('    npm run diff:baseline')
    if (VERBOSE) {
      for (const c of changes.filter(x => x.diffs.some(d => d.startsWith('~')))) {
        const baselineFiles = Object.fromEntries(
          fs.readdirSync(path.join(BASELINE_DIR, c.name), { recursive: true })
            .filter((f): f is string => typeof f === 'string')
            .map(f => [f.replace(/\\/g, '/'), ''])
        )
        for (const d of c.diffs) {
          if (d.startsWith('~ ')) {
            const fileRel = d.slice(2)
            // Show actual diff
            const currentPath = path.join(TEST_OUTPUT, c.name, fileRel)
            // Already cleaned up, skip
          }
        }
      }
    }
  } else {
    console.log('✓ No changes detected.')
  }
}

async function main() {
  const cmd = process.argv[2]
  if (cmd === 'baseline' || cmd === '--baseline') {
    await baseline()
  } else if (cmd === 'check' || cmd === '--check' || !cmd) {
    await check()
  } else {
    console.error('Usage:')
    console.error('  npm run diff:baseline    — store baseline')
    console.error('  npm run diff:check       — compare against baseline')
    process.exit(1)
  }
}

main().catch(e => { console.error('\nFatal:', e); process.exit(1) })
