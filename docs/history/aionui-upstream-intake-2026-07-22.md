# AionUI upstream intake - 2026-07-22

Machine receipt: `contracts/aionui-upstream-intake.json`. The receipt is the
offline currentness and managed-runtime projection boundary; this document
retains the human classification rationale.

## Review update - 2026-08-04

Official stable `v2.1.46`
(`0f7635b2f8a62e0a757eff60aea210e502726f92`) was published at
`2026-08-03T14:36:44Z` and reviewed through the stable-only intake path. The
range from `v2.1.42` contains 35 commits. Its broad product surface remains
`reviewed_deferred`; the absorbed release remains `v2.1.39`.

Shell commit `8b8029f3fd0f94a8dcacc2f6f96bc0e4f562c82a` replays only three scoped
behaviors against the OPL overlay:

- `1a6be8e7c9`: accept `Tab` as an alternative to `Enter` for the active SendBox
  `@` file result. The upstream Explorer reveal/highlight portion is redirected
  because the current OPL fork has no matching `ExplorerPanel.tsx` authority.
- `5bfff048d4`: reconcile resource-level install-integrity failures for 15 seconds
  so a self-healed Node runtime retracts the modal and suppresses a false report.
- `342997704c`: consume `AIONCORE_READY`, distinguish slow-but-alive startup from
  a later exit, and switch the top-level renderer surface dynamically. The
  ordinary router still does not restore the retired `/startup-gate` route.

The final upstream bump `0f7635b2f8` is only partially accepted as release
evidence. AionCore `v0.1.57` had already been independently bound on Shell main
by `f6f5c1b258c7d8e92918d7ba37b3641d1080ac5b` from official release assets.
The receipt explicitly keeps `source_fork=forbidden`; this intake creates no
AionCore fork and imports no AionCore source changes. Its managed Codex CLI
binding remains `@openai/codex@0.144.6`.

### Stable commit disposition

Every commit in `v2.1.42..v2.1.46` is accounted for once below. `Rejected`
means it is not an OPL Shell intake input; it is not a judgment on upstream
quality.

| Disposition            | Count | Upstream commits                                                                                                                                                       | OPL reason                                                                                                                                                                    |
| ---------------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adapted                |     3 | `1a6be8e7c9`, `5bfff048d4`, `342997704c`                                                                                                                               | Replayed as the scoped SendBox, runtime self-heal, and backend startup adaptations described above.                                                                           |
| Partial accept         |     1 | `0f7635b2f8`                                                                                                                                                           | Records the reviewed stable tag and the already-authoritative official AionCore `v0.1.57` pin; does not import upstream product version or changelog.                         |
| Redirected             |    12 | `1df07e96c9`, `26a2e72e8f`, `6998dc42c0`, `2220d6da26`, `14e189e0f2`, `5f808f05b3`, `584fdcf4de`, `1204ffa88c`, `4edea7c5d8`, `c213c76526`, `59e1416bb2`, `083d85f8e3` | File picking, Explorer/search/preview, Pet, tray, Guid/model, and update-channel behavior require their OPL App or existing adapter owner rather than direct upstream intake. |
| Deferred               |    12 | `bf1f9c9ab3`, `6d819d6dfd`, `922fbac2fb`, `00c37fa527`, `20403d27cb`, `4879b7bbd8`, `1a2dee33d4`, `6e01c88874`, `d768ba550f`, `303bc88996`, `72784fe4f1`, `cab369535e` | Team warmup, conversation telemetry/timers, WebUI refetch, preview, Antigravity, and related cleanup are behavior-relevant but are not authorized by this intake.             |
| Rejected or superseded |     7 | `8544097190`, `1593db41a1`, `247f9c9f17`, `f541640bce`, `5ec74f8dfb`, `f37a6187f0`, `2bca547018`                                                                       | Merge/test-only commits and intermediate release/AionCore bumps do not define an independent OPL projection after `v2.1.46`.                                                  |

## Review update - 2026-07-29

