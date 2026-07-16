import * as fs from 'fs'
import * as path from 'path'
import { execFileSync, execSync } from 'child_process'
import { StepGenerator, StepContext, SnippetsStep, StepResult } from '../types.js'

export const snippetsGenerator: StepGenerator = {
  type: 'snippets',

  generate(ctx: StepContext, step: any): StepResult {
    const ss = step as SnippetsStep
    const { input, output, origPkg, verbose } = ctx

    const contributedSnippets: Array<{ language: string; path: string }> =
      origPkg.contributes?.snippets || []

    if (contributedSnippets.length === 0 && !ss.languages) {
      throw new Error('snippets step: source package.json has no contributes.snippets, and no languages specified in step config')
    }

    // Collect unique (sourcePath → [languages]) mappings
    const fileToLanguages = new Map<string, string[]>()
    if (ss.languages) {
      for (const lang of ss.languages) {
        const entry = contributedSnippets.find(s => s.language === lang)
        if (entry) {
          const langs = fileToLanguages.get(entry.path) || []
          langs.push(lang)
          fileToLanguages.set(entry.path, langs)
        } else {
          const defaultPath = `./snippets/${lang}.json`
          const fp = path.join(input, defaultPath)
          if (fs.existsSync(fp)) {
            const langs = fileToLanguages.get(defaultPath) || []
            langs.push(lang)
            fileToLanguages.set(defaultPath, langs)
          } else if (verbose) {
            console.warn(`  snippets: no snippet file found for language "${lang}", skipping`)
          }
        }
      }
    } else {
      for (const s of contributedSnippets) {
        const langs = fileToLanguages.get(s.path) || []
        langs.push(s.language)
        fileToLanguages.set(s.path, langs)
      }
    }

    if (fileToLanguages.size === 0) {
      throw new Error('snippets step: no snippet files found to copy')
    }

    // Create output directories and copy files to original relative paths
    const srcDir = path.join(output, 'src')
    fs.mkdirSync(srcDir, { recursive: true })

    const generatedFiles: Array<{ path: string; content: string }> = []
    let copiedCount = 0
    const allLanguages: string[] = []

    // First pass: if any files are missing and a build script exists, run it first
    // to avoid misleading "file not found" warnings.
    const missing = new Map<string, string[]>()
    for (const [sourceRelPath, languages] of fileToLanguages) {
      const sourceFile = path.join(input, sourceRelPath)
      if (!fs.existsSync(sourceFile)) {
        missing.set(sourceRelPath, languages)
      } else {
        const dest = path.join(output, sourceRelPath)
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.copyFileSync(sourceFile, dest)
        copiedCount++
        allLanguages.push(...languages)
        if (verbose) console.log(`  snippets: copied ${sourceRelPath} (${languages.join(', ')})`)
      }
    }

    if (missing.size > 0 && ss.build) {
      if (verbose) console.log(`  snippets: running build: ${ss.build}`)
      try {
        execFileSync('npm', ['install', '--legacy-peer-deps'], { cwd: input, stdio: verbose ? 'inherit' : 'pipe', shell: true })
        execSync(ss.build, { cwd: input, stdio: verbose ? 'inherit' : 'pipe', shell: true })
      } catch (e: any) {
        if (e.code === 'ENOENT') {
          const cmd = ss.build.split(' ')[0]
          console.warn(`  snippets: build tool "${cmd}" not found. Install it and try again, or remove the "build" field from the registry entry.`)
        } else {
          console.warn(`  snippets: build failed (${e.message}), skipping`)
        }
      }
      // Retry missing files after build
      for (const [sourceRelPath, languages] of missing) {
        const sourceFile = path.join(input, sourceRelPath)
        if (fs.existsSync(sourceFile)) {
          const dest = path.join(output, sourceRelPath)
          fs.mkdirSync(path.dirname(dest), { recursive: true })
          fs.copyFileSync(sourceFile, dest)
          copiedCount++
          allLanguages.push(...languages)
          if (verbose) console.log(`  snippets: copied ${sourceRelPath} (${languages.join(', ')})`)
        } else {
          console.warn(`  snippets: source file not found: ${sourceFile}, skipping`)
        }
      }
    } else if (missing.size > 0) {
      // No build step — warn about genuinely missing files
      for (const [sourceRelPath, languages] of missing) {
        const sourceFile = path.join(input, sourceRelPath)
        console.warn(`  snippets: source file not found: ${sourceFile}, skipping`)
      }
    }

    if (copiedCount === 0) {
      throw new Error('snippets step: no snippet files were copied')
    }

    // Generate empty src/index.ts
    const indexContent = `\
import { ExtensionContext } from 'coc.nvim'

export function activate(context: ExtensionContext): void {
  // coc-snippets discovers snippets via package.json's contributes.snippets
}
`
    generatedFiles.push({ path: 'src/index.ts', content: indexContent })

    const activationEvents = [...new Set(allLanguages)].map(l => `onLanguage:${l}`)

    if (verbose) {
      console.log(`  snippets: ${copiedCount} files, ${new Set(allLanguages).size} languages`)
    }

    return {
      generatedFiles,
      entryPoint: 'src/index.ts',
      keepDeps: {},
      activationEvents,
    }
  },
}
