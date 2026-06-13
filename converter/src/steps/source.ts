import * as fs from 'fs'
import * as path from 'path'
import { StepGenerator, StepContext, SourceStep, StepResult } from '../types.js'
import { transformImportMapping } from '../transforms/import-mapping.js'
import { transformClassToFactory } from '../transforms/class-to-factory.js'
import { transformProviderRegister } from '../transforms/provider-register.js'
import { transformEnumOffset } from '../transforms/enum-offset.js'

const TRANSFORM_MAP: Record<string, (ctx: any) => void> = {
  'import-mapping': transformImportMapping,
  'class-to-factory': transformClassToFactory,
  'provider-register': transformProviderRegister,
  'enum-offset': transformEnumOffset,
}

function walkFiles(dir: string): string[] {
  const files: string[] = []
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        files.push(...walkFiles(p))
      } else if (entry.isFile()) {
        files.push(p)
      }
    }
  } catch {}
  return files
}

export const sourceGenerator: StepGenerator = {
  type: 'source',

  generate(ctx: StepContext, step: StepResult): StepResult {
    const ss = step as SourceStep
    const { input, output, project, verbose } = ctx
    const outputsDir = path.join(output, 'src')
    fs.mkdirSync(outputsDir, { recursive: true })

    // Scan for files with vscode imports
    const srcDir = path.join(input, 'src')
    const vscodeFiles: string[] = []

    if (fs.existsSync(srcDir)) {
      for (const f of walkFiles(srcDir)) {
        const rel = path.relative(srcDir, f)
        if (!f.endsWith('.ts') && !f.endsWith('.tsx')) continue
        const content = fs.readFileSync(f, 'utf-8')
        if (content.includes("from 'vscode'") || content.includes('from "vscode"') || content.includes('require("vscode")')) {
          vscodeFiles.push(f)
        }
      }
    }

    // Copy vscode files to output
    const copiedFiles: string[] = []
    for (const f of vscodeFiles) {
      const rel = path.relative(srcDir, f)
      const dest = path.join(outputsDir, rel)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(f, dest)
      copiedFiles.push(rel)
    }

    // Ensure entry file is copied
    if (ss.entry) {
      const entrySrc = path.join(srcDir, ss.entry)
      const entryDest = path.join(outputsDir, ss.entry)
      if (fs.existsSync(entrySrc) && !copiedFiles.includes(ss.entry)) {
        fs.mkdirSync(path.dirname(entryDest), { recursive: true })
        fs.copyFileSync(entrySrc, entryDest)
        copiedFiles.push(ss.entry)
      }
    }

    if (verbose) {
      console.log(`  source: copied ${copiedFiles.length} files`)
    }

    // Apply transforms via ts-morph
    const toTransform = copiedFiles
      .map(f => path.join(outputsDir, f))
      .filter(f => fs.existsSync(f))

    for (const fp of toTransform) {
      try { project.addSourceFileAtPath(fp) } catch {}
    }

    for (const sf of project.getSourceFiles()) {
      const filePath = sf.getFilePath()
      const relPath = path.relative(outputsDir, filePath)
      // Only transform files that are in our output src dir
      if (!copiedFiles.some(f => filePath.endsWith(f))) continue

      for (const t of ss.transforms) {
        const fn = TRANSFORM_MAP[t]
        if (!fn) {
          if (verbose) console.warn(`  unknown transform: ${t}`)
          continue
        }
        try {
          fn({ file: sf, project })
          if (verbose) console.log(`  ${t}: ${relPath}`)
        } catch (e: any) {
          if (verbose) console.warn(`  ${t} error on ${relPath}: ${e.message}`)
        }
      }
      sf.saveSync()
    }

    // Resolve keepDeps from origPkg
    const keepDeps: Record<string, string> = {}
    if (ss.keepDeps) {
      if (Array.isArray(ss.keepDeps)) {
        for (const dep of ss.keepDeps) {
          const ver = resolveDepVersion(ctx.origPkg, dep)
          if (ver) keepDeps[dep] = ver
        }
      } else {
        Object.assign(keepDeps, ss.keepDeps)
      }
    }

    return {
      generatedFiles: [],
      entryPoint: ss.entry,
      keepDeps,
      activationEvents: ss.activationEvents || [],
    }
  },
}

function resolveDepVersion(pkg: Record<string, any>, name: string): string | undefined {
  if (pkg.dependencies?.[name]) return pkg.dependencies[name]
  if (pkg.devDependencies?.[name]) return pkg.devDependencies[name]
  return undefined
}
