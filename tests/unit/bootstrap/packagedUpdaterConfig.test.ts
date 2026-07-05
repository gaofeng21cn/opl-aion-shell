/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../..');
const {
  assertPackagedUpdaterConfig,
  buildPackagedUpdaterConfig,
  writePackagedUpdaterConfig,
} = require('../../../scripts/packagedUpdaterConfig');

describe('packaged updater config', () => {
  it('derives app-update.yml from the current electron-builder publish config', () => {
    expect(buildPackagedUpdaterConfig(repoRoot)).toBe(
      [
        'owner: gaofeng21cn',
        'repo: one-person-lab-app',
        'provider: github',
        'publishAutoUpdate: true',
        'releaseType: release',
        'updaterCacheDirName: one-person-lab-aion-shell-updater',
        '',
      ].join('\n')
    );
  });

  it('writes and validates the packaged app-update.yml resource', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'aionui-updater-config-test-'));
    try {
      const resourcesDir = join(tempDir, 'One Person Lab.app/Contents/Resources');
      const { configPath } = writePackagedUpdaterConfig(resourcesDir, {
        projectRoot: repoRoot,
      });

      expect(existsSync(configPath)).toBe(true);
      expect(readFileSync(configPath, 'utf8')).toBe(buildPackagedUpdaterConfig(repoRoot));
      expect(() =>
        assertPackagedUpdaterConfig(resourcesDir, {
          projectRoot: repoRoot,
        })
      ).not.toThrow();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
