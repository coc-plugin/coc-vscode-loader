import { Project, SourceFile } from 'ts-morph'

export interface TransformContext {
  file: SourceFile
  project: Project
}

export type Transform = (ctx: TransformContext) => void

// ---- Step type definitions ----

export interface ServerModuleConfig {
  kind: 'module'
  package: string
  entry?: 'main' | 'bin'
}

export interface ServerBinaryConfig {
  kind: 'binary'
  package: string
  binary: {
    repo: string
    asset: string
    binaryPath?: string
  }
  args?: string[]
}

export type ServerConfig = ServerModuleConfig | ServerBinaryConfig

export interface LanguageClientStep {
  type: 'language-client'
  id?: string
  server: ServerConfig
  transport?: 'ipc' | 'stdio'
  languages: string[]
  multiRoot?: boolean
}

export interface SourceStep {
  type: 'source'
  transforms: string[]
  entry?: string
  keepDeps?: string[] | Record<string, string>
  activationEvents?: string[]
}

export interface BridgeStep {
  type: 'bridge'
  preset: string
  options?: Record<string, any>
}

export interface MarkUnsupportedStep {
  type: 'mark-unsupported'
  features: string[]
}

export type ConvertStep = LanguageClientStep | SourceStep | BridgeStep | MarkUnsupportedStep

// ---- Step execution ----

export interface StepResult {
  generatedFiles: Array<{ path: string; content: string }>
  entryPoint?: string
  keepDeps: Record<string, string>
  activationEvents: string[]
  serverBinary?: {
    repo: string
    asset: string
    binaryPath?: string
    args?: string[]
  }
}

export interface StepContext {
  input: string
  output: string
  project: Project
  origPkg: Record<string, any>
  verbose?: boolean
}

export interface StepGenerator {
  type: string
  generate(ctx: StepContext, step: ConvertStep): StepResult
}

export function isLanguageClientStep(s: ConvertStep): s is LanguageClientStep {
  return s.type === 'language-client'
}

export function isSourceStep(s: ConvertStep): s is SourceStep {
  return s.type === 'source'
}

export function isBridgeStep(s: ConvertStep): s is BridgeStep {
  return s.type === 'bridge'
}

export function isMarkUnsupportedStep(s: ConvertStep): s is MarkUnsupportedStep {
  return s.type === 'mark-unsupported'
}
