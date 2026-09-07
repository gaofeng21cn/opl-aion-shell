# OPL Aion Shell

This repository implements the AionUI-based Stable carrier for
[One Person Lab App](https://github.com/gaofeng21cn/one-person-lab-app).
It contains the renderer, Electron process, standalone WebUI adapter, packaging
hooks, and tests. App owns the product, platform support, model policy, release,
and selected carrier; Framework owns runtime and Package state.

Studio is an independent DSH/Cordis Application Host with a separate process
scope. Both carriers consume public App/Framework contracts. Hermes is retired
read-only provenance. Neither this repository nor its upstream feature lists
can change those product decisions.

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
