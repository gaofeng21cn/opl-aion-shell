# OPL Aion Shell Documentation

This repository implements the AionUI carrier for One Person Lab App.
App contracts own product behavior, model policy, supported platforms, and
release/adoption. Framework owns runtime and Package state. Studio owns a
separate DSH/Cordis Application Host; neither carrier owns the other's internals.

## Current Implementation References

| Reader task                                | Owner document                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| Understand Shell integration and authority | [App/Shell boundary](guides/opl-app-shell-boundary.md)                        |
| Start development and select checks        | [Development](contributing/development.md)                                    |
| Place source in the repository             | [File structure](contributing/file-structure.md)                              |
| Debug the desktop renderer                 | [CDP](guides/cdp.md)                                                          |
| Run and diagnose standalone WebUI          | [WebUI](guides/webui.md)                                                      |
| Test Hub UI transport                      | [Hub testing](guides/hub-testing.md)                                          |
| Understand theme application               | [Theme implementation](theming/tokens.md)                                     |
| Inspect the disposable WSL2 fixture        | [Validation harness](architecture/windows-wsl2-validation-runtime-harness.md) |
| Understand accepted upstream changes       | [Upstream intake history](history/)                                           |

[AGENTS.md](../AGENTS.md) owns working rules and [CONTRIBUTING.md](../CONTRIBUTING.md)
owns the contribution entry. Source-adjacent references explain only their
module; executable scripts and tests own command details.

## Upstream Material

Root `CHANGELOG.md` retains AionUI release provenance.
Superseded PRDs, marketing translations, startup plans, and theme migration
catalogs remain in Git history. They do not define OPL support or compatibility.
Original source identity is recorded in `contracts/aionui-upstream-intake.json`.
Read current source and App contracts before using any historical feature claim.

Inherited automation Skills, daemon scripts, and specification templates have
left the active discovery surface. Their original bytes remain in Git history;
current working rules live in `AGENTS.md` and contributor guidance.

## Lifecycle

Each current reference has one reader task. Change that owner when behavior
changes and link to it elsewhere instead of copying a catalog or rule set.
New references need a distinct task and an entry above; product requirements
belong in App and domain requirements belong with the domain owner.

Completed plans and incremental checklists leave the active corpus once current
guarantees are absorbed into source and the owning reference. Keep history only
when its provenance or rationale prevents a plausible regression. Ordinary
execution logs, old screenshots, and superseded version inventories remain in
Git history, not an active roadmap. An old module or command named in upstream
history gains no compatibility obligation.

Retiring or moving a reference includes transferring unique current guarantees
and fixing inbound links. Mechanical checks cover paths, links, schemas, licenses,
and executable examples; prose meaning and responsibility require source review.
