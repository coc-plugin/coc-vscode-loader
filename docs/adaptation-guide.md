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

> 最后更新: 2026-06-16
> 分析方法: 逐扩展阅读 GitHub 源码 + 实际运行 `converter convert` → `npm install` → `node esbuild.mjs` 全链路验证
