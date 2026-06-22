import * as vscode from 'vscode'

export function activate() {
  const range = document.getWordRangeAtPosition(pos, /\w+/)
  const p1 = document.fileName
  const p2 = document.uri.fsPath
  const we = new WorkspaceEdit()
  we.set(document.uri, edits)
  const loc = Location.create(Uri.file('/path'), new Position(0, 0))
}
