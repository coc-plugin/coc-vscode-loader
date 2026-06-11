# vscode → coc 插件转换器 — 技术方案 (v1)

> ⚠️ 此版本已被 [converter-design-v2.md](./converter-design-v2.md) 替代。

## 一、整体架构

```
                    ┌──────────────────────┐
                    │   输入：VS Code 插件   │
                    │   (目录 / npm / git)  │
                    └────────┬─────────────┘
                             ▼
               ┌─────────────────────────┐
               │     scanner.ts           │
               │   · 遍历 .ts .tsx 文件    │
               │   · 提取 import/API 调用  │
               │   · 对照规则做差异报告     │
               └────────┬────────────────┘
                        ▼
          ┌─────────────────────────────┐
          │     transforms/              │
          │   · import-mapping.ts        │
          │   · language-client.ts       │
          │   · class-to-factory.ts      │
          │   · provider-register.ts     │
          │   · enum-offset.ts           │
          │   · workspace-edit.ts        │
          │   · strip-unsupported.ts     │
          └────────┬────────────────────┘
                   ▼
          ┌─────────────────────────────┐
          │    package-manager.ts        │
          │   · package.json 精简        │
          │   · activationEvents 映射    │
          │   · contributes 过滤         │
          └────────┬────────────────────┘
                   ▼
          ┌─────────────────────────────┐
          │    后处理器                   │
          │   · 插入 TODO 注释            │
          │   · 生成迁移报告              │
          │   · 应用社区补丁              │
          └────────┬────────────────────┘
                   ▼
          ┌─────────────────────────────┐
          │   输出：coc 插件目录 + 报告   │
          │   (可直接 :CocInstall 本地)  │
          └─────────────────────────────┘
```

---

## 二、核心模块设计

### 2.1 `scanner.ts` — 扫描器

输入一个 VS Code 插件的源码目录，输出一份 API 使用报告。

```typescript
interface ScanResult {
  files: ScannedFile[]            // 每个文件
  apis: {
    vscode: Set<string>           // 用到的 vscode API 列表
    unsupported: UnsupportedAPI[] // 不可移植的 API
    convertible: ConvertibleAPI[] // 可自动转换的 API
  }
  summary: {
    totalFiles: number
    autoConvertible: number       // 可自动转换的 API 数量
    needsManual: number           // 需人工介入的 API 数量
    impossible: number            // 无法移植的 API 数量
  }
}

interface UnsupportedAPI {
  api: string           // 如 'window.createWebviewPanel'
  file: string
  line: number
  reason: string        // 不可移植原因
  action: 'delete' | 'rewrite' | 'skip'
}
```

**检测规则来源：** 直接读取这个 repo 的 `vscode-api-feasibility.md`、`import-mapping.md`、`vscode-vs-coc-api-diff.md`，提取 API 的可实现性分类。

### 2.2 转换管道 (Pipeline)

每个 transform 是一个独立函数，接收 AST 再返回 AST：

```typescript
interface TransformContext {
  ast: SourceFile          // ts-morph 的 AST
  report: Report           // 转换报告
  options: TransformOptions
}

type Transform = (ctx: TransformContext) => void
```

按顺序执行：

