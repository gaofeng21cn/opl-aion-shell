# CI 设置指南

## 概述

本仓库是 One Person Lab App 的当前 AionUI shell 实现载体。App 发布、
Nightly、Full first-install、远端 release verification 和 release asset
distribution 的 owner 已迁到 `gaofeng21cn/one-person-lab-app`。

本仓库只保留 shell 自身仍需要的 GitHub Actions：

- `pr-checks.yml`：PR 质量检查、测试、覆盖率、i18n 与 release 脚本 smoke。
- `pr-checks-docs.yml`：文档类 PR 的轻量检查。
- `_build-reusable.yml`：被手动 build / pack workflow 复用的 shell build 片段。
- `build-manual.yml`：维护者手动构建 shell 包。
- `pack-web-cli.yml`：打包 Web CLI 与安装脚本 smoke。
- `pr-e2e-artifacts.yml`：按需生成 PR E2E artifacts。
- `bump-homebrew.yml`：验证 Homebrew cask。
- `gpt-review.yml` / `gpt-pr-assessment.yml`：GPT 辅助 PR 审查。
- `project-automation.yml`：Issue / PR project automation。

## Release owner

不要在本仓恢复 App release/distribute workflow。发布相关入口应在
`gaofeng21cn/one-person-lab-app` 维护；shell 仓只提供实现源码、测试和可复用
pack/build 片段。

## 维护规则

- 定期更新 GitHub Actions major 版本，优先使用 Node 24 compatible action。
- 新增自动触发 workflow 前，先确认它属于 shell owner，而不是 App release owner。
- 需要 secret、AWS、签名证书或 release asset distribution 的流程应留在 App 仓。
