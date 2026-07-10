# AionUI Upstream Intake 2026-07-09

Owner: `opl-aion-shell`
Purpose: `upstream_intake_record`
State: `absorbed_record`
Machine boundary: Human-readable intake record. Use GitHub release refs, upstream git refs, source files, App-owned contracts, and repo-native tests for merge or release decisions.

## Intake Scope

- Upstream remote: `https://github.com/iOfficeAI/AionUi.git`.
- Intake range: `v2.1.27...v2.1.31`.
- Canonical upstream release: `v2.1.31`, published `2026-07-08T13:08:39Z`, URL `https://github.com/iOfficeAI/AionUi/releases/tag/v2.1.31`.
- Fresh `2026-07-10` readback still reports `v2.1.31` as the latest stable release at `e49cd94935f4e461f002a1260a47c1b7b2ce81ca`. Upstream `main` has since advanced by one unreleased send-draft commit; it is not part of this stable intake.
- Fresh upstream refs observed in this lane:
  - `refs/heads/main` = `1619d36af20e3c8df2df595a86eb36a315f0887a`.
  - `refs/tags/v2.1.31` = `e49cd94935f4e461f002a1260a47c1b7b2ce81ca`.
  - `refs/tags/v2.1.27` = `70fcbfd7729b7d2b86af37ae301aefc15df17e84`.
- The only observed commit after the stable tag is `1619d36af feat(conversation): rework message queue into a send draft box (#3547)`. It remains a future intake candidate until an upstream release and a separate behavior review admit it.
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

Main-session absorption completed for the accepted implementation lanes on `opl-aion-shell` `main`. This intake did not fast-forward or directly merge upstream. It cherry-picked only scoped adaptation commits, kept the OPL App ordinary surface in charge, and left release/installer readiness outside this closeout.

## Evaluation Table

