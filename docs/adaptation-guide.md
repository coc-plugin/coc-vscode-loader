# 扩展适配评估指南

基于对 47 个 registry 请求的逐个源码分析，评估各 VS Code 扩展适配到 coc.nvim 的难度。

## 适配等级说明

| 等级 | 标签 | 含义 | 工作量 |
|------|------|------|--------|
| 0 | 已验证转换 | Converter 实测可完整构建并安装 | 仅 registry 录入 |
| 0b | 理论可转 | API 层面 0 适配，但 converter 构建流程有 bug 待修 | 修 converter bug |
| 1 | 少量适配 | 核心部分自动转换，少量手动清理 | 1-2 天 |
| 2 | 扩展转换器 | 需要给 converter 加新 transforms/support | 2-5 天 |
| 3 | 大规模改造 | 重度依赖 VS Code 特有 API，需大幅重写 | 周级 |

---

## 一、已端到端验证（4 个）

**2026-06-13 从 TUI 安装到 Ansible LSP 在 coc.nvim 中运行，全链路验证通过。**

| 扩展 | 仓库 | 状态 | 说明 |
|------|------|------|------|
| **Deno** | `denoland/vscode_deno` | 🟢 LSP 运行中 | Converter 转换 → pipeline 下载二进制 → patch → Deno LSP 正常启动 |
| **TOML (Taplo)** | `tamasfe/taplo` | 🟢 LSP 运行中 | Rust 原生二进制 + JS wrapper，需 serverBinary + .gz 解压 + raw-arch 模板 |
| **Ansible** | `ansible/vscode-ansible` | 🟢 LSP 运行中 | npm 包服务器 + pip 安装 ansible-lint，python3 + pip 自动检测 |
| **Tailwind CSS IntelliSense** | `tailwindlabs/tailwindcss-intellisense` | 🟢 已收录进 registry | 纯 LSP，npm 包服务器，bin 入口 |

## 二、构建成功、运行时未验证（2 个）

**Converter 转换 + esbuild 构建成功，但未在 coc 中测试实际 LSP 功能。**

| 扩展 | 仓库 | 说明 |
|------|------|------|
| **ESLint** | `microsoft/vscode-eslint` | 纯 LSP，npm 包服务器自动安装。需 ESLint 环境 |
| **PowerShell** | `PowerShell/vscode-powershell` | 系统需装 PowerShell 7+ |

