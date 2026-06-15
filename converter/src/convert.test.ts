import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'

describe('convert main flow', () => {
  let tmpdir: string
  let outdir: string

  beforeEach(() => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'convert-test-'))
    outdir = tmpdir + '/output'
    // Create minimal input
    fs.mkdirSync(path.join(tmpdir, 'src'), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpdir, { recursive: true, force: true })
  })

  function writeInput(rel: string, content: string) {
    const fp = path.join(tmpdir, rel)
    fs.mkdirSync(path.dirname(fp), { recursive: true })
    fs.writeFileSync(fp, content)
  }

  it('produces package.json with correct structure', async () => {
    writeInput('package.json', JSON.stringify({ name: 'test-ext', description: 'Test' }))
    writeInput('src/extension.ts', `import * as vscode from 'vscode'\nexport function activate() {}`)
    const { convert } = await import('./convert.js')
    await convert({
      input: tmpdir,
      output: outdir,
      convert: [{ type: 'source', transforms: ['import-mapping'] }],
    })
    const pkg = JSON.parse(fs.readFileSync(path.join(outdir, 'package.json'), 'utf-8'))
    expect(pkg.name).toBe('coc-test-ext')
    expect(pkg.main).toBe('lib/index.js')
    expect(pkg.engines.coc).toBe('^0.0.82')
    expect(pkg.activationEvents).toEqual(['onLanguage'])
  })

  it('generates esbuild.mjs config', async () => {
    writeInput('package.json', JSON.stringify({ name: 'test-ext' }))
    writeInput('src/extension.ts', `import * as vscode from 'vscode'\nexport function activate() {}`)
    const { convert } = await import('./convert.js')
    await convert({
      input: tmpdir,
      output: outdir,
      convert: [{ type: 'source', transforms: [] }],
    })
    expect(fs.existsSync(path.join(outdir, 'esbuild.mjs'))).toBe(true)
    const esbuild = fs.readFileSync(path.join(outdir, 'esbuild.mjs'), 'utf-8')
    expect(esbuild).toContain("entryPoints: ['src/extension.ts']")
    expect(esbuild).toContain('external:')
    expect(esbuild).toContain("outfile: 'lib/index.js'")
  })

  it('generates coc-convert.json metadata', async () => {
    writeInput('package.json', JSON.stringify({ name: 'test-ext' }))
    writeInput('src/extension.ts', `import * as vscode from 'vscode'\nexport function activate() {}`)
    const { convert } = await import('./convert.js')
    await convert({
      input: tmpdir,
      output: outdir,
      convert: [{ type: 'source', transforms: [] }],
    })
    const meta = JSON.parse(fs.readFileSync(path.join(outdir, 'coc-convert.json'), 'utf-8'))
    expect(meta.entryPoint).toBeTruthy()
    expect(meta.activationEvents).toBeDefined()
    expect(meta.hasLanguageClient).toBe(false)
  })

  it('replaces getWordRangeAtPosition in source files', async () => {
    writeInput('package.json', JSON.stringify({ name: 'test-ext' }))
    writeInput('src/extension.ts', `import * as vscode from 'vscode'\nconst range = document.getWordRangeAtPosition(pos, /\\w+/)`)
    const { convert } = await import('./convert.js')
    await convert({
      input: tmpdir,
      output: outdir,
      convert: [{ type: 'source', transforms: [] }],
    })
    const content = fs.readFileSync(path.join(outdir, 'src', 'extension.ts'), 'utf-8')
    expect(content).toContain('document.getText()')
    expect(content).not.toContain('const range = document.getWordRangeAtPosition(')
  })

  it('replaces .fileName with Uri.parse().fsPath', async () => {
    writeInput('package.json', JSON.stringify({ name: 'test-ext' }))
    writeInput('src/extension.ts', `import * as vscode from 'vscode'\nconst name = document.fileName`)
    const { convert } = await import('./convert.js')
    await convert({
      input: tmpdir,
      output: outdir,
      convert: [{ type: 'source', transforms: [] }],
    })
    const content = fs.readFileSync(path.join(outdir, 'src', 'extension.ts'), 'utf-8')
    expect(content).toContain('Uri.parse(document.uri).fsPath')
    expect(content).not.toContain('document.fileName')
  })

  it('replaces .uri.fsPath with Uri.parse().fsPath', async () => {
    writeInput('package.json', JSON.stringify({ name: 'test-ext' }))
    writeInput('src/extension.ts', `import * as vscode from 'vscode'\nconst p = document.uri.fsPath`)
    const { convert } = await import('./convert.js')
    await convert({
      input: tmpdir,
      output: outdir,
      convert: [{ type: 'source', transforms: [] }],
    })
    const content = fs.readFileSync(path.join(outdir, 'src', 'extension.ts'), 'utf-8')
    expect(content).toContain('Uri.parse(document.uri).fsPath')
    expect(content).not.toContain('document.uri.fsPath')
  })

  it('injects Uri import when Uri.parse() is introduced', async () => {
    writeInput('package.json', JSON.stringify({ name: 'test-ext' }))
    writeInput('src/extension.ts', `import * as vscode from 'vscode'\nimport { workspace } from 'coc.nvim'\nconst p = document.uri.fsPath`)
    const { convert } = await import('./convert.js')
    await convert({
      input: tmpdir,
      output: outdir,
      convert: [{ type: 'source', transforms: [] }],
    })
    const content = fs.readFileSync(path.join(outdir, 'src', 'extension.ts'), 'utf-8')
    expect(content).toContain('Uri')
  })

  it('handles fileName destructuring', async () => {
    writeInput('package.json', JSON.stringify({ name: 'test-ext' }))
    writeInput('src/extension.ts', `import * as vscode from 'vscode'\nconst { fileName } = document;`)
    const { convert } = await import('./convert.js')
    await convert({
      input: tmpdir,
      output: outdir,
      convert: [{ type: 'source', transforms: [] }],
    })
    const content = fs.readFileSync(path.join(outdir, 'src', 'extension.ts'), 'utf-8')
    expect(content).toContain('fileName = Uri.parse')
    expect(content).not.toContain('{ fileName }')
  })

  it('preserves source plugin contributes.configuration in output package.json', async () => {
    writeInput('package.json', JSON.stringify({
      name: 'test-ext',
      contributes: {
        configuration: {
          title: 'Test',
          properties: {
            'test.enable': { type: 'boolean', default: true },
          },
        },
      },
    }))
    writeInput('src/extension.ts', `import * as vscode from 'vscode'\nexport function activate() {}`)
    const { convert } = await import('./convert.js')
    await convert({
      input: tmpdir,
      output: outdir,
      convert: [{ type: 'source', transforms: [] }],
    })
    const pkg = JSON.parse(fs.readFileSync(path.join(outdir, 'package.json'), 'utf-8'))
    expect(pkg.contributes.configuration.properties['test.enable']).toBeTruthy()
  })

  it('preserves source contributes.commands in output package.json', async () => {
    writeInput('package.json', JSON.stringify({
      name: 'test-ext',
      contributes: {
        commands: [{ command: 'test.doStuff', title: 'Do Stuff' }],
      },
    }))
    writeInput('src/extension.ts', `import * as vscode from 'vscode'\nexport function activate() {}`)
    const { convert } = await import('./convert.js')
    await convert({
      input: tmpdir,
      output: outdir,
      convert: [{ type: 'source', transforms: [] }],
    })
    const pkg = JSON.parse(fs.readFileSync(path.join(outdir, 'package.json'), 'utf-8'))
    expect(pkg.contributes.commands).toHaveLength(1)
    expect(pkg.contributes.commands[0].command).toBe('test.doStuff')
  })

  it('preserves contributes.snippets in output', async () => {
    writeInput('package.json', JSON.stringify({
      name: 'test-snippets',
      contributes: {
        snippets: [{ language: 'javascript', path: './snippets/javascript.json' }],
      },
    }))
    writeInput('src/extension.ts', `import * as vscode from 'vscode'\nexport function activate() {}`)
    const { convert } = await import('./convert.js')
    await convert({
      input: tmpdir,
      output: outdir,
      convert: [{ type: 'source', transforms: [] }],
    })
    const pkg = JSON.parse(fs.readFileSync(path.join(outdir, 'package.json'), 'utf-8'))
    expect(pkg.contributes.snippets).toHaveLength(1)
    expect(pkg.contributes.snippets[0].language).toBe('javascript')
  })

  it('handles language-client step with module server', async () => {
    writeInput('package.json', JSON.stringify({
      name: 'test-ls',
      description: 'Test LS',
      dependencies: { 'test-server': '^1.0.0' },
    }))
    writeInput('src/extension.ts', `import * as vscode from 'vscode'\nexport function activate() {}`)
    const { convert } = await import('./convert.js')
    await convert({
      input: tmpdir,
      output: outdir,
      convert: [
        {
          type: 'language-client',
          server: { kind: 'module', package: 'test-server' },
          languages: ['test'],
        },
        { type: 'source', transforms: ['import-mapping'] },
      ],
    })
    expect(fs.existsSync(path.join(outdir, 'src', 'index.ts'))).toBe(true)
    const index = fs.readFileSync(path.join(outdir, 'src', 'index.ts'), 'utf-8')
    expect(index).toContain('LanguageClient')
    expect(index).toContain("from 'coc.nvim'")

    const pkg = JSON.parse(fs.readFileSync(path.join(outdir, 'package.json'), 'utf-8'))
    expect(pkg.dependencies['test-server']).toBe('^1.0.0')
  })

  it('handles binary server language-client step', async () => {
    writeInput('package.json', JSON.stringify({ name: 'binary-ls' }))
    writeInput('src/extension.ts', `import * as vscode from 'vscode'\nexport function activate() {}`)
    const { convert } = await import('./convert.js')
    await convert({
      input: tmpdir,
      output: outdir,
      convert: [
        {
          type: 'language-client',
          server: {
            kind: 'binary',
            package: 'my-server',
            binary: { repo: 'user/repo', asset: 'server-{{version}}.tar.gz', binaryPath: 'bin/srv' },
          },
          languages: ['test'],
        },
      ],
    })
    const meta = JSON.parse(fs.readFileSync(path.join(outdir, 'coc-convert.json'), 'utf-8'))
    expect(meta.serverBinary).toBeTruthy()
    expect(meta.serverBinary.repo).toBe('user/repo')
    expect(meta.hasLanguageClient).toBe(true)
  })

  it('copies .ts and .js source files to output', async () => {
    writeInput('package.json', JSON.stringify({ name: 'test-ext' }))
    writeInput('src/extension.ts', `import * as vscode from 'vscode'\nexport function activate() {}`)
    writeInput('src/helper.ts', `export function helper() {}`)
    writeInput('src/legacy.js', `module.exports = {}`)
    const { convert } = await import('./convert.js')
    await convert({
      input: tmpdir,
      output: outdir,
      convert: [{ type: 'source', transforms: [] }],
    })
    expect(fs.existsSync(path.join(outdir, 'src', 'extension.ts'))).toBe(true)
    expect(fs.existsSync(path.join(outdir, 'src', 'helper.ts'))).toBe(true)
    expect(fs.existsSync(path.join(outdir, 'src', 'legacy.js'))).toBe(true)
  })

  it('outputs entry point src/index.ts for language-client', async () => {
    writeInput('package.json', JSON.stringify({ name: 'ls-ext' }))
    writeInput('src/extension.ts', `import * as vscode from 'vscode'\nexport function activate() {}`)
    const { convert } = await import('./convert.js')
    await convert({
      input: tmpdir,
      output: outdir,
      convert: [
        {
          type: 'language-client',
          server: { kind: 'module', package: 'ls-srv' },
          languages: ['test'],
        },
      ],
    })
    const esbuild = fs.readFileSync(path.join(outdir, 'esbuild.mjs'), 'utf-8')
    expect(esbuild).toContain("entryPoints: ['src/index.ts']")
  })
})
