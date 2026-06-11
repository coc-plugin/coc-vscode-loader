import { Transform } from '../types.js'

/**
 * Adapt provider registration function signatures.
 *
 * registerCompletionItemProvider(sel, p, t) → registerCompletionItemProvider('name', 'sc', sel, p, [t])
 * registerCodeActionsProvider(sel, p, m?)   → registerCodeActionProvider(sel, p, clientId?, kinds?)
 * registerReferenceProvider(sel, p)         → registerReferencesProvider(sel, p)
 * registerDocumentFormattingEditProvider    → registerDocumentFormatProvider(sel, p, priority?)
 * registerColorProvider                     → registerDocumentColorProvider(sel, p)
 */
const RENAMES: Record<string, string> = {
  registerCodeActionsProvider: 'registerCodeActionProvider',
  registerReferenceProvider: 'registerReferencesProvider',
  registerDocumentFormattingEditProvider: 'registerDocumentFormatProvider',
  registerDocumentRangeFormattingEditProvider: 'registerDocumentRangeFormatProvider',
  registerColorProvider: 'registerDocumentColorProvider',
}

export const transformProviderRegister: Transform = (ctx) => {
  let { file } = ctx
  let content = file.getText()
  let changed = false

  // 1. Simple renames
  for (const [from, to] of Object.entries(RENAMES)) {
    const re = new RegExp(`\\b${from}\\b`, 'g')
    if (re.test(content)) {
      content = content.replace(re, to)
      changed = true
    }
  }

  // 2. registerCompletionItemProvider: insert name + shortcut at beginning
  if (content.includes('registerCompletionItemProvider')) {
    content = content.replace(
      /registerCompletionItemProvider\(/g,
      `registerCompletionItemProvider('plugin', 'PL', `
    )
    // Make the last string arg an array if it's a single trigger char
    content = content.replace(
      /registerCompletionItemProvider\([^)]+,\s*['"]([^'"]+)['"]\)/g,
      (match, trigger) => match.replace(`'${trigger}'`, `['${trigger}']`)
    )
    changed = true
  }

  if (changed) {
    file.replaceWithText(content)
  }
}
