# coc-converter

VS Code extension → coc.nvim plugin converter & package manager。

通过 TUI 界面一键安装/更新/卸载转换后的插件。

## 安装

```bash
cd ~/.config/coc/extensions
npm install /path/to/coc-converter
# 或 :CocInstall /path/to/coc-converter
```

## TUI 快捷键

| 按键 | 动作 |
|------|------|
| `I` | Install 模式（按钮亮起） |
| `U` | 更新全部已安装插件（按钮亮起） |
| `C` | 检查远程更新（git ls-remote 对比 commit） |
| `Z` | 卸载全部已安装插件（需确认） |
| `H` | 回首页（清除所有状态） |
| `?` | 帮助 |
| `i` | 安装光标处插件 |
| `u` | 更新光标处插件 |
| `X` / `x` | 卸载光标处插件 |
| `<CR>` | 展开/折叠详情（commit / type / source 等）或安装日志 |
| `/` | 搜索过滤 |
| `q` / `<Esc>` | 关闭窗口（有变更时自动重启 coc） |

## 命令

| Command | 动作 |
|---------|------|
| `:CocCommand converter.open` | 打开 TUI |
| `:CocCommand converter.install <name>` | 安装指定包 |
| `:CocCommand converter.uninstall <name>` | 卸载指定包 |
| `:CocCommand converter.update <name>` | 更新指定包 |
| `:CocCommand converter.uninstallAll` | 卸载全部（需确认） |
| `:CocCommand converter.updateRegistry` | 从 GitHub 拉取最新注册表 |

## 特性

- **真实转换管道** — git clone → converter 转换 → npm install → esbuild 构建 → 注册到 coc
- **增量缓存** — source/ 保留 git 仓库，安装/更新时只 git pull，不重复 clone
- **Commit 追踪** — 安装后记录当前 commit SHA，展开详情可见
- **检查更新** — `C` 键对比远端 HEAD，有更新标 `↑`
- **自动重启** — 关 TUI 时如有变更自动 `:CocRestart`
- **注册表热更新** — `:CocCommand converter.updateRegistry` 从 GitHub 拉取远程 registry
- **安装日志** — 每一步的真实命令输出，可展开查看

## 架构

| 文件 | 说明 |
|------|------|
| `src/index.ts` | 插件入口 + 7 个 CocCommand |
| `src/tui.ts` | TUI 窗口管理 + 渲染 + 快捷键分发 |
| `src/state.ts` | 状态管理（debounced 渲染） |
| `src/registry.ts` | 内置注册表 + 远程热更新缓存 |
| `src/pipeline.ts` | 真实安装/更新/卸载流程（git + npx tsx + npm + node + cp） |
| `src/renderer.ts` | LineBuffer 渲染引擎（仿 lazy.nvim） |

## 构建

```bash
npm install
npm run build    # esbuild → lib/index.js
```
