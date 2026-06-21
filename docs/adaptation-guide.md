# 扩展适配评估指南

## 开发环境完善

| 改动 | 说明 |
|------|------|
| `switch.sh local` | 自动写入 `extensions/package.json` dependencies，coc 可发现插件 |
| `registry.ts` | 自动检测本地开发模式，使用 `coc-vscode-registry/registry.json` |
| `minPluginVersion` | registry 扩展支持 `minPluginVersion` 字段，未发布版本对老用户不可见 |
| `server.args` (module kind) | 新增 `args` 字段支持 module kind LSP 启动参数（v1.4.3+），支持 `{dir}` 和 `{pluginDir}` 占位符 |
| `binaryPath` 自动推导 | 未指定时从 asset 模板名提取（`deno-{{rust-target}}.zip` → `deno`）|

### 版本兼容机制

```
registry.json 条目                    coc-vscode-loader 版本
┌─────────────────────┐               ┌──────────────────┐
│ name: "deno"        │               │ package.json     │
│ minPluginVersion:    │──比对────→    │ version: 1.1.1   │
│   "1.1.2"           │               │                  │
└─────────────────────┘               └──────────────────┘

1.1.1 < 1.1.2 → 隐藏，用户看不到 Deno
1.1.2 >= 1.1.2 → 显示，用户可以安装
```

这样可以在 registry 提前提交新扩展，等发版后用户自动可见。

---

## 实战案例：Live Server (`direct-api`)

### 扩展概况
- 仓库: `ritwickdey/vscode-live-server`
- 类型: `direct-api`（纯 Node.js HTTP 服务器，无 LSP）
- 核心逻辑: 启动带 WebSocket live reload 的 HTTP 服务器

### 转换难点及处理

| 难点 | 处理 |
|------|------|
| `LiveShareHelper` — VS Live Share 集成 | 3 个 patches 移除 import/instantiation/dispose |
| `StatusBarAlignment` — coc 无此类型 | 移除 import，修改 `createStatusBarItem(100)` |
| `workspace.saveAll()` — coc 无此 API | patch 注释掉 |
| `window.activeTextEditor.document.fileName` — coc 无 activeTextEditor | converter polyfill + 额外 URI patch |
| `workspaceFolders[0].uri.fsPath` — converter 正则不覆盖 `[0]` | 额外 patch |
| `.find(...).uri.fsPath` — 同上 | 额外 patch |
| 依赖污染 — 原扩展有 20+ devDeps + vsls | `excludeDeps` 过滤 + `keepDeps` 指定 runtime 依赖 |
| 状态栏 Ociton 图标 | patch 替换为 Unicode 符号（● Go Live / ● Port / ◌） |
| 激活时机 — `onCommand` 导致状态栏不显示 | `activationEvents` 加 `"*"` |

### 关键配置片段

```json
{
  "type": "source",
  "excludeDeps": ["vsls", "@wdio", "husky", "tslint", "live-server"],
  "keepDeps": { "live-server": "^1.2.2", "http-shutdown": "^1.2.0", "ips": "^2.1.3", "opn": "^6.0.0" },
  "patches": [
    { "find": "workspaceFolders\\[0\\]\\.uri\\.fsPath", "replace": "Uri.parse(workspaceFolders[0].uri).fsPath" },
    { "find": "await workspace\\.saveAll\\(\\);", "replace": "// workspace.saveAll not available in coc.nvim" }
  ]
}
```

### 现状
- 构建: ✅ 转换 → npm install → esbuild 全链路通过
- 运行时: ✅ 服务器启动（`http://127.0.0.1:5500`）、live reload、状态栏显示均正常

> 最后更新: 2026-06-21
> 分析方法: 逐扩展阅读 GitHub 源码 + 实际运行 `converter convert` → `npm install` → `node esbuild.mjs` 全链路验证
