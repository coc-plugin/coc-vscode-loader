# converter — vscode → coc 转换器原型

将 VS Code 扩展转换为 coc.nvim 插件的 CLI 工具原型。

## 用法

```bash
# 转换一个 VS Code 扩展目录
converter convert ./vscode-ext/ -o ./coc-ext/

# 直接转换一个已知的 registry 插件
converter install volar
```

## 快速开始

```bash
# 转换 Volar
converter convert ~/code/volar/extensions/vscode -o ./coc-volar
cd ./coc-volar && npm install && npm run build
# 安装到 coc
ln -s $PWD ~/.config/coc/extensions/node_modules/coc-volar
```

## 架构

```
输入：VS Code 扩展目录
  │
  ├─ scanner        分析用了哪些 API，输出迁移报告
  ├─ transforms/    逐个 AST 变换
  │   ├─ import-mapping    from 'vscode' → from 'coc.nvim'
  │   ├─ language-client   LanguageClient 签名适配
  │   ├─ enum-offset       枚举值偏移
  │   ├─ uri-mapping       Uri → DocumentUri
  │   ├─ provider-register 注册函数重命名
  │   ├─ class-to-factory  new Xxx() → Xxx.create()
  │   └─ mark-unsupported  标记不可移植代码
  ├─ bridge/         桥接代码生成（TS 桥接型插件）
  └─ package         输出 coc 插件目录 + 报告
```

## 当前状态

原型阶段，优先验证核心转换链路。
