# Contributing To OPL Aion Shell

[中文](CONTRIBUTING.zh.md)

This repository implements the AionUI carrier. Read [AGENTS.md](AGENTS.md)
and the [App/Shell boundary](docs/guides/opl-app-shell-boundary.md) before a
change. Product policy and release authority remain in One Person Lab App;
AionCore is an official, unmodified dependency.

Keep each change coherent and reviewable. Separate unrelated fixes; include
the behavior, real caller, and relevant verification in the PR. Source tests,
a package, and public release each prove different things.

Use [Development](docs/contributing/development.md) for setup and test
selection. The optional prek hooks can format and repair files; they are not
a read-only validation command. Review the resulting diff before committing.

Follow the current repository/maintainer workflow for review and merge. Retired
upstream automation instructions do not grant permission to publish.

Update the owning document when behavior changes. Remove obsolete procedures
and repair inbound links according to [the documentation lifecycle](docs/README.md).
