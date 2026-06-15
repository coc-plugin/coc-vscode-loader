import { describe, it, expect } from 'vitest'
import { Project, ScriptKind } from 'ts-morph'

async function applyEnumOffset(source: string): Promise<string> {
  const project = new Project({ useInMemoryFileSystem: true })
  const file = project.createSourceFile('test.ts', source, { scriptKind: ScriptKind.TS })
  const { transformEnumOffset } = await import('./enum-offset.js')
  transformEnumOffset({ file, project })
  return file.getText()
}

describe('enum-offset transform', () => {
  it('adds comment to severity comparisons with numbers', async () => {
    const result = await applyEnumOffset('if (severity === 0)')
    expect(result).toContain('DiagnosticSeverity values differ in coc')
  })

  it('handles non-severity code unchanged', async () => {
    const input = 'const x = 1'
    expect(await applyEnumOffset(input)).toBe(input)
  })

  it('handles severity without comparison', async () => {
    const input = 'severity = 0'
    expect(await applyEnumOffset(input)).toBe(input)
  })
})
