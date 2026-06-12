import { Transform } from '../types.js'

/**
 * Replace `from 'vscode'` with `from 'coc.nvim'`,
 * and apply name remapping for known API differences.
 */
const MAPPINGS: Record<string, string> = {
  // namespace
  'vscode': 'coc.nvim',

  // naming differences
  'EventEmitter': 'Emitter',
  'Disposable': 'Disposable',

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
  file.getImportDeclarations().forEach(decl => {
    const mod = decl.getModuleSpecifierValue()
    if (mod === 'vscode') {
      decl.setModuleSpecifier('coc.nvim')
    }
  })

  // Rewrite named references
  file.getDescendantsOfKind(192 /* Identifier */).forEach(node => {
    const text = node.getText()
    const mapped = MAPPINGS[text]
    if (mapped && mapped !== text) {
      // Only replace if it's a direct reference, not part of a string
      const parent = node.getParent()
      if (parent && parent.getKindName() !== 'StringLiteral') {
        node.replaceWithText(mapped)
      }
    }
  })
}
