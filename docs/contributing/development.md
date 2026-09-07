# Shell Development

This guide takes an OPL Shell checkout to a local development session.
Product requirements and release operation remain with One Person Lab App.

## Setup

Use the Node version declared by the repository toolchain, Bun, and the native
build tools required by installed dependencies.

```bash
git clone https://github.com/gaofeng21cn/opl-aion-shell.git
cd opl-aion-shell
bun install
bun start
```

The package scripts pass `packages/desktop/electron.vite.config.ts` to
electron-vite. The build produces `out/main`, `out/preload`, and
`out/renderer`. Source belongs under `packages/desktop/src`, not a root
`src/` directory.

AionCore is an official, unmodified dependency. Use the pinned official carrier
prepared by the existing build toolchain; its identity is held by
`contracts/aionui-upstream-intake.json` and package/resource metadata.
Do not build an OPL AionCore fork or replace an installed App's Core in place.

## Development Entries

| Command                                 | Purpose                                         |
| --------------------------------------- | ----------------------------------------------- |
| `bun start`                             | Electron development                            |
| `bun run start:multi`                   | A second isolated development instance          |
| `bun run webui`                         | Standalone WebUI, without an Electron process   |
| `bun run package`                       | Build local renderer, preload, and main bundles |
| `bun run test`                          | Default fast source tests                       |
| `bun run test:dom`                      | DOM component and hook tests                    |
| `bun run test:integration`              | Integration tests                               |
| `bun run test:e2e`                      | Playwright E2E; see `tests/e2e/README.md`       |
| `bun run lint` / `bun run format:check` | Read-only static/style checks                   |

`package.json` owns the full command list. Build and distribution wrappers
are explained in `scripts/README.md`; local output is not App release evidence.
WebUI port, data isolation, and authentication are covered in
[WebUI](../guides/webui.md), and renderer inspection in [CDP](../guides/cdp.md).

## Isolation

`start:multi` sets `AIONUI_MULTI_INSTANCE=1`, bypasses the single-instance
lock, and uses the separate product development data/config paths selected by
`platform/index.ts` and `common/config/appEnv.ts`. Ports may advance when
occupied; use startup logs as the actual connection address.

Separate browser profiles avoid mixing cookies between WebUI instances. Do not
point two live backends at the same data directory. Test fixtures have their own
storage roots; developer paths must not become test or production defaults.

## Checks And Hooks

Choose tests for the changed caller and contract. Runtime, packaged, and
release acceptance are separate from a source test pass.

The optional prek hooks are configured in `.pre-commit-config.yaml`.
They can modify files: the formatter and whitespace/end-of-file hooks are
fixers. Review their resulting diff before committing. Use `lint` and
`format:check` for explicitly read-only checks.
