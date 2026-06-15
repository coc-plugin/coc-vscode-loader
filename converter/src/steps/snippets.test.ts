import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'

describe('snippets step', () => {
  let tmpdir: string

  beforeEach(() => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'snippets-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpdir, { recursive: true, force: true })
  })

  function writeFile(relPath: string, content: string) {
    const fp = path.join(tmpdir, relPath)
    fs.mkdirSync(path.dirname(fp), { recursive: true })
    fs.writeFileSync(fp, content)
  }

  it('detects missing contributes.snippets in source and throws', async () => {
    const { snippetsGenerator } = await import('./snippets.js')
    expect(() => {
      snippetsGenerator.generate(
        { input: tmpdir, output: tmpdir + '/out', origPkg: {}, project: null as any },
        { type: 'snippets' },
      )
    }).toThrow('has no contributes.snippets')
  })

  it('copies snippet files and generates index.ts', async () => {
    writeFile('snippets/javascript.json', JSON.stringify({ "console.log": { "prefix": "log", "body": "console.log($1)" } }))
    writeFile('snippets/typescript.json', JSON.stringify({ "console.log": { "prefix": "log", "body": "console.log($1)" } }))
    const outdir = tmpdir + '/out'
    const { snippetsGenerator } = await import('./snippets.js')
    const result = snippetsGenerator.generate(
      {
        input: tmpdir,
        output: outdir,
        origPkg: {
          contributes: {
            snippets: [
              { language: 'javascript', path: './snippets/javascript.json' },
              { language: 'typescript', path: './snippets/typescript.json' },
            ],
          },
        },
        project: null as any,
      },
      { type: 'snippets' },
    )

    expect(result.generatedFiles).toHaveLength(1)
    expect(result.generatedFiles[0].path).toBe('src/index.ts')
    expect(result.generatedFiles[0].content).toContain('activate')
    expect(result.generatedFiles[0].content).toContain('coc.nvim')

    expect(result.activationEvents).toContain('onLanguage:javascript')
    expect(result.activationEvents).toContain('onLanguage:typescript')

    expect(fs.existsSync(path.join(outdir, 'snippets/javascript.json'))).toBe(true)
    expect(fs.existsSync(path.join(outdir, 'snippets/typescript.json'))).toBe(true)
  })

  it('uses languages override when specified', async () => {
    writeFile('snippets/javascript.json', JSON.stringify({ test: { prefix: 't', body: 'test' } }))
    writeFile('snippets/vue.json', JSON.stringify({ test: { prefix: 't', body: 'test' } }))
    const outdir = tmpdir + '/out'
    const { snippetsGenerator } = await import('./snippets.js')
    const result = snippetsGenerator.generate(
      {
        input: tmpdir,
        output: outdir,
        origPkg: {
          contributes: {
            snippets: [
              { language: 'javascript', path: './snippets/javascript.json' },
              { language: 'vue', path: './snippets/vue.json' },
            ],
          },
        },
        project: null as any,
      },
      { type: 'snippets', languages: ['javascript'] },
    )

    expect(result.activationEvents).toEqual(['onLanguage:javascript'])
    expect(fs.existsSync(path.join(outdir, 'snippets/vue.json'))).toBe(false)
  })

  it('throws when no snippet files are found', async () => {
    const outdir = tmpdir + '/out'
    const { snippetsGenerator } = await import('./snippets.js')
    expect(() => {
      snippetsGenerator.generate(
        {
          input: tmpdir,
          output: outdir,
          origPkg: {
            contributes: {
              snippets: [
                { language: 'javascript', path: './snippets/javascript.json' },
              ],
            },
          },
          project: null as any,
        },
        { type: 'snippets' },
      )
    }).toThrow('no snippet files were copied')
  })
})
