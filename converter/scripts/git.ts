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
    let resolved = false
    let closeGuard: ReturnType<typeof setTimeout> | undefined

    if (child.stdout) {
      child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    }
    if (child.stderr) {
      child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))
    }

    child.on('error', reject)

    child.on('exit', (code) => {
      // close usually follows exit quickly, but on Windows it can be delayed
      // indefinitely. Set a guard to resolve with what we have after 5s.
      closeGuard = setTimeout(() => {
        if (!resolved) {
          resolved = true
          if (timeoutId) clearTimeout(timeoutId)
          resolve({
            exitCode: code ?? -1,
            stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
            stderr: Buffer.concat(stderrChunks).toString('utf-8'),
          })
        }
      }, 5000)
    })

    child.on('close', (code) => {
      if (!resolved) {
        resolved = true
        if (closeGuard) clearTimeout(closeGuard)
        if (timeoutId) clearTimeout(timeoutId)
        resolve({
          exitCode: code ?? -1,
          stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
          stderr: Buffer.concat(stderrChunks).toString('utf-8'),
        })
      }
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
 * Falls back to batched per-file extraction when bulk checkout times out
 * (large repos, slow I/O, or invalid filenames on Windows).
 */
export async function gitCheckout(dir: string, subdir?: string): Promise<void> {
  if (subdir) {
    await setupSparseCheckout(dir, subdir)
  }

  // Fast path: bulk checkout with timeouts
  // Timeout naturally catches repos that are too large or too slow for bulk
  const readTreeOk = await tryExec(gitExec(['read-tree', 'HEAD'], { cwd: dir, timeout: 30000 }))
  if (readTreeOk) {
    const checkoutOk = await tryExec(gitExec(['checkout-index', '-a'], { cwd: dir, timeout: 60000 }))
    if (checkoutOk) return
  }

  // Fallback: extract files via git show (doesn't need a populated index).
  // checkout-index requires the index, which may be missing if read-tree failed.
  const ls = await gitExec(['ls-tree', '-r', '--name-only', 'HEAD'], { cwd: dir })
  if (ls.exitCode !== 0 || !ls.stdout.trim()) {
    throw new Error(`git checkout failed: no files (empty repository or unrecoverable error)`)
  }

  const allFiles = ls.stdout.trim().split(/\r?\n/).filter(Boolean)
  const files = subdir
    ? allFiles.filter(f => f.startsWith(subdir.replace(/\\/g, '/').replace(/\/?$/, '/')) || f === subdir)
    : allFiles

  if (files.length === 0) {
    throw new Error(`git checkout failed: no files match${subdir ? ` subdir "${subdir}"` : ''}`)
  }

  let written = 0
  for (const file of files) {
    try {
      const content = await gitExec(['cat-file', '-p', `HEAD:${file}`], { cwd: dir })
      if (content.exitCode !== 0) continue
      const fullPath = path.join(dir, file)
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      fs.writeFileSync(fullPath, content.stdout, 'utf-8')
      written++
    } catch {
      // skip files with invalid filenames on Windows
    }
  }

  if (written === 0) {
    throw new Error(`git checkout failed: could not extract any of ${files.length} file(s)`)
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
