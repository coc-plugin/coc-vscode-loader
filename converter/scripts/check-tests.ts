import { readdirSync, existsSync, readFileSync } from 'fs'
import { join, relative } from 'path'
import { fileURLToPath } from 'url'

const srcDir = fileURLToPath(new URL('../src', import.meta.url))

const EXEMPT = ['types.ts', 'index.ts', 'cli.ts']
const MIN_TEST_SIZE = 50

function walk(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '__fixtures__' && !entry.name.startsWith('.')) {
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
    continue
  }

  // Validate test file is not empty or placeholder
  const testContent = readFileSync(testFile, 'utf-8')
  if (testContent.length < MIN_TEST_SIZE) {
    console.error(`  EMPTY TEST: ${relative(srcDir, testFile)} (${testContent.length} bytes)`)
    exitCode = 1
    continue
  }
  if (!/\b(it|test)\s*\(/.test(testContent)) {
    console.error(`  NO TEST CASES: ${relative(srcDir, testFile)} (no it() or test() calls)`)
    exitCode = 1
    continue
  }
}

if (exitCode === 0) {
  const sourceFiles = files.filter(f => {
    const name = relative(srcDir, f)
    return !name.endsWith('.test.ts') && !EXEMPT.some(e => name === e || name.endsWith('/' + e))
  })
  console.log(`All ${sourceFiles.length} source files have valid tests`)
}
process.exit(exitCode)
