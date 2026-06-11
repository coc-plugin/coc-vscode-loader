# vscode → coc 转换器 — 最终方案

## 核心思路

**一个 coc 插件作为包管理器。** 用户只装一次，之后跟 mason 一样操作：

```
:CocInstall coc-converter
:CocCommand converter.install volar     ← 下载 VS Code 插件 → 转换 → 安装
:CocCommand converter.list              ← 查看已安装
:CocCommand converter.update            ← 全部更新
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
               │   检测插件类型（纯LSP/桥接）│
               └────────┬────────────────┘
                        ▼
          ┌─────────────────────────────┐
          │     transforms/              │
          │   import → coc.nvim          │
          │   LanguageClient 适配        │
          │   Provider 注册重命名        │
          │   标记不可移植 API（注释保留）  │
          └────────┬────────────────────┘
                   ▼
          ┌─────────────────────────────┐
          │     bridge-generator         │
          │   根据 registry 配置生成      │
          │   桥接代码或链路注释          │
          └────────┬────────────────────┘
                   ▼
          ┌─────────────────────────────┐
          │     package-manager          │
          │   engines 转换               │
          │   + typescriptServerPlugins  │
          └────────┬────────────────────┘
                   ▼
          ┌─────────────────────────────┐
          │    输出：coc 插件目录 + 报告   │
          └─────────────────────────────┘
```

---

## 三、可配置桥接系统

每种插件的特殊桥接需求定义在 registry 中，转换器按配置生成代码：

```jsonc
// registry.json
{
  "volar": {
    "source": {
      "type": "github",
      "repo": "vuejs/language-tools",
      "subdir": "extensions/vscode"
    },
    "type": "ts-bridge",           // ← 插件类型
    "tsPluginName": "@vue/typescript-plugin",  // ← 需要注入 tsserver 的插件
    "tsPluginLanguages": ["vue"],              // ← 插件支持的文件类型
    "bridges": [
      {
        "notification": "tsserver/request",
        "description": "转发 Vue LSP 的 TS 请求到 tsserver",
        "handler": {
          "type": "command",
          "command": "typescript.tsserverRequest",
          "args": ["{{command}}", "{{args}}", "{isAsync: true, lowPriority: true}"],
          "responseNotification": "tsserver/response",
          "responseArgs": ["{{seq}}", "{{result.body}}"]
        }
      }
    ]
  },
  "eslint": {
    "source": {
      "type": "npm",
      "package": "vscode-eslint"
    },
    "type": "pure-lsp",            // ← 纯 LSP，无桥接
    "bridges": []
  },
  "some-python-plugin": {
    "source": "...",
    "type": "custom-bridge",       // ← 自定义桥接
    "bridges": [
      {
        "notification": "python/analysis",
        "description": "转发到 Python 分析服务",
        "handler": {
          "type": "tcp",           // ← TCP 转发
          "host": "127.0.0.1",
          "port": 8080
        }
      }
    ]
  }
}
```

### 桥接类型

| handler.type | 说明 | 适用场景 |
|-------------|------|---------|
| `command` | 调用 coc 命令转发 | TS 桥接、编辑器内部通信 |
| `tcp` | TCP socket 转发 | 外部语言服务 |
| `stdio` | 子进程 stdin/stdout 转发 | 本地工具链 |
| `http` | HTTP POST 请求转发 | 远程 API |

### TS 桥接的特殊处理

当 `type: "ts-bridge"` 时，转换器自动：

1. 在生成的 `package.json` 中添加 `typescriptServerPlugins` contribution
2. 在 coc-tsserver 中注入 `globalPlugins` + `pluginPaths`
3. 生成 `tsserver/request` → `typescript.tsserverRequest` 的桥接代码
4. 如果需要，在 registry 中记录 coc-tsserver 的补丁版本

---

## 四、注册表

```jsonc
{
  "version": 1,
  "plugins": {
    "volar": {
      "source": {
        "type": "github",
        "repo": "vuejs/language-tools",
        "subdir": "extensions/vscode"
      },
      "type": "ts-bridge",
      "tsPluginName": "@vue/typescript-plugin",
      "tsPluginLanguages": ["vue"],
      "transforms": ["import-mapping", "language-client", "mark-unsupported"],
      "patches": ["volar/client.patch"],
      "latestVersion": "3.3.4"
    },
    "eslint": {
      "source": { "type": "npm", "package": "vscode-eslint" },
      "type": "pure-lsp",
      "transforms": ["import-mapping", "provider-register"],
      "patches": [],
      "latestVersion": "3.1.2"
    },
    "angular": {
      "source": { "type": "github", "repo": "angular/vscode-ng-language-service" },
      "type": "ts-bridge",
      "tsPluginName": "@angular/language-service",
      "tsPluginLanguages": ["html"],
      "transforms": ["import-mapping", "language-client"],
      "patches": [],
      "latestVersion": "19.0.0"
    }
  }
}
```

注册表可以内置在 coc-converter 插件中，也可从 GitHub 热更新（`:CocCommand converter.update-registry`）。

---

## 五、安装流程

```
converter.install volar
  │
  ├─ 1. 查 registry，找到 volar 条目
  │
  ├─ 2. 下载源码
  │
  ├─ 3. 扫描 API -> 生成迁移报告
  │
  ├─ 4. 运行转换管道
  │     ├─ import-mapping    from 'vscode' → from 'coc.nvim'
  │     ├─ language-client   LanguageClient 参数适配
  │     ├─ provider-register 注册函数重命名
  │     ├─ mark-unsupported 标记 decoration/webview（注释保留）
  │     └─ bridge-generator  (如果有桥接) 生成桥接代码
  │
  ├─ 5. 生成 package.json
  │     ├─ engines, main, activationEvents
  │     ├─ contributes.configuration (保留)
  │     ├─ contributes.typescriptServerPlugins (TS 桥接型)
  │     └─ commands (保留)
  │
  ├─ 6. 应用补丁 (patches/)
  │
  ├─ 7. 构建 (npm install && npm run build)
  │
  └─ 8. 注册到 coc (链接到 extensions/node_modules/)
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

## 七、第一阶段实现计划

### v0.1 — 核心管道

| 模块 | 内容 |
|------|------|
| `scanner` | 扫描 API，检测插件类型 |
| `import-mapping` | 替换 import + 重命名 |
| `language-client` | LanguageClient 适配 |
| `mark-unsupported` | 标记不可移植 API（注释保留，不删除） |
| `package-manager` | 生成 package.json |
| `bridge-generator` | 根据 registry 生成桥接代码 |
| `cli` | `install`/`list`/`update`/`uninstall` 命令 |

### v0.2 — Registry

| 模块 | 内容 |
|------|------|
| 注册表格式定义 | json schema |
| 内置注册表 | 预置 Volar、ESLint、Angular |
| 热更新 | 从 GitHub 拉取最新注册表 |
| 补丁系统 | patches/ 目录，git-style patch |

### v0.3 — 验证

- 对 Volar 跑完整安装流程
- 对 ESLint 跑完整安装流程
- 对比功能完整性
- 输出迁移报告
