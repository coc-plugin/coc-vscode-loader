import * as vscode from 'coc.nvim'

export function activate() {
  const edit = ({ changes: {} })
  edit.changes[document.uri] = [TextEdit.replace(new Range(0, 0, 0, 0, 'text')])
  action.edit = edit
}
