import { Transform } from '../types.js'
import { SyntaxKind } from 'ts-morph'

const FACTORY_TYPES = new Set([
  'Position', 'Range', 'Location', 'LocationLink',
  'Diagnostic', 'DiagnosticRelatedInformation',
  'TextEdit',
  'Hover', 'CompletionItem', 'CompletionList',
  'CodeAction', 'CodeLens', 'DocumentLink',
  'Color', 'ColorInformation', 'ColorPresentation',
  'FoldingRange', 'SelectionRange',
  'DocumentHighlight', 'SymbolInformation', 'DocumentSymbol',
  'ParameterInformation', 'SignatureInformation',
  'CallHierarchyItem', 'CallHierarchyIncomingCall', 'CallHierarchyOutgoingCall',
  'TypeHierarchyItem', 'LinkedEditingRanges',
])

export const transformClassToFactory: Transform = (ctx) => {
  const { file } = ctx

  // AST approach: try to replace via ts-morph
  const nodes = file.getDescendantsOfKind(SyntaxKind.NewExpression)
  // Sort by position descending so inner nodes are processed first
  nodes.sort((a, b) => b.getPos() - a.getPos())
  for (const expr of nodes) {
    const text = expr.getText()
    const m = text.match(/^new\s+(\w+)\(/)
    if (!m || !FACTORY_TYPES.has(m[1])) continue
    const args = text.slice(m[0].length, -1)
    try { expr.replaceWithText(`${m[1]}.create(${args})`) } catch {}
  }

  // Text fallback: catch remaining new Xxx() that AST might have missed
  let text = file.getText()
  text = text.replace(
    /\bnew\s+(Position|Range|Location|Diagnostic|TextEdit)\s*\(/g,
    (match, type) => `${type}.create(`
  )

  // CompletionItem.create(label, kind) → item = CompletionItem.create(label); item.kind = kind
  text = text.replace(
    /const\s+(\w+)\s*=\s*CompletionItem\.create\(([^,]+),\s*([^)]+)\)/g,
    (_, varName, label, kind) => {
      return `const ${varName} = CompletionItem.create(${label}); ${varName}.kind = ${kind}`
    }
  )

  if (text !== file.getText()) {
    file.replaceWithText(text)
  }
}
