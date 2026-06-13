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
    /import .* from ['"]@volar\/vscode['"];?\n?/g,
    /import .* from ['"]reactive-vscode['"];?\n?/g,
    /import \* as lsp from ['"]@volar\/vscode\/node['"];?\n?/g,
  ]

  for (const re of patterns) {
    if (re.test(content)) {
      content = content.replace(re, '')
      changed = true
    }
  }

  if (changed) {
    file.replaceWithText(content)
  }
}
