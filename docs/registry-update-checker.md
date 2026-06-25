# Registry Update Checker — GitHub Action Design

## Motivation

Registry entries point to upstream VS Code extension repos (e.g. `clangd/vscode-clangd`). These repos evolve independently — new commits may introduce API changes that break the converter's output. Automated detection lets the maintainer review and update converter transforms or registry config before users encounter broken plugins.

## Design Principle

**One PR per outdated entry.** Each upstream repo with new commits that changes converter output gets its own PR. This keeps review isolated, blame-clear, and revert-safe.

## Workflow: `registry-check.yml`

### Trigger

```yaml
on:
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch:
```

### Permissions

```yaml
permissions:
  contents: write
  pull-requests: write
  issues: write
```

### Job Overview

Two jobs: **discover** (generate matrix) → **check** (matrix parallel per-entry).

```
discover job (serial):
  └─ Read registry.json + baseline.json
     ├─ Registry unreadable → log error, output empty matrix
     ├─ Baseline corrupted → log warning, output empty matrix
     ├─ Baseline empty     → suggest npm run diff:baseline, output empty matrix
     └─ OK → output matrix of all entries with baseline

check job (matrix × max 8 parallel, each on its own runner):
  ├─ Step 1: Read baseline._source.commit
  ├─ Step 2: git ls-remote HEAD
  │   ├─ MATCH             → skip
  │   ├─ 404               → create Issue (repo-removed)
  │   ├─ 403               → create Issue (repo-access-error)
  │   ├─ Repo archived     → create Issue (repo-archived)
  │   └─ MISMATCH          → proceed to step 3
  ├─ Step 3: Sync upstream repo + run converter + hash compare
  │   ├─ Sync failed       → create Issue (converter-failure)
  │   ├─ Convert failed    → create Issue (converter-failure)
  │   ├─ Output unchanged  → skip (nothing created)
  │   └─ Output changed    → proceed to step 4
  └─ Step 4: git commit + push + gh pr create/edit
      ├─ git commit fail   → create Issue (converter-failure)
      ├─ git push fail     → create Issue (workflow-permission-error)
      ├─ Existing PR found → gh pr edit (force push branch)
      ├─ New PR            → gh pr create (label: registry-update)
      └─ PR create fail    → create Issue (converter-failure) as fallback
```

### Entry Behavior Reference

