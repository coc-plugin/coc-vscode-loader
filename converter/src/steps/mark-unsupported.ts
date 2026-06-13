import * as fs from 'fs'
import * as path from 'path'
import { StepGenerator, StepContext, MarkUnsupportedStep, StepResult } from '../types.js'

const FEATURE_WARNINGS: Record<string, string> = {
  'decoration': 'Decoration API is not supported in coc.nvim',
  'webview': 'Webview API is not supported in coc.nvim',
  'tree-data-provider': 'Tree data provider is not supported in coc.nvim',
  'open-external': 'env.openExternal has no equivalent in coc.nvim',
}

const FEATURE_PATTERNS: Record<string, RegExp[]> = {
  'decoration': [/createTextEditorDecorationType/g, /setDecorations/g],
  'webview': [/createWebviewPanel/g],
  'tree-data-provider': [/registerTreeDataProvider/g],
  'open-external': [/env\.openExternal/g],
}

function walkFiles(dir: string): string[] {
  const files: string[] = []
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        files.push(...walkFiles(p))
      } else if (entry.isFile()) {
        files.push(p)
      }
    }
  } catch {}
  return files
}

export const markUnsupportedGenerator: StepGenerator = {
  type: 'mark-unsupported',

  generate(ctx: StepContext, step: StepResult): StepResult {
    const ms = step as MarkUnsupportedStep
    const { output, verbose } = ctx
    const srcDir = path.join(output, 'src')

    const results: Array<{ path: string; content: string }> = []
    const appliedFeatures: string[] = []

    if (!fs.existsSync(srcDir)) return { generatedFiles: [], keepDeps: {}, activationEvents: [] }

    for (const feature of ms.features) {
      const warning = FEATURE_WARNINGS[feature]
      const patterns = FEATURE_PATTERNS[feature]
      if (!warning || !patterns) {
        if (verbose) console.warn(`  unknown feature: ${feature}`)
        continue
      }

      for (const fp of walkFiles(srcDir)) {
        if (!fp.endsWith('.ts')) continue
        let content = fs.readFileSync(fp, 'utf-8')
        let changed = false

        for (const re of patterns) {
          content = content.replace(re, (match) => {
            changed = true
            return `// [converter] ${warning}\n      // ${match}`
          })
        }

        if (changed) {
          fs.writeFileSync(fp, content)
          if (verbose) console.log(`  mark-unsupported(${feature}): ${path.relative(output, fp)}`)
        }
      }
      appliedFeatures.push(feature)
    }

    return {
      generatedFiles: results,
      keepDeps: {},
      activationEvents: [],
    }
  },
}
