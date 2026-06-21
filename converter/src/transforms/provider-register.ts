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
    const pluginName = ctx.pluginName || path.basename(path.dirname(path.dirname(fileName))) || 'plugin'
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
      // Collect all trailing string arguments as trigger chars, wrap in array
      const triggerRe = /((?:,\s*['"][^'"]*['"])+)\s*\)$/
      const triggerMatch = fullCall.match(triggerRe)
      let replacement = fullCall
      if (triggerMatch) {
        const before = fullCall.slice(0, fullCall.length - triggerMatch[0].length)
        const triggers = triggerMatch[1]
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
          .map(s => s.replace(/^['"](.*)['"]$/, '"$1"'))
          .join(', ')
        replacement = before + ', [' + triggers + '])'
      }
      result += content.slice(lastIdx, start) + replacement
      lastIdx = end
    }
    result += content.slice(lastIdx)
    content = result
    changed = true
  }

  if (changed) {
    try {
      file.replaceWithText(content)
    } catch {}
  }
}
