import os from 'os';
import path from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { afterEach, describe, expect, it } from 'vitest';
import { registerPlatformServices } from '@/common/platform';
import type { IPlatformServices } from '@/common/platform/IPlatformServices';
import { NodePlatformServices } from '@/common/platform/NodePlatformServices';
import { getConfigPath, getDataPath, getTempPath } from '@/process/utils/utils';

function registerTestPlatformServices(input: { homeDir: string; isPackaged: boolean; userDataDir?: string }): void {
  const homeDir = input.homeDir;
  const userDataDir = input.userDataDir ?? path.join(homeDir, 'Library', 'Application Support', 'One Person Lab');
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
    delete process.env.AIONUI_E2E_TEST;
    delete process.env.AIONUI_E2E_STORAGE_ROOT;
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

  it('uses an already CLI-safe userData path directly', () => {
    const homeDir = mkdtempSync(path.join(os.tmpdir(), 'opl-home-'));
    const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'opl-e2e-user-data-'));
    tempRoots.push(homeDir, userDataDir);
    registerTestPlatformServices({ homeDir, isPackaged: true, userDataDir });

    expect(getDataPath()).toBe(path.join(userDataDir, 'opl-data'));
    expect(getConfigPath()).toBe(path.join(userDataDir, 'opl-config'));
  });

  it('keeps E2E data and config inside the explicit test storage root', () => {
    const homeDir = mkdtempSync(path.join(os.tmpdir(), 'opl-home-'));
    const storageRoot = mkdtempSync(path.join(os.tmpdir(), 'opl-e2e-storage-'));
    tempRoots.push(homeDir, storageRoot);
    registerTestPlatformServices({ homeDir, isPackaged: true });
    process.env.AIONUI_E2E_TEST = '1';
    process.env.AIONUI_E2E_STORAGE_ROOT = storageRoot;

    expect(getDataPath()).toBe(path.join(storageRoot, 'data'));
    expect(getConfigPath()).toBe(path.join(storageRoot, 'config'));
  });

  it('fails closed when E2E mode has no isolated storage root', () => {
    const homeDir = mkdtempSync(path.join(os.tmpdir(), 'opl-home-'));
    tempRoots.push(homeDir);
    registerTestPlatformServices({ homeDir, isPackaged: true });
    process.env.AIONUI_E2E_TEST = '1';

    expect(() => getDataPath()).toThrow('AIONUI_E2E_STORAGE_ROOT is required');
    expect(() => getConfigPath()).toThrow('AIONUI_E2E_STORAGE_ROOT is required');
  });

  it('fails closed when the E2E storage root is relative', () => {
    const homeDir = mkdtempSync(path.join(os.tmpdir(), 'opl-home-'));
    tempRoots.push(homeDir);
    registerTestPlatformServices({ homeDir, isPackaged: true });
    process.env.AIONUI_E2E_TEST = '1';
    process.env.AIONUI_E2E_STORAGE_ROOT = 'relative/e2e-storage';

    expect(() => getDataPath()).toThrow('AIONUI_E2E_STORAGE_ROOT must be an absolute path');
    expect(() => getConfigPath()).toThrow('AIONUI_E2E_STORAGE_ROOT must be an absolute path');
  });

  it('ignores the E2E storage root outside E2E mode', () => {
    const homeDir = mkdtempSync(path.join(os.tmpdir(), 'opl-home-'));
    const storageRoot = mkdtempSync(path.join(os.tmpdir(), 'opl-e2e-storage-'));
    tempRoots.push(homeDir, storageRoot);
    registerTestPlatformServices({ homeDir, isPackaged: true });
    process.env.AIONUI_E2E_STORAGE_ROOT = storageRoot;

    expect(getDataPath()).toBe(path.join(homeDir, '.opl-app-data'));
    expect(getConfigPath()).toBe(path.join(homeDir, '.opl-app-config'));
  });

  it('keeps dev builds isolated under OPL-specific names', () => {
    const homeDir = mkdtempSync(path.join(os.tmpdir(), 'opl-home-'));
    tempRoots.push(homeDir);
    registerTestPlatformServices({ homeDir, isPackaged: false });

    expect(getDataPath()).toBe(path.join(homeDir, '.opl-app-data-dev'));
    expect(getConfigPath()).toBe(path.join(homeDir, '.opl-app-config-dev'));
  });
});
