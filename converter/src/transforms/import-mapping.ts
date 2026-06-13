import { Transform } from '../types.js'

/**
 * Replace `from 'vscode'` with `from 'coc.nvim'`,
 * and apply name remapping for known API differences.
 */
const MAPPINGS: Record<string, string> = {
  // namespace (module specifier is rewritten by AST, keep identifier as-is)

  // naming differences
  'EventEmitter': 'Emitter',
  'Disposable': 'Disposable',
  'StatusBarAlignment': '(void 0) as any',

  // function/method renames
  'getExtension': 'getExtensionById',
  'registerReferenceProvider': 'registerReferencesProvider',
  'registerCodeActionsProvider': 'registerCodeActionProvider',
  'registerColorProvider': 'registerDocumentColorProvider',
  'registerDocumentFormattingEditProvider': 'registerDocumentFormatProvider',
  'registerDocumentRangeFormattingEditProvider': 'registerDocumentRangeFormatProvider',
}

export const transformImportMapping: Transform = (ctx) => {
  const { file } = ctx

  // Rewrite import declarations
  try {
    file.getImportDeclarations().forEach(decl => {
      const mod = decl.getModuleSpecifierValue()
      if (mod === 'vscode') {
        decl.setModuleSpecifier('coc.nvim')
      }
    })
  } catch {}

  // Rewrite named references
  try {
    file.getDescendantsOfKind(80 /* Identifier */).forEach(node => {
      const text = node.getText()
      if (Object.prototype.hasOwnProperty.call(MAPPINGS, text)) {
        const mapped = MAPPINGS[text]
        if (mapped !== text) {
          const parent = node.getParent()
          if (parent && parent.getKindName() !== 'StringLiteral') {
            node.replaceWithText(mapped)
          }
        }
      }
    })
  } catch {}

  // Replace CodeActionKind.SourceFixAll.append('xxx') with string literal
  try {
    file.getDescendantsOfKind(214 /* CallExpression */).forEach(node => {
      const text = node.getText()
      const match = text.match(/^CodeActionKind\.SourceFixAll\.append\(['"](.+)['"]\)$/)
      if (match) {
        node.replaceWithText(`'source.fixAll.${match[1]}'`)
      }
    })
  } catch {}

  // Text-level replacements for coc.nvim API differences

  // Convert require('vscode') to require('coc.nvim') (JS-style imports)
  let content = file.getText()
  let newContent = content.replace(
    /require\(['"]vscode['"]\)/g,
    "require('coc.nvim')",
  )

  // Convert dynamic import() to require()
  newContent = newContent.replace(
    /await\s+import\(/g,
    'require(',
  )

  // Convert createStatusBarItem(name, alignment, priority) → createStatusBarItem(priority)
  newContent = newContent.replace(
    /createStatusBarItem\([^,]+,\s*(?:\w+\.)?(?:Right|Left),\s*/g,
    'createStatusBarItem(',
  )

  // Replace LanguageStatusSeverity.xxx → 2
  newContent = newContent.replace(
    /LanguageStatusSeverity\.\w+/g,
    '2',
  )

  // Replace StatusBar with a no-op mock so formatting works without status UI
  newContent = newContent.replace(
    /new\s+StatusBar\(\)/g,
    'new (class { update(){} hide(){} updateConfig(){} dispose(){} } as any)()',
  )

  // Treat all workspaces as trusted (coc.nvim doesn't have workspace.isTrusted)
  newContent = newContent.replace(
    /workspace\.isTrusted/g,
    'true',
  )

  // Wrap new CodeAction() in try-catch (coc.nvim may not have CodeAction)
  newContent = newContent.replace(
    /const action = new CodeAction\(/g,
    'let action; try { action = new CodeAction(',
  )
  // Close the try-catch before return [action]
  newContent = newContent.replace(
    /return \[action\];/g,
    '}catch(e){action={title:"",kind:""}};return [action];',
  )

  // window.createOutputChannel works in coc.nvim (workspace variant is deprecated)
  // no replacement needed

  // Polyfill window.activeTextEditor (VS Code API, not in coc.nvim)
  if (newContent.includes('window.activeTextEditor')) {
    newContent = `\
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
` + newContent
  }

  // window.onDidChangeActiveTextEditor → workspace.onDidOpenTextDocument
  newContent = newContent.replace(/window\.onDidChangeActiveTextEditor/g, 'workspace.onDidOpenTextDocument')

  // languages.createLanguageStatusItem → no-op (coc.nvim doesn't have this)
  newContent = newContent.replace(
    /languages\.createLanguageStatusItem\([^)]+\)/g,
    '({ dispose(){}, text: "", command: void 0, name: "", accessibilityInformation: void 0, severity: void 0 }) as any'
  )

  // window.showOpenDialog → not available in coc, return undefined
  newContent = newContent.replace(
    /window\.showOpenDialog\([^)]*\)/g,
    'void 0 as any'
  )

  // Add priority 1 to document format providers (default 0 gets overridden by LanguageClient)
  newContent = newContent.replace(
    /registerDocumentFormatProvider\s*\(\s*(\w[\w.]*)\s*,\s*(\w[\w.]*)\s*,?\s*\)/g,
    'registerDocumentFormatProvider($1, $2, 1)'
  )
  newContent = newContent.replace(
    /registerDocumentRangeFormatProvider\s*\(\s*(\w[\w.]*)\s*,\s*(\w[\w.]*)\s*,?\s*\)/g,
    'registerDocumentRangeFormatProvider($1, $2, 1)'
  )

  // authentication.getSession → undefined (coc.nvim has no auth API)
  newContent = newContent.replace(
    /authentication\.getSession\s*\([^)]*\)/g,
    'undefined as any'
  )

  // editor.setDecorations → no-op (coc has different decoration API)
  newContent = newContent.replace(/editor\.setDecorations\s*\([^)]+\)/g, '/* setDecorations */')

  // Guard workspace.workspaceFolders when accessed via index (coc.nvim may return undefined)
  newContent = newContent.replace(
    /workspace\.workspaceFolders(?=\[)/g,
    '(workspace.workspaceFolders || [])'
  )

  // Ensure workspace is imported from coc.nvim when we introduced workspace. references
  if (newContent.includes('workspace.') && newContent.match(/from\s+['"]coc\.nvim['"]/)) {
    newContent = newContent.replace(
      /(import\s*\{\s*)([^}]*?)(\s*\}\s*from\s*['"]coc\.nvim['"])/g,
      (match, prefix, existing, suffix) => {
        if (!existing.includes('workspace')) {
          const sep = existing.trim() ? ', ' : ''
          return `${prefix}${existing.trim()}${sep}workspace${suffix}`
        }
        return match
      }
    )
  }

  if (newContent !== content) {
    file.replaceWithText(newContent)
  }
}
