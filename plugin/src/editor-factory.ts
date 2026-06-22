import { workspace } from 'coc.nvim'
import { EditorAPI } from './editor-api'
import { NvimEditor } from './nvim-editor'
import { VimEditor } from './vim-editor'

export async function createEditor(): Promise<EditorAPI> {
  const nvim = workspace.nvim
  const isNvim = await nvim.call('has', ['nvim']) as number
  if (isNvim === 1) {
    return new NvimEditor()
  }
  const vimVer = await nvim.call('exists', ['*prop_add']) as number
  if (vimVer === 0) {
    throw new Error('TUI requires Vim >= 9.0 (prop_add not found)')
  }
  return new VimEditor()
}
