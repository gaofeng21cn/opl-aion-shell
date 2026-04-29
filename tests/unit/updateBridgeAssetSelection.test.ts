/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@office-ai/platform', () => ({
  bridge: {
    buildProvider: vi.fn(() => ({
      provider: vi.fn(),
      invoke: vi.fn(),
    })),
    buildEmitter: vi.fn(() => ({
      emit: vi.fn(),
      on: vi.fn(),
    })),
  },
  storage: {
    buildStorage: () => ({
      getSync: () => undefined,
      setSync: () => {},
      get: () => Promise.resolve(undefined),
      set: () => Promise.resolve(),
    }),
  },
}));

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '1.0.0'),
    getAppPath: vi.fn(() => '/app'),
    getPath: vi.fn(() => '/test/path'),
    isPackaged: true,
  },
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
  };
});

vi.mock('electron-updater', () => ({
  autoUpdater: {
    logger: null,
    autoDownload: false,
    autoInstallOnAppQuit: true,
    allowPrerelease: false,
    allowDowngrade: false,
    on: vi.fn(),
    removeListener: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    checkForUpdatesAndNotify: vi.fn(),
  },
}));

vi.mock('electron-log', () => ({
  default: {
    transports: { file: { level: 'info' } },
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import { app } from 'electron';
import * as fs from 'fs';
import { pickRecommendedAsset, resolveCurrentOplReleaseVersion } from '@process/bridge/updateBridge';

const asset = (name: string) => ({
  name,
  url: `https://github.com/iOfficeAI/AionUi/releases/download/v1.0.0/${name}`,
  size: 1,
});

describe('pickRecommendedAsset', () => {
  it('should prefer ia32 package on win32 ia32 runtime', () => {
    const assets = [asset('AionUi-1.0.0-win-x64.exe'), asset('AionUi-1.0.0-win-ia32.exe')];

    const result = pickRecommendedAsset(assets, { platform: 'win32', arch: 'ia32' });

    expect(result?.name).toBe('AionUi-1.0.0-win-ia32.exe');
  });

  it('should return undefined when no compatible arch package exists', () => {
    const assets = [asset('AionUi-1.0.0-win-x64.exe'), asset('AionUi-1.0.0-win-x64.zip')];

    const result = pickRecommendedAsset(assets, { platform: 'win32', arch: 'ia32' });

    expect(result).toBeUndefined();
  });

  it('should allow generic package without explicit arch token', () => {
    const assets = [asset('AionUi-1.0.0-win.exe')];

    const result = pickRecommendedAsset(assets, { platform: 'win32', arch: 'ia32' });

    expect(result?.name).toBe('AionUi-1.0.0-win.exe');
  });
});

describe('resolveCurrentOplReleaseVersion', () => {
  it('uses the packaged OPL release version instead of the GUI version', () => {
    const originalEnvVersion = process.env.OPL_RELEASE_VERSION;
    delete process.env.OPL_RELEASE_VERSION;
    vi.mocked(app.getVersion).mockClear();
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '26.4.29', oplGuiVersion: '1.9.21' }));

    try {
      const version = resolveCurrentOplReleaseVersion();

      expect(version).toBe('26.4.29');
      expect(app.getVersion).not.toHaveBeenCalled();
    } finally {
      if (originalEnvVersion === undefined) {
        delete process.env.OPL_RELEASE_VERSION;
      } else {
        process.env.OPL_RELEASE_VERSION = originalEnvVersion;
      }
    }
  });
});
