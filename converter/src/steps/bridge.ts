import { StepGenerator, StepContext, BridgeStep, StepResult } from '../types.js'

/**
 * Safe, audited bridge code generators.
 * Registry presets can only reference these types — no arbitrary code execution.
 */
interface BridgeTemplateResult {
  code: string
  injectExts: string[]
  injectSvcs: string[]
  callAfter: string | null
  extraDeps: string[]
}

const BRIDGE_TEMPLATES: Record<string, (opts: any) => BridgeTemplateResult> = {
  'tsserver-forward': (opts) => {
    const command = opts.command || 'typescript.tsserverRequest'
    return {
      code: `\
    client.onNotification('tsserver/request', async ([seq, command, args]: [number, string, any]) => {
      try {
        const result = await commands.executeCommand<any>('${command}', command, args, { isAsync: true, lowPriority: true })
        client.sendNotification('tsserver/response', [seq, result?.body])
      } catch { client.sendNotification('tsserver/response', [seq, undefined]) }
    })`,
      injectExts: opts.extensions || [],
      injectSvcs: opts.services || [],
      callAfter: 'registerBridge(context, client)',
      extraDeps: ['typescript'],
    }
  },
}

export function getRegisteredBridgeTypes(): string[] {
  return Object.keys(BRIDGE_TEMPLATES)
}

export const bridgeGenerator: StepGenerator = {
  type: 'bridge',

  generate(ctx: StepContext, step: any): StepResult {
    const bs = step as BridgeStep

    // Resolve preset config from registry
    let type: string
    let opts: Record<string, any>
    if (bs.preset) {
      const presetDef = ctx.presets?.[bs.preset]
      if (!presetDef) {
        throw new Error(`Unknown bridge preset: "${bs.preset}". Check presets.json in registry.`)
      }
      type = presetDef.type || ''
      opts = { ...presetDef.options, ...(bs.options || {}) }
    } else {
      type = ''
      opts = bs.options || {}
    }

    // Look up safe template
    const template = BRIDGE_TEMPLATES[type]
    if (!template) {
      throw new Error(`Unknown bridge type: "${type}". Available types: ${Object.keys(BRIDGE_TEMPLATES).join(', ')}`)
    }

    const generated = template(opts)
    let code = generated.code

    if (bs.verbose) {
      code = `\
    console.log('[bridge] registerBridge called')
    client.onReady().then(() => console.log('[bridge] client ready')).catch(e => console.log('[bridge] client error:', e.message))
${code}`
    }

    const extIds = generated.injectExts || []
    const svcIds = generated.injectSvcs || []
    const callAfter = generated.callAfter
    const isStandalone = !callAfter && extIds.length === 0 && svcIds.length === 0

    if (isStandalone) {
      // Standalone preset (e.g. prettier): generate entry point directly
      const moduleContent = `\
import { ExtensionContext, languages, Range, TextEdit, Uri, window, workspace } from 'coc.nvim'

export async function activate(context: ExtensionContext): Promise<void> {
${code}
}
`
      return {
        generatedFiles: [{ path: 'src/index.ts', content: moduleContent }],
        entryPoint: 'src/index.ts',
        keepDeps: Object.fromEntries((generated.extraDeps || []).map((d: string) => {
          const ver = ctx.origPkg.dependencies?.[d] || ctx.origPkg.devDependencies?.[d]
          return [d, ver || '*']
        })),
        activationEvents: ['*'],
      }
    }

    // Generate the bridge module (for tsserver-forward etc)
    const moduleContent = `\
import { commands, ExtensionContext } from 'coc.nvim'

export function registerBridge(context: ExtensionContext, client: any): void {
${code}
}
`

    // Build code injections
    const codeInjections: StepResult['codeInjections'] = []

    if (callAfter) {
      codeInjections.push({
        target: 'src/index.ts',
        importCode: `import { registerBridge } from './bridge'`,
        insertBefore: `  } catch (e: any) {`,
        code: `    ${callAfter}\n`,
      })
    }

    if (extIds.length || svcIds.length) {
      let activationCode = ''
      for (const extId of extIds) {
        const varName = extId.replace(/[^a-z0-9]/gi, '_')
        activationCode += `\
    const ${varName} = extensions.all.find(e => e.id === '${extId}')
    if (${varName} && !${varName}.isActive) { await ${varName}.activate() }
`
      }
      for (const svc of svcIds) {
        const varName = svc.replace(/[^a-z0-9]/gi, '_') + 'Svc'
        activationCode += `\
    const ${varName} = services.getService('${svc}')
    if (${varName}) { await ${varName}.start() }
`
      }
      if (activationCode) {
        codeInjections.push({
          target: 'src/index.ts',
          insertAfter: 'try {\n',
          code: activationCode,
        })
      }
      codeInjections.push({
        target: 'src/index.ts',
        importCode: `  extensions,`,
        insertBefore: `} from 'coc.nvim'`,
        code: '',
      })
    }

    const result: StepResult = {
      generatedFiles: [{ path: 'src/bridge.ts', content: moduleContent }],
      entryPoint: undefined,
      keepDeps: Object.fromEntries((generated.extraDeps || []).map((d: string) => {
        const ver = ctx.origPkg.dependencies?.[d] || ctx.origPkg.devDependencies?.[d]
        return [d, ver || '*']
      })),
      activationEvents: [],
    }
    if (codeInjections.length) result.codeInjections = codeInjections
    return result
  },
}
