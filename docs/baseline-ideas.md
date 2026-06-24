# Baseline Diff System — Feature Idea Collection

Various user-facing and developer-facing feature ideas extending from the `converter/baseline.json` (output file SHA-256 fingerprint database).

---

## Table of Contents

- [User-Facing Features](#user-facing-features)
- [Developer-Facing Features](#developer-facing-features)
- [Advanced / Infrastructure](#advanced--infrastructure)

---

## User-Facing Features

### 1. `loader.verify` — Plugin Integrity Verification

Recompute SHA-256 for installed plugin output files and compare against the hash recorded at installation time.

```
:CocCommand loader.verify
```

Output:
```
vscode-eslint     ✓ (3/3 files match)
vscode-prettier   ✗ src/index.ts hash mismatch, reinstall recommended
vscode-pyright    ✓ (5/5 files match)
```

Can distinguish:
- hash matches → normal
- hash mismatch but file exists → may have been manually modified
- file missing → corrupted, reinstall recommended
- extra files → may have been manually added

**User scenario**: When suspecting a plugin is malfunctioning, one-click check for file corruption.

---

### 2. `loader.whatChanged` — Cross-Version Impact Preview

After upgrading `coc-vscode-loader`, compare the new version's bundled baseline with the old baseline to tell users which plugins' outputs have changed.

```
:CocCommand loader.whatChanged
```

Output:
```
Cross-version impact analysis (v1.5.8 → v1.6.0):

[vscode-eslint]
  ~ src/index.ts — conversion logic optimization
  ~ package.json — dependency version update
  ⚠ Reinstall recommended

[vscode-prettier]
  + esbuild.mjs   — new build script
  ~ src/index.ts  — refactored config module
  ⚠ Reinstall recommended

[vscode-pyright]
  ✓ No changes

The remaining 126 plugins have no changes, no action needed.
```

Implementation:
- Include the `baseline.json` at publish time in the npm package
- After upgrade, read the local old baseline (user cache) and the new baseline from the package
- Compute hash diff per entry
- Only report entries whose source commit hash is the same (i.e., the source repo hasn't changed)

**User scenario**: After upgrade, no need to blindly reinstall all plugins — only reinstall those that actually changed.

---

### 3. Automatic Rollback on Installation Failure

When installing a plugin via the pipeline, first record a hash snapshot of current files. If any step fails during installation/compilation, automatically restore files to the snapshot state.

```
Installing vscode-eslint...
  ✓ Git clone
  ✓ Convert
  ✗ npm install (network timeout)
  → Rolling back... ✓ Restored to original state
```

Implementation: backup with `rsync -a` or `cp -r` before installation → restore on failure → delete backup on success.

**User scenario**: `npm install` fails due to network instability without affecting existing plugins.

---

### 4. `loader.doctor` — One-Click Diagnosis

Combine multiple checks and output a health report.

```
:CocCommand loader.doctor
```

Output:
```
[coc-vscode-loader Diagnostic Report]

System Environment
  Node.js:  v20.11.0  ✓
  Git:      ️ 2.43.0   ✓
  Neovim:   0.10.0    ✓

Installed Plugins (5)
  ✓ vscode-eslint         (integrity check passed)
  ✓ vscode-prettier       (integrity check passed)
  ✓ vscode-pyright        (integrity check passed)
  ✓ vscode-ansible        (integrity check passed)
  ✗ vscode-tailwindcss    (server/ directory missing, please reinstall)

Upgrade Impact
  Current v1.5.8 → Latest v1.6.0
  Affects 2/5 installed plugins: eslint, prettier
  Run :CocCommand loader.whatChanged for details
```

**User scenario**: Collect standardized diagnostic information when problems occur, for easier troubleshooting and bug reporting.

---

### 5. Configuration Traceability / Read-Only Protection

Detect whether users have manually modified converted output files (common for beginners who directly edit `src/index.ts`).

```
:CocCommand loader.audit
```

Output:
```
vscode-eslint/src/index.ts — hash mismatch
  Installed: 2026-06-20
  Last modified: 2026-06-22 (user manually edited)
  Note: Reinstalling will overwrite your changes
```

Optional: Set read-only permissions on output directories (`chmod -w` after pipeline installation).

**User scenario**: Troubleshoot after users break files by editing them, or prevent accidental modifications.

---

### 6. Incremental Installation Cache

In the pipeline, compute a hash of the source file directory (`find . -type f | xargs md5sum`) and compare against the source hash saved from the last installation:

- hash matches → skip `npx tsx convert`, use cached output
- npm dependencies unchanged (`package.json` hash matches) → skip `npm install`

Installing 10 unchanged plugins goes from ~5s each to ~0.2s each (pure `cp`).

**User scenario**: Significantly speed up batch reinstalls; avoid unnecessary work in CI when repeatedly converting the same version of a source repo.

---

### 7. Silent Verification + Startup Notification

When coc starts, run hash verification asynchronously in the background (only for installed plugins), and show a badge in the status bar or pop a notification when inconsistencies are found.

```
coc - 1 plugin needs reinstall (run :CocCommand loader.verify)
```

Does not block startup, but makes users aware of the problem.

**User scenario**: Forget to reinstall after upgrade, automatically reminded next time vim is opened.

---

### 8. File-Level Diff Details

Not just knowing that something changed, but showing the specific changes:

```
vscode-eslint/src/index.ts:
   Old hash: a3f2b8c1...
   New hash: 7e4d1a2f...
   ~ Line 42:   client.start() → client.start().catch(console.error)
   ~ Line 78:   removed deprecated method
```

Implementation: Store old version files + new converted output files in the baseline, display with `diff` tool. However, storing old files increases baseline size, requiring a trade-off. Optionally only store baseline diffs for the last two versions.

**User scenario**: Advanced users or developers want to understand exactly what changed.

---

### 9. Batch Reinstall Sorting

Sort plugins requiring reinstallation by degree of hash change:
- Prioritize those with large file count changes (e.g., `esbuild.mjs` was added)
- Prioritize those with more files having different hashes
- Prioritize those with larger actual content changes (compare line count changes)

```
Reinstall Priority:
  1. vscode-eslint      (4 files changed)  ️
  2. vscode-prettier    (2 files changed)
  3. vscode-slither     (1 file changed)
```

**User scenario**: When batch reinstalling, prioritize higher-risk plugins to avoid not knowing which one caused issues after reinstalling too many at once.

---

### 10. Multi-Version Baseline Retention

Keep baseline snapshots + corresponding output file backups for the last 2-3 versions locally. If users find issues after trying a new version, they can quickly switch back to the old version's file set.

```
:CocCommand loader.rollback vscode-eslint
Available snapshots:
  [1] v1.5.8 (2026-06-20) ← current
  [2] v1.5.6 (2026-06-10)
  [3] v1.5.4 (2026-05-28)
```

Space cost: ~50KB baseline per version + plugin output file set (average ~1MB/plugin × 8 = 8MB). Auto-cleanup can be configured with a time limit.

**User scenario**: Quickly rollback when a new version has bugs, without waiting for a fix.

---

## Developer-Facing Features

### 11. Local Development Verification

After modifying converter code, developers run a lightweight diff check:

```bash
npx tsx scripts/diff-check.ts check --local   # only check locally cached repos
```

Much faster than full CI (skips downloads), suitable for quick feedback during development.

---

### 12. PR Impact Preview

Automatically comment in GitHub PRs to show baseline changes:

```
## Baseline Diff

| Status | Entry | Changed Files |
|------|------|----------|
| ~ | vscode-eslint | src/index.ts, package.json |
| ~ | vscode-prettier | src/index.ts |
| + | vscode-new-plugin | (6 files) |
| ✓ | Remaining 125 entries | No changes |

Please review the above changes to confirm no unintended breakage.
```

Implemented via GitHub Actions, providing information before the PR is reviewed.

---

### 13. Zero-Impact Release Check

CI automatically checks before npm publish: if all registry entries' baseline hashes haven't changed in this release, it means no code generation changes, so emit a no-op changelog.

```json
{
  "version": "1.5.9",
  "baselineImpact": "none",
  "releaseNotes": "Registry update only, no code generation changes"
}
```

---

### 14. Change Classification (break / feature / fix)

Manually tag baseline diffs:

```bash
npx tsx scripts/diff-check.ts tag --type=break "eslint: new client.start guard"
```

Record in `baseline.json`:

```json
{
  "vscode-eslint": {
    "_changelog": ["new client.start() guard"],
    "_impact": "break"   // break | feature | fix
  }
}
```

Automatically summarize into compatibility notes when publishing.

---

### 15. Automatic Test Case Generation

When baseline detects differences, automatically generate fixture test cases (input/output pair) for the changed parts to prevent them from being changed back later.

---

## Advanced / Infrastructure

### 16. Remote Hash Verification

Registry server stores CI-verified hash sets, client adds `--remote` mode:

```
:CocCommand loader.verify --remote
```

Not only compare against local cached hash, but also against the registry's officially certified hash. If local hash matches remote, the installed version is "officially certified"; if not, the local environment differs.

**User scenario**: Troubleshoot issues where hash hasn't changed but the plugin is not working.

---

### 17. Plugin Dependency Graph + Impact Chain Analysis

Multiple plugins may share the same language server (e.g., both eslint and stylelint depend on eslint LSP). When conversion logic involves shared server code, the baseline can help analyze the impact chain.

```
vscode-eslint  (esbuild.mjs + src/index.ts changed)
  └── Shared eslint server → may affect vscode-stylelint
  └── Shared eslint config → may affect vscode-code-actions
```

Implementation: Declare `sharedModules` or `sharedServers` in the registry, combined with baseline diff for automatic derivation.

---

### 18. Incremental Baseline Update

Currently `diff:baseline` fully reconverts all entries (~5 minutes). Improve to incremental mode:

- Only reconvert entries whose source repo commit hash has changed
- Keep old baseline data for remaining entries
- Append new registry entries

```bash
npm run diff:baseline --incremental   # ~30s vs ~5min
```

---

### 19. Output File Tree Snapshot

Not just hashes, the baseline can also store the file tree structure (paths + whether directory), used to detect:
- Added files (e.g., newly added `esbuild.mjs`)
- Deleted files
- Directory structure changes (e.g., `server/` changed to `server/out/`)

```json
{
  "vscode-eslint": {
    "_tree": {
      "esbuild.mjs": "file",
      "src/index.ts": "file",
      "server/": "dir",
      "server/eslintServer.js": "file"
    }
  }
}
```

---

### 20. Client-Side Baseline Reporting (Anonymous)

Users can optionally anonymously report local baseline hash verification results:

```
Plugin: vscode-eslint
Status: ✓ hash matches
Version: coc-vscode-loader v1.5.8
Platform: linux-x64
```

Helps developers understand:
- Which plugins are most common in user environments
- Whether there are platform-specific file corruption issues
- User version distribution

---

### 21. Security — Tamper Detection

If a plugin's output files are maliciously tampered with (e.g., injected malicious code), hash verification can detect the anomaly. Combined with `--remote` mode to compare against official hashes, the output is safe if it matches the official version.

For users seeking high security, this can be made mandatory: refuse to load any plugin whose hash doesn't match the remote on startup.

---

### 22. Debug Mode — Per-File Restore

During debugging, you can restore individual plugin output files to a specific baseline version's state:

```
:CocCommand loader.revertFile vscode-eslint src/index.ts v1.5.6
```

Requires the baseline to not only store hashes but also file archives (e.g., tar.gz). High storage cost, but very useful during debugging.

---

### 23. Staged Change Rollout

The registry can mark the impact level of baseline diffs, allowing users to "only install plugins without breaking changes":

```vim
" Configuration
let g:coc_loader_update_policy = 'safe'  " only accept fix/feature, reject break
```

Implemented in conjunction with change classification from Section 14.

---

### 24. Performance Baseline

Also record conversion duration in the baseline:

```json
{
  "vscode-eslint": {
    "_perf": {
      "convertMs": 1240,
      "buildMs": 3800,
      "totalMs": 5200
    }
  }
}
```

Compare performance changes in CI, alert when a transform change causes conversion time to double.

---

### 25. Smart Skip Reinstallation

During installation, compare hash and mtime for each output file individually, only writing files that actually changed. This can significantly reduce disk I/O during the `installToCoc` phase.

Also avoid unnecessary `npm install` (when `package.json` hash hasn't changed).

---

## More Ideas

### 26. Plugin Stability Rating

Track the frequency of file hash changes per plugin across baseline iterations. More frequent changes → worse conversion stability → display stability rating to users:

```
vscode-eslint     ⭐⭐⭐ (13 baseline changes, relatively stable)
vscode-prettier   ⭐⭐    (28 baseline changes, frequently changing)
vscode-pyright    ⭐⭐⭐⭐ (3 baseline changes, very stable)
```

Help users decide which plugins are worth installing and which may frequently cause issues.

---

### 27. Local Patch Tracking

Users may manually patch converted output files. Baseline diff can detect when "file hash is neither the baseline version nor the newly converted version", indicating custom user modifications.

In this case, during upgrade, automatically:
1. Identify the user's local patch
2. Retry applying it on the new version using `git apply` or similar mechanism
3. Prompt user to manually merge if conflicts arise

```vim
:CocCommand loader.patchList vscode-eslint
  1. src/index.ts — custom documentSelector (2026-06-20)
  2. server/eslintServer.js — disabled pull diagnostics (2026-06-18)
```

---

### 28. Conversion Log Audit

Generate detailed logs on each conversion, including:
- Which files were created/modified/deleted
- Duration of each transform step
- Line-level records of text replacements

Stored in `build/conversion.log`, run when users report bugs:

```vim
:CocCommand loader.bugReport vscode-eslint
```

Automatically package the following:
- `conversion.log`
- Input vs output hash comparison
- `package.json`
- coc.nvim version information
- Platform information

Generate an archive file that can be directly attached to a GitHub issue.

---

### 29. Smart Dependency Pruning

By comparing output files in the baseline vs packages actually referenced in `node_modules`, automatically identify unused dependencies:

```bash
# Analyze vscode-eslint's node_modules
eslint-server.js uses: vscode-languageclient, vscode-languageserver
Unused packages: chalk, ora, cli-truncate  → suggest removal (-1.2MB)
```

Work with `keepDeps`/`excludeDeps` to automatically optimize the output `package.json`. Re-evaluate on each upgrade.

---

### 30. Plugin Health Dashboard

Add a new tab in the TUI (`Tab 9: Health`) to display a global status dashboard:

```
┌─ coc-vscode-loader Health ───────────────────┐
│                                               │
│  Installed: 8    Intact: 5   Needs Reinstall: 2   Damaged: 1 │
│                                               │
│  ️ vscode-eslint      ● Intact                │
│  ️ vscode-prettier    ● Intact                │
│  ⚠ vscode-pyright     ◐ Needs Reinstall (hash mismatch)│
│  ⚠ vscode-ansible     ◐ Needs Reinstall (node_modules missing)│
│  ✗ vscode-html        ○ Damaged (server/ missing)│
│                                               │
│  Last verified: 2026-06-23 14:30             │
│  Health: 62.5%                                │
└───────────────────────────────────────────────┘
```

---

### 31. Custom Alert Rules

Users can write Lua/VimL rules to trigger notifications based on baseline events:

```vim
" ~/.vim/coc-loader-rules.vim
" Send a message when a plugin's hash changes
call LoaderRule('hashChanged', 'vscode-eslint', {-> execute('echo "eslint has been updated, please reinstall"')})

" Pop a warning when damaged plugins exceed 3
call LoaderRule('damagedCount', 3, {-> execute('call s:showWarning()')})
```

---

### 32. Conversion Quality Score

Automatically run quality checks on each plugin every time the baseline is updated:

| Check Item | Weight | Description |
|--------|------|------|
| Output file syntax is correct | 30% | `node --check` no errors |
| TypeScript compilation passes | 25% | `tsc --noEmit` |
| esbuild bundling succeeds | 20% | `node esbuild.mjs` |
| LanguageClient startup reachable | 15% | Mock `require` returns no error |
| no-eval / no-deprecated | 10% | Check for unsafe usage |

Plugins scoring below 60 are marked as `unstable`, shown with an ⚠ icon in the TUI, and prompt the user during installation: "This plugin's conversion quality is low and may not work properly."

---

### 33. Installation Signature

Add an HMAC signature layer beyond the baseline hash:

```json
{
  "vscode-eslint": {
    "src/index.ts": "sha256hash...",
    "_hmac": "a1b2c3... (HMAC-SHA256, key=device-specific)"
  }
}
```

Verify HMAC with device-specific key during installation, preventing:
- Local baseline file tampering
- Silent data corruption due to disk damage
- Permission escalation in multi-user shared systems

---

### 34. Environment Difference Compensation

Automatically filter out platform-related fields during cross-platform diff:

```json
{
  "vscode-eslint": {
    "esbuild.mjs": {
      "linux-x64": "hashA...",
      "darwin-arm64": "hashA...",
      "win32-x64": "hashB..."    // Windows path separator differs
    }
  }
}
```

Only compare hashes for the current platform during diff, avoiding false reports for other platforms. Automatically match new entries from CI's multi-platform baseline.

---

### 35. Cold Start Prewarming

Use baseline information to predict which plugins' code paths change most frequently, and asynchronously prewarm these modules' require cache when vim starts:

```typescript
// On plugin activation
const volatilePlugins = baseline.getMostChanged(5)  // top 5 most changed
for (const p of volatilePlugins) {
  require(p.entryPoint)  // preload to reduce latency on first user trigger
}
```

Only do this during idle time, does not affect startup speed.

---

### 36. Multi-Node Version Compatibility Matrix

In CI, run full conversion on Node.js 18/20/22 respectively, generating three baselines:

```
baseline-v18.json
baseline-v20.json  ← main version
baseline-v22.json
```

If a file's hash differs on a specific Node version (e.g., esbuild output differences), automatically mark compatibility:

```
vscode-eslint/esbuild.mjs:
  ✓ Node 18
  ✓ Node 20
  ⚠ Node 22 — hash differs, esbuild output format varies
```

---

### 37. CLI Export SBOM

Based on baseline + actual `node_modules`, export a Software Bill of Materials (SBOM) to meet enterprise security compliance requirements:

```bash
npx tsx scripts/export-sbom.ts --format=cyclonedx
```

Output:
```json
{
  "bomFormat": "CycloneDX",
  "components": [
    {
      "name": "vscode-eslint",
      "version": "2.4.0",
      "purl": "pkg:npm/vscode-eslint-converted@1.0.0",
      "hashes": [{"alg": "SHA-256", "content": "a1b2c3..."}],
      "dependencies": [
        {"ref": "pkg:npm/vscode-languageclient@9.0.0"}
      ]
    }
  ]
}
```

---

### 38. Slow File Monitoring

Record the duration of each `readFile` during baseline verification. If a file's read time consistently increases (e.g., from 2ms to 200ms), warn the user that the disk may have issues:

```
⚠ Abnormal I/O detected:
  vscode-eslint/src/index.ts read time increased from 2ms to 210ms
  Possible causes: disk failure / filesystem fragmentation / storage media degradation
```

---

### 39. Conversion History Chart

Visualize in the TUI how many times each plugin's baseline has changed across version iterations:

```
Plugin Change Frequency (Last 10 Versions)
┌────────────────────────────────────────────────────────┐
│ eslint      ██████████▏  2 times                        │
│ prettier    ████████████████████▌  4 times              │
│ pyright     █████▎  1 time                             │
│ ansible     ██████████████████████████████████▏  7 times│
│ html        ████████████████████████████████████████ 8 times│
└────────────────────────────────────────────────────────┘
```

At a glance, see which plugin is the most "volatile", helping decide whether to wait for stability before installing.

---

### 40. User Voting for Default Behavior

For controversial transform changes (e.g., changing code generation style), show two baseline variants in the TUI for users to preview:

```
vscode-eslint has two optional output styles:

[A] Current (v1.5.8) — client.start() direct call
    src/index.ts hash: a1b2c3

[B] Candidate (v1.6.0) — client.start() with .catch()
    src/index.ts hash: d4e5f6

Which would you like to use on the next update?
➤ [A] Keep current  [B] Switch to new  [S] Skip this plugin
```

Voting results are anonymously reported, helping maintainers gauge community preferences.

---

## Priority Suggestions

### P0 — High Immediate User Value, Low Implementation Cost

| # | Feature | Reason |
|---|------|------|
| 1 | `loader.verify` | Most intuitive, entry point for hash system |
| 2 | `loader.whatChanged` | Solves the core pain point of upgrade reinstalls |
| 3 | Automatic rollback on install failure | Improves user experience reliability |

### P1 — High Value, But Requires Some Architectural Changes

| # | Feature | Reason |
|---|------|------|
| 4 | `loader.doctor` | Integrates existing checks, improves supportability |
| 6 | Incremental installation cache | Significantly improves reinstall speed |
| 7 | Silent verification + notification | Entry point for passively discovering issues |
| 28 | Conversion log audit | Essential info for bug reports |
| 30 | Plugin health dashboard | Global status at a glance |

### P2 — Nice to Have

| # | Feature | Reason |
|---|------|------|
| 5 | Configuration traceability / read-only protection | Prevents user misoperation |
| 8 | File-level diff details | More transparent information |
| 9 | Batch reinstall sorting | Batch scenario optimization |
| 10 | Multi-version baseline retention | Advanced user rollback needs |
| 26 | Plugin stability rating | Aids user decision-making |
| 27 | Local patch tracking | Advanced user customization needs |
| 29 | Smart dependency pruning | Reduces plugin size |
| 31 | Custom alert rules | Extensibility |
| 35 | Cold start prewarming | Optimizes startup experience |

### P3 — Developer-Facing Tools

| # | Feature | Reason |
|---|------|------|
| 11 | Local development verification | Improves developer experience |
| 12 | PR impact preview | CI collaboration |
| 13 | Zero-impact release check | Release quality |
| 14 | Change classification | Release management |
| 15 | Automatic test generation | Prevents regression |
| 32 | Conversion quality score | Automated quality gate |
| 36 | Multi-Node compatibility matrix | Cross-version verification |
| 39 | Conversion history chart | Aids decision-making |
| 40 | User voting | Community-driven |

### P4 — Advanced Infrastructure

| # | Feature |
|---|------|
| 16 | Remote hash verification |
| 17 | Plugin dependency graph + impact chain |
| 18 | Incremental baseline update |
| 19 | Output file tree snapshot |
| 20 | Client-side anonymous reporting |
| 21 | Security tamper detection |
| 22 | Per-file restore debugging |
| 23 | Staged change rollout |
| 24 | Performance baseline |
| 25 | Smart skip reinstallation |
| 33 | Installation signature |
| 34 | Environment difference compensation |
| 37 | CLI export SBOM |
| 38 | Slow file monitoring |

---

## Implementation Dependencies

Most features depend on the following infrastructure:

- [ ] Cache hash snapshot on client during installation (`~/.config/coc/coc-vscode-loader/hashes/`)
- [ ] Include `baseline.json` with npm publish
- [ ] Ability to programmatically read and compare baseline on client side
- [ ] Command module independent of TUI (`src/commands/` or `src/baseline.ts`)

## Minimum Initial Implementation

To get most of these ideas working, the minimum starting point is:

1. In the pipeline, automatically write a `package.hash.json` to the plugin directory after successful installation
2. Provide `loader.verify` command to read and compare
3. Bundle a `baseline.json` in the npm package
4. Provide `loader.whatChanged` to read the baseline from the package and perform diff

These three features are interdependent and can be implemented together.

---

## Feature List Summary

| # | Feature | Category | Priority |
|---|------|------|------|
| 1 | `loader.verify` — Integrity Verification | User | P0 |
| 2 | `loader.whatChanged` — Cross-Version Preview | User | P0 |
| 3 | Automatic Rollback on Install Failure | User | P0 |
| 4 | `loader.doctor` — One-Click Diagnosis | User | P1 |
| 5 | Configuration Traceability / Read-Only Protection | User | P2 |
| 6 | Incremental Installation Cache | User | P1 |
| 7 | Silent Verification + Startup Notification | User | P1 |
| 8 | File-Level Diff Details | User | P2 |
| 9 | Batch Reinstall Sorting | User | P2 |
| 10 | Multi-Version Baseline Retention | User | P2 |
| 11 | Local Development Verification | Dev | P3 |
| 12 | PR Impact Preview | Dev | P3 |
| 13 | Zero-Impact Release Check | Dev | P3 |
| 14 | Change Classification (break / feature / fix) | Dev | P3 |
| 15 | Automatic Test Case Generation | Dev | P3 |
| 16 | Remote Hash Verification | Infrastructure | P4 |
| 17 | Plugin Dependency Graph + Impact Chain | Infrastructure | P4 |
| 18 | Incremental Baseline Update | Infrastructure | P4 |
| 19 | Output File Tree Snapshot | Infrastructure | P4 |
| 20 | Client-Side Anonymous Reporting | Infrastructure | P4 |
| 21 | Security Tamper Detection | Infrastructure | P4 |
| 22 | Per-File Restore Debugging | Infrastructure | P4 |
| 23 | Staged Change Rollout | Infrastructure | P4 |
| 24 | Performance Baseline | Infrastructure | P4 |
| 25 | Smart Skip Reinstallation | Infrastructure | P4 |
| 26 | Plugin Stability Rating | User | P2 |
| 27 | Local Patch Tracking | User | P2 |
| 28 | Conversion Log Audit | User | P1 |
| 29 | Smart Dependency Pruning | User | P2 |
| 30 | Plugin Health Dashboard | User | P1 |
| 31 | Custom Alert Rules | User | P2 |
| 32 | Conversion Quality Score | Dev | P3 |
| 33 | Installation Signature | Infrastructure | P4 |
| 34 | Environment Difference Compensation | Infrastructure | P4 |
| 35 | Cold Start Prewarming | User | P2 |
| 36 | Multi-Node Version Compatibility Matrix | Dev | P3 |
| 37 | CLI Export SBOM | Infrastructure | P4 |
| 38 | Slow File Monitoring | Infrastructure | P4 |
| 39 | Conversion History Chart | Dev | P3 |
| 40 | User Voting for Default Behavior | Dev | P3 |
