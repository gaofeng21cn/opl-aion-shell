# Windows WSL2 Validation Runtime Harness

Status: `validation_only_non_binding`

This is a Shell-local developer harness for the disposable
`OPL-Validation-g0001` fixture. It does not declare Windows support, alter the
App product contract, select an installer format, or participate in release
builds.

## Activation

The adapter is absent unless both conditions are true:

- Electron main process is running on `win32`.
- `OPL_WINDOWS_WSL2_VALIDATION=1` is explicitly set by the developer.

`OPL_WINDOWS_WSL2_VALIDATION_DISTRIBUTION` can select another disposable
fixture only when its name stays inside the `OPL-Validation-<fixture>`
namespace. The default remains `OPL-Validation-g0001`. Existing user
distributions and `docker-desktop` cannot be named by this harness.

## Command Boundary

`packages/desktop/src/process/backend/wsl2ValidationRuntime.ts` only creates
structured direct-child commands. Its fixed forms are:

```text
wsl.exe --distribution OPL-Validation-g0001 --exec /opt/opl/bootstrap/opl-runtime-inspect --json
wsl.exe --distribution OPL-Validation-g0001 --exec /opt/opl/bootstrap/opl-runtime-exec --kind <fixed-kind> --operation-token <validated-token>
wsl.exe --distribution OPL-Validation-g0001 --exec /opt/opl/bootstrap/opl-runtime-control --operation-token <validated-token>
```

It never accepts a host executable, a guest executable, a shell string, or
unrestricted arguments. The `kind` is restricted to `aioncore`,
`codex-app-server`, or `opl-cli`. The renderer has no import or IPC access to this
module; callers receive redacted command descriptions for receipts, while the
operation token is retained only in the structured argv used for the direct
child.

## Current Integration Decision

The harness is intentionally not wired into the normal `BackendLifecycleManager`,
Codex App Server transport, or `oplRuntimeBridge` startup path. Those seams
currently resolve and spawn native executable paths independently. Redirecting
only one of them would split AionCore, Codex, and Framework identity and would
violate the WSL2 validation blueprint.

A later, separately authorized implementation must replace all three through
one selected lifecycle adapter, then add main-process IPC projections with no
guest PID, credential, arbitrary command, or Node API exposure to the renderer.
Until then this harness is used only by focused developer tests and an owned
VM validation runner after that VM's single-write lease is granted.
