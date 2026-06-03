# AionUI Upstream Intake 2026-05-25

Owner: `opl-aion-shell`
Purpose: `upstream_intake_record`
State: `historical_baton`
Machine boundary: Human-readable intake record. Use git refs, source files, and repo-native tests for merge decisions.

## Current Upstream

- Upstream remote: `https://github.com/iOfficeAI/AionUi.git`.
- Upstream stable tag audited in this lane: `v2.1.1`.
- Upstream main observed during the original audit: `e0e90f76dbd6c711e58eb186ada89c925017bcb5`.
- Original local OPL shell baseline during the audit: `origin/main` at `4f78af6f8ff9b6aa04811e25434b410549b2e369`.
- Follow-up cleanup review on 2026-06-03 found current OPL shell `main` already using the upstream `packages/desktop/**` layout and carrying later OPL Full-runtime, assistant-route smoke, and release-gate fixes.

## Intake Judgment

Do not fast-forward or directly merge upstream `v2.1.1` into the OPL shell mainline in the same lane as App release or first-run fixes.

The upstream delta was a structural migration, not a small patch bump. Upstream moved large parts of the desktop code into `packages/desktop/**`, added mobile and web/CLI packaging surfaces, replaced many root configs/workflows, and deleted or relocated files patched by the OPL overlay. A direct merge would mix product packaging, release ownership, first-run runtime wiring, and OPL-specific shell behavior in one very large conflict surface.

## Patch Matrix

| Area                                                                                              | Action            | Reason                                                                                                                |
| ------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| OPL branding, App product profile, Codex defaults, Full runtime env, first-run maintenance        | keep              | These are OPL-owned product/runtime boundaries and are not upstream truth.                                            |
| Upstream settings persistence fixes, theme/language/window bounds persistence, provider UI polish | adapt-to-upstream | These are likely valuable user-facing fixes, but need replay onto current OPL paths.                                  |
| Upstream package/workflow/release-distribute/Homebrew surfaces                                    | watch             | App release ownership lives in `one-person-lab-app`; shell workflows must stay thin or retired when App owns release. |
| Upstream `packages/desktop/**` layout                                                             | adopted           | Current OPL shell main has already migrated to this layout; old root `src/**` patches are historical only.            |
| Upstream issue/PR automation and GPT review workflows                                             | watch             | They are upstream project governance, not automatically OPL shell runtime requirements.                               |
| OPL `TASTE.md`, `AGENTS.md`, first-launch and ACP runtime patches                                 | keep              | These define local maintenance and product behavior for the fork.                                                     |

## 2026-06-03 Cleanup Note

The old `codex/app-npx-nightly-20260525` worktree carried two source/test edits under root `src/process/utils/shellEnv.ts` and `tests/unit/shellEnv.test.ts`. Current main no longer has those files; the equivalent concern is covered by `packages/desktop/src/process/backend/hostToolEnv.ts`, `packages/desktop/src/process/backend/fullRuntime.ts`, `packages/desktop/src/process/bridge/oplRuntimeBridge.ts`, and their OPL runtime tests.

The old `codex/packaged-gui-assistant-smoke-20260528` worktree carried a prompt-sending assistant route smoke. Current main has a later receipt-only assistant route smoke plus deterministic Codex functional/self-check surfaces, so replaying the old diff would regress the gate.

The old `codex/aionui-v2.1.1-stable-20260525` worktree carried pushed historical commits and large local generated runtime artifacts. Treat its untracked `packaged-runtimes/` and `.codegraph/` directories as generated cleanup candidates, not source to absorb.

## Evidence Commands

```bash
git ls-remote --tags --refs https://github.com/iOfficeAI/AionUi.git 'v*'
git ls-remote https://github.com/iOfficeAI/AionUi.git refs/heads/main
git fetch upstream main --no-tags
git merge-base origin/main upstream/main
git diff --stat origin/main..upstream/main
git diff --name-status origin/main..upstream/main
```
