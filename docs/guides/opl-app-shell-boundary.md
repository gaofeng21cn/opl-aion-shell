# OPL App Shell Boundary

`opl-aion-shell` is the mainline GUI shell implementation carrier for One Person Lab App. It implements App-owned contracts and consumes App/root canonical state; it does not own product strategy, runtime truth, package truth, model-selection policy, onboarding truth, domain route authority, release gates, screenshots, owner receipts, or release/user documentation. Those decisions and evidence surfaces are owned by `one-person-lab-app`, One Person Lab Framework/root, and the OPL/domain repositories behind the App contracts.

Purpose-first shell work starts from the App contract and then lands in this repository as implementation. Upstream AionUI behavior, shell-local defaults, candidate shell experiments, packaged runtime details, and renderer implementation APIs must not become product authority by existing here.

Current GUI policy is fixed at the App layer: this repository is the active
AionUI mainline implementation carrier. `opl-native-workbench` is the
foreground/developer backup candidate and is developed in its own candidate
shell repo. Hermes Desktop / `hermes-codex` is retained as a prior-candidate
reference. AGUI / `agui-codex` is archived technical proof only; do not port it
into the AionUI mainline, use it as a validation baseline, or continue AGUI
polish from this repository unless the user explicitly requests AGUI replay.

## Ownership Boundary

This repository may own:

- Renderer, Electron process, preload, packaging, and shell release implementation.
- AionUI upstream intake and shell-local adaptation needed to satisfy App-owned contracts.
- Shell-side consumption of App/runtime contracts, generated product profiles, and route receipts.
- Shell tests and diagnostics that prove the implementation honors those contracts.

This repository must not own:

- Product strategy, ordinary-user workflow, or App onboarding truth.
- Runtime truth, production readiness, domain readiness, or OPL family status.
- Codex model-selection policy, visible assistant policy, or purpose-entry semantics.
- MAS, MAG, RCA, OMA, or other domain route authority.
- App release promotion, updater policy, release evidence, screenshots, or user-facing release documentation.

If a shell-local change needs one of those decisions, land the decision in the owner repo first, then copy or consume the resulting contract here. If another shell candidate replaces this repository, that switch is made through the App-owned shell adapter contract and release gate, not by promoting this repository into product ownership.

## Package Composition Boundary

The OPL ecosystem separates Package identity, publication, carrier, and
executor. This shell is currently a Codex-first carrier and executor adapter;
that choice minimizes today's delivery cost, but it is not an ecosystem-wide
identity or storage decision. Codex Plugin Manager may manage Plugin, config,
and cache bytes for this carrier. It is not the OPL Package identity, the
complete installed-state authority, or the authority for another carrier.

Package owners publish their own official bytes to GHCR and advance their own
`latest-stable`. A shared Release Set is limited to Full/offline, integration
test, and QA snapshots; it does not decide ordinary Package currentness. The
Shell must not retain a Package/Agent/Skill/Tool/Plugin catalog, dependency
graph, version solver, lock, payload, receipt, source policy, or currentness
mirror. It renders the Framework's fresh carrier readback and submits only
App-authorized actions.

Ordinary Package dependencies mean stable identity presence and entrypoint
callability. The Shell must neither introduce a cross-Package version check nor
make a Package unavailable from its own local comparison. Carrier or executor
migration must not require reinstalling a Package or discard OPL-owned user
preferences, Work Items, dependency relationships, or typed views. The
Framework aggregates carrier readback; App owns the product projection and
preferences; domain Packages own their business state and typed views.

The owner migration SSOT is App path
`one-person-lab-app/docs/active/opl-package-platform-composition-migration.md`.
Until that App document reaches public `main`, its landed counterpart is the
Framework's [OPL Package platform composition migration](https://github.com/gaofeng21cn/one-person-lab/blob/main/docs/active/opl-package-platform-composition-migration.md).
This guide intentionally records only the Shell consumer boundary, not a second
migration plan.

## Runtime Bridge

The shell bridge uses the App/runtime contract surfaces as its primary path:

- `opl app state --profile fast --json`
- `opl app state --profile full --json`
- `opl app action execute --action <id> [--payload refs-only-json] [--dry-run] --json`

