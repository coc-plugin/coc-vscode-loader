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
 * Falls back to per-file extraction for repos with problematic filenames.
 * Throws if no files could be checked out.
 */
export async function gitCheckout(dir: string): Promise<void> {
  const r = await gitExec(['read-tree', 'HEAD'], { cwd: dir, timeout: 30000 })
  if (r.exitCode !== 0) {
    throw new Error(`git read-tree failed: ${r.stderr}`)
  }

  const co = await gitExec(['checkout-index', '-a'], { cwd: dir, timeout: 60000 })
  if (co.exitCode === 0) return

  const ls = await gitExec(['ls-files'], { cwd: dir, timeout: 30000 })
  if (ls.exitCode !== 0 || !ls.stdout.trim()) {
    throw new Error(`git checkout failed: no files (${co.stderr || 'empty repository'})`)
  }

  const files = ls.stdout.trim().split(/\r?\n/).filter(Boolean)
  for (const file of files) {
    try {
      await gitExec(['checkout-index', '--quiet', '--', file], { cwd: dir, timeout: 10000 })
    } catch {
      // skip files with invalid filenames on Windows
    }
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
