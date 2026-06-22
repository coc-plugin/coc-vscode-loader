import { workspace } from 'coc.nvim'
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
const editor = window.activeTextEditor
