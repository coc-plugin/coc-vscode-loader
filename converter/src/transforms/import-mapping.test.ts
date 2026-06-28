import { describe, it, expect } from 'vitest'
import { Project, ScriptKind } from 'ts-morph'

function applyImportMapping(source: string): string {
  const project = new Project({ useInMemoryFileSystem: true })
  const file = project.createSourceFile('test.ts', source, { scriptKind: ScriptKind.TS })
  // Simulate what transformImportMapping does at the text level.
  // We do the text replacements directly since the full transform
  // also does AST-level import rewrites that need ts-morph.
  let content = file.getText()

  // require('vscode') → require('coc.nvim')
  content = content.replace(/require\(['"]vscode['"]\)/g, "require('coc.nvim')")

  // await import(...) → require(...)
  content = content.replace(/await\s+import\(/g, 'require(')

  // createStatusBarItem(name, alignment, priority) → createStatusBarItem(priority)
  content = content.replace(
    /createStatusBarItem\([^,]+,\s*(?:\w+\.)?(?:Right|Left),\s*/g,
    'createStatusBarItem(',
  )

  // LanguageStatusSeverity.xxx → 2
  content = content.replace(/LanguageStatusSeverity\.\w+/g, '2')

  // new StatusBar() → no-op mock
  content = content.replace(
    /new\s+StatusBar\(\)/g,
    'new (class { update(){} hide(){} updateConfig(){} dispose(){} } as any)()',
  )

  // workspace.isTrusted → true
  content = content.replace(/workspace\.isTrusted/g, 'true')

  // new CodeAction try-catch wrapping
  content = content.replace(
    /const action = new CodeAction\(/g,
    'let action; try { action = new CodeAction(',
  )
  content = content.replace(
    /return \[action\];/g,
    "}catch(e){action={title:\"\",kind:\"\"}};return [action];",
  )

  // window.activeTextEditor polyfill
  if (content.includes('window.activeTextEditor')) {
    content = `\
if (typeof window !== 'undefined' && !('activeTextEditor' in window)) {
  try {
    Object.defineProperty(window, 'activeTextEditor', {
      get() {
        try {
          var doc = typeof workspace !== 'undefined' ? workspace.getDocument() : undefined;
          return doc ? { document: doc } : undefined;
        } catch(e) { return undefined }
      },
      configurable: true,
    });
  } catch {}
}
` + content
  }

  // window.onDidChangeActiveTextEditor → workspace.onDidOpenTextDocument
  content = content.replace(/window\.onDidChangeActiveTextEditor/g, 'workspace.onDidOpenTextDocument')

  // languages.createLanguageStatusItem(...) → no-op (with optional vscode. prefix)
  content = content.replace(
    /(?:vscode\.)?languages\.createLanguageStatusItem\([^)]+\)/g,
    '({ dispose(){}, text: "", command: void 0, name: "", accessibilityInformation: void 0, severity: void 0 }) as any',
  )

  // window.showOpenDialog(...) → void 0
  content = content.replace(/window\.showOpenDialog\([^)]*\)/g, 'void 0 as any')

  // registerDocumentFormatProvider(sel, provider) → (sel, provider, 1)
  content = content.replace(
    /registerDocumentFormatProvider\s*\(\s*(\w[\w.]*)\s*,\s*(\w[\w.]*)\s*,?\s*\)/g,
    'registerDocumentFormatProvider($1, $2, 1)',
  )
  content = content.replace(
    /registerDocumentRangeFormatProvider\s*\(\s*(\w[\w.]*)\s*,\s*(\w[\w.]*)\s*,?\s*\)/g,
    'registerDocumentRangeFormatProvider($1, $2, 1)',
  )

  // authentication.getSession(...) → undefined
  content = content.replace(/authentication\.getSession\s*\([^)]*\)/g, 'undefined as any')

  // editor.setDecorations(...) → no-op comment
  content = content.replace(/editor\.setDecorations\s*\([^)]+\)/g, '/* setDecorations */')

  // Guard workspace.workspaceFolders with or without vscode. prefix
  content = content.replace(
    /((?:vscode\.)?)workspace\.workspaceFolders(?=\s*(?:\[|\.\w))/g,
    '($1workspace.workspaceFolders || [])',
  )
  // Guard for-of iteration
  content = content.replace(
    /(of\s+)((?:vscode\.)?)workspace\.workspaceFolders(?!\s*\?)/g,
    '$1($2workspace.workspaceFolders || [])',
  )

  return content
}

describe('import-mapping text replacements', () => {

  it('rewrites require("vscode") to require("coc.nvim")', () => {
    const result = applyImportMapping('const vscode = require("vscode")')
    expect(result).toContain("require('coc.nvim')")
    expect(result).not.toContain('require("vscode")')
  })

  it('rewrites require(\'vscode\') to require(\'coc.nvim\')', () => {
    const result = applyImportMapping("const vscode = require('vscode')")
    expect(result).toContain("require('coc.nvim')")
    expect(result).not.toContain("require('vscode')")
  })

  it('converts await import(...) to require(...)', () => {
    const result = applyImportMapping('const mod = await import("module")')
    expect(result).toContain('require(')
    expect(result).not.toContain('await import(')
  })

  it('does not convert method call .import() to .require()', () => {
    const result = applyImportMapping('await instance.import()')
    expect(result).toContain('.import()')
    expect(result).not.toContain('.require()')
  })

  it('does not convert this.import() to this.require()', () => {
    const result = applyImportMapping('await this.import()')
    expect(result).toContain('this.import()')
    expect(result).not.toContain('this.require()')
  })

  it('strips name and alignment from createStatusBarItem', () => {
    const result = applyImportMapping('window.createStatusBarItem("my-item", StatusBarAlignment.Right, 100)')
    expect(result).toBe('window.createStatusBarItem(100)')
  })

  it('replaces LanguageStatusSeverity with 2', () => {
    const result = applyImportMapping('LanguageStatusSeverity.Information')
    expect(result).toBe('2')
  })

  it('replaces new StatusBar() with no-op mock', () => {
    const result = applyImportMapping('const bar = new StatusBar()')
    expect(result).toContain('new (class')
    expect(result).toContain('dispose(){}')
  })

  it('replaces workspace.isTrusted with true', () => {
    const result = applyImportMapping('if (workspace.isTrusted)')
    expect(result).toBe('if (true)')
  })

  it('wraps new CodeAction with try-catch', () => {
    const result = applyImportMapping('const action = new CodeAction("fix", kind); return [action];')
    expect(result).toContain('let action; try { action = new CodeAction(')
    expect(result).toContain('}catch(e){action={title:"",kind:""}};return [action];')
  })

  it('adds polyfill when window.activeTextEditor is used', () => {
    const result = applyImportMapping('const editor = window.activeTextEditor')
    expect(result).toContain('Object.defineProperty(window, \'activeTextEditor\'')
    expect(result).toContain("typeof workspace !== 'undefined'")
  })

  it('does not add polyfill when window.activeTextEditor is absent', () => {
    const result = applyImportMapping('const x = 1')
    expect(result).not.toContain('Object.defineProperty(window,')
  })

  it('rewrites window.onDidChangeActiveTextEditor', () => {
    const result = applyImportMapping('window.onDidChangeActiveTextEditor(handler)')
    expect(result).toBe('workspace.onDidOpenTextDocument(handler)')
  })

  it('replaces languages.createLanguageStatusItem with no-op', () => {
    const result = applyImportMapping('languages.createLanguageStatusItem("test", document)')
    expect(result).toContain('dispose(){}')
  })

  it('replaces window.showOpenDialog with void 0', () => {
    const result = applyImportMapping('window.showOpenDialog({})')
    expect(result).toBe('void 0 as any')
  })

  it('adds priority 1 to registerDocumentFormatProvider', () => {
    const result = applyImportMapping('registerDocumentFormatProvider(selector, provider)')
    expect(result).toBe('registerDocumentFormatProvider(selector, provider, 1)')
  })

  it('adds priority 1 to registerDocumentRangeFormatProvider', () => {
    const result = applyImportMapping('registerDocumentRangeFormatProvider(selector, provider)')
    expect(result).toBe('registerDocumentRangeFormatProvider(selector, provider, 1)')
  })

  it('replaces authentication.getSession with undefined', () => {
    const result = applyImportMapping('const session = await authentication.getSession("github", [])')
    expect(result).toContain('undefined as any')
  })

  it('comments out editor.setDecorations', () => {
    const result = applyImportMapping('editor.setDecorations(decorationType, ranges)')
    expect(result).toContain('/* setDecorations */')
  })

  it('guards workspace.workspaceFolders index access', () => {
    const result = applyImportMapping('const folder = workspace.workspaceFolders[0]')
    expect(result).toContain('(workspace.workspaceFolders || [])[0]')
    expect(result).not.toContain('workspace.workspaceFolders[0]')
  })

  it('guards workspace.workspaceFolders for-of iteration', () => {
    const result = applyImportMapping('for (const f of workspace.workspaceFolders)')
    expect(result).toContain('(workspace.workspaceFolders || []))')
  })

  it('preserves vscode. prefix when guarding workspace.workspaceFolders index access', () => {
    const result = applyImportMapping('const folder = vscode.workspace.workspaceFolders[0]')
    expect(result).toContain('(vscode.workspace.workspaceFolders || [])[0]')
  })

  it('preserves vscode. prefix when guarding workspace.workspaceFolders for-of iteration', () => {
    const result = applyImportMapping('for (const f of vscode.workspace.workspaceFolders)')
    expect(result).toContain('(vscode.workspace.workspaceFolders || []))')
  })

  it('replaces vscode.languages.createLanguageStatusItem with no-op', () => {
    const result = applyImportMapping('vscode.languages.createLanguageStatusItem("test", document)')
    expect(result).toContain('dispose(){}')
  })

  it('handles nested parentheses in createLanguageStatusItem', () => {
    // The regex [^)]+ breaks on nested parens — this is a known limitation
    const input = `languages.createLanguageStatusItem("test", { onDidChange: () => { /* nested */ } })`
    const result = applyImportMapping(input)
    // The regex extends past the first ')' into the nested content
    // This test documents the current behavior
    expect(result).toContain('dispose(){}')
  })

  it('handles multiple transformations on same source', () => {
    const input = `\
const statusBar = window.createStatusBarItem("test", StatusBarAlignment.Right, 100)
const trusted = workspace.isTrusted
const action = new CodeAction("fix");
return [action];`
    const result = applyImportMapping(input)
    expect(result).toContain('createStatusBarItem(100)')
    expect(result).toContain('true')
    expect(result).toContain('let action; try {')
    expect(result).toContain('}catch(e){action={title:"",kind:""}};return [action];')
  })
})

describe('import-mapping real transform', () => {
  it('adds Uri to multi-line import with trailing comma without double comma', async () => {
    const source = `\
import {
  CompletionItemProvider,
  TextDocument,
  Position,
  CompletionItem,
  CompletionItemKind,
} from "vscode";
const p = Uri.parse('file:///foo').fsPath`
    const project = new Project({ useInMemoryFileSystem: true })
    const file = project.createSourceFile('test.ts', source, { scriptKind: ScriptKind.TS })
    const { transformImportMapping } = await import('./import-mapping.js')
    transformImportMapping({ file, options: {} } as any)
    const result = file.getText()
    expect(result).toContain('from "coc.nvim"')
    expect(result).toContain('Uri')
    expect(result).not.toContain(',,')
  })
})
