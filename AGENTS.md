# AGENTS.md — vscode-coc-loader

## What this repo is

Reference documentation for migrating VS Code extensions to coc.nvim + **converter prototype** (`converter/`) that automatically converts VS Code extensions to coc plugins.

## Repo map

| File | Purpose |
|------|---------|
| `README.md` | Entry point with doc table of contents |
| `vscode.d.ts` | Upstream VS Code extension API types (auto-synced) |
| `coc.d.ts` | Upstream coc.nvim API types (auto-synced) |
| `vscode-vs-coc-api-diff.md` | Full API diff (vscode vs coc) |
| `mapping-quickref.md` | Fast bidirectional API lookup |
| `import-mapping.md` | Import name mapping: `vscode` → `coc.nvim` |
| `provider-signature-card.md` | Provider registration signatures side-by-side |
| `pattern-migration-examples.md` | Migration code examples for common patterns |
| `manifest-activation-mapping.md` | `package.json` / `activationEvents` / `contributes` mapping |
| `vscode-api-feasibility.md` | Feasibility analysis of porting vscode APIs to coc |
| `converter-design-v2.md` | Converter architecture + bridge preset system |
| `converter/README.md` | Converter tool docs and usage |
| `volar-migration-guide.md` | Volar (Vue) migration case study |
| `coc-converter/` | **coc-converter 包管理器插件** |
| `coc-converter/README.md` | Converter plugin docs and usage |
| `logs/YYYY-MM-DD.md` | Daily sync change logs (auto-generated) |

## Converter status

**Verified conversions:**

| Plugin | Type | Status | Key issues solved |
|--------|------|--------|-----------------|
| Volar (Vue) | TS-bridge | ✅ | tsserver/request bridge, typescriptServerPlugins, globalPlugins |
| Prisma | Pure LSP | ✅ | exports field restriction, bin entry detection |
| HTML CSS Support | Direct API | ✅ | class→factory, getWordRangeAtPosition polyfill, fileName→uri |

**Implemented transforms:**

| Transform | What it does |
|-----------|-------------|
| `import-mapping` | `from 'vscode'` → `from 'coc.nvim'` |
| `class-to-factory` | `new Xxx()` → `Xxx.create()` |
| `provider-register` | Adapt provider registration signatures |
| `enum-offset` | Comment on enum value differences |
| `language-client` | LanguageClient signature adaptation |

**Bridge preset system** (`converter/src/presets.ts`):
- Bridge logic is preset-driven, not hardcoded in convert.ts
- Currently only `ts-bridge` preset exists
- Adding a new bridge type: edit presets.ts + scanner.ts

## coc-tsserver PR

- PR: https://github.com/neoclide/coc-tsserver/pull/493
- Changes: `globalPlugins` + `pluginPaths` in configure, `typescript.tsserverRequest` command
- Pre-merge: `npm install ChuYanLon/coc-tsserver`

## coc-converter 包管理器插件

`coc-converter/` 是一个 coc.nvim 插件，提供 TUI 界面来安装/更新/卸载转换后的插件。

### 架构

| 文件 | 说明 |
|------|------|
| `src/index.ts` | 插件入口 + 5 个 CocCommand |
| `src/tui.ts` | TUI 窗口管理 + 渲染 + 快捷键分发 |
| `src/state.ts` | 状态管理（debounced 渲染） |
| `src/registry.ts` | 内置注册表（7 个插件） |
| `src/pipeline.ts` | 安装/更新/卸载流程（模拟步骤） |
| `src/renderer.ts` | LineBuffer 渲染引擎（仿 lazy.nvim） |

### TUI 特性

- 浮动窗口 + 无边框
- 仿 lazy.nvim 的渲染引擎：每段独立 `append(text, hl)` + extmark 高亮
- 自定义高亮组（9 个 `CocConverter*`）链接到主题标准组，自动适配当前 colorscheme
- **顶部按钮**：`coc-converter(H)` 首页  `Install(I)` 模式  `Update(U)` 更新全部  `Help(?)` 帮助
- **模式按钮**：`I` 进入 Install 模式（按钮亮起） `U` 更新全部（按钮亮起） `H` 回首页 `?` 帮助
- **包操作**：`i` 安装 `u` 更新 `X` 卸载 `<CR>` 展开/折叠详情/日志
- **其他**：`/` 搜索 `q` / `<Esc>` 关闭
- **展开详情**：description / type / source / languages / categories / homepage
- **安装日志**：`▶` 紧凑行 → `<CR>` 展开完整日志（含执行的命令）
- **进度显示**：`[step/total]` + 执行的命令

### 命令

| Command | 动作 |
|---------|------|
| `:CocCommand converter.open` | 打开 TUI |
| `:CocCommand converter.install <name>` | 安装指定包 |
| `:CocCommand converter.uninstall <name>` | 卸载指定包 |
| `:CocCommand converter.update <name>` | 更新指定包 |
| `:CocCommand converter.uninstallAll` | 卸载全部（需确认） |

### 构建

```bash
cd coc-converter
npm install
npm run build    # esbuild → lib/index.js
```

### 安装

```bash
cd ~/.config/coc/extensions
npm install /path/to/coc-converter    # 或
:CocInstall /path/to/coc-converter
```

## Pending (next session)

- [ ] 对接真实 converter/ 管道（代替模拟步骤）
- [ ] 注册表热更新（从 GitHub 拉远程 registry）
- [ ] 添加更多插件到注册表
- [ ] Add more transforms (uri-mapping, more provider signatures)
- [ ] Add python-bridge / rust-bridge preset examples

## Type sync workflow (CI only)

- `.github/workflows/sync-types.yml` runs daily at 02:00 UTC
- **Do not manually edit `vscode.d.ts` or `coc.d.ts`**

## Language

All documentation is written in Chinese (zh-CN).
