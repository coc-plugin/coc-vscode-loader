import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

// ── Paths ──────────────────────────────────────────────────
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(SCRIPT_DIR, '../..')
const REGISTRY_PATH = path.resolve(ROOT, 'coc-vscode-registry/registry.json')
const BASELINE_PATH = path.resolve(ROOT, 'converter/baseline.json')
const PRESETS_PATH = path.resolve(ROOT, 'coc-vscode-registry/presets.json')
const CACHE_DIR = path.join(os.homedir(), '.cache', 'coc-converter-smoke')
const TEST_OUTPUT = path.join(os.tmpdir(), 'coc-registry-check')

const entryName = process.env.ENTRY_NAME || ''
if (!entryName) { console.error('ENTRY_NAME env var is required'); process.exit(1) }

// ── Types ──────────────────────────────────────────────────
interface RegistryEntry {
  name: string; displayName: string; type: string
  source?: { type: string; repo?: string; subdir?: string }
  convert: any[]
}
interface BaselineEntry { _source?: { repo?: string; commit?: string }; _error?: string; [rel: string]: any }
type Baseline = Record<string, BaselineEntry>
interface FileChange { rel: string; status: 'changed' | 'new' | 'missing' }

// ── Helpers ────────────────────────────────────────────────
function run(cmd: string, args: string[], opts: { cwd?: string; timeout?: number; ignoreError?: boolean } = {}) {
  try {
    const out = execFileSync(cmd, args, {
      cwd: opts.cwd, timeout: opts.timeout ?? 60000,
      stdio: 'pipe', encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024,
    })
    return { ok: true as const, stdout: out.trim(), stderr: '' }
  } catch (e: any) {
    const msg = e.message || String(e)
    const stderr = (e.stderr?.toString() || '').trim()
    if (opts.ignoreError) return { ok: false as const, stdout: '', stderr, error: msg }
    return { ok: false as const, stdout: '', stderr, error: msg }
  }
}

function log(msg: string) { console.error(`[${entryName}] ${msg}`) }

// ── Labels ─────────────────────────────────────────────────
const LABELS: Record<string, { color: string; desc: string }> = {
  'registry-update':          { color: 'bfd4f2', desc: 'Upstream changes detected, converter output changed' },
  'repo-removed':             { color: 'd93f0b', desc: 'Upstream repository returned 404' },
  'repo-access-error':        { color: 'd93f0b', desc: 'Upstream repository access denied' },
  'repo-archived':            { color: 'd93f0b', desc: 'Upstream repository has been archived' },
  'converter-failure':        { color: 'd93f0b', desc: 'Converter failed to process entry' },
  'pr-merge-conflict':        { color: 'd93f0b', desc: 'PR has merge conflicts' },
  'workflow-permission-error': { color: 'd93f0b', desc: 'GITHUB_TOKEN lacks required permissions' },
}

let _labelsEnsured = false
function ensureLabelsExist() {
  if (_labelsEnsured) return
  _labelsEnsured = true
  for (const [name, cfg] of Object.entries(LABELS))
    run('gh', ['label', 'create', name, '--color', cfg.color, '--description', cfg.desc], { ignoreError: true })
}

// ── Remote ─────────────────────────────────────────────────
function getRemoteHead(repo: string): { ok: true; head: string } | { ok: false; reason: string; detail: string } {
  const r = run('git', ['ls-remote', `https://github.com/${repo}.git`, 'HEAD'], { timeout: 30000 })
  if (!r.ok) {
    const sd = r.stderr.toLowerCase()
    if (sd.includes('404') || sd.includes('not found') || sd.includes('could not read'))
      return { ok: false, reason: 'repo-removed', detail: `Repository ${repo} returned 404` }
    if (sd.includes('429') || sd.includes('rate limit'))
      return { ok: false, reason: 'rate-limited', detail: `GitHub rate limited for ${repo}` }
    if (sd.includes('403') || sd.includes('access denied') || sd.includes('permission denied'))
      return { ok: false, reason: 'repo-access-error', detail: `Repository ${repo} access denied` }
    return { ok: false, reason: 'network-error', detail: `Failed to check ${repo}: ${r.error}` }
  }
  const head = r.stdout.split('\t')[0]?.trim()
  if (!head) return { ok: false, reason: 'network-error', detail: `Empty response from ${repo}` }
  return { ok: true, head }
}

