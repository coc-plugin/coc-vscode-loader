import { Transform } from '../types.js'

/**
 * Remove Volar-specific framework imports that are not compatible with coc.nvim.
 * The Volar extension uses @volar/vscode and reactive-vscode meta-framework,
 * which need to be stripped since the bridge step provides alternative setup.
 */
export const transformStripVolar: Transform = (ctx) => {
  const { file } = ctx
  let content = file.getText()
  let changed = false

  const patterns = [
    /import[\s\S]*?from\s+['"]@volar\/vscode['"];?\n?/g,
    /import[\s\S]*?from\s+['"]reactive-vscode['"];?\n?/g,
    /import\s*\*\s*as\s+lsp\s+from\s+['"]@volar\/vscode\/node['"];?\n?/g,
  ]

  for (const re of patterns) {
    const newContent = content.replace(re, '')
    if (newContent !== content) {
      content = newContent
      changed = true
    }
  }

  if (changed) {
    file.replaceWithText(content)
  }
}
