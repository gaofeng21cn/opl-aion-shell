# CI 设置指南

## 概述

本仓库是 One Person Lab App 的当前 AionUI shell 实现载体。App 发布、
Nightly、Full first-install、远端 release verification 和 release asset
distribution 的 owner 已迁到 `gaofeng21cn/one-person-lab-app`。

本仓库只保留 shell 自身仍需要的 GitHub Actions：

- `pr-checks.yml`：PR 源码质量、单元测试、格式和 i18n 检查。
- `qualification.yml`：维护者手动运行的覆盖率、桌面打包/安装 smoke 和 release 脚本验证。
- `pr-checks-docs.yml`：文档类 PR 的轻量检查。
- `_build-reusable.yml`：被手动 build / pack workflow 复用的 shell build 片段。
- `build-manual.yml`：维护者手动构建 shell 包。
- `bump-homebrew.yml`：验证 Homebrew cask。
- `aionui-upstream-currentness.yml`：维护者按需检查 AionUI 最新稳定版，
  再由产品 owner 评估行为变化与选择性吸收。

GPT PR 审查和 Project Automation 未形成实际使用，且前者与本地 Codex
审查重复，因此不再保留对应 workflow 和专用 composite actions。上游
currentness 也不再定时轮询，避免已知需人工判断的版本差异持续产生失败噪声。

## Dependabot 边界

GitHub 将本仓库识别为独立仓库，无法区分上游 AionUI 依赖与 OPL 自有覆盖层。
因此仓库级 Vulnerability Alerts 与 Automated Security Fixes 保持关闭，避免把
上游 Electron 主版本迁移自动转换为本仓的修复 PR。

- `.github/dependabot.yml` 只维护 `github-actions`，不新增 `bun` 或 `npm` 更新项。
- Electron、AionUI 和其他上游依赖风险通过 `aionui-upstream-currentness.yml`
  检查最新稳定版，再由 App owner 做行为影响评估与选择性吸收。
- 关闭 Dependabot 告警不代表继承的 CVE 无风险；最终分发风险仍由 App release
  qualification 负责。只有告警明确落在 OPL 自有 adapter、overlay、Web host、
  bridge 或 release hook 时，才在本仓建立聚焦修复 PR 与对应测试。

## Release owner

不要在本仓恢复 App release/distribute workflow。发布相关入口应在
`gaofeng21cn/one-person-lab-app` 维护；shell 仓只提供实现源码、测试和可复用
pack/build 片段。

## 维护规则

- 定期更新 GitHub Actions major 版本，优先使用 Node 24 compatible action。
- 新增自动触发 workflow 前，先确认它属于 shell owner，而不是 App release owner。
- 上游版本检查保持手动触发；发现新稳定版后先做行为影响评估，不自动合并。
- 需要 secret、AWS、签名证书或 release asset distribution 的流程应留在 App 仓。
