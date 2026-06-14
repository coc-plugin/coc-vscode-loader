# 210 款 VS Code 扩展转换可行性分析

> 分析基准：coc-vscode-loader 当前架构 + converter v1.2.2
> 更新日期：2026-06-14

---

## 适配等级说明

| 等级 | 标签 | 含义 | 工作量 |
|------|------|------|--------|
| 0 | 已验证 | Converter 实测可完整构建并运行 | 仅 registry 录入 |
| 0b | 理论可转 | API 层面可转，但 converter 有 bug 待修 | 修 converter bug |
| 1 | 少量适配 | 核心部分自动转换，少量手动清理 | 1-2 天 |
| 2 | 扩展转换器 | 需要给 converter 加新 transforms/support | 2-5 天 |
| 3 | 大规模改造 | 重度依赖 VS Code 特有 API，需大幅重写 | 周级 |
| N | 不可转换 | 架构本质不兼容（webview/decoration/GUI 依赖） | — |
| E | 已有 coc 原生替代 | coc 生态已有等价或更优方案 | 推荐安装 coc 版 |
| S | 纯 Snippets | 纯代码片段，简单 snippets 格式转换即可 | 1-2 小时 |

**补充标记：**
- ✅ = 已在 registry 中
- 🏗 = 构建成功但运行时未验证
- 🐛 = 已知 converter bug 阻塞
- 🟢 = 原生 Neovim 能力，无需转换

---

## 一、必装通用（30 款）

