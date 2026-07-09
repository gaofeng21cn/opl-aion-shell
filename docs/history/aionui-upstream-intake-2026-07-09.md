# AionUI Upstream Intake 2026-07-09

Owner: `opl-aion-shell`
Purpose: `upstream_intake_record`
State: `absorption_candidate`
Machine boundary: Human-readable intake record. Use GitHub release refs, upstream git refs, source files, App-owned contracts, and repo-native tests for merge or release decisions.

## Intake Scope

- Upstream remote: `https://github.com/iOfficeAI/AionUi.git`.
- Intake range: `v2.1.27...v2.1.31`.
- Canonical upstream release: `v2.1.31`, published `2026-07-08T13:08:39Z`, URL `https://github.com/iOfficeAI/AionUi/releases/tag/v2.1.31`.
- Fresh upstream refs observed in this lane:
  - `refs/heads/main` = `e49cd94935f4e461f002a1260a47c1b7b2ce81ca`.
  - `refs/tags/v2.1.31` = `e49cd94935f4e461f002a1260a47c1b7b2ce81ca`.
  - `refs/tags/v2.1.27` = `70fcbfd7729b7d2b86af37ae301aefc15df17e84`.
- GitHub release list showed `v2.1.31` as the latest release at intake time. `v2.1.29` has a tag but no standalone GitHub release; `v2.1.30` explicitly rolls up `v2.1.29` and `v2.1.30`.
- GitHub compare `v2.1.27...v2.1.31` reported `58` commits ahead, `0` behind. The largest changed prefix was `packages/desktop/src` with `233` files, plus installer resources, docs/PRDs, i18n payloads, bootstrap tests, assistant tests, and Web host files.
- Local OPL shell package version remains OPL-owned metadata and is not an upstream-currentness claim.

## Carry-Forward Judgment

Keep the 2026-05-25 intake rule: do not fast-forward or directly merge upstream into the OPL shell mainline as a release shortcut.

The v2.1.27 to v2.1.31 delta is a product and runtime surface bundle, not a small patch bump. It changes assistant navigation, Settings taxonomy, home slash commands, scheduled tasks, runtime lease behavior, feedback diagnostics, update/installer handling, i18n, and upstream governance docs. Several items are valuable implementation material, but none of them may silently redefine App-owned GUI product truth, Framework/runtime truth, release policy, model-selection policy, or retired Team/AGUI surfaces.

Absorb by topic lane only:

- `accept`: small correctness, accessibility, localization, and shell-local resilience fixes that do not change App authority.
- `redirect`: upstream product/runtime ideas that require an App or Framework owner decision before shell implementation.
- `reject/watch`: upstream governance, public docs, Team-default, or product defaults that do not belong to the OPL App mainline.

Implementation lanes remain pending absorption. The main session must update final evidence after it inspects their diffs, reruns the selected validation, and decides whether to absorb or reject each lane.

## Evaluation Table

