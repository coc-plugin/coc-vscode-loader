import * as vscode from 'vscode'

export function activate() {
  const pos = new Position(0, 5)
  const range = document.getWordRangeAtPosition(pos, /\w+/)
  const range2 = document.getWordRangeAtPosition(pos)
  const range3 = document.getWordRangeAtPosition(position, /[a-z]+/)
}