function checkArchived(repo: string): boolean {
  const r = run('gh', ['api', `repos/${repo}`, '--jq', '.archived'], { timeout: 10000 })
  if (!r.ok) { log(`checkArchived: API call failed (${r.error}), assuming not archived`); return false }
  return r.stdout === 'true'
}

function getDefaultBranch(): string {
  // Get default branch of the coc-vscode-loader repo (this checkout), not the upstream extension repo
  const r = run('git', ['rev-parse', '--abbrev-ref', 'origin/HEAD'])
  if (!r.ok) return 'main'
  return r.stdout.replace(/^origin\//, '').trim()
}

// ── Source Repo ────────────────────────────────────────────
function cachePath(name: string) { return path.join(CACHE_DIR, name.replace(/[^a-z0-9_-]/gi, '_')) }

function syncSourceRepo(entry: RegistryEntry): { ok: true; inputDir: string; commit: string } | { ok: false; error: string } {
  const cp = cachePath(entry.name)
  const expectedUrl = `https://github.com/${entry.source!.repo}.git`
  if (fs.existsSync(cp) && fs.existsSync(path.join(cp, '.git'))) {
    // Verify cached clone points to the correct remote URL (repo may have changed)
    const originUrl = run('git', ['remote', 'get-url', 'origin'], { cwd: cp }).stdout
    if (originUrl !== expectedUrl) {
      log(`Cached remote URL (${originUrl}) differs from expected (${expectedUrl}), re-cloning`)
      fs.rmSync(cp, { recursive: true, force: true })
      fs.mkdirSync(cp, { recursive: true })
      const c = run('git', ['clone', '--depth', '1', '--single-branch', expectedUrl, cp], { timeout: 300000 })
      if (!c.ok) return { ok: false, error: `git clone: ${c.error}` }
      const hr = run('git', ['rev-parse', 'HEAD'], { cwd: cp })
      if (!hr.ok) return { ok: false, error: `rev-parse: ${hr.error}` }
      const inputDir = entry.source!.subdir ? path.join(cp, entry.source!.subdir) : cp
      if (!fs.existsSync(inputDir)) return { ok: false, error: `Subdir not found: ${inputDir}` }
      return { ok: true, inputDir, commit: hr.stdout }
    }
    const f1 = run('git', ['fetch', '--depth', '1', 'origin'], { cwd: cp, timeout: 30000, ignoreError: true })
    if (!f1.ok) return { ok: false, error: `git fetch: ${f1.error}` }
    run('git', ['remote', 'set-head', 'origin', '--auto'], { cwd: cp, ignoreError: true })
    const r1 = run('git', ['reset', '--hard', 'origin/HEAD'], { cwd: cp, timeout: 30000 })
    if (!r1.ok) return { ok: false, error: `git reset --hard origin/HEAD failed: ${r1.error}` }
    const r2 = run('git', ['clean', '-fd'], { cwd: cp, timeout: 30000 })
    if (!r2.ok) return { ok: false, error: `git clean -fd failed: ${r2.error}` }
  } else {
    fs.mkdirSync(cp, { recursive: true })
    const c = run('git', ['clone', '--depth', '1', '--single-branch', expectedUrl, cp], { timeout: 300000 })
    if (!c.ok) return { ok: false, error: `git clone: ${c.error}` }
  }
  const hr = run('git', ['rev-parse', 'HEAD'], { cwd: cp })
  if (!hr.ok) return { ok: false, error: `rev-parse: ${hr.error}` }
  const inputDir = entry.source!.subdir ? path.join(cp, entry.source!.subdir) : cp
  if (!fs.existsSync(inputDir)) return { ok: false, error: `Subdir not found: ${inputDir}` }
  return { ok: true, inputDir, commit: hr.stdout }
}

function getCommitInfo(cp: string, oldCommit: string, newCommit: string) {
  const cR = run('git', ['rev-list', '--count', `${oldCommit}..${newCommit}`], { cwd: cp, ignoreError: true })
  const lR = run('git', ['log', '--oneline', '--no-decorate', `${oldCommit}..${newCommit}`], { cwd: cp, ignoreError: true })
  return { count: cR.ok ? parseInt(cR.stdout, 10) || 0 : -1, log: lR.ok ? lR.stdout : '' }
}

// ── Converter ──────────────────────────────────────────────
async function runConverter(inputDir: string, outputDir: string, entry: RegistryEntry): Promise<{ ok: true } | { ok: false; error: string }> {
  fs.mkdirSync(outputDir, { recursive: true })
  try {
    const presets = fs.existsSync(PRESETS_PATH) ? JSON.parse(fs.readFileSync(PRESETS_PATH, 'utf-8')) : undefined
    const { convert } = await import(path.resolve(ROOT, 'converter/src/convert.ts'))
    await convert({ input: inputDir, output: outputDir, convert: entry.convert, presets })
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e.message || String(e) }
  }
}

