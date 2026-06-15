import { describe, it, expect } from 'vitest'

describe('language-client step', () => {
  it('generates valid index.ts for module-kind server', async () => {
    const { languageClientGenerator } = await import('./language-client.js')
    const result = languageClientGenerator.generate(
      {
        input: '/fake',
        output: '/fake/out',
        origPkg: { name: 'test-ls', description: 'Test LS' },
        project: null as any,
      },
      {
        type: 'language-client',
        server: { kind: 'module', package: 'test-language-server', entry: 'main' },
        languages: ['test'],
      },
    )

    expect(result.entryPoint).toBe('src/index.ts')
    expect(result.generatedFiles).toHaveLength(1)
    expect(result.generatedFiles[0].path).toBe('src/index.ts')

    const code = result.generatedFiles[0].content
    expect(code).toContain('LanguageClient')
    expect(code).toContain("from 'coc.nvim'")
    expect(code).toContain('test-language-server')
    expect(code).toContain('activate')
    expect(code).toContain('context.subscriptions.push')
  })

  it('generates binary server download code for binary-kind server', async () => {
    const { languageClientGenerator } = await import('./language-client.js')
    const result = languageClientGenerator.generate(
      {
        input: '/fake',
        output: '/fake/out',
        origPkg: { name: 'binary-ls', description: 'Binary LS' },
        project: null as any,
      },
      {
        type: 'language-client',
        server: {
          kind: 'binary',
          package: 'my-server',
          binary: { repo: 'user/repo', asset: 'server-{{version}}-{{platform}}-{{arch}}.tar.gz', binaryPath: 'bin/server' },
        },
        languages: ['test'],
      },
    )

    // Binary config is stored in result.serverBinary, not embedded in code
    expect(result.serverBinary).toBeTruthy()
    expect(result.serverBinary!.repo).toBe('user/repo')

    const code = result.generatedFiles[0].content
    expect(code).toContain('LanguageClient')
    expect(code).toContain("from 'coc.nvim'")
    expect(code).toContain('require.resolve')
    expect(code).toContain("'bin/server'")
  })

  it('generates stdio transport for binary kind', async () => {
    const { languageClientGenerator } = await import('./language-client.js')
    const result = languageClientGenerator.generate(
      {
        input: '/fake',
        output: '/fake/out',
        origPkg: { name: 'stdio-ls' },
        project: null as any,
      },
      {
        type: 'language-client',
        server: { kind: 'binary', package: 'bin-ls', binary: { repo: 'user/repo', asset: 'bin-{{version}}.tar.gz' } },
        languages: ['test'],
        transport: 'stdio',
      },
    )

    const code = result.generatedFiles[0].content
    // Binary kind with stdio uses command: serverPath (Executable options), not module+TransportKind
    // TransportKind is only used for module kind where { module, transport } is set
    expect(code).toContain("command: serverPath")
    expect(code).not.toContain('TransportKind.ipc')
  })

  it('includes initializationOptions when configured', async () => {
    const { languageClientGenerator } = await import('./language-client.js')
    const result = languageClientGenerator.generate(
      {
        input: '/fake',
        output: '/fake/out',
        origPkg: { name: 'init-ls' },
        project: null as any,
      },
      {
        type: 'language-client',
        server: { kind: 'module', package: 'init-ls-server' },
        languages: ['test'],
        initializationOptions: '{ typescript: { tsdk: serverPath } }',
      },
    )

    const code = result.generatedFiles[0].content
    expect(code).toContain('initializationOptions')
    expect(code).toContain('tsdk: serverPath')
  })

  it('uses custom id for LanguageClient name', async () => {
    const { languageClientGenerator } = await import('./language-client.js')
    const result = languageClientGenerator.generate(
      {
        input: '/fake',
        output: '/fake/out',
        origPkg: { name: 'default-name' },
        project: null as any,
      },
      {
        type: 'language-client',
        id: 'my-custom-id',
        server: { kind: 'module', package: 'some-server' },
        languages: ['test'],
      },
    )

    const code = result.generatedFiles[0].content
    expect(code).toContain("'my-custom-id'")
    // The description/command still use origPkg name, only the id is custom
    expect(code).toContain("'default-name'")
  })
})
