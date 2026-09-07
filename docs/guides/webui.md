# Standalone WebUI Development

The Shell WebUI entry is `scripts/webui.ts`. It starts the official AionCore
backend and `@aionui/web-host` static/proxy/authentication services without
Electron or Xvfb. App and Cloud own supported deployment and public routing.

## Start A Local Instance

```bash
bun install
bun run webui
```

The launcher rebuilds renderer assets unless `--no-build`,
`AIONUI_NO_BUILD=1`, or `AIONUI_STATIC_DIR` explicitly selects an existing
build. The default static directory is `out/renderer`. A missing index fails
with a build instruction instead of serving an empty application.

| Mode                                       | Default port | Default backend data  |
| ------------------------------------------ | ------------ | --------------------- |
| Development                                | 25809        | `~/.aionui-web-dev`   |
| Development with `AIONUI_MULTI_INSTANCE=1` | 25810        | `~/.aionui-web-dev-2` |
| `NODE_ENV=production`                      | 25808        | `~/.aionui-web`       |

`--port` and `AIONUI_PORT` override the port; `--data-dir` and
`AIONUI_DATA_DIR` override backend storage. `AIONUI_STATIC_DIR` selects
renderer assets and `AIONUI_BACKEND_BIN` selects the official backend
executable. Use the startup log for the actual URL and keep simultaneous
instances on different data roots. WebUI defaults intentionally avoid Desktop
storage and CLI-safe symlink locations.

## Authentication And Remote Access

The default listener is local. `--remote`, `AIONUI_ALLOW_REMOTE`, or a
wildcard `AIONUI_HOST` can expose it beyond loopback. That switch alone does
not qualify a public deployment. App/Cloud must supply the accepted deployment
authentication, TLS, routing, and tenant boundary.

`packages/web-cli/src/deploymentAuth.ts` resolves the deployment mode and
credential inputs; `ensureAdminPassword.ts` provisions the administrator via
the backend. Keep passwords and session secrets out of commands, logs, and
source control. Read the corresponding deployment contract before exposing a
network listener.

`bun run resetpass` is a local administrator recovery tool. The current
implementation operates on the backend's default system user; a supplied
username is advisory and does not select arbitrary users. Recovery affects
persistent account state and must target the intended data root.

## Troubleshooting And Verification

Check the resolved backend binary, data directory, static index, bound address,
and backend/proxy logs separately. A browser login error is not evidence that
the renderer failed to build. Check actual user and session state before
resetting credentials.

```bash
bun run --cwd packages/web-host test
```

Package tests cover backend ownership, proxy/static serving, and host shutdown.
They do not prove public deployment, App release readiness, Cloud Workspace
activation, or installed user-data migration.
