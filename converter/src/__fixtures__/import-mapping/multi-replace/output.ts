import { workspace, window, languages } from 'coc.nvim'
if (typeof window !== 'undefined' && !('activeTextEditor' in window)) {
  try {
    Object.defineProperty(window, 'activeTextEditor', {
      get() {
        try {
          var doc = typeof workspace !== 'undefined' ? workspace.getDocument() : undefined;
          return doc ? { document: doc } : undefined;
        } catch(e) { return undefined }
      },
      configurable: true,
    });
  } catch {}
}
const bar = window.createStatusBarItem( 100)
const trusted = true
const action = ((() => { try { return new CodeAction('fix') } catch { return { title: '', kind: '' } as any } })())
const editor = window.activeTextEditor
/* setDecorations */
const folder = (workspace.workspaceFolders || [])[0]
return [action]