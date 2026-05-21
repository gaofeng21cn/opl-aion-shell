# v26.5.15 Release Workflow History

Status: superseded history

On 2026-05-15, GitHub Actions recorded two obsolete release-path failures on
the archived `v26.5.15` shell topology:

- `Build and Release`, run `25912331229`, event `push`, branch `v26.5.15`,
  commit `e939e42792b9ef845d92d6e510a87aff559c7a79`.
- `Distribute Release Assets`, run `25912331087`, event `release`, branch
  `v26.5.15`, commit `e939e42792b9ef845d92d6e510a87aff559c7a79`.

Those runs came from the archived nested-topology branch, where
`.github/workflows/build-and-release.yml` still handled tag/dev release
publishing and `.github/workflows/release-distribute.yml` still mirrored release
assets after GitHub Release publication.

Current truth:

- `opl-aion-shell` is the AionUI shell adapter consumed by
  `one-person-lab-app`.
- App release ownership, release publishing, release distribution, and App-owned
  product defaults live in `one-person-lab-app`.
- The shell repo may keep local build, test, packaging, and manual diagnostic
  scripts, but it must not auto-publish GitHub Releases or distribute release
  assets from scheduled, tag, or release-event workflows.
- Future release-health checks must not count the v26.5.15 failures above as
  current App release failures.

The repo-native guard is `scripts/structure/release-workflow-policy.mjs`, which
is also run through `bun run hygiene`. It fails if retired shell release
workflows or automatic release publishing/distribution triggers are
reintroduced.
