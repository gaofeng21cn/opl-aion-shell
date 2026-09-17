# Windows WSL2 Runtime Execution

Owner: `opl-aion-shell` implements the execution port; the supported host,
distribution policy, release boundary, and platform claims belong to One Person
Lab App `contracts/app-windows-wsl2-execution.json`.
Purpose: `windows_wsl2_execution_and_validation_boundary`
State: the product execution boundary below is active; the disposable
`OPL-Validation-<fixture>` harness stays `validation_only_non_binding`.

## Product Execution Boundary

On supported Windows x64 hosts the App runs the agent and Framework plane inside
a dedicated `OPL-Linux` WSL2 distribution. Native Windows AionCore, Codex, or
Framework processes are not a fallback, and a guest identity mismatch is a typed
blocker rather than a silent switch back to the host.

`packages/desktop/src/index.ts` initializes `WindowsWslRuntimeExecution` with its
provisioning window and injects the same runtime into the backend process
controller, the Codex App Server transport, and `oplRuntimeBridge`, so all three
seams resolve one guest identity:

- distribution `OPL-Linux`, guest user `opl`, Codex home `/home/opl/.codex`,
  workspace root `/home/opl/code`;
- structured `wsl.exe --distribution OPL-Linux --user opl --exec <guest entrypoint>`
  direct-child commands built by
  `packages/desktop/src/process/services/runtime-execution/windowsWslRuntimeExecution.ts`;
- packaged guest entrypoints from `resources/opl-linux/bootstrap/`:
  `opl-runtime-inspect`, `opl-runtime-exec`, and `opl-runtime-control`;
- allowed programs `aioncore`, `codex-app-server`, and `opl-cli`; every execute
  and control call carries a validated per-operation token, and receipts keep
  only the redacted command form.

`packages/desktop/src/process/services/windows-wsl/provisioner.ts` owns the staged
provisioning and repair flow (`checking_host`, `enabling_wsl`,
`restart_required`, `installing_owned_distribution`, `initializing_guest`,
`activating_owner_artifacts`, `validating_routes`, `ready`, `repair_required`,
`blocked_by_policy`, `cancelled`). Long stages report bounded progress and elapsed
time, the flow resumes after a required restart, partial results are reconciled
before a retry, and only the App-owned setup surface may raise the Windows
feature UAC prompt. Provisioning writes an
`opl_windows_wsl2_provisioning_receipt.v1` receipt.

Existing user distributions, the default distribution, and `docker-desktop` are
never renamed, mutated, or adopted. The App contract forbids deleting unknown
user data, running a global WSL shutdown, and unregistering the distribution
without explicit user removal. Workspace paths are projected into the guest
before guest processes use them, and this transport accepts no host executable,
guest executable, shell string, or unrestricted arguments.

`opl-runtime-inspect` returns `opl_linux_runtime_inspection.v1` with the
distribution generation, guest install id, and carrier, bootstrap, AionCore,
Codex, and Framework digests. That readback is the identity evidence for the
routes above and fails closed on a mismatch. Publishing Windows updater assets
and claiming Windows support remain App release decisions: a published asset
does not prove installed WSL2 runtime acceptance.

## Disposable Validation Fixture

`packages/desktop/src/process/backend/wsl2ValidationRuntime.ts` and the
`packages/desktop/src/validation/windows-wsl2/` app remain a developer-only
harness for a disposable `OPL-Validation-<fixture>` distribution. They are not
the product execution route and authorize no standalone Windows RC release.

The adapter is absent unless the main process runs on `win32` and
`OPL_WINDOWS_WSL2_VALIDATION=1` is explicitly set by the developer.
`OPL_WINDOWS_WSL2_VALIDATION_DISTRIBUTION` can select another disposable fixture
only when its name stays inside the `OPL-Validation-<fixture>` namespace; the
default is `OPL-Validation-g0001`. It still builds only these structured
direct-child forms:

```text
wsl.exe --distribution OPL-Validation-g0001 --exec /opt/opl/bootstrap/opl-runtime-inspect --json
wsl.exe --distribution OPL-Validation-g0001 --exec /opt/opl/bootstrap/opl-runtime-exec --kind <fixed-kind> --operation-token <validated-token>
wsl.exe --distribution OPL-Validation-g0001 --exec /opt/opl/bootstrap/opl-runtime-control --operation-token <validated-token>
```

The `kind` stays restricted to `aioncore`, `codex-app-server`, or `opl-cli`, and
existing user distributions and `docker-desktop` cannot be named by this
harness. Callers receive redacted command descriptions for receipts, while the
operation token stays only in the structured argv used for the direct child. The
renderer has no import or IPC access to this module.
