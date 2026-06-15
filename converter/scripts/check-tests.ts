import { readdirSync, existsSync } from 'fs'
import { join, relative } from 'path'

const srcDir = new URL('../src', import.meta.url).pathname

const EXEMPT = [
  'types.ts',
  'index.ts',
  'cli.ts',
]

function walk(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
      files.push(...walk(p))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(p)
    }
  }
  return files
}

const files = walk(srcDir)

let exitCode = 0
for (const fp of files) {
  const name = relative(srcDir, fp)
  if (name.endsWith('.test.ts')) continue
  if (EXEMPT.some(e => name === e || name.endsWith('/' + e))) continue

  const testFile = fp.replace(/\.ts$/, '.test.ts')
  if (!existsSync(testFile)) {
    console.error(`  MISSING TEST: ${name}`)
    exitCode = 1
  }
}

if (exitCode === 0) {
  console.log(`All source files have matching tests (${files.length - EXEMPT.length} sources checked)`)
}
process.exit(exitCode)