| # | Scenario | Detection | Handling |
|---|----------|-----------|----------|
| A1 | New entry, no baseline | Not found in baseline.json | Skip, log suggestion to run `npm run diff:baseline` |
| A2 | Entry removed from registry | In baseline but not in registry.json | Log as orphaned baseline entry |
| A3 | Entry has no source.repo | `entry.source.repo` missing | Skip (non-github source, can't check) |
| A4 | source.repo changed | `baseline._source.repo` differs from registry | Log warning + PR body shows repo change notice |
| A5 | Entry renamed | Baseline key not found in registry | Log as orphaned, old key stays in baseline until manual cleanup |
| B1 | Upstream has new commits | `git ls-remote HEAD` differs from `_source.commit` | Run converter comparison |
| B2 | No upstream changes | HEAD matches `_source.commit` | Skip |
| B3 | Repo 404 | `git ls-remote` returns 404 | Create Issue (repo-removed) |
| B4 | Repo 403 | `git ls-remote` returns 403 | Create Issue (repo-access-error) |
| B5 | Repo archived | `gh api repos/$repo --jq .archived` is true | Create Issue (repo-archived) |
| B6 | Repo renamed | `git ls-remote` succeeds (GitHub redirects) | Normal processing, PR body notes the change |
| B7 | Default branch changed | `git ls-remote HEAD` points to new branch | `git remote set-head origin --auto` syncs automatically |
| B8 | Force push | New HEAD not descendant of old commit | Normal processing (rev-list may show unknown count) |
| B9 | Network timeout / 5xx | `git ls-remote` fails | Skip, log. No Issue (transient) |
| C1 | Output unchanged | Hashes match baseline | Skip |
| C2 | Output hash changed | Hash comparison finds differences | Create PR |
| C3 | New output files | Files in new output not in baseline | PR marks as `new` |
| C4 | Output files removed | Baseline files missing from output | PR marks as `missing` |
| C5 | Converter throws | `convert()` function throws | Create Issue (converter-failure) |
| C6 | npm ci fails | Converter dependencies fail to install | Job-level workflow failure |
| C7 | Clone timeout | `git clone --depth 1` exceeds 5 min | Create Issue (converter-failure) |
| D1 | No existing PR | `gh pr list` returns empty | New branch + new PR |
| D2 | Existing open PR | `gh pr list` finds matching PR | Force push branch + `gh pr edit` |
| D3 | Existing draft PR | Same (`--state open` includes drafts) | Same, preserves draft status |
| D4 | PR already merged | Not found via `--state open` | New PR (branch is re-created) |
| D5 | PR closed without merge | Not found via `--state open` | New PR (stable branch name, no date suffix) |
| D6 | Same entry twice (impossible) | Matrix isolates per entry | N/A |
| D7 | PR creation merge conflict | `gh pr create` fails | Create Issue (converter-failure) fallback |
| D8 | Parallel baseline.json edits | Each PR modifies its own key | Git merge handles different keys cleanly |
| E1 | Normal run, some updates | — | Each diff entry gets a PR |
| E2 | Normal run, no updates | — | Workflow exits cleanly |
| E3 | Workflow cancelled | GitHub sends cancelled event | Existing PRs preserved, next run force-pushes |
| E4 | Concurrent runs | `concurrency` group | Queued, not cancelled |
| E5 | First run (no baseline) | Baseline missing or empty | Empty matrix + log suggestion |
| E6 | Baseline corrupted | JSON parse or validation fails | Empty matrix + log warning. No Issue created |
| E7 | Disk full | Clone/convert fails mid-way | Single entry fails, others unaffected |
| E8 | Runner recycled | Runner disconnects mid-job | Automatic retry |
| E9 | Node version mismatch | Different versions produce different hashes | Locked to Node 22 (matches CI) |
| E10 | GITHUB_TOKEN lacks write perms | `gh` commands fail | Create Issue (workflow-permission-error) |
| F1 | PR merged, baseline updated | — | Next run starts from fresh baseline |
| F2 | PR reverted | Revert restores old baseline | Next run detects difference, re-creates PR |
| F3 | PR merged after converter change | Baseline may be stale (new converter = new hashes) | Next run auto-corrects |
| F4 | Maintainer pushes to PR branch | — | PR updates, normal review flow |

### Implementation Details

#### Race: remote.head vs synced.commit

Between `git ls-remote` and `git fetch`, the upstream repo may receive new commits. The code stores **`synced.commit`** (the actual `git rev-parse HEAD` value) in the baseline, not the `ls-remote` result. This ensures the baseline records the commit that was actually converted, avoiding unnecessary re-checks.

#### Default Branch Migration

When upstream changes its default branch (e.g. `master` → `main`), the local `origin/HEAD` is stale. After `git fetch`, the code runs `git remote set-head origin --auto` to sync automatically.

#### Stable Branch Names

PR branches use a stable name `update/${entryName}` (no date suffix). Existing PRs are updated via force push rather than re-created.

## Labels

| Label | Applies to | Description | Auto-created |
|-------|-----------|-------------|-------------|
| `registry-update` | PR | Converter output changed, review needed | ✅ |
| `repo-removed` | Issue | Upstream repo returned 404 | ✅ |
| `repo-access-error` | Issue | Upstream repo access denied | ✅ |
| `repo-archived` | Issue | Upstream repo has been archived | ✅ |
| `converter-failure` | Issue | Sync/convert/commit failed | ✅ |
| `workflow-permission-error` | Issue | GITHUB_TOKEN lacks permissions | ✅ |

## PR Template (generated)

```
## Summary

Registry entry **${displayName}** (${entryName}) has detected upstream changes.

| Field | Value |
|-------|-------|
| Source repo | ${repo} |
| Previous commit | ${oldCommit} |
| New HEAD | ${syncedCommit} |
| Commits behind | ${count} |
| ⚠️ Repository changed | ${oldRepo} → ${newRepo} | (repo change only)

### Changed output files

|   | File | Status |
|---|------|--------|
| ~ | src/index.ts | changed |
| + | src/new.ts | new |
| - | old.ts | missing |

### Upstream commits

```
abc1234 feat: add new API
def5678 fix: typo
```

> ⚠️ Repository changed — this entry previously pointed to ${oldRepo}.
> Verify the new repo is the correct upstream. (repo change only)

### Review checklist

- [ ] Confirm changes are expected
- [ ] If converter changes needed: push to this branch
- [ ] Test via TUI
- [ ] Merge after review
```

## Cache Strategy

Shares the `~/.cache/coc-converter-smoke/` directory with CI smoke tests.

```yaml
actions/cache@v4
  path: ~/.cache/coc-converter-smoke
  key: smoke-cache-${{ hashFiles('converter/src/**') }}
  restore-keys: smoke-cache-
```

Key invalidates when converter source changes. Caches are shared between CI and registry-check workflows via the common `smoke-cache-` prefix.

## Concurrency

```yaml
concurrency:
  group: registry-check
  cancel-in-progress: false
```

One run at a time. Matrix entries within a run are independent (max 8 parallel).

## Files

| File | Purpose |
|------|---------|
| `.github/workflows/registry-check.yml` | Main workflow |
| `.github/scripts/generate-matrix.ts` | Generates check matrix from registry + baseline |
| `.github/scripts/registry-check-entry.ts` | Per-entry check: ls-remote → convert → hash → PR/Issue |

### Dependencies

- `actions/checkout@v4`, `actions/setup-node@v4` (Node 22)
- `gh` CLI (pre-installed on GitHub runners)
- `tsx` (via converter devDependencies)
- Standard Ubuntu runner

### Environment Variables

| Variable | Source | Purpose |
|----------|--------|---------|
| `ENTRY_NAME` | workflow matrix | Current registry entry name |
| `GH_TOKEN` | `${{ secrets.REGISTRY_CHECK_PAT \|\| secrets.GITHUB_TOKEN }}` | `gh` CLI auth |
| `GIT_AUTHOR_NAME` | `coc-vscode-loader[bot]` | git commit author |
| `GIT_AUTHOR_EMAIL` | `bot@coc-vscode-loader` | git commit email |

## Common Scenarios

1. **No changes** — All upstream repos match baseline. No output.
2. **Docs-only upstream change** — New commit, but converter output unchanged. Skipped.
3. **New upstream feature** — Output hash changes. PR created. Review → merge.
4. **API breakage upstream** — Converter fails. converter-failure Issue created.
5. **PR not merged, upstream updates again** — Force push to existing PR branch. Same PR, fresh content.
6. **New registry entry** — No baseline. Skipped with log message. Run `npm run diff:baseline` manually.
7. **Upstream repo deleted** — 404. repo-removed Issue created.
