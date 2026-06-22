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
import { execFileSync, execSync } from 'child_process'
import { convert } from '../src/convert.js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REGISTRY_PATH = path.resolve(__dirname, '../../coc-vscode-registry/registry.json')
const PRESETS_PATH = path.resolve(__dirname, '../../coc-vscode-registry/presets.json')
const CACHE_DIR = path.join(os.homedir(), '.cache', 'coc-converter-smoke')
const TEST_OUTPUT = path.join(os.tmpdir(), 'coc-smoke-output')
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '8', 10)
const CACHE_TTL_DAYS = parseInt(process.env.CACHE_TTL || '7', 10)

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
  const src = entry.source
  const isSnippets = entry.convert.some(s => s.type === 'snippets')

  if (src.type === 'github' && src.repo) {
    const url = `https://github.com/${src.repo}.git`

    if (fs.existsSync(path.join(dest, '.git'))) {
      // Fast incremental update
      try {
        execFileSync('git', ['fetch', '--depth', '1', 'origin', 'main'], { cwd: dest, stdio: 'pipe', timeout: 30000 })
        execFileSync('git', ['reset', '--hard', 'origin/main'], { cwd: dest, stdio: 'pipe', timeout: 30000 })
      } catch {
        // Fetch failed, re-clone
        fs.rmSync(dest, { recursive: true, force: true })
        fs.mkdirSync(dest, { recursive: true })
        execFileSync('git', ['clone', '--depth', '1', '--single-branch', url, dest], { stdio: 'pipe', timeout: 300000 })
      }
    } else {
      // Fresh clone
      if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
      fs.mkdirSync(dest, { recursive: true })
      execFileSync('git', ['clone', '--depth', '1', '--single-branch', url, dest], { stdio: 'pipe', timeout: 300000 })
    }

    // Validate expected files exist
    const checkDir = src.subdir ? path.join(dest, src.subdir) : dest
    if (isSnippets) {
      // Snippets need contributes.snippets in package.json
      if (!fs.existsSync(path.join(checkDir, 'package.json')))
        throw new Error(`package.json not found in ${src.subdir ? src.subdir : 'root'} of ${src.repo}`)
    }
    return checkDir
  }

  if (src.type === 'npm' && src.package) {
    // npm packages: re-download if stale or missing
    const metaPath = path.join(dest, '.npm-meta.json')
    let stale = !fs.existsSync(dest) || !fs.existsSync(path.join(dest, 'package.json'))
    if (!stale) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
        const age = (Date.now() - new Date(meta.fetched).getTime()) / 1000 / 86400
        if (age > CACHE_TTL_DAYS) stale = true
      } catch { stale = true }
    }
    if (stale || process.env.NO_CACHE) {
      if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
      fs.mkdirSync(dest, { recursive: true })
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-'))
      try {
        execFileSync('npm', ['pack', src.package], { cwd: tmp, stdio: 'pipe', timeout: 60000 })
      } catch (e) {
        fs.rmSync(tmp, { recursive: true, force: true })
        fs.rmSync(dest, { recursive: true, force: true })
        throw e
      }
      const tarball = fs.readdirSync(tmp).find(f => f.endsWith('.tgz'))
      if (!tarball) { fs.rmSync(tmp, { recursive: true, force: true }); throw new Error(`npm pack failed for ${src.package}`) }
      execFileSync('tar', ['xzf', path.join(tmp, tarball)], { cwd: dest, stdio: 'pipe' })
      if (fs.existsSync(path.join(dest, 'package'))) {
        for (const f of fs.readdirSync(path.join(dest, 'package')))
          fs.cpSync(path.join(dest, 'package', f), path.join(dest, f), { recursive: true })
        fs.rmSync(path.join(dest, 'package'), { recursive: true, force: true })
      }
      fs.rmSync(tmp, { recursive: true, force: true })
      fs.writeFileSync(metaPath, JSON.stringify({ fetched: new Date().toISOString() }))
    }
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
  try {
    await convert({ input: inputDir, output: outputDir, convert: entry.convert, presets })
  } catch (e: any) {
    return `convert: ${e.message}`
  }

  const hasPkg = fs.existsSync(path.join(outputDir, 'package.json'))
  const hasNonSource = entry.convert.some(s => s.type !== 'source' && s.type !== 'mark-unsupported')
  const isSnippets = entry.convert.some(s => s.type === 'snippets')

  // Read output package.json if it exists
  let pkg: any = null
  if (hasPkg) {
    try { pkg = JSON.parse(fs.readFileSync(path.join(outputDir, 'package.json'), 'utf-8')) } catch {}
  }

  try {
    if (isSnippets) {
      // Snippets: must have package.json + activationEvents + src/index.ts + snippet files copied
      if (!pkg) return 'missing package.json'
      if (!pkg.name) return 'package.json missing name'
      if (!pkg.activationEvents?.length) return 'package.json missing activationEvents'
      if (!fs.existsSync(path.join(outputDir, 'src', 'index.ts'))) return 'missing src/index.ts'
      // Check contributed snippet files actually exist in output
      const contributed = pkg.contributes?.snippets
      if (contributed?.length) {
        const missing = contributed.filter((s: any) => !fs.existsSync(path.join(outputDir, s.path)))
        if (missing.length > 0) {
          return `${missing.length} snippet files not copied (e.g. ${missing[0].path})`
        }
      }
    } else if (hasNonSource) {
      // language-client / bridge: must have package.json + entry point + esbuild.mjs
      if (!pkg) return 'no output (package.json missing)'
      if (!pkg.name) return 'package.json missing name'
      if (!pkg.main) return 'package.json missing main'
      if (!fs.existsSync(path.join(outputDir, 'esbuild.mjs'))) return 'missing esbuild.mjs'
      // Check generated entry point exists
      if (!fs.existsSync(path.join(outputDir, 'src', 'index.ts')) && !fs.existsSync(path.join(outputDir, 'src', 'bridge.ts'))) {
        return 'missing generated entry (src/index.ts or src/bridge.ts)'
      }
    } else {
      // Source-only: conversion may produce no output if no vscode imports found (expected)
      if (pkg) {
        if (!pkg.name) return 'package.json missing name'
        // Check at least some source files were copied
        const srcDir = path.join(outputDir, 'src')
        if (fs.existsSync(srcDir)) {
          const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.ts') || f.endsWith('.js'))
          if (files.length === 0) return 'no source files in src/'
        }
      }
    }
  } catch (e: any) {
    return `validate: ${e.message}`
  }

  // TypeScript compilation check on converted output
  if (hasPkg && !isSnippets) {
    const srcDir = path.join(outputDir, 'src')
    if (fs.existsSync(srcDir)) {
      const tsFiles = fs.readdirSync(srcDir).filter(f => f.endsWith('.ts'))
      if (tsFiles.length > 0) {
        const tscError = checkTypeScript(outputDir, srcDir)
        if (tscError) return tscError
      }
    }
  }

  return null // success
}

