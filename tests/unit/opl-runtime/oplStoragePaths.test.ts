import os from 'os';
import path from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { afterEach, describe, expect, it } from 'vitest';
import { registerPlatformServices } from '@/common/platform';
import type { IPlatformServices } from '@/common/platform/IPlatformServices';
import { NodePlatformServices } from '@/common/platform/NodePlatformServices';
import { getConfigPath, getDataPath, getTempPath } from '@/process/utils/utils';

function registerTestPlatformServices(input: { homeDir: string; isPackaged: boolean }): void {
  const homeDir = input.homeDir;
  const userDataDir = path.join(homeDir, 'Library', 'Application Support', 'One Person Lab');
  const services: IPlatformServices = {
    paths: {
      getDataDir: () => userDataDir,
      getTempDir: () => os.tmpdir(),
      getHomeDir: () => homeDir,
      getLogsDir: () => path.join(userDataDir, 'logs'),
      getAppPath: () => '/Applications/One Person Lab.app',
      isPackaged: () => input.isPackaged,
      getSystemPath: () => null,
      getName: () => 'One Person Lab',
      getVersion: () => '26.5.27',
      needsCliSafeSymlinks: () => true,
    },
    worker: {
      fork: () => {
        throw new Error('not used');
      },
    },
    power: {
      preventSleep: () => null,
      allowSleep: () => {},
      preventDisplaySleep: () => null,
    },
    notification: { send: () => {} },
    network: { fetch },
  };
  registerPlatformServices(services);
}

describe('OPL App storage paths', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    delete process.env.AIONUI_MULTI_INSTANCE;
    registerPlatformServices(new NodePlatformServices());
    for (const tempRoot of tempRoots.splice(0)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('uses OPL-specific CLI-safe paths for packaged builds', () => {
    const homeDir = mkdtempSync(path.join(os.tmpdir(), 'opl-home-'));
    tempRoots.push(homeDir);
    registerTestPlatformServices({ homeDir, isPackaged: true });

    expect(getDataPath()).toBe(path.join(homeDir, '.opl-app-data'));
    expect(getConfigPath()).toBe(path.join(homeDir, '.opl-app-config'));
    expect(getDataPath()).not.toContain('.aionui');
    expect(getConfigPath()).not.toContain('.aionui');
  });

  it('uses an OPL-branded temporary directory', () => {
    const homeDir = mkdtempSync(path.join(os.tmpdir(), 'opl-home-'));
    tempRoots.push(homeDir);
    registerTestPlatformServices({ homeDir, isPackaged: true });

    expect(getTempPath()).toBe(path.join(os.tmpdir(), 'one-person-lab'));
    expect(getTempPath()).not.toContain('aionui');
  });

  it('keeps dev builds isolated under OPL-specific names', () => {
    const homeDir = mkdtempSync(path.join(os.tmpdir(), 'opl-home-'));
    tempRoots.push(homeDir);
    registerTestPlatformServices({ homeDir, isPackaged: false });

    expect(getDataPath()).toBe(path.join(homeDir, '.opl-app-data-dev'));
    expect(getConfigPath()).toBe(path.join(homeDir, '.opl-app-config-dev'));
  });
});
