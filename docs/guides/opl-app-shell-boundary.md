# OPL App Shell Boundary

`opl-aion-shell` is the replaceable renderer and Electron carrier for One Person Lab App. It implements App-owned contracts; it does not own product strategy, runtime truth, model-selection policy, onboarding truth, domain route authority, release gates, screenshots, or release/user documentation. Those decisions and evidence surfaces are owned by `one-person-lab-app` and the OPL/domain repositories behind its contracts.

Purpose-first shell work starts from the App contract and then lands in this repository as implementation. Upstream AionUI behavior, shell-local defaults, candidate shell experiments, packaged runtime details, and renderer implementation APIs must not become product authority by existing here.

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

## Runtime Bridge

The shell bridge uses the App/runtime contract surfaces as its primary path:

- `opl app state --profile fast --json`
- `opl app state --profile full --json`
- `opl app action execute --action <id> [--payload refs-only-json] [--dry-run] --json`

`opl runtime app-operator-drilldown --detail full --json` is a diagnostic exception. Renderer pages must load normal Runtime status from `opl app state`; full drilldown is user-triggered diagnostic detail and must not become the default page-state source.

## Renderer Consumption

Runtime pages should consume `opl_app_state.v1` directly. Legacy `runtime_visualization_projection` parsing is kept as an isolated adapter for historical full-detail payloads and tests. New GUI work should not add top-level `runtime_visualization_projection` fallback to the main renderer path.

`app_state.operator.default_read_surface_policy` is the shell-visible guard for
the default Runtime page. The normal page must treat
`current_owner_delta` / `opl_current_owner_delta` as the first-screen payload.
`compact_owner_delta_projection` / `opl_compact_owner_delta_projection` remain
compatibility aliases only. The normal page must keep `runtime_tray_snapshot`, raw evidence envelopes,
stage replay body, private residue inventory, and provider internal ledgers out
of the default state. Those refs may appear only through explicit full-state or
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

The `/guid` home path treats MAS, MAG, and RCA as App-owned purpose assistants over the fixed Codex executor. Their `assistant_skill_profiles` decide the domain skill behavior: the matching skill (`mas`, `mag`, or `rca`) is selected and locked by default, optional companion skills are shown only for that assistant, and AionUI-internal skills stay out of the home skill menu. Built-in assistant sends also persist the App route receipt (`route_kind=builtin_capability`, `executor=codex_cli`, assistant id/short name, and `source=opl_app_home`) so the selected purpose is visible after the conversation is created.

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
