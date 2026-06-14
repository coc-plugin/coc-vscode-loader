# TODO: Converter 扩展接入计划

> 基于 210 款 VS Code 扩展可行性分析
> 更新：2026-06-15
> 源码分析基底：`converter/src/`（14 个 .ts 文件）、`coc-vscode-registry/registry.json`（98 个条目）
>
> **关键发现：** 大量插件因源码中直接 `import from 'vscode-languageclient'` 而无法被当前 converter 处理。
> 这是 converter 的一个已知 TODO（AGENTS.md 中的 `vscode-languageclient import rewrite`），并非 bug。
> 需要先在 `import-mapping.ts` 中加入 `vscode-languageclient` → `coc.nvim` 的模块重写才能支持这些插件。

---

## 优先级 P0：已验证可直接入 registry（16 款）

当前 registry 已有 16 款非 snippets 插件，converter 已验证可完整构建运行。

| 插件 | 类型 | 说明 |
|------|------|------|
| Volar (Vue) | ts-bridge | `@vue/language-server` + bridge |
| Prisma | pure-lsp | `@prisma/language-server` bin |
| HTML CSS Support | direct-api | completion provider |
| Lua | pure-lsp | binary server (LuaLS) |
| Deno | pure-lsp | binary server (deno) |
| TOML (Taplo) | pure-lsp | binary server (taplo) |
| Ansible | pure-lsp | module server + pip |
| YAML | pure-lsp | module server, keepDeps 对象语法 |
| Tailwind CSS IntelliSense | pure-lsp | module server, binName |
| Stylelint | pure-lsp | module server |
| Prettier | direct-api | formatter |
| Biome | pure-lsp | binary server (biome) |
| Svelte | pure-lsp | module server, binName |
| Astro | pure-lsp | module server, initializationOptions |
| gitignore | direct-api | 命令类 |
| **ShellCheck** | **direct-api** | **源码确认：无 `vscode-languageclient` 依赖** |

**新增于上次更新：** ShellCheck（之前位于 P1 未试过，源码验证后确认可直接转换）

---

## 优先级 P0b：构建成功，需运行时验证（2 款）

converter 构建 + esbuild 成功，只需在 coc.nvim 中实际测试 LSP 功能。

- [ ] **ESLint** — `microsoft/vscode-eslint`。构建成功，需测试实际 ESLint 诊断是否正常工作
- [ ] **PowerShell** — `PowerShell/vscode-powershell`。构建成功，需系统装 PowerShell 7+

---

## 优先级 P1：修 converter bug 后可转（~15 款）

这些是 pure LSP / direct-api，API 层面 0 适配，但被已知 converter bug 阻塞。

### Bug A: entry 硬编码 `src/extension.ts`（部分已解决）

converter 已支持在 `SourceStep.entry` 中指定自定义入口（如 Astro 用 `packages/vscode-astro/src/client.ts`），
但 `convert.ts:250` 默认回退仍为 `src/extension.ts`。以下插件的入口非标准且尚未在 registry 中配置：

- [ ] **Rust Analyzer** — `rust-lang/rust-analyzer`。entry: `src/main.ts`
- [ ] **C# (Roslyn)** — `dotnet/vscode-csharp`。entry: `src/main.ts`
- [ ] **Java** — `redhat-developer/vscode-java`。entry 非 `src/extension.ts`

### Bug B: `vscode` 未加入 esbuild externals

esbuild 尝试 bundle `vscode` 模块导致构建失败。

- [ ] **Zig** — `ziglang/vscode-zig`
- [ ] **Code Spell Checker** — `streetsidesoftware/vscode-spell-check`

### Bug C: 源文件拷贝不完整

- [ ] ~~Stylelint~~ — ✅ 已入 registry，通过 `entry: "src/extension.ts"` 显式指定修复
- [ ] ~~YAML~~ — ✅ 已入 registry
- [ ] **Ruby LSP** — `Shopify/ruby-lsp`。AST 转换后产生语法错误