| 上游能力更新                                                                                                                                                                    | 能力提升                                                                                        | 与 OPL/App 现有内容潜在冲突                                                                                                                                                                                                                                        | 整合难度 | 吸收方式                                                                                                                                   | 接受/拒绝/redirect                   | 验证口径                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Assistants 升为侧边栏一级入口，My / Official tabs，内置官方助手默认关闭，编辑器引擎来自 managed agent runtime catalog，assistant editor 增加 thought-level 默认值               | 降低助手列表噪声，提升自定义/CLI assistant 管理能力，并把推理强度设置前置到 assistant/home 流程 | OPL `/guid` 首页把 MAS/MAG/RCA 作为 App-owned purpose assistants；可见助手、默认锁定 skill、route receipt、Codex model-selection policy 由 App product profile 和 App contract 决定。上游 Official Assistants、thought-level、managed catalog 不能直接改写这些语义 | 高       | 先作为实现参考拆分；只有 App repo 更新 product profile / contract 后，shell 才消费。可复用列表分组、空态、badge、editor section 等实现片段 | redirect                             | App contract/profile readback；assistant route receipt 检查；shell assistant DOM/unit tests；App `validate:active-shell` 由 main session 追补 |
| Settings revamp：默认进入 Agents，Skills/Tools 分离，统一 page header，agent availability filter，image model inline link                                                       | 设置页信息结构更清楚，Agent/Skill/Tool 更容易定位                                               | 当前 App-owned 设置 taxonomy 是 `General / Access / Agents & Capabilities / Local Environment / Storage / Appearance / Advanced / About & Updates`；上游默认 tab 和拆分不能覆盖 App 设置分组、文案与可见性                                                         | 中高     | 保留 UI 组件/交互作为候选；导航结构必须由 App product profile 决定；不把 upstream Settings 当 canonical                                    | redirect                             | App product profile diff；Settings renderer tests；App active-shell validator；i18n key check 由实施 lane 补齐                                |
| Home `/guid` slash command menu；conversation slash menu 暴露 session skills                                                                                                    | 提升 CLI parity，减少用户从输入框到技能调用的跳转                                               | OPL built-in assistant sends 会锁定 domain skill profile；AionUI internal skills 不应进入 home skill menu；slash command 不能 mint App 未声明 action id 或 route id                                                                                                | 中       | 接受交互模式，但加 OPL whitelist/profile filter；命令来源必须映射到 App/skill authority，而不是 shell-local fallback                       | accept with OPL filter               | `guid` slash command unit/DOM tests；send box skill whitelist tests；route receipt / action id 不越权检查                                     |
| Conversation sidebar 自动展开并滚动到 active conversation，project header sticky，batch panel sticky；窄宽 assistant pills                                                      | 改善长列表导航和移动/窄屏可用性                                                                 | 低冲突；需确认不会改变 OPL App ordinary route、project scope 含义或隐藏 AGUI/Team 面                                                                                                                                                                               | 低       | 选择性移植为 renderer polish                                                                                                               | accept                               | DOM/responsive focused tests；手工截图或 Playwright 由实施 lane/main session 决定                                                             |
| Scheduled task history 标题带执行日期、支持批量删除；team cron 锁编辑、team-context 导航、team chat capability 传递                                                             | 历史管理和 team 场景安全性更好                                                                  | Team ordinary mode 在 OPL App 中不是默认产品面，Team-mode E2E tail 已退役；任务状态和 runtime authority 属于 Framework/App，不由上游 team cron 语义决定                                                                                                            | 中       | 非 Team 的 history/date/delete 可选择性吸收；Team product route 和默认可见性保持拒绝或 watch                                               | redirect/reject Team default         | Cron focused tests；Team hidden/redirect proof；App runtime task state readback 由 main session 追补                                          |
| Foreground conversation/team page active lease；runtime ensure 合并去重；ACP runtime option request 去重                                                                        | 减少前台任务被 idle cleanup、重复 warmup 和重复 runtime-option 请求                             | OPL runtime readiness、lease、provider state 由 Framework/App contract 持有；上游 shell-local lease 不能成为 runtime truth 或 readiness proof                                                                                                                      | 高       | 只吸收去重/生命周期实现中不越权的部分；lease/readiness 语义 redirect 到 Framework/App owner surface                                        | redirect                             | `opl app state` / runtime contract readback；ACP option dedupe tests；provider lifecycle evidence 由 main session 追补                        |
| macOS update install readiness；Windows NSIS failure/self-lock hardening；auto-update diagnostics；dated frontend logs；backend startup dirs；corrupted DB rebuild confirmation | 提升安装/更新失败可诊断性和启动恢复可控性                                                       | App release promotion、updater policy、public release docs 属于 App/root release authority；shell 可实现 failure reporting，但不能单独声明 release-ready                                                                                                           | 中高     | 接受 shell-local resilience fixes；release gate 和 user-facing release claim redirect 到 App/root                                          | accept/adapt                         | Installer smoke scripts；update unit tests；startup recovery tests；App release-boundary validation 由 main session 追补                      |
| Feedback report 附带 core diagnostics，新增 route context / feedback diagnostics PRD                                                                                            | 支持问题报告带上更多上下文，降低复现成本                                                        | diagnostics 可能包含本地路径、runtime refs、domain refs 或 owner evidence；暴露边界必须由 App/root policy 决定                                                                                                                                                     | 中       | 作为候选吸收，但先加最小 redaction / route allowlist；不要把 diagnostics 变成 product truth                                                | redirect                             | feedback submit tests；privacy/redaction review；App diagnostics exposure policy readback                                                     |
| OpenAI SDK `apiKey` 参数修正、throttle timer leak cleanup、image alt text、empty avatar、assistant badge tone                                                                   | 修复真实 API key 轮换失效、资源泄漏和可访问性/视觉一致性问题                                    | API credential policy 仍由 OPL/App 配置边界决定；但 `api_key` -> `apiKey` 属于上游 bugfix，不改变产品 authority                                                                                                                                                    | 低       | 直接移植或确认当前 OPL 已等价修复                                                                                                          | accept                               | API client unit test；affected renderer tests；no credential/log leak review                                                                  |
| es-ES / fa-IR 完整 locale，既有 locale gap 修补，i18n config 扩展                                                                                                               | 上游扩大语言覆盖并补齐设置、cron、update 等文案                                                 | OPL 当前用户面只维护中文和英文；新增非中英 locale 会扩大翻译维护面，并让 OPL-specific 文案长期漂移                                                                                                                                                                 | 中       | 不吸收新增 `es-ES` / `fa-IR` locale；只吸收中英 key 修补、硬编码文案 i18n 化、语言列表由现有中英配置生成                                   | reject non-zh/en; accept zh/en fixes | `bun run i18n:types`；`node scripts/check-i18n.js`；确认 supported languages 仍为 `zh-CN` / `en-US`                                           |
| Upstream PR template、readme 多语种更新、WeChat QR、upstream Superpowers spec 删除、upstream governance docs                                                                    | 改善上游社区治理和公开分发材料                                                                  | OPL shell 的 contributor/process、public docs 和 App release/user docs 不由 upstream governance 定义                                                                                                                                                               | 低       | 不吸收为 OPL truth；只在明确需要时手动参考                                                                                                 | reject/watch                         | No implementation validation unless explicitly adopted                                                                                        |