| 上游能力更新 | 能力提升 | 与 OPL/App 现有内容潜在冲突 | 整合难度 | 吸收方式 | 接受/拒绝/redirect | 验证口径 |
| --- | --- | --- | --- | --- | --- | --- |
| Assistants 升为侧边栏一级入口，My / Official tabs，内置官方助手默认关闭，编辑器引擎来自 managed agent runtime catalog，assistant editor 增加 thought-level 默认值 | 降低助手列表噪声，提升自定义/CLI assistant 管理能力，并把推理强度设置前置到 assistant/home 流程 | OPL `/guid` 首页把 MAS/MAG/RCA 作为 App-owned purpose assistants；可见助手、默认锁定 skill、route receipt、Codex model-selection policy 由 App product profile 和 App contract 决定。上游 Official Assistants、thought-level、managed catalog 不能直接改写这些语义 | 高 | 先作为实现参考拆分；只有 App repo 更新 product profile / contract 后，shell 才消费。可复用列表分组、空态、badge、editor section 等实现片段 | redirect | App contract/profile readback；assistant route receipt 检查；shell assistant DOM/unit tests；App `validate:active-shell` 由 main session 追补 |
| Settings revamp：默认进入 Agents，Skills/Tools 分离，统一 page header，agent availability filter，image model inline link | 设置页信息结构更清楚，Agent/Skill/Tool 更容易定位 | 当前 App-owned 设置 taxonomy 是 `General / Access / Agents & Capabilities / Local Environment / Storage / Appearance / Advanced / About & Updates`；上游默认 tab 和拆分不能覆盖 App 设置分组、文案与可见性 | 中高 | 保留 UI 组件/交互作为候选；导航结构必须由 App product profile 决定；不把 upstream Settings 当 canonical | redirect | App product profile diff；Settings renderer tests；App active-shell validator；i18n key check 由实施 lane 补齐 |
| Home `/guid` slash command menu；conversation slash menu 暴露 session skills | 提升 CLI parity，减少用户从输入框到技能调用的跳转 | OPL built-in assistant sends 会锁定 domain skill profile；AionUI internal skills 不应进入 home skill menu；slash command 不能 mint App 未声明 action id 或 route id | 中 | 接受交互模式，但加 OPL whitelist/profile filter；命令来源必须映射到 App/skill authority，而不是 shell-local fallback | accept with OPL filter | `guid` slash command unit/DOM tests；send box skill whitelist tests；route receipt / action id 不越权检查 |
| Conversation sidebar 自动展开并滚动到 active conversation，project header sticky，batch panel sticky；窄宽 assistant pills | 改善长列表导航和移动/窄屏可用性 | 低冲突；需确认不会改变 OPL App ordinary route、project scope 含义或隐藏 AGUI/Team 面 | 低 | 选择性移植为 renderer polish | accept | DOM/responsive focused tests；手工截图或 Playwright 由实施 lane/main session 决定 |
| Scheduled task history 标题带执行日期、支持批量删除；team cron 锁编辑、team-context 导航、team chat capability 传递 | 历史管理和 team 场景安全性更好 | Team ordinary mode 在 OPL App 中不是默认产品面，Team-mode E2E tail 已退役；任务状态和 runtime authority 属于 Framework/App，不由上游 team cron 语义决定 | 中 | 非 Team 的 history/date/delete 可选择性吸收；Team product route 和默认可见性保持拒绝或 watch | redirect/reject Team default | Cron focused tests；Team hidden/redirect proof；App runtime task state readback 由 main session 追补 |
| Foreground conversation/team page active lease；runtime ensure 合并去重；ACP runtime option request 去重 | 减少前台任务被 idle cleanup、重复 warmup 和重复 runtime-option 请求 | OPL runtime readiness、lease、provider state 由 Framework/App contract 持有；上游 shell-local lease 不能成为 runtime truth 或 readiness proof | 高 | 只吸收去重/生命周期实现中不越权的部分；lease/readiness 语义 redirect 到 Framework/App owner surface | redirect | `opl app state` / runtime contract readback；ACP option dedupe tests；provider lifecycle evidence 由 main session 追补 |
| macOS update install readiness；Windows NSIS failure/self-lock hardening；auto-update diagnostics；dated frontend logs；backend startup dirs；corrupted DB rebuild confirmation | 提升安装/更新失败可诊断性和启动恢复可控性 | App release promotion、updater policy、public release docs 属于 App/root release authority；shell 可实现 failure reporting，但不能单独声明 release-ready | 中高 | 接受 shell-local resilience fixes；release gate 和 user-facing release claim redirect 到 App/root | accept/adapt | Installer smoke scripts；update unit tests；startup recovery tests；App release-boundary validation 由 main session 追补 |
| Feedback report 附带 core diagnostics，新增 route context / feedback diagnostics PRD | 支持问题报告带上更多上下文，降低复现成本 | diagnostics 可能包含本地路径、runtime refs、domain refs 或 owner evidence；暴露边界必须由 App/root policy 决定 | 中 | 作为候选吸收，但先加最小 redaction / route allowlist；不要把 diagnostics 变成 product truth | redirect | feedback submit tests；privacy/redaction review；App diagnostics exposure policy readback |
| OpenAI SDK `apiKey` 参数修正、throttle timer leak cleanup、image alt text、empty avatar、assistant badge tone | 修复真实 API key 轮换失效、资源泄漏和可访问性/视觉一致性问题 | API credential policy 仍由 OPL/App 配置边界决定；但 `api_key` -> `apiKey` 属于上游 bugfix，不改变产品 authority | 低 | 直接移植或确认当前 OPL 已等价修复 | accept | API client unit test；affected renderer tests；no credential/log leak review |
| es-ES / fa-IR 完整 locale，既有 locale gap 修补，i18n config 扩展 | 扩大语言覆盖并补齐设置、cron、update 等文案 | 大量翻译 payload 增加维护面；OPL-specific 文案仍需本仓 i18n key 和 App product wording，不可直接用 upstream 文案替代 App-owned copy | 中 | 接受 locale registry 和缺口修补；OPL 文案逐项校对 | accept/adapt | `bun run i18n:types`；`node scripts/check-i18n.js`；locale diff review |
| Upstream PR template、readme 多语种更新、WeChat QR、upstream Superpowers spec 删除、upstream governance docs | 改善上游社区治理和公开分发材料 | OPL shell 的 contributor/process、public docs 和 App release/user docs 不由 upstream governance 定义 | 低 | 不吸收为 OPL truth；只在明确需要时手动参考 | reject/watch | No implementation validation unless explicitly adopted |

