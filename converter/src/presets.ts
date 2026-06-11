/**
 * Bridge preset definitions.
 * Each preset describes a notification → handler → response pattern
 * that the converter uses to generate bridge code.
 */

export interface BridgePreset {
  /** Used to match presets in registry */
  name: string
  /** Notification to listen for from the language server */
  notification: string
  /** Notification to send back as response */
  responseNotification?: string
  /** Generated bridge code (template with placeholders) */
  code: string
  /** Required coc command (will be mentioned in report) */
  requiresCommand?: string
  /** Extra package.json contributions */
  packageContributes?: Record<string, any>
  /** Extra dependencies */
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

export function getPreset(name: string): BridgePreset | undefined {
  return PRESETS[name]
}

export function getActivePresets(hasTsBridge: boolean, result: any): BridgePreset[] {
  const presets: BridgePreset[] = []
  if (hasTsBridge) {
    const preset = getPreset('ts-bridge')
    if (preset) presets.push(preset)
  }
  return presets
}

export function generateBridgeCode(presets: BridgePreset[]): string {
  return presets.map(p => p.code).join('\n\n')
}
