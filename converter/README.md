# converter — vscode → coc 转换器原型

将 VS Code 扩展自动转换为 coc.nvim 插件的 CLI 工具。

## 用法

```bash
# 转换一个 VS Code 扩展目录
npx tsx src/cli.ts convert ./vscode-ext/ -o ./coc-ext/

# 安装到 coc
cd ./coc-ext && npm install && npm run build
cd ~/.config/coc/extensions && npm install /path/to/coc-ext
```

## 已验证的转换

| 插件 | 类型 | 自动检测 | 构建 | 功能 |
|------|------|---------|------|------|
| Volar (Vue) | TS 桥接型 | `@vue/language-server` + `typescript` | ✅ | ✅ |
| Prisma | 纯 LSP | `@prisma/language-server` | ✅ | ✅ |

TS 桥接型插件需要修改版 coc-tsserver（[PR #493](https://github.com/neoclide/coc-tsserver/pull/493)）：

```bash
cd ~/.config/coc/extensions
npm install ChuYanLon/coc-tsserver --legacy-peer-deps
```

## 架构

```
输入：VS Code 扩展目录
  │
  ├─ scanner        分析 API → 检测插件类型（TS 桥接/纯 LSP）
  ├─ transforms/    AST 变换
  │   ├─ import-mapping    from 'vscode' → from 'coc.nvim'
  │   └─ language-client   LanguageClient 签名适配
  ├─ mark-unsupported  标记 decoration/webview 等（注释保留）
  ├─ generate src/index.ts   主入口（含自动桥接/纯 LSP 两种模板）
  ├─ generate package.json   依赖/配置/esbuild external
  └─ generate esbuild.mjs    构建配置
```

## 文件结构

| 文件 | 行数 | 说明 |
|------|------|------|
| `src/cli.ts` | 28 | CLI 入口 |
| `src/convert.ts` | ~380 | 主流程 + 模板生成 |
| `src/scanner.ts` | 136 | API 扫描 + 插件分类 |
| `src/transforms/import-mapping.ts` | 47 | import 替换 |
| `src/transforms/language-client.ts` | 48 | LanguageClient 适配 |
| **总计** | **~645** | |

## 关键设计

- **零硬编码** — 服务器包名从源码自动检测
- **bin 入口回退** — 自动检测并优先使用 `package.json` 的 `bin` 入口
- **esbuild external 自动注入** — 检测到的服务器包自动标记为 external
- **TS 桥接型自动注入** — `typescriptServerPlugins` + `tsserver/request` 转发
