import * as cp from 'child_process'

export interface GitOptions {
  cwd?: string
  timeout?: number
}

export interface GitResult {
  exitCode: number
  stdout: string
  stderr: string
}

/**
 * Run a git command asynchronously with streaming stdio.
 * Avoids ENOBUFS on Windows because data flows incrementally through pipes.
 */
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
 * Checkout HEAD in a --no-checkout cloned repo.
 * Falls back to per-file extraction for repos with problematic filenames or large trees.
 * Throws if no files could be checked out.
 *
 * Only network operations (clone, fetch) have timeouts; local git operations
 * (read-tree, checkout-index) run until completion — no arbitrary limits.
 */
export async function gitCheckout(dir: string): Promise<void> {
  const readTreeOk = await tryExec(gitExec(['read-tree', 'HEAD'], { cwd: dir }))
  if (readTreeOk) {
    const checkoutOk = await tryExec(gitExec(['checkout-index', '-a'], { cwd: dir }))
    if (checkoutOk) return
  }

  // Fall back to per-file extraction
  const ls = await gitExec(['ls-files'], { cwd: dir })
  if (ls.exitCode !== 0 || !ls.stdout.trim()) {
    throw new Error(`git checkout failed: no files (empty repository or unrecoverable error)`)
  }

  const files = ls.stdout.trim().split(/\r?\n/).filter(Boolean)
  for (const file of files) {
    try {
      await gitExec(['checkout-index', '--quiet', '--', file], { cwd: dir })
    } catch {
      // skip files with invalid filenames on Windows
    }
  }
}

/** Run a promise, return true if it resolves with exitCode 0, false otherwise. */
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
 */
export async function downloadOrUpdateRepo(repo: string, dest: string): Promise<void> {
  const { existsSync, rmSync, mkdirSync } = await import('fs')
  const { join } = await import('path')
  const url = `https://github.com/${repo}.git`

  if (existsSync(join(dest, '.git'))) {
    await gitExec(['fetch', '--depth', '1', '--quiet', 'origin'], { cwd: dest, timeout: 30000 }).catch(() => {})
    await gitExec(['reset', '--hard', '--quiet', 'origin/HEAD'], { cwd: dest, timeout: 30000 }).catch(() => {})
    await gitExec(['clean', '-fd', '--quiet'], { cwd: dest, timeout: 30000 }).catch(() => {})
  } else {
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
    mkdirSync(dest, { recursive: true })
    await gitExec(['clone', '--no-checkout', '--depth', '1', '--single-branch', '--quiet', url, dest], { timeout: 300000 })
  }

  await gitCheckout(dest)
}

/**
 * Get the HEAD commit SHA of a git repo, or undefined if not available.
 */
export async function getHeadCommit(dir: string): Promise<string | undefined> {
  try {
    const result = await gitExec(['rev-parse', 'HEAD'], { cwd: dir })
    if (result.exitCode === 0) return result.stdout.trim()
  } catch {}
  return undefined
}
