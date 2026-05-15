# One Person Lab App Status

Owner: `one-person-lab-app`
Purpose: `app_status`
State: `active`
Machine boundary: Human-readable status. Use `contracts/` and release/test
artifacts for machine decisions.

## Current State

- GitHub repo: `gaofeng21cn/one-person-lab-app`.
- Product remote: `origin`.
- AionUI upstream remote: `upstream`.
- Active shell: `aionui`.
- Active shell root: `shells/aionui`.
- Framework dependency: `gaofeng21cn/one-person-lab`.

The previous `opl-aion-shell` name is a historical/redirect name. New App
documentation, scripts, and Framework references should use
`one-person-lab-app` and `shells/aionui`.

## Release State

Standard App release assets and updater metadata are App-owned. Full
first-install assets remain explicitly separate from standard updater metadata.
The updater must not select assets whose names include `Full`.

## Validation Entry Points

```bash
bun install --cwd shells/aionui --frozen-lockfile
node scripts/validate-active-shell.mjs --quick
bun run i18n:types
bun run test
node scripts/prepare-release-assets.mjs build-artifacts release-assets
node scripts/validate-release.mjs release-assets
```

Page-state and first-run expectations are declared in
`contracts/app-page-state-matrix.json` and
`contracts/app-first-run-test-matrix.json`.