// ── Hashing ────────────────────────────────────────────────
function hashOutputFiles(outputDir: string, entry: RegistryEntry): Record<string, string> {
  const hashes: Record<string, string> = {}
  const isSnippets = entry.convert?.some((s: any) => s.type === 'snippets') ?? false
  const hasBuildStep = entry.convert?.some((s: any) => s.type === 'snippets' && s.build) ?? false
  const P = '0000000000000000000000000000000000000000000000000000000000000000'
  function collect(dir: string, prefix: string) {
    if (!fs.existsSync(dir)) return
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      const rel = prefix ? `${prefix}/${e.name}` : e.name
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.git') collect(full, rel) }
      else if (isSnippets ? (e.name === 'package.json' || e.name.endsWith('.json'))
        : (e.name.endsWith('.ts') || e.name === 'package.json' || e.name === 'esbuild.mjs')) {
        try {
          if (hasBuildStep && e.name.endsWith('.json') && e.name !== 'package.json' && e.name !== 'coc-convert.json')
            hashes[rel] = P
          else hashes[rel] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex')
        } catch (e: any) {
          log(`Warning: could not hash ${rel}: ${e.message}`)
        }
      }
    }
  }
  collect(outputDir, '')
  return hashes
}

function compareHashes(curr: Record<string, string>, base: BaselineEntry): FileChange[] {
  const changes: FileChange[] = []
  for (const rel of new Set([...Object.keys(curr), ...Object.keys(base)])) {
    if (rel === '_error' || rel === '_source') continue
    const c = curr[rel]; const b = base[rel]
    if (typeof b !== 'string' && typeof c !== 'string') continue
    if (c && typeof b !== 'string') changes.push({ rel, status: 'new' })
    else if (!c && typeof b === 'string') changes.push({ rel, status: 'missing' })
    else if (c !== b) changes.push({ rel, status: 'changed' })
  }
  return changes
}

// ── Issue ──────────────────────────────────────────────────
function createIssue(label: string, title: string, body: string) {
  ensureLabelsExist()
  const r = run('gh', ['issue', 'create', '--title', title, '--body', body, '--label', label], { timeout: 30000 })
  if (r.ok) log(`Issue created: ${r.stdout}`)
  else log(`Failed to create issue: ${r.error}`)
}

