import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import { Project } from 'ts-morph'

describe('source step', () => {
  let tmpdir: string
  let outdir: string

  function makeProject(): Project {
    return new Project({ useInMemoryFileSystem: true })
  }

  beforeEach(() => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-test-'))
    outdir = tmpdir + '/out'
  })

  afterEach(() => {
    fs.rmSync(tmpdir, { recursive: true, force: true })
  })

  function writeSrc(rel: string, content: string) {
    const fp = path.join(tmpdir, rel)
    fs.mkdirSync(path.dirname(fp), { recursive: true })
    fs.writeFileSync(fp, content)
  }

  it('copies .ts files from src/ to output/src/', async () => {
    writeSrc('src/extension.ts', "import * as vscode from 'vscode'\nexport function activate() {}")
    const { sourceGenerator } = await import('./source.js')
    sourceGenerator.generate(
      { input: tmpdir, output: outdir, origPkg: {}, project: makeProject() },
      { type: 'source', transforms: ['import-mapping'] },
    )
    expect(fs.existsSync(path.join(outdir, 'src', 'extension.ts'))).toBe(true)
  })

  it('copies .js files as-is with text-level replacements', async () => {
    writeSrc('src/extension.js', 'const vscode = require("vscode")')
    const { sourceGenerator } = await import('./source.js')
    sourceGenerator.generate(
      { input: tmpdir, output: outdir, origPkg: {}, project: makeProject() },
      { type: 'source', transforms: ['import-mapping'] },
    )
    const content = fs.readFileSync(path.join(outdir, 'src', 'extension.js'), 'utf-8')
    expect(content).toContain("require('coc.nvim')")
    expect(content).not.toContain("require('vscode')")
  })

  it('handles keepDeps with array syntax (resolve from dependencies)', async () => {
    writeSrc('src/extension.ts', "import * as vscode from 'vscode'")
    const { sourceGenerator } = await import('./source.js')
    const result = sourceGenerator.generate(
      {
        input: tmpdir,
        output: outdir,
        origPkg: { dependencies: { lodash: '^4.17.21' } },
        project: makeProject(),
      },
      { type: 'source', transforms: [], keepDeps: ['lodash'] },
    )
    expect(result.keepDeps).toEqual({ lodash: '^4.17.21' })
  })

  it('handles keepDeps with object syntax', async () => {
    writeSrc('src/extension.ts', "import * as vscode from 'vscode'")
    const { sourceGenerator } = await import('./source.js')
    const result = sourceGenerator.generate(
      { input: tmpdir, output: outdir, origPkg: {}, project: makeProject() },
      { type: 'source', transforms: [], keepDeps: { lodash: '^4.17.21' } },
    )
    expect(result.keepDeps).toEqual({ lodash: '^4.17.21' })
  })

  it('throws when keepDeps array cannot resolve version', async () => {
    writeSrc('src/extension.ts', "import * as vscode from 'vscode'")
    const { sourceGenerator } = await import('./source.js')
    expect(() => {
      sourceGenerator.generate(
        { input: tmpdir, output: outdir, origPkg: {}, project: makeProject() },
        { type: 'source', transforms: [], keepDeps: ['nonexistent-dep'] },
      )
    }).toThrow('keepDeps: cannot find version')
  })

  it('copies from input root when src/ does not exist', async () => {
    writeSrc('extension.ts', "import * as vscode from 'vscode'")
    const { sourceGenerator } = await import('./source.js')
    sourceGenerator.generate(
      { input: tmpdir, output: outdir, origPkg: {}, project: makeProject() },
      { type: 'source', transforms: [] },
    )
    expect(fs.existsSync(path.join(outdir, 'src', 'extension.ts'))).toBe(true)
  })

  it('returns configured activationEvents', async () => {
    writeSrc('src/extension.ts', "import * as vscode from 'vscode'")
    const { sourceGenerator } = await import('./source.js')
    const result = sourceGenerator.generate(
      { input: tmpdir, output: outdir, origPkg: {}, project: makeProject() },
      { type: 'source', transforms: [], activationEvents: ['onLanguage:typescript'] },
    )
    expect(result.activationEvents).toEqual(['onLanguage:typescript'])
  })

  it('returns entryPoint from step config', async () => {
    writeSrc('src/extension.ts', "import * as vscode from 'vscode'")
    const { sourceGenerator } = await import('./source.js')
    const result = sourceGenerator.generate(
      { input: tmpdir, output: outdir, origPkg: {}, project: makeProject() },
      { type: 'source', transforms: [], entry: 'src/custom-entry.ts' },
    )
    expect(result.entryPoint).toBe('src/custom-entry.ts')
  })
})
