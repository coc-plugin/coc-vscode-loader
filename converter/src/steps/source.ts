import * as fs from 'fs'
import * as path from 'path'
import { StepGenerator, StepContext, SourceStep, StepResult } from '../types.js'
import { transformImportMapping } from '../transforms/import-mapping.js'
import { transformClassToFactory } from '../transforms/class-to-factory.js'
import { transformProviderRegister } from '../transforms/provider-register.js'
import { transformEnumOffset } from '../transforms/enum-offset.js'
import { transformStripVolar } from '../transforms/strip-volar.js'

const TRANSFORM_MAP: Record<string, (ctx: any) => void> = {
  'import-mapping': transformImportMapping,
  'class-to-factory': transformClassToFactory,
  'provider-register': transformProviderRegister,
  'enum-offset': transformEnumOffset,
  'strip-volar': transformStripVolar,
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

    // Copy ALL .ts/.tsx files from source directory (try src/ first, fall back to input root)
    let srcDir = path.join(input, 'src')
    if (!fs.existsSync(srcDir)) {
      srcDir = input
    }
    const hasStripVolar = ss.transforms.includes('strip-volar')
    const allFiles: Array<{ src: string; rel: string }> = []
    const vscodeFiles: string[] = []

    for (const f of walkFiles(srcDir)) {
      const rel = path.relative(srcDir, f)
      if (!rel.endsWith('.ts') && !rel.endsWith('.tsx')) continue

      // Skip framework files that are replaced by generated code
      if (hasStripVolar) {
        const content = fs.readFileSync(f, 'utf-8')
        if (content.includes('@volar/vscode') || content.includes('reactive-vscode')) continue
      }

      allFiles.push({ src: f, rel })

      const content = fs.readFileSync(f, 'utf-8')
      if (content.includes("from 'vscode'") || content.includes('from "vscode"') || content.includes('require("vscode")')) {
        vscodeFiles.push(rel)
      }
    }

    // Copy all files to output
    for (const { src, rel } of allFiles) {
      const dest = path.join(outputsDir, rel)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(src, dest)
    }

    if (verbose) {
      console.log(`  source: copied ${allFiles.length} files (${vscodeFiles.length} with vscode imports)`)
    }

    // Apply transforms via ts-morph (only to files with vscode imports)
    for (const rel of vscodeFiles) {
      const fp = path.join(outputsDir, rel)
      if (!fs.existsSync(fp)) continue
      try { project.addSourceFileAtPath(fp) } catch {}
    }

    for (const sf of project.getSourceFiles()) {
      const relPath = path.relative(outputsDir, sf.getFilePath())
      if (!vscodeFiles.some(f => sf.getFilePath().endsWith(f))) continue

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
