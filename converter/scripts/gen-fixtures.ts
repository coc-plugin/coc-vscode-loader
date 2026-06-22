// Generate correct fixture outputs
import { Project, ScriptKind } from 'ts-morph'
import * as fs from 'fs'
import * as path from 'path'
import { transformImportMapping } from '../src/transforms/import-mapping.js'
import { transformProviderRegister } from '../src/transforms/provider-register.js'

const fixturesDir = path.resolve(import.meta.dirname, '../src/__fixtures__')

function apply(transform, input, opts) {
  const project = new Project({ useInMemoryFileSystem: true })
  const fp = (opts && opts.filePath) || '/project/src/test.ts'
  const file = project.createSourceFile(fp, input, { scriptKind: ScriptKind.TS })
  transform({ file, project, pluginName: opts && opts.pluginName })
  return file.getText()
}

function writeFixture(dir, result) {
  const outputPath = path.join(fixturesDir, dir, 'output.ts')
  fs.writeFileSync(outputPath, result)
  console.log(`Updated ${dir}/output.ts`)
}

const cases = [
  {
    dir: 'import-mapping/active-text-editor',
    input: 'const editor = window.activeTextEditor\n',
  },
  {
    dir: 'import-mapping/auth-session',
    input: "const session = await authentication.getSession('github', [])\n",
  },
  {
    dir: 'import-mapping/on-did-change',
    input: 'window.onDidChangeActiveTextEditor(handler)\n',
  },
  {
    dir: 'import-mapping/set-decorations',
    input: 'editor.setDecorations(decorationType, ranges)\n',
  },
  {
    dir: 'import-mapping/show-open-dialog',
    input: "const uri = await window.showOpenDialog({ canSelectFiles: true })\n",
  },
  {
    dir: 'import-mapping/status-bar-item',
    input: "const bar = window.createStatusBarItem('my-item', StatusBarAlignment.Right, 100)\n",
  },
  {
    dir: 'import-mapping/workspace-folders-forof',
    input: 'for (const f of workspace.workspaceFolders) {\n}\n',
  },
  {
    dir: 'import-mapping/workspace-folders-index',
    input: 'const folder = workspace.workspaceFolders[0]\n',
  },
  {
    dir: 'import-mapping/multi-replace',
    input: [
      "import { workspace, window, languages } from 'vscode'",
      "const bar = window.createStatusBarItem('test', StatusBarAlignment.Right, 100)",
      'const trusted = workspace.isTrusted',
      "const action = new CodeAction('fix')",
      'const editor = window.activeTextEditor',
      'editor.setDecorations(decoration, ranges)',
      'const folder = workspace.workspaceFolders[0]',
      'return [action]',
    ].join('\n'),
  },
  {
    dir: 'provider-register/completion-with-triggers',
    input: "languages.registerCompletionItemProvider(selector, provider, '.', '\"', \"'\")\n",
    opts: { pluginName: 'my-ext', filePath: '/project/src/CompletionProvider.ts' },
  },
]

for (const c of cases) {
  const result = apply(
    c.dir.startsWith('provider') ? transformProviderRegister : transformImportMapping,
    c.input,
    c.opts
  )
  writeFixture(c.dir, result)
}
