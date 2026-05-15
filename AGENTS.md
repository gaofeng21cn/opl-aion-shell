# One Person Lab App Repository Guide

This repository is the One Person Lab App product repository. It owns desktop
App packaging, release assets, updater metadata, user guides, screenshots,
first-run checks, and GUI page-state tests.

The OPL Framework remains in `gaofeng21cn/one-person-lab`. App code must consume
framework-owned machine-readable contracts, CLI JSON, provider receipts, and
domain-owned projections. Do not copy runtime truth, domain truth, provider
implementation, or domain artifact authority into this repository.

## Repository Boundaries

- `origin/main` is the One Person Lab App product mainline.
- `upstream/main` points to external `iOfficeAI/AionUi` and is only an explicit
  upstream intake source for the AionUI shell.
- `shells/aionui/` is the current stable AionUI-backed GUI shell adapter.
- Future GUI candidates belong under `shells/<candidate>/` until their contracts
  and tests are complete.

Root `docs/`, `contracts/`, and `scripts/` describe the App product layer.
AionUI-specific source, package metadata, tests, release hooks, and upstream
intake rules live under `shells/aionui/`.

## Working Rules

- Start App product work from `origin/main`.
- Use `upstream/main` only inside an explicit AionUI upstream-intake branch.
- Keep App-level changes at the root when they define product, release, testing,
  or user documentation behavior.
- Keep shell implementation changes inside `shells/aionui/` unless they are
  changing the active shell contract or root release wrapper.
- Run root contract validation after changing App-level contracts or wrappers:

```bash
bun run validate:active-shell
```

When editing files below `shells/aionui/`, also follow
[`shells/aionui/AGENTS.md`](shells/aionui/AGENTS.md).
