# E2E Testing

This guide owns the Electron E2E environment and execution boundaries.
Executable test cases live under `specs/` and `features/`; historical
discussion and acceptance tables do not define current coverage.

## Prepare And Run

Tests launch prebuilt output rather than the Vite development server. Rebuild
after changing source:

```bash
bun run package
bun run test:e2e
```

For a focused test:

```bash
bunx playwright test --config playwright.config.ts tests/e2e/specs/app-launch.e2e.ts
```

Use the official unmodified AionCore release prepared by the Shell resource
toolchain. `fixtures.ts` selects available bundled runtime paths before the
remaining environment. A backend missing from that resolved environment causes
real HTTP tests to fail; building an OPL AionCore fork is not a setup step.

## Isolation And Lifetime

`fixtures.ts` owns one Electron instance per worker. `playwright.config.ts`
keeps `workers: 1` and disables full parallelism because tests share that
instance. Each launch sets a separate `AIONUI_E2E_STORAGE_ROOT` with data and
configuration directories, disables automatic updates and DevTools, and turns
off CDP. Storage isolation does not make arbitrary parallel test execution safe.

`E2E_PACKAGED=1` selects the packaged carrier; `E2E_DEV=1` forces the local
development carrier, and CI otherwise selects packaged mode. Both need the
appropriate built bytes. `AIONUI_E2E_ALLOW_BACKEND_FAILURE=1` is a bounded
renderer-only bypass, not proof that backend or App workflows pass.

## Write Tests Against Real Owners

Prefer HTTP-backed routes in `helpers/bridge/routes.ts` or the explicit HTTP
helpers. `invokeBridge` retains a fallback for actual remaining IPC callers;
do not invent an IPC provider for an HTTP-owned API. Read the actual route in
`packages/desktop/src/common/adapter/ipcBridge.ts` when diagnosing an endpoint.

Import the existing fixture and helpers. Assert visible results and backend
responses rather than a fixed delay. Use a disposable thread and explicit model
credentials for tests that submit inference. Mock a native dialog only at its
existing Electron boundary and restore or isolate mutated state.

Skipped scenarios must explain the actual missing behavior beside the test.
An inherited mapping or an old percentage-complete table is not proof that a
scenario remains impossible or is now passing.

## Results And Diagnostics

```bash
bunx playwright show-report tests/e2e/report
```

Artifacts belong under ignored `tests/e2e/results/` and `report/`.
For stale UI, verify the build; for blank pages, verify renderer output; for
bridge failures, inspect the resolved backend and current HTTP/IPC route.
Live inference latency requires condition-based waits, not repeated submissions.

These tests qualify only their selected carrier and source cohort. Packaged
runtime, real installation, public release, and App adoption remain separate
acceptance layers.
