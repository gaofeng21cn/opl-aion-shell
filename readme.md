# OPL Aion Shell

This repository is the retired AionUI implementation of
[One Person Lab App](https://github.com/gaofeng21cn/one-person-lab-app).
The current desktop, Nightly, and Docker WebUI releases are implemented in
[OPL Studio](https://github.com/gaofeng21cn/opl-studio), on DeepSeek Harness/Cordis.
Install and update through the [App releases](https://github.com/gaofeng21cn/one-person-lab-app/releases/latest).

This source remains available for historical provenance, pinned validation
fixtures, and migration from older signed App releases. Its tags and releases
must remain reachable. It is no longer a production build source or an active
upstream intake target. App owns product and release policy; Framework owns
runtime and Package state.

The development instructions below describe the historical implementation.

## Development

```bash
bun install
bun start
```

Use [Development](docs/contributing/development.md) for prerequisites, isolation,
and checks, [WebUI](docs/guides/webui.md) for the standalone development host,
and [Contributing](CONTRIBUTING.md) for review. Public installation and updates
follow the App owner's releases, not the upstream AionUI download pages.

## Documentation

[Documentation index](docs/README.md) assigns each current reference one task.
The [App/Shell boundary](docs/guides/opl-app-shell-boundary.md) defines the
consumer responsibilities. Commands live in `package.json`; source and tests
must support current implementation claims.

## Upstream Provenance

The AionUI intake is recorded in
[the intake contract](contracts/aionui-upstream-intake.json) and
[history](docs/history/). AionCore is consumed only as an official unmodified
release. Its lifecycle and the OPL-owned Codex carrier are verified through the
Shell toolchain and App release gates.

Upstream source is [AionUI](https://github.com/iOfficeAI/AionUi).
Inherited marketing translations, old PRD state tables, and completed startup
plans are preserved in this repository's Git history, not maintained as OPL
support documentation. `CHANGELOG.md` retains upstream release provenance;
it is not the One Person Lab release feed.

## License

See [LICENSE](LICENSE) and retain the applicable upstream source notices.
