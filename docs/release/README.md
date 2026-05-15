# App Release

Owner: `one-person-lab-app`
Purpose: `app_release_docs`
State: `active`
Machine boundary: Human-readable release guide. Use
`contracts/app-release-channel.json`, release assets, and updater metadata for
machine decisions.

The App repository owns standard desktop packages, updater metadata, release
asset normalization, and Full first-install package validation.

## Commands

```bash
bun run --cwd shells/aionui build-mac
node scripts/prepare-release-assets.mjs build-artifacts release-assets
node scripts/validate-release.mjs release-assets
```

Standard updater metadata is restricted to standard package assets. Full
first-install packages must be explicitly named with `Full` and must not be
referenced from `latest*.yml`.
