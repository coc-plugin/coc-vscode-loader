# TODO: Converter 扩展接入计划

> 基于 210 款 VS Code 扩展可行性分析
> 更新：2026-06-14

---

## 优先级 P0：已验证可直接入 registry（0 款待加）

当前 registry 已有 14 款。P0 是那些 converter 已验证可完整构建运行、只需加 registry 条目的：

| 插件 | 说明 | 操作 |
|------|------|------|
| ✅ 全部已完成 | — | 无剩余任务 |

---

## 优先级 P0b：构建成功，需运行时验证（2 款）

converter 构建 + esbuild 成功，只需在 coc.nvim 中实际测试 LSP 功能。

- [ ] **ESLint** — `microsoft/vscode-eslint`。构建成功，需测试实际 ESLint 诊断是否正常工作
- [ ] **PowerShell** — `PowerShell/vscode-powershell`。构建成功，需系统装 PowerShell 7+

---

## 优先级 P1：修 converter bug 后可转（~15 款）

这些是 pure LSP / direct-api，API 层面 0 适配，但被已知 converter bug 阻塞。

### Bug A: entry 硬编码 `src/extension.ts`
`src/index.ts` 的 esbuild entry 写死了 `src/extension.ts`，但某些插件的入口是 `src/main.ts` 或其他路径。

- [ ] **Rust Analyzer** — `rust-lang/rust-analyzer`。entry: `src/main.ts`
- [ ] **C# (Roslyn)** — `dotnet/vscode-csharp`。entry: `src/main.ts`
- [ ] **Java** — `redhat-developer/vscode-java`。entry 非 `src/extension.ts`
- [ ] **Astro** — `withastro/language-tools`。entry: `src/client.ts`

### Bug B: `vscode` 未加入 esbuild externals
esbuild 尝试 bundle `vscode` 模块导致构建失败。

- [ ] **YAML** — `redhat-developer/vscode-yaml`。同时有文件拷贝不完整问题
- [ ] **Zig** — `ziglang/vscode-zig`
- [ ] **Code Spell Checker** — `streetsidesoftware/vscode-spell-check`

### Bug C: 源文件拷贝不完整
某些插件依赖的文件未被复制到输出目录。

- [ ] **Stylelint** — `stylelint/vscode-stylelint`。src 目录为空或文件缺失
- [ ] **YAML** — 同上，与 Bug B 叠加

### Bug D: AST 转换产生语法错误
transforms 后括号不匹配等语法问题。

- [ ] **Ruby LSP** — `Shopify/ruby-lsp`

### Bug E: Converter CLI 路径探测不完善

- [ ] **Ruff** — `astral-sh/ruff-vscode`
- [ ] **Path Intellisense** — `ChristianKohler/PathIntellisense`

### 其他构建失败（原因待定位）

- [ ] **GraphQL** — `graphql/vscode-graphql`
- [ ] **PHP Intelephense** — `bmewburn/vscode-intelephense`
- [ ] **Kotlin** — `fwcd/vscode-kotlin`
- [ ] **Haskell** — `haskell/vscode-haskell`
- [ ] **Terraform** — `hashicorp/vscode-terraform`
- [ ] **Elixir LS** — `elixir-lsp/vscode-elixir-ls`
- [ ] **Bazel** — `bazelbuild/vscode-bazel`
- [ ] **Nix** — `nix-community/vscode-nix-ide`
- [ ] **Typst (Tinymist)** — `Myriad-Dreamin/tinymist`
- [ ] **R** — `REditorSupport/vscode-R`

### 未试过但理论可转（需首次构建验证）

- [ ] **PostCSS Language Support** — LSP server 已知
- [ ] **SCSS IntelliSense** — LSP server 已知
- [ ] **Less IntelliSense** — LSP server 已知
- [ ] **UnoCSS** — `@unocss/language-server`
- [ ] **Drizzle ORM** — `drizzle-lab/drizzle-vscode`
- [ ] **ShellCheck** — LSP 集成
- [ ] **Dart** — dart language-server
- [ ] **Swift** — sourcekit-lsp
- [ ] **Pylance** — 微软闭源 LSP，需验证打包方式
- [ ] **HTMLHint** — LSP server
- [ ] **SonarLint** — 需验证协议
- [ ] **C/C++** — clangd（需剥离 debug/tasks）
- [ ] **Maven for Java** — 依赖 Java Extension Pack
- [ ] **Gradle for Java** — 同上
- [ ] **Black Formatter** — direct-api，需 pip 依赖支持
- [ ] **Extension Pack for Java** — 多个 LSP 捆绑

---

## 优先级 P2：Level 1 少量适配（~28 款）

核心部分可自动转换，需少量手动清理或加简单 polyfill。

