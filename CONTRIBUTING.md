# Contributing

Thanks for your interest in contributing to coc-vscode-loader!

## 理解两个仓库的关系

将一个 VS Code 扩展运行在 coc.nvim 上需要两部分配合：

```
coc-vscode-loader          ← 解析器（converter）：负责转换 VS Code 扩展的代码
  └─ converter/               AST 变换、LanguageClient 生成、入口注入等
  
coc-vscode-registry        ← 注册表（registry）：记录哪些插件可装、如何转换
  └─ registry.json            每个插件的 source 地址 + convert 配置
```

**添加一个新插件时，永远需要问：解析器已经能处理它了吗？**

---

## 添加新插件的工作流

```
你想把某个 VS Code 扩展跑在 coc.nvim 上
                  │
                  ▼
     检查该扩展用了哪些 VS Code API
                  │
        ┌─────────┴──────────┐
        ▼                    ▼
  现有转换器能处理         转换器不能完全处理
  （纯 LSP、标准          （用了未覆盖的 API、
   API 调用）              新的 provider 类型等）
        │                    │
        │                    ├─ 1. 在 converter/ 加新 transform
        │                    ├─ 2. 在 converter/ 加新 provider 适配
        │                    └─ 3. 可能需加新 bridge preset
        │                    │
        ▼                    ▼
  只需 registry 条目     registry 条目 + converter PR
  （下面步骤 1-3）       （两个仓库都要改）
```

---

## 步骤详解

### 1. 分析插件类型

确定插件属于哪一类：

| 类型 | 特点 | 示例 | 解析器需处理？ |
|------|------|------|--------------|
| `pure-lsp` | 纯 LSP，通过 LanguageClient 启动语言服务 | Prisma, ESLint, YAML | 已有 `language-client` 步骤 |
| `ts-bridge` | 依赖 TS 语言服务器通信 | Volar, Angular | 已有 `ts-bridge` preset |
| `direct-api` | 直接调用 coc.nvim API，无语言服务 | HTML CSS Support | 需检查是否覆盖所用 API |
| 新类型 | 以上都不符合 | — | 需加新 bridge preset 或 transform |

### 2. 配置 convert 字段

`registry.json` 的 `convert` 数组告诉解析器如何转换：

```jsonc
{
  "name": "my-plugin",
  "type": "pure-lsp",   // ← 仅用于 TUI 分类显示，不影响转换行为
  "source": {
    "type": "github",
    "repo": "owner/repo",
    "subdir": "extensions/vscode"
  },
  "languages": ["mylang"],
  "convert": [
    // 类型 1: 生成 LanguageClient 入口，启动一个 LSP 服务器
    {
      "type": "language-client",
      "server": {
        "kind": "module",         // "module" → npm 包, "binary" → 下载二进制
        "package": "some-lsp-server",
        "entry": "bin"            // "main" 或 "bin"，多 bin 可用 binName
      },
      "languages": ["mylang"]
    },
    // 类型 2: 对源码做 AST 变换
    {
      "type": "source",
      "transforms": ["import-mapping", "class-to-factory", "provider-register"]
    },
    // 类型 3: 桥接代码（ts-bridge 等）
    {
      "type": "bridge",
      "preset": "ts-bridge"
    },
    // 类型 4: 标记不支持 API
    {
      "type": "mark-unsupported"
    }
  ]
}
```

### 3. 如果解析器不满足需求

当遇到解析器未覆盖的 API 或模式时，需要在 `coc-vscode-loader` 中扩展，然后才能在 registry 中配置：

**场景 A：缺某种 AST 变换**
- 在 `converter/src/transforms/` 下新增 transform
- 在 `converter/src/transforms/index.ts` 注册
- 然后在 registry 的 `convert` 中引用新 transform 名

**场景 B：缺某个 provider 适配**
- 扩展 `converter/src/transforms/provider-register.ts`，添加新的签名适配

**场景 C：需要新的 bridge preset**
- 在 `converter/src/steps/bridge.ts` 添加新 preset

### 4. 验证

```bash
# 验证 registry JSON 格式
python3 -c "import json; json.load(open('path/to/registry.json'))"

# 本地测试转换
cd converter
npx tsx src/cli.ts convert ../path/to/vscode-ext -o ./output \
  --convert-file <(echo '[{"type":"source","transforms":["import-mapping"]}]')
cd ./output && npm install && node esbuild.mjs
```

### 5. 提交 PR

- **只改 registry** → 向 [coc-vscode-registry](https://github.com/coc-plugin/coc-vscode-registry) 提 PR
- **registry + converter 都改** → 向本仓库（coc-vscode-loader）提 PR，包含 registry 条目
  - 两个变更必须在同一个 PR 中，否则插件无法运行

---

## Code style

- No semicolons in TypeScript
- Single quotes for strings
- 2-space indentation
- See `.editorconfig`

## Questions?

Open an issue at https://github.com/coc-plugin/coc-vscode-loader/issues