| # | 名称 | 等级 | 分析 |
|---|------|------|------|
| 1 | Chinese (Simplified) | N | VS Code 本地化 UI 包。coc 本身中文支持独立管理，无可转换内容 |
| 2 | **Prettier** | 0 ✅ | 已收录 registry (`prettier-vscode`)，direct-api 类型。需要 prettier npm 包 |
| 3 | **ESLint** | 0b 🏗 | Pure LSP。converter 构建已成功，运行时待验证。npm 包 `vscode-eslint` 的 LSP server 可自动安装 |
| 4 | Error Lens | 3 | 核心依赖 `setDecorations` 行内错误显示。coc 的诊断通过 signcolumn + virtual text 实现，无法直接映射 VS Code 的 decoration 方式。需 coc 侧增强或另写 |
| 5 | Path Intellisense | 0b 🐛 | Direct-api。converter CLI 路径探测有问题（adaptation-guide #44 已记录）。修复后可转 |
| 6 | Auto Close Tag | 2 | 通过 TextDocumentChange 事件监听 + 文本插入实现标签自动闭合。converter 暂无事件到文本插入的映射，需加 transform |
| 7 | Auto Rename Tag | 2 | 自定义 LSP 协议 `$/auto-rename-tag`，server/client 分离架构。需 converter 支持自定义 LSP protocol |
| 8 | Highlight Matching Tag | 3 | decoration 驱动（`createTextEditorDecorationType`）。Neovim 有 `vim-matchup`、`rainbow` 等原生插件可替代 |
| 9 | TODO Highlight | 3 | decoration 高亮。Neovim 可用 `todo-comments.nvim` 替代 |
| 10 | TODO Tree | 3 | tree view + decoration。coc 无 tree view API，Neovim 可用 `todo-comments.nvim` |
| 11 | Bookmarks | 3 | decoration (gutter) + side bar。Neovim 有 `vim-bookmarks`、`mark` 等替代 |
| 12 | Better Comments | 3 | decoration 改变注释颜色。Neovim 可用 `todo-comments.nvim` 替代 |
| 13 | Indent Rainbow | N | decoration 缩进着色。Neovim 有 `indent-blankline.nvim` 原生插件替代 |
| 14 | vscode-icons | N | 文件图标主题。Neovim 用 `nvim-web-devicons` + `vim-devicons`，架构完全不同 |
| 15 | Code Runner | 2 | 调用外部命令在终端中运行代码。核心逻辑是构建命令 → terminal.sendText。可转为 coc 命令调用 Neovim `:terminal`。需手动适配 |
| 16 | Turbo Console Log | 1 | 插入 `console.log` 文本。可通过 coc-snippets 或简单命令实现，低工作量 |
| 17 | Console Ninja | 3 | 行内 decoration 显示 console.log 输出 + webview。不可行 |
| 18 | Fold All / Unfold All | N 🟢 | Neovim 原生支持 `zM`/`zR` 折叠操作，完全无需扩展 |
| 19 | Regex Previewer | 3 | decoration 实时高亮正则匹配项。不可行 |
| 20 | JSON Viewer | 2 | JSON 格式化/树形查看。可用 Neovim 原生 JSON 工具、`jq` 命令行替代。核心功能可转为 coc 命令 |
| 21 | XML Tools | 2 | XML 格式化/验证。依赖外部 `xmllint` 等工具，可封装为 coc 命令 |
| 22 | Bracket Pair Colorizer 2 | 3 | decoration 括号着色。Neovim 有 `nvim-ts-rainbow` 等原生替代 |
| 23 | Color Highlight | 3 | decoration 颜色色块显示。Neovim 有 `nvim-colorizer` 替代 |
| 24 | Image Preview | N | 悬停/内联图片预览，依赖 GUI webview。不可转换 |
| 25 | **Code Spell Checker** | 0b 🐛 | Pure LSP。有独立的 `cspell` language server，纯 LSP 协议。converter 构建失败问题待定位后可转 |
| 26 | EditorConfig for VSCode | N 🟢 | Neovim 通过 `editorconfig-vim` 插件原生支持，或 Neovim 0.9+ 内置 |
| 27 | NPM Intellisense | 2 | completion provider，从 node_modules 解析包名。需适配为 coc completion source |
| 28 | Import Cost | 3 | decoration 显示导入包大小。已有 [coc-import-cost](https://github.com/coc-plugin/coc-import-cost) 移植版 |
| 29 | Auto Import | E | LSP 原生功能（tsserver、pyright 等自动处理导入），无需单独扩展 |
| 30 | Iconify IntelliSense | 3 | completion + webview 图标预览。仅 completion 部分可转，预览无法实现 |

### 必装通用小结

| 可转等级 | 数量 | 明细 |
|---------|------|------|
| 已验证 (0) | 1 | Prettier |
| 理论可转 (0b) | 2 | ESLint, Code Spell Checker |
| 少量适配 (1) | 1 | Turbo Console Log |
| 需扩展转换器 (2) | 3 | Auto Close Tag, Code Runner, NPM Intellisense |
| 大规模改造 (3) | 7 | Error Lens, Auto Rename Tag, Highlight Matching Tag 等 |
| 不可转换 (N) | 11 | Chinese, vscode-icons, Indent Rainbow, Image Preview 等 |
| 原生替代 (E/🟢) | 2 | EditorConfig, Fold All |

**实际可入 registry（当前 converter 能力范围）：3 款**（Prettier ✅, ESLint 🏗, Code Spell Checker 🐛）
**Neovim 原生可替代：~10 款**（无需本转换项目）

---

## 二、推荐精选（70 款）

### Git 增强（15 款）

| # | 名称 | 等级 | 分析 |
|---|------|------|------|
| 31 | GitLens | 3 | 核心功能：blame decoration 行内注释、file lens、side bar 历史。coc 无 decoration 和 tree view 支持。Neovim 可用 `gitsigns.nvim` + `fugitive` 替代大部分功能 |
| 32 | Git Graph | N | 基于 webview 的 git 提交图。不可转换。Neovim 有 `vim-fugitive` `:GV` 或 `neogit` |
| 33 | Git History | 3 | decoration + webview。Neovim 有 `fugitive` `:GV` 替代 |
| 34 | Git Blame | N 🟢 | Neovim 有 `vim-fugitive` `:G blame`、`gitsigns.blame_line()` 等原生替代 |
| 35 | Git Commit Message Editor | N 🟢 | Neovim 打开 COMMIT_EDITMSG 时自动设置 filetype，无需扩展 |
| 36 | **gitignore** | 0 ✅ | 已收录 registry，direct-api |
| 37 | Git Flow | 1 | 纯 CLI 命令包装（`git flow ...`）。可转为 coc 命令直接调用 git-flow |
| 38 | Git Stash Helper | 2 | 命令 + quick pick UI 交互。coc 可用 `window.showQuickPick` 实现 |
| 39 | Git Merge Conflict Resolver | 3 | decoration 冲突标记 + inline 操作。Neovim 有 `conflict-marker.nvim` 替代 |
| 40 | Git Link | 1 | 生成并复制 git 链接。简单命令转换即可 |
| 41 | Git Diff | N 🟢 | Neovim 有 `vim-fugitive` `:Gdiff` 或 `gitsigns` diff 功能 |
| 42 | Git Rebase Helper | 3 | 交互式 rebase todo UI。Neovim 直接编辑 rebase-todo 文件即可 |
| 43 | Git Cherry-Pick | 1 | 简单 git cherry-pick 命令包装 |
| 44 | Git Branch Warnings | 2 | status bar 显示当前分支警告。coc 有 `window.createStatusBarItem` |
| 45 | Git Status Icons | N 🟢 | 文件浏览器图标。Neovim 文件浏览器插件（nvim-tree、oil 等）自带 |

### 接口 & HTTP 工具（10 款）

| # | 名称 | 等级 | 分析 |
|---|------|------|------|
| 46 | Thunder Client | 3 | 核心依赖 webview（响应预览、请求编辑器）。不可转换 |
| 47 | REST Client | 3 | webview 响应预览 + clipboard + showSaveDialog。不可转换。Neovim 可用 `rest.nvim` 插件替代 |
| 48 | Postman | N | Electron 独立应用，非 VS Code 扩展 |
| 49 | Api Debug | 2 | HTTP API 调试工具，命令驱动。可转为 coc 命令 |
| 50 | Swagger Viewer | 3 | webview 渲染 OpenAPI spec。不可转换 |
| 51 | OpenAPI Preview | 3 | webview 预览。不可转换 |
| 52 | HTTP Snippets | S | 纯代码片段，可转换为 coc-snippets 格式 |
| 53 | **GraphQL** | 0b 🐛 | Pure LSP（`graphql-language-service-server`）。converter 构建失败待修 |
| 54 | GraphQL Voyager | N | webview 交互式图谱。不可转换 |
| 55 | JSON Schema Viewer | 3 | webview + tree view。不可转换 |

### HTML / CSS / 静态页面（15 款）

| # | 名称 | 等级 | 分析 |
|---|------|------|------|
| 56 | **HTML CSS Support** | 0 ✅ | 已收录 registry (`html-css-support`)，direct-api |
| 57 | CSS Peek | 2 | go-to-definition for CSS 选择器。需 completion/definition provider 适配 |
| 58 | Color Info | 3 | decoration 颜色信息 + hover 增强。部分 hover 功能可转 |
| 59 | IntelliSense for CSS class names | 2 | completion provider 从 CSS 文件提取类名。可适配为 coc completion source |
| 60 | Live Server | N | HTTP 服务器 + 浏览器自动刷新。可直接使用 `live-server` npm CLI |
| 61 | Open in Browser | 1 | 简单命令，调用系统默认浏览器打开当前文件。可转为 coc 命令 |
| 62 | CSS Formatter | 1 | 格式化 provider。converter 已有 format provider 支持 |
| 63 | CSS Color Picker | 3 | webview 颜色选择器。不可转换 |
| 64 | PostCSS Language Support | 0b 🐛 | LSP（PostCSS Language Server）。converter 构建问题 |
| 65 | SCSS IntelliSense | 0b 🐛 | LSP。依赖 `vscode-scss`，converter 问题待定位 |
| 66 | Less IntelliSense | 0b 🐛 | LSP。类似 SCSS IntelliSense |
| 67 | Stylus | 2 | LSP + 语法高亮。Stylus LSP server 可独立使用 |
| 68 | CSS Modules | 1 | completion + definition provider。已在 adaptation-guide 列为 Level 1 |
| 69 | **Tailwind CSS IntelliSense** | 0 ✅ | 已收录 registry，e2e 验证通过 |
| 70 | **UnoCSS** | 0b 🐛 | LSP-based，有 `@unocss/language-server`。converter 待验证 |

### JavaScript / TypeScript 全家桶（20 款）

| # | 名称 | 等级 | 分析 |
|---|------|------|------|
| 71 | JavaScript and TypeScript Nightly | E | coc-tsserver 已提供 TS/JS 全部功能，且 nightly 只是 TS 版本差异 |
| 72 | TypeScript Hero | 3 | 重度依赖 decoration + 侧栏 + 重构 UI。不可行 |
| 73 | Quokka.js | 3 | 行内运行时求值（decoration）+ webview。不可转换 |
| 74 | JavaScript ES6 Snippets | S | 纯代码片段，可转换为 coc-snippets 格式 |
| 75 | TypeScript Snippets | S | 同上 |
| 76 | Module Resolver | 2 | 解析模块路径。可转为 coc 命令或 completion provider |
| 77 | JS Refactor | 2 | 重构代码操作。部分可由 LSP code action 覆盖，部分需自定义 |
| 78 | TS Refactor | 2 | 同上 |
| 79 | JavaScript Booster | 2 | code actions。可由 LSP + 自定义 code action provider 实现 |
| 80 | TypeScript React code snippets | S | 纯 snippets |
| 81 | ES7+ React Snippets | S | 纯 snippets |
| 82 | React Redux Snippets | S | 纯 snippets |
| 83 | React Native Snippets | S | 纯 snippets |
| 84 | Styled Components | 2 | CSS-in-JS 语法高亮 + completion。依赖 TextMate grammar 和 LSP |
| 85 | React Import | 1 | 自动 import React。LSP auto-import 已覆盖大部分 |
| 86 | Vue VSCode Snippets | S | 纯 snippets |
| 87 | Vue 3 Snippets | S | 纯 snippets |
| 88 | **Volar** | 0 ✅ | 已收录 registry，ts-bridge 类型 |
| 89 | Vue Document | 1 | 查看 Vue 文档的简单命令 |
| 90 | Vue Component Helper | S | 组件快速创建 snippets/command |

### 后端主流基础（10 款）

| # | 名称 | 等级 | 分析 |
|---|------|------|------|
| 91 | DotENV | N 🟢 | Neovim 原生支持 `.env` 语法高亮（需安装 `nvim-treesitter`） |
| 92 | Node.js Snippets | S | 纯 snippets |
| 93 | Python | E | coc 有 `coc-pyright` / `coc-jedi` 等完善支持 |
| 94 | Pylance | 0b | Pure LSP。Pylance 是微软闭源 LSP，通过 `@vscode/python-language-server` 包提供。需要验证 converter 能否处理其特殊打包方式 |
| 95 | Extension Pack for Java | 0b | 多个 LSP 捆绑包（`vscode-java` 等）。entry 路径问题已在 adaptation-guide 记录 (#24) |
| 96 | Spring Boot Extension Pack | 0b | 依赖 Java Extension Pack，额外加 Spring Boot LSP |
| 97 | Go | 2 | 官方 Go 扩展含有 test explorer、tree view、coverage decorations 等功能。核心 gopls LSP 可独立使用（已有 `coc-go`） |
| 98 | **PHP Intelephense** | 0b 🐛 | Pure LSP。商业 LSP 有独立 `intelephense` npm 包。converter 构建失败 (#20) |
| 99 | **Rust Analyzer** | 0b 🐛 | Pure LSP。entry 为 `src/main.ts`，converter 硬编码 `src/extension.ts` 导致失败 |
| 100 | Dockerfile Support | 2 | 语法高亮 + LSP。核心是 TextMate grammar + `docker-langserver`。LSP 部分可转 |

### 推荐精选小结

| 类别 | 0 (已验证) | 0b (理论可转) | 1 | 2 | 3 | N | E/🟢 | S |
|------|-----------|--------------|---|---|---|---|------|---|
| Git 增强 (15) | 1 | 0 | 3 | 1 | 2 | 5 | 3 | 0 |
| HTTP 工具 (10) | 0 | 1 | 0 | 1 | 6 | 1 | 0 | 1 |
| HTML/CSS (15) | 2 | 4 | 3 | 2 | 2 | 2 | 0 | 0 |
| JS/TS (20) | 1 | 0 | 2 | 4 | 2 | 0 | 1 | 10 |
| 后端 (10) | 0 | 5 | 0 | 1 | 0 | 0 | 2 | 2 |
| **合计** | **4** | **10** | **8** | **9** | **12** | **8** | **6** | **13** |

**已入 registry：** gitignore, HTML CSS Support, Tailwind CSS IntelliSense, Volar + Prettier（4 款 + 1 款重复）
**可优先加入 registry（修 converter bug 后）：** ESLint, GraphQL, PostCSS/SCSS/Less, UnoCSS, PHP Intelephense, Rust Analyzer（~7 款）
**纯 snippets 可自动转换：** 13 款（低价值）

---

## 三、可选拓展（110 款）

### 后端语言拓展（30 款）

| # | 名称 | 等级 | 分析 |
|---|------|------|------|
| 101 | Express Snippets | S | 纯 snippets |
| 102 | Koa Snippets | S | 纯 snippets |
| 103 | NestJS Snippets | S | 纯 snippets |
| 104 | Python Docstring Generator | 2 | 命令 + snippets 生成文档字符串。可转为 coc 命令 |
| 105 | Python Snippets | S | 纯 snippets |
| 106 | Python Test Explorer | 3 | test explorer UI + decorations。不可转换 |
| 107 | Black Formatter | 0b | Pure LSP / direct-api。通过 `black` Python 包格式化。可用 converter source 类型，但需要 pip 依赖支持 |
| 108 | Flake8 Lint | 2 | 调用 flake8 命令并解析输出显示 diagnostics。可转为 coc 诊断源 |
| 109 | Django Snippets | S | 纯 snippets |
| 110 | Flask Snippets | S | 纯 snippets |
| 111 | FastAPI Snippets | S | 纯 snippets |
| 112 | Lombok Annotations Support | 2 | Java lombok 注解处理。需 groovy 语法支持 + 特定处理 |
| 113 | Java Code Generators | 2 | 代码生成命令。可转为 coc 命令 |
| 114 | Maven for Java | 0b | LSP 项目工具。依赖 Java 扩展包 |
| 115 | Gradle for Java | 0b | 同上 |
| 116 | JUnit Test Runner | 3 | test explorer + decorations + debug。不可转换 |
| 117 | Go Snippets | S | 纯 snippets |
| 118 | Go Test Explorer | 3 | test explorer。不可转换 |
| 119 | Go Imports | 1 | 调用 `goimports` 格式化。可转为 coc 命令 |
| 120 | Go Lint | 1 | 调用 `golint` / `staticcheck`。可转为 coc 诊断源 |
| 121 | PHP Snippets | S | 纯 snippets |
| 122 | PHP Formatter | 1 | 调用 PHP 格式化工具。可转为 format provider |
| 123 | Ruby | 0b 🐛 | Pure LSP（Ruby LSP）。converter AST 转换产生语法错误 (#21) |
| 124 | Ruby Snippets | S | 纯 snippets |
| 125 | Perl | 2 | 语法高亮 + lint。TextMate grammar + Perl::Critic |
| 126 | C/C++ | 0b | Pure LSP（clangd）。官方扩展有 debug + tasks 等功能，但 clangd 本身可独立使用。需剥离非 LSP 部分 |
| 127 | C# | 0b 🐛 | Pure LSP（Roslyn）。entry 为 `src/main.ts`，converter 硬编码问题 (#23) |
| 128 | Unity Snippets | S | 纯 snippets |
| 129 | Swift | 0b | LSP（sourcekit-lsp）。官方扩展含 debug，LSP 部分可独立 |
| 130 | Kotlin | 0b 🐛 | LSP（Kotlin Language Server）。converter 构建失败 (#29) |

### 数据库工具（15 款）

| # | 名称 | 等级 | 分析 |
|---|------|------|------|
| 131 | Database Client | 3 | 完整数据库 GUI（webview）。不可转换 |
| 132 | SQLite Viewer | 3 | webview 数据查看。不可转换。可用 `sqlite3` CLI |
| 133 | MongoDB for VS Code | 3 | webview 连接管理 + playground。不可转换 |
| 134 | SQL Formatter | 1 | SQL 格式化。可转为 coc 命令 |
| 135-138 | SQLTools 系列 | 3 | 完整数据库 IDE（webview + tree view + 连接管理）。不可转换 |
| 139 | PostgreSQL Snippets | S | 纯 snippets |
| 140 | MySQL Snippets | S | 纯 snippets |
| 141 | Redis | 3 | webview + tree view。不可转换。可用 `redis-cli` |
| 142 | Cassandra | 2 | 语法高亮 + snippets |
| 143 | GraphQL Database | 3 | webview 数据浏览。不可转换 |
| 144 | **Prisma** | 0 ✅ | 已收录 registry |
| 145 | **Drizzle ORM** | 0b 🐛 | LSP（`drizzle-lab/drizzle-vscode`）。有 drizzle-language-server，converter 待验证 |

### Markdown / 文档 / 文本工具（20 款）

| # | 名称 | 等级 | 分析 |
|---|------|------|------|
| 146 | Markdown All in One | 1 | 格式化 + TOC + 预览（webview）+ decoration。格式化/TOC 可转，webview 不可转 |
| 147 | Markdown Preview Enhanced | 3 | webview 预览，含数学公式渲染。不可转换 |
| 148 | Markdown Table Formatter | 1 | 表格格式化。可转为 coc 命令 |
| 149 | Markdown Footnotes | 1 | footnotes 补全/导航。可转为命令或 completion |
| 150 | Markdown Math | 3 | webview 数学公式渲染。不可转换 |
| 151 | Markdown Emoji | 1 | emoji 补全。可转为 completion provider |
| 152 | Excel Viewer | 3 | webview CSV/Excel 查看。不可转换 |
| 153 | CSV to Table | 1 | CSV 转表格文本。可转为 coc 命令 |
| 154 | PDF Viewer | N | webview PDF 渲染。不可转换 |
| 155 | Word Viewer | 3 | webview docx 查看。不可转换 |
| 156 | Text Power Tools | 2 | 文本处理命令集合。可转为多个 coc 命令 |
| 157 | String Manipulation | 1 | 字符串操作命令（转换大小写等）。可转为 coc 命令 |
| 158 | Line Sort | 1 | 排序命令。可转为 coc 命令 |
| 159 | Line Duplicate | 1 | 去重命令。可转为 coc 命令 |
| 160 | Base64 | 1 | 编解码命令。可转为 coc 命令 |
| 161 | URL Encode/Decode | 1 | 编解码命令。可转为 coc 命令 |
| 162 | Hex Editor | 3 | 自定义十六进制编辑器。不可转换 |
| 163 | Diff Tool | N 🟢 | Neovim 原生 `:diffthis` 功能或 `vim-fugitive` `:Gdiff` |
| 164 | Batch Replace | 2 | 批量查找替换。可通过 `:argdo` / `coc-commands` 实现 |
| 165 | Lorem Ipsum | 1 | 插入占位文本。可转为 coc 命令或 snippets |

### 代码质量 / 测试框架（15 款）

| # | 名称 | 等级 | 分析 |
|---|------|------|------|
| 166 | **Stylelint** | 0 ✅ | 已收录 registry，pure-lsp |
| 167 | HTMLHint | 0b | Pure LSP（有 `htmlhint` LSP server）。converter 待验证 |
| 168 | Jest | 2 | test explorer + decorations + 运行命令。核心测试运行可转为 coc 命令，UI 部分不可转 |
| 169 | Mocha | 2 | 类似 Jest |
| 170 | Chai | S | assertion snippets |
| 171 | Cypress Snippets | S | 纯 snippets |
| 172 | Playwright Snippets | S | 纯 snippets |
| 173 | E2E Test Runner | 3 | test explorer。不可转换 |
| 174 | Code Coverage | 3 | decoration 覆盖率高亮。不可转换 |
| 175 | **SonarLint** | 0b 🐛 | Pure LSP（SonarLint Language Server）。需要验证其特殊的协议和认证流程 |
| 176-178 | ESLint Plugin * | 1 | ESLint 插件规则配置，非独立扩展。ESLint 规则由 ESLint LSP 统一处理 |
| 179 | Prettier ESLint | 1 | Prettier + ESLint 联动格式化。可转为 format provider 组合 |
| 180 | Lint Staged | 1 | git hook 配置助手。可转为 coc 命令 |

### 小众语法 / 配置 / 框架补充（30 款）

| # | 名称 | 等级 | 分析 |
|---|------|------|------|
| 181 | YAML Formatter | 0b | YAML 格式化。可复用 `yaml-language-server` 的格式化能力（已有 YAML registry 条目） |
| 182 | TOML Language Support | 0 ✅ | 已通过 Taplo 收录 registry |
| 183 | Protocol Buffers | 1 | Proto3 格式化 + lint + 编译。已在 adaptation-guide 列为 Level 1 |
| 184 | Apache Conf | 2 | 语法高亮。TextMate grammar 转换 |
| 185 | Nginx Config | 2 | 语法高亮 + lint。可使用 `nginx -t` 校验 |
| 186 | Docker Compose | 2 | 语法高亮 + completion。YAML schema 验证 |
| 187 | Kubernetes YAML | 2 | YAML schema 验证 + completion。通过 YAML LSP 的 schema 机制实现 |
| 188 | Helm Templates | 2 | 语法高亮 + 模板 lint |
| 189 | **Terraform** | 0b 🐛 | Pure LSP（terraform-ls）。converter 构建失败 (#19) |
| 190 | **Ansible** | 0 ✅ | 已收录 registry，e2e 验证通过 |
| 191 | Vagrant | 1 | 语法高亮 + 命令。可转为简单 snippets |
| 192 | Makefile Tools | 2 | Makefile 语法 + 目标补全。可通过 LSP 或 completion provider 实现 |
| 193 | Dart | 0b | LSP（`dart language-server`）。需要处理 decorations/tree/debug 等剥离 |
| 194 | Flutter Snippets | S | 纯 snippets |
| 195 | Lua | 0 ✅ | 已收录 registry，pure-lsp（二进制 server） |
| 196 | Lua Snippets | S | 纯 snippets |
| 197 | ShellCheck | 0b | LSP（有 shellcheck LSP 集成）。可用 `shellcheck` 外部命令转为诊断 |
| 198 | Batch Script | 2 | 语法高亮。TextMate grammar |
| 199 | PowerShell | 0b 🏗 | Pure LSP。converter 构建已成功，运行时待验证 |
| 200 | Nuxt Snippets | S | 纯 snippets |
| 201 | Next.js Snippets | S | 纯 snippets |
| 202 | **Svelte** | 0 ✅ | 已收录 registry（待验证） |
| 203 | Svelte Snippets | S | 纯 snippets |
| 204 | SolidJS Snippets | S | 纯 snippets |
| 205 | Handlebars | 2 | 语法高亮 + completion。TextMate grammar |
| 206 | Pug | 2 | 语法高亮 + completion。 |
| 207 | EJS Language Support | 2 | 语法高亮。TextMate grammar |
| 208 | WeChat Mini Program | 2 | 语法高亮 + snippets |
| 209 | Miniprogram API Snippets | S | 纯 snippets |
| 210 | Batch Runner | 2 | 批量执行命令 |

### 可选拓展小结

| 子类 | 0 | 0b | 1 | 2 | 3/N | S |
|------|---|---|---|---|-----|--|
| 后端语言 (30) | 0 | 8 | 3 | 3 | 3 | 11 |
| 数据库 (15) | 1 | 1 | 1 | 1 | 9 | 2 |
| 文档/文本 (20) | 0 | 0 | 10 | 2 | 6 | 0 |
| 代码质量 (15) | 1 | 2 | 3 | 2 | 5 | 2 |
| 小众语法 (30) | 3 | 3 | 2 | 11 | 1 | 10 |
| **合计** | **5** | **14** | **19** | **19** | **24** | **25** |

---

## 全景汇总

### 按等级统计全部 210 款

| 等级 | 数量 | 占比 | 说明 |
|------|------|------|------|
| **0 — 已验证** | 10 | 4.8% | Prettier, gitignore, HTML CSS Support, Tailwind CSS, Volar, Prisma, Stylelint, Ansible, Lua, TOML (Taplo) |
| **0b — 理论可转** | 26 | 12.4% | ESLint, Code Spell Checker, GraphQL, PostCSS, SCSS, Less, UnoCSS, PHP Intelephense, Rust Analyzer, Ruby LSP, C#, Java, Maven, Gradle, Swift, Kotlin, C/C++, YAML, Terraform, ShellCheck, Dart, PowerShell, HTMLHint, SonarLint, Pylance, Drizzle ORM |
| **1 — 少量适配** | 28 | 13.3% | Turbo Console Log, CSS Formatter, CSS Modules, Git Link, Git Cherry-Pick, Git Flow, Open in Browser, Vue Document, Go Imports, Go Lint, PHP Formatter, SQL Formatter, Markdown (Table/Footnotes/Emoji), CSV to Table, String Manipulation, Base64, Lorem Ipsum, ESLint Plugin 系列, Prettier ESLint, Lint Staged, Protobuf, Vagrant, React Import 等 |
| **2 — 扩展转换器** | 28 | 13.3% | Auto Close Tag, Code Runner, NPM Intellisense, Git Stash Helper, CSS Peek, CSS Class Names, Stylus, JS/TS Refactor, JavaScript Booster, Python Docstring, Flake8, Go (LSP), Dockerfile, Text Power Tools, Batch Replace, Jest/Mocha, Apache/Nginx/Docker Compose/K8s/Helm/Makefile, Styled Components, Handlebars/Pug/EJS 等 |
| **3 — 大规模改造** | 43 | 20.5% | Error Lens, Auto Rename Tag, Highlight Matching Tag, TODO Highlight/Tree, Bookmarks, Better Comments, Console Ninja, Regex Previewer, Color Highlight, Iconify IntelliSense, GitLens, Git History, REST Client, Thunder Client, Swagger Viewer, Color Info, CSS Color Picker, Hex Editor, Database Client 系列, Markdown Preview/Math, Excel Viewer, Hex Editor, Test Explorer 系列, Code Coverage 等 |
| **N — 不可转换** | 18 | 8.6% | Chinese (Simplified), vscode-icons, Indent Rainbow, Image Preview, Indent Rainbow, Git Graph, Blame, Diff, Git Status Icons, Postman, Live Server, GraphQL Voyager, PDF Viewer, Fold All, EditorConfig, DotENV, Diff Tool, Postman 等 |
| **E/🟢 — 原生替代** | 8 | 3.8% | EditorConfig, Fold All, Git Blame, Git Commit Message Editor, Git Diff, Git Status Icons, Python (coc-pyright), TS/JS (coc-tsserver) |
| **S — 纯 Snippets** | 38 | 18.1% | 各种 js/ts/react/vue/php/go 代码片段 |

### 优先级路线图

```
P0（当前 registry 已有 14 款）
  └─ 已验证 10 款 + 待验证 4 款（ESLint, PowerShell, Svelte, Astro）

P1（修 converter bug → 可入 registry，~15 款）
  ├─ 修 entry 硬编码：Rust Analyzer, C#, Java, Astro
  ├─ 修 vscode external：YAML, Zig
  ├─ 修文件拷贝：YAML, Stylelint
  ├─ 修 AST 语法：Ruby LSP
  └─ 修 CLI 路径：Ruff, Path Intellisense

P2（Level 1 少量适配，~28 款）
  ├─ Markdown 工具链（Table/Footnotes/Emoji）
  ├─ Web 工具（CSS Formatter, CSS Modules, Open in Browser）
  ├─ Git 小工具（Link, Cherry-Pick, Flow）
  └─ 后端辅助（Go Imports, Go Lint, PHP Formatter, SQL Formatter）

P3（Level 2 扩展转换器，~28 款）
  ├─ 加 provider transforms：Auto Close Tag, NPM Intellisense, CSS Class Names
  ├─ 加 LSP protocol：Auto Rename Tag
  ├─ 加 test adapter：Jest, Mocha
  └─ 加语法转换：Handlebars, Pug, Nginx

不可转（共 ~18 + 43 = 61 款）
  └─ 建议在文档中推荐 Neovim 原生替代方案
```

### 建议

1. **优先修复 converter bug**（entry 硬编码、vscode external、文件拷贝）— 修复后可释放 ~15 款 LSP 插件的转换能力
2. **Snippets 插件通过 `snippets` step 入 registry** — 20 款纯 snippets 扩展已通过 `snippets` step type 转换入 registry，用户按需安装（参见 `TODO-convert.md` Snip 章节）
3. **不可转的 decoration/webview 插件** — 建议在文档中指引用户使用 Neovim 原生替代方案（~61 款）
4. **Registry 扩展计划** — 按 P0→P1→P2 顺序逐步添加，每个新条目需经过 `converter convert → esbuild → npm install` 全链路验证

---

> 分析日期：2026-06-14
> 分析依据：VS Code 扩展市场数据 + converter v1.2.2 源码 + adaptation-guide.md + vscode-api-feasibility.md
