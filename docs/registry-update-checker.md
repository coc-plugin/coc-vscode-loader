# Registry 更新检测 — GitHub Action 设计方案

## 动机

Registry 中的每个条目都指向一个上游 VS Code 扩展仓库（如 `clangd/vscode-clangd`）。这些仓库独立演进 — 新的提交可能引入 API 变化，导致 converter 输出的代码失效。我们需要自动化检测，让维护者在用户遇到损坏的插件之前，就能 review 并更新 converter 的转换逻辑或 registry 配置。

## 设计原则

**每个过时的条目对应一个 PR。** 每个有新提交且导致 converter 输出变化的上游仓库，都会生成一个独立的 PR。这样可以保持 review 的隔离性，责任清晰，且回滚安全。

## 工作流：`registry-check.yml`

### 触发方式

```yaml
on:
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch:
```

### 权限

```yaml
permissions:
  contents: write
  pull-requests: write
  issues: write
```

### 任务总览

两个 job：**discover**（生成 matrix）→ **check**（matrix 并行处理每个条目）。

```
discover job（串行）：
  └─ 读取 registry.json + baseline.json
     ├─ 损坏 → 日志警告，输出空 matrix
     ├─ 空 → 提示跑 npm run diff:baseline，输出空 matrix
     └─ 正常 → 输出所有有 baseline 的条目作为 matrix

check job（matrix × 最多 8 并行，每个条目独立 runner）：
  ├─ 步骤 1：查 baseline._source.commit
  ├─ 步骤 2：git ls-remote HEAD 对比
  │   ├─ 一致 → 跳过
  │   ├─ 404 → 创建 Issue (repo-removed)
  │   ├─ 403 → 创建 Issue (repo-access-error)
  │   ├─ 仓库归档 → 创建 Issue (repo-archived)
  │   └─ 不一致 → 进入步骤 3
  ├─ 步骤 3：sync 上游仓库 + 跑 converter + hash 对比
  │   ├─ sync 失败 → 创建 Issue (converter-failure)
  │   ├─ 转换失败 → 创建 Issue (converter-failure)
  │   ├─ 输出没变 → 跳过（不创建任何东西）
  │   └─ 输出变了 → 进入步骤 4
  └─ 步骤 4：git commit + push + gh pr create/edit
      ├─ git commit 失败 → 创建 Issue (converter-failure)
      ├─ git push 失败 → 创建 Issue (workflow-permission-error)
      ├─ gh pr edit 已有 PR → 更新 body
      ├─ gh pr create 新 PR → label: registry-update
      └─ gh pr create 失败 → 创建 Issue (converter-failure) 作为 fallback
```

### 全部情形对照表

#### 阶段 A：条目自身

| # | 情形 | 检测方式 | 处理 | 实现状态 |
|---|------|---------|------|---------|
| A1 | 新条目，还没有 baseline | baseline.json 中查不到 | 跳过，日志提示跑 `npm run diff:baseline` | ✅ |
| A2 | 条目已从 registry.json 中删除 | registry.json 中找不到但 baseline 中有 key | 日志警告 orphaned baseline 条目 | ✅ |
| A3 | 条目的 source.repo 字段缺失 | registry.json 中无 source.repo | 跳过（非 github 来源，无法检测） | ✅ |
| A4 | 条目的 source.repo 值变了 | baseline._source.repo 跟 registry 不一致 | 日志警告 + PR body 中显示 repo 变更提示 | ✅ |
| A5 | 条目的 name 变了（改名） | baseline 中的 key 在 registry 找不到 | 日志警告 orphaned，旧 key 留在 baseline 手动清理 | ✅ |
| A6 | 条目的 `minPluginVersion` 高于当前版本 | registry.json 中的 minPluginVersion | 未实现（不影响检测，锦上添花） | ❌ |

#### 阶段 B：远程仓库

