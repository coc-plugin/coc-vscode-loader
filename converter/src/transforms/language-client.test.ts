import { describe, it, expect } from 'vitest'
import { Project, ScriptKind } from 'ts-morph'

async function applyLanguageClientTransform(source: string): Promise<string> {
  const project = new Project({ useInMemoryFileSystem: true })
  const file = project.createSourceFile('test.ts', source, { scriptKind: ScriptKind.TS })
  const { transformLanguageClient } = await import('./language-client.js')
  transformLanguageClient({ file, project })
  return file.getText()
}

describe('language-client transform', () => {
  // Note: The transform uses getDescendantsOfKind(CallExpression) to find
  // new LanguageClient(...), but new expressions are NewExpression, not CallExpression.
  // This means the transform NEVER matches — it's a known bug (wrong SyntaxKind).
  // The tests below document current (non-)behavior.

  it('does NOT convert VS Code style {run, debug} due to SyntaxKind bug', async () => {
    const input = `new LanguageClient('id', 'name', { run: { module: serverPath, transport: TransportKind.ipc }, debug: { module: serverPath } }, { documentSelector })`
    const result = await applyLanguageClientTransform(input)
    // Transform doesn't match NewExpression nodes
    expect(result).toBe(input)
  })

  it('does NOT handle run without transport due to SyntaxKind bug', async () => {
    const input = `new LanguageClient('id', 'name', { run: { module: serverPath } }, { documentSelector })`
    const result = await applyLanguageClientTransform(input)
    expect(result).toBe(input)
  })

  it('leaves already-coc style LanguageClient unchanged', async () => {
    const input = `new LanguageClient('id', 'name', { module: serverPath, transport: TransportKind.ipc }, { documentSelector })`
    const result = await applyLanguageClientTransform(input)
    expect(result).toBe(input)
  })

  it('leaves non-LanguageClient calls unchanged', async () => {
    const input = `foo.bar('id', 'name', { run: { module: x } }, {})`
    const result = await applyLanguageClientTransform(input)
    expect(result).toBe(input)
  })

  it('handles LanguageClient with fewer than 3 args', async () => {
    const input = `new LanguageClient('id')`
    const result = await applyLanguageClientTransform(input)
    expect(result).toBe(input)
  })
})
