# Docs Portfolio Consolidation

This note records the active documentation boundaries for the OPL AionUi fork.
It is an index aid, not a new product contract.

## Active Surfaces

| Surface              | Boundary                                                                 |
| -------------------- | ------------------------------------------------------------------------ |
| Root `readme.md`     | Public AionUi README plus the OPL GUI shell section.                     |
| `docs/README.md`     | Main documentation index and placement guide.                            |
| `docs/architecture/` | Durable architecture notes and subsystem analyses.                       |
| `docs/contributing/` | Contributor setup, file structure, and PR automation rules.              |
| `docs/guides/`       | User and operator how-to guides.                                         |
| `docs/readme/`       | Localized public README copies. Keep these discoverable.                 |
| `docs/specs/`        | Engineering-owned requirements, designs, migration audits, and PR notes. |
| `docs/prds/`         | Product-owned PRDs. Coordinate before moving or rewriting.               |
| `package/README.md`  | Upstream package README for the packaged Claude Code payload.            |
| `scripts/README.md`  | Build, packaging, release, and OPL first-run smoke script guide.         |

## Archive Rule

Move a document to `docs/history/` only when it is both:

- superseded by a newer active doc or implementation truth, and
- a one-time process record rather than public entry material or durable design
  context.

Do not archive upstream localized README copies, product PRDs, or active
architecture/spec material just because they are inherited from upstream.

## Current Consolidation Outcome

The first consolidation pass clarified indexing and ownership boundaries without
moving files.

The second content-alignment pass archived the dated Team Mode performance
triage note from active architecture into `docs/history/`, because it is a
branch-specific process record rather than durable architecture guidance. Active
OPL shell ownership remains concentrated in `AGENTS.md`,
`docs/architecture/opl-gui-shell-maintenance.md`, `docs/guides/`, and
`docs/contributing/`.

The current repo-positioning and operations boundary for the OPL AionUI fork is
owned by `docs/architecture/opl-gui-shell-maintenance.md`. Keep fork/upstream
intake, release packaging, runtime bridge policy, and hygiene-scope decisions
there instead of scattering them across new one-off notes.
