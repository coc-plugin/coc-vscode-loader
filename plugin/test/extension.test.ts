import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { commands, workspace } from 'coc.nvim'
import extension from '../lib/index.js'

const LOADER_COMMANDS = [
  'loader.open',
  'loader.install',
  'loader.uninstall',
  'loader.update',
  'loader.reinstall',
  'loader.uninstallAll',
  'loader.list',
  'loader.cleanCache',
  'loader.updateRegistry',
  'loader.whatChanged',
  'loader._dispatch',
]

beforeEach(async () => {
  await workspace.nvim.command('enew!')
})

describe('coc-vscode-loader extension', () => {
  it('loads the activated extension', () => {
    assert.ok(extension)
    assert.equal(typeof extension.activate, 'function')
    assert.equal(typeof extension.deactivate, 'function')
  })

  it('registers all loader commands', async () => {
    const registered = new Set(commands.commandList.map(item => item.id))
    for (const name of LOADER_COMMANDS) {
      assert.ok(registered.has(name), `command ${name} is not registered`)
      assert.ok(commands.has(name), `commands.has('${name}') is false`)
    }
  })

  it('communicates with the editor', async () => {
    assert.equal(await workspace.nvim.eval('1 + 1'), 2)
    await workspace.nvim.command('call setline(1, ["hello", "world"])')
    assert.deepEqual(await workspace.nvim.call('getline', [1, '$']), ['hello', 'world'])
  })
})
