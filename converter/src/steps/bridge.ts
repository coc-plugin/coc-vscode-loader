import { StepGenerator, StepContext, BridgeStep, StepResult } from '../types.js'

// Bridge plugins (e.g. @vue/language-server) rely on ts.server.protocol,
// which was removed in TS 7.x. Detect compatible version dynamically.
let _tsFallback: string
try {
  // Check the converter's own TypeScript — if it has ts.server, use its major version
  const ts = require('typescript')
  if (typeof ts?.server?.protocol?.CommandTypes === 'object') {
    const major = parseInt(ts.version.split('.')[0], 10)
    _tsFallback = '^' + major + '.0.0'
  } else {
    // TS 7+ removed ts.server — exclude it
    _tsFallback = '>=5.0.0 <7.0.0'
  }
} catch {
  _tsFallback = '>=5.0.0 <7.0.0'
}

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
          if (!ver && d === 'typescript') return [d, _tsFallback]
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
      if (extIds.length > 0) {
        activationCode += `\
    for (const id of ${JSON.stringify(extIds)}) {
      const ext = extensions.all.find(e => e.id === id)
      if (ext && !ext.isActive) { await ext.activate() }
    }
`
      }
      for (const svc of svcIds) {
        let varName = svc.replace(/[^a-z0-9]/gi, '_') + 'Svc'
        if (/^[0-9]/.test(varName)) varName = '_' + varName
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
        if (!ver && d === 'typescript') return [d, _tsFallback]
        return [d, ver || '*']
      })),
      activationEvents: [],
    }
    if (codeInjections.length) result.codeInjections = codeInjections
    return result
  },
}
