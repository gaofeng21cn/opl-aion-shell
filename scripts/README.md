# App Root Scripts

The root `scripts/` directory exposes App-level wrappers. The active Electron
shell implementation remains under `shells/aionui/scripts/`.

| Script | Purpose |
| --- | --- |
| `validate-active-shell.mjs` | Validates `contracts/app-shell-adapter.json` and runs selected active shell validation commands. |
| `prepare-release-assets.mjs` | Calls the active shell release asset normalizer from the App root. |
| `validate-release.mjs` | Verifies release assets and enforces that standard updater metadata excludes Full first-install assets. |

Examples:

```bash
node scripts/validate-active-shell.mjs --quick
node scripts/validate-active-shell.mjs --only i18n_types,i18n_check,typecheck
node scripts/prepare-release-assets.mjs build-artifacts release-assets
node scripts/validate-release.mjs release-assets
```
