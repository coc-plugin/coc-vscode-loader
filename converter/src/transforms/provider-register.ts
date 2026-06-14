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
    // Use paren-balancing to handle nested parentheses in arguments
    // Build result by iterating over all matches, replacing each full call
    const providerRe = /registerCompletionItemProvider\(/g
    let result = ''
    let lastIdx = 0
    let m: RegExpExecArray | null
    while ((m = providerRe.exec(content)) !== null) {
      const start = m.index
      let depth = 1
      let i = start + m[0].length
      while (i < content.length && depth > 0) {
        if (content[i] === '(') depth++
        else if (content[i] === ')') depth--
        i++
      }
      const end = i
      const fullCall = content.slice(start, end)
      const lastStrMatch = fullCall.match(/,?\s*'([^']+)'\s*\)$/)
      const lastDblMatch = fullCall.match(/,?\s*"([^"]+)"\s*\)$/)
      let replacement = fullCall
      if (lastStrMatch) {
        replacement = fullCall.slice(0, fullCall.length - lastStrMatch[0].length) + ', ["' + lastStrMatch[1] + '"])'
      } else if (lastDblMatch) {
        replacement = fullCall.slice(0, fullCall.length - lastDblMatch[0].length) + ', ["' + lastDblMatch[1] + '"])'
      }
      result += content.slice(lastIdx, start) + replacement
      lastIdx = end
    }
    result += content.slice(lastIdx)
    content = result
    changed = true
  }

  if (changed) {
    file.replaceWithText(content)
  }
}
