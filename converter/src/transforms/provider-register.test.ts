import { describe, it, expect } from 'vitest'
import { Project, ScriptKind } from 'ts-morph'

async function applyProviderRegister(source: string, filePath?: string, pluginName?: string): Promise<string> {
  const project = new Project({ useInMemoryFileSystem: true })
  const fp = filePath || '/project/src/extension.ts'
  const file = project.createSourceFile(fp, source, { scriptKind: ScriptKind.TS })
  const { transformProviderRegister } = await import('./provider-register.js')
  transformProviderRegister({ file, project, pluginName })
  return file.getText()
}

describe('provider-register transform', () => {
  it('renames registerCodeActionsProvider to registerCodeActionProvider', async () => {
    const result = await applyProviderRegister('registerCodeActionsProvider(sel, provider)')
    expect(result).toContain('registerCodeActionProvider(sel, provider)')
  })

  it('renames registerReferenceProvider to registerReferencesProvider', async () => {
    const result = await applyProviderRegister('registerReferenceProvider(sel, provider)')
    expect(result).toContain('registerReferencesProvider(sel, provider)')
  })

  it('renames registerDocumentFormattingEditProvider to registerDocumentFormatProvider', async () => {
    const result = await applyProviderRegister('registerDocumentFormattingEditProvider(sel, provider)')
    expect(result).toContain('registerDocumentFormatProvider(sel, provider)')
  })

  it('renames registerColorProvider to registerDocumentColorProvider', async () => {
    const result = await applyProviderRegister('registerColorProvider(sel, provider)')
    expect(result).toContain('registerDocumentColorProvider(sel, provider)')
  })

  it('injects plugin name and shortcut in registerCompletionItemProvider', async () => {
    const result = await applyProviderRegister(
      'registerCompletionItemProvider(selector, provider, "abcdef")',
      '/project/output/src/completion.ts',
    )
    expect(result).toContain("registerCompletionItemProvider('output'")
    expect(result).toContain(", 'CO'")
    expect(result).toContain(', ["abcdef"])')
  })

  it('wraps trigger chars in array for registerCompletionItemProvider', async () => {
    const result = await applyProviderRegister(
      "registerCompletionItemProvider(selector, provider, 'abc')",
    )
    expect(result).toContain(', ["abc"])')
    expect(result).not.toContain(", 'abc')")
  })

  it('uses pluginName from context when provided', async () => {
    const result = await applyProviderRegister(
      "registerCompletionItemProvider(sel, provider, 'ab')",
      undefined,
      'my-plugin',
    )
    expect(result).toContain("registerCompletionItemProvider('my-plugin'")
  })

  it('handles no transformation needed', async () => {
    const input = 'const x = 1'
    expect(await applyProviderRegister(input)).toBe(input)
  })
})
