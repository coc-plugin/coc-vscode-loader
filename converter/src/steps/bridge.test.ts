import { describe, it, expect } from 'vitest'

describe('bridge step', () => {
  it('throws on unknown preset', async () => {
    const { bridgeGenerator } = await import('./bridge.js')
    expect(() => {
      bridgeGenerator.generate(
        { input: '/fake', output: '/fake/out', origPkg: {}, project: null as any, presets: {} },
        { type: 'bridge', preset: 'nonexistent' },
      )
    }).toThrow('Unknown bridge preset')
  })

  it('throws on empty type without preset', async () => {
    const { bridgeGenerator } = await import('./bridge.js')
    expect(() => {
      bridgeGenerator.generate(
        { input: '/fake', output: '/fake/out', origPkg: {}, project: null as any },
        { type: 'bridge', options: {} },
      )
    }).toThrow('Unknown bridge type')
  })

  it('generates tsserver-forward bridge with preset', async () => {
    const { bridgeGenerator } = await import('./bridge.js')
    const result = bridgeGenerator.generate(
      {
        input: '/fake',
        output: '/fake/out',
        origPkg: { name: 'test', dependencies: { typescript: '^5.0.0' } },
        project: null as any,
        presets: {
          'ts-bridge': {
            type: 'tsserver-forward',
            options: { extensions: ['vue'], services: ['typescript'] },
          },
        },
      },
      { type: 'bridge', preset: 'ts-bridge' },
    )

    expect(result.generatedFiles).toHaveLength(1)
    expect(result.generatedFiles[0].path).toBe('src/bridge.ts')
    expect(result.generatedFiles[0].content).toContain('registerBridge')
    expect(result.generatedFiles[0].content).toContain('tsserver/request')

    expect(result.keepDeps).toHaveProperty('typescript')
    expect(result.keepDeps.typescript).toBe('^5.0.0')

    expect(result.codeInjections).toBeDefined()
    expect(result.codeInjections!.length).toBeGreaterThan(0)
    expect(result.codeInjections![0].target).toBe('src/index.ts')
  })

  it('includes verbose logging when enabled', async () => {
    const { bridgeGenerator } = await import('./bridge.js')
    const result = bridgeGenerator.generate(
      {
        input: '/fake',
        output: '/fake/out',
        origPkg: { name: 'test', dependencies: { typescript: '*' } },
        project: null as any,
        presets: { 'ts-bridge': { type: 'tsserver-forward' } },
      },
      { type: 'bridge', preset: 'ts-bridge', options: {}, verbose: true },
    )

    const code = result.generatedFiles[0].content
    expect(code).toContain('[bridge] registerBridge called')
    expect(code).toContain('[bridge] client ready')
  })
})
