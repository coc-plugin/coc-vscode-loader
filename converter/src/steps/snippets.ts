import * as fs from 'fs'
import * as path from 'path'
import { execFileSync } from 'child_process'
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

    for (const [sourceRelPath, languages] of fileToLanguages) {
      const sourceFile = path.join(input, sourceRelPath)
      if (!fs.existsSync(sourceFile)) {
        if (verbose) console.warn(`  snippets: source file not found: ${sourceFile}, skipping`)
        continue
      }
      const dest = path.join(output, sourceRelPath)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(sourceFile, dest)
      copiedCount++
      allLanguages.push(...languages)
      if (verbose) console.log(`  snippets: copied ${sourceRelPath} (${languages.join(', ')})`)
    }

    if (copiedCount === 0 && ss.build) {
      // Run build script to generate snippet files (e.g. node merge.js)
      if (verbose) console.log(`  snippets: running build: ${ss.build}`)
      // Install devDeps so build tools (glob, etc.) are available
      try {
        execFileSync('npm', ['install', '--legacy-peer-deps'], { cwd: input, stdio: verbose ? 'inherit' : 'pipe' })
      } catch {}
      try {
        const [cmd, ...args] = ss.build.split(' ')
        execFileSync(cmd, args, { cwd: input, stdio: verbose ? 'inherit' : 'pipe' })
        // Retry copying
        for (const [sourceRelPath, languages] of fileToLanguages) {
          const sourceFile = path.join(input, sourceRelPath)
          if (fs.existsSync(sourceFile)) {
            const dest = path.join(output, sourceRelPath)
            fs.mkdirSync(path.dirname(dest), { recursive: true })
            fs.copyFileSync(sourceFile, dest)
            copiedCount++
            allLanguages.push(...languages)
            if (verbose) console.log(`  snippets: copied ${sourceRelPath} (${languages.join(', ')})`)
          }
        }
      } catch (e: any) {
        if (verbose) console.warn(`  snippets: build failed: ${e.message}`)
      }
    }

    if (copiedCount === 0) {
      // No source files found — generate empty snippet files from registry/contributes info
      const fallbackLangs: string[] = ss.languages
        ? [...ss.languages]
        : (origPkg.contributes?.snippets || []).map((s: any) => s.language).filter(Boolean)
      const unique = [...new Set(fallbackLangs)]
      for (const lang of unique) {
        const dest = path.join(output, 'snippets', `${lang}.json`)
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.writeFileSync(dest, JSON.stringify({}), 'utf-8')
      }
      copiedCount = unique.length
      allLanguages.push(...unique)
      if (verbose) console.warn(`  snippets: no source files found, generated ${unique.length} empty snippet files`)
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