`opl runtime app-operator-drilldown --detail full --json` is a diagnostic exception. Renderer pages must load normal Runtime status from `opl app state`; full drilldown is user-triggered diagnostic detail and must not become the default page-state source.

## Managed Update Consumption

The Shell consumes a Framework/App read model and its authorized actions; it
does not maintain a second updater policy or local package-management state
machine. Its normal path reads `opl app state --profile fast --json`, renders
the returned installed/update/attention state, and sends mutation only through
`opl app action execute --action <id> [--payload refs-only-json] [--dry-run]
--json`. The action id, eligibility, source policy, and result semantics stay
with the owner projection. The Shell must not synthesize per-Package commands,
background reinstall lists, completion checkpoints, or automatic recovery
records.

Automatic maintenance is a Framework/carrier concern. Where the owner
projection exposes an authorized background-safe action, the Shell may invoke
that exact action and then refresh the projection. A Package update failure is
displayed for that Package; it must not cause the Shell to rebuild, block, or
mark unrelated Base/App/Package components stale. Explicit developer/local
carrier choices retain the carrier's native update policy and are never silently
overwritten by Shell logic.

OPL App binary replacement stays on its host/carrier route. The Shell can
display returned attention, reload, and restart guidance, but has no persistent
receipt, rollback, lock, or source-of-currentness of its own. Process-local
implementation identifiers may be passed to child processes only as opaque
transport context; they are not product state or Package lifecycle evidence.

## Renderer Consumption

Runtime pages should consume `opl_app_state.v1` directly. Legacy `runtime_visualization_projection` parsing is kept as an isolated adapter for historical full-detail payloads and tests. New GUI work should not add top-level `runtime_visualization_projection` fallback to the main renderer path.

App canonical component ids, package ids, and action ids / refs are the only machine-semantic identifiers the shell may submit back to OPL. Shell fallback or compatibility labels may be displayed, but must not mint action ids, mark fallback ids as ready / synced, or make fallback-derived routes executable.

Runtime task display states use Framework/App-owned `primary_state` and
`automation_state` when present. Legacy `state` / `status` fields may only
downgrade uncertain data to idle or attention states; they must not upgrade a
task into running, delivered, package-ready, or terminalized semantics.

Runtime scope controls are a user-facing filter, not a runtime-diagnostics
index. The default selector should show only all projects, agent, and project
scopes. Workspace binding ids, single work-item/task scopes, autopush names,
stage-attempt ids, workflow ids, and provider refs belong in task detail or
advanced diagnostics. A project scope represents the registered domain project
workspace, while the task list shows one work item per paper or deliverable.

Token usage is evidence-backed telemetry. When Framework reports missing,
unreported, or zero-without-observed-count usage, the renderer must display
"Usage not recorded" / "用量未记录" rather than `0 tokens`. Only observed
stage or task totals may be rendered as token counts.

`app_state.operator.default_read_surface_policy` is the shell-visible guard for
the default Runtime page. The normal page must treat
`current_owner_delta` / `opl_current_owner_delta` as the first-screen payload.
The normal page must not accept `compact_owner_delta_projection` or
`opl_compact_owner_delta_projection` as active/default compatibility aliases.
The normal page must keep `runtime_tray_snapshot`, raw evidence envelopes, stage
replay body, private residue inventory, and provider internal ledgers out of the
default state. Those refs may appear only through explicit full-state or
diagnostic detail. The shell must render this App/Framework policy; it must not
replace it with a shell-local runtime truth or full-detail polling rule.

## Codex Conversation Output

Codex ACP tool-call output must render like native Codex output. The shell
normalizes `raw_output` from `aggregated_output`, `formatted_output`, `stdout`,
and `stderr` fields, preserving newline-bearing command output in the tool-call
body. This belongs in the ACP normalization layer, not in a Codex CLI setting,
CSS text-collapse workaround, or post-render string heuristic.

If stdout and stderr are both present, the normalizer joins them with exactly
one separating newline unless stdout already ends with `\n`. Regression coverage
belongs beside `normalizeToolCall`, because every renderer path that consumes a
normalized tool call should receive the same output text.