| # | Transform | 做什么 | 规则来源 |
|---|-----------|--------|---------|
| 1 | `import-mapping` | `from 'vscode'` → `from 'coc.nvim'`，按 mapping 表重命名 | `import-mapping.md` |
| 2 | `class-to-factory` | `new Position()` → `Position.create()`，不支持 factory 的（如 Hover）→ 对象字面量 | `vscode-vs-coc-api-diff.md §2` |
| 3 | `enum-offset` | 枚举值加减 1（DiagnosticSeverity、CompletionItemKind 等）| `vscode-vs-coc-api-diff.md §2.18` |
| 4 | `uri-mapping` | `Uri.file()` → `Uri.file()` 保留；`uri.fsPath` → `uri.fsPath` 保留；`Uri.joinPath()` → 标记 TODO | `import-mapping.md` |
| 5 | `provider-register` | 注册函数重命名 + 插入额外参数 | `provider-signature-card.md` |
| 6 | `language-client` | `new LanguageClient(run, debug, ...)` → `new LanguageClient(serverOptions, ...)` | `volar-migration-guide.md` |
| 7 | `workspace-edit` | `new WorkspaceEdit()` + 链式调用 → LSP 纯对象 | `pattern-migration-examples.md §8` |
| 8 | `command-mapping` | `getExtension` → `getExtensionById` 等 | `mapping-quickref.md` |
| 9 | `strip-unsupported` | 检测不可移植 API，按 action 删除/标记 | `vscode-api-feasibility.md §3` |

### 2.3 `strip-unsupported.ts` — 不可移植代码处理

**检测模式库：**

```typescript
const UNSUPPORTED_PATTERNS = [
  {
    pattern: 'window.createWebviewPanel',
    action: 'delete',
    message: 'coc 无 Webview 能力，此功能已移除',
  },
  {
    pattern: 'window.createTextEditorDecorationType',
    action: 'delete',
    message: 'coc 用 nvim_buf_add_highlight 替代，需手动重写',
  },
  {
    pattern: 'window.setDecorations',
    action: 'delete',
    message: '同上',
  },
  {
    pattern: 'window.registerTreeDataProvider',
    action: 'delete',
    message: 'coc 无 registerTreeDataProvider，改用 createTreeView',
  },
  {
    pattern: 'window.showInputBox',
    action: 'replace',
    replacement: 'window.requestInput',
  },
  {
    pattern: 'vscode.extensions.getExtension',
    action: 'replace',
    replacement: 'extensions.getExtensionById',
  },
  {
    pattern: 'patchTypeScriptExtension',
    action: 'delete',
    message: 'coc 环境不需要此补丁',
  },
]
```

对标记为 `delete` 的调用，自动将整个表达式语句替换为 `// [converter] 已移除: ...` 注释。

### 2.4 `package-manager.ts` — package.json 处理

```typescript
function convertPackageJson(vscodePkg: PackageJson): PackageJson {
  return {
    ...vscodePkg,
    engines: { coc: '^0.0.82' },
    // 删掉 vscode 专有字段
    main: 'lib/index.js',
    activationEvents: convertActivationEvents(vscodePkg.activationEvents),
    contributes: {
      ...vscodePkg.contributes,
      // 保留 commands / configuration
      // 删掉 grammars / menus / views 等
    },
  }
}
```

**activationEvents 映射：** 对照 `manifest-activation-mapping.md` 删掉 vscode 独有的事件类型。

### 2.5 迁移报告

转换完成后输出一份 Markdown 报告：

```markdown
# 迁移报告：@vue/language-tools

🟢 自动转换: 3 个文件
  - src/extension.ts
  - src/config.ts
  - src/rangeFormatting.ts

🔴 已删除（不可移植）: 4 个文件
  - src/interpolationDecorators.ts  ← decoration API
  - src/reactivityVisualization.ts  ← decoration API
  - src/focusMode.ts                 ← decoration + folding
  - src/welcome.ts                   ← webview

🟡 需手动检查: 0 个文件

⚠️ 标记的 TODO:
  - extension.ts:25  Uri.joinPath() 在 coc 中不存在
  - extension.ts:48  originalPositionAt 无直接等价

生成目录: ./output/coc-volar/
测试命令: :CocInstall ~/output/coc-volar/
```

---

## 三、规则文件格式

规则从 Markdown 文档提取，也可以直接用 YAML 编写：