// ── Main ───────────────────────────────────────────────────
async function main() {
  // 1. Read data
  const registryRaw = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'))
  if (!Array.isArray(registryRaw)) { log(`registry.json is not an array, skipping`); return }
  const registry: RegistryEntry[] = registryRaw
  const baseline: Baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8'))

  const entry = registry.find((e: any) => e.name === entryName)
  if (!entry) { log(`Not found in registry, skipping`); return }
  if (!entry.source?.repo) { log(`No source.repo, skipping`); return }

  const baseEntry = baseline[entryName]
  if (!baseEntry) { log(`Not in baseline, skipping (run npm run diff:baseline first)`); return }

  const oldCommit = baseEntry._source?.commit
  const repo = entry.source.repo
  if (!oldCommit) { log(`No _source.commit in baseline, skipping`); return }

  // 2. Check remote
  log(`Checking ${repo}`)
  const remote = getRemoteHead(repo)
  if (!remote.ok) {
    if (remote.reason === 'repo-removed' || remote.reason === 'repo-access-error')
      createIssue(remote.reason,
        `Repository ${repo} (${entryName}) — ${remote.reason === 'repo-removed' ? 'not found' : 'access denied'}`,
        `## Repository issue\n\nRegistry entry **${entry.displayName || entryName}** (\`${entryName}\`) points to **${repo}**.\n\n${remote.detail}`)
    log(`${remote.reason}: ${remote.detail}`)
    return
  }

  if (remote.head === oldCommit) { log(`No upstream changes`); return }
  log(`Upstream changed: ${oldCommit.slice(0, 8)} → ${remote.head.slice(0, 8)}`)

  // 3. Check archived
  const archived = checkArchived(repo)
  if (archived === true) {
    createIssue('repo-archived', `Repository ${repo} (${entryName}) has been archived`,
      `## Repository archived\n\nRegistry entry **${entry.displayName || entryName}** (\`${entryName}\`) points to **${repo}**, which has been archived.\n\nConsider removing this entry from the registry or finding an alternative.`)
    return
  }

  // 4. Sync source repo
  const synced = syncSourceRepo(entry)
  if (!synced.ok) {
    createIssue('converter-failure', `Failed to sync source for ${entryName}`,
      `## Source sync failed\n\nEntry: \`${entryName}\`\nRepo: ${repo}\n\nError: ${synced.error}`)
    return
  }
  log(`Source synced at ${synced.commit.slice(0, 8)}`)

  // 5. Get upstream commit info
  const cp = cachePath(entry.name)
  const info = getCommitInfo(cp, oldCommit, synced.commit)

  // 6. Run converter
  const converted = await runConverter(synced.inputDir, path.join(TEST_OUTPUT, entryName), entry)
  if (!converted.ok) {
    createIssue('converter-failure', `Converter failed for ${entryName}`,
      `## Converter failure\n\n| Field | Value |\n|-------|-------|\n| Entry | \`${entryName}\` |\n| Display name | ${entry.displayName || entryName} |\n| Source repo | ${repo} |\n| New HEAD | \`${remote.head}\` |\n\n### Error\n\n\`\`\`\n${converted.error}\n\`\`\``)
    return
  }
  log(`Converter completed`)

  // 7. Hash + compare
  const newHashes = hashOutputFiles(path.join(TEST_OUTPUT, entryName), entry)
  const changes = compareHashes(newHashes, baseEntry)
  if (changes.length === 0) { log(`Upstream changed but converter output unchanged, skipping`); return }
  log(`Output changed: ${changes.map(c => `${c.status}:${c.rel}`).join(', ')}`)

  // 8. Write updated baseline.json
  const fullBaseline: Baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8'))
  fullBaseline[entryName] = { ...newHashes, _source: { repo, commit: remote.head } } as any
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(fullBaseline, null, 2) + '\n')

  // 9. Git: rebase → branch → commit → push
  // Rebase onto latest main first to avoid conflicts when other PRs merged between checkout and push
  const rb1 = run('git', ['fetch', 'origin'], { timeout: 30000 })
  if (!rb1.ok) { log(`git fetch origin failed: ${rb1.error}`); return }
  run('git', ['remote', 'set-head', 'origin', '--auto'], { ignoreError: true })
  const rb2 = run('git', ['rebase', 'origin/HEAD'], { timeout: 30000 })
  if (!rb2.ok) {
    createIssue('pr-merge-conflict', `Merge conflict for ${entryName}`,
      `## Merge conflict\n\nUnable to rebase onto origin/HEAD for ${entryName}.\n\nError: ${rb2.error}`)
    return
  }

  const branch = `update/${entryName}`
  const co = run('git', ['checkout', '-B', branch], { ignoreError: true })
  if (!co.ok) {
    createIssue('pr-merge-conflict', `Merge conflict for ${entryName}`,
      `## Merge conflict\n\nUnable to create branch ${branch} for ${entryName}.\n\nError: ${co.error}`)
    return
  }

  const add = run('git', ['add', 'converter/baseline.json'])
  if (!add.ok) { log(`git add failed: ${add.error}`); return }

  const ci = run('git', ['commit', '-m', `chore: update baseline for ${entryName}`], { ignoreError: true })
  if (!ci.ok) {
    log(`git commit failed: ${ci.error}`)
    createIssue('converter-failure', `Git commit failed for ${entryName}`,
      `## Git commit failed\n\nEntry: \`${entryName}\`\n\n\`git commit\` failed after baseline.json was updated. The branch exists but has no new commits.\n\nError: ${ci.error}`)
    return
  }

  const push = run('git', ['push', '-u', 'origin', branch, '--force-with-lease'], { timeout: 30000 })
  if (!push.ok) {
    createIssue('workflow-permission-error', `Failed to push branch for ${entryName}`,
      `## Push failed\n\nUnable to push branch ${branch} for ${entryName}.\n\nError: ${push.error}`)
    return
  }

  // 10. PR: create or update
  ensureLabelsExist()
  const fileTable = changes.map(c => {
    const icon = c.status === 'changed' ? '~' : c.status === 'new' ? '+' : '-'
    return `| ${icon} | \`${c.rel}\` | ${c.status} |`
  }).join('\n')

  // A4: Detect if source.repo changed since baseline
  const baselineRepo = baseEntry._source?.repo
  const repoChanged = baselineRepo && baselineRepo !== repo
  if (repoChanged) log(`Source repo changed: ${baselineRepo} → ${repo}`)

  const prBody = `## Summary

Registry entry **${entry.displayName || entryName}** (\`${entry.name}\`) has detected upstream changes.

| Field | Value |
|-------|-------|
| Source repo | ${repo} |
| Previous commit | \`${oldCommit}\` |
| New HEAD | \`${remote.head}\` |
| Commits behind | ${info.count >= 0 ? info.count : 'unknown'} |
${repoChanged ? `| ⚠️ Repository changed | \`${baselineRepo}\` → \`${repo}\` |` : ''}

