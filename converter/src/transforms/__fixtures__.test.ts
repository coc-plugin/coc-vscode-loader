import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { Project, ScriptKind } from 'ts-morph'
import { transformImportMapping } from './import-mapping.js'
import { transformClassToFactory } from './class-to-factory.js'
import { transformProviderRegister } from './provider-register.js'
import { transformEnumOffset } from './enum-offset.js'
import { transformLanguageClient } from './language-client.js'

const FIXTURES_DIR = path.resolve(import.meta.dirname, '../__fixtures__')

function normalizeEOL(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\n$/, '')
}

interface FixtureCase {
  name: string
  input: string
  expected: string
  transformName: string
  pluginName?: string
  filePath?: string
}

function loadFixtures(transformName: string): FixtureCase[] {
  const dir = path.join(FIXTURES_DIR, transformName)
  if (!fs.existsSync(dir)) return []
  const cases: FixtureCase[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const inputPath = path.join(dir, entry.name, 'input.ts')
    const outputPath = path.join(dir, entry.name, 'output.ts')
    if (!fs.existsSync(inputPath) || !fs.existsSync(outputPath)) continue
    const optsPath = path.join(dir, entry.name, 'options.json')
    const opts = fs.existsSync(optsPath) ? JSON.parse(fs.readFileSync(optsPath, 'utf-8')) : {}
    cases.push({
      name: entry.name,
      input: normalizeEOL(fs.readFileSync(inputPath, 'utf-8')),
      expected: normalizeEOL(fs.readFileSync(outputPath, 'utf-8')),
      transformName,
      pluginName: opts.pluginName,
      filePath: opts.filePath,
    })
  }
  return cases
}

function applyTransform(source: string, transformName: string, pluginName?: string, filePath?: string): string {
  const project = new Project({ useInMemoryFileSystem: true })
  const fp = filePath || '/project/src/test.ts'
  const file = project.createSourceFile(fp, source, { scriptKind: ScriptKind.TS })
  const ctx = { file, project, pluginName }

  switch (transformName) {
    case 'import-mapping':
      transformImportMapping(ctx)
      break
    case 'class-to-factory':
      transformClassToFactory(ctx)
      break
    case 'provider-register':
      transformProviderRegister(ctx)
      break
    case 'enum-offset':
      transformEnumOffset(ctx)
      break
    case 'language-client':
      transformLanguageClient(ctx)
      break
    default:
      throw new Error(`Unknown transform: ${transformName}`)
  }
  return file.getText()
}

// Dynamically generate test suites for each transform that has fixtures
const transforms = fs.readdirSync(FIXTURES_DIR).filter(f =>
  fs.statSync(path.join(FIXTURES_DIR, f)).isDirectory() && f !== 'pipeline'
)

for (const transformName of transforms) {
  const fixtures = loadFixtures(transformName)
  if (fixtures.length === 0) continue

  describe(`${transformName} fixtures`, () => {
    for (const f of fixtures) {
      it(f.name, () => {
        const result = applyTransform(f.input, f.transformName, f.pluginName, f.filePath)
        expect(result).toBe(f.expected)
      })
    }
  })
}

// ---- Pipeline fixtures (full convert() flow) ----

interface PipelineCase {
  name: string
  inputDir: string
}

function loadPipelineCases(): PipelineCase[] {
  const dir = path.join(FIXTURES_DIR, 'pipeline')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .filter(e => {
      const inputPkg = path.join(dir, e.name, 'package.json')
      const inputSrc = path.join(dir, e.name, 'src')
      const expectedSrc = path.join(dir, e.name, 'expected', 'src')
      return fs.existsSync(inputPkg) && fs.existsSync(inputSrc) && fs.existsSync(expectedSrc)
    })
    .map(e => ({ name: e.name, inputDir: path.join(dir, e.name) }))
}

const pipelineCases = loadPipelineCases()

if (pipelineCases.length > 0) {
  describe('pipeline fixtures', () => {
    let tmpdir: string
    let outdir: string

    beforeEach(() => {
      tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-test-'))
      outdir = path.join(tmpdir, 'output')
    })

    afterEach(() => {
      fs.rmSync(tmpdir, { recursive: true, force: true })
    })

    for (const c of pipelineCases) {
      it(c.name, async () => {
        // Copy fixture input to temp input dir
        const inputPath = path.join(tmpdir, 'input')
        fs.cpSync(c.inputDir, inputPath, { recursive: true })
        // Remove expected/ from temp (it's metadata, not source)
        const expectedDir = path.join(inputPath, 'expected')
        if (fs.existsSync(expectedDir)) fs.rmSync(expectedDir, { recursive: true })

        const { convert } = await import('../convert.js')
        await convert({
          input: inputPath,
          output: outdir,
          convert: [{ type: 'source', transforms: ['import-mapping'] }],
        })

        // Compare output files with expected files
        const expectedRoot = path.join(c.inputDir, 'expected')
        const outputFiles = walkRelativeFiles(outdir)
        const expectedFiles = walkRelativeFiles(expectedRoot)

        // Check all expected files exist in output
        for (const rel of expectedFiles) {
          expect(outputFiles).toContain(rel)
          const expectedContent = normalizeEOL(fs.readFileSync(path.join(expectedRoot, rel), 'utf-8'))
          const actualContent = normalizeEOL(fs.readFileSync(path.join(outdir, rel), 'utf-8'))
          expect(actualContent).toBe(expectedContent)
        }
      })
    }
  })
}

function walkRelativeFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const files: string[] = []
  function walk(d: string, rel: string) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name)
      const relPath = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) {
        walk(full, relPath)
      } else {
        files.push(relPath)
      }
    }
  }
  walk(dir, '')
  return files
}
