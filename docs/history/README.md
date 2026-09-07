# Upstream Intake Provenance

These records explain accepted or rejected upstream changes at their recorded
revision. They do not select current dependencies, restore retired APIs or
tests, define a backlog, or qualify an App release. The current intake contract
is `contracts/aionui-upstream-intake.json`; implementation boundaries are in
[App/Shell boundary](../guides/opl-app-shell-boundary.md).

- [May layout and worktree retirement](aionui-upstream-intake-2026-05-25.md)
  records why old root-source patches and candidate smoke worktrees must not be
  replayed onto the workspace layout.
- [September selective intake](aionui-upstream-intake-2026-09-06.md) is the
  human record referenced by the current intake contract.

The July records accumulated successive review tables, completion logs, and
runtime cohorts. Their unabridged original bytes remain at the last source
baseline before documentation retirement:

- [July 9 intake](https://github.com/gaofeng21cn/opl-aion-shell/blob/945e8192b/docs/history/aionui-upstream-intake-2026-07-09.md)
  covers selective intake through upstream `v2.1.31`, including API, database,
  diagnostics, and installed-evidence constraints.
- [July 22 and later review additions](https://github.com/gaofeng21cn/opl-aion-shell/blob/945e8192b/docs/history/aionui-upstream-intake-2026-07-22.md)
  records direct-CLI/schema-v2 transition and reviewed releases through
  `v2.1.56`. Old binary hashes and incomplete-cohort rejection explain historical
  choices; they are not current pins or permission to maintain an AionCore fork.

Ordinary upstream PRDs, marketing translations, startup experiments, E2E
discussion logs, and inherited automation instructions remain in Git history.
Retain a new history file only when it adds unique rationale or provenance that
will inform a future decision; keep current operations in their owning guide.
