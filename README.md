# vscode-coc-loader

将 VS Code 扩展转换为 coc.nvim 插件的参考文档与工具。

## 背景

[coc.nvim](https://github.com/neoclide/coc.nvim) 的 API 设计深受 VS Code 扩展 API 影响——两者使用相同的 LSP 协议、相似的 Provider 体系、近似的命名空间结构。这使得 VS Code 扩展有可能通过机械转换移植到 coc.nvim。

本仓库整理了完整的 API 映射关系与迁移参考。

## 文档

| 文档 | 说明 |
|------|------|
| [vscode-vs-coc-api-diff.md](./vscode-vs-coc-api-diff.md) | VS Code vs coc.nvim API 完整差异对比 |
| [vscode-api-feasibility.md](./vscode-api-feasibility.md) | 可实现性分析—哪些 VS Code API 能/不能移植到 coc |
| [mapping-quickref.md](./mapping-quickref.md) | API 速查表（vscode ⇄ coc 双向对照） |
| [provider-signature-card.md](./provider-signature-card.md) | 所有 Provider 注册函数签名精确对比 |
| [pattern-migration-examples.md](./pattern-migration-examples.md) | 常见模式的迁移代码示例（vscode → coc） |
| [manifest-activation-mapping.md](./manifest-activation-mapping.md) | package.json / activationEvents / contributes 对比 |
| [import-mapping.md](./import-mapping.md) | import 名完整对照（vscode → coc.nvim） |

## 参考文件

- `vscode.d.ts` — VS Code 扩展 API 类型定义（取自 vscode main 分支）
- `coc.d.ts` — coc.nvim API 类型定义（取自 coc.nvim master 分支）
