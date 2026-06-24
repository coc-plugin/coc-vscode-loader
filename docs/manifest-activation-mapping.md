# package.json / activate Comparison: VS Code → coc.nvim

---

## 1. Entry Configuration

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

## 2. activationEvents Mapping

| VS Code | coc | Notes |
|---------|-----|------|
| `onLanguage:langId` | `onLanguage:langId` | Same |
| `onCommand:cmdId` | `onCommand:cmdId` | Same |
| `*` | `*` | Same (activates immediately on startup) |
| `onFileSystem:scheme` | `onFileSystem:scheme` | Same |
| `workspaceContains:filePattern` | `workspaceContains:filePattern` | Same |
| — | `onNotification:method` | coc only (listens for LSP notification) |
| `onStartupFinished` | — | vscode only (activates after editor initialization completes) |
| `onUri` | — | vscode only (handles custom URI protocol) |
| `onCustomEditor:viewType` | — | vscode only (custom editor) |
| `onWebviewPanel:viewType` | — | vscode only (webview panel) |
| `onRenderer:viewType` | — | vscode only (notebooks renderer) |
| `onTerminalProfile` | — | vscode only (terminal profile) |
| `onAuthenticationRequest:authId` | — | vscode only (authentication request) |

---

## 3. contributes Mapping

### 3.1 commands

```jsonc
// VS Code
"contributes": {
  "commands": [
    {
      "command": "myExt.hello",
      "title": "Say Hello",
      "category": "My Extension",       // ⚠️ coc does not support
      "icon": "$(star)",                  // ⚠️ coc does not support
      "enablement": "editorFocus"         // ⚠️ coc does not support
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
      "when": "editorTextFocus",          // ⚠️ coc does not support
      "mac": "cmd+e"                       // ⚠️ coc does not support
    }
  ]
}
// ⚠️ VS Code uses standard key strings (e.g. "ctrl+e")

// coc
"contributes": {
  "keybindings": [
    {
      "command": "myExt.hello",
      "key": "leader e"
    }
  ]
}
// ⚠️ coc uses vim-style key strings (e.g. "leader e", "<C-p>")
```

### 3.3 configuration

```jsonc
// VS Code
"contributes": {
  "configuration": {
    "title": "My Extension",
    "order": 0,                        // ⚠️ coc does not support
    "properties": {
      "myExt.enable": {
        "type": "boolean",
        "default": true,
        "description": "Enable",
        "markdownDescription": "**Enable** my extension",  // ⚠️ coc does not support
        "scope": "resource",            // ⚠️ coc does not support (resource/window/machine)
        "enum": ["a", "b"],             // ⚠️ coc does not support
        "markdownEnumDescriptions": [],  // ⚠️ coc does not support
        "deprecationMessage": "Use ..."  // ⚠️ coc does not support
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

// coc — coc does not normally support contributes.menus
// (coc uses vim key mappings and commands instead)
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

// coc does not support
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

// coc does not support
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

// coc does not support
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

// coc does not support (coc does not define language grammars)
```

### 3.9 problemMatchers / taskDefinitions

```jsonc
// VS Code
"contributes": {
  "problemMatchers": [{ ... }],
  "taskDefinitions": [{ ... }]
}

// coc does not support
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

// coc — same
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

// coc — support requires coc-tsserver
// ⚠️ PR #493 is not merged, requires manual installation of a fork:
//   cd ~/.config/coc/extensions && npm install ChuYanLon/coc-tsserver
"contributes": {
  "typescriptServerPlugins": [
    {
      "name": "@vue/typescript-plugin",
      "languages": ["vue"],
      "enableForWorkspaceTypeScriptVersions": true
    }
  ]
}
// coc-tsserver automatically loads these plugins on startup (globalPlugins + pluginPaths)
// PR (#493) adds globalPlugins support + typescript.tsserverRequest command to coc-tsserver
// Must keep using fork version until merged
```

### 3.12 authentication

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

// coc does not support
```

### 3.13 notebooks / notebookRenderers

```jsonc
// VS Code
"contributes": {
  "notebooks": [{ "type": "jupyter-notebook", ... }]
}

// coc does not support
```

### 3.14 walkthroughs

```jsonc
// VS Code
"contributes": {
  "walkthroughs": [{ "id": "myWalkthrough", ... }]
}

// coc does not support
```

---

## 4. ExtensionContext Properties Comparison

```typescript
// vscode ExtensionContext
interface ExtensionContext {
  subscriptions: Disposable[]
  extensionPath: string
  extensionUri: Uri
  extensionMode: ExtensionMode       // ⚠️ coc does not support
  storagePath: string | undefined
  globalStoragePath: string           // ⚠️ coc does not support
  logPath: string                     // ⚠️ coc does not support
  languageModelAccessInformation: LanguageModelAccessInformation  // ⚠️ coc does not support
  globalState: Memento
  workspaceState: Memento
  asAbsolutePath(relativePath: string): string
  secrets: SecretStorage              // ⚠️ coc does not support
}

// coc ExtensionContext
interface ExtensionContext {
  subscriptions: Disposable[]
  extensionPath: string
  extensionUri: Uri                 // string for coc
  storagePath: string | undefined
  globalState: Memento
  workspaceState: Memento
  asAbsolutePath(relativePath: string): string
}
```

**coc lacks:** `extensionMode`, `globalStoragePath`, `logPath`, `secrets`, `languageModelAccessInformation`.
