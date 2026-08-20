import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  checkAionuiCurrentness,
  evaluateAionuiCurrentness,
  parseRemoteTagCommit,
  selectLatestStableRelease,
  validateAionuiIntakeReceipt,
  validateReceiptAgainstCheckout,
} from '../../../scripts/release/aionui-upstream-currentness.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const receipt = JSON.parse(fs.readFileSync(path.join(repoRoot, 'contracts', 'aionui-upstream-intake.json'), 'utf8'));
const reusableBuildWorkflow = fs.readFileSync(
  path.join(repoRoot, '.github', 'workflows', '_build-reusable.yml'),
  'utf8'
);

describe('AionUI upstream currentness', () => {
  it('preserves full Git ancestry for the reusable code-quality checkout', () => {
    const codeQualityJob = reusableBuildWorkflow.slice(
      reusableBuildWorkflow.indexOf('  code-quality:'),
      reusableBuildWorkflow.indexOf('\n  build:')
    );

    expect(codeQualityJob).toMatch(
      /uses: actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\.0\.1[\s\S]*?fetch-depth: 0/
    );
    expect(codeQualityJob).not.toContain('inputs.ref');
  });

  it('accepts the checked-in machine receipt without hard-coding it in the validator', () => {
    expect(validateAionuiIntakeReceipt(receipt)).toBe(receipt);
    expect(validateReceiptAgainstCheckout(receipt, repoRoot)).toBe(receipt);
    expect(receipt.schema).toBe('opl_aionui_upstream_intake.v2');
    expect(receipt.reviewed_release.tag).toBe('v2.1.59');
    expect(receipt.reviewed_release.disposition).toBe('reviewed_deferred');
    expect(receipt.absorbed_release.tag).toBe('v2.1.39');
    expect(receipt.absorbed_release.commit).toBe('1b215f2fcb9d220bc66bf3b4961835ded07d5797');
    expect(receipt.shell_projection.implementation_refs).toContain('d912b54ace25ffc37fdbcd46753fc69edb28cd85');
    expect(receipt.managed_runtime).not.toHaveProperty('codex_acp');
    expect(receipt.managed_runtime).toMatchObject({
      aioncore: {
        repository: 'https://github.com/iOfficeAI/AionCore',
        authority: 'official_release_assets_only',
        source_fork: 'forbidden',
        version: 'v0.1.70',
        commit: '405912c895de3890d4de01d6aaaaed195e60cb5a',
        archive_sha256: 'a88b63af64fdcc84c1c753e2ad4e8e4f46793a3a61983185a2574b979e38e26d',
        release_assets: {
          'darwin-arm64': {
            name: 'aioncore-v0.1.70-aarch64-apple-darwin.tar.gz',
            sha256: 'a88b63af64fdcc84c1c753e2ad4e8e4f46793a3a61983185a2574b979e38e26d',
          },
          'linux-x64': {
            name: 'aioncore-v0.1.70-x86_64-unknown-linux-gnu.tar.gz',
            sha256: 'a146f3af4a03de740d4b705a4cf318f621e1c37d19475f23ce0a38432da63409',
          },
        },
      },
      managed_resources_schema: 2,
      managed_resources_projection: {
        schema: 'opl_aioncore_managed_resources_projection.v1',
        included_cli_names: ['codex'],
        excluded_cli_names: ['claude'],
        required_absent_paths: [
          'cli/claude',
          'acp',
          'node_modules/@anthropic-ai/claude-code',
          'node_modules/claude-code',
          'claude',
        ],
        composition: 'aioncore_node_plus_opl_selected_cli',
        aioncore_source_cli_names: [],
        codex_source: 'managed_runtime.codex_cli',
      },
      node_runtime: { version: '24.11.0' },
      claude_cli: {
        package: '@anthropic-ai/claude-code',
        version: '2.1.215',
        carrier_status: 'absent_legacy_producer_identity',
        required_in_bundle: false,
      },
      codex_cli: {
        package: '@openai/codex',
        version: '0.146.0',
        carrier: 'opl_app_official_npm_platform_package',
        verified_by_aioncore: 'v0.1.70',
      },
    });
  });

  it('requires the exact six-platform AionCore release asset set', () => {
    const missingLinux = structuredClone(receipt);
    delete missingLinux.managed_runtime.aioncore.release_assets['linux-x64'];
    expect(() => validateAionuiIntakeReceipt(missingLinux)).toThrow(/must contain exactly/);

    const wrongDigest = structuredClone(receipt);
    wrongDigest.managed_runtime.aioncore.release_assets['linux-x64'].sha256 = 'not-a-digest';
    expect(() => validateAionuiIntakeReceipt(wrongDigest)).toThrow(/lowercase SHA-256 digest/);

    const duplicateDigest = structuredClone(receipt);
    duplicateDigest.managed_runtime.aioncore.release_assets['linux-x64'].sha256 =
      duplicateDigest.managed_runtime.aioncore.release_assets['darwin-arm64'].sha256;
    expect(() => validateAionuiIntakeReceipt(duplicateDigest)).toThrow(/one distinct digest per platform asset/);
  });

  it('rejects personal AionCore forks as runtime authority', () => {
    const forkedRuntime = structuredClone(receipt);
    forkedRuntime.managed_runtime.aioncore.repository = 'https://github.com/example-user/AionCore';
    expect(() => validateAionuiIntakeReceipt(forkedRuntime)).toThrow(/official upstream/);

    const sourceForkAllowed = structuredClone(receipt);
    sourceForkAllowed.managed_runtime.aioncore.source_fork = 'allowed';
    expect(() => validateAionuiIntakeReceipt(sourceForkAllowed)).toThrow(/source_fork must be forbidden/);
  });

  it('rejects an intake receipt that does not bind the Codex-only projection policy', () => {
    const invalidProjection = structuredClone(receipt);
    invalidProjection.managed_runtime.managed_resources_projection.included_cli_names = ['claude', 'codex'];

    expect(() => validateAionuiIntakeReceipt(invalidProjection)).toThrow(/Codex-only policy is invalid/);
  });

  it('selects only the highest official stable semantic release', () => {
    expect(
      selectLatestStableRelease([
        {
          tag_name: 'v2.2.0-beta.1',
          published_at: '2026-07-23T00:00:00Z',
          draft: false,
          prerelease: true,
          html_url: 'https://example.invalid/beta',
        },
        {
          tag_name: 'v2.1.40',
          published_at: '2026-07-23T01:00:00Z',
          draft: true,
          prerelease: false,
          html_url: 'https://example.invalid/draft',
        },
        {
          tag_name: 'v2.1.39',
          published_at: '2026-07-21T16:18:52Z',
          draft: false,
          prerelease: false,
          html_url: 'https://github.com/iOfficeAI/AionUi/releases/tag/v2.1.39',
        },
        {
          tag_name: 'v2.1.38',
          published_at: '2026-07-20T00:00:00Z',
          draft: false,
          prerelease: false,
          html_url: 'https://example.invalid/older',
        },
      ])
    ).toMatchObject({ tag: 'v2.1.39', draft: false, prerelease: false });
  });

  it('peels annotated tags and falls back to lightweight tag commits', () => {
    const tag = 'v2.1.39';
    expect(
      parseRemoteTagCommit(
        [`${'a'.repeat(40)}\trefs/tags/${tag}`, `${'b'.repeat(40)}\trefs/tags/${tag}^{}`].join('\n'),
        tag
      )
    ).toBe('b'.repeat(40));
    expect(parseRemoteTagCommit(`${'a'.repeat(40)}\trefs/tags/${tag}\n`, tag)).toBe('a'.repeat(40));
  });

  it('returns current only for exact release metadata and tag bytes', () => {
    expect(
      evaluateAionuiCurrentness(receipt, {
        tag: receipt.reviewed_release.tag,
        commit: receipt.reviewed_release.commit,
        published_at: receipt.reviewed_release.published_at,
        draft: false,
        prerelease: false,
        url: receipt.reviewed_release.url,
      }).status
    ).toBe('current');

    expect(() =>
      evaluateAionuiCurrentness(receipt, {
        tag: receipt.reviewed_release.tag,
        commit: 'f'.repeat(40),
        published_at: receipt.reviewed_release.published_at,
        draft: false,
        prerelease: false,
        url: receipt.reviewed_release.url,
      })
    ).toThrow(/different commit/);
  });

  it('turns a newer stable release into a review event without mutation', () => {
    const result = evaluateAionuiCurrentness(receipt, {
      tag: 'v2.1.60',
      commit: 'c'.repeat(40),
      published_at: '2026-08-20T01:00:00Z',
      draft: false,
      prerelease: false,
      url: 'https://github.com/iOfficeAI/AionUi/releases/tag/v2.1.60',
    });
    expect(result).toMatchObject({
      status: 'review_required',
      release_mutation_performed: false,
      observed_release: { tag: 'v2.1.60' },
    });
  });

  it('does not downgrade exact tag drift to network uncertainty', async () => {
    await expect(
      checkAionuiCurrentness(receipt, {
        fetchImpl: async () => ({
          ok: true,
          json: async () => [
            {
              tag_name: receipt.reviewed_release.tag,
              published_at: receipt.reviewed_release.published_at,
              draft: false,
              prerelease: false,
              html_url: receipt.reviewed_release.url,
            },
          ],
        }),
        tagResolver: async () => 'f'.repeat(40),
      })
    ).rejects.toThrow(/different commit/);
  });

  it('reports network uncertainty instead of claiming current', async () => {
    const result = await checkAionuiCurrentness(receipt, {
      fetchImpl: async () => {
        throw new Error('network unavailable');
      },
      tagResolver: async () => receipt.reviewed_release.commit,
    });
    expect(result).toMatchObject({
      status: 'unknown',
      reason: 'network unavailable',
      release_mutation_performed: false,
    });
  });

  it('uses the authenticated GitHub token resolver without exposing the token in output', async () => {
    let authorization = '';
    const result = await checkAionuiCurrentness(receipt, {
      authTokenResolver: () => 'test-token',
      fetchImpl: async (_url, options) => {
        authorization = String(options?.headers?.Authorization ?? '');
        return {
          ok: true,
          json: async () => [
            {
              tag_name: receipt.reviewed_release.tag,
              published_at: receipt.reviewed_release.published_at,
              draft: false,
              prerelease: false,
              html_url: receipt.reviewed_release.url,
            },
          ],
        };
      },
      tagResolver: async () => receipt.reviewed_release.commit,
    });

    expect(authorization).toBe('Bearer test-token');
    expect(result.status).toBe('current');
    expect(JSON.stringify(result)).not.toContain('test-token');
  });
});