### 命令类（可转为 coc 命令，低工作量）

- [ ] **Git Link** — 生成 git 链接（`git remote get-url` + 路径分析）
- [ ] **Git Cherry-Pick** — 简单 git 命令包装
- [ ] **Git Flow** — git-flow 命令包装
- [ ] **Open in Browser** — `open`/`xdg-open` 当前文件
- [ ] **Vue Document** — 打开 Vue 文档 URL
- [ ] **Go Imports** — 调用 `goimports`
- [ ] **Go Lint** — 调用 `golint`/`staticcheck`
- [ ] **PHP Formatter** — 调用 PHP 格式化工具
- [ ] **Base64** — 编解码
- [ ] **URL Encode/Decode** — 编解码
- [ ] **Lorem Ipsum** — 插入占位文本
- [ ] **String Manipulation** — 大小写转换等
- [ ] **Line Sort** — 排序
- [ ] **Line Duplicate** — 去重
- [ ] **CSV to Table** — CSV 转对齐表格
- [ ] **SQL Formatter** — SQL 格式化

### Formatter 类（已有 format provider 支持）

- [ ] **CSS Formatter**
- [ ] **Prettier ESLint** — prettier + eslint 联动

### Markdown 工具链

- [ ] **Markdown All in One** — 格式化/TOC 部分可转
- [ ] **Markdown Table Formatter** — 表格对齐
- [ ] **Markdown Footnotes** — 脚注导航
- [ ] **Markdown Emoji** — emoji 补全

### Provider 类（需验证签名匹配）

- [ ] **CSS Modules** — completion + definition provider

### LSP 配置类

- [ ] **ESLint Plugin Import/React/Vue** — 规则配置（非独立插件，通过 ESLint LSP 处理）
- [ ] **Lint Staged** — git hook 配置

### 其他

- [ ] **Turbo Console Log** — 插入 console.log 的 snippets/命令
- [ ] **React Import** — auto import，LSP 已覆盖大部分
- [ ] **Vagrant** — 语法高亮 + 简单命令
- [ ] **Protobuf** — 格式化 + lint + 编译
- [ ] **Dockerfile Support** — 语法高亮 + LSP

---

## 优先级 P3：Level 2 扩展转换器（~28 款）

需要给 converter 加新 transforms/support。

### 需加新的 provider transform

- [ ] **Auto Close Tag** — TextDocumentChange → 文本插入
- [ ] **NPM Intellisense** — completion provider (node_modules 扫描)
- [ ] **IntelliSense for CSS class names** — completion provider
- [ ] **CSS Peek** — definition provider for CSS
- [ ] **Module Resolver** — completion/命令
- [ ] **JS/TS Refactor** — code action provider
- [ ] **JavaScript Booster** — code action provider

### 需加自定义 LSP protocol

- [ ] **Auto Rename Tag** — `$/auto-rename-tag` protocol

### 需加 test adapter

- [ ] **Jest** — 测试运行命令 + 诊断
- [ ] **Mocha** — 同上

### 纯语法高亮类（TextMate grammar → coc 语法）

- [ ] **Apache Conf**
- [ ] **Nginx Config**
- [ ] **Docker Compose**
- [ ] **Kubernetes YAML**
- [ ] **Helm Templates**
- [ ] **Makefile Tools** — 含 target 补全
- [ ] **Styled Components** — CSS-in-JS
- [ ] **Handlebars**
- [ ] **Pug**
- [ ] **EJS Language Support**
- [ ] **Batch Script**
- [ ] **Perl**
- [ ] **WeChat Mini Program**
- [ ] **Cassandra**

### 需外部命令包装

- [ ] **Code Runner** — 运行代码（`spawn` → `:terminal`）
- [ ] **Flake8 Lint** — 调用 flake8 → diagnostics
- [ ] **Python Docstring Generator** — 生成 docstring
- [ ] **Java Code Generators** — 生成模板代码
- [ ] **Batch Replace** — 批量查找替换
- [ ] **Text Power Tools** — 多文本处理命令
- [ ] **Stylus** — LSP + 语法
- [ ] **Lombok Annotations Support** — Java annotation 处理
- [ ] **Go** — gopls LSP（已有 coc-go，非必须转换）

---

## 优先级 Snip：纯 Snippets 扩展（33 款）

### 转换原理

Snippets 扩展的核心声明在源 `package.json` 的 `contributes.snippets` 字段：

```json
"contributes": {
  "snippets": [
    { "language": "javascript", "path": "./snippets/javascript.json" },
    { "language": "typescript", "path": "./snippets/typescript.json" }
  ]
}
```

这些 `.json` 文件是标准 TextMate 格式，**和 coc-snippets 完全兼容**，无需改写。

