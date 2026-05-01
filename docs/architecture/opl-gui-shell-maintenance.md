# OPL GUI Shell Maintenance

Status anchor: 2026-05-01

This repository is the current One Person Lab GUI shell. It keeps the AionUI source tree syncable while concentrating One Person Lab differences in branding, Codex-default runtime wiring, environment management, release/update metadata, bridge adapters, and packaging policy.

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

Hermes-Agent support is an external ACP CLI path. It does not require bundling Aion CLI, aionrs, Gemini, googleapis, or `@office-ai/aioncli-core`.