/**
 * Run tsc --noEmit on the output directory to catch compilation errors.
 * Generates a single global declaration file with stubs for all external modules.
 */
function checkTypeScript(outputDir: string, srcDir: string): string | null {
  // Scan all TS files for external module imports
  const externalMods = new Set<string>()
  const importRe = /(?:from|require)\s*\(?\s*['"]([^'"]+)['"]\)?\s*/g
  for (const f of fs.readdirSync(srcDir).filter(f => f.endsWith('.ts'))) {
    const content = fs.readFileSync(path.join(srcDir, f), 'utf-8')
    let m: RegExpExecArray | null
    while ((m = importRe.exec(content)) !== null) {
      const mod = m[1]
      if (!mod.startsWith('.') && !mod.startsWith('node:')) {
        externalMods.add(mod)
      }
    }
  }

  if (externalMods.size === 0) return null

  // Build a single catch-all declaration file
  const declLines: string[] = []
  for (const mod of externalMods) {
    // Collect named import identifiers used from this module
    const exports = new Set<string>()
    for (const f of fs.readdirSync(srcDir).filter(f => f.endsWith('.ts'))) {
      const content = fs.readFileSync(path.join(srcDir, f), 'utf-8')
      const re = new RegExp(`import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s*from\\s*['"]${escapeRegex(mod)}['"]`, 'g')
      let nm: RegExpExecArray | null
      while ((nm = re.exec(content)) !== null) {
        for (const n of nm[1].split(',')) {
          const name = n.trim().split(/\s+as\s+/).pop()?.trim()
          if (name) exports.add(name)
        }
      }
    }
    // Also handle import * as X from 'mod'; X.Y usage
    for (const f of fs.readdirSync(srcDir).filter(f => f.endsWith('.ts'))) {
      const content = fs.readFileSync(path.join(srcDir, f), 'utf-8')
      const nsRe = new RegExp(`import\\s+\\*\\s+as\\s+(\\w+)\\s+from\\s*['"]${escapeRegex(mod)}['"]`, 'g')
      let nm: RegExpExecArray | null
      while ((nm = nsRe.exec(content)) !== null) {
        exports.add(nm[1])
      }
    }

    if (exports.size > 0) {
      // Named exports
      declLines.push(`declare module '${mod}' {`)
      for (const e of exports) {
        declLines.push(`  export let ${e}: any;`)
      }
      declLines.push('}')
    } else {
      // Default export or require-style
      declLines.push(`declare module '${mod}' {`)
      declLines.push('  const _: any;')
      declLines.push('  export = _')
      declLines.push('}')
    }
    declLines.push('')
  }

  const typingsPath = path.join(outputDir, 'smoke-check.d.ts')
  fs.writeFileSync(typingsPath, declLines.join('\n'))

  const tsconfigPath = path.join(outputDir, 'tsconfig.check.json')
  fs.writeFileSync(tsconfigPath, JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'commonjs',
      strict: false,
      skipLibCheck: true,
      noEmit: true,
      moduleResolution: 'node',
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
      resolveJsonModule: true,
      types: [],
      baseUrl: outputDir,
      ignoreDeprecations: '6.0',
    },
    include: ['src/**/*.ts', 'smoke-check.d.ts'],
  }, null, 2))

  try {
    execFileSync('npx', ['tsc', '--project', tsconfigPath, '--noEmit', '--strict', 'false', '--skipLibCheck'], {
      cwd: outputDir,
      stdio: 'pipe',
      timeout: 60000,
      shell: true,
    })
    return null
  } catch (e: any) {
    const stderr = (e.stderr || '').toString()
    const stdout = (e.stdout || '').toString()
    const all = stderr + stdout
    // Filter to actual TS errors (skip informational messages)
    const lines = all.split('\n').filter(l => l.includes('error TS'))
    if (lines.length === 0) return 'tsc check failed (unknown error)'
    // Deduplicate by error code and message (ignore position)
    const seen = new Set<string>()
    const unique: string[] = []
    for (const l of lines) {
      const key = l.replace(/\(\d+,\d+\)/g, '(pos)')
      if (!seen.has(key)) {
        seen.add(key)
        unique.push(l.trim())
      }
    }
    const detail = unique.slice(0, 5).join('; ')
    return `tsc: ${detail}`
  } finally {
    try { fs.rmSync(tsconfigPath) } catch {}
    try { fs.rmSync(typingsPath) } catch {}
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
