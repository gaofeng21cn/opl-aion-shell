# Upstream Intake Provenance

These records explain accepted or rejected upstream changes at their recorded
revision. They do not select current dependencies, restore retired APIs or
tests, define a backlog, or qualify an App release. The current intake contract
is `contracts/aionui-upstream-intake.json`; implementation boundaries are in
[App/Shell boundary](../guides/opl-app-shell-boundary.md).

- [September selective intake](aionui-upstream-intake-2026-09-06.md) is the
  human record referenced by the current intake contract.

Earlier dated intake records — the May layout/worktree retirement note and the
July review tables through `v2.1.56` — are retired from the active tree. Their
bytes remain at Git commit `945e8192b`, which is their retrieval reference and
not a current pin, permission to maintain an AionCore fork, or a compatibility
obligation for the layouts and commands they name. Retain a new history file
only when it adds unique rationale or provenance that will inform a future
decision; keep current operations in their owning guide.
