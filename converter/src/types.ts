import { Project, SourceFile } from 'ts-morph'

export interface TransformContext {
  file: SourceFile
  project: Project
  /** Plugin name from origPkg (for transforms that need it) */
  pluginName?: string
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
  /** Arguments to pass to the server process.
   *  Use `{dir}` placeholder for the compiled output directory (__dirname at runtime). */
  args?: string[]
  /** Post-compilation text patches for server output files.
   *  Applied after tsc compiles the server TypeScript.
   *  file: relative path from server/out/ (e.g. "eslintServer.js")
   *  find: regex pattern (unescaped, used as `new RegExp(find, 'g')`)
   *  replace: replacement text */
  patches?: Array<{ file: string; find: string; replace: string }>
}

export interface ServerBinaryConfig {
  kind: 'binary'
  package: string
  binary: {
    repo: string
    asset: string
    binaryPath?: string
    /** Per-platform/arch asset overrides. Each entry specifies file + binaryPath for matching platform/arch.
     *  When present, overrides the top-level asset/binaryPath for matching platform.
     *  platform/arch default to "*" (matches any). */
    targetAssets?: Array<{
      platform?: string   // "darwin" | "linux" | "win32"
      arch?: string       // "x64" | "arm64"
      file: string        // asset filename template (supports {{version}}, {{platform}}, {{arch}}, etc.)
      binaryPath?: string // relative path inside archive
    }>
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
  /** Extra options passed as initializationOptions to LanguageClient (JS object expression, inserted as-is) */
  initializationOptions?: string
  /** When false, omit synchronize config (disables coc.nvim auto config sync).
   *  Default: true (synchronize section generated) */
  syncConfig?: boolean
  /** Auto-append () on function/method completion items.
   *  Uses LanguageClient middleware to patch insertText/textEdit.
   *  Default: true */
  autoParentheses?: boolean
}

export interface SourceStep {
  type: 'source'
  transforms: string[]
  entry?: string
  keepDeps?: string[] | Record<string, string>
  activationEvents?: string[]
  /** Plugin-specific text find/replace pairs applied after all transforms */
  patches?: Array<{ find: string; replace: string }>
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

export interface SnippetsStep {
  type: 'snippets'
  /** Optional: override languages to generate (default: read from source package.json's contributes.snippets) */
  languages?: string[]
  /** Optional: build command to run in source dir before collecting snippet files (e.g. "node merge.js") */
  build?: string
}

export type ConvertStep = LanguageClientStep | SourceStep | BridgeStep | MarkUnsupportedStep | SnippetsStep

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
    targetAssets?: Array<{
      platform?: string
      arch?: string
      file: string
      binaryPath?: string
    }>
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
