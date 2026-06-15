import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'

describe('mark-unsupported step', () => {
  let tmpdir: string

  beforeEach(() => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'mark-unsup-'))
  })

  afterEach(() => {
    fs.rmSync(tmpdir, { recursive: true, force: true })
  })

  function writeSrc(rel: string, content: string) {
    const fp = path.join(tmpdir, 'src', rel)
    fs.mkdirSync(path.dirname(fp), { recursive: true })
    fs.writeFileSync(fp, content)
  }

  it('comments out createTextEditorDecorationType calls', async () => {
    writeSrc('ext.ts', 'editor.createTextEditorDecorationType({})')
    const { markUnsupportedGenerator } = await import('./mark-unsupported.js')
    markUnsupportedGenerator.generate(
      { input: tmpdir, output: tmpdir, origPkg: {}, project: null as any },
      { type: 'mark-unsupported', features: ['decoration'] },
    )
    const content = fs.readFileSync(path.join(tmpdir, 'src', 'ext.ts'), 'utf-8')
    expect(content).toContain('TODO: Decoration API is not supported')
    expect(content).toContain('void 0')
  })

  it('comments out setDecorations calls', async () => {
    writeSrc('ext.ts', 'editor.setDecorations(dec, ranges)')
    const { markUnsupportedGenerator } = await import('./mark-unsupported.js')
    markUnsupportedGenerator.generate(
      { input: tmpdir, output: tmpdir, origPkg: {}, project: null as any },
      { type: 'mark-unsupported', features: ['decoration'] },
    )
    const content = fs.readFileSync(path.join(tmpdir, 'src', 'ext.ts'), 'utf-8')
    expect(content).toContain('TODO: Decoration API is not supported')
  })

  it('comments out createWebviewPanel calls', async () => {
    writeSrc('ext.ts', 'const panel = window.createWebviewPanel("view", "title", viewColumn)')
    const { markUnsupportedGenerator } = await import('./mark-unsupported.js')
    markUnsupportedGenerator.generate(
      { input: tmpdir, output: tmpdir, origPkg: {}, project: null as any },
      { type: 'mark-unsupported', features: ['webview'] },
    )
    const content = fs.readFileSync(path.join(tmpdir, 'src', 'ext.ts'), 'utf-8')
    expect(content).toContain('TODO: Webview API is not supported')
  })

  it('comments out registerTreeDataProvider calls', async () => {
    writeSrc('ext.ts', 'window.registerTreeDataProvider("view", provider)')
    const { markUnsupportedGenerator } = await import('./mark-unsupported.js')
    markUnsupportedGenerator.generate(
      { input: tmpdir, output: tmpdir, origPkg: {}, project: null as any },
      { type: 'mark-unsupported', features: ['tree-data-provider'] },
    )
    const content = fs.readFileSync(path.join(tmpdir, 'src', 'ext.ts'), 'utf-8')
    expect(content).toContain('TODO: Tree data provider is not supported')
  })

  it('comments out env.openExternal calls', async () => {
    writeSrc('ext.ts', 'env.openExternal(url)')
    const { markUnsupportedGenerator } = await import('./mark-unsupported.js')
    markUnsupportedGenerator.generate(
      { input: tmpdir, output: tmpdir, origPkg: {}, project: null as any },
      { type: 'mark-unsupported', features: ['open-external'] },
    )
    const content = fs.readFileSync(path.join(tmpdir, 'src', 'ext.ts'), 'utf-8')
    expect(content).toContain('TODO: env.openExternal has no equivalent')
  })

  it('handles unknown feature gracefully', async () => {
    writeSrc('ext.ts', 'const x = 1')
    const { markUnsupportedGenerator } = await import('./mark-unsupported.js')
    const result = markUnsupportedGenerator.generate(
      { input: tmpdir, output: tmpdir, origPkg: {}, project: null as any },
      { type: 'mark-unsupported', features: ['nonexistent'] },
    )
    expect(result.generatedFiles).toEqual([])
  })

  it('handles missing src directory', async () => {
    const outdir = tmpdir + '/out'
    const { markUnsupportedGenerator } = await import('./mark-unsupported.js')
    const result = markUnsupportedGenerator.generate(
      { input: tmpdir, output: outdir, origPkg: {}, project: null as any },
      { type: 'mark-unsupported', features: ['decoration'] },
    )
    expect(result.generatedFiles).toEqual([])
  })

  it('only processes .ts files', async () => {
    writeSrc('ext.js', 'editor.setDecorations(dec, ranges)')
    const { markUnsupportedGenerator } = await import('./mark-unsupported.js')
    markUnsupportedGenerator.generate(
      { input: tmpdir, output: tmpdir, origPkg: {}, project: null as any },
      { type: 'mark-unsupported', features: ['decoration'] },
    )
    const content = fs.readFileSync(path.join(tmpdir, 'src', 'ext.js'), 'utf-8')
    expect(content).not.toContain('TODO')
  })
})
