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
      /uses: actions\/checkout@v6[\s\S]*?ref: \$\{\{ inputs\.ref \}\}[\s\S]*?fetch-depth: 0/
    );
  });

  it('accepts the checked-in machine receipt without hard-coding it in the validator', () => {
    expect(validateAionuiIntakeReceipt(receipt)).toBe(receipt);
    expect(validateReceiptAgainstCheckout(receipt, repoRoot)).toBe(receipt);
    expect(receipt.reviewed_release.tag).toBe('v2.1.41');
    expect(receipt.reviewed_release.disposition).toBe('reviewed_deferred');
    expect(receipt.absorbed_release.tag).toBe('v2.1.39');
    expect(receipt.absorbed_release.commit).toBe('1b215f2fcb9d220bc66bf3b4961835ded07d5797');
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
      tag: 'v2.1.42',
      commit: 'c'.repeat(40),
      published_at: '2026-07-28T01:00:00Z',
      draft: false,
      prerelease: false,
      url: 'https://github.com/iOfficeAI/AionUi/releases/tag/v2.1.42',
    });
    expect(result).toMatchObject({
      status: 'review_required',
      release_mutation_performed: false,
      observed_release: { tag: 'v2.1.42' },
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
});