> ~~Metals (#31)~~ — 需要 Coursier + Maven 下载流程，pipeline 不支持，已移除 registry

---

## 三、Level 0b — 理论可转，Converter 待修复（21 个）

API 上评估为 Level 0（纯 LSP/简单 Direct API），但实际构建失败，原因是 converter 存在以下 bug：

### Converter 已知 Bug

| Bug | 影响 | 描述 |
|-----|------|------|
| `esbuild.mjs` entry 硬编码 | 很多 | 硬编码 `src/extension.ts`，但 C#/Java/Rust Analyzer 入口是 `src/main.ts` |
| `vscode` 未加入 externals | 很多 | esbuild 尝试 bundle `vscode` 模块导致失败，需在 esbuild.mjs 补 `external: ['vscode']` |
| AST 转换产生语法错误 | 少数 | ruby-lsp 等扩展的 transforms 后出现了括号不匹配 |
| 源文件拷贝不完整 | 少数 | yaml 等扩展依赖的文件（如 `recommendation.ts`）未被复制到输出目录 |
| converter CLI 找不到 | 少数 | `converterCliPath()` 路径探测不完善 |

### Pipeline 已修复的 Bug（2026-06-12）

| 修复 | 说明 |
|------|------|
| `gh` 依赖移除 | `gh api` → `fetch` 直接调 GitHub API，无需装 GitHub CLI |
| `{{rust-target}}` 模板变量 | 支持 Rust 风格的 target triple（`aarch64-apple-darwin`） |
| `.zip` 解压支持 | 之前只支持 `.tar.gz` |
| 二进制服务器启动 | `{ module: ... }` → `{ command: serverModule, args: [...] }` |
| 服务器路径注入 | patch `lib/index.js` 使其自动查找 `../server/{binaryPath}` |
| `documentSelector` 修复 | 将 converter 生成的错误 language ID（如 `"deno"`）修正为实际语言 |
| `binaryPath` 自动推导 | 未指定时从 asset 模板名提取（`deno-{{rust-target}}.zip` → `deno`） |

### Pipeline 已修复的 Bug（2026-06-13）

| 修复 | 说明 |
|------|------|
| `pip install` 支持 | 新增 `pipPackages` 字段，自动安装 Python 依赖（如 ansible-lint），仅在 Linux 上用 `--break-system-packages` |
| `client.start()` 保护 | patch 生成的 `lib/index.js`，给 `client.start()` 加 `.catch()` 防止 disposed connection 报错 |
| 递归扫描 `.ts` 文件 | `walkTsFiles()` 递归遍历子目录，不再只扫 `src/` 一层 |
| 版本过滤修复 | `getAllPackages()` 在 `updateRegistry()` 后不再绕过 `minPluginVersion` 过滤 |

### 待修复列表

| # | 扩展 | 仓库 | 失败原因 |
|---|------|------|----------|
| 3 | **YAML** | `redhat-developer/vscode-yaml` | 源文件拷贝不完整 + `vscode` 未 external |
| 6 | **Ruff** | `astral-sh/ruff-vscode` | converter CLI 路径问题 |
| 7 | **Rust Analyzer** | `rust-lang/rust-analyzer` | entry 应为 `src/main.ts` |
| 8 | **Svelte** | `sveltejs/language-tools` | entry 或依赖问题 |
| 17 | **Stylelint** | `stylelint/vscode-stylelint` | src 目录为空，文件未拷贝 |
| 19 | **Terraform** | `hashicorp/vscode-terraform` | 构建失败 |
| 20 | **PHP Intelephense** | `bmewburn/vscode-intelephense` | 构建失败 |
| 21 | **Ruby LSP** | `Shopify/ruby-lsp` | AST 转换产生语法错误 |
| 23 | **C# (Roslyn)** | `dotnet/vscode-csharp` | entry 应为 `src/main.ts` |
| 24 | **Java** | `redhat-developer/vscode-java` | entry 非 `src/extension.ts` |
| 25 | **Elixir LS** | `elixir-lsp/vscode-elixir-ls` | 构建失败 |
| 27 | **Astro** | `withastro/language-tools` | entry 应为 `src/client.ts` |
| 28 | **GraphQL** | `graphql/vscode-graphql` | 构建失败 |
| 29 | **Kotlin** | `fwcd/vscode-kotlin` | 构建失败 |
| 32 | **Haskell** | `haskell/vscode-haskell` | 构建失败 |
| 33 | **Zig** | `ziglang/vscode-zig` | `vscode` 未 external |
| 36 | **R** | `REditorSupport/vscode-R` | 构建失败 |
| 39 | **Typst (Tinymist)** | `Myriad-Dreamin/tinymist` | 构建失败 |
| 40 | **Bazel** | `bazelbuild/vscode-bazel` | 构建失败 |
| 41 | **Nix** | `nix-community/vscode-nix-ide` | 构建失败 |
| 44 | **Path IntelliSense** | `ChristianKohler/PathIntellisense` | direct-api，entry 问题 |

---

## 四、Level 1 — 少量适配（7 个）

| # | 扩展 | 难点 | 处理方式 |
|---|------|------|----------|
| 2 | **Prettier** | Direct API：`registerDocumentFormattingEditProvider`, `createStatusBarItem`, `createLanguageStatusItem` | converter 已有 format provider 重命名。Status bar / language status 手动映射 |
| 16 | **Markdown All-in-One** | Direct API：decorations（strikethrough/code span）、preview、completion | decorations 降级为 text decoration 或 nvim 高亮。Preview 改用 browser |
| 18 | **CSS Modules** | Direct API：`CompletionItemProvider` + `DefinitionProvider` | Converter 已有处理，需确认 provider 签名匹配 |
| 15 | **Biome** | Direct API：自定义 LSP 协议（非标准 LanguageClient），使用 stdio 直接通信 | 需将自定义 client 改为标准 LanguageClient。server 端无需改动 |
| 9 | **Angular** | ts-bridge：LSP + TS rename plugin | Converter 已有 ts-bridge 预设。需验证 coc-tsserver PR 合并状态 |
| 42 | **Protobuf** | Direct API：多 provider 注册 + `child_process` 调 protoc | Converter 可处理 provider，protoc 外部调用需改为 coc 命令 |
| 34 | **Clojure LSP** | 官方没有独立 vscode 扩展，官方客户端是 **Calva** | 需在 registry 注明：仅 LSP server，不含 Calva 的 REPL/debug |

---

## 五、Level 2 — 需要扩展转换器（5 个）

| # | 扩展 | 需要的新功能 |
|---|------|-------------|
| 45 | **Auto Rename Tag** | 使用 LanguageClient + 自定义 `$/auto-rename-tag` LSP protocol，server/client 分离架构。需 converter 添加对自定义 LSP protocol 的支持 |
| 30 | **Dart/Flutter** | decorations ×3、tree view ×2、webview ×6+、debug ×8、test controller、MCP/LM tools。需 converter 支持 decorations polyfill、tree view → TUI 自动转换、webview 降级 |
| 22 | **C/C++ (cpptools)** | 多个 LanguageClient、native debugger、copilot integration、build tasks。需 converter 支持 multi-client 和 debug adapter 剥离 |
| 4 | **Docker** | Tree view、debug provider、task provider、custom FS (containers: scheme)。需 converter 支持 Azure framework 剥离 |
| 11 | **Go** | coverage decorations + test explorer + tree view + task + package outline | 核心 LSP 独立，decorations/tree/test 需剥离 |

---

## 六、Level 3 — 大规模改造（5 个）

| # | 扩展 | 主要障碍 |
|---|------|----------|
| 46 | **Rainbow CSV** | 核心基于 `registerDocumentRangeSemanticTokensProvider`（coc 无等效）+ decorations ×4 + webview ×2 + status bar ×6 + showInputBox |
| 47 | **Import Cost** | 核心基于 `createTextEditorDecorationType` + `setDecorations`。**已有 [coc-import-cost](https://github.com/coc-plugin/coc-import-cost) 移植版** |
| 48 | **Rest Client** | Webview ×2（response preview + code snippet）、clipboard、showSaveDialog |
| 51 | **Regex Previewer** | 核心基于 `createTextEditorDecorationType`（regex 高亮 + match 高亮），需 extmark 实时高亮 |
| 35 | **OCaml Platform** | **OCaml 语言**编写，`js_of_ocaml` 编译，非 TypeScript。API：decorations、webview ×2、tree view ×4、debug、status bar、tasks |

---

## 汇总

| 等级 | 数量 | 占比 |
|------|------|------|
| **已端到端验证** | **3** | **7%** |
| 构建成功、运行时未验证 | 3 | 7% |
| Level 0b — Converter 待修 | 21 | 45% |
| Level 1 — 少量适配 | 7 | 15% |
| Level 2 — 扩展转换器 | 5 | 11% |
| Level 3 — 大规模改造 | 5 | 11% |
| 无法确认（repo 404） | 1 | 2% |

## 优先级建议

1. **P0（已做）**: Deno 端到端验证通过，已录入 registry 并发布 v1.1.2
2. **P1（本周）**: 验证其余 5 个构建成功插件的运行时行为
3. **P2（下月）**: 修 converter bug（entry 检测、vscode external、文件拷贝），推进 Level 0b
4. **P3（Q3）**: Prettier、Biome、Protobuf 等 Level 1 + Auto Rename Tag 等 Level 2

---

## 开发环境完善

| 改动 | 说明 |
|------|------|
| `switch.sh local` | 自动写入 `extensions/package.json` dependencies，coc 可发现插件 |
| `registry.ts` | 自动检测本地开发模式，使用 `coc-vscode-registry/registry.json` |
| `minPluginVersion` | registry 扩展支持 `minPluginVersion` 字段，未发布版本对老用户不可见 |
| `serverBinary.args` | 新增 `args` 字段支持二进制 LSP 启动参数（如 `deno lsp`）|
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

> 最后更新: 2026-06-13
> 分析方法: 逐扩展阅读 GitHub 源码 + 实际运行 `converter convert` → `npm install` → `node esbuild.mjs` 全链路验证
