import { workspace, window, languages } from 'vscode'
const bar = window.createStatusBarItem('test', StatusBarAlignment.Right, 100)
const trusted = workspace.isTrusted
const action = new CodeAction('fix')
const editor = window.activeTextEditor
editor.setDecorations(decoration, ranges)
const folder = workspace.workspaceFolders[0]
return [action]