## Absorption Result

Main-session accepted only scoped capability adaptations:

| Topic                                       | Main commit                                                     | Decision                 | Evidence                                                                                                                                                                                       |
| ------------------------------------------- | --------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Low-risk stability and diagnostics          | `7c02fd4e5`                                                     | accepted                 | OpenAI SDK `apiKey`, throttle cleanup, markdown alt text, dated logs, feedback/log diagnostics, startup directory prep, corrupt DB recovery classification, web-host backend directory prep    |
| Runtime / cron / ACP request dedupe         | `f24d3fa5b`                                                     | accepted/adapted         | ACP config/model option request dedupe, cron run title formatting, scheduled task history batch delete/refetch; no Team default or runtime-truth expansion                                     |
| `/guid` slash commands and assistant polish | `ea4b5a107`                                                     | accepted with OPL filter | `/guid` slash menu uses OPL-allowed skills and builtin `/open`; no Official Assistants, Team default, or shell-local purpose authority                                                         |
| Settings / i18n refinements                 | `bb35cff74`                                                     | accepted/adapted         | Settings tab navigate context, image-model config link, WeCom callback i18n, known i18n key fixes, language UI generated from existing Chinese/English config only                             |
| Contract, Cron, VM, and startup remediation | `2ac1bc4c2`, `637bfa844`, `0b9c8b122`, `827496799`, `84a4c8153` | accepted/adapted         | Capability projection type safety, retryable partial Cron deletion, fail-closed backend startup directories, and failure-evidence collectors that preserve the primary VM smoke error          |
| Feedback privacy and queue confirmation     | `5f786a6db`, `9059e9923`                                        | accepted/adapted         | Diagnostics remain off by default, explicit opt-in is required, selected logs are redacted, and the UI claims only that feedback entered the sending queue                                     |
| AionCore build and recovery                 | `5d554c0ae`, `a5811dd39`, `598997cf3`, `81c8b37fd`              | accepted/adapted         | AionCore is pinned to `v0.1.44`, database recovery is required at build and startup, and cold managed-resource preparation retries as a bounded fail-closed operation                          |
| Managed-agent and strict DTO compatibility  | `c633257d6`, `0c1cc4ce8`, `6875ada9f`                           | accepted/adapted         | Business assistants use `/api/assistants`; diagnostics use `/api/agents/management`; Assistant identity is preserved across Conversation, Channel, Cron, Team, migration, and Team WS adapters |
| Upstream non-zh/en locale payload           | none                                                            | rejected for this intake | `es-ES` and `fa-IR` were not absorbed because the OPL user surface currently supports Chinese and English only                                                                                 |
| Docs/boundary record                        | `3ea74dc47` plus this follow-up update                          | accepted                 | Intake record and shell boundary updated; docs are evidence notes, not App-ready or release-ready proof                                                                                        |

This closeout does not claim latest upstream parity, installer readiness, release readiness, installed App readiness, production runtime readiness, or owner acceptance. Those require separate owner evidence.

## Feedback Privacy Follow-Up 2026-07-10

The scoped privacy follow-up keeps broader upstream route/core diagnostics redirected, while closing the accepted feedback transport risks in the OPL shell:

- Sentry DSN presence no longer schedules automatic startup log uploads.
- Feedback diagnostic logs are off by default and are collected only after an explicit checkbox opt-in.
- Selected logs are redacted before compression for home paths, bearer/API credentials, token/secret values, `sk-*` keys, sensitive URL query parameters, URI userinfo, Cookie/Set-Cookie values, `DATABASE_URL`, AWS secret access keys, and private-key blocks.
- Feedback checks the main-process DSN boundary and reports only that an event was added to the sending queue after the renderer and main queues both flush successfully. It does not claim a server response, submission, delivery, or receipt.
- A missing event id, either queue flush returning `false`, or either queue flush throwing keeps the modal open and shows the queue failure state.
- The user-facing privacy and failure copy remains limited to the existing `zh-CN` and `en-US` locale surface.

