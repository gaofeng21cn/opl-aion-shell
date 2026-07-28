# AionUI upstream intake - 2026-07-22

Machine receipt: `contracts/aionui-upstream-intake.json`. The receipt is the
offline currentness and managed-runtime projection boundary; this document
retains the human classification rationale.

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
- AionCore source range: `v0.1.49` (`08c1b2f30b7cdc7785624df935aa31d314786999`) to official `v0.1.53` (`1644ef26c168e8002dcfa53ccd333054b40697d6`).
- Official AionCore darwin-arm64 archive SHA-256: `57b92b3de046717c7980d2c345d335e2513af514621fcbfff8a3e7cf16f8b7f6`.

The official `aioncore 0.1.53` binary was run with the same `--data-dir` and `prepare-managed-resources` contract used by the Shell. Its output is the managed-resource authority:

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

The target projection preserves the existing OPL startup route in `InstallationIntegrityDialog.tsx`; `renderer/main.tsx` already consumes that route and therefore needs no semantic diff. Only `en-US` and `zh-CN` product locales are maintained. `i18n-keys.d.ts` is regenerated from fresh Shell main after the Storage UX lane entered authority at `201f338604299caaf1deaf94995fa176393c1165`; candidate-generated bytes from the earlier base are not reused.

## Core and package projection

- `package.json`: `aioncoreVersion` is `v0.1.53`; the OPL package version is unchanged by this intake.
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
