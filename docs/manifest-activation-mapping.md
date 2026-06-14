# package.json / activate 对比：VS Code → coc.nvim

---

## 1. 入口配置

```jsonc
// VS Code package.json
{
  "main": "./out/extension.js",
  "activationEvents": [
    "onLanguage:typescript"
  ],
  "engines": {
    "vscode": "^1.90.0"
  },
  "contributes": {
    "configuration": {
      "title": "My Extension",
      "properties": {
        "myExt.enable": {
          "type": "boolean",
          "default": true,
          "description": "Enable my extension"
        }
      }
    }
  }
}

// coc.nvim package.json
{
  "main": "lib/index.js",
  "activationEvents": [
    "onLanguage:typescript"
  ],
  "engines": {
    "coc": "^0.0.82"
  },
  "contributes": {
    "configuration": {
      "type": "object",
      "properties": {
        "myExt.enable": {
          "type": "boolean",
          "default": true,
          "description": "Enable my extension"
        }
      }
    }
  }
}
```

---

## 2. activationEvents 映射

| VS Code | coc | 备注 |
|---------|-----|------|
| `onLanguage:langId` | `onLanguage:langId` | 相同 |
| `onCommand:cmdId` | `onCommand:cmdId` | 相同 |
| `*` | `*` | 相同（启动时立即激活） |
| `onFileSystem:scheme` | `onFileSystem:scheme` | 相同 |
| `workspaceContains:filePattern` | `workspaceContains:filePattern` | 相同 |
| — | `onNotification:method` | coc 独有（监听 LSP notification） |
| `onStartupFinished` | — | vscode 独有（编辑器完成初始化后激活） |
| `onUri` | — | vscode 独有（处理自定义 URI 协议） |
| `onCustomEditor:viewType` | — | vscode 独有（自定义编辑器） |
| `onWebviewPanel:viewType` | — | vscode 独有（webview 面板） |
| `onRenderer:viewType` | — | vscode 独有（notebooks 渲染器） |
| `onTerminalProfile` | — | vscode 独有（终端配置文件） |
| `onAuthenticationRequest:authId` | — | vscode 独有（认证请求） |

---

## 3. contributes 映射

### 3.1 commands

```jsonc
// VS Code
"contributes": {
  "commands": [
    {
      "command": "myExt.hello",
      "title": "Say Hello",
      "category": "My Extension",       // ⚠️ coc 无
      "icon": "$(star)",                  // ⚠️ coc 无
      "enablement": "editorFocus"         // ⚠️ coc 无
    }
  ]
}

// coc
"contributes": {
  "commands": [
    {
      "command": "myExt.hello",
      "title": "Say Hello"
    }
  ]
}
```

### 3.2 keybindings

```jsonc
// VS Code
"contributes": {
  "keybindings": [
    {
      "command": "myExt.hello",
      "key": "ctrl+e",
      "when": "editorTextFocus",          // ⚠️ coc 无
      "mac": "cmd+e"                       // ⚠️ coc 无
    }
  ]
}
// ⚠️ VS Code 使用标准 key 字符串（如 "ctrl+e"）

// coc
"contributes": {
  "keybindings": [
    {
      "command": "myExt.hello",
      "key": "leader e"
    }
  ]
}
// ⚠️ coc 使用 vim 格式的 key 字符串（如 "leader e"、"<C-p>"）
```

### 3.3 configuration

```jsonc
// VS Code
"contributes": {
  "configuration": {
    "title": "My Extension",
    "order": 0,                        // ⚠️ coc 无
    "properties": {
      "myExt.enable": {
        "type": "boolean",
        "default": true,
        "description": "Enable",
        "markdownDescription": "**Enable** my extension",  // ⚠️ coc 无
        "scope": "resource",            // ⚠️ coc 无（resource/window/machine）
        "enum": ["a", "b"],             // ⚠️ coc 无
        "markdownEnumDescriptions": [],  // ⚠️ coc 无
        "deprecationMessage": "Use ..."  // ⚠️ coc 无
      }
    }
  }
}

// coc
"contributes": {
  "configuration": {
    "type": "object",
    "properties": {
      "myExt.enable": {
        "type": "boolean",
        "default": true,
        "description": "Enable"
      }
    }
  }
}
```

### 3.4 menus