This follow-up does not absorb broader core diagnostics, route context, settings navigation, App contracts, or release/readiness authority.

## VM Failure Evidence Follow-Up 2026-07-10

The release smoke keeps its original failure as the authoritative error even when diagnostic collection is degraded:

- Log-directory `readdir`, entry `lstat`, file read, and artifact write failures are isolated and recorded as typed collection errors; later siblings continue collecting.
- Launch diagnostics, bootstrap logs, app logs, four file listings, diagnostic reports, the failure screenshot, and unified logs are isolated in sequence so one collector cannot suppress later evidence.
- `collection-summary.json` is an evidence artifact only. It is not a runtime state, release verdict, or second consumer contract.
- Commits `827496799` and `84a4c8153` preserve the original smoke error object after all collection attempts and cover the production collector chain with focused tests.

## AionCore Managed Resource Follow-Up 2026-07-10

The AionCore compatibility lane remains an OPL shell adapter change; it does not modify the upstream AionCore source:

- Packaging and restored-cache paths both require AionCore `v0.1.44` and `--recover-corrupted-database` before a bundle is accepted.
- AionCore `v0.1.44` creates a fresh per-tool npm cache below each ACP staging directory and removes that staging directory after the attempt. A cold npm fetch can therefore finish without the required optional platform package, after which AionCore correctly rejects the incomplete artifact.
- Commit `a5811dd39` retries the whole `prepare-managed-resources` command up to three times. Each retry gets a clean bundle output while retaining `.prepare-data`, so the managed Node runtime is reused. Persistent failure removes both the partial bundle and `.prepare-data` and returns the last cause.
- Commit `598997cf3` applies the stable `>=0.1.44` recovery gate to both release and Actions artifacts, rejects prerelease versions to match the runtime gate, keeps the real binary version in `manifest.version`, and retains the Actions run ID only as source provenance. Web smoke reads `compatibility.reportedVersion` through a JSON parser.
- AionCore `v0.1.44` reports corruption found while opening SQLite as `BOOTSTRAP_DATA_INIT_FAILED stage=database.open`; it reserves `database.recoverable_corruption` for corruption found during migrations. Commit `81c8b37fd` accepts the open-stage boundary only when the captured AionCore error contains one of its strict corruption markers, so lock contention and unrelated open failures remain generic startup failures.
- Operators can override the bounded retry count and delay with `AIONUI_AIONCORE_MANAGED_RESOURCE_ATTEMPTS` and `AIONUI_AIONCORE_MANAGED_RESOURCE_RETRY_DELAY_MS`.

A real cold-cache run reproduced two different incomplete optional-package outcomes: attempt 1 missed the Claude platform binary, attempt 2 missed the Codex platform binary, and attempt 3 produced both managed ACP tools successfully. Artifact readback reported AionCore `0.1.44`, SHA-256 `1b14a6199f8bd296d1761ddc52d23c401818dd92e8653802dcce9d276bfb8469`, the required recovery option, and `missing: []` from `verifyBundledAioncoreResources`.

A real corrupted-database probe then confirmed both runtime boundaries. Without authorization, AionCore exited with `BOOTSTRAP_DATA_INIT_FAILED stage=database.open` and `file is not a database`. With `--recover-corrupted-database`, it preserved the original bytes in `aionui-backend.db.backup.<timestamp>`, created a new database with the `SQLite format 3` header, emitted `BOOTSTRAP_RECOVERED_DATABASE_CORRUPTION stage=database.recovery`, and reached its listening state.

This evidence closes the shell build-preparation defect. App packaging, installation, launch, and release authority still require the App-side validation and installed-artifact evidence recorded outside this shell intake document.

## Managed-Agent API Follow-Up 2026-07-10

The first v2.1.31 selective absorption kept legacy agent-list consumers after the shell had already moved to AionCore `v0.1.44`. A live installed-App baseline exposed the mismatch: `/guid` requested exact `GET /api/agents` and received `404`, while `GET /api/assistants` returned `200`. The intake matrix and AionCore version/recovery gates passed because they did not inspect the agent API callers.