| # | 情形 | 检测方式 | 处理 | 实现状态 |
|---|------|---------|------|---------|
| B1 | 上游有新提交 | `git ls-remote HEAD` 跟 baseline commit 不同 | 进入 converter 对比步骤 | ✅ |
| B2 | 上游没有新提交 | `git ls-remote HEAD` 跟 baseline commit 相同 | 跳过 | ✅ |
| B3 | 上游仓库不存在（404） | `git ls-remote` 返回 404 | 创建 Issue，label: `repo-removed` | ✅ |
| B4 | 上游仓库访问被拒（403） | `git ls-remote` 返回 403 | 创建 Issue，label: `repo-access-error` | ✅ |
| B5 | 上游仓库已归档 | `gh api repos/$repo --jq .archived` 为 true | 创建 Issue，label: `repo-archived` | ✅ |
| B6 | 上游仓库改名 | `git ls-remote` 仍成功（GitHub 重定向） | 正常处理，PR body 包含 repo 变化提示 | ✅ |
| B7 | 上游仓库的默认分支改了 | `git ls-remote HEAD` 指向新的默认分支 | `git remote set-head origin --auto` 自动同步 | ✅ |
| B8 | 上游仓库 force push 过 | 新 HEAD 不再是旧 commit 的后代 | 正常处理（rev-list 可能无法计数，显示 unknown） | ✅ |
| B9 | 网络超时/临时不可达 | `git ls-remote` 超时或返回 5xx | 跳过，日志记录。不创建 Issue（避免网络抖动误报） | ✅ |

#### 阶段 C：Converter 转换

| # | 情形 | 检测方式 | 处理 | 实现状态 |
|---|------|---------|------|---------|
| C1 | 转换成功，输出跟 baseline 完全一致 | hash 全匹配 | 跳过。不创建任何东西 | ✅ |
| C2 | 转换成功，输出 hash 变了 | hash 比较有差异 | 进入 PR 创建 | ✅ |
| C3 | 输出文件增加了 | baseline 中不存在的文件 key | PR 中标记为 `new` | ✅ |
| C4 | 输出文件减少了 | baseline 中的文件 key 缺失 | PR 中标记为 `missing` | ✅ |
| C5 | Converter 报错 | `convert()` 函数抛异常 | 创建 Issue，label: `converter-failure` | ✅ |
| C6 | Converter 依赖安装失败 | `npm ci` 失败 | workflow 层面的 job 失败 | ✅ |
| C7 | Converter 运行超时 | 超过 tsx 执行时间 | 由 job 超时机制处理 | ✅ |
| C8 | 上游没有需要转换的代码 | output 目录为空 | empty hash vs baseline → 所有文件标记为 missing，创建 PR | ✅ |
| C9 | clone 超时/磁盘满 | `git clone --depth 1` 失败 | 创建 Issue，label: `converter-failure` | ✅ |

#### 阶段 D：PR 管理

| # | 情形 | 检测方式 | 处理 | 实现状态 |
|---|------|---------|------|---------|
| D1 | 没有同名 open PR | `gh pr list --head update/$NAME --state open` 返回空 | 创建新分支 + 新 PR | ✅ |
| D2 | 有同名 open PR | `gh pr list` 返回已有 PR 号 | force push 更新分支 + `gh pr edit` 刷新 body | ✅ |
| D3 | 同 draft PR | 同上（`--state open` 包含 draft） | 同上，保持 draft 状态 | ✅ |
| D4 | 同名 PR 已 merged | `--state open` 搜索不到 | 创建新 PR（分支被 GitHub 删了也没关系，重新 push） | ✅ |
| D5 | 同名 PR 已 closed（未合并） | 同上 | 创建新 PR（不用日期后缀，稳定分支名 `update/$NAME`） | ✅ |
| D6 | 同一条目多个 job（不可能） | matrix 按条目隔离 | 无需处理 | ✅ |
| D7 | PR 创建失败（merge 冲突等） | `gh pr create` 返回错误 | 创建 Issue（converter-failure）作为 fallback | ✅ |
| D8 | 多个 PR 同时改 baseline.json | 每个 PR 改自己的 key | Git 合并时处理不同 key，互不冲突 | ✅ |

#### 阶段 E：工作流运行

