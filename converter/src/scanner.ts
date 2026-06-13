import * as fs from 'fs'
import * as path from 'path'

export interface ScanResult {
  files: ScannedFile[]
  summary: string
}

export interface ScannedFile {
  path: string
  apis: string[]
}

export function scan(dir: string): ScanResult {
  const files: ScannedFile[] = []
  const tsFiles = walk(dir).filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))

  for (const filePath of tsFiles) {
    const content = fs.readFileSync(filePath, 'utf-8')
    const apis: string[] = []
    const relative = path.relative(dir, filePath)

    if (content.includes("from 'vscode'") || content.includes('from "vscode"') || content.includes('require("vscode")')) {
      apis.push('vscode')
    }

    if (apis.length > 0) {
      files.push({ path: relative, apis })
    }
  }

  return {
    files,
    summary: `found ${files.length} files with vscode API`,
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