转换步骤：
1. 从源 `package.json` 读出 `contributes.snippets`，得到 `{language → filePath}` 映射
2. 把每个 snippet JSON 文件复制到输出的**相同相对路径**（如 `./snippets/snippets.json` → `output/snippets/snippets.json`）
3. 生成一个空壳 `src/index.ts`（仅 `export function activate() {}`）
4. esbuild 打包 `lib/index.js`
5. `convert.ts` 保留 `origPkg.contributes.snippets` 到输出 `package.json`——coc-snippets 通过 `contributes.snippets` 发现片段文件（`textmateProvider.ts:loadSnippetDefinition()`），不是通过目录名

### 实现方式：加新 step type `snippets`

在 `converter/src/steps/` 下新建 `snippets.ts`，核心逻辑：

```
Interface SnippetsStep {
  type: "snippets"
  languages?: string[]  // 可选覆盖，不指定则从源 package.json 自动读取
}
```

输出：
- `snippets/<language>.json` × N（直接复制）
- `src/index.ts`（空入口）
- StepResult.entryPoint = `src/index.ts`
- StepResult.activationEvents = `['onLanguage:xxx']`

然后在 `steps/index.ts` 注册：`registerGenerator(snippetsGenerator)`

### Registry 条目格式

以 `xabikos/vscode-javascript` 为例：

```json
{
  "name": "javascript-snippets",
  "displayName": "JavaScript ES6 Snippets",
  "description": "Code snippets for JavaScript in ES6 syntax",
  "type": "snippets",
  "source": {
    "type": "github",
    "repo": "xabikos/vscode-javascript"
  },
  "url": "https://github.com/xabikos/vscode-javascript",
  "languages": ["javascript"],
  "categories": ["Snippets"],
  "convert": [
    {
      "type": "snippets"
    }
  ]
}
```

### 插件列表

- [ ] **JavaScript ES6 Snippets** — `xabikos/vscode-javascript`。语言: js, ts, jsx, tsx, html
- [ ] **TypeScript Snippets** — `xabikos/vscode-typescript`。语言: typescript
- [ ] **TypeScript React code snippets** — `etsivanovs/typescript-react-code-snippets`。语言: tsx, ts
- [ ] **ES7+ React Snippets** — `dsznajder/vscode-es7-javascript-react-snippets`。语言: js, ts, jsx, tsx
- [ ] **React Redux Snippets** — 语言: js, ts, jsx, tsx
- [ ] **React Native Snippets** — 语言: js, ts, jsx, tsx
- [ ] **Vue VSCode Snippets** — `sdras/vue-vscode-snippets`。语言: vue, js, ts
- [ ] **Vue 3 Snippets** — 语言: vue
- [ ] **Node.js Snippets** — 语言: javascript
- [ ] **Express Snippets** — 语言: javascript
- [ ] **Koa Snippets** — 语言: javascript
- [ ] **NestJS Snippets** — 语言: typescript
- [ ] **Python Snippets** — 语言: python
- [ ] **Django Snippets** — 语言: python
- [ ] **Flask Snippets** — 语言: python
- [ ] **FastAPI Snippets** — 语言: python
- [ ] **Go Snippets** — 语言: go
- [ ] **PHP Snippets** — 语言: php
- [ ] **Ruby Snippets** — 语言: ruby
- [ ] **Chai** — 语言: js, ts
- [ ] **Cypress Snippets** — 语言: js, ts
- [ ] **Playwright Snippets** — 语言: js, ts
- [ ] **HTTP Snippets** — 语言: http
- [ ] **PostgreSQL Snippets** — 语言: sql
- [ ] **MySQL Snippets** — 语言: sql
- [ ] **Flutter Snippets** — 语言: dart
- [ ] **Lua Snippets** — 语言: lua
- [ ] **Nuxt Snippets** — 语言: vue, ts
- [ ] **Next.js Snippets** — 语言: js, ts, jsx, tsx
- [ ] **Svelte Snippets** — 语言: svelte
- [ ] **SolidJS Snippets** — 语言: js, ts, jsx, tsx
- [ ] **Unity Snippets** — 语言: csharp
- [ ] **Miniprogram API Snippets** — 语言: wxml, js

---

## 总结：按优先级统计

| 优先级 | 说明 | 数量 | 累计 |
|--------|------|------|------|
| P0 | Registry 已有 | 14 | 14 |
| P0b | 构建成功待验证 | 2 | 16 |
| P1 | 修 bug 后可转 | ~30 | ~46 |
| P2 | 少量适配 | ~28 | ~74 |
| P3 | 需扩展 converter | ~28 | ~102 |
| Snip | 加 snippets step 后入 registry | ~33 | ~135 |

**不可转（不在 TODO 中）：** ~75 款（decoration/webview/GUI 依赖）
