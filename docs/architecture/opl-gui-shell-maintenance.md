# OPL GUI Shell Maintenance

Status anchor: 2026-05-01

This repository is the current One Person Lab GUI shell. It keeps the AionUI source tree syncable while concentrating One Person Lab differences in branding, Codex-default runtime wiring, environment management, release/update metadata, bridge adapters, and packaging policy.

## Repository Role

`opl-aion-shell` is an OPL product fork of upstream AionUI, not the canonical OPL runtime, not the OPL family control plane, and not the place where MAS/MAG/RCA/MDS domain truth is owned.

Its durable role is deliberately narrow:

- provide the desktop GUI shell and packaged application experience for OPL users
- keep upstream AionUI source layout and dependencies cheap to follow
- add the minimum OPL overlay needed for Codex-default runtime discovery, OPL branding, installer/release metadata, environment preparation, bridge policy, and packaging validation
- call OPL-owned CLI or machine-readable surfaces when runtime truth is needed, instead of duplicating that truth in renderer state or fork-local ad hoc files

The preferred long-term shape is a thin, syncable overlay. When a change can be implemented either by broad upstream source surgery or by a small OPL adapter, packaging rule, bridge policy, or configuration surface, choose the thin OPL layer.

## Operational Boundary

Use this repo for GUI-shell work:

- OPL shell branding, first-run experience, updater/release metadata, packaged runtime validation, and installer packaging
- Codex-default runtime wiring, visible skill filtering, bridge adapters, process launch policy, and environment discovery needed by the shell
- upstream AionUI intake, conflict resolution, and patch-retirement audits
- fork-safe hygiene that prevents tracked local runtime/build payloads from entering `gaofeng/main`

Keep these responsibilities outside this repo:

- OPL family contracts, shared runtime truth, portfolio/session ledgers, and cross-domain governance belong in `one-person-lab` or the relevant domain repo
- MAS/MAG/RCA/MDS domain truth belongs in those domain repos and their contract surfaces
- local agent sessions, prompt logs, runtime-state, generated debug output, and worktrees stay ignored or user-local
- broad source-shape governance over upstream-owned AionUI code is avoided unless a specific OPL product risk justifies it

Repository hygiene is intentionally limited for this reason. `bun run hygiene` blocks tracked generated and local-state payloads; it does not impose line-budget or broad architecture gates on upstream-owned source and tests.

## Fork Boundary

- Treat `gaofeng/main` as the product mainline for OPL shell work. In this local checkout, `origin` is upstream `iOfficeAI/AionUi`; `origin/main` is not the OPL product branch.
- Before creating a feature worktree, confirm `git remote -v` and branch tracking. OPL bug fixes, release changes, environment management changes, and product UI changes must branch from `gaofeng/main`.
- Use `origin/main` only as an upstream sync input. Upstream sync work should live on an explicit upstream-sync branch, then be reviewed and absorbed into the OPL mainline.
- If a worktree was accidentally created from `origin/main`, discard that worktree and recreate it from `gaofeng/main` before editing. Do not try to patch OPL changes onto an upstream-baseline worktree in place.
- Do not delete upstream source modules to reduce package size. Hide or bypass unused features in the OPL adapter layer and exclude unused runtime files at packaging time.
- Do not copy `opl install`, module management, skill synchronization, or runtime truth into renderer-only code. The GUI calls OPL CLI-backed machine-readable surfaces.
- Do not remove dependencies from `package.json` only because the OPL package excludes their runtime files. Source compatibility with upstream should remain cheap to rebase.
- Keep Aion CLI, aionrs, Gemini, and other unused upstream runtimes disabled or excluded through bridge policy and packaging rules, not broad source deletion.

## Standard Intake Trigger

Requests such as "follow latest AionUI", "absorb AionUI latest", "sync upstream AionUI", or "update to the latest AionUI version" are complete instructions for the standard upstream-intake lifecycle. The operator should not need a custom prompt for each update.

Before changing code, establish the live state:

- `git status --short --branch` and `git remote -v` for this repo.
- Current OPL product baseline on `gaofeng/main`.
- Current upstream AionUI `origin/main` and latest upstream tag.
- Dirty files in the root checkout, separated from the intended upstream intake.
- The previous AionUI baseline currently carried by OPL, usually visible in `package.json`, tags, or the last upstream-intake merge.

