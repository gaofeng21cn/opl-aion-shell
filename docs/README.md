# OPL Aion Shell Documentation

This repository implements the AionUI carrier for One Person Lab App.
App contracts own product behavior, model policy, supported platforms, and
release/adoption. Framework owns runtime and Package state. Studio owns a
separate DSH/Cordis Application Host; neither carrier owns the other's internals.

## Current Implementation References

| Reader task                                | Owner document                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| Understand Shell integration and authority | [App/Shell boundary](guides/opl-app-shell-boundary.md)                 |
| Start development and select checks        | [Development](contributing/development.md)                             |
| Place source in the repository             | [File structure](contributing/file-structure.md)                       |
| Debug the desktop renderer                 | [CDP](guides/cdp.md)                                                   |
| Run and diagnose standalone WebUI          | [WebUI](guides/webui.md)                                               |
| Test Hub UI transport                      | [Hub testing](guides/hub-testing.md)                                   |
| Understand theme application               | [Theme implementation](theming/tokens.md)                              |
| Understand Windows WSL2 execution          | [Windows WSL2 runtime](architecture/windows-wsl2-runtime-execution.md) |

[AGENTS.md](../AGENTS.md) owns working rules and [CONTRIBUTING.md](../CONTRIBUTING.md)
owns the contribution entry. Source-adjacent references explain only their
module; executable scripts and tests own command details.

## Upstream Material

Root `CHANGELOG.md` retains AionUI release provenance. Superseded PRDs,
marketing translations, startup plans, and theme migration catalogs remain in
Git history and do not define OPL support or compatibility. Original source
identity is recorded in `contracts/aionui-upstream-intake.json`; accepted-change
provenance is in the [upstream intake history](history/README.md). Read current
source and App contracts before relying on any historical feature claim.

## Lifecycle

Document ownership, lifecycle, and retirement rules belong to the family policy
at `one-person-lab/docs/policies/docs-lifecycle-policy.md`. This index only maps
current reader tasks: each current reference has one reader task, new references
need a distinct task and an entry above, and product or domain requirements stay
with their App or domain owner.
