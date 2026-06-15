import { describe, it, expect } from 'vitest'
import { Project, ScriptKind } from 'ts-morph'

async function applyStripVolar(source: string): Promise<string> {
  const project = new Project({ useInMemoryFileSystem: true })
  const file = project.createSourceFile('test.ts', source, { scriptKind: ScriptKind.TS })
  const { transformStripVolar } = await import('./strip-volar.js')
  transformStripVolar({ file, project })
  return file.getText()
}

describe('strip-volar transform', () => {
  it('removes @volar/vscode import', async () => {
    const result = await applyStripVolar(`import { activate } from '@volar/vscode'\nconst x = 1`)
    expect(result).not.toContain('@volar/vscode')
    expect(result).toContain('const x = 1')
  })

  it('removes reactive-vscode import', async () => {
    const result = await applyStripVolar(`import { useCommand } from 'reactive-vscode'\nconst x = 1`)
    expect(result).not.toContain('reactive-vscode')
    expect(result).toContain('const x = 1')
  })

  it('removes @volar/vscode/node import', async () => {
    const result = await applyStripVolar(`import * as lsp from '@volar/vscode/node'\nconst x = 1`)
    expect(result).not.toContain('@volar/vscode/node')
    expect(result).toContain('const x = 1')
  })

  it('leaves unrelated code unchanged', async () => {
    const input = `import { workspace } from 'coc.nvim'\nconst x = 1`
    expect(await applyStripVolar(input)).toBe(input)
  })
})
