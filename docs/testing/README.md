# App Testing

Owner: `one-person-lab-app`
Purpose: `app_testing_docs`
State: `active`
Machine boundary: Human-readable testing guide. Test code, contracts, and
artifacts are the executable truth.

## Active Shell Checks

```bash
bun install --cwd shells/aionui --frozen-lockfile
bun run --cwd shells/aionui i18n:types
cd shells/aionui && node scripts/check-i18n.js
bun run test
bun run --cwd shells/aionui lint
bun run --cwd shells/aionui validate:opl-package
```

`bun run test` is the App-level stable runner. It reads
`contracts/app-shell-adapter.json`, enumerates the active shell Vitest suites,
and runs them as isolated sequential `node` / `dom` chunks. The upstream shell
entrypoint remains available as `bun run --cwd shells/aionui test` for direct
AionUI intake work.

## App-Level Checks

```bash
node scripts/validate-active-shell.mjs --quick
node scripts/prepare-release-assets.mjs build-artifacts release-assets
node scripts/validate-release.mjs release-assets
```

The App page-state matrix is declared in
`contracts/app-page-state-matrix.json`. The first-run matrix is declared in
`contracts/app-first-run-test-matrix.json`.
