# OPL App Shell Boundary

`opl-aion-shell` is the replaceable renderer and Electron carrier for One Person Lab App. GUI product truth, page-state expectations, release gates, screenshots, and user documentation are owned by `one-person-lab-app`.

## Runtime Bridge

The shell bridge uses the App/runtime contract surfaces as its primary path:

- `opl app state --profile fast --json`
- `opl app state --profile full --json`
- `opl app action execute --action <id> [--payload refs-only-json] [--dry-run] --json`

`opl runtime app-operator-drilldown --detail full --json` is a diagnostic exception. Renderer pages must load normal Runtime status from `opl app state`; full drilldown is user-triggered diagnostic detail and must not become the default page-state source.

## Renderer Consumption

Runtime pages should consume `opl_app_state.v1` directly. Legacy `runtime_visualization_projection` parsing is kept as an isolated adapter for historical full-detail payloads and tests. New GUI work should not add top-level `runtime_visualization_projection` fallback to the main renderer path.

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
