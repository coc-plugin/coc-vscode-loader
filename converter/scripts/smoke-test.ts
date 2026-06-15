#!/usr/bin/env node
/**
 * Registry smoke test: clone ALL registry entries, run the converter,
 * validate output structure. Runs concurrently for speed.
 *
 * Usage: npm run test:smoke
 *        CONCURRENCY=8 npm run test:smoke
 *        NO_CACHE=1 npm run test:smoke
 *        VERBOSE=1 npm run test:smoke
 *
 * Proxy: respects HTTPS_PROXY / HTTP_PROXY / ALL_PROXY
 * Cache: ~/.cache/coc-converter-smoke/
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REGISTRY_PATH = path.resolve(__dirname, '../../coc-vscode-registry/registry.json')
const PRESETS_PATH = path.resolve(__dirname, '../../coc-vscode-registry/presets.json')
const CACHE_DIR = path.join(os.homedir(), '.cache', 'coc-converter-smoke')
const TEST_OUTPUT = path.join(os.tmpdir(), 'coc-smoke-output')
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '8', 10)

interface RegistryEntry {
  name: string; displayName: string; type: string
  source: { type: string; repo?: string; package?: string; subdir?: string }
  convert: any[]
}

function cacheDir(e: RegistryEntry): string {
  return path.join(CACHE_DIR, e.name.replace(/[^a-z0-9_-]/gi, '_'))
}

function downloadOrCached(entry: RegistryEntry): string {
  const dest = cacheDir(entry)
  if (fs.existsSync(dest)) {
    // Validate cache is complete (has package.json)
    if (!process.env.NO_CACHE && fs.existsSync(path.join(dest, 'package.json'))) return dest
    fs.rmSync(dest, { recursive: true, force: true })
  }

  fs.mkdirSync(dest, { recursive: true })
  const src = entry.source

  if (src.type === 'github' && src.repo) {
    try {
      execFileSync('git', ['clone', '--depth', '1', '--single-branch',
        `https://github.com/${src.repo}.git`, path.join(dest, '_clone')],
        { stdio: 'pipe', timeout: 300000 })
    } catch (e) {
      fs.rmSync(dest, { recursive: true, force: true })
      throw e
    }
    const cloneDir = path.join(dest, '_clone')
    const sourceDir = src.subdir ? path.join(cloneDir, src.subdir) : cloneDir
    for (const f of fs.readdirSync(sourceDir)) {
      if (f === '.git') continue
      fs.cpSync(path.join(sourceDir, f), path.join(dest, f), { recursive: true })
    }
    fs.rmSync(cloneDir, { recursive: true, force: true })
    return dest
  }

  if (src.type === 'npm' && src.package) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-'))
    try {
      execFileSync('npm', ['pack', src.package], { cwd: tmp, stdio: 'pipe', timeout: 60000 })
    } catch (e) {
      fs.rmSync(tmp, { recursive: true, force: true })
      fs.rmSync(dest, { recursive: true, force: true })
      throw e
    }
    const tarball = fs.readdirSync(tmp).find(f => f.endsWith('.tgz'))
    if (!tarball) throw new Error(`npm pack failed for ${src.package}`)
    execFileSync('tar', ['xzf', path.join(tmp, tarball)], { cwd: dest, stdio: 'pipe' })
    if (fs.existsSync(path.join(dest, 'package'))) {
      for (const f of fs.readdirSync(path.join(dest, 'package')))
        fs.cpSync(path.join(dest, 'package', f), path.join(dest, f), { recursive: true })
      fs.rmSync(path.join(dest, 'package'), { recursive: true, force: true })
    }
    fs.rmSync(tmp, { recursive: true, force: true })
    return dest
  }
  throw new Error(`Unknown source type: ${src.type}`)
}

async function testOne(entry: RegistryEntry, presets: any): Promise<string | null> {
  let inputDir: string
  try {
    inputDir = downloadOrCached(entry)
  } catch (e: any) {
    return `download: ${e.message}`
  }

  const outputDir = path.join(TEST_OUTPUT, entry.name)
  fs.mkdirSync(outputDir, { recursive: true })
  const { convert } = await import('../src/convert.js')

  try {
    await convert({ input: inputDir, output: outputDir, convert: entry.convert, presets })
  } catch (e: any) {
    return `convert: ${e.message}`
  }

  const hasPkg = fs.existsSync(path.join(outputDir, 'package.json'))
  const hasNonSource = entry.convert.some(s => s.type !== 'source' && s.type !== 'mark-unsupported')
  const isSnippets = entry.convert.some(s => s.type === 'snippets')

  try {
    if (isSnippets) {
      if (!hasPkg) return 'missing package.json'
      const pkg = JSON.parse(fs.readFileSync(path.join(outputDir, 'package.json'), 'utf-8'))
      if (!pkg.name) return 'package.json missing name'
      if (!pkg.activationEvents?.length) return 'package.json missing activationEvents'
      if (!fs.existsSync(path.join(outputDir, 'src', 'index.ts'))) return 'missing src/index.ts'
    } else if (hasNonSource) {
      if (!hasPkg) return 'no output'
      const pkg = JSON.parse(fs.readFileSync(path.join(outputDir, 'package.json'), 'utf-8'))
      if (!pkg.name) return 'package.json missing name'
      if (!pkg.main) return 'package.json missing main'
      if (!fs.existsSync(path.join(outputDir, 'esbuild.mjs'))) return 'missing esbuild.mjs'
    } else if (hasPkg) {
      const pkg = JSON.parse(fs.readFileSync(path.join(outputDir, 'package.json'), 'utf-8'))
      if (!pkg.name) return 'package.json missing name'
    }
  } catch (e: any) {
    return `validate: ${e.message}`
  }

  return null // success
}

async function main() {
  if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY)
    console.log(`Proxy: ${process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY}`)
  console.log(`Concurrency: ${CONCURRENCY}\n`)

  const registry: RegistryEntry[] = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'))
  const presets = fs.existsSync(PRESETS_PATH) ? JSON.parse(fs.readFileSync(PRESETS_PATH, 'utf-8')) : undefined
  console.log(`Total: ${registry.length} entries\n`)

  if (fs.existsSync(TEST_OUTPUT)) fs.rmSync(TEST_OUTPUT, { recursive: true, force: true })

  let completed = 0
  const failures: Array<{ name: string; error: string }> = []
  const startTime = Date.now()
  const total = registry.length

  // Process with concurrency
  const pool = new Set<Promise<void>>()
  for (const entry of registry) {
    const p = (async () => {
      const err = await testOne(entry, presets)
      completed++
      const pct = (completed / total * 100).toFixed(0)
      if (err) {
        failures.push({ name: entry.name, error: err })
        process.stdout.write(`\r[${pct}%] ${completed}/${total}  FAIL  ${entry.name}        \n`)
      } else {
        process.stdout.write(`\r[${pct}%] ${completed}/${total}  PASS  ${entry.name}            `)
      }
    })()
    pool.add(p)
    p.finally(() => pool.delete(p))
    if (pool.size >= CONCURRENCY) await Promise.race(pool)
  }
  await Promise.allSettled(pool)
  console.log('')

  // Cleanup
  if (fs.existsSync(TEST_OUTPUT)) fs.rmSync(TEST_OUTPUT, { recursive: true, force: true })

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
  console.log(`\n${completed} done in ${elapsed}s — ${total - failures.length} passed, ${failures.length} failed`)
  if (failures.length > 0) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  ${f.name}: ${f.error}`)
    process.exit(1)
  }
}

main().catch(e => { console.error('\nFatal:', e); process.exit(1) })
