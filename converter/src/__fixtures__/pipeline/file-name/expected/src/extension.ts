import { Uri } from 'coc.nvim'
import * as vscode from 'coc.nvim'

export function activate() {
  const path1 = Uri.parse(document.uri).fsPath
  const path2 = Uri.parse(doc.uri).fsPath
  const path3 = Uri.parse(this.document.uri).fsPath
  const path4 = Uri.parse(this._document.uri).fsPath
  const path5 = Uri.parse(textDocument.uri).fsPath
}
