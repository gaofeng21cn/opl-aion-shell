# OPL Aion Shell 贡献指南

[English](CONTRIBUTING.md)

本仓实现 AionUI 载体。修改前阅读 [AGENTS.md](AGENTS.md) 与
[App/Shell 边界](docs/guides/opl-app-shell-boundary.md)。产品策略和发布
权威归 One Person Lab App；AionCore 只使用官方未修改的依赖。

每次变更保持目标连贯、便于审阅；拆分无关修复，在 PR 说明行为、真实调用方
和必要验证。源码测试、构建产物和公开发布分别只证明各自层面。

环境和验证入口见[开发指南](docs/contributing/development.md)。可选 prek
hooks 会执行格式化及文件修复，并非只读检查；提交前回读其产生的 diff。

评审和合并遵循当前仓库的维护流程。已退役的上游自动化说明不授予发布权限。

行为变化时更新对应文档，按照[文档生命周期](docs/README.md)删除失效步骤
并修复入链。
