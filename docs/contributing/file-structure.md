# Source Ownership And Layout

This reference owns source placement and local naming. Development commands
belong in [Development](development.md), documentation lifecycle in
[the docs index](../README.md), and product/visual decisions in App contracts.

## Workspace Boundaries

| Path                              | Responsibility                                          |
| --------------------------------- | ------------------------------------------------------- |
| `packages/desktop/src/renderer/`  | React UI and browser APIs                               |
| `packages/desktop/src/process/`   | Electron/Node lifecycle, services, and transport        |
| `packages/desktop/src/common/`    | Shared contracts, configuration, and adapters           |
| `packages/desktop/src/preload.ts` | Isolated renderer-to-main IPC exposure                  |
| `packages/web-host/`              | Backend lifecycle, static/proxy serving, and WebUI host |
| `packages/web-cli/`               | Standalone CLI support and deployment input handling    |
| `packages/shared-scripts/`        | Shared build/resource preparation                       |
| `scripts/`                        | Repository command wrappers and qualification tools     |
| `tests/`                          | Source, DOM, integration, and E2E callers               |

Main-process code must not depend on DOM or React. Renderer code must not call
Node or Electron main APIs. Cross-process calls use the existing preload and
typed transport bridge. Backend HTTP APIs and Framework/App projections remain
their owners' contracts, not a second Shell state store.

## Local Conventions

Use PascalCase for React feature components and classes, camelCase for hooks
and utilities, `use` prefixes for hooks, and lowercase category directories.
Keep existing platform-specific module names. Follow the surrounding module's
exports rather than generating a new directory or wrapper for every file.

Place tests with the existing test family for the real caller. Prefer explicit
dependencies where they clarify IO and pure transformations. Source changes
must not add a fixed Package/Agent catalog, copy App profile policy, or recreate
removed backend service abstractions.

Components use Arco and the current App-owned visual adapter. The exact OPL icon
and style rules are in [AGENTS.md](../../AGENTS.md); inherited upstream style
guides do not override that boundary.