Official stable `v2.1.42`
(`7ee90c13e96393491586abe9b12f7d5c7da9ee59`) was reviewed. Its broad product
surface remains `reviewed_deferred`; the absorbed release remains `v2.1.39`.
OPL selectively replays only the direct-CLI managed-resource contract introduced
by `4d6949780f81aa6fe2b4f3d348e1513b817e094c` and the `v0.1.53` AionCore pin,
while retaining the App-authoritative conversation and workspace overlays.

Official AionCore `v0.1.53`
(`1644ef26c168e8002dcfa53ccd333054b40697d6`) was reproduced with the same
`prepare-managed-resources --bundle-out` path used by Shell packaging. The
result is schema v2 and contains direct Claude and Codex CLIs rather than the
retired ACP bridge:

- darwin-arm64 archive SHA-256: `57b92b3de046717c7980d2c345d335e2513af514621fcbfff8a3e7cf16f8b7f6`
- root managed manifest SHA-256: `0a3e1496e0ba6ca1bf522bfe1945e388e7bd4d51ac64ada43ba85ec99e98cd44`
- Node `24.11.0` binary SHA-256: `8d66cad090d087ed8fac66d8f7248c8a9a55454680232a6d109f609aa2decf89`
- Claude `2.1.215` binary SHA-256: `90608b5c5ab504e96e77365cea6203d046e291d59b2bb42cf28dcb2ccdf9dd58`
- Codex `0.144.6` binary SHA-256: `80a3933d11a9d13ef806aa24f7bb8afc9169cfe4e9b09d6da6a92922cbde9cff`

The package verifier requires that exact schema/version/path cohort and rejects
legacy `managed-resources/acp` bytes. A local AionCore binary used for the
conversation-resume repair remains a separate development source identity; the
install receipt must bind its exact commit and tree and may not reuse this
official archive identity.

## Review update - 2026-07-27

The earlier official stable range from `v2.1.39`
(`1b215f2fcb9d220bc66bf3b4961835ded07d5797`) through `v2.1.41`
(`2d8925fc67a97a20996fadcd2a0862b778b572ba`) was reviewed. The range changes
180 files with 7,405 insertions and 1,782 deletions. It includes the direct-CLI
session path, permission and team lifecycle UI changes, assistant ordering,
desktop completion notifications, keyboard shortcuts, and AionCore upgrades
through `v0.1.52`.

The disposition is `reviewed_deferred`. These changes cross the OPL App product
contract, managed-runtime identity, and preserved Shell overlay boundaries, so
they are not absorbed as a broad upstream merge. The absorbed release remains
`v2.1.39`; the later direct-CLI runtime intake is recorded separately above and
does not authorize a broad upstream merge.

## Authority

- Shell candidate base: `201f338604299caaf1deaf94995fa176393c1165`.
- AionUI source range: `v2.1.38` (`4fac22b6ee7b5b59b8d2d89ec30b998029e35ff8`) to `v2.1.39` (`1b215f2fcb9d220bc66bf3b4961835ded07d5797`).
- AionCore source range: `v0.1.49` (`08c1b2f30b7cdc7785624df935aa31d314786999`) to official `v0.1.57` (`4452a3a72ebb612f3ddd4402aeb5542187a6fbdf`).
- Official AionCore darwin-arm64 archive SHA-256: `f972bb29fbbf01f3b74181e0dfc468cc96b4929e987f5a45b7916d558055c401`.

The official `aioncore 0.1.57` binary is bound through the same `--data-dir` and `prepare-managed-resources` contract used by the Shell. Its output is the managed-resource authority:

- managed-resource schema: `2`
- direct Claude package: `@anthropic-ai/claude-code@2.1.215`
- direct Codex package: `@openai/codex@0.144.6`
- darwin-arm64 Codex binary SHA-256: `80a3933d11a9d13ef806aa24f7bb8afc9169cfe4e9b09d6da6a92922cbde9cff`
- binary readback: `codex-cli 0.144.6`

The verifier consumes the schema v2 managed manifest and checks the exact
AionCore-pinned Node/CLI identity and paths. It does not accept a parallel ACP
truth.

