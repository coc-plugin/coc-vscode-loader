import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

interface RegistryEntry {
  name: string
  displayName: string
  description: string
  type: string
  source: { type: string; repo?: string; package?: string; subdir?: string }
  url: string
  languages: string[]
  categories: string[]
  convert: any[]
  minPluginVersion?: string
}

describe('registry.json validation', () => {
  const registryPath = path.resolve(__dirname, '../../coc-vscode-registry/registry.json')
  let entries: RegistryEntry[]

  beforeAll(() => {
    const content = fs.readFileSync(registryPath, 'utf-8')
    entries = JSON.parse(content) as RegistryEntry[]
  })

  it('is valid JSON and non-empty', () => {
    expect(entries.length).toBeGreaterThan(0)
  })

  it('every entry has required fields', () => {
    for (const e of entries) {
      expect(e.name).toBeTruthy()
      expect(e.displayName).toBeTruthy()
      expect(e.description).toBeTruthy()
      expect(e.type).toBeTruthy()
      expect(e.languages).toBeInstanceOf(Array)
      expect(e.categories).toBeInstanceOf(Array)
      expect(e.convert).toBeInstanceOf(Array)
      expect(e.convert.length).toBeGreaterThan(0)
    }
  })

  it('every entry has valid type', () => {
    const validTypes = ['ts-bridge', 'pure-lsp', 'direct-api', 'snippets', 'lsp']
    for (const e of entries) {
      expect(validTypes).toContain(e.type)
    }
  })

  it('every entry has valid source', () => {
    const validSourceTypes = ['github', 'npm']
    for (const e of entries) {
      expect(validSourceTypes).toContain(e.source.type)
      if (e.source.type === 'github') {
        expect(e.source.repo).toBeTruthy()
      } else if (e.source.type === 'npm') {
        expect(e.source.package).toBeTruthy()
      }
    }
  })

  it('every convert step has a known type', () => {
    const knownStepTypes = ['source', 'language-client', 'bridge', 'snippets', 'mark-unsupported']
    for (const e of entries) {
      for (const step of e.convert) {
        expect(knownStepTypes).toContain(step.type)
      }
    }
  })

  it('language-server steps have valid server config', () => {
    for (const e of entries) {
      for (const step of e.convert) {
        if (step.type === 'language-client') {
          expect(step.server).toBeTruthy()
          expect(['module', 'binary']).toContain(step.server.kind)
          expect(step.server.package).toBeTruthy()
          expect(step.languages).toBeInstanceOf(Array)
        }
      }
    }
  })

  it('snippets entries have type "snippets"', () => {
    const snippetsEntries = entries.filter(e => e.convert.some(s => s.type === 'snippets'))
    for (const e of snippetsEntries) {
      expect(e.type).toBe('snippets')
    }
  })

  it('no duplicate names', () => {
    const names = entries.map(e => e.name)
    const unique = new Set(names)
    expect(unique.size).toBe(names.length)
  })

  it('descriptions are non-empty', () => {
    for (const e of entries) {
      expect(e.description.length).toBeGreaterThan(0)
    }
  })

  it('every entry has at least one language', () => {
    for (const e of entries) {
      expect(e.languages.length).toBeGreaterThan(0)
    }
  })

  it('minPluginVersion is valid semver if present', () => {
    const semverRe = /^\d+\.\d+\.\d+/
    for (const e of entries) {
      if (e.minPluginVersion) {
        expect(e.minPluginVersion).toMatch(semverRe)
      }
    }
  })

  it('bridge entries have bridge step with preset', () => {
    const bridgeEntries = entries.filter(e => e.type === 'ts-bridge')
    for (const e of bridgeEntries) {
      const bridgeStep = e.convert.find(s => s.type === 'bridge')
      expect(bridgeStep).toBeTruthy()
      expect(bridgeStep!.preset).toBeTruthy()
    }
  })
})