```yaml
# rules/import-mapping.yaml
mappings:
  - vscode: "EventEmitter<T>"
    coc: "Emitter<T>"
    note: "命名不同"
    auto: true

  - vscode: "Position"
    coc: "Position"
    note: "class vs interface, 工厂方法"
    auto: true
    transforms:
      "new Position(l, c)": "Position.create(l, c)"
      ".translate()": "TODO"  # 无等价

  - vscode: "Disposable.from()"
    coc: "Disposable.create()"
    auto: true
```

```yaml
# rules/provider-signatures.yaml
mappings:
  - vscode: "registerReferenceProvider"
    coc: "registerReferencesProvider"
    rename: true

  - vscode: "registerCompletionItemProvider(sel, p, ...t)"
    coc: "registerCompletionItemProvider(name, shortcut, sel, p, t?, priority?, allCommitChars?)"
    insert:
      - name: '"${pluginId}"'
      - shortcut: '"${shortcut}"'
```

```yaml
# rules/unsupported.yaml
apis:
  - name: "window.createWebviewPanel"
    action: delete
    reason: "coc 无 HTML 渲染引擎"

  - name: "window.createTextEditorDecorationType"
    action: delete
    reason: "coc 用 nvim_buf_add_highlight 替代"
```

---

## 四、CLI 接口设计

```bash
# 从本地目录转换
converter convert ./my-vscode-ext/ -o ./my-coc-ext/

# 从 GitHub 仓库转换（自动 clone）
converter convert vuejs/language-tools -o ./coc-volar/ --subdir extensions/vscode

# 只做扫描，不做转换
converter scan ./my-vscode-ext/

# 转换 + 自动编译
converter convert ./my-vscode-ext/ --build

# 应用补丁
converter patch ./my-coc-ext/ -p ./patches/volar/
```

```bash
# 初始化一个新转换项目
converter init my-converter
# 生成: my-converter/
#   ├── src/
#   ├── patches/
#   ├── converter.yaml
#   └── package.json
```

---

## 五、第一阶段实现计划

### v0.1 — 核心管道（2-3 天）

| 模块 | 产出 |
|------|------|
| `scanner.ts` | 能扫描一个 VS Code 插件目录，提取 API 使用情况 |
| `import-mapping.ts` | 替换 import 声明，映射命名 |
| `class-to-factory.ts` | 处理 new Position()/Range() → 工厂调用 + 不支持 factory 的转字面量 |
| `strip-unsupported.ts` | 检测 webview/decoration 等并删除 |
| `package-manager.ts` | 转换 package.json |
| `cli.ts` | `converter scan` + `converter convert` 基础命令 |

### v0.2 — 完善转换规则（+2 天）

- `language-client.ts` — LanguageClient 适配
- `provider-register.ts` — 注册函数映射
- `uri-mapping.ts` — URI 处理
- `enum-offset.ts` — 枚举值偏移
- `workspace-edit.ts` — WorkspaceEdit 转换

### v0.3 — Volar 专项验证（+1 天）

- 跑 Volar 转换，对比 `yaegassy/coc-volar` 的输出
- 修复差异
- 编写 Volar 补丁

---

## 六、技术栈

| 组件 | 选型 | 原因 |
|------|------|------|
| 语言 | TypeScript | 与 coc 插件同栈，AST 操作方便 |
| AST 操作 | `ts-morph` | 比 ts compiler API 更友好，支持代码生成 |
| CLI 框架 | `commander` 或 `clerc` | 轻量，参数解析 |
| 测试 | `vitest` | 快，与 vite 生态一致 |
| 规则格式 | YAML + JSON 双支持 | YAML 可读性好，JSON 可程序生成 |
| 包管理 | npm + pnpm | 与现有生态一致 |

---

## 七、与 coc 生态的关系

**转换器完全不依赖 coc 运行时。** 输出的是纯 TypeScript 源码，用户可以：

1. 手动 review 转换结果
2. `npm install && npm run build`
3. 本地 `:CocInstall /path/to/output`
4. 或发布到 npm

转换器只是一个 **代码生成工具**，类似 `react-native-web` 的角色——写一次代码，面向不同平台产出。
