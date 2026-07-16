import * as cp from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

export interface GitOptions {
  cwd?: string
  timeout?: number
}

export interface GitResult {
  exitCode: number
  stdout: string
  stderr: string
}

export function gitExec(args: string[], options?: GitOptions): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    const child = cp.spawn('git', args, {
      cwd: options?.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    if (child.stdout) {
      child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    }
    if (child.stderr) {
      child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))
    }

    child.on('error', reject)

    child.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId)
      resolve({
        exitCode: code ?? -1,
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
      })
    })

    if (options?.timeout) {
      timeoutId = setTimeout(() => {
        child.kill('SIGTERM')
        reject(new Error(`git command timed out: git ${args.join(' ')}`))
      }, options.timeout)
    }
  })
}

/**
 * Set up sparse-checkout cone mode for a subdirectory.
 * Must be called after clone --no-checkout, before checkout.
 */
async function setupSparseCheckout(dir: string, subdir: string): Promise<void> {
  await gitExec(['config', 'core.sparseCheckout', 'true'], { cwd: dir })
  await gitExec(['config', 'core.sparseCheckoutCone', 'true'], { cwd: dir })
  // Cone mode pattern: a single directory path with trailing slash
  const pattern = subdir.replace(/\\/g, '/').replace(/\/?$/, '/')
  fs.mkdirSync(path.join(dir, '.git', 'info'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.git', 'info', 'sparse-checkout'), `/${pattern}\n`)
}

/**
 * Checkout HEAD in a --no-checkout cloned repo.
 * Falls back to per-file extraction for repos with problematic filenames or large trees.
 * Throws if no files could be checked out.
 *
 * When subdir is provided, sets up sparse-checkout cone mode to only write
 * files within that subdirectory — dramatically faster on Windows for large
 * monorepos where only a subdirectory is needed.
 */
export async function gitCheckout(dir: string, subdir?: string): Promise<void> {
  if (subdir) {
    await setupSparseCheckout(dir, subdir)
  }

  const readTreeOk = await tryExec(gitExec(['read-tree', 'HEAD'], { cwd: dir }))
  if (readTreeOk) {
    const checkoutOk = await tryExec(gitExec(['checkout-index', '-a'], { cwd: dir }))
    if (checkoutOk) return
  }

  // Fallback: list files without relying on index state
  const ls = await gitExec(['ls-tree', '-r', '--name-only', 'HEAD'], { cwd: dir })
  if (ls.exitCode !== 0 || !ls.stdout.trim()) {
    throw new Error(`git checkout failed: no files (empty repository or unrecoverable error)`)
  }

  const allFiles = ls.stdout.trim().split(/\r?\n/).filter(Boolean)
  // If subdir is set, only checkout files within that directory
  const files = subdir
    ? allFiles.filter(f => f.startsWith(subdir.replace(/\\/g, '/').replace(/\/?$/, '/') + '/') || f === subdir)
    : allFiles

  if (files.length === 0) {
    throw new Error(`git checkout failed: no files match${subdir ? ` subdir "${subdir}"` : ''}`)
  }

  const MAX_BATCH = 100
  for (let i = 0; i < files.length; i += MAX_BATCH) {
    const batch = files.slice(i, i + MAX_BATCH)
    try {
      await gitExec(['checkout-index', '--quiet', '--', ...batch], { cwd: dir })
    } catch {
      for (const file of batch) {
        try {
          await gitExec(['checkout-index', '--quiet', '--', file], { cwd: dir })
        } catch {
          // skip files with invalid filenames on Windows
        }
      }
    }
  }
}

async function tryExec(p: Promise<GitResult>): Promise<boolean> {
  try {
    const r = await p
    return r.exitCode === 0
  } catch {
    return false
  }
}

/**
 * Clone a GitHub repo without checkout, then checkout HEAD.
 * If dest already has .git, does an incremental fetch + reset instead.
 *
 * Uses --filter=blob:none only when subdir is specified (sparse checkout
 * means most blobs are never needed). Without subdir, a full shallow clone
 * is faster — on-demand blob fetching on Windows is slower than bulk download.
 */
export async function downloadOrUpdateRepo(repo: string, dest: string, subdir?: string): Promise<void> {
  const url = `https://github.com/${repo}.git`

  if (fs.existsSync(path.join(dest, '.git'))) {
    await gitExec(['fetch', '--depth', '1', '--quiet', 'origin'], { cwd: dest, timeout: 30000 }).catch(() => {})
    await gitExec(['reset', '--hard', '--quiet', 'origin/HEAD'], { cwd: dest, timeout: 30000 }).catch(() => {})
    await gitExec(['clean', '-fd', '--quiet'], { cwd: dest, timeout: 30000 }).catch(() => {})
  } else {
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
    fs.mkdirSync(dest, { recursive: true })
    const cloneArgs = ['clone', '--no-checkout', '--depth', '1', '--single-branch', '--quiet', url, dest]
    if (subdir) {
      // Only need blobs within the sparse cone — skip the rest
      cloneArgs.splice(1, 0, '--filter=blob:none')
    }
    await gitExec(cloneArgs, { timeout: 300000 })
  }

  await gitCheckout(dest, subdir)
}

export async function getHeadCommit(dir: string): Promise<string | undefined> {
  try {
    const result = await gitExec(['rev-parse', 'HEAD'], { cwd: dir })
    if (result.exitCode === 0) return result.stdout.trim()
  } catch {}
  return undefined
}
