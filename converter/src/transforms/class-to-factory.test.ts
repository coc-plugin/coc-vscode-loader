import { describe, it, expect } from 'vitest'
import { Project, ScriptKind } from 'ts-morph'

function applyClassToFactory(source: string): string {
  const project = new Project({ useInMemoryFileSystem: true })
  const file = project.createSourceFile('test.ts', source, { scriptKind: ScriptKind.TS })
  let content = file.getText()

  content = content.replace(
    /\bnew\s+(Position|Range|Location|Diagnostic)\s*\(/g,
    (match, type) => `${type}.create(`,
  )

  content = content.replace(
    /\bnew\s+TextEdit\s*\(/g,
    'TextEdit.replace(',
  )

  content = content.replace(
    /\bnew\s+WorkspaceEdit\s*\(\s*\)/g,
    '({ changes: {} })',
  )

  content = content.replace(
    /const\s+(\w+)\s*=\s*CompletionItem\.create\(([^,]+),\s*([^)]+)\)/g,
    (_, varName, label, kind) => {
      return `const ${varName} = CompletionItem.create(${label}); ${varName}.kind = ${kind}`
    },
  )

  if (content !== file.getText()) file.replaceWithText(content)
  return file.getText()
}

describe('class-to-factory transform', () => {
  it('converts new Position() to Position.create()', () => {
    const result = applyClassToFactory('const pos = new Position(0, 0)')
    expect(result).toContain('Position.create(0, 0)')
  })

  it('converts new Range() to Range.create()', () => {
    const result = applyClassToFactory('const r = new Range(0, 0, 1, 0)')
    expect(result).toContain('Range.create(0, 0, 1, 0)')
  })

  it('converts new Diagnostic() to Diagnostic.create()', () => {
    const result = applyClassToFactory('const d = new Diagnostic(range, "msg")')
    expect(result).toContain('Diagnostic.create(range, "msg")')
  })

  it('converts new TextEdit() to TextEdit.replace()', () => {
    const result = applyClassToFactory('const edit = new TextEdit(range, "text")')
    expect(result).toContain('TextEdit.replace(range, "text")')
  })

  it('converts CompletionItem.create(label, kind) with split', () => {
    const result = applyClassToFactory('const item = CompletionItem.create("test", 1)')
    expect(result).toContain('const item = CompletionItem.create("test"); item.kind = 1')
  })

  it('converts new WorkspaceEdit() to plain object', () => {
    const result = applyClassToFactory('const we = new WorkspaceEdit()')
    expect(result).toContain('({ changes: {} })')
    expect(result).not.toContain('new WorkspaceEdit()')
  })

  it('does not convert arbitrary new expressions', () => {
    const input = 'const x = new MyClass()'
    expect(applyClassToFactory(input)).toBe(input)
  })

  it('handles file with no class instantiations', () => {
    const input = 'const x = 1'
    expect(applyClassToFactory(input)).toBe(input)
  })
})
