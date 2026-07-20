import { describe, expect, it } from 'vitest';

import { parseUpdaterTartArgs, updaterTartDryRunPlan } from '../../../scripts/release/opl-updater-tart-smoke.mjs';

describe('updater Tart smoke contract', () => {
  it('keeps one candidate feed and one immutable Bundle across the host and guest boundary', () => {
    const options = parseUpdaterTartArgs([
      '--dry-run',
      '--source-vm',
      'macos-clean',
      '--old-dmg',
      '/tmp/old.dmg',
      '--feed-dir',
      '/tmp/feed',
      '--expected-current-display-version',
      '26.7.20',
      '--expected-current-version',
      '26.7.20',
      '--expected-display-version',
      '26.7.20-r1',
      '--expected-updater-version',
      '26.7.2001',
      '--guest-node-root',
      '/tmp/node',
      '--bundle-digest',
      `sha256:${'a'.repeat(64)}`,
    ]);
    expect(options).not.toBeNull();
    const plan = updaterTartDryRunPlan(options!);
    expect(plan).toMatchObject({
      schema: 'opl_updater_tart_smoke_plan.v1',
      source_vm: 'macos-clean',
      expected_current_display_version: '26.7.20',
      expected_current_version: '26.7.20',
      expected_display_version: '26.7.20-r1',
      expected_updater_version: '26.7.2001',
      bundle_digest: `sha256:${'a'.repeat(64)}`,
    });
  });

  it('requires an explicit candidate updater identity', () => {
    expect(() =>
      parseUpdaterTartArgs([
        '--dry-run',
        '--source-vm',
        'macos-clean',
        '--old-dmg',
        '/tmp/old.dmg',
        '--feed-dir',
        '/tmp/feed',
        '--expected-current-display-version',
        '26.7.20',
        '--expected-current-version',
        '26.7.20',
        '--expected-display-version',
        '26.7.20-r1',
        '--guest-node-root',
        '/tmp/node',
      ])
    ).toThrow(/--expected-updater-version is required/);
  });

  it('rejects a downgrade before allocating a Tart VM', () => {
    expect(() =>
      parseUpdaterTartArgs([
        '--dry-run',
        '--source-vm',
        'macos-clean',
        '--old-dmg',
        '/tmp/old.dmg',
        '--feed-dir',
        '/tmp/feed',
        '--expected-current-display-version',
        '26.7.20',
        '--expected-current-version',
        '26.7.20',
        '--expected-display-version',
        '26.7.20-r1',
        '--expected-updater-version',
        '26.7.19',
        '--guest-node-root',
        '/tmp/node',
      ])
    ).toThrow(/strictly newer/);
  });
});
