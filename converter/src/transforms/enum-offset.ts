import { Transform } from '../types.js'

/**
 * Handle enum value offsets between VS Code (0-based) and coc (1-based LSP).
 * Some enums like DiagnosticSeverity, CompletionItemKind, SymbolKind have
 * different numeric values, but since coc re-exports them with correct values,
 * symbol references (like CompletionItemKind.Value) work correctly at runtime.
 *
 * This transform handles cases where hardcoded numbers are used instead of
 * enum symbols, which is rare but can happen in extensions.
 *
 * Affected enums and their offset:
 *   CompletionItemKind:      vscode Text=0 → coc Text:1  (differs by 1 for first ~11 values)
 *   SymbolKind:              vscode File=0 → coc File:1
 *   DocumentHighlightKind:   vscode Text=0 → coc Text:1
 *   DiagnosticSeverity:      vscode Error=0 → coc Error:1
 */
export const transformEnumOffset: Transform = (ctx) => {
  const { file } = ctx
  let content = file.getText()

  // Replace any numeric enum comparisons with comments
  // e.g., `severity === 0` → `severity === 0 /* DiagnosticSeverity.Error = 1 in coc */`
  // Only match 'severity' when it's part of DiagnosticSeverity context (preceded by Diagnostic or standalone)
  content = content.replace(
    /((?:Diagnostic\.)?severity\s*(?:[=!]==?|[<>]=?)\s*)(\d+)/g,
    '$1$2 /* DiagnosticSeverity values differ in coc (1-4 vs 0-3) */'
  )

  if (content !== file.getText()) {
    file.replaceWithText(content)
  }
}