### Changed output files

|   | File | Status |
|---|------|--------|
${fileTable}

### Upstream commits

\`\`\`
${info.log || '(no details available)'}
\`\`\`
${repoChanged ? `\n> ⚠️ **Repository changed** — this entry previously pointed to \`${baselineRepo}\`. Verify the new repo is the correct upstream.\n` : ''}
### Review checklist

- [ ] Confirm changes are expected
- [ ] If converter changes needed: push to this branch
- [ ] Test via TUI
- [ ] Merge after review`

  const title = `chore(registry): update ${entry.name} (upstream changed)`
  const existingPR = run('gh', ['pr', 'view', branch, '--json', 'number'], { ignoreError: true, timeout: 10000 })
  const prNum = existingPR.ok ? (JSON.parse(existingPR.stdout)?.number ?? null) : null

  if (prNum) {
    run('gh', ['pr', 'edit', String(prNum), '--title', title, '--body', prBody], { timeout: 30000, ignoreError: true })
    log(`Updated PR #${prNum}`)
  } else {
    const defaultBranch = getDefaultBranch()
    const created = run('gh', ['pr', 'create', '--title', title, '--body', prBody, '--label', 'registry-update', '--base', defaultBranch], { timeout: 30000 })
    if (created.ok) log(`PR created: ${created.stdout}`)
    else {
      // PR creation failed — create an issue as fallback
      log(`PR creation failed: ${created.error}; creating issue as fallback`)
      createIssue('converter-failure', `Manual review needed: ${entryName} upstream changed`,
        `## Manual review needed\n\nAutomated PR creation failed for **${entryName}**.\n\nUpstream ${repo} has new commits (${oldCommit.slice(0, 8)} → ${remote.head.slice(0, 8)}), and converter output changed.\n\nPlease run the update manually:\n\n1. \`npm run diff:baseline\`\n2. Review the output changes\n3. Create a PR\n\n### Converter error\n\n${created.error}`)
    }
  }
}

main().catch(e => { log(`Unexpected error: ${e}`); process.exit(1) })