AionCore `v0.1.44` owns three distinct surfaces that must remain separate:

- user-selectable business assistants come from `GET /api/assistants`;
- Agent Settings, health/diagnostic state, modes, models, and commands come from `GET /api/agents/management`;
- an individual managed-agent health check uses `POST /api/agents/{id}/health-check`.

The shell adapter now follows that split. `/guid`, channel configuration, Cron, Team helpers, MCP import, assistant editing, and conversation creation use generated assistants for business choices and managed rows only for runtime metadata. Generated assistants link to managed metadata through their declared `agent_id`; the shell does not cast a `ManagedAgent` into an assistant candidate. The legacy `useAgents`, `useDetectedAgents`, readiness/setup card, preset-management, refresh route, and non-id health route are retired.

The runtime catalog also preserves the difference between missing model metadata and an explicitly empty model list. Missing metadata may use the App-owned Codex defaults before the first handshake; an explicit empty list must remain empty and must not silently invent model availability.

The App repo now owns a source gate for this API split. Shell unit/DOM tests cover the bridge routes, managed catalog fetch/cache, Guid candidate/runtime association, Agent Settings health checks, model/mode/command metadata, conversation creation, and explicit-empty model behavior. The locale boundary remains `zh-CN` and `en-US`; no additional upstream locale payload was admitted.

This follow-up repairs stable `v2.1.31` compatibility only. Upstream `main` commit `1619d36af` is newer than the stable tag and changes send-draft behavior, so it remains outside this lane pending its own behavior assessment.

## Strict Assistant DTO and Team Event Follow-Up 2026-07-10

AionCore `v0.1.44` separates business Assistant identity from runtime-agent metadata. The stable AionUI intake originally retained several legacy writer and event assumptions that compiled successfully but would change behavior at runtime:

- Conversation creation must send the selected Assistant at the top-level `assistant` field. Channel settings, Cron jobs, and Team members must send canonical `assistant_id` business identity rather than reconstructing identity from backend, preset, or custom-agent runtime fields.
- Existing-conversation Cron jobs must keep their original Assistant. AionCore rejects `agent_config` whenever an update starts or ends in `existing` mode, including a switch from `existing` to `new_conversation`; the shell therefore disables Assistant edits and omits `agent_config` for those updates. New-conversation jobs continue to use the strict write DTO.
- AionRS Cron provider identity is read from `agent_config.model.provider_id`. If the recorded provider or model is no longer available, the editor leaves the model unresolved instead of silently binding another provider with the same model id.
- Legacy Assistant import now persists `migration.assistantImportCompleted_v1` immediately after the insert-only import phase. A later state, agent-id, or rule migration failure can retry without recreating an Assistant the user deleted after the first successful import. Missing or failed config persistence returns failure instead of reporting migration completion.
- Team REST responses use `assistants`, `leader_assistant_id`, `assistant_name`, and `assistant_backend`. Team WebSocket events use `team.agentStatusChanged`, `team.agentSpawned`, `team.agentRemoved`, `team.agentRenamed`, `team.listChanged`, and `team.teammateMessage`; spawned payloads carry `assistant`, renamed payloads carry `name`, and runtime statuses such as `working` are mapped to the renderer's `active` state.

The Team renderer remains disabled for the ordinary OPL App product surface. Correcting its adapter does not re-enable Team navigation, Team mutations, or Team MCP exposure; it prevents the retained upstream implementation from drifting into a broken latent path.

