import * as vscode from 'vscode'

export function activate() {
  const edit = new WorkspaceEdit()
  edit.set(document.uri, [TextEdit.replace(new Range(0, 0, 0, 0), 'text')])
  action.edit = edit
}
