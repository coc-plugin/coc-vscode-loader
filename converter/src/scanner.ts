import * as fs from 'fs'
import * as path from 'path'

export interface ScanResult {
  files: ScannedFile[]
  hasTsBridge: boolean
  hasDecoration: boolean
  hasWebview: boolean
  summary: string
}

export interface ScannedFile {
  path: string
  apis: string[]
  actions: string[]
}

const UNSUPPORTED_PATTERNS = [
  { pattern: 'createTextEditorDecorationType', action: 'mark-unsupported', label: 'decoration API' },
  { pattern: 'setDecorations', action: 'mark-unsupported', label: 'decoration API' },
  { pattern: 'createWebviewPanel', action: 'mark-unsupported', label: 'webview API' },
  { pattern: 'registerTreeDataProvider', action: 'mark-unsupported', label: 'tree data provider' },
  { pattern: 'window.showInputBox', action: 'needs-rewrite', label: 'use requestInput instead' },
  { pattern: 'env.openExternal', action: 'mark-unsupported', label: 'no equivalent' },
  { pattern: 'showOpenDialog', action: 'mark-unsupported', label: 'no equivalent' },
  { pattern: 'showSaveDialog', action: 'mark-unsupported', label: 'no equivalent' },
]

const TS_BRIDGE_PATTERNS = [
  'tsserver/request',
  'tsserver/response',
  '_vue:',
  'typescript.tsserverRequest',
]

export function scan(dir: string): ScanResult {
  const files: ScannedFile[] = []
  let hasTsBridge = false
  let hasDecoration = false
  let hasWebview = false

  const tsFiles = walk(dir).filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))

  for (const filePath of tsFiles) {
    const content = fs.readFileSync(filePath, 'utf-8')
    const apis: string[] = []
    const actions: string[] = []
    const relative = path.relative(dir, filePath)

    // Check for vscode imports
    if (content.includes("from 'vscode'") || content.includes('from "vscode"') || content.includes('require("vscode")')) {
      apis.push('vscode')
    }

    // Check for unsupported patterns
    for (const { pattern, action, label } of UNSUPPORTED_PATTERNS) {
      if (content.includes(pattern)) {
        apis.push(label)
        actions.push(action)
        if (action === 'mark-unsupported') {
          if (label.includes('decoration')) hasDecoration = true
          if (label.includes('webview')) hasWebview = true
        }
      }
    }

    // Check for TS bridge
    for (const pattern of TS_BRIDGE_PATTERNS) {
      if (content.includes(pattern)) {
        hasTsBridge = true
        apis.push('tsserver bridge')
        break
      }
    }

    // Check for LanguageClient
    if (content.includes('LanguageClient')) {
      apis.push('LanguageClient')
    }

    // Check for typescriptServerPlugins in package.json
    if (relative === 'package.json' || filePath.endsWith('package.json')) {
      if (content.includes('typescriptServerPlugins')) {
        hasTsBridge = true
        apis.push('typescriptServerPlugins')
      }
    }

    if (apis.length > 0) {
      files.push({ path: relative, apis, actions })
    }
  }

  // Read package.json
  const pkgPath = path.join(dir, 'package.json')
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    const apis: string[] = []
    if (pkg.contributes?.typescriptServerPlugins) {
      hasTsBridge = true
      apis.push('typescriptServerPlugins')
    }
    if (pkg.activationEvents) {
      apis.push(`activationEvents: ${pkg.activationEvents.length}`)
    }
    if (apis.length > 0) {
      files.push({ path: 'package.json', apis, actions: [] })
    }
  }

  return {
    files,
    hasTsBridge,
    hasDecoration,
    hasWebview,
    summary: [
      `found ${files.length} files with vscode API`,
      hasTsBridge ? ', ts-bridge detected' : '',
      hasDecoration ? ', decoration API (marked)' : '',
      hasWebview ? ', webview API (marked)' : '',
    ].join(''),
  }
}

function walk(dir: string): string[] {
  const files: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      files.push(...walk(p))
    } else if (entry.isFile()) {
      files.push(p)
    }
  }
  return files
}