| # | 情形 | 检测方式 | 处理 | 实现状态 |
|---|------|---------|------|---------|
| E1 | 正常执行，部分条目有更新 | — | 每个有 diff 的条目创建/更新 PR | ✅ |
| E2 | 正常执行，没有条目有更新 | — | 工作流成功退出，无产出 | ✅ |
| E3 | 工作流被取消 | GitHub 发送 cancelled 事件 | 已创建的 PR 保留，下次 force push 更新 | ✅ |
| E4 | 并发运行 | `concurrency` 控制 | 排队执行，不取消正在运行的 | ✅ |
| E5 | 首次运行（无 baseline） | baseline.json 不存在或为空 | 输出空 matrix + 日志提示跑 `npm run diff:baseline` | ✅ |
| E6 | baseline.json 损坏 | JSON.parse 报错或结构校验失败 | 输出空 matrix + 日志提示重新生成。不创建 Issue | ✅ |
| E7 | 磁盘空间不足 | clone/converter 失败 | 单个 matrix entry 失败，不影响其他 | ✅ |
| E8 | Runner 被回收 | 偶发的 runner 断开 | 失败的 matrix entry 自动重试 | ✅ |
| E9 | Node.js 版本不一致导致 hash 变化 | 不同版本可能输出不同 | 锁定 Node 22，跟 CI 保持一致 | ✅ |
| E10 | GITHUB_TOKEN 没有写入权限 | gh 命令失败 | 创建 Issue，label: `workflow-permission-error` | ✅ |

#### 阶段 F：合并后

| # | 情形 | 处理 | 实现状态 |
|---|------|------|---------|
| F1 | PR 正常合并，baseline 更新 | 下次检测从新 baseline 开始 | ✅ |
| F2 | PR 被 revert | revert commit 把 baseline 回旧值，下次检测自动发现差异 | ✅ |
| F3 | PR 在 converter 代码修改之后合入 | 合入的 baseline 可能过时（新 converter 产出不同 hash），下次检测自动校正 | ✅ |
| F4 | 维护者在 PR 上 push converter 修改 | PR 自动更新，正常 review 流程 | ✅ |

### 重要实现细节

#### 竞态处理：remote.head vs synced.commit

`git ls-remote` 和 `git fetch` 之间，上游仓库可能有新提交进入。代码使用 **`synced.commit`**（实际 `git rev-parse HEAD` 的值）来存储 baseline，而非 `ls-remote` 的结果。确保 baseline 记录的是真正经过转换的 commit。

#### 默认分支变更处理

上游仓库改了默认分支（如 `master` → `main`）时，本地 `origin/HEAD` 不会自动更新。代码在 `git fetch` 后执行 `git remote set-head origin --auto`，确保 `origin/HEAD` 指向正确的默认分支。

#### 稳定分支名

PR 分支使用稳定名称 `update/${entryName}`（不含日期后缀），这样已有 PR 时可以直接 force push 更新，不需要重建。

## Label 体系

| Label | 应用于 | 含义 | 自动创建 |
|-------|--------|------|---------|
| `registry-update` | PR | Converter 输出变了，需要人工审核 | ✅ |
| `repo-removed` | Issue | 上游仓库不存在（404） | ✅ |
| `repo-access-error` | Issue | 上游仓库访问被拒 | ✅ |
| `repo-archived` | Issue | 上游仓库已归档 | ✅ |
| `converter-failure` | Issue | Converter 同步/转换/提交失败 | ✅ |
| `pr-merge-conflict` | Issue | PR 存在合并冲突 | ❌（未使用，由 gh 自动处理） |
| `workflow-permission-error` | Issue | GITHUB_TOKEN 权限不足 | ✅ |

## PR 模板（实际代码中的）

```
## Summary

Registry entry **${displayName}** (${entryName}) has detected upstream changes.

| Field | Value |
|-------|-------|
| Source repo | ${repo} |
| Previous commit | \`${oldCommit}\` |
| New HEAD | \`${syncedCommit}\` |
| Commits behind | ${count} |
| ⚠️ Repository changed | \`${oldRepo}\` → \`${newRepo}\` | (仅 repo 变更时显示)

### Changed output files

|   | File | Status |
|---|------|--------|
| ~ | src/index.ts | changed |
| + | src/new-feature.ts | new |
| - | old-file.ts | missing |

### Upstream commits

\`\`\`
abc1234 feat: add new API
def5678 fix: typo in docs
\`\`\`

> ⚠️ **Repository changed** — this entry previously pointed to \`${oldRepo}\`. Verify the new repo is the correct upstream. (仅 repo 变更时显示)

### Review checklist

- [ ] Confirm changes are expected
- [ ] If converter changes needed: push to this branch
- [ ] Test via TUI
- [ ] Merge after review
```

## Cache 策略

复用 smoke test 的缓存目录 `~/.cache/coc-converter-smoke/`，和 CI 共享缓存。

