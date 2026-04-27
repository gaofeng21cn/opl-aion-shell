# OPL GUI Shell Maintenance

Status anchor: 2026-04-27

This repository is the current One Person Lab GUI shell. It keeps the AionUI source tree syncable while concentrating One Person Lab differences in branding, Codex-default runtime wiring, environment management, release/update metadata, bridge adapters, and packaging policy.

## Fork Boundary

- Do not delete upstream source modules to reduce package size. Hide or bypass unused features in the OPL adapter layer and exclude unused runtime files at packaging time.
- Do not copy `opl install`, module management, skill synchronization, or runtime truth into renderer-only code. The GUI calls OPL CLI-backed machine-readable surfaces.
- Do not remove dependencies from `package.json` only because the OPL package excludes their runtime files. Source compatibility with upstream should remain cheap to rebase.
- Keep Aion CLI, aionrs, Gemini, and other unused upstream runtimes disabled or excluded through bridge policy and packaging rules, not broad source deletion.

## Sync Workflow

Use this sequence for every AionUI upstream sync:

1. Sync upstream and resolve source conflicts.
2. Run `bun install --frozen-lockfile` if dependency metadata changed.
3. Run `bunx tsc --noEmit`.
4. Run targeted tests for changed areas, then `bun run test` before release.
5. Build the app with `bun run build-mac:arm64` or the matching platform command.
6. Run packaged runtime validation with `bun run validate:opl-package`.
7. Install the packaged app and run a real startup smoke.

The build script also runs packaged runtime validation with `--scan-all` after `electron-builder` produces a fresh `app.asar`. That makes missing relative runtime imports and forbidden packaged dependencies fail during packaging instead of after a user launches the app.

## Packaging Trim Policy

The central trim rules live in `electron-builder.yml`. The central validation rules live in `scripts/validate-packaged-runtime.js`.

When adding or changing trim rules:

- Prefer positive inclusion for required runtime directories and negative exclusion for clearly unused package payload.
- Add forbidden patterns to `scripts/validate-packaged-runtime.js` when a removed dependency must never re-enter the packaged app.
- Run `bun run validate:opl-package` against the generated package.
- Launch the packaged app once after the validation passes.

Hermes-Agent support is an external ACP CLI path. It does not require bundling Aion CLI, aionrs, Gemini, googleapis, or `@office-ai/aioncli-core`.
