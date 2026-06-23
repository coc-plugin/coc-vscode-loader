import { Transform } from '../types.js'

/**
 * Replace a function call and its arguments, handling balanced parentheses.
 * Calls fn(name) with the full match text up to the closing paren, returns replacement.
 */
function replaceBalanced(
  content: string,
  prefix: RegExp,
  fn: (fullCall: string, matchLen: number) => string,
): string {
  const re = new RegExp(prefix.source, 'g')
  let result = ''
  let lastIdx = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    let depth = 1
    let i = m.index + m[0].length
    while (i < content.length && depth > 0) {
      if (content[i] === '(') depth++
      else if (content[i] === ')') depth--
      i++
    }
    const fullCall = content.slice(m.index, i)
    result += content.slice(lastIdx, m.index) + fn(fullCall, m[0].length)
    lastIdx = i
  }
  return result + content.slice(lastIdx)
}

/**
 * Replace `from 'vscode'` with `from 'coc.nvim'`,
 * and apply name remapping for known API differences.
 */
const MAPPINGS: Record<string, string> = {
  // namespace (module specifier is rewritten by AST, keep identifier as-is)

  // naming differences
  'EventEmitter': 'Emitter',
  'Disposable': 'Disposable',
  'StatusBarAlignment': '(void 0) as any',

  // function/method renames
  'getExtension': 'getExtensionById',
  'registerReferenceProvider': 'registerReferencesProvider',
  'registerCodeActionsProvider': 'registerCodeActionProvider',
  'registerColorProvider': 'registerDocumentColorProvider',
  'registerDocumentFormattingEditProvider': 'registerDocumentFormatProvider',
  'registerDocumentRangeFormattingEditProvider': 'registerDocumentRangeFormatProvider',
}

