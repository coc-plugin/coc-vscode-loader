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
import { convert } from '../src/convert.js'
import { fileURLToPath } from 'url'
import { gitExec, gitCheckout } from './git.js'

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

async function downloadOrCached(entry: RegistryEntry): Promise<string> {
  const dest = cacheDir(entry)
  const src = entry.source
  const isSnippets = entry.convert.some(s => s.type === 'snippets')

  if (src.type === 'github' && src.repo) {
    const url = `https://github.com/${src.repo}.git`

    if (fs.existsSync(path.join(dest, '.git'))) {
      // Fast incremental update
      try {
        await gitExec(['fetch', '--depth', '1', '--quiet', 'origin', 'main'], { cwd: dest, timeout: 30000 })
        await gitExec(['reset', '--hard', '--quiet', 'origin/main'], { cwd: dest, timeout: 30000 })
      } catch {
        // Fetch failed, re-clone
        if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
        fs.mkdirSync(dest, { recursive: true })
        await gitExec(['clone', '--no-checkout', '--depth', '1', '--single-branch', '--quiet', url, dest], { timeout: 300000 })
        await gitCheckout(dest)
      }
    } else {
      // Fresh clone
      if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
      fs.mkdirSync(dest, { recursive: true })
      await gitExec(['clone', '--no-checkout', '--depth', '1', '--single-branch', '--quiet', url, dest], { timeout: 300000 })
      await gitCheckout(dest)
    }

    // Validate expected files exist
    const checkDir = src.subdir ? path.join(dest, src.subdir) : dest
    if (isSnippets) {
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
    inputDir = await downloadOrCached(entry)
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

  return null // success
}

/**
 * Run tsc --noEmit on the output directory to catch compilation errors.
 * Generates a single global declaration file with stubs for all external modules.
 */
function checkTypeScript(outputDir: string, srcDir: string): string | null {
  // Recursively find all TS/JS source files for import scanning
  function scanFiles(dir: string): string[] {
    const result: string[] = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        result.push(...scanFiles(fullPath))
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) {
        result.push(fullPath)
      }
    }
    return result
  }
  const allFiles = scanFiles(srcDir)

  const externalMods = new Map<string, Set<string>>() // mod → set of named imports
  // Matches `from 'x'`, `require('x')`, `from "x"`
  const importRe = /(?:from|require)\s*\(?\s*['"]([^'"\n\r]+)['"]\)?\s*/g
  // Matches named imports: `import { X, Y } from 'mod'` (lazy match for multi-line)
  const namedRe = /import\s*\{\s*([^}]+?)\s*\}\s*from\s*['"]([^'"\n\r]+)['"]/gs
  for (const f of allFiles) {
    const content = fs.readFileSync(f, 'utf-8')
    let m: RegExpExecArray | null
    // Track module usage (including node:*)
    while ((m = importRe.exec(content)) !== null) {
      const mod = m[1]
      if (!mod.startsWith('.') && !mod.includes('${')) {
        if (!externalMods.has(mod)) externalMods.set(mod, new Set())
      }
    }
    // Track named imports per module
    namedRe.lastIndex = 0
    while ((m = namedRe.exec(content)) !== null) {
      const mod = m[2]
      if (!mod.startsWith('.')) {
        if (!externalMods.has(mod)) externalMods.set(mod, new Set())
        m[1].split(',').forEach(name => {
          let trimmed = name.trim().split(/\s+as\s+/)[0].trim()
          // Strip `type` modifier: `import { type X } from 'mod'`
          trimmed = trimmed.replace(/^type\s+/, '')
          if (trimmed) externalMods.get(mod)!.add(trimmed)
        })
      }
    }
  }

  if (externalMods.size === 0) return null

  // Build a single catch-all declaration file
  const declLines: string[] = [
    '// Node.js globals',
    'declare var process: any;',
    'declare var __dirname: string;',
    'declare var require: NodeRequire;',
    'declare var module: NodeModule;',
    'declare var __filename: string;',
    'declare namespace NodeJS { interface Process {} interface Module {} }',
    'declare type Thenable<T> = PromiseLike<T>',
    'declare interface ImportMeta { env: Record<string, any> }',
    'interface _Buffer { from(data: string, encoding?: string): any; isBuffer(obj: any): boolean; [key: string]: any }',
    'declare var Buffer: _Buffer;',
    'type Buffer = _Buffer;',
    'declare type BufferEncoding = \'ascii\' | \'utf8\' | \'utf-8\' | \'utf16le\' | \'ucs2\' | \'ucs-2\' | \'base64\' | \'base64url\' | \'latin1\' | \'binary\' | \'hex\';',
    'declare function suite(name: string, fn: () => void): void;',
    'declare function test(name: string, fn: () => void): void;',
    'declare function describe(name: string, fn: () => void): void;',
    'declare function it(name: string, fn: () => void): void;',
    'declare function before(fn: () => void): void;',
    'declare function after(fn: () => void): void;',
    'declare function beforeEach(fn: () => void): void;',
    'declare function afterEach(fn: () => void): void;',
    '',
  ]
  for (const [mod, named] of externalMods) {
    declLines.push(`declare module '${mod}' {`)
    const names = new Set(named)
    // Always add common types that are often accessed via namespace (vscode.X, url.URL, etc.)
    if (mod === 'coc.nvim') {
      const commonTypes = ['QuickPickItem', 'QuickInput', 'TextDocument', 'OutputChannel', 'Terminal',
        'WorkspaceFolder', 'Disposable', 'TextEdit', 'WorkspaceEdit', 'Position', 'Range',
        'Selection', 'CodeAction', 'CompletionItem', 'CompletionItemKind', 'Diagnostic',
        'ExtensionContext', 'Uri', 'WorkspaceConfiguration',
        'workspace', 'window', 'commands', 'languages', 'services', 'extensions',
        'AuthenticationSession']
      for (const t of commonTypes) names.add(t)
    }
    for (const n of names) {
      declLines.push(`  export declare const ${n}: any;`)
      declLines.push(`  export type ${n} = any;`)
    }
    declLines.push('  const _: any;')
    declLines.push('  export = _;')
    declLines.push('}')
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
    execFileSync('npx', ['--package', 'typescript', 'tsc', '--project', tsconfigPath, '--noEmit', '--skipLibCheck'], {
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
    let lines = all.split('\n').filter(l => l.includes('error TS'))
    // TS2347/TS2693/TS2840/TS2503 are false positives from `any` stubs — skip them
    lines = lines.filter(l => !l.includes('error TS2347') && !l.includes('error TS2693') && !l.includes('error TS2840') && !l.includes('error TS2503'))
    if (lines.length === 0) return null
    const seen = new Set<string>()
    const unique: string[] = []
    for (const l of lines) {
      const key = l.replace(/\(\d+,\d+\)/g, '(pos)')
      if (!seen.has(key)) { seen.add(key); unique.push(l.trim()) }
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
