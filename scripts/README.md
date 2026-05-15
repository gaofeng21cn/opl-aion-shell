# Build And Maintenance Scripts

This directory contains build, packaging, release, benchmark, i18n, automation,
and OPL first-run smoke scripts for the One Person Lab App `aionui` shell adapter.

The build scripts are part of the OPL shell surface consumed by the clean App
repo. Start shell changes from `origin/main`; use upstream `upstream/main` only
as an explicit AionUI intake source.

## Current Build Scripts

| Script                             | Purpose                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `build-with-builder.js`            | Coordinates electron-vite output, electron-builder packaging, DMG retry, packaged-runtime validation, and release asset preparation. |
| `rebuildNativeModules.js`          | Shared native module rebuild helper used by packaging hooks.                                                                         |
| `afterPack.js`                     | electron-builder hook that rebuilds or verifies packaged native modules when target platform/architecture requires it.               |
| `afterSign.js`                     | macOS code-signing and notarization hook.                                                                                            |
| `prepare-release-assets.sh`        | Collects release artifacts after packaging.                                                                                          |
| `verify-release-assets.sh`         | Verifies release artifact structure and expected files.                                                                              |
| `create-mock-release-artifacts.sh` | Creates local mock release artifacts for workflow testing.                                                                           |
| `validate-packaged-runtime.js`     | Validates packaged runtime contents after build output is produced.                                                                  |

`beforeBuild.js` and `release.sh` are no longer active scripts in this tree.
Native rebuild work is coordinated by `afterPack.js` and
`rebuildNativeModules.js`, with electron-builder native rebuilds disabled in
`electron-builder.yml`.

## Build Flow

```
bun run dist:* / bun run build-*
  -> scripts/build-with-builder.js
     -> optional electron-vite build
     -> electron-builder
        -> scripts/afterPack.js
        -> scripts/afterSign.js on macOS
     -> packaged runtime validation
     -> release asset preparation
```

`build-with-builder.js` supports these important modes:

| Mode            | Use when                                                     |
| --------------- | ------------------------------------------------------------ |
| `--skip-vite`   | Reusing an existing `out/` renderer/main/preload build.      |
| `--force`       | Forcing a rebuild even when the incremental hash matches.    |
| `--skip-native` | Skipping native rebuild handling for a controlled local run. |
| `--pack-only`   | Creating the packaged app without distributable artifacts.   |

## Native Module Strategy

The packaged app carries native modules such as `better-sqlite3`. The current
strategy is:

- electron-builder's built-in native rebuild knobs are disabled in
  `electron-builder.yml`.
- `afterPack.js` checks the target platform and architecture.
- Same-architecture macOS/Linux builds normally skip rebuild unless
  `FORCE_NATIVE_REBUILD=true` is set.
- Windows rebuilds `better-sqlite3` to match the Electron ABI.
- Cross-architecture builds clean wrong-architecture artifacts before rebuilding
  or installing prebuilt binaries.
- `rebuildNativeModules.js` prefers prebuilt binaries where appropriate and uses
  `vx` toolchain prefixes when available.

## Common Build Commands

```bash
# Current platform distributable
bun run dist

# macOS universal release artifact
bun run build-mac

# Explicit macOS targets
bun run build-mac:universal
bun run build-mac:arm64
bun run build-mac:x64

# Windows and Linux targets
bun run build-win
bun run build-deb
```

## Troubleshooting

### Packaged app cannot load a native module

Check that:

1. The module is included in `electron-builder.yml` `files`.
2. The module is included in `asarUnpack` when required.
3. `afterPack.js` ran for the target platform/architecture.
4. The packaged app does not contain stale wrong-architecture `build/` or `bin/`
   native artifacts.

### Cross-architecture build fails

Use the current target-specific path:

- macOS: prefer the universal build path for user-facing release artifacts.
- Windows: ensure the MSVC toolchain is available; `vx --with msvc` is used when
  present.
- Linux: prefer prebuilt binaries for cross-architecture native modules.

## Automation And Diagnostics

| Script                     | Purpose                                 |
| -------------------------- | --------------------------------------- |
| `pr-automation.sh`         | PR review/fix/merge daemon entry point. |
| `fix-issues-daemon.sh`     | Local issue-fix daemon wrapper.         |
| `fix-sentry-daemon.sh`     | Local Sentry-fix daemon wrapper.        |
| `benchmark-startup.ts`     | Startup benchmark harness.              |
| `benchmark-acp-startup.ts` | ACP startup benchmark harness.          |
| `run-benchmarks.ts`        | Benchmark runner and report generator.  |
| `check-i18n.js`            | i18n consistency check.                 |
| `generate-i18n-types.js`   | i18n type generation.                   |
| `build-server.mjs`         | Standalone server build helper.         |
| `build-mcp-servers.js`     | MCP server build helper.                |

## OPL First-Run VM Smoke

The packaged OPL first-run test has two layers:

- `scripts/opl-first-run-vm-smoke.mjs` runs inside a clean macOS GUI session. It
  installs a real `.dmg` or opens a packaged `.app`, checks stable accessibility
  labels, enters a test Codex API key through the standalone first-run wizard
  when Codex config is missing, and collects `first-run.jsonl`,
  `opl system initialize --json`, `opl modules`, wizard/final screenshots, and
  unified logs.
- `scripts/opl-first-run-tart-smoke.mjs` runs on a self-hosted Mac with Tart. It
  clones a clean VM snapshot, copies the release DMG, guest smoke script, and an
  ephemeral test Codex API key file into the VM over SSH, runs the guest smoke,
  copies artifacts back, then stops and deletes the temporary VM.

Nightly execution is wired through `.github/workflows/opl-first-run-vm.yml`.
Configure the self-hosted runner with labels from `OPL_FIRST_RUN_RUNNER_LABELS`
or the default `["self-hosted","macOS","opl-gui-vm"]`, set
`OPL_FIRST_RUN_TART_SOURCE` to a clean macOS Tart base VM, and ensure the guest
user has SSH, Node.js, a logged-in desktop session, and Accessibility permission
for `osascript`/System Events.

Use `--codex-api-key-file <path>` or `OPL_FIRST_RUN_CODEX_API_KEY_FILE` when a
specific test key is required. Do not pass API keys as command-line values; the
scripts only pass a file path, record `codex_api_key_present`, and fail if
collected text artifacts contain the key.
