# AionUi Docs

Documentation is organized by reader intent, not by document type.

This checkout is the One Person Lab fork of AionUi. The OPL product mainline is
`gaofeng/main`; upstream AionUi material remains useful, but OPL product work
starts from the OPL fork boundary described in [`../AGENTS.md`](../AGENTS.md).
As of 2026-05-15, this local checkout tracks `main...gaofeng/main`; `origin/main`
is the upstream AionUi input, not the OPL product baseline.

## Active OPL Entry Points

| Entry point                                                                              | Use when                                                                                      |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [`../readme.md`](../readme.md)                                                           | Reading the public AionUi / OPL GUI shell overview.                                           |
| [`architecture/opl-gui-shell-maintenance.md`](architecture/opl-gui-shell-maintenance.md) | Maintaining OPL fork overlay, runtime boundary, packaging policy, or upstream intake posture. |
| [`../AGENTS.md`](../AGENTS.md)                                                           | Starting repo work, checking remote boundaries, coding conventions, and PR workflow rules.    |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md)                                               | Preparing a contributor PR and local checks.                                                  |
| [`docs_portfolio_consolidation.md`](docs_portfolio_consolidation.md)                     | Understanding how the docs portfolio is organized and what should move to history.            |
| [`contributing/file-structure.md`](contributing/file-structure.md)                       | Checking repository hygiene, root layout, and file placement rules.                           |

## Documentation Map

| Directory                        | For whom                 | What lives here                                                                                                               |
| -------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| [`guides/`](guides/)             | Users & operators        | How to deploy, test, and run the product. Server deployment, WebUI, Hub testing, CDP debugging.                               |
| [`contributing/`](contributing/) | Contributors             | Dev environment setup, file-structure conventions, PR automation workflow.                                                    |
| [`architecture/`](architecture/) | Engineers & architects   | System architecture overview, subsystem deep-dives (ACP, queue, team mode), and supporting research notes.                    |
| [`specs/`](specs/)               | Engineering-driven specs | Feature design docs, requirements, implementation plans (ACP rewrite, extension market, remote agent, wake prompt, PR notes). |
| [`prds/`](prds/)                 | Product team             | Formal Product Requirement Documents maintained by the product team. **Do not reorganize without their consent.**             |
| [`readme/`](readme/)             | Global users             | Translated copies of the root `readme.md` (Chinese, Japanese, Korean, Spanish, etc.). Do not archive these translations.      |
| [`history/`](history/)           | Maintainers              | Archived one-time process notes after their active guidance is superseded.                                                    |

## Boundary Notes

- **OPL fork active docs** live in the root `readme.md`, `AGENTS.md`, and targeted
  OPL architecture notes. Keep them current with `gaofeng/main`.
- **Architecture docs** describe durable system behavior or subsystem analysis.
  Place exploratory reports under `architecture/research/` until they are
  either promoted into an active architecture note or archived.
- **Contributing docs** define contributor workflow and file/code conventions.
  They should stay aligned with root `CONTRIBUTING.md`.
- **Guides** are operator/user how-tos. Keep them practical and link to the
  current root README or localized README copies when needed.
- **Localized README files** under `readme/` are public entry material inherited
  from upstream AionUi and should remain discoverable.
- **Package and scripts docs** are outside the main docs tree but part of the
  docs portfolio: `../package/README.md` is the upstream package README for the
  packaged Claude Code payload, while `../scripts/README.md` documents build,
  packaging, release, and OPL first-run smoke scripts.
- **Repository hygiene** is documented in
  [`contributing/file-structure.md`](contributing/file-structure.md) and enforced
  by `bun run hygiene`. This fork does not add broad line-budget gates over
  upstream-owned source and test files.

## Quick pointers

- New to the project? Start with [`architecture/overview.md`](architecture/overview.md).
- Maintaining OPL-specific shell behavior? Start with [`architecture/opl-gui-shell-maintenance.md`](architecture/opl-gui-shell-maintenance.md).
- Setting up a dev environment? See [`contributing/development.md`](contributing/development.md).
- Writing code? The entry point for code-style, linting, formatting, and commit rules is [`AGENTS.md`](../AGENTS.md) at the repo root.
- Deploying a server? [`guides/deploy-server.md`](guides/deploy-server.md).

## Where to put new docs

| Content type                                               | Destination                 |
| ---------------------------------------------------------- | --------------------------- |
| User/ops-facing how-to                                     | `guides/`                   |
| Contributor convention, workflow, or tooling rule          | `contributing/`             |
| System or subsystem design, technical analysis             | `architecture/`             |
| Exploratory research, analysis reports                     | `architecture/research/`    |
| Feature requirements / design drafts driven by engineering | `specs/<feature-name>/`     |
| Formal PRD owned by product team                           | `prds/` (coordinate first)  |
| README translation                                         | `readme/readme_<locale>.md` |
| Superseded one-time process notes                          | `history/`                  |
