import * as path from 'path'
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
  // Shortcut derived from source file name (first 2 uppercase letters)
  const fileName = file.getFilePath() || 'plugin'
  const baseName = path.basename(fileName, '.ts')
  const shortcut = baseName.replace(/[^a-zA-Z]/g, '').substring(0, 2).toUpperCase() || 'PL'
  if (content.includes('registerCompletionItemProvider')) {
    const pluginName = path.basename(path.dirname(path.dirname(fileName))) || 'plugin'
    content = content.replace(
      /registerCompletionItemProvider\(/g,
      `registerCompletionItemProvider('${pluginName}', '${shortcut}', `
    )
    // Wrap the last argument in an array if it's a string (trigger chars)
    content = content.replace(
      /(registerCompletionItemProvider\([^)]+),\s*'([^']+)'\)/g,
      '$1, ["$2"])'
    )
    content = content.replace(
      /(registerCompletionItemProvider\([^)]+),\s*"([^"]+)"\)/g,
      '$1, ["$2"])'
    )
    changed = true
  }

  if (changed) {
    file.replaceWithText(content)
  }
}
