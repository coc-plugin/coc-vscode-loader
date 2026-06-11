# vscode-coc-loader

将 VS Code 扩展转换为 coc.nvim 插件的参考文档、工具与验证案例。

## 背景

[coc.nvim](https://github.com/neoclide/coc.nvim) 的 API 设计深受 VS Code 扩展 API 影响——两者使用相同的 LSP 协议、相似的 Provider 体系、近似的命名空间结构。这使得 VS Code 扩展有可能通过机械转换移植到 coc.nvim。

本仓库包含三部分内容：
1. **API 映射文档** — 完整的迁移参考
2. **转换器原型** ([`converter/`](./converter/)) — 自动将 VS Code 扩展转为 coc 插件
3. **验证案例** — Volar (Vue) 和 Prisma 的成功转换

## API 文档

| 文档 | 说明 |
|------|------|
| [vscode-vs-coc-api-diff.md](./vscode-vs-coc-api-diff.md) | VS Code vs coc.nvim API 完整差异对比 |
| [vscode-api-feasibility.md](./vscode-api-feasibility.md) | 可实现性分析—哪些 VS Code API 能/不能移植到 coc |
| [mapping-quickref.md](./mapping-quickref.md) | API 速查表（vscode ⇄ coc 双向对照） |
| [provider-signature-card.md](./provider-signature-card.md) | 所有 Provider 注册函数签名精确对比 |
| [pattern-migration-examples.md](./pattern-migration-examples.md) | 常见模式的迁移代码示例（vscode → coc） |
| [manifest-activation-mapping.md](./manifest-activation-mapping.md) | package.json / activationEvents / contributes 对比 |
| [import-mapping.md](./import-mapping.md) | import 名完整对照（vscode → coc.nvim） |
| [converter-design-v2.md](./converter-design-v2.md) | 转换器架构设计与 Bridge 系统 |
| [volar-migration-guide.md](./volar-migration-guide.md) | Volar 迁移案例详解 |

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

**转换器架构：**

```
输入 → 扫描 (API 检测 + 插件分类)
     → AST 变换 (import / LanguageClient / provider)
     → 标记不可移植代码 (decoration / webview)
     → 生成桥接代码 (TS 桥接型自动加 tsserver/request 转发)
     → 生成 package.json + esbuild 配置
     → 输出 coc 插件目录
```

详见 [`converter-design-v2.md`](./converter-design-v2.md)。

## 参考文件

- `vscode.d.ts` — VS Code 扩展 API 类型定义（取自 vscode main 分支）
- `coc.d.ts` — coc.nvim API 类型定义（取自 coc.nvim master 分支）
