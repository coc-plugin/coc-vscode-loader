# vscode → coc 转换器 — 最终方案

## 核心思路

**一个 coc 插件作为包管理器。** 用户只装一次，之后跟 mason 一样操作：

```
:CocInstall coc-converter
:CocCommand converter.install volar     ← 下载 VS Code 插件 → 转换 → 安装
:CocCommand converter.open              ← TUI 管理界面
:CocCommand converter.uninstall volar   ← 卸载
```

---

## 一、Volar 验证结论

用 Volar（@vue/language-tools）做原型验证，得出的关键结论：

### 插件分类

| 类型 | 特点 | 代表 | 自动化程度 |
|------|------|------|-----------|
| 纯 LSP | 无外部依赖，LanguageClient 直连 | ESLint、JSON、HTML、YAML | **~95%** |
| TS 桥接型 | 需要与 TypeScript 语言服务器通信 | Volar、Angular | **~85%** + 桥接配置 |
| 其他语言桥接型 | 需要与其他语言服务器通信 | Python/Rust 分析工具 | 需用户自定义桥接 |

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

1. **修改 coc-tsserver**：添加 `globalPlugins` 支持 + 注册 `typescript.tsserverRequest` 命令
2. **插件 package.json**：声明 `typescriptServerPlugins` contribution
3. **转换器的 registry**：标记该插件为"TS 桥接型"，安装时自动执行上述两步

---

## 二、整体架构

```
                     ┌──────────────────────┐
                    │   输入：VS Code 插件   │
                    │   (目录 / npm / git)  │
                    └────────┬─────────────┘
                             ▼
               ┌─────────────────────────┐
               │     scanner              │
               │   遍历 .ts 文件          │
               │   提取 API 调用           │
               │   检测插件类型（桥接/纯LSP/直接API）│
               └────────┬────────────────┘
                        ▼
          ┌──────────────────────────────────┐
          │     transforms/ (AST 变换)        │
          │   ├ import-mapping               │
          │   ├ class-to-factory             │
          │   ├ provider-register            │
          │   ├ language-client              │
          │   ├ enum-offset                  │
          │   └ mark-unsupported (文本替换)   │
          └────────┬─────────────────────────┘
                   ▼
          ┌──────────────────────────────────┐
          │     convert.ts (主流程)            │
          │   ├ 生成入口 index.ts（桥接模板）   │
          │   ├ 生成 package.json + esbuild    │
          │   ├ 桥接代码由 presets.ts 驱动     │
          │   └ 输出转换报告                   │
          └────────┬─────────────────────────┘
                   ▼
          ┌─────────────────────────────┐
          │    输出：coc 插件目录 + 报告   │
          └─────────────────────────────┘
```

---

## 三、桥接预设系统

桥接逻辑通过 preset 驱动，定义在 `presets.ts` 中。`convert.ts` 不关心桥接细节，只调用 `getActivePresets()` + `generateBridgeCode()`。

### BridgePreset 接口

```typescript
interface BridgePreset {
  name: string
  notification: string
  responseNotification?: string
  code: string                    // 生成的桥接代码模板
  requiresCommand?: string
  extraDeps?: string[]
}
```

### 当前内置 preset

```typescript
// presets.ts — 只有一个 ts-bridge preset
'ts-bridge': {
  name: 'ts-bridge',
  notification: 'tsserver/request',
  responseNotification: 'tsserver/response',
  requiresCommand: 'typescript.tsserverRequest',
  extraDeps: ['typescript'],
  code: `client.onNotification('tsserver/request', async ([seq, command, args]) => {
    const result = await commands.executeCommand('typescript.tsserverRequest', ...)
    client.sendNotification('tsserver/response', [seq, result?.body])
  })`,
}
```

### 桥接检测

scanner 从源码检测 `tsserver/request`、`_vue:`、`typescript.tsserverRequest` 等关键词，匹配到 `ts-bridge` preset。

### 添加新桥接

只需在 `presets.ts` 加新 preset + `scanner.ts` 加检测模式，不需要改 `convert.ts`。

---

## 四、注册表（coc-converter）

内置在 `coc-converter/src/registry.ts` 中，定义为一个 `PackageInfo[]` 数组：

