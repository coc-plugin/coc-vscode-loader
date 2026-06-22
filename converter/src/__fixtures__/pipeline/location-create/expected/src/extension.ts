import * as path from 'path'
import * as vscode from 'coc.nvim'

export function activate() {
  const loc = new Location(Uri.file('/path/to/file.ts'), new Position(0, 0))
  const loc2 = Location.create(Uri.file('/path/to/file.ts'), new Position(0, 0))
}
