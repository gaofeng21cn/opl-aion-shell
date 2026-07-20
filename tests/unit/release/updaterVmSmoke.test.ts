import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  compareMachineVersions,
  parseHttpRange,
  parseUpdaterVmArgs,
} from '../../../scripts/release/opl-updater-vm-smoke.mjs';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixtureArgs(): string[] {
  const root = mkdtempSync(join(tmpdir(), 'opl-updater-vm-test-'));
  roots.push(root);
  const dmg = join(root, 'old.dmg');
  const feed = join(root, 'feed');
  writeFileSync(dmg, 'old dmg');
  mkdirSync(feed);
  return [
    '--old-dmg',
    dmg,
    '--feed-dir',
    feed,
    '--expected-current-display-version',
    '26.7.20',
    '--expected-current-version',
    '26.7.20',
    '--expected-display-version',
    '26.7.20-r1',
    '--expected-updater-version',
    '26.7.2001',
    '--artifacts',
    join(root, 'artifacts'),
  ];
}

describe('updater VM smoke contract', () => {
  it('binds the legacy installed version to a distinct display and machine target', () => {
    const options = parseUpdaterVmArgs(fixtureArgs());
    expect(options?.expectedCurrentDisplayVersion).toBe('26.7.20');
    expect(options?.expectedCurrentVersion).toBe('26.7.20');
    expect(options?.expectedDisplayVersion).toBe('26.7.20-r1');
    expect(options?.expectedUpdaterVersion).toBe('26.7.2001');
  });

  it('rejects a qualification that cannot prove a strictly newer machine identity', () => {
    const args = fixtureArgs();
    const targetIndex = args.indexOf('--expected-updater-version') + 1;
    args[targetIndex] = '26.7.20';
    expect(() => parseUpdaterVmArgs(args)).toThrow(/strictly newer machine version/);

    args[targetIndex] = '26.7.19';
    expect(() => parseUpdaterVmArgs(args)).toThrow(/strictly newer machine version/);
  });

  it('compares SemVer core segments as decimal integers', () => {
    expect(compareMachineVersions('26.7.900', '26.7.1000')).toBeLessThan(0);
    expect(compareMachineVersions('26.7.2001', '26.7.20')).toBeGreaterThan(0);
    expect(compareMachineVersions('26.8.100', '26.7.3109')).toBeGreaterThan(0);
  });

  it('serves complete, bounded, and suffix byte ranges for electron-updater', () => {
    expect(parseHttpRange(undefined, 100)).toBeNull();
    expect(parseHttpRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 });
    expect(parseHttpRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(parseHttpRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(() => parseHttpRange('bytes=100-101', 100)).toThrow(/Unsatisfiable/);
  });
});