```typescript
interface PackageInfo {
  name: string
  displayName: string
  description: string
  type: 'ts-bridge' | 'pure-lsp' | 'direct-api'
  source: { type: 'github' | 'npm'; repo?: string; package?: string; subdir?: string }
  url: string
  languages: string[]
  categories: string[]
}
```

当前 3 个内置包：Volar、Prisma、HTML CSS Support。

> 均已对接验证：Volar（ts-bridge）、Prisma（pure-lsp）、HTML CSS Support（direct-api）。

扫描和转换逻辑内置在 `converter/` 中，不依赖 registry 配置（自动检测 server 模块、自动分类）。

---

## 五、转换流程

```
convert <input-vscode-ext> -o <output-dir>
  │
  ├─ 1. 扫描 API → 检测插件类型（ts-bridge / pure-lsp / direct-api）
  │
  ├─ 2. 复制 .ts 源文件到输出目录
  │
  ├─ 3. 运行 AST 变换（ts-morph）
  │     ├─ import-mapping        from 'vscode' → from 'coc.nvim'
  │     ├─ class-to-factory      new Xxx() → Xxx.create()
  │     ├─ provider-register     注册函数重命名 + 补齐签名
  │     ├─ language-client       LanguageClient {run,debug} → {module,transport}
  │     └─ enum-offset           注释提醒枚举值差异
  │
  ├─ 4. 不可移植 API 替换（文本替换）
  │     ├─ getWordRangeAtPosition → 内联词边界计算
  │     ├─ .fileName → .uri
  │     └─ decoration/webview/createWebviewPanel 标记 TODO 注释
  │
  ├─ 5. 生成入口文件
  │     ├─ direct-api → 保留原 extension.ts
  │     ├─ 纯 LSP → 生成 LanguageClient 入口（自动检测 server 模块）
  │     └─ ts-bridge → 同上 + tsserver/request 桥接代码（来自 preset）
  │
  ├─ 6. 生成 package.json + esbuild.mjs
  │     ├─ dependencies（仅 LSP 相关）
  │     ├─ activationEvents
  │     ├─ typescriptServerPlugins（ts-bridge 型）
  │     └─ esbuild external 自动注入
  │
  └─ 7. 输出转换报告 + 使用说明（cd output && npm install && npm run build）
```

---

## 六、验证过的边界

用 Volar 原型验证确认以下方案可行：

| 模块 | 状态 | 备注 |
|------|------|------|
| `LanguageClient` 启动 | ✅ | coc 签名与 VS Code 基本一致 |
| `tsserver/request` 桥接 | ✅ | 通过 `typescript.tsserverRequest` 命令 |
| `globalPlugins` 注入 | ✅ | coc-tsserver 在 configure 时发送 |
| `typescriptServerPlugins` | ✅ | 通过 package.json contribution 声明 |
| `pluginPaths` 配置 | ✅ | 告诉 tsserver 在哪里找 Vue 插件 |
| decoration / webview | ✅ | 标记不可移植代码（注释保留） |
| `package.json` 精简 | ✅ | grammars/menus 等删掉 |

---

## 七、当前状态

### 已实现

| 模块 | 位置 | 内容 |
|------|------|------|
| `scanner` | `converter/src/scanner.ts` | 扫描 API，检测插件类型，检测 ts-bridge |
| 5 个 AST transform | `converter/src/transforms/` | import-mapping, class-to-factory, provider-register, language-client, enum-offset |
| 不可移植 API 替换 | `converter/src/convert.ts` | getWordRangeAtPosition polyfill, fileName→uri, 标记 TODO |
| 入口模板生成 | `converter/src/convert.ts` | 三种类型分别生成不同模板 |
| package.json 生成 | `converter/src/convert.ts` | 自动检测 server 依赖、typescriptServerPlugins |
| esbuild 配置生成 | `converter/src/convert.ts` | external 自动注入 |
| 桥接 preset 系统 | `converter/src/presets.ts` | ts-bridge preset |
| CLI | `converter/src/cli.ts` | `convert <input> -o <output>` |
| coc-converter TUI | `coc-converter/` | TUI 管理界面，3 个内置包 |
| 验证案例 | 3 个 | Volar、Prisma、HTML CSS Support |

### Pending

- [ ] `--bridge` CLI 选项实现（强制 bridge 模式）
- [ ] 添加更多插件到注册表
- [ ] 更多 provider 签名适配
- [ ] python-bridge / rust-bridge preset 示例
