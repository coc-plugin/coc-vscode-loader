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
  /** When entry is 'bin', pick a specific bin entry by name (e.g. "tailwindcss-language-server").
   *  Defaults to the first entry in the bin object. */
  binName?: string
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
  /** Enable debug logging in generated code */
  verbose?: boolean
}

export interface SourceStep {
  type: 'source'
  transforms: string[]
  entry?: string
  keepDeps?: string[] | Record<string, string>
  activationEvents?: string[]
  /** Enable debug logging in generated/transformed code */
  verbose?: boolean
}

export interface BridgeStep {
  type: 'bridge'
  preset?: string
  /** Override preset options (extensions, services, etc.) */
  options?: {
    extensions?: string[]
    services?: string[]
  }
  /** Enable debug logging in generated bridge code */
  verbose?: boolean
}

export interface MarkUnsupportedStep {
  type: 'mark-unsupported'
  features: string[]
  /** Enable detailed output during conversion */
  verbose?: boolean
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
  /** Code to inject into previously generated files (target path, code to insert, insertion point) */
  codeInjections?: Array<{
    target: string        // file to modify (e.g. 'src/index.ts')
    importCode?: string   // import line to add at top
    insertBefore?: string // regex pattern to insert code before
    insertAfter?: string  // regex pattern to insert code after
    code: string          // code to insert
  }>
}

export interface StepContext {
  input: string
  output: string
  project: Project
  origPkg: Record<string, any>
  verbose?: boolean
  /** Preset definitions from registry (e.g. bridge presets) */
  presets?: Record<string, any>
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
