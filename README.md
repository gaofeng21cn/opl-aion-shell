# One Person Lab App

One Person Lab App is the end-user desktop product for the One Person Lab
system. This repository owns product packaging, release assets, updater
metadata, user-facing guides, first-run checks, and GUI page-state tests.

The OPL framework remains in
[`gaofeng21cn/one-person-lab`](https://github.com/gaofeng21cn/one-person-lab).
This App repository consumes framework-owned machine-readable surfaces; it does
not own runtime truth, domain truth, provider logic, or domain artifact
authority.

## Repository Layout

```text
one-person-lab-app/
  docs/                 App product, release, testing, and user docs
  contracts/            App-level machine-readable contracts
  scripts/              App-level validation and release wrappers
  shells/
    aionui/             Current stable AionUI-backed GUI shell adapter
```

`shells/aionui/` is an upstream-backed shell adapter. It is not the App
repository identity, and future shells can be added under `shells/` before the
active shell contract is switched.

## Common Commands

```bash
bun install --cwd shells/aionui --frozen-lockfile
bun run validate:active-shell
bun run i18n:types
bun run test
bun run build-mac
```

Root commands proxy into the active shell where appropriate. Release asset
normalization and validation are exposed from the App root:

```bash
bun run prepare-release-assets -- build-artifacts release-assets
bun run validate-release -- release-assets
```

## Current Shell

The active shell is declared in
[`contracts/app-shell-adapter.json`](contracts/app-shell-adapter.json):

- active shell: `aionui`
- shell root: `shells/aionui`
- upstream family: `AionUI`
- product repo remote: `origin`
- upstream remote: `upstream`

See [`docs/status.md`](docs/status.md) for the current migration and release
state.