```yaml
actions/cache@v4
  path: ~/.cache/coc-converter-smoke
  key: smoke-cache-${{ hashFiles('converter/src/**') }}
  restore-keys: smoke-cache-
```

注意点：
- converter 代码变化时 key 失效，所有仓库重新 clone
- 每个条目 clone 自己的上游仓库，互不影响
- CI 和 registry-check 共享缓存（key 前缀相同）
- 通过 `hashFiles('converter/src/**')` 跟踪 converter 代码变更

## 并发控制

```yaml
concurrency:
  group: registry-check
  cancel-in-progress: false
```

- 同一时间只运行一次检测
- 排队等待，不取消正在运行的
- Matrix 内各条目并行（max 8），互不影响

## 风险汇总

| # | 风险 | 应对 |
|---|------|------|
| 1 | `git ls-remote` API 限速 | 130 条目 × 1 请求 = 130 次/天。GitHub 限制 5000 次/小时，安全 |
| 2 | 误报（上游有提交但输出没变） | 跳过，不创建任何东西 |
| 3 | 同一条目短时间内多次更新 | 每天只跑一次，已有 PR 时 force push 更新而非重建 |
| 4 | Converter 转换失败 | 创建 Issue 而不是 PR，避免误导 |
| 5 | 上游仓库已删/改名/归档 | 创建对应 label 的 Issue |
| 6 | 多个 PR 同时修改 baseline.json | 每个 PR 只改自己 key 下的内容，Git 自动合并 |
| 7 | 首次运行没有 baseline | 跳过，提示先跑 `diff:baseline` |
| 8 | baseline.json 损坏 | 日志警告 + 输出空 matrix |
| 9 | GITHUB_TOKEN 权限不足 | 创建 Issue，提醒配置 PAT |
| 10 | CI 不触发（GITHUB_TOKEN 创建的 PR） | 可选：配置 `REGISTRY_CHECK_PAT` secret，用个人 token 创建 PR |
| 11 | 竞态：ls-remote 和 fetch 之间仓库有新提交 | 用 `synced.commit` 存 baseline，避免无限 re-check |

## 实现文件

| 文件 | 说明 |
|------|------|
| `.github/workflows/registry-check.yml` | 主工作流 |
| `.github/scripts/generate-matrix.ts` | 生成检测 matrix |
| `.github/scripts/registry-check-entry.ts` | 单个条目的完整检测 + PR/Issue 创建 |

### 依赖

- `actions/checkout@v4`
- `actions/setup-node@v4`（Node 22）
- `gh` CLI（GitHub 运行器预装）
- `tsx`（通过 converter/ 的 devDependencies 安装）
- 标准 Ubuntu 运行器

### 环境变量

| 变量 | 来源 | 用途 |
|------|------|------|
| `ENTRY_NAME` | workflow matrix | 当前检测的 registry 条目名 |
| `GH_TOKEN` | `secrets.REGISTRY_CHECK_PAT \|\| secrets.GITHUB_TOKEN` | gh CLI 鉴权 |
| `GIT_AUTHOR_NAME` | 硬编码 `coc-vscode-loader[bot]` | git commit author |
| `GIT_AUTHOR_EMAIL` | 硬编码 `bot@coc-vscode-loader` | git commit email |

## 场景演示

#### 场景 1：一切正常，无变化
上游最近没有提交。跳过所有条目。工作流成功退出，0 个 PR。

#### 场景 2：上游小改动，输出不变
上游改了 README / 加了测试。检测到新 commit，转换后 hash 一致。跳过，无事发生。

#### 场景 3：上游加新特性，输出变了
上游加了新 API。检测到 hash 变化。创建 PR。review 后判断是预期内的，merge。

#### 场景 4：上游改 API，converter 失效
上游破坏了兼容性。converter 报错。创建 converter-failure Issue。修复 converter 后关闭 Issue。

#### 场景 5：PR 没合，上游又更新了
第二天检测又发现更新。工作流 force push 更新了已有 PR 的分支和 body。同一个 PR，内容已刷新。

#### 场景 6：新加了 registry 条目
新条目没有 baseline。generate-matrix 日志提示跑 `npm run diff:baseline`。手动执行一次 baseline 后，下次检测开始正常跟踪。

#### 场景 7：上游仓库被删除
`git ls-remote` 返回 404。创建 repo-removed Issue。从 registry 中移除该条目或找替代品。
