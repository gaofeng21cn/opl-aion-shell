# AionUi Docs

Documentation is organized by reader intent, not by document type.

## Public Role

`opl-aion-shell` is the mainline GUI shell implementation for One
Person Lab App. It renders and tests App-owned GUI contracts and consumes
App/root canonical state. It does not own One Person Lab App product truth,
runtime truth, package truth, domain truth, release readiness, or owner
receipts; those stay with `one-person-lab-app`, One Person Lab Framework/root,
and the relevant domain repositories.

`opl-studio` is the DSH-derived candidate sibling, not a second App. Both
Shells implement the same App-owned Client Cordis/GUI contribution ABI and
Framework state/action projection; only `one-person-lab-app` selects the active
Shell and freezes the release composition.

The wider ecosystem remains `OPL Base + OPL App + OPL Packages + optional OPL
Cloud`. This repository implements one App Shell only. It neither installs nor
publishes Packages, hosts Cloud services, nor creates another Framework Host.

| Directory                       | For whom                 | What lives here                                                                                                               |
| ------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| [`guides/`](guides)             | Users & operators        | How to deploy, test, and run the product. Server deployment, WebUI, Hub testing, CDP debugging.                               |
| [`contributing/`](contributing) | Contributors             | Dev environment setup, file-structure conventions, PR automation workflow.                                                    |
| [`architecture/`](architecture) | Engineers & architects   | System architecture overview, subsystem deep-dives (ACP, queue, team mode), and supporting research notes.                    |
| [`history/`](history)           | Maintainers              | Historical intake records, cleanup notes, and old-branch batons that should not define current product truth.                 |
| `specs/` (when present)         | Engineering-driven specs | Feature design docs, requirements, implementation plans (ACP rewrite, extension market, remote agent, wake prompt, PR notes). |
| [`prds/`](prds)                 | Product team             | Formal Product Requirement Documents maintained by the product team. **Do not reorganize without their consent.**             |
| [`readme/`](readme)             | Global users             | Translated copies of the root `readme.md` (Chinese, Japanese, Korean, Spanish, etc.).                                         |

## Quick pointers

- New to the OPL integration? Start with [`guides/opl-app-shell-boundary.md`](guides/opl-app-shell-boundary.md).
- Setting up a dev environment? See [`contributing/development.md`](contributing/development.md).
- Working on One Person Lab App behavior? Read [`guides/opl-app-shell-boundary.md`](guides/opl-app-shell-boundary.md) before changing shell docs or implementation. This repository is a replaceable App-contract GUI implementation, not the owner of product strategy, runtime truth, model-selection policy, onboarding truth, domain routing, or release/user documentation.
- Working on OPL Package composition? The Shell only consumes the owner projection and authorized actions. Use the canonical App [OPL Package platform composition migration](https://github.com/gaofeng21cn/one-person-lab-app/blob/main/docs/active/opl-package-platform-composition-migration.md) as the product and migration SSOT; do not create a second Package lifecycle plan here.
- Writing code? The entry point for code-style, linting, formatting, and commit rules is [`AGENTS.md`](../AGENTS.md) at the repo root.
- Deploying a server? [`guides/deploy-server.md`](guides/deploy-server.md).

## Where to put new docs

| Content type                                               | Destination                 |
| ---------------------------------------------------------- | --------------------------- |
| User/ops-facing how-to                                     | `guides/`                   |
| Contributor convention, workflow, or tooling rule          | `contributing/`             |
| System or subsystem design, technical analysis             | `architecture/`             |
| Exploratory research, analysis reports                     | `architecture/research/`    |
| Historical branch intake or cleanup baton                  | `history/`                  |
| Feature requirements / design drafts driven by engineering | `specs/<feature-name>/`     |
| Formal PRD owned by product team                           | `prds/` (coordinate first)  |
| README translation                                         | `readme/readme_<locale>.md` |