Create a short-lived intake branch/worktree from a clean `gaofeng/main` baseline, named like `codex/aionui-upstream-intake-YYYYMMDD`. If the root checkout has unrelated dirty work, preserve it and do the intake in a separate worktree.

## Sync Workflow

Use this sequence for every AionUI upstream sync:

1. Fetch upstream and choose the current latest AionUI tag/HEAD from live git data, not from memory.
2. Compare the upstream delta since the carried AionUI baseline, the OPL overlay delta since that baseline, and any dirty local delta that must be preserved outside the intake.
3. Build a patch matrix for OPL overlay changes before resolving conflicts:
   - `keep`: OPL-specific product behavior remains necessary.
   - `drop-upstream-covered`: upstream now provides the same behavior or root-cause fix, so the local deep patch should be removed.
   - `adapt-to-upstream`: upstream partially covers the need, so keep only the OPL-specific adapter layer on top of the new upstream shape.
   - `watch`: upstream changed a nearby surface, but no OPL patch should move yet.
4. Sync upstream and resolve source conflicts using the patch matrix. Prefer deleting or thinning OPL patches when upstream has caught up; do not preserve redundant fork-specific code just because it already exists.
5. Run `bun install --frozen-lockfile` if dependency metadata changed.
6. Run `bun run i18n:types` and `node scripts/check-i18n.js` when renderer or locale surfaces changed.
7. Run `bunx tsc --noEmit`.
8. Run targeted tests for changed areas, then `bun run test` before release.
9. Build the app with `bun run build-mac` for the macOS universal release, or with the matching single-arch command when debugging an architecture-specific issue.
10. Run packaged runtime validation with `bun run validate:opl-package`.
11. Install the packaged app and run a real startup smoke.
12. Absorb the validated result back into `gaofeng/main`, push when requested or required for release work, then remove temporary worktrees and branches.

The build script also runs packaged runtime validation with `--scan-all` after `electron-builder` produces a fresh `app.asar`. That makes missing relative runtime imports and forbidden packaged dependencies fail during packaging instead of after a user launches the app.

## Patch Retirement Audit

The upstream-intake goal is not mechanical rebasing. Each intake should reduce long-term fork cost when upstream AionUI has absorbed behavior that OPL previously carried as a local patch.

Audit at least these overlap surfaces during each intake:

- `package.json`, lockfile, release workflows, build scripts, and packaged runtime validation.
- Bun runtime preparation, baseline binary handling, shell environment, and packaged launch helpers.
- ACP process/runtime client behavior, AionRS handling, MCP agent surfaces, and process shutdown/logging behavior.
- Built-in skills, Office skills, skill sync, assistant presets, and default visible skill surfaces.
- OPL branding, Codex-default runtime wiring, environment management, tray/runtime status, workspace panel, updater metadata, and packaging trim rules.

Retain OPL-specific product behavior only when it is still required by the One Person Lab runtime boundary. If a patch is kept, its reason should be clear from the commit message, test name, or surrounding documentation.

## macOS Release Architecture

OPL macOS releases use a universal DMG/ZIP by default. The earlier arm64/x64 split came from the inherited AionUI multi-architecture build matrix plus OPL's previous `build-mac` script, not from an Electron requirement. Keep `build-mac:arm64`, `build-mac:x64`, and `build-mac:dual` as release-engineering fallback paths, but the normal user-facing macOS release should be `mac-universal` so the GitHub Release page does not expose two equivalent downloads to ordinary users.

## Packaging Trim Policy

The central trim rules live in `electron-builder.yml`. The central validation rules live in `scripts/validate-packaged-runtime.js`.

When adding or changing trim rules:

- Prefer positive inclusion for required runtime directories and negative exclusion for clearly unused package payload.
- Add forbidden patterns to `scripts/validate-packaged-runtime.js` when a removed dependency must never re-enter the packaged app.
- Run `bun run validate:opl-package` against the generated package.
- Launch the packaged app once after the validation passes.

Hermes-Agent support is an explicit optional hosted/runtime/provider/online-management capability. The default OPL GUI, first-launch, Full first-install, and runtime tray baseline is Codex-default plus the local OPL/MAS scheduler surfaces; Hermes must not be treated as a mandatory package payload or readiness prerequisite. If a Full runtime explicitly includes `bin/hermes`, the shell may expose `OPL_HERMES_BIN` for that explicit path.
