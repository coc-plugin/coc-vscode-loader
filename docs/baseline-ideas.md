# Baseline 差异系统 — 功能创意集

基于 `converter/baseline.json`（输出文件 SHA-256 指纹库）延伸的各类用户侧和开发侧功能设想。

---

## 目录

- [用户侧功能](#用户侧功能)
- [开发侧功能](#开发侧功能)
- [高级 / 基础设施](#高级--基础设施)

---

## 用户侧功能

### 1. `loader.verify` — 插件完整性校验

对已安装插件的输出文件重新计算 SHA-256，与安装时记录的 hash 对比。

```
:CocCommand loader.verify
```

输出：
```
vscode-eslint     ✓ (3/3 文件一致)
vscode-prettier   ✗ src/index.ts 哈希不匹配，建议重新安装
vscode-pyright    ✓ (5/5 文件一致)
```

可区分：
- hash 匹配 → 正常
- hash 不匹配但文件存在 → 可能被手动修改过
- 文件缺失 → 损坏，建议重装
- 多余文件 → 可能被手动添加

**用户场景**：怀疑某个插件工作异常时，一键排查是否文件损坏。

---

### 2. `loader.whatChanged` — 跨版本影响预览

升级 `coc-vscode-loader` 后，对比新版本内置的 baseline 与旧版 baseline，告诉用户哪些插件的输出发生了变化。

```
:CocCommand loader.whatChanged
```

输出：
```
跨版本影响分析 (v1.5.8 → v1.6.0):

[vscode-eslint]
  ~ src/index.ts — 转换逻辑优化
  ~ package.json — 依赖版本更新
  ⚠ 建议重新安装

[vscode-prettier]
  + esbuild.mjs   — 新增打包脚本
  ~ src/index.ts  — 拆分配置模块
  ⚠ 建议重新安装

[vscode-pyright]
  ✓ 无变化

其余 20 个插件均无变化，无需处理。
```

实现方案：
- 发布时在 npm 包中附带发布时的 `baseline.json`
- 升级后读取本地旧 baseline（用户侧缓存）和包内新 baseline
- 按 entry 做 hash diff
- 只 report 源码提交 hash 相同（即源 repo 没动过）的条目

**用户场景**：升级后不再需要一刀切重装所有插件，只重装确实有变化的。

---

### 3. 安装失败自动回滚

用 pipeline 安装插件时，先记录当前文件的 hash 快照。如果安装/编译过程中任何一步失败，自动恢复文件到快照状态。

```
Installing vscode-eslint...
  ✓ Git clone
  ✓ Convert
  ✗ npm install (网络超时)
  → 回滚中... ✓ 已恢复原状
```

实现方式：安装前 `rsync -a` 或 `cp -r` 备份 → 失败则恢复 → 成功则删除备份。

**用户场景**：网络不稳定导致 npm install 失败，不影响已有插件。

---

### 4. `loader.doctor` — 一键诊断

组合多项检查，输出健康报告。

```
:CocCommand loader.doctor
```

输出：
```
[coc-vscode-loader 诊断报告]

系统环境
  Node.js:  v20.11.0  ✓
  Git:      ️ 2.43.0   ✓
  Neovim:   0.10.0    ✓

已安装插件 (5)
  ✓ vscode-eslint         (完整性校验通过)
  ✓ vscode-prettier       (完整性校验通过)
  ✓ vscode-pyright        (完整性校验通过)
  ✓ vscode-ansible        (完整性校验通过)
  ✗ vscode-tailwindcss    (server/ 目录缺失，请重装)

升级影响
  当前版本 v1.5.8 → 最新 v1.6.0
  影响 2/5 个已安装插件：eslint, prettier
  运行 :CocCommand loader.whatChanged 查看详情
```

**用户场景**：出问题时收集标准化诊断信息，便于排查和报 bug。

---

### 5. 配置溯源 / 只读防护

检测用户是否手动修改了转换后的输出文件（常见于新手直接编辑 `src/index.ts`）。

```
:CocCommand loader.audit
```

输出：
```
vscode-eslint/src/index.ts — 哈希不匹配
  安装时间: 2026-06-20
  最后修改: 2026-06-22 (用户手动编辑)
  提示: 重新安装将覆盖你的修改
```

可选：对输出目录设只读权限（pipeline 安装后 chmod -w）。

**用户场景**：用户改坏了文件后排查原因，或者阻止意外修改。

---

### 6. 增量安装缓存

pipeline 中，对源文件目录算 hash（`find . -type f | xargs md5sum`），与上次安装时保存的源 hash 对比：

- hash 相同 → 跳过 `npx tsx convert`，用缓存输出
- npm 依赖没变（`package.json` hash 一致）→ 跳过 `npm install`

安装 10 个未变更插件耗时从 ~5s/个降到 ~0.2s/个（纯 cp）。

**用户场景**：批量重装时大幅提速；CI 中反复转换同一版本源 repo 时避免不必要的工作。

---

### 7. 静默校验 + 启动通知

coc 启动时后台异步跑 hash 校验（只对已安装插件），发现不一致后在状态栏显示 Badge 或弹通知。

```
coc - 1 plugins need reinstall (run :CocCommand loader.verify)
```

不阻塞启动，但让用户感知到问题存在。

**用户场景**：升级后忘了重装，下次打开 vim 时自动提示。

---

### 8. 文件级 diff 详情

不只是知道「变了」，还能展示具体变更：

```
vscode-eslint/src/index.ts:
  旧 hash: a3f2b8c1...
  新 hash: 7e4d1a2f...
  ~ Line 42:   client.start() → client.start().catch(console.error)
  ~ Line 78:   removed deprecated method
```

实现方式：baseline 中存储旧版本文件 + 新转换输出文件，用 `diff` 工具展示。不过存储旧文件会增大 baseline 体积，需要权衡。可选只存最后两个版本的 baseline 差异。

**用户场景**：高级用户或开发者想了解具体改了什么。

---

### 9. 批量重装排序

按 hash 变化程度对需要重装的插件排序：
- 文件数量变化大的优先（如新增了 `esbuild.mjs`）
- hash 不同的文件多的优先
- 实际内容变动大的优先（对比行数变化）

```
重装优先级:
  1. vscode-eslint      (4 files changed)  ️
  2. vscode-prettier    (2 files changed)
  3. vscode-slither     (1 file changed)
```

**用户场景**：批量重装时优先处理风险高的，避免一次重装太多不知道哪个出问题。

---

### 10. 多版本基线保留

本地保留最近 2-3 个版本的 baseline 快照 + 对应的输出文件备份。用户试用新版本后发现有问题，可以快速切回旧版本文件集。

```
:CocCommand loader.rollback vscode-eslint
Available snapshots:
  [1] v1.5.8 (2026-06-20) ← current
  [2] v1.5.6 (2026-06-10)
  [3] v1.5.4 (2026-05-28)
```

空间开销：每个版本 ~50KB baseline + 插件输出文件集（平均 ~1MB/插件 × 8 = 8MB）。可设定期限自动清理。

**用户场景**：新版本出 bug 时快速回退，不等修复。

---

## 开发侧功能

### 11. 本地开发验证

开发者在修改 converter 代码后，跑一个轻量级 diff check：

```bash
npx tsx scripts/diff-check.ts check --local   # 只检查本地有缓存的 repo
```

比全量 CI 快得多（跳过下载），适合开发过程中的快速反馈。

---

### 12. PR 影响预览

在 GitHub PR 中自动 comment 展示 baseline 变更：

```
## Baseline Diff

| 状态 | 条目 | 变更文件 |
|------|------|----------|
| ~ | vscode-eslint | src/index.ts, package.json |
| ~ | vscode-prettier | src/index.ts |
| + | vscode-new-plugin | (6 files) |
| ✓ | 其余 125 条目 | 无变化 |

请 review 上述变更，确认无意外破坏。
```

用 GitHub Actions 实现，在 PR 被 reviewer 查看前提供信息。

---

### 13. 零影响发布检查

CI 在 publish npm 之前自动检查：如果本次 release 中所有 registry 条目的 baseline hash 都没变，说明没有代码生成变动，直接发 no-op changelog。

```json
{
  "version": "1.5.9",
  "baselineImpact": "none",
  "releaseNotes": "仅 registry 更新，无代码生成变化"
}
```

---

### 14. 变更分类（break / feature / fix）

手动给 baseline 差异打标签：

```bash
npx tsx scripts/diff-check.ts tag --type=break "eslint: new client.start guard"
```

在 baseline.json 中记录：

```json
{
  "vscode-eslint": {
    "_changelog": ["new client.start() guard"],
    "_impact": "break"   // break | feature | fix
  }
}
```

发布时自动汇总成兼容性说明。

---

### 15. 测试用例自动生成

当 baseline 检测到差异时，自动为变更的部分生成 fixture 测试用例（input/output pair），防止后续又被改回去。

---

## 高级 / 基础设施

### 16. 远程哈希验证

Registry 服务端存储 CI 通过的 hash 集合，用户端增加 `--remote` 模式：

```
:CocCommand loader.verify --remote
```

不仅对比本地缓存 hash，还对比 registry 官方认证的 hash。如果本地 hash 与远程一致，说明安装的是「官方认证版本」；如果不一致，说明本地环境有差异。

**用户场景**：排查明明 hash 没变但插件不工作的问题。

---

### 17. 插件依赖图 + 影响链分析

多个插件可能共享同一个 language server（如 eslint 和 stylelint 都依赖 eslint LSP）。当转换逻辑涉及 shared server 代码时，baseline 可以辅助分析影响链。

```
vscode-eslint  (esbuild.mjs + src/index.ts 变化)
  └── 共享 eslint server → 可能影响 vscode-stylelint
  └── 共享 eslint config → 可能影响 vscode-code-actions
```

实现：registry 中声明 `sharedModules` 或 `sharedServers`，结合 baseline diff 自动推导。

---

### 18. Baseline 增量更新

当前 diff:baseline 是全量重新转换所有条目（~5 分钟）。改进为增量模式：

- 只有 registry 中源 repo commit hash 变化的条目才重新转换
- 其余条目保留旧 baseline 数据
- 新加入 registry 的条目追加写入

```bash
npm run diff:baseline --incremental   # ~30s vs ~5min
```

---

### 19. 输出文件树快照

不只是 hash，baseline 还可以存储文件树结构（路径 + 是否目录），用于检测：
- 新增文件（如新增 `esbuild.mjs`）
- 文件被删除
- 目录结构变化（如 `server/` 改为 `server/out/`）

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

### 20. 用户侧 baseline 上报（匿名）

用户可以选择匿名上报本地的 baseline hash 校验结果：

```
插件: vscode-eslint
状态: ✓ hash 一致
版本: coc-vscode-loader v1.5.8
平台: linux-x64
```

帮助开发者了解：
- 哪些插件在用户环境中最常见
- 是否有特定平台的文件损坏问题
- 用户版本分布

---

### 21. 安全性 — 篡改检测

如果某个插件的输出文件被恶意篡改（如注入恶意代码），hash 校验可以检测到异常。结合 `--remote` 模式对比官方 hash，输出若与官方一致则安全。

对于追求高安全性的用户，可以设为强制：启动时如果任何插件 hash 与 remote 不一致，拒绝加载。

---

### 22. 调试模式 — 逐文件还原

调试时，可以把某个插件的输出文件逐一还原到某个 baseline 版本的状态：

```
:CocCommand loader.revertFile vscode-eslint src/index.ts v1.5.6
```

需要 baseline 不仅存 hash，还存文件归档（如 tar.gz）。存储开销大，但调试时非常有用。

---

### 23. 变更灰度发布

Registry 中可以标注 baseline diff 的影响等级，用户可以选择「只安装无 break 变更的插件」：

```vim
" 配置
let g:coc_loader_update_policy = 'safe'  " 只接受 fix/feature，拒绝 break
```

结合 #### 14 的变更分类实现。

---

### 24. 性能基线

在 baseline 中顺便记录转换耗时：

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

CI 中对比性能变化，发现某个 transform 改导致转换时间翻倍时告警。

---

### 25. 智能跳过重装

安装时对每个输出文件逐个对比 hash 和 mtime，只有真正变化的文件才写盘。这可以大幅减少 `installToCoc` 阶段的磁盘 IO。

同时避免不必要的 `npm install`（当 `package.json` hash 没变时）。

---

## 更多创意

### 26. 插件评分权重

统计每个插件在 baseline 迭代中文件 hash 变化的频率。变化越频繁 → 转换稳定性越差 → 对用户显示稳定性评级：

```
vscode-eslint     ⭐⭐⭐ (13 次 baseline 变动，较为稳定)
vscode-prettier   ⭐⭐    (28 次 baseline 变动，频繁变化)
vscode-pyright    ⭐⭐⭐⭐ (3 次 baseline 变动，非常稳定)
```

帮助用户决定哪些插件值得安装，哪些可能频繁出问题。

---

### 27. 本地补丁追踪

用户可能对转换后的输出文件手动打补丁。baseline diff 可以感知到「文件 hash 既不是 baseline 版本也不是新转换版本」，说明用户有自定义修改。

此时升级时自动：
1. 识别出用户本地的 patch
2. 用 `git apply` 或类似机制在新版本上重试应用
3. 如果有冲突则提示用户手动合并

```vim
:CocCommand loader.patchList vscode-eslint
  1. src/index.ts — 自定义 documentSelector (2026-06-20)
  2. server/eslintServer.js — 禁用 pull diagnostics (2026-06-18)
```

---

### 28. 转换日志审计

每次转换时生成详细日志，包括：
- 哪些文件被创建/修改/删除
- 每个 transform 步骤的耗时
- 文本替换的行级记录

存入 `build/conversion.log`，用户报 bug 时执行：

```vim
:CocCommand loader.bugReport vscode-eslint
```

自动打包以下内容：
- `conversion.log`
- 输入 vs 输出的 hash 对比
- `package.json`
- coc.nvim 版本信息
- 平台信息

生成一个归档文件，可直接附到 GitHub issue 中。

---

### 29. 智能依赖裁剪

通过对比 baseline 中的输出文件 vs `node_modules` 中实际被引用的包，自动识别未使用的依赖：

```bash
# 分析 vscode-eslint 的 node_modules
eslint-server.js 用了: vscode-languageclient, vscode-languageserver
未使用的包: chalk, ora, cli-truncate  → 建议移除 (-1.2MB)
```

配合 `keepDeps`/`excludeDeps` 自动优化输出 `package.json`。每次升级时重新评估。

---

### 30. 插件健康度看板

在 TUI 中新增一个 tab（`Tab 9: Health`），展示全局状态仪表盘：

```
┌─ coc-vscode-loader 健康度 ───────────────┐
│                                           │
│  已安装: 8    完好: 5   需重装: 2  损坏: 1 │
│                                           │
│  ️ vscode-eslint      ● 完好              │
│  ️ vscode-prettier    ● 完好              │
│  ⚠ vscode-pyright     ◐ 需重装 (hash 不匹配)│
│  ⚠ vscode-ansible     ◐ 需重装 (node_modules缺失)│
│  ✗ vscode-html        ○ 损坏 (server/ 缺失)│
│                                           │
│  上次验证: 2026-06-23 14:30               │
│  健康度: 62.5%                            │
└───────────────────────────────────────────┘
```

---

### 31. 自定义警报规则

用户可以写 Lua/VimL 规则，根据 baseline 事件触发通知：

```vim
" ~/.vim/coc-loader-rules.vim
" 当某个插件的 hash 改变时发消息
call LoaderRule('hashChanged', 'vscode-eslint', {-> execute('echo "eslint 已更新，请重装"')})

" 当损坏插件超过 3 个时弹窗警告
call LoaderRule('damagedCount', 3, {-> execute('call s:showWarning()')})
```

---

### 32. 转换质量分数

每次 baseline 更新时对每个插件自动跑质量检测：

| 检测项 | 权重 | 说明 |
|--------|------|------|
| 输出文件语法正确 | 30% | `node --check` 无报错 |
| TypeScript 编译通过 | 25% | `tsc --noEmit` |
| esbuild 打包成功 | 20% | `node esbuild.mjs` |
| LanguageClient 启动可达 | 15% | 模拟 `require` 不报错 |
| no-eval / no-deprecated | 10% | 检查有无不安全用法 |

低于 60 分的插件标记为 `unstable`，TUI 中显示 ⚠ 图标，安装时提示用户「该插件转换质量较低，可能工作不正常」。

---

### 33. 安装签名

在 baseline hash 之外，再加一层 HMAC 签名：

```json
{
  "vscode-eslint": {
    "src/index.ts": "sha256hash...",
    "_hmac": "a1b2c3... (HMAC-SHA256, key=device-specific)"
  }
}
```

安装时用设备密钥验证 HMAC，防止：
- 本地 baseline 文件被篡改
- 磁盘损坏导致静默数据污染
- 多用户共享系统下的权限逃逸

---

### 34. 环境差异补偿

跨平台 diff 时自动过滤掉平台相关的字段：

```json
{
  "vscode-eslint": {
    "esbuild.mjs": {
      "linux-x64": "hashA...",
      "darwin-arm64": "hashA...",
      "win32-x64": "hashB..."    // Windows 路径分隔符不同
    }
  }
}
```

对比时只比较当前平台的 hash，不为别的平台误报。对新条目自动从 CI 的多平台 baseline 中匹配。

---

### 35. 冷启动预热

利用 baseline 信息预判哪些插件的代码路径最常变化，在 vim 启动时异步预热这些模块的 require cache：

```typescript
// 在 plugin 激活时
const volatilePlugins = baseline.getMostChanged(5)  // 前 5 个最常变的
for (const p of volatilePlugins) {
  require(p.entryPoint)  // 提前载入，减少用户第一次触发的延迟
}
```

只在 idle 时做，不影响启动速度。

---

### 36. 多 Node 版本兼容性矩阵

CI 中在 Node.js 18/20/22 上分别跑全量转换，生成三个 baseline：

```
baseline-v18.json
baseline-v20.json  ← 主版本
baseline-v22.json
```

如果发现某个文件在特定 Node 版本上 hash 不同（如 esbuild 输出差异），自动标注兼容性：

```
vscode-eslint/esbuild.mjs:
  ✓ Node 18
  ✓ Node 20
  ⚠ Node 22 — hash 不同，esbuild 输出格式有差异
```

---

### 37. CLI 导出 SBOM

基于 baseline + 实际 node_modules，导出软件物料清单（Software Bill of Materials），满足企业安全合规需求：

```bash
npx tsx scripts/export-sbom.ts --format=cyclonedx
```

输出：
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

### 38. 慢文件监控

在 baseline 校验时记录每次 `readFile` 的耗时。如果某个文件的读取时间持续变慢（如从 2ms → 200ms），提示用户磁盘可能有问题：

```
⚠ 检测到异常 I/O:
  vscode-eslint/src/index.ts 读取耗时从 2ms 上升至 210ms
  可能原因：磁盘故障 / 文件系统碎片 / 存储介质降级
```

---

### 39. 转换历史图表

在 TUI 中可视化每个插件在版本迭代中的 baseline 变化次数：

```
插件变更频率 (最近 10 个版本)
┌────────────────────────────────────────────────────────┐
│ eslint      ██████████▏  2 次                           │
│ prettier    ████████████████████▌  4 次                 │
│ pyright     █████▎  1 次                                │
│ ansible     ██████████████████████████████████▏  7 次   │
│ html        ████████████████████████████████████████ 8 次│
└────────────────────────────────────────────────────────┘
```

一眼看出哪个插件最「折腾」，辅助决定是否等待稳定再安装。

---

### 40. 用户投票决定默认行为

对于存在争议的 transform 改动（如改变代码生成风格），在 TUI 中展示两个 baseline 变体让用户预览：

```
vscode-eslint 有两种可选输出风格:

[A] 当前 (v1.5.8) — client.start() 直接调用
    src/index.ts hash: a1b2c3

[B] 候选 (v1.6.0) — client.start() 加 .catch()
    src/index.ts hash: d4e5f6

你希望在下次更新中使用哪种？
➤ [A] 保持当前  [B] 切换到新版  [S] 跳过此插件
```

投票结果匿名上报，帮助维护者判断社区偏好。

---

## 优先级建议

### P0 — 用户即时价值高，实现成本低

| # | 功能 | 理由 |
|---|------|------|
| 1 | `loader.verify` | 最直观，hash 系统入口功能 |
| 2 | `loader.whatChanged` | 解决升级重装的核心痛点 |
| 3 | 安装失败自动回滚 | 提升用户体验可靠性 |

### P1 — 价值高，但需要一些架构调整

| # | 功能 | 理由 |
|---|------|------|
| 4 | `loader.doctor` | 集成已有检查，提升可支持性 |
| 6 | 增量安装缓存 | 显著提升重装速度 |
| 7 | 静默校验 + 通知 | 被动发现问题的入口 |
| 28 | 转换日志审计 | 报 bug 必备信息 |
| 30 | 插件健康度看板 | 全局状态一目了然 |

### P2 — 锦上添花

| # | 功能 | 理由 |
|---|------|------|
| 5 | 配置溯源 / 只读防护 | 防止用户误操作 |
| 8 | 文件级 diff 详情 | 信息更透明 |
| 9 | 批量重装排序 | 批量场景优化 |
| 10 | 多版本基线保留 | 高级用户回退需求 |
| 26 | 插件评分权重 | 辅助用户决策 |
| 27 | 本地补丁追踪 | 高级用户自定义需求 |
| 29 | 智能依赖裁剪 | 减小插件体积 |
| 31 | 自定义警报规则 | 可扩展性 |
| 35 | 冷启动预热 | 优化启动体验 |

### P3 — 开发侧工具

| # | 功能 | 理由 |
|---|------|------|
| 11 | 本地开发验证 | 提升开发体验 |
| 12 | PR 影响预览 | CI 协作 |
| 13 | 零影响发布检查 | 发布质量 |
| 14 | 变更分类 | 发布管理 |
| 15 | 测试自动生成 | 防止回归 |
| 32 | 转换质量分数 | 自动化质量门禁 |
| 36 | 多 Node 兼容性矩阵 | 跨版本验证 |
| 39 | 转换历史图表 | 辅助决策 |
| 40 | 用户投票 | 社区驱动 |

### P4 — 高级基础设施

| # | 功能 |
|---|------|
| 16 | 远程哈希验证 |
| 17 | 插件依赖图 + 影响链 |
| 18 | Baseline 增量更新 |
| 19 | 输出文件树快照 |
| 20 | 用户侧匿名上报 |
| 21 | 安全篡改检测 |
| 22 | 逐文件还原调试 |
| 23 | 变更灰度发布 |
| 24 | 性能基线 |
| 25 | 智能跳过重装 |
| 33 | 安装签名 |
| 34 | 环境差异补偿 |
| 37 | CLI 导出 SBOM |
| 38 | 慢文件监控 |

---

## 实现依赖

大部分功能依赖以下基础设施：

- [ ] 安装时在用户端缓存 hash 快照（`~/.config/coc/coc-vscode-loader/hashes/`）
- [ ] npm 发布时附带 `baseline.json`
- [ ] 用户端程序化读取和对比 baseline 的能力
- [ ] 独立于 TUI 的命令模块（`src/commands/` 或 `src/baseline.ts`）

## 初期最小实现

要能让这些想法中的大多数跑起来，最小切入点是：

1. 在 pipeline 中，安装成功后自动写一份 `package.hash.json` 到插件目录
2. 提供 `loader.verify` 命令读取并对比
3. 在 npm 包中打包一份 `baseline.json`
4. 提供 `loader.whatChanged` 读取包内的 baseline 做 diff

这三个功能互相依赖，可以一次实现。

---

## 功能清单汇总

| # | 功能 | 分类 | 价值 |
|---|------|------|------|
| 1 | `loader.verify` — 完整性校验 | 用户 | P0 |
| 2 | `loader.whatChanged` — 跨版本预览 | 用户 | P0 |
| 3 | 安装失败自动回滚 | 用户 | P0 |
| 4 | `loader.doctor` — 一键诊断 | 用户 | P1 |
| 5 | 配置溯源 / 只读防护 | 用户 | P2 |
| 6 | 增量安装缓存 | 用户 | P1 |
| 7 | 静默校验 + 启动通知 | 用户 | P1 |
| 8 | 文件级 diff 详情 | 用户 | P2 |
| 9 | 批量重装排序 | 用户 | P2 |
| 10 | 多版本基线保留 | 用户 | P2 |
| 11 | 本地开发验证 | 开发 | P3 |
| 12 | PR 影响预览 | 开发 | P3 |
| 13 | 零影响发布检查 | 开发 | P3 |
| 14 | 变更分类（break / feature / fix） | 开发 | P3 |
| 15 | 测试用例自动生成 | 开发 | P3 |
| 16 | 远程哈希验证 | 基础设施 | P4 |
| 17 | 插件依赖图 + 影响链 | 基础设施 | P4 |
| 18 | Baseline 增量更新 | 基础设施 | P4 |
| 19 | 输出文件树快照 | 基础设施 | P4 |
| 20 | 用户侧匿名上报 | 基础设施 | P4 |
| 21 | 安全篡改检测 | 基础设施 | P4 |
| 22 | 逐文件还原调试 | 基础设施 | P4 |
| 23 | 变更灰度发布 | 基础设施 | P4 |
| 24 | 性能基线 | 基础设施 | P4 |
| 25 | 智能跳过重装 | 基础设施 | P4 |
| 26 | 插件评分权重 | 用户 | P2 |
| 27 | 本地补丁追踪 | 用户 | P2 |
| 28 | 转换日志审计 | 用户 | P1 |
| 29 | 智能依赖裁剪 | 用户 | P2 |
| 30 | 插件健康度看板 | 用户 | P1 |
| 31 | 自定义警报规则 | 用户 | P2 |
| 32 | 转换质量分数 | 开发 | P3 |
| 33 | 安装签名 | 基础设施 | P4 |
| 34 | 环境差异补偿 | 基础设施 | P4 |
| 35 | 冷启动预热 | 用户 | P2 |
| 36 | 多 Node 版本兼容性矩阵 | 开发 | P3 |
| 37 | CLI 导出 SBOM | 基础设施 | P4 |
| 38 | 慢文件监控 | 基础设施 | P4 |
| 39 | 转换历史图表 | 开发 | P3 |
| 40 | 用户投票决定默认行为 | 开发 | P3 |