## Absorption Packet Placeholders

Main session should fill these after lane inspection:

| Topic | Expected final evidence from main session | Current draft state |
| --- | --- | --- |
| Assistant / Settings / `/guid` product surfaces | Absorbed commit SHA or rejection note; App product profile / active-shell validation output; renderer focused test output | implementation lane pending absorption |
| Runtime lease / ACP runtime option handling | Absorbed commit SHA or redirect decision; Framework/App runtime readback; ACP focused test output | implementation lane pending absorption |
| Installer / updater / startup recovery | Absorbed commit SHA or rejection note; installer smoke or focused unit output; App release-boundary note if policy changed | implementation lane pending absorption |
| i18n and low-risk bugfixes | Absorbed commit SHA or rejection note; i18n type/check output; focused unit output | implementation lane pending absorption |
| This docs/contract lane | Commit SHA; Markdown path/title self-check; `git diff --check`; final absorption decision | candidate for main-session absorption |

## Evidence Commands Run For This Draft

```bash
gh release list -R iOfficeAI/AionUi --limit 10
gh release view v2.1.31 -R iOfficeAI/AionUi --json tagName,publishedAt,targetCommitish,name,body,url
gh release view v2.1.30 -R iOfficeAI/AionUi --json tagName,publishedAt,targetCommitish,name,body,url
gh release view v2.1.28 -R iOfficeAI/AionUi --json tagName,publishedAt,targetCommitish,name,body,url
gh release view v2.1.29 -R iOfficeAI/AionUi --json tagName,publishedAt,targetCommitish,name,body,url
git ls-remote https://github.com/iOfficeAI/AionUi.git refs/heads/main refs/tags/v2.1.27 refs/tags/v2.1.28 refs/tags/v2.1.29 refs/tags/v2.1.30 refs/tags/v2.1.31
gh api repos/iOfficeAI/AionUi/compare/v2.1.27...v2.1.31 --jq '{status:.status,ahead_by:.ahead_by,behind_by:.behind_by,total_commits:.total_commits}'
```

`gh release view v2.1.29` returned `release not found`; this is expected for the release surface because the tag exists and the v2.1.30 release note rolls it up.

## Stop Condition

This lane stops at `candidate_ready_for_absorption` after the docs diff is committed and the lane-level Markdown/diff checks pass. It does not assert that implementation worker lanes are complete or absorbed.