### Bug D: Converter CLI 路径探测不完善

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

以下为源码分析的结论，标注了每个插件的实际架构和阻塞原因：

- [ ] **PostCSS Language Support** — ❌ 纯 TextMate grammar 扩展，无代码。需要 converter 加语法高亮支持（P3）
- [ ] **SCSS IntelliSense** — ❌ 源码 `import from 'vscode-languageclient'`（embedded server）。阻塞：`vscode-languageclient` 未重写
- [ ] **Less IntelliSense** — ❌ 同上。源码 `import from 'vscode-languageclient'`（embedded server）
- [ ] **UnoCSS** — ❌ `devDependencies` 有 `vscode-languageclient`，源码引用它。阻塞：`vscode-languageclient` 未重写
- [ ] **HTMLHint** — ❌ `dependencies` 有 `vscode-languageclient`。阻塞同上
- [ ] **Black Formatter** — ❌ `dependencies` 有 `vscode-languageclient` + `@vscode/common-python-lsp`
- [ ] **Dart** (`Dart-Code/Dart-Code`) — ❌ `dependencies` 有 `vscode-languageclient`
- [ ] **Swift** (sourcekit-lsp) — 需进一步确认具体扩展
- [ ] **ShellCheck** — ✅ 已确认无 `vscode-languageclient`，**已加入 registry**
- [ ] **Drizzle ORM** — `drizzle-lab/drizzle-vscode`，需验证
- [ ] **Pylance** — 微软闭源 LSP，需验证打包方式
- [ ] **SonarLint** — 需验证协议
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

## 优先级 Snip：纯 Snippets 扩展（82 款已入 registry）

### 转换原理

Snippets 扩展的核心声明在源 `package.json` 的 `contributes.snippets` 字段：

