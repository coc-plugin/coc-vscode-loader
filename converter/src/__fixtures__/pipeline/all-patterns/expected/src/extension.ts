import { Uri, Range } from 'coc.nvim'
import * as vscode from 'coc.nvim'

export function activate() {
  const line = document.getText().split("\n")[pos.line]; const pre = line.slice(0, pos.character); const m = pre.match(/\w+/); const range = m ? { start: { line: pos.line, character: pos.character - m[0].length }, end: { line: pos.line, character: pos.character } } : undefined
  const p1 = Uri.parse(document.uri).fsPath
  const p2 = Uri.parse(document.uri).fsPath
  const we = ({ changes: {} })
  we.changes[document.uri] = edits
  const loc = Location.create('/path', Range.create(new Position(0, 0), new Position(0, 0)))
}
