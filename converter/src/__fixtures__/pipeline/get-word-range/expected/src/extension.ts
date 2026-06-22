import * as vscode from 'coc.nvim'

export function activate() {
  const pos = new Position(0, 5)
  const line = document.getText().split("\n")[pos.line]; const pre = line.slice(0, pos.character); const m = pre.match(/\w+/); const range = m ? { start: { line: pos.line, character: pos.character - m[0].length }, end: { line: pos.line, character: pos.character } } : undefined
  const range2 = document.getWordRangeAtPosition(pos)
  const range3 = document.getWordRangeAtPosition(position, /[a-z]+/)
}
