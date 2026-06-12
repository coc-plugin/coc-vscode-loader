# vscode-coc-loader

将 VS Code 扩展转换为 coc.nvim 插件的转换工具与包管理器。

## 背景

[coc.nvim](https://github.com/neoclide/coc.nvim) 的 API 设计深受 VS Code 扩展 API 影响——两者使用相同的 LSP 协议、相似的 Provider 体系、近似的命名空间结构。这使得 VS Code 扩展有可能通过机械转换移植到 coc.nvim。

本仓库包含两部分内容：
1. **转换器原型** ([`converter/`](./converter/)) — 自动将 VS Code 扩展转为 coc 插件
2. **包管理器插件** ([`coc-converter/`](./coc-converter/)) — coc.nvim 插件，TUI 界面安装转换后的插件

> 📖 API 映射文档和注册表已迁移到独立仓库 [coc-vscode-registry](https://github.com/coc-plugin/coc-vscode-registry)。

## 转换器原型

[`converter/`](./converter/) 是一个 CLI 工具，可以自动将 VS Code 扩展转换为 coc.nvim 插件。

```bash
cd converter
npx tsx src/cli.ts convert ../path/to/vscode-ext -o ./output
cd ./output && npm install && npm run build
```

**已验证通过的转换：**

| 插件 | 类型 | 状态 | 说明 |
|------|------|------|------|
| Volar (Vue) | TS 桥接型 | ✅ | 需要修改版 coc-tsserver (PR #493) |
| Prisma | 纯 LSP | ✅ | 自动检测 bin 入口 |
| HTML CSS Support | 直接 API | ✅ | 自动处理 new→create、缺失 API polyfill |

**转换器架构：**

```
输入 → 扫描 (API 检测 + 插件分类 → TS桥接/纯LSP/直接API)
     → AST 变换 (import / class-to-factory / provider-register / LanguageClient / enum-offset)
     → 缺失 API 替换 (getWordRangeAtPosition / fileName 等 polyfill)
     → 标记不可移植代码 (decoration / webview / 复杂缺失API)
     → 生成入口 (桥接代码 / LanguageClient / 保留原始 extension.ts)
     → 生成 package.json + esbuild external 自动注入
     → 输出 coc 插件目录 + 迁移报告
```

> 完整的 API 映射文档和迁移指南请参阅 [coc-vscode-registry/docs](https://github.com/coc-plugin/coc-vscode-registry/tree/main/docs)。

## 参考文件

- `vscode.d.ts` — VS Code 扩展 API 类型定义（取自 vscode main 分支）
- `coc.d.ts` — coc.nvim API 类型定义（取自 coc.nvim master 分支）
