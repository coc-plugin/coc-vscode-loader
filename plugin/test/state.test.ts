import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { StateManager, type AppState, type PackageEntry, type Status } from '../src/state'
import type { PackageInfo } from '../src/registry'

function packageInfo(name: string, extra: Partial<PackageInfo> = {}): PackageInfo {
  return {
    name,
    displayName: name,
    description: `${name} description`,
    type: 'direct-api',
    source: { type: 'github', repo: `coc-plugin/${name}` },
    url: `https://github.com/coc-plugin/${name}`,
    languages: [],
    categories: [],
    ...extra,
  }
}

function packageEntry(name: string, status: Status, extra: Partial<PackageEntry> = {}): PackageEntry {
  return {
    info: packageInfo(name),
    status,
    progressLog: [],
    expanded: false,
    logExpanded: false,
    marked: false,
    ...extra,
  }
}

function appState(packages: PackageEntry[]): AppState {
  return {
    packages,
    searchQuery: '',
    showHelp: false,
    activePill: null,
    dirty: false,
    viewFilter: 'all',
    sortBy: 'default',
    scrollOffset: 0,
    categoryFilter: null,
    languageFilter: null,
    queuedNames: [],
    batchStats: null,
  }
}

describe('StateManager', () => {
  it('filters packages by search query', () => {
    const manager = new StateManager(appState([
      packageEntry('vscode-eslint', 'installed'),
      packageEntry('vscode-volar', 'not-installed'),
    ]))
    manager.setSearchQuery('eslint')
    const filtered = manager.getFilteredPackages()
    assert.equal(filtered.length, 1)
    assert.equal(filtered[0].info.name, 'vscode-eslint')
  })

  it('sorts packages by status', () => {
    const manager = new StateManager(appState([
      packageEntry('vscode-a', 'not-installed'),
      packageEntry('vscode-b', 'installed'),
      packageEntry('vscode-c', 'failed'),
    ]))
    manager.setSortBy('status')
    assert.deepEqual(
      manager.getFilteredPackages().map(p => p.info.name),
      ['vscode-b', 'vscode-c', 'vscode-a'],
    )
  })

  it('cycles view filters', () => {
    const manager = new StateManager(appState([packageEntry('vscode-a', 'installed')]))
    manager.cycleViewFilter()
    assert.equal(manager.getState().viewFilter, 'installed')
    manager.cycleViewFilter()
    assert.equal(manager.getState().viewFilter, 'not-installed')
    manager.cycleViewFilter()
    assert.equal(manager.getState().viewFilter, 'all')
  })

  it('collects languages and categories', () => {
    const manager = new StateManager(appState([
      packageEntry('vscode-a', 'not-installed', {
        info: packageInfo('vscode-a', { languages: ['typescript'], categories: ['linters'] }),
      }),
      packageEntry('vscode-b', 'not-installed', {
        info: packageInfo('vscode-b', { languages: ['javascript'], categories: ['linters', 'formatters'] }),
      }),
    ]))
    assert.deepEqual(manager.getLanguages(), ['javascript', 'typescript'])
    assert.deepEqual(manager.getCategories(), ['formatters', 'linters'])
  })

  it('tracks package status transitions', () => {
    const manager = new StateManager(appState([packageEntry('vscode-a', 'not-installed')]))
    manager.setPackageStatus('vscode-a', 'installing', { progress: 'downloading' })
    assert.equal(manager.getPackage('vscode-a')?.status, 'installing')
    assert.equal(manager.getPackage('vscode-a')?.progress, 'downloading')
    manager.setPackageStatus('vscode-a', 'installed')
    assert.equal(manager.getPackage('vscode-a')?.status, 'installed')
    assert.equal(manager.getPackage('vscode-a')?.progress, undefined)
  })
})
