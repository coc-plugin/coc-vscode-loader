# vscode → coc 转换器 — 最终方案

## 核心思路

**一个 coc 插件作为包管理器。** 用户只装一次，之后跟 mason 一样操作：

```
:CocInstall coc-vscode-loader
:CocCommand loader.install vscode-volar     ← 下载 VS Code 插件 → 转换 → 安装
:CocCommand loader.open              ← TUI 管理界面
:CocCommand loader.uninstall vscode-volar   ← 卸载
```

> 当前版本: **v1.5.8** — 见 [CHANGELOG.md](../CHANGELOG.md)
> 注册表: **128 条目**，覆盖 pure-lsp、direct-api、ts-bridge、snippets 四类

---

## 一、插件分类

| 类型 | 特点 | 代表 | 自动化程度 |
|------|------|------|-----------|
| 纯 LSP | 无外部依赖，LanguageClient 直连 | ESLint、JSON、HTML、YAML | **~95%** |
| TS 桥接型 | 需要与 TypeScript 语言服务器通信 | Volar | **~85%** + 桥接配置 |
| 纯 LSP (ng) | 独立 LSP 服务器，通过 LanguageClient 连接 | Angular Language Service | **~95%** |
| 纯 Snippets | 无代码，只有 JSON 片段文件 | 92 种 snippet 扩展 | **100%** |
| direct-api | 直接暴露 API，通过 import-mapping 转换 | Prettier、Code Runner | **~80-95%** |

### TS 桥接型插件的特殊处理

Volar v3 架构要求 LSP 客户端做 `tsserver/request` ↔ `tsserver/response` 桥接：

```
Vue Language Server                    TypeScript Server
       │                                      │
       │── tsserver/request (#1, cmd, args) ──▶│
       │                                      │
       │◀─ tsserver/response (#1, body) ──────│
       │                                      │
```

VS Code 的实现依赖 `typescript.tsserverRequest` 内置命令，coc 没有。解决方案：

