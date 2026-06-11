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
  const astReplacements: Array<{ node: any, text: string }> = []
  for (const expr of nodes) {
    const text = expr.getText()
    const m = text.match(/^new\s+(\w+)\(/)
    if (!m || !FACTORY_TYPES.has(m[1])) continue
    const args = text.slice(m[0].length, -1)
    astReplacements.push({ node: expr, text: `${m[1]}.create(${args})` })
  }
  for (const { node, text } of astReplacements) {
    try { node.replaceWithText(text) } catch {}
  }

  // Text fallback: catch remaining new Xxx() that AST might have missed
  const content = file.getText()
  const newContent = content.replace(
    /\bnew\s+(Position|Range|Location|Diagnostic|TextEdit)\s*\(/g,
    (match, type) => `${type}.create(`
  )
  if (newContent !== content) {
    file.replaceWithText(newContent)
  }
}