## Product Profile

The generated product profile under `packages/desktop/src/common/config/oplProductProfile/` is App-owned input copied into the shell. Shell code may consume that profile for defaults such as visible settings tabs, home assistants, Codex model policy, and session context. It must not redefine those defaults from upstream AionUI UI state.

The only manually maintained Codex model/reasoning default is the App repository's
`contracts/app-product-profile.json#codex.auto_model_policy.configured_default`.
Do not edit `oplProductProfile.generated.json` directly or add a Shell model or
reasoning allowlist. Run `npm run codex:model-policy:sync` and then
`node --experimental-strip-types scripts/app-product-profile.ts` in the App
repository to refresh the generated profile. The full workflow is documented in
the App repository at `docs/product/gui/codex-auto-model-policy.md#维护默认模型`.

The ordinary language surface is Chinese and English unless the App-owned product profile changes that policy. Upstream locale payloads for additional languages are implementation material only; do not add them to `supportedLanguages`, static locale imports, login language choices, or settings language choices as part of upstream intake without an App owner decision.

The `/guid` home path treats MAS, MAG, and RCA as App-owned purpose assistants over the fixed Codex executor. Their `assistant_skill_profiles` decide the domain skill behavior: the matching skill (`mas`, `mag`, or `rca`) is selected and locked by default, optional companion skills are shown only for that assistant, and AionUI-internal skills stay out of the home skill menu. Built-in assistant sends also persist the App route receipt (`route_kind=builtin_capability`, `executor=codex_cli`, assistant id/short name, and `source=opl_app_home`) so the selected purpose is visible after the conversation is created.

## Upstream Intake Policy

AionUI upstream releases are implementation input, not App product authority. Each
intake must record accepted, rejected, and redirected surfaces in
`docs/history/` before a large upstream delta is absorbed. Upstream defaults for
assistants, Settings, model selection, updater behavior, Team surfaces, or
diagnostics may be copied only after the App or Framework owner surface has
accepted the corresponding product, runtime, release, or evidence boundary.

When an upstream feature overlaps a retired OPL surface, the default decision is
retire/watch, not resurrection. Implementation lanes must report final diffs and
validation back to the main session; a release note, tag, focused test, or local
commit does not by itself prove App-ready or release-ready status.

## Local Hygiene

Local CodeGraph indexes and packaged runtime payloads are development/build artifacts. They are ignored in this repository and must not be committed from shell lanes.

## Retirement Ledger

- 2026-06-03: Retired the Team-mode E2E compatibility tail after the App-owned
  product contract made ordinary AionUI Team hidden (`TEAM_MODE_ENABLED=false`).
  Removed `tests/e2e/cases/teams/`, the Team-only E2E specs, Team E2E helper
  exports, Team `invokeBridge` HTTP route mappings, Team npm scripts, and
  Team-workspace E2E files that required the hidden `/team/*` surface. Active
  proof now lives in the runtime flag,
  `/team/:id` router redirect, hidden Sider section, and
  `tests/unit/renderer/useTeamCreatedRedirect.dom.test.tsx`. The Team runtime
  implementation remains in place as disabled upstream implementation material,
  not ordinary OPL App product authority.
- 2026-06-03: Removed `packages/web-host/tests/equivalence.test.ts` and its dedicated `packages/web-host/tests/fixtures/mock-backend.ts` fixture. The test file was a no-op pointer left after N2 legacy test cleanup; active WebUI host coverage now lives in `packages/web-host/src/*.test.ts` and `packages/web-host/tests/start-web-host.test.ts`. Verification: `bun run --cwd packages/web-host test`.

## Remaining Deletion Gates

- Legacy `invokeBridge` IPC fallback still has active E2E callers for extension,
  WebUI, aionrs, channel, and conversation keys. Delete it only after each
  active key has an HTTP-backed helper route or an explicit current hosted
  surface.
- `runLegacyDatabaseMigrations` is still called from `initStorage` for the
  one-shot legacy Electron SQLite catalog migration. Delete it only after the
  legacy catalog window is closed by App/release policy and no supported launch
  path calls it.