Focused evidence for the final adapter commit `6875ada9f` covered Team request/response/event mapping, strict Cron writes and edit locking, Assistant migration restartability, and bridge event names (`4` files / `40` tests). The same lane passed the full non-DOM suite (`149` files / `1318` tests), TypeScript, lint with warning-only existing findings, formatting, i18n validation, and `git diff --check`. The full DOM suite still had the pre-existing `GuidModelSelector` nested-menu timing failure on both the lane and then-current Shell `main`; that test passed independently (`1` file / `4` tests`) and must be rerun after the concurrent Settings/Home lane is absorbed.

## Evidence Commands Run For This Draft

```bash
gh release list -R iOfficeAI/AionUi --limit 10
gh release list -R iOfficeAI/AionUi --limit 1 --json tagName,publishedAt,isLatest,name
gh release view v2.1.31 -R iOfficeAI/AionUi --json tagName,publishedAt,targetCommitish,name,body,url
gh release view v2.1.30 -R iOfficeAI/AionUi --json tagName,publishedAt,targetCommitish,name,body,url
gh release view v2.1.28 -R iOfficeAI/AionUi --json tagName,publishedAt,targetCommitish,name,body,url
gh release view v2.1.29 -R iOfficeAI/AionUi --json tagName,publishedAt,targetCommitish,name,body,url
git ls-remote https://github.com/iOfficeAI/AionUi.git refs/heads/main refs/tags/v2.1.27 refs/tags/v2.1.28 refs/tags/v2.1.29 refs/tags/v2.1.30 refs/tags/v2.1.31
git log --oneline e49cd94935f4e461f002a1260a47c1b7b2ce81ca..upstream/main
gh api repos/iOfficeAI/AionUi/compare/v2.1.27...v2.1.31 --jq '{status:.status,ahead_by:.ahead_by,behind_by:.behind_by,total_commits:.total_commits}'
```

`gh release view v2.1.29` returned `release not found`; this is expected for the release surface because the tag exists and the v2.1.30 release note rolls it up.

## Main-Session Verification

```bash
bun run i18n:types
node scripts/check-i18n.js
git diff --check
bunx vitest run tests/unit/bootstrap/backendStartupFailure.test.ts tests/unit/providers/OpenAIRotatingClient.test.ts tests/unit/renderer/hooks/useThrottle.dom.test.ts tests/unit/renderer/markdownImageAlt.dom.test.tsx tests/unit/feedback/feedbackBridge.test.ts tests/unit/process/configureConsoleLog.test.ts tests/unit/sentry.test.ts tests/unit/bootstrap/configureConsoleLog.test.ts tests/unit/cron/cronUtils.test.ts tests/unit/chat/guidSlashCommands.test.ts tests/unit/renderer/useSlashCommandController.test.ts tests/unit/settings/settingsNav.test.ts --reporter dot
env VITEST_INCLUDE_DOM=1 bunx vitest run tests/unit/renderer/useAcpMessage.dom.test.ts tests/unit/renderer/useAcpModelInfo.dom.test.ts tests/unit/cron/useCronJobs.dom.test.ts tests/unit/cron/TaskDetailPage.dom.test.tsx tests/unit/guid/AssistantSelectionArea.dom.test.tsx tests/unit/guid/GuidInputCard.dom.test.tsx tests/unit/settings/SettingsModal.dom.test.tsx tests/unit/settings/SystemModalContent.dom.test.tsx tests/unit/settings/UpdateModal.dom.test.tsx --project dom --reporter dot
cd packages/web-host && bunx vitest run src/backend-launcher.test.ts --reporter dot
bunx vitest run tests/unit/opl-runtime/prepareAioncoreDownload.test.ts --reporter dot
bunx vitest run tests/unit/opl-runtime/firstRunVmSmoke.test.ts tests/unit/opl-runtime/firstRunVmSmokeScripts.test.ts --reporter dot
bunx vitest run tests/unit/feedback/feedbackBridge.test.ts --reporter dot
bun run test:dom -- tests/unit/feedback/FeedbackReportModal.dom.test.tsx --reporter dot
env AIONUI_AIONCORE_CACHE_DIR="$(mktemp -d /tmp/opl-aioncore-cold.XXXXXX)" node scripts/prepareAioncore.js
```

Results across the accepted mainline and follow-up lanes: i18n generation/check passed with existing warning-only unknown literal keys; non-DOM focused suite passed `10` files / `51` tests; DOM focused suite passed `9` files / `75` tests with existing `act(...)`, localStorage, and `NaN` style warnings; web-host backend launcher suite passed `1` file / `34` tests with the existing `MaxListenersExceededWarning`; AionCore preparation passed `1` file / `18` tests; startup failure classification passed `1` file / `37` tests; VM evidence resilience passed `2` files / `108` tests; feedback privacy and queue confirmation passed `24` non-DOM tests plus `19` DOM tests; and the real cold-cache run completed on attempt `3/3` with artifact verifier `missing: []`.

## Stop Condition

This record stops at scoped upstream-intake absorption. It does not assert whole-upstream merge, release readiness, App binary readiness, or installed runtime readiness.
