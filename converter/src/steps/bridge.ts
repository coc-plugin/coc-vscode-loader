import { StepGenerator, StepContext, BridgeStep, StepResult } from '../types.js'

interface BridgePreset {
  name: string
  notification: string
  responseNotification?: string
  code: string
  requiresCommand?: string
  extraDeps?: string[]
}

const PRESETS: Record<string, BridgePreset> = {
  'ts-bridge': {
    name: 'ts-bridge',
    notification: 'tsserver/request',
    responseNotification: 'tsserver/response',
    requiresCommand: 'typescript.tsserverRequest',
    extraDeps: ['typescript'],
    code: `\
    // tsserver bridge: forward TypeScript requests from language server
    client.onNotification('tsserver/request', async ([seq, command, args]: [number, string, any]) => {
      try {
        const result = await commands.executeCommand<any>('typescript.tsserverRequest', command, args, { isAsync: true, lowPriority: true })
        client.sendNotification('tsserver/response', [seq, result?.body])
      } catch { client.sendNotification('tsserver/response', [seq, undefined]) }
    })`,
  },
}

export function getRegisteredPresets(): string[] {
  return Object.keys(PRESETS)
}

export const bridgeGenerator: StepGenerator = {
  type: 'bridge',

  generate(ctx: StepContext, step: StepResult): StepResult {
    const bs = step as BridgeStep
    const preset = PRESETS[bs.preset]

    if (!preset) {
      throw new Error(`Unknown bridge preset: "${bs.preset}". Available: ${Object.keys(PRESETS).join(', ')}`)
    }

    const code = preset.code

    // Generate a bridge module that exports the code to be injected
    const content = `\
import { commands, ExtensionContext } from 'coc.nvim'

export function registerBridge(context: ExtensionContext, client: any): void {
${code}
}
`

    return {
      generatedFiles: [{ path: 'src/bridge.ts', content }],
      entryPoint: undefined,
      keepDeps: Object.fromEntries((preset.extraDeps || []).map(d => {
        const ver = ctx.origPkg.dependencies?.[d] || ctx.origPkg.devDependencies?.[d]
        return [d, ver || '*']
      })),
      activationEvents: [],
    }
  },
}
