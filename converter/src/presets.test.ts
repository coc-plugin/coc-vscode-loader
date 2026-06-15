import { describe, it, expect } from 'vitest'

describe('presets', () => {
  it('getPreset returns ts-bridge preset', async () => {
    const { getPreset } = await import('./presets.js')
    const preset = getPreset('ts-bridge')
    expect(preset).toBeTruthy()
    expect(preset!.name).toBe('ts-bridge')
    expect(preset!.notification).toBe('tsserver/request')
    expect(preset!.extraDeps).toContain('typescript')
  })

  it('getPreset returns undefined for unknown preset', async () => {
    const { getPreset } = await import('./presets.js')
    expect(getPreset('nonexistent')).toBeUndefined()
  })

  it('getActivePresets returns ts-bridge when hasTsBridge is true', async () => {
    const { getActivePresets } = await import('./presets.js')
    const presets = getActivePresets(true, {})
    expect(presets).toHaveLength(1)
    expect(presets[0].name).toBe('ts-bridge')
  })

  it('getActivePresets returns empty when hasTsBridge is false', async () => {
    const { getActivePresets } = await import('./presets.js')
    expect(getActivePresets(false, {})).toEqual([])
  })

  it('generateBridgeCode joins preset codes', async () => {
    const { generateBridgeCode, getPreset } = await import('./presets.js')
    const preset = getPreset('ts-bridge')!
    const code = generateBridgeCode([preset, preset])
    expect(code).toContain('tsserver')
    expect(code).toContain('\n\n')
  })
})