```json
"contributes": {
  "snippets": [
    { "language": "javascript", "path": "./snippets/javascript.json" }
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

### 实现方式：`converter/src/steps/snippets.ts`

`StepGenerator` type: `"snippets"`，核心逻辑：
- 读 `origPkg.contributes.snippets` → `{language → path}` 映射
- 可选 `build` 字段：先运行 `npm install` + build script 生成 snippet 文件再复制（如 `node merge.js`）
- 支持 `languages` 覆盖（不指定则从源 `package.json` 自动读取）

输出：
- `snippets/<language>.json` × N（直接复制）
- `src/index.ts`（空入口）
- `activationEvents = ['onLanguage:xxx']`

### 已入 registry 列表（82 款）

JS/TS/React 类：
- JavaScript ES6 Snippets (`xabikos/vscode-javascript`)
- Reactjs code snippets (`xabikos/vscode-react`)
- Typescript React code snippets (`infeng/vscode-react-typescript`)
- ES7+ React/Redux/React-Native snippets (`r5n-labs/vscode-react-javascript-snippets`)
- ES7 React/Redux/GraphQL/React-Native snippets (`rodrigovallades/vscode-es7-javascript-react-snippets`)
- React/Redux/react-router Snippets (`discountry/vscode-react-redux-react-router-snippets`)
- React-Native/React/Redux snippets (`EQuimper/VSC-React-Native-React-Redux-Snippets`)
- Fullstack React/React Native snippets (`walteribeiro/full-react-snippets`)
- JavaScript standardjs styled snippets (`capaj/vscode-standardjs-snippets`)
- JavaScript Snippets (`nathanchapman/vscode-javascript-snippets`)
- Node Snippets (`softchris/node-snippets`)
- Nodejs Snippets (`abdoseadaa/node-js-snippets`)
- Express Snippets (`robsonkades/vscode-express-snippets`)
- Next.js React Snippets (`ijsto/reactnextjssnippets`)
- Nextjs snippets (`pulkitgangwar/next.js-snippets`)
- React Native Snippet (`jundat95/react-native-snippet`)

Vue 类：
- Vue VSCode Snippets (`sdras/vue-vscode-snippets`)
- Vue 3 Snippets (`hollowtree/vscode-vue-snippets`)
- Vue 2 Snippets (`xianghongai/vscode-vue2-snippets`)
- Vue TypeScript Snippets (`ducksoupdev/vscode-vue-typescript-snippets`)
- vue3-snippets-for-vscode (`wejectchen/vue3-snippets-for-vscode`)

Angular 类：
- Angular Snippets v18 (`johnpapa/vscode-angular-snippets`)
- Angular 17 Snippets - ngRx/RxJS (`BeastCode/VSCode-Angular-TypeScript-Snippets`)
- Angular 8 TypeScript/HTML Snippets (`danwahlin/angular-snippets`)
- Angular 2+ TypeScript HTML Snippets (`ultrasonicsoft/vscode-ng2-typescript-snippets`)
- Angular 1 JS/TS Snippets (`johnpapa/vscode-angular1-snippets`)
- Angular 2 TypeScript Test Snippets (`marinho/vscode-angular2-test-snippets`)
- Angular UI Bootstrap Snippets (`herrherrmann/angular-bootstrap-code`)

Svelte 类：
- Svelte 3 Snippets (`ryanyang52/vscode-svelte-snippets`)
- Svelte 3 Snippets (`fivethree-team/vscode-svelte-snippets`)

SolidJS：
- SolidJS Snippets (`solidjs-community/solid-snippets`)

Flutter/Dart 类：
- Flutter Widget Snippets (`Alexisvt/flutter-snippets`)
- Awesome Flutter Snippets (`Neevash/awesome-flutter-snippets`)
- Flutter Snippets (`zyllus17/flutter-snippets`)
- Flutter Riverpod Snippets (`RobertBrunhage/flutter-riverpod-snippets`)

Python 类：
- FastAPI Snippets (`damildrizzy/fastapi-snippets`)
- Djaneiro - Django Snippets (`ScottBarkman/vscode-djaneiro`)
- Python Snippets (`cstrap/python-snippets`)
- Python Snippets 3 (`ericsia/vscode-python-snippet-pack-2.0`)
- Python Snippets pack (`ylcnfrht/vscode-python-snippet-pack`)
- Django Snippets (`iambibhas/vscode-django-snippets`)
- Pygame Snippets (`tushortz/vscode-Pygame-Snippets`)
- Opencv Snippets (`gsGupta11/vscode-OpencvSnippets`)
- Flask Snippets (`cstrap/flask-snippets`)
- PyTorch Snippets (`SvenBecker/vscode-pytorch`)
- Pandas Basic Snippets (`snippington/snp-pandas-basic`)
- Tensorflow 2.0 Snippets (`changkaiyan/tensorflow2snippets`)
- Tkinter Snippets (`lunaluvgood/tkinter-snippets`)

PHP/Laravel 类：
- Laravel Snippets (`onecentlin/laravel5-snippets-vscode`)
- Laravel Model Snippets (`ahinkle/vscode-laravel-model-snippets`)
- PHP Awesome Snippets (`h4kst3r/php-awesome-snippets`)
- PHP Snippets from PHPStorm (`phiterf/phpstorm-snippets-for-vscode`)

Java/C#/Unity 类：
- C# Snippets (`J0rgeSerran0/vscode-csharp-snippets`)
- Unity Snippets (`YclepticStudios/vscode-unity-snippets`)
- Unity Snippets (`lionize/vscode-unity-snippets`)
- Unity Code Snippets (`cemuka/vscode-unity-code-snippets`)
- Java Imports Snippets (`tushortz/vscode-Java-Imports`)
- Java Snippets (`tushortz/vscode-Java-Snippets`)
- Spring Boot Snippets (`DeveloperSoapbox/vscode-springboot-snippets`)

SQL/数据库类：
- PostgreSQL Snippets (`Manuel7806/postgresql-snippets`)
- MySQL Snippets (`zendobk/vscode-mysql`)

NestJS 类：
- NestJS Snippets (`ManuelGil/vscode-nestjs-snippets`)
- NestJS Snippets (`ashinzekene/vscode-nestsjs-snippets`)

CSS/Bootstrap/UI 类：
- Bootstrap 3 Snippets (`wcwhitehead/bootstrap-3-snippets`)
- Bootstrap v4 Snippets (`Zaczero/bootstrap-v4-snippets`)
- Bootstrap 5 & Font Awesome Snippets (`HansUXdev/B5-SNIPPETS`)
- styled-components-snippets (`jonkwheeler/styled-components-snippets-vscode`)
- Font-awesome codes for html (`dslpp056193/font-awesome-codes-html`)

测试类：
- Chai snippets (`nwhatt/vs-chai-snippets`)
- Cypress Snippets (`ijsto/cypress-snippets`)
- Playwright Snippets (`nitayneeman/vscode-playwright-snippets`)
- Jest Snippets (`andys8/vscode-jest-snippets`)

其他：
- HTML Boilerplate (`sidthesloth92/vsc_html5_boilerplate`)
- Shopify Liquid Template Snippets (`killalau/vscode-liquid-snippets`)
- WordPress Snippets (`jason-pomerleau/vscode-wordpress-toolbox`)
- Ionic Snippets (`fivethree-team/vscode-ionic-snippets`)
- C/C++ Snippets (`one-harsh/vscode-cpp-snippets`)
- Rust Flash Snippets (`Metalymph/rust-flash-snippets`)
- Arduino Snippets (`ronaldosena/arduino-snippets`)
- Apache Conf Snippets (`hrdtbs/vscode-apacheconf-snippets`)
- Emoji Snippets (`Devzstudio/Vscode-Emoji-Snippets`)
- Classic ASP Syntaxes and Snippets (`jtjoo/vscode-classic-asp-extension`)
- EJS Snippets (`theranbrig/ejs-snippets`)
- RxJS Snippets (`prashantkoshta/rxjs-snippets-vscode`)
- jQuery Snippets (`DonJayamanne/jquerysnippets`)
- eslint-disable-snippets (`drKnoxy/eslint-disable-snippets`)
- Unreal Engine 4 Snippets (`CAPTNCAPS/ue4-snippets-vs`)
- uni-app/uni-ui/uni-cloud Snippets（3 款，`uni-helper/`）

### 无独立 repo（不是纯 snippets 扩展或无独立仓库）
- ❌ TypeScript Snippets — VS Code 内置，tsserver 自带
- ❌ Node.js / Express / Koa Snippets — 无独立 marketplace 扩展
- ❌ Python / Django / Flask Snippets — 绑在 MS Python 扩展里
- ❌ Go / PHP / Ruby / Lua Snippets — 绑在各自 LSP 扩展里
- ❌ Flutter Snippets — 绑在 Flutter 扩展里
- ❌ HTTP Snippets / Koa Snippets — 无独立扩展

---

## 总结：按优先级统计

| 优先级 | 说明 | 数量 | 累计 |
|--------|------|------|------|
| P0 | Registry 非 snippets 条目 | 16 | 16 |
| P0b | 构建成功待验证 | 2 | 18 |
| P1 | 修 bug 后可转 + 需 `vscode-languageclient` 重写 | ~15 | ~33 |
| P2 | 少量适配 | ~28 | ~61 |
| P3 | 需扩展 converter | ~28 | ~89 |
| Snip | 已入 registry（snippets step） | 82 | ~171 |

**不可转（不在 TODO 中）：** ~39 款（decoration/webview/GUI 依赖）

> 注：相比于 v2026-06-14 版本，更新了：
> - P0 从 15 → 16（新增 ShellCheck）
> - 对 "P1 未试过" 进行了源码验证，发现 PostCSS/SCSS/Less/UnoCSS/HTMLHint/Black/Dart 都因 `vscode-languageclient` 依赖而无法直接转换
> - 新增 `vscode-languageclient` 依赖分析说明——这是当前 converter 最大阻塞项
> - ShellCheck 已实际加入 registry（源码确认无 `vscode-languageclient`，纯 direct-api）
