import { StepGenerator, StepContext, ConvertStep, StepResult } from '../types.js'
import { languageClientGenerator } from './language-client.js'
import { sourceGenerator } from './source.js'
import { bridgeGenerator } from './bridge.js'
import { markUnsupportedGenerator } from './mark-unsupported.js'

const REGISTRY: Record<string, StepGenerator> = {}

export function registerGenerator(g: StepGenerator): void {
  REGISTRY[g.type] = g
}

export function getRegisteredStepTypes(): string[] {
  return Object.keys(REGISTRY)
}

export function executeStep(ctx: StepContext, step: ConvertStep): StepResult {
  const gen = REGISTRY[step.type]
  if (!gen) {
    throw new Error(`Unknown step type: "${step.type}". Available: ${Object.keys(REGISTRY).join(', ')}`)
  }
  return gen.generate(ctx, step)
}

// Register built-in generators
registerGenerator(languageClientGenerator)
registerGenerator(sourceGenerator)
registerGenerator(bridgeGenerator)
registerGenerator(markUnsupportedGenerator)
