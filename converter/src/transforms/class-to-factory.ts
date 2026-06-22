import { Transform } from '../types.js'
import { SyntaxKind } from 'ts-morph'

const FACTORY_TYPES = new Set([
  'Position', 'Range', 'Location', 'LocationLink',
  'Diagnostic', 'DiagnosticRelatedInformation',
  'Hover', 'CompletionItem', 'CompletionList',
  'CodeAction', 'CodeLens', 'DocumentLink',
  'Color', 'ColorInformation', 'ColorPresentation',
  'FoldingRange', 'SelectionRange',
  'DocumentHighlight', 'SymbolInformation', 'DocumentSymbol',
  'ParameterInformation', 'SignatureInformation',
  'CallHierarchyItem', 'CallHierarchyIncomingCall', 'CallHierarchyOutgoingCall',
  'TypeHierarchyItem', 'LinkedEditingRanges',
])

// Types that map to namespace functions with different names (not .create())
const NAMESPACE_MAP: Record<string, string> = {
  'TextEdit': 'TextEdit.replace',
}

export const transformClassToFactory: Transform = (ctx) => {
  const { file } = ctx

  // AST approach: try to replace via ts-morph
  const nodes = file.getDescendantsOfKind(SyntaxKind.NewExpression)
  // Sort by position descending so inner nodes are processed first
  nodes.sort((a, b) => b.getPos() - a.getPos())
  for (const expr of nodes) {
    const text = expr.getText()
    const m = text.match(/^new\s+(\w+)\(/)
    if (!m) continue
    if (FACTORY_TYPES.has(m[1])) {
      const args = text.slice(m[0].length, -1)
      try { expr.replaceWithText(`${m[1]}.create(${args})`) } catch {}
    } else if (NAMESPACE_MAP[m[1]]) {
      const args = text.slice(m[0].length, -1)
      try { expr.replaceWithText(`${NAMESPACE_MAP[m[1]]}(${args})`) } catch {}
    }
  }

  // Text fallback: catch remaining new Xxx() that AST might have missed
  let text = file.getText()
  text = text.replace(
    /\bnew\s+(Position|Range|Location|Diagnostic)\s*\(/g,
    (match, type) => `${type}.create(`
  )
  text = text.replace(
    /\bnew\s+TextEdit\s*\(/g,
    'TextEdit.replace(',
  )
  text = text.replace(
    /\bnew\s+WorkspaceEdit\s*\(\s*\)/g,
    '({ changes: {} })',
  )

  // CompletionItem.create(label, kind) → item = CompletionItem.create(label); item.kind = kind
  // Uses balanced paren matching to safely handle any expression in kind argument (e.g. ternary)
  const createRe = /const\s+(\w+)\s*=\s*CompletionItem\.create\(/g
  let result = ''
  let lastIdx = 0
  let m: RegExpExecArray | null
  while ((m = createRe.exec(text)) !== null) {
    result += text.slice(lastIdx, m.index)
    let depth = 1
    let i = m.index + m[0].length
    let firstComma = -1
    while (i < text.length && depth > 0) {
      if (text[i] === '(') depth++
      else if (text[i] === ')') depth--
      else if (text[i] === ',' && depth === 1 && firstComma === -1) firstComma = i
      i++
    }
    // i is now past the closing paren
    if (firstComma !== -1) {
      const label = text.slice(m.index + m[0].length, firstComma)
      let kindStart = firstComma + 1
      while (kindStart < text.length && text[kindStart] === ' ') kindStart++
      const kind = text.slice(kindStart, i - 1).trim()
      result += `const ${m[1]} = CompletionItem.create(${label}); ${m[1]}.kind = ${kind}`
      lastIdx = i
    } else {
      result += m[0]
      lastIdx = m.index + m[0].length
    }
  }
  result += text.slice(lastIdx)
  text = result

  if (text !== file.getText()) {
    file.replaceWithText(text)
  }
}
