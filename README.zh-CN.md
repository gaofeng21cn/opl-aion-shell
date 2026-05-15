# One Person Lab App

One Person Lab App 是 One Person Lab 系统面向终端用户的桌面产品仓。这个仓负责
App 定义、打包、发布资产、updater 元数据、图文教程、首启验证和页面状态测试。

OPL Framework 仍由
[`gaofeng21cn/one-person-lab`](https://github.com/gaofeng21cn/one-person-lab)
持有。App 只消费 Framework 提供的机器可读 surface，不持有 runtime truth、domain
truth、provider 实现或 domain artifact authority。

## 仓库结构

```text
one-person-lab-app/
  docs/                 App 产品、发布、测试和用户文档
  contracts/            App 层机器可读合同
  scripts/              App 层验证和发布包装脚本
  shells/
    aionui/             当前稳定 AionUI GUI shell adapter
```

`shells/aionui/` 是可跟随上游 AionUI 的 shell adapter，不是 App 仓顶层身份。后续
AionUI 2.0 或其他 GUI 基座可以先进入 `shells/<candidate>/`，验证通过后再切换
active shell contract。

## 常用命令

```bash
bun install --cwd shells/aionui --frozen-lockfile
bun run validate:active-shell
bun run i18n:types
bun run test
bun run build-mac
```

根目录命令会代理到 active shell。发布资产归一化和验证从 App 根目录暴露：

```bash
bun run prepare-release-assets -- build-artifacts release-assets
bun run validate-release -- release-assets
```

当前 active shell 由
[`contracts/app-shell-adapter.json`](contracts/app-shell-adapter.json) 声明。
当前状态见 [`docs/status.md`](docs/status.md)。
