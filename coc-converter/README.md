# coc-converter

VS Code extension → coc.nvim plugin converter & package manager。

通过 TUI 界面一键安装/更新/卸载转换后的插件。

## 安装

```bash
cd ~/.config/coc/extensions
npm install /path/to/coc-converter
# 或 :CocInstall /path/to/coc-converter
```

## 用法

```
:CocCommand converter.open    # 打开 TUI
```

## TUI 快捷键

| 按键 | 动作 |
|------|------|
| `I` | 进入 Install 模式（按钮亮起） |
| `U` | 更新全部已安装插件（按钮亮起） |
| `H` | 回首页（清除所有状态） |
| `?` | 帮助 |
| `i` | 安装光标处插件 |
| `u` | 更新光标处插件 |
| `X` / `x` | 卸载光标处插件 |
| `<CR>` | 展开/折叠详情或安装日志 |
| `/` | 搜索过滤 |
| `q` / `<Esc>` | 关闭窗口 |

## 命令

| Command | 动作 |
|---------|------|
| `converter.open` | 打开 TUI |
| `converter.install <name>` | 安装指定包 |
| `converter.uninstall <name>` | 卸载指定包 |
| `converter.update <name>` | 更新指定包 |
| `converter.uninstallAll` | 卸载全部（需确认） |

## 架构

| 文件 | 说明 |
|------|------|
| `src/index.ts` | 插件入口 + 5 个 CocCommand |
| `src/tui.ts` | TUI 窗口管理 + 渲染 + 快捷键分发 |
| `src/state.ts` | 状态管理（debounced 渲染） |
| `src/registry.ts` | 内置注册表（7 个插件） |
| `src/pipeline.ts` | 安装/更新/卸载流程（模拟步骤） |
| `src/renderer.ts` | LineBuffer 渲染引擎（仿 lazy.nvim） |

## 构建

```bash
npm install
npm run build    # esbuild → lib/index.js
```
