import { describe, it, expect } from 'vitest'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

describe('scanner', () => {
  it('returns empty result for missing directory', async () => {
    const { scan } = await import('./scanner.js')
    const result = scan('/nonexistent/path')
    expect(result.files).toHaveLength(0)
    expect(result.summary).toContain('no source directory')
  })

  it('detects vscode imports in .ts files', async () => {
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'))
    fs.writeFileSync(path.join(tmpdir, 'ext.ts'), "import * as vscode from 'vscode'")
    const { scan } = await import('./scanner.js')
    const result = scan(tmpdir)
    expect(result.files).toHaveLength(1)
    expect(result.files[0].apis).toContain('vscode')
    expect(result.summary).toContain('1 files')
    fs.rmSync(tmpdir, { recursive: true, force: true })
  })

  it('detects require("vscode") in .ts files', async () => {
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'))
    fs.writeFileSync(path.join(tmpdir, 'ext.ts'), "const vscode = require('vscode')")
    const { scan } = await import('./scanner.js')
    const result = scan(tmpdir)
    expect(result.files).toHaveLength(1)
    expect(result.files[0].apis).toContain('vscode')
    fs.rmSync(tmpdir, { recursive: true, force: true })
  })

  it('detects vscode imports in .js files', async () => {
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'))
    fs.writeFileSync(path.join(tmpdir, 'ext.js'), "const vscode = require('vscode')")
    const { scan } = await import('./scanner.js')
    const result = scan(tmpdir)
    expect(result.files).toHaveLength(1)
    expect(result.files[0].apis).toContain('vscode')
    fs.rmSync(tmpdir, { recursive: true, force: true })
  })

  it('recurses into subdirectories', async () => {
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'))
    fs.mkdirSync(path.join(tmpdir, 'sub'))
    fs.writeFileSync(path.join(tmpdir, 'sub', 'ext.ts'), "import * as vscode from 'vscode'")
    const { scan } = await import('./scanner.js')
    const result = scan(tmpdir)
    expect(result.files).toHaveLength(1)
    expect(result.files[0].path).toContain('sub')
    fs.rmSync(tmpdir, { recursive: true, force: true })
  })

  it('skips node_modules and dot dirs', async () => {
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'))
    fs.mkdirSync(path.join(tmpdir, 'node_modules'), { recursive: true })
    fs.writeFileSync(path.join(tmpdir, 'node_modules', 'ext.ts'), "import * as vscode from 'vscode'")
    fs.mkdirSync(path.join(tmpdir, '.git'), { recursive: true })
    fs.writeFileSync(path.join(tmpdir, '.git', 'ext.ts'), "import * as vscode from 'vscode'")
    const { scan } = await import('./scanner.js')
    const result = scan(tmpdir)
    expect(result.files).toHaveLength(0)
    fs.rmSync(tmpdir, { recursive: true, force: true })
  })
})