```jsonc
// VS Code
"contributes": {
  "menus": {
    "editor/context": [
      {
        "command": "myExt.hello",
        "when": "editorHasSelection",
        "group": "navigation"
      }
    ]
  }
}

// coc — coc 通常不支持 contributes.menus
// (coc 用 vim 的插键和命令方式替代)
```

### 3.5 configurationDefaults

```jsonc
// VS Code
"contributes": {
  "configurationDefaults": {
    "[typescript]": {
      "editor.tabSize": 2
    }
  }
}

// coc 无
```

### 3.6 icons / iconThemes / productIconThemes

```jsonc
// VS Code
"contributes": {
  "icons": {
    "my-icon": {
      "description": "My Icon",
      "default": {
        "fontPath": "myfont.woff",
        "fontCharacter": "\\E001"
      }
    }
  }
}

// coc 无
```

### 3.7 views / viewsContainers

```jsonc
// VS Code
"contributes": {
  "viewsContainers": {
    "activitybar": [
      { "id": "myContainer", "title": "My View", "icon": "icon.svg" }
    ]
  },
  "views": {
    "myContainer": [
      { "type": "tree", "id": "myTree", "name": "My Tree" }
    ]
  }
}

// coc 无
```

### 3.8 languages / grammars / semantictokenScopes

```jsonc
// VS Code
"contributes": {
  "languages": [{
    "id": "mylang",
    "extensions": [".mylang"],
    "configuration": "./language-configuration.json"
  }],
  "grammars": [{
    "language": "mylang",
    "scopeName": "source.mylang",
    "path": "./syntaxes/mylang.tmLanguage.json"
  }]
}

// coc 无（coc 不定义语言语法）
```

### 3.9 problemMatchers / taskDefinitions

```jsonc
// VS Code
"contributes": {
  "problemMatchers": [{ ... }],
  "taskDefinitions": [{ ... }]
}

// coc 无
```

### 3.10 snippets

```jsonc
// VS Code
"contributes": {
  "snippets": [
    {
      "language": "typescript",
      "path": "./snippets/typescript.json"
    }
  ]
}

// coc — 相同
```

### 3.11 types / typescriptServerPlugins

```jsonc
// VS Code
"contributes": {
  "types": "src/types.d.ts",
  "typescriptServerPlugins": [
    { "name": "typescript-plugin-css-modules" }
  ]
}

// coc — 支持（需要 coc-tsserver 含 PR #493，合并前使用我们的 fork）
// 安装: cd ~/.config/coc/extensions && npm install ChuYanLon/coc-tsserver
"contributes": {
  "typescriptServerPlugins": [
    {
      "name": "@vue/typescript-plugin",
      "languages": ["vue"],
      "enableForWorkspaceTypeScriptVersions": true
    }
  ]
}
// coc-tsserver 启动时自动加载这些插件（globalPlugins + pluginPaths）
```

### 3.12 authentication 认证

```jsonc
// VS Code
"contributes": {
  "authentication": [
    {
      "id": "github",
      "label": "GitHub"
    }
  ]
}

// coc 无
```

### 3.13 notebooks / notebookRenderers

```jsonc
// VS Code
"contributes": {
  "notebooks": [{ "type": "jupyter-notebook", ... }]
}

// coc 无
```

### 3.14 walkthroughs

```jsonc
// VS Code
"contributes": {
  "walkthroughs": [{ "id": "myWalkthrough", ... }]
}

// coc 无
```

---

## 4. ExtensionContext 属性对比

```typescript
// vscode ExtensionContext
interface ExtensionContext {
  subscriptions: Disposable[]
  extensionPath: string
  extensionUri: Uri
  extensionMode: ExtensionMode       // ⚠️ coc 无
  storagePath: string | undefined
  globalStoragePath: string           // ⚠️ coc 无
  logPath: string                     // ⚠️ coc 无
  languageModelAccessInformation: LanguageModelAccessInformation  // ⚠️ coc 无
  globalState: Memento
  workspaceState: Memento
  asAbsolutePath(relativePath: string): string
  secrets: SecretStorage              // ⚠️ coc 无
}

// coc ExtensionContext
interface ExtensionContext {
  subscriptions: Disposable[]
  extensionPath: string
  extensionUri: Uri                 // 对 coc 来说 string
  storagePath: string | undefined
  globalState: Memento
  workspaceState: Memento
  asAbsolutePath(relativePath: string): string
}
```

**coc 缺少：** `extensionMode`、`globalStoragePath`、`logPath`、`secrets`、`languageModelAccessInformation`。