export const transformImportMapping: Transform = (ctx) => {
  const { file } = ctx

  // Rewrite import declarations
  try {
    file.getImportDeclarations().forEach(decl => {
      const mod = decl.getModuleSpecifierValue()
      if (mod === 'vscode') {
        decl.setModuleSpecifier('coc.nvim')
      }
    })
  } catch {}

  // Rewrite named references
  try {
    file.getDescendantsOfKind(80 /* Identifier */).forEach(node => {
      const text = node.getText()
      if (Object.prototype.hasOwnProperty.call(MAPPINGS, text)) {
        const mapped = MAPPINGS[text]
        if (mapped !== text) {
          const parent = node.getParent()
          if (parent && parent.getKindName() !== 'StringLiteral') {
            node.replaceWithText(mapped)
          }
        }
      }
    })
  } catch {}

  // Replace CodeActionKind.SourceFixAll.append('xxx') with string literal
  try {
    file.getDescendantsOfKind(214 /* CallExpression */).forEach(node => {
      const text = node.getText()
      const match = text.match(/^CodeActionKind\.SourceFixAll\.append\(['"](.+)['"]\)$/)
      if (match) {
        node.replaceWithText(`'source.fixAll.${match[1]}'`)
      }
    })
  } catch {}

  // Text-level replacements for coc.nvim API differences

  // Convert require('vscode') to require('coc.nvim') (JS-style imports)
  let content = file.getText()
  let newContent = content.replace(
    /require\(['"]vscode['"]\)/g,
    "require('coc.nvim')",
  )

  // Convert dynamic import('vscode') to require('coc.nvim') (CJS sandbox)
  // Handle .then() with balanced parens (supports nested parens in callback)
  newContent = replaceBalanced(
    newContent,
    /await\s+import\(['"]vscode['"]\)\s*\.then\s*\(/,
    () => "require('coc.nvim')",
  )
  // await import('vscode') without .then()
  newContent = newContent.replace(
    /await\s+import\(['"]vscode['"]\)/g,
    "require('coc.nvim')",
  )
  // Bare import('vscode').then(...) (no await) — balanced parens
  newContent = replaceBalanced(
    newContent,
    /(?<!\w)\bimport\(['"]vscode['"]\)\s*\.then\s*\(/,
    () => "require('coc.nvim')",
  )
  // Bare import('vscode') without .then()
  newContent = newContent.replace(
    /(?<!\w)\bimport\(['"]vscode['"]\)/g,
    "require('coc.nvim')",
  )
  // General dynamic import → require (CJS sandbox doesn't support import())
  // Must be after vscode-specific replacements to avoid double-processing
  newContent = newContent.replace(
    /await\s+import\(/g,
    'require(',
  )
  // Bare import(...) (no await) → require(...)
  newContent = newContent.replace(
    /(?<!\w)\bimport\(/g,
    'require(',
  )
  // Fix typeof require(...) → typeof import(...) (typeof import is valid TS type syntax)
  newContent = newContent.replace(/typeof\s+require\(/g, 'typeof import(')
  // Fix require('coc.nvim').Type → import('coc.nvim').Type (dynamic import type syntax)
  // This restores TS type expressions like `scope?: import("vscode").Uri` that became invalid `require()`
  newContent = newContent.replace(
    /require\(['"]coc\.nvim['"]\)\.(\w+)/g,
    "import('coc.nvim').$1"
  )

  // Convert createStatusBarItem(name, alignment, priority) → createStatusBarItem(priority)
  // Use balanced paren to handle nested calls in name argument
  newContent = replaceBalanced(newContent, /createStatusBarItem\(/, (call) => {
    // Find the second comma (between alignment and priority) by tracking paren depth
    let depth = 0
    let commas = 0
    for (let i = 'createStatusBarItem('.length; i < call.length; i++) {
      if (call[i] === '(') depth++
      else if (call[i] === ')') depth--
      else if (call[i] === ',' && depth === 0) {
        commas++
        if (commas === 2) {
          return 'createStatusBarItem(' + call.slice(i + 1)
        }
      }
    }
    return call // fallback: return as-is
  })

  // Replace LanguageStatusSeverity.xxx → 2
  newContent = newContent.replace(
    /LanguageStatusSeverity\.\w+/g,
    '2',
  )

  // Replace StatusBar with a no-op mock so formatting works without status UI
  // Match with or without constructor arguments (VS Code: new StatusBar(alignment, priority))
  newContent = newContent.replace(
    /new\s+StatusBar\([^)]*\)/g,
    'new (class { update(){} hide(){} updateConfig(){} dispose(){} } as any)()',
  )

  // Treat all workspaces as trusted (coc.nvim doesn't have workspace.isTrusted)
  newContent = newContent.replace(
    /workspace\.isTrusted/g,
    'true',
  )

  // Wrap new CodeAction() in try-catch (coc.nvim may not have CodeAction)
  newContent = replaceBalanced(newContent, /new\s+CodeAction\(/, (fullCall, matchLen) => {
    const inner = fullCall.slice(matchLen, -1)
    return `((() => { try { return new CodeAction(${inner}) } catch { return { title: '', kind: '' } as any } })())`
  })

  // window.createOutputChannel works in coc.nvim (workspace variant is deprecated)
  // no replacement needed

  // Polyfill window.activeTextEditor (VS Code API, not in coc.nvim)
  if (newContent.includes('window.activeTextEditor')) {
    newContent = `\
import { workspace } from 'coc.nvim'
if (typeof window !== 'undefined' && !('activeTextEditor' in window)) {
  try {
    Object.defineProperty(window, 'activeTextEditor', {
      get() {
        try {
          var doc = typeof workspace !== 'undefined' ? workspace.getDocument() : undefined;
          return doc ? { document: doc } : undefined;
        } catch(e) { return undefined }
      },
      configurable: true,
    });
  } catch {}
}
` + newContent
  }

  // window.onDidChangeActiveTextEditor → workspace.onDidOpenTextDocument
  newContent = newContent.replace(/window\.onDidChangeActiveTextEditor/g, 'workspace.onDidOpenTextDocument')

  // languages.createLanguageStatusItem → no-op (coc.nvim doesn't have this)
  newContent = replaceBalanced(newContent, /(?:vscode\.)?languages\.createLanguageStatusItem\(/, () =>
    '({ dispose(){}, text: "", command: void 0, name: "", accessibilityInformation: void 0, severity: void 0 }) as any'
  )

  // languages.match → no-op (not available in coc.nvim, assume match)
  newContent = replaceBalanced(newContent, /(?:vscode\.)?languages\.match\(/, () =>
    '1 /* languages.match not in coc */ '
  )

  // window.showOpenDialog → not available in coc, return undefined
  newContent = replaceBalanced(newContent, /(?:vscode\.)?window\.showOpenDialog\(/, () => 'void 0 as any')

  // window.createOutputChannel(name) — coc.nvim supports this directly (no mapping needed)
  // workspace.createOutputChannel was deprecated in coc.nvim

  // window.showInformationMessage / showWarningMessage / showErrorMessage → window.showMessage
  // coc.nvim's showMessage returns void, wrap in Promise.resolve to support .then() chaining
  // Extra args (buttons) are discarded since coc.nvim doesn't support them
  const showMessageWrap = (call: string, severity: string) => {
    const inner = call.slice(call.indexOf('(') + 1, -1)
    const hasVscPrefix = call.startsWith('vscode.')
    const prefix = hasVscPrefix ? 'vscode.' : ''
    // Extract first argument only (the message), split by top-level commas only
    let depth = 0, firstArg = ''
    for (const ch of inner) {
      if (ch === '(' || ch === '{' || ch === '[') depth++
      else if (ch === ')' || ch === '}' || ch === ']') depth--
      else if (ch === ',' && depth === 0) break
      firstArg += ch
    }
    return `${prefix}Promise.resolve(${prefix}window.showMessage(${firstArg.trim()}, '${severity}'))`
  }
  newContent = replaceBalanced(newContent, /(?:vscode\.)?window\.showInformationMessage\(/, (call) => showMessageWrap(call, 'info'))
  newContent = replaceBalanced(newContent, /(?:vscode\.)?window\.showWarningMessage\(/, (call) => showMessageWrap(call, 'warning'))
  newContent = replaceBalanced(newContent, /(?:vscode\.)?window\.showErrorMessage\(/, (call) => showMessageWrap(call, 'error'))

  // Add priority 1 to document format providers (default 0 gets overridden by LanguageClient)
  newContent = replaceBalanced(newContent, /registerDocumentFormatProvider\s*\(/, (call) => {
    let depth = 0, argCount = 1
    for (let i = call.indexOf('(') + 1; i < call.length - 1; i++) {
      if (call[i] === '(') depth++
      else if (call[i] === ')') depth--
      else if (call[i] === ',' && depth === 0) argCount++
    }
    return argCount < 3 ? call.slice(0, -1) + ', 1)' : call
  })
  newContent = replaceBalanced(newContent, /registerDocumentRangeFormatProvider\s*\(/, (call) => {
    let depth = 0, argCount = 1
    for (let i = call.indexOf('(') + 1; i < call.length - 1; i++) {
      if (call[i] === '(') depth++
      else if (call[i] === ')') depth--
      else if (call[i] === ',' && depth === 0) argCount++
    }
    return argCount < 3 ? call.slice(0, -1) + ', 1)' : call
  })

  // authentication.getSession → undefined (coc.nvim has no auth API)
  newContent = replaceBalanced(newContent, /authentication\.getSession\s*\(/, () => 'undefined as any')

  // editor.setDecorations → no-op (coc has different decoration API)
  newContent = replaceBalanced(newContent, /editor\.setDecorations\s*\(/, () => '/* setDecorations */')

  // Guard workspace.workspaceFolders bracket/property access (coc.nvim may return undefined).
  // Does not guard standalone references (e.g. `if (workspace.workspaceFolders)`) to preserve truthiness checks.
  // Handle both workspace.workspaceFolders and vscode.workspace.workspaceFolders.
  newContent = newContent.replace(
    /(?<![$\w.#])((?:vscode\.)?)workspace\.workspaceFolders(?=\s*(?:\[|\.\w))/g,
    '($1workspace.workspaceFolders || [])'
  )
  // Guard for-of iteration: `for (... of workspace.workspaceFolders)`
  // Preserve optional vscode. prefix in replacement.
  newContent = newContent.replace(
    /(?<![$\w.#])(of\s+)((?:vscode\.)?)workspace\.workspaceFolders(?!\s*\?)/g,
    '$1($2workspace.workspaceFolders || [])'
  )

  // Ensure workspace/Uri is imported from coc.nvim when introduced by replacements
  function ensureCocImport(name: string) {
    if (!newContent.includes(name + '.') && !newContent.includes(name + '(')) return
    // Handle destructured imports: import { ... } from 'coc.nvim' or import type { ... } from 'coc.nvim'
    newContent = newContent.replace(
      /(import\s+(?:type\s+)?\{\s*)([^}]*?)(\s*\}\s*from\s*['"]coc\.nvim['"])/g,
      (match, prefix, existing, suffix) => {
        if (!existing.includes(name)) {
          const trimmed = existing.trim().replace(/,\s*$/, '')
          const sep = trimmed ? ', ' : ''
          return `${prefix}${trimmed}${sep}${name}${suffix}`
        }
        return match
      }
    )
    // Fallback: no coc.nvim import yet, add one
    if (!newContent.match(/import\s[^'"]*from\s*['"]coc\.nvim['"]/)) {
      newContent = `import { ${name} } from 'coc.nvim'\n` + newContent
    }
  }
  ensureCocImport('workspace')
  ensureCocImport('Uri')

  // Deduplicate: merge import + import type from same module (yaml, stylelint)
  // e.g. `import { workspace } from 'coc.nvim'\nimport type { workspace } from 'coc.nvim'`
  // Merge duplicate imports from same module (yaml duplicate workspace)
  {
    // Collect all coc.nvim import statements (no trailing ; or whitespace in match)
    const importLines: Array<{ full: string; idx: number; typeOnly: boolean; names: string[] }> = []
    const dupRe = /import\s+(?:type\s+)?\{\s*([^}]+?)\s*\}\s*from\s*['"]coc\.nvim['"]/g
    let dm: RegExpExecArray | null
    while ((dm = dupRe.exec(newContent)) !== null) {
      importLines.push({
        full: dm[0], idx: dm.index, typeOnly: dm[0].startsWith('import type'),
        names: dm[1].split(',').map((s: string) => s.trim()),
      })
    }
    if (importLines.length > 1) {
      const valNames = new Set<string>()
      const typeNames = new Set<string>()
      for (const il of importLines) {
        if (il.typeOnly) il.names.forEach(n => typeNames.add(n))
        else il.names.forEach(n => valNames.add(n))
      }
      for (const n of valNames) typeNames.delete(n)
      // Build replacement: up to 2 lines (value + type)
      const parts: string[] = []
      if (valNames.size > 0) parts.push(`import { ${[...valNames].join(', ')} } from 'coc.nvim'`)
      if (typeNames.size > 0) parts.push(`import type { ${[...typeNames].join(', ')} } from 'coc.nvim'`)
      const replacement = parts.join('\n')
      // Delete all imports from coc.nvim, keeping semicolons and newlines intact
      // Process in reverse order to keep indices valid
      for (let i = importLines.length - 1; i >= 0; i--) {
        const after = importLines[i].idx + importLines[i].full.length
        const rest = newContent.slice(after)
        const trailing = rest.match(/^(;[ \t]*)?(?:\r?\n|$)/)
        const eat = trailing ? trailing[0].length : 0
        newContent = newContent.slice(0, importLines[i].idx) + (i === 0 ? replacement + '\n' : '') + newContent.slice(after + eat)
      }
    }
  }

  if (newContent !== content) {
    file.replaceWithText(newContent)
  }
}
