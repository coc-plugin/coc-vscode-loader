import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { Project, ScriptKind } from 'ts-morph'
import { transformImportMapping } from './import-mapping.js'
import { transformClassToFactory } from './class-to-factory.js'
import { transformProviderRegister } from './provider-register.js'
import { transformEnumOffset } from './enum-offset.js'
import { transformLanguageClient } from './language-client.js'

const FIXTURES_DIR = path.resolve(import.meta.dirname, '../__fixtures__')

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
      input: fs.readFileSync(inputPath, 'utf-8').replace(/\n$/, ''),
      expected: fs.readFileSync(outputPath, 'utf-8').replace(/\n$/, ''),
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
