import { workspace } from 'coc.nvim'
import { EditorAPI } from './editor-api'
import { NvimEditor } from './nvim-editor'

export async function createEditor(): Promise<EditorAPI> {
  const nvim = workspace.nvim
  try {
    const isNvim = await nvim.call('has', ['nvim']) as number
    if (isNvim !== 1) {
      const ver = await nvim.call('exists', ['*popup_create']) as number
      const verStr = ver === 1 ? '9.0+' : '8.x'
      throw new Error(`TUI requires Neovim. Detected Vim ${verStr}. Use a different version or Neovim.`)
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('TUI requires')) throw e
  }
  return new NvimEditor()
}