## Accepted source manifest

| Source                                     | Classification           | Target projection                                                                                                                                                                          |
| ------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cd96b28343704f1b5b3f920d0b2c213193c5ec24` | Accept                   | Override Streamdown headings so rerenders cannot retain stale text; add DOM regression coverage.                                                                                           |
| `f5488dc9c125e1c2da74eb7534ac2996f07c248c` | Accept with OPL overlays | Gate Electron backend startup on the single-instance lock, retry only the peer-already-running boundary, classify transient contention, and route it through OPL restart/support recovery. |
| `1b215f2fcb9d220bc66bf3b4961835ded07d5797` | Partial accept           | Move only `aioncoreVersion` to `v0.1.50`. Keep the OPL package name and product version, and do not copy the upstream changelog.                                                           |
| `4d6949780f81aa6fe2b4f3d348e1513b817e094c` | Partial accept           | Replay only the schema v2 direct-CLI bundle/verifier contract; retain OPL conversation and product overlays.                                                                               |
| `7ee90c13e96393491586abe9b12f7d5c7da9ee59` | Partial accept           | Move only `aioncoreVersion` to `v0.1.53`; do not absorb the full upstream release body.                                                                                                    |
| `1a6be8e7c9de472831d0c85434a03c2011fc14f2` | Adapt                    | Replay only SendBox `@` result acceptance on `Tab`; redirect Explorer reveal/highlight to the App/Explorer owner.                                                                          |
| `5bfff048d402351f171fa424aa3796dc760bbf03` | Adapt                    | Reconcile self-healed installation-integrity failures at resource scope before reporting.                                                                                                  |
| `342997704cd1ff7e70d34271d4049996a8276443` | Adapt                    | Add `AIONCORE_READY` and lifecycle-driven slow-start/exit handling without restoring the retired route.                                                                                    |
| `0f7635b2f8a62e0a757eff60aea210e502726f92` | Partial accept           | Record stable `v2.1.46` and retain the separately landed official AionCore `v0.1.57` authority; do not copy upstream package version/changelog.                                            |

The target projection preserves the ordinary OPL router behavior and adds only a top-level backend lifecycle gate; `/startup-gate` remains retired. Only `en-US` and `zh-CN` product locales are maintained. `i18n-keys.d.ts` is regenerated from the implementation checkout and must be regenerated again after fresh-main replay if the locale authority changes.

## Core and package projection

- `package.json`: `aioncoreVersion` is `v0.1.57`; the OPL package version is unchanged by this intake.
- `bun.lock`: byte-identical. Managed Node/CLI packages are prepared by AionCore and do not belong in the Shell workspace lock.
- Claude and Codex versions come only from AionCore's schema v2 contract and direct-CLI source pins.
- Legacy `codex-acp` bytes are rejected instead of being accepted as an alternate runtime.

## Deferred or redirected changes

- Agent repair, npx launch-path/banner, and ACP empty-turn auth work remain owned by the already-landed MCP/Agent bridge intake.
- Workspace layout/refactor work is deferred because OPL carries product-specific workspace overlays.
- Feedback routing, model/provider placement, and capability policy are App product-contract concerns and are not absorbed in this Shell intake.
- The arrow-up command icon conflicts with the OPL text-command policy and is not absorbed.
- GitHub workflows, campaign assets, QR content, broad docs, and upstream release branding are not OPL Shell product inputs.

## Preserved overlays

- One Person Lab package identity, product copy, release flow, and two-locale policy.
- Gateway, MCP, Agent bridge, managed catalog, and selector behavior.
- P0 Full runtime and VM smoke semantics.
- OPL startup recovery actions and GitHub support issue routing.

## Finalization contract

The candidate must pass focused Core/resource, startup, web-host, and Markdown DOM tests, followed by the repository unit/DOM, typecheck, lint, format, i18n, and active-shell gates. Before integration it must be replayed on fresh remote `main`, regenerate i18n types there, use an ordinary non-force push, and be verified again from final `main`.