1. **修改 coc-tsserver**：添加 `globalPlugins` 支持 + 注册 `typescript.tsserverRequest` 命令（PR [#493](https://github.com/neoclide/coc-tsserver/pull/493)）
2. **插件 package.json**：声明 `typescriptServerPlugins` contribution
3. **转换器的 registry**：标记该插件为"TS 桥接型"，安装时自动执行上述两步

---

## 二、整体架构 — 配置驱动（v2.0）

```
                     ┌──────────────────────┐
                    │   输入：VS Code 插件   │
                    │   (目录 / npm / git)  │
                    └────────┬─────────────┘
                             ▼
          ┌──────────────────────────────────┐
          │     registry → convert[]         │
          │   声明式步骤数组，精确描述转换策略 │
          │   不再做启发式扫描/猜测          │
          └────────┬─────────────────────────┘
                   ▼
          ┌──────────────────────────────────┐
          │     steps/ (步骤生成器-注册模式)  │
          │   ├ language-client (module/binary)│
          │   ├ source (copy + 5 transforms)  │
          │   ├ bridge (BRIDGE_TEMPLATES)     │
          │   ├ snippets (JSON 复制 + 空壳)   │
          │   └ mark-unsupported (移除特征)   │
          └────────┬─────────────────────────┘
                   ▼
          ┌──────────────────────────────────┐
          │     convert.ts (主流程)            │
          │   ├ 扫描含 `from 'vscode'` 的文件 │
          │   ├ 按步骤顺序执行生成器           │
          │   ├ 合并生成的文件 + code injections│
          │   ├ apply 文本替换层 + patches     │
          │   ├ 生成 package.json / esbuild.mjs│
          │   └ 输出转换报告                   │
          └────────┬─────────────────────────┘
                   ▼
          ┌─────────────────────────────┐
          │    输出：coc 插件目录 + 报告   │
          └─────────────────────────────┘
```

---

## 三、桥接预设系统

桥接逻辑通过 preset + `BRIDGE_TEMPLATES` 驱动，定义在 `converter/src/steps/bridge.ts` 中。`convert.ts` 不关心桥接细节，只注册步骤生成器。

### 当前内置 preset

[`coc-vscode-registry/presets.json`](https://github.com/coc-plugin/coc-vscode-registry/blob/main/presets.json) 中定义了 `type` 字段，映射到 `converter/src/steps/bridge.ts` 的 `BRIDGE_TEMPLATES`：

| 预设 | BRIDGE_TEMPLATE 类型 | 用途 |
|------|---------------------|------|
| `ts-bridge` | `tsserver-forward` | Volar 的 TypeScript 桥接 |

当前只有 **1 个** bridge template（`tsserver-forward`）。`prettier` 预设已废弃，改用 `source` 步骤。

```typescript
// BRIDGE_TEMPLATES in bridge.ts (当前唯一)
'tsserver-forward': (opts) => ({
  code: `client.onNotification('tsserver/request', async ([seq, command, args]: [number, string, any]) => {
    try {
      const result = await commands.executeCommand<any>('${command}', command, args, { isAsync: true, lowPriority: true })
      client.sendNotification('tsserver/response', [seq, result?.body])
    } catch { client.sendNotification('tsserver/response', [seq, undefined]) }
  })`,
  injectExts: opts.extensions || [],
  injectSvcs: opts.services || [],
  callAfter: 'registerBridge(context, client)',
  extraDeps: ['typescript'],
}),
```

### 添加新桥接

只需在 `bridge.ts` 的 `BRIDGE_TEMPLATES` 添加新类型 + `coc-vscode-registry/presets.json` 加预设定义。不需要改 `convert.ts`。

---

## 四、注册表（coc-vscode-registry）

注册表已独立为 [coc-vscode-registry](https://github.com/coc-plugin/coc-vscode-registry) 仓库，[`registry.json`](https://github.com/coc-plugin/coc-vscode-registry/blob/main/registry.json)。

当前 **128 条目**，按 type 分布：

| type | 数量 | 说明 |
|------|------|------|
| `snippets` | 92 | 纯代码片段扩展 |
| `pure-lsp` | 29 | 纯 LSP 服务器 |
| `direct-api` | 6 | 直接调用 API |
| `ts-bridge` | 1 | TS 桥接型 (Volar) |

条目格式：

```typescript
{
  name: string
  displayName: string
  description: string
  type: 'ts-bridge' | 'pure-lsp' | 'direct-api' | 'snippets'
  source: { type: 'github'; repo: string; subdir?: string }
  url: string
  languages: string[]
  categories: string[]
  convert: Step[]  // 转换步骤
  minPluginVersion?: string  // 最低 coc-vscode-loader 版本
}
```

注册表的数据由 `plugin/src/registry.ts` 在运行时拉取，converter 不再内置固定列表。

---

## 五、转换流程（配置驱动）

```
convert <input-vscode-ext> -o <output-dir> --convert <json>
  │
  ├─ 1. 读取 --convert 步骤配置（来自 registry 条目）
  │     不再做 server 检测/类型猜测
  │
  ├─ 2. 扫描含 `from 'vscode'` / `require('vscode')` 的文件
  │
  ├─ 3. 按步骤顺序执行生成器（5 种注册步骤）
  │     每个步骤输出 generatedFiles + keepDeps + codeInjections
  │
  │     ├─ language-client 生成 LanguageClient 代码（module/binary）
  │     │   kind: module → { module, transport, args? }
  │     │   kind: binary → { command, args }
  │     │   支持 patches（server 编译后文本替换）
  │     │
  │     ├─ source 转换 TypeScript 源码（5 种 transform）
  │     │   ├ import-mapping        from 'vscode' → from 'coc.nvim' + 文本 polyfills
  │     │   ├ class-to-factory      new Xxx() → Xxx.create()
  │     │   ├ provider-register     注册函数重命名 + 补齐签名
  │     │   ├ enum-offset           注释提醒枚举值差异
  │     │   └ strip-volar           移除 Volar 框架导入（@vue/vscode-snippets 等）
  │     │
  │     ├─ bridge 生成桥接代码（BRIDGE_TEMPLATES）
  │     │   当前仅 `tsserver-forward`（Volar 的 TS 桥接）
  │     │
  │     ├─ snippets 复制 JSON 文件 + 生成空壳 activate()
  │     │
  │     └─ mark-unsupported 标记不支持的特征
  │
  ├─ 4. 文本替换层（对所有输出 .ts/.js 执行）
  │     ├─ .fileName → Uri.parse($1.uri).fsPath
  │     ├─ .uri.fsPath → Uri.parse($1.uri).fsPath（解构拆分）
  │     ├─ getWordRangeAtPosition → 内联词边界计算
  │     ├─ Location.create(Uri.file(x), y) → Location.create(x, Range.create(y, y))
  │     ├─ new WorkspaceEdit() → ({ changes: {} })
  │     ├─ .set(uri, edits) → .changes[uri] = edits
  │     └─ 自动注入 Uri/Range import
  │
  ├─ 5. 应用插件级 patches（registry 中 per-entry 的 find/replace）
  │
  ├─ 6. 生成 package.json + esbuild.mjs + coc-convert.json
  │     ├─ dependencies（server deps + keepDeps，支持 excludeDeps 过滤）
  │     ├─ activationEvents（从各步骤收集）
  │     ├─ typescriptServerPlugins（ts-bridge 型）
  │     ├─ esbuild external 自动注入
  │     └─ server-patches.json（server 编译后补丁）
  │
  └─ 7. 输出转换报告
```

---

## 六、插件分类验证

经过 128 条 registry 条目的实际转换验证：

| 类别 | 验证方式 | 代表条目 |
|------|----------|----------|
| pure-lsp (module) | language-client 生成 + npm install + esbuild | ESLint、Pyright、Tailwind CSS |
| pure-lsp (binary) | GitHub Release 下载 + 解压 + 代码生成 | Deno、Biome、Clangd |
| pure-lsp (goPackages) | `go install` 编译到 server/ | gopls |
| pure-lsp (cargoPackages) | `cargo install --root` 编译到 server/ | 代码已支持，当前无条目使用 |
| pure-lsp (pipPackages) | `pip install` 安装依赖 | ansible-lint |
| direct-api | source 转换 + API polyfills | Prettier、Code Runner、CSS Modules |
| ts-bridge | bridge 模板 + source 转换 | Volar |
| snippets | JSON 文件复制 + 空壳入口 | 92 个 snippet 扩展 |

---

## 七、当前状态

### 已实现（v1.5.8）

| 模块 | 位置 | 内容 |
|------|------|------|
| 5 种步骤生成器 | `converter/src/steps/` | language-client, source, bridge, snippets, mark-unsupported |
| 5 种 transform | `converter/src/transforms/` | import-mapping, class-to-factory, provider-register, enum-offset, strip-volar |
| 文本替换层 | `converter/src/convert.ts` | .fileName, .uri.fsPath, getWordRangeAtPosition, WorkspaceEdit polyfill 等 |
| 插件级 patches | registry `patches` 字段 | find/replace 文本替换，支持源码层和 server 编译后 |
| CLI | `converter/src/cli.ts` | `convert <input> -o <output> --convert <json>` |
| bridge preset 系统 | `converter/src/steps/bridge.ts` | BRIDGE_TEMPLATES + presets.json 驱动 |
| Pipeline | `plugin/src/pipeline.ts` | git clone, convert, npm install, esbuild, binary download, pip/go/cargo install, installToCoc |
| TUI | `plugin/src/tui.ts` | Mason 风格浮动窗口，9 个 tab，filter/sort/search，内联日志 |
| 11 个 CocCommand | `plugin/src/index.ts` | 10 用户命令 (open/install/uninstall/update/reinstall/uninstallAll/updateRegistry/cleanCache/list/whatChanged) + 1 内部 (dispatch) |
| 128 个 registry 条目 | coc-vscode-registry/registry.json | 29 pure-lsp + 1 ts-bridge + 6 direct-api + 92 snippets，覆盖 LSP、Formatter、Linter、Completion |
| Baseline 差异系统 | `converter/baseline.json` | SHA-256 输出文件指纹 + diff:check |

### 测试

| 测试类型 | 数量 | 说明 |
|----------|------|------|
| 单元测试 | **165** (15 files) | vitest，含 fixture 测试 |
| 完整测试 | `npm run test:full` | 单元测试 + diff:check |
| 烟雾测试 | `npm run test:smoke` | 全量转换 128 条目并验证输出结构 |
| 回归检测 | `npm run diff:check` | 输出文件 hash 对比，检测非预期变更 |

### Pending（待办）

- [ ] 更多 provider 签名适配（InlineValuesProvider 有接口但无注册函数）
- [ ] python-bridge / rust-bridge preset 示例
- [ ] keepDeps workspace root 查找（monorepo 场景第三步）
- [ ] keepDeps 解析失败时报错而非静默返回
- [ ] multiRoot 支持多 workspace folder
- [ ] CI 验证：自动 `npm view` 校验 server 包存在性
