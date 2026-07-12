/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn(() => true),
}));

vi.mock('@office-ai/platform', () => ({
  bridge: {
    buildProvider: vi.fn(() => {
      const handlerMap = new Map<string, Function>();
      return {
        provider: vi.fn((handler: Function) => {
          handlerMap.set('handler', handler);
          return vi.fn();
        }),
        invoke: vi.fn(),
        _getHandler: () => handlerMap.get('handler'),
      };
    }),
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

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual.default,
      existsSync: fsMocks.existsSync,
    },
    existsSync: fsMocks.existsSync,
  };
});

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '1.0.0'),
    getPath: vi.fn(() => '/test/path'),
    isPackaged: true,
  },
}));

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

const makeGitHubReleaseResponse = () => [
  {
    tag_name: 'v1.9.22',
    name: 'v1.9.22',
    body: 'release notes',
    html_url: 'https://github.com/iOfficeAI/AionUi/releases/tag/v1.9.22',
    published_at: '2026-04-29T00:00:00Z',
    prerelease: false,
    draft: false,
    assets: [
      {
        name: 'AionUi-1.9.22-mac-arm64.dmg',
        browser_download_url:
          'https://github.com/iOfficeAI/AionUi/releases/download/v1.9.22/AionUi-1.9.22-mac-arm64.dmg',
        size: 123,
        content_type: 'application/x-apple-diskimage',
      },
      {
        name: 'AionUi-1.9.22-win-x64.exe',
        browser_download_url: 'https://github.com/iOfficeAI/AionUi/releases/download/v1.9.22/AionUi-1.9.22-win-x64.exe',
        size: 456,
        content_type: 'application/vnd.microsoft.portable-executable',
      },
      {
        name: 'AionUi-1.9.22-linux-amd64.deb',
        browser_download_url:
          'https://github.com/iOfficeAI/AionUi/releases/download/v1.9.22/AionUi-1.9.22-linux-amd64.deb',
        size: 789,
      },
    ],
  },
];

const makeStableAndNightlyReleaseResponse = () => [
  {
    tag_name: 'v26.5.24',
    name: 'v26.5.24',
    body: 'stable release notes',
    html_url: 'https://github.com/gaofeng21cn/one-person-lab-app/releases/tag/v26.5.24',
    published_at: '2026-05-24T00:00:00Z',
    prerelease: false,
    draft: false,
    assets: [
      {
        name: 'One-Person-Lab-26.5.24-mac-arm64.dmg',
        browser_download_url:
          'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.5.24/One-Person-Lab-26.5.24-mac-arm64.dmg',
        size: 123,
        content_type: 'application/x-apple-diskimage',
      },
      {
        name: 'One-Person-Lab-26.5.24-mac-arm64.zip',
        browser_download_url:
          'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.5.24/One-Person-Lab-26.5.24-mac-arm64.zip',
        size: 124,
        content_type: 'application/zip',
      },
    ],
  },
  {
    tag_name: 'v26.5.27-nightly.20260527',
    name: 'v26.5.27-nightly.20260527',
    body: 'nightly release notes',
    html_url: 'https://github.com/gaofeng21cn/one-person-lab-app/releases/tag/v26.5.27-nightly.20260527',
    published_at: '2026-05-27T00:00:00Z',
    prerelease: true,
    draft: false,
    assets: [
      {
        name: 'One-Person-Lab-26.5.27-nightly.20260527-mac-arm64.dmg',
        browser_download_url:
          'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.5.27-nightly.20260527/One-Person-Lab-26.5.27-nightly.20260527-mac-arm64.dmg',
        size: 456,
        content_type: 'application/x-apple-diskimage',
      },
      {
        name: 'One-Person-Lab-26.5.27-nightly.20260527-mac-arm64.zip',
        browser_download_url:
          'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.5.27-nightly.20260527/One-Person-Lab-26.5.27-nightly.20260527-mac-arm64.zip',
        size: 457,
        content_type: 'application/zip',
      },
      {
        name: 'One-Person-Lab-26.5.27-nightly.20260527-linux-amd64.deb',
        browser_download_url:
          'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.5.27-nightly.20260527/One-Person-Lab-26.5.27-nightly.20260527-linux-amd64.deb',
        size: 789,
        content_type: 'application/vnd.debian.binary-package',
      },
    ],
  },
];

const getCheckHandler = async () => {
  vi.resetModules();
  const { initUpdateBridge } = await import('@process/bridge/updateBridge');
  const { ipcBridge } = await import('@/common');

  initUpdateBridge();

  const provider = vi.mocked(ipcBridge.update.check.provider);
  const lastCall = provider.mock.calls.at(-1);
  if (!lastCall) throw new Error('update.check handler not registered');
  return lastCall[0];
};

const getAutoUpdateCheckHandler = async () => {
  vi.resetModules();
  const { autoUpdaterService } = await import('@process/services/autoUpdaterService');
  const { initUpdateBridge } = await import('@process/bridge/updateBridge');
  const { ipcBridge } = await import('@/common');

  autoUpdaterService.resetForTest();
  autoUpdaterService.initialize();
  initUpdateBridge();

  const provider = vi.mocked(ipcBridge.autoUpdate.check.provider);
  const lastCall = provider.mock.calls.at(-1);
  if (!lastCall) throw new Error('auto-update.check handler not registered');
  return lastCall[0];
};

describe('updateBridge CDN URL rewriting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers macOS zip assets for App-managed updater installs', async () => {
    vi.resetModules();
    const { pickRecommendedAsset } = await import('@/process/bridge/updateBridge');
    const asset = pickRecommendedAsset(
      [
        {
          name: 'One-Person-Lab-26.6.5-mac-arm64.dmg',
          url: 'https://static.aionui.com/releases/26.6.5/One-Person-Lab-26.6.5-mac-arm64.dmg',
          size: 123,
        },
        {
          name: 'One-Person-Lab-26.6.5-mac-arm64.zip',
          url: 'https://static.aionui.com/releases/26.6.5/One-Person-Lab-26.6.5-mac-arm64.zip',
          size: 124,
        },
      ],
      { platform: 'darwin', arch: 'arm64' }
    );

    expect(asset?.name).toBe('One-Person-Lab-26.6.5-mac-arm64.zip');
    expect(asset?.updateRole).toBe('updater');
  });

  it('checks the One Person Lab App release repo by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGitHubReleaseResponse(),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const handler = await getCheckHandler();
      const result = await handler({});

      expect(result.success).toBe(true);
      expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.github.com/repos/gaofeng21cn/one-person-lab-app/releases');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rewrites asset.url to the CDN path and keeps GitHub URL in fallbackUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGitHubReleaseResponse(),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const handler = await getCheckHandler();
      const result = await handler({ repo: 'iOfficeAI/AionUi' });

      expect(result.success).toBe(true);
      const assets = result.data?.latest?.assets ?? [];
      expect(assets.length).toBe(3);

      const macAsset = assets.find((a: { name: string }) => a.name === 'AionUi-1.9.22-mac-arm64.dmg');
      expect(macAsset).toBeDefined();
      expect(macAsset?.url).toBe('https://static.aionui.com/releases/1.9.22/AionUi-1.9.22-mac-arm64.dmg');
      expect(macAsset?.fallbackUrl).toBe(
        'https://github.com/iOfficeAI/AionUi/releases/download/v1.9.22/AionUi-1.9.22-mac-arm64.dmg'
      );

      const linuxAsset = assets.find((a: { name: string }) => a.name === 'AionUi-1.9.22-linux-amd64.deb');
      expect(linuxAsset?.url).toBe('https://static.aionui.com/releases/1.9.22/AionUi-1.9.22-linux-amd64.deb');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uses the normalized version (no v prefix) in the CDN path', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGitHubReleaseResponse(),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const handler = await getCheckHandler();
      const result = await handler({ repo: 'iOfficeAI/AionUi' });
      const asset = result.data?.latest?.assets?.[0];
      expect(asset?.url).toMatch(/^https:\/\/static\.aionui\.com\/releases\/1\.9\.22\//);
      expect(asset?.url).not.toMatch(/\/v1\.9\.22\//);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps prerelease releases out of stable update checks', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeStableAndNightlyReleaseResponse(),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const handler = await getCheckHandler();
      const result = await handler({ includePrerelease: false });

      expect(result.success).toBe(true);
      expect(result.data?.latest?.tagName).toBe('v26.5.24');
      expect(result.data?.latest?.prerelease).toBe(false);
      expect(result.data?.latest?.assets.map((asset) => asset.name)).toContain('One-Person-Lab-26.5.24-mac-arm64.zip');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('selects the newest nightly release when prerelease updates are enabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeStableAndNightlyReleaseResponse(),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const handler = await getCheckHandler();
      const result = await handler({ includePrerelease: true });

      expect(result.success).toBe(true);
      expect(result.data?.latest?.tagName).toBe('v26.5.27-nightly.20260527');
      expect(result.data?.latest?.prerelease).toBe(true);
      expect(result.data?.latest?.recommendedAsset?.name).toContain('One-Person-Lab-26.5.27-nightly.20260527-');
      expect(result.data?.latest?.recommendedAsset?.url).toMatch(
        /^https:\/\/static\.aionui\.com\/releases\/26\.5\.27-nightly\.20260527\//
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('updateBridge auto-update config handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMocks.existsSync.mockReturnValue(true);
  });

  it('treats missing packaged app-update.yml as manual-update-only instead of an update error', async () => {
    const { autoUpdater } = await import('electron-updater');
    vi.mocked(autoUpdater.checkForUpdates).mockRejectedValueOnce(
      new Error(
        'Cannot find latest.yml in the latest release artifacts: /Applications/One Person Lab.app/Contents/Resources/app-update.yml'
      )
    );

    const handler = await getAutoUpdateCheckHandler();
    const result = await handler({ channel: 'stable' });

    expect(result).toEqual({ success: true, data: { checked: true }, msg: undefined });
  });

  it('skips startup auto-update checks when packaged updater config is absent', async () => {
    fsMocks.existsSync.mockReturnValue(false);
    Object.defineProperty(process, 'resourcesPath', {
      value: '/Applications/One Person Lab.app/Contents/Resources',
      configurable: true,
    });

    const { autoUpdater } = await import('electron-updater');
    const { autoUpdaterService } = await import('@process/services/autoUpdaterService');
    const log = (await import('electron-log')).default;
    const statusListener = vi.fn();

    autoUpdaterService.resetForTest();
    autoUpdaterService.initialize();
    autoUpdaterService.on('update-status', statusListener);

    await autoUpdaterService.checkForUpdatesAndNotify();

    expect(autoUpdater.checkForUpdatesAndNotify).not.toHaveBeenCalled();
    expect(statusListener).toHaveBeenCalledWith({ status: 'not-available' });
    expect(log.warn).toHaveBeenCalledWith(
      'Startup auto-update config is unavailable; manual update checks remain available:',
      '/Applications/One Person Lab.app/Contents/Resources/app-update.yml'
    );
  });

  it('suppresses missing packaged config error events as manual-update-only', async () => {
    const { autoUpdaterService } = await import('@process/services/autoUpdaterService');
    const log = (await import('electron-log')).default;
    const statusListener = vi.fn();

    autoUpdaterService.resetForTest();
    autoUpdaterService.initialize();
    autoUpdaterService.on('update-status', statusListener);

    autoUpdaterService.triggerEventForTest(
      'error',
      new Error(
        'ENOENT: no such file or directory, open /Applications/One Person Lab.app/Contents/Resources/app-update.yml'
      )
    );

    expect(statusListener).toHaveBeenCalledWith({ status: 'not-available' });
    expect(log.warn).toHaveBeenCalledWith(
      'Packaged auto-update config is unavailable; using manual release checks only:',
      'ENOENT: no such file or directory, open /Applications/One Person Lab.app/Contents/Resources/app-update.yml'
    );
    expect(log.error).not.toHaveBeenCalledWith('Auto-updater error:', expect.any(Error));
  });

  it('requests the Framework-owned OPL Flow reconcile after a running-version switch claim', async () => {
    vi.resetModules();
    const diagnostics = await import('@process/services/autoUpdateDiagnostics');
    const claim = { currentVersion: '1.0.0', targetVersion: '1.0.0' };
    const claimSpy = vi.spyOn(diagnostics, 'claimAutoUpdateOplFlowReconcileIfNeeded').mockReturnValue(claim);
    const recordSpy = vi.spyOn(diagnostics, 'recordAutoUpdateOplFlowReconcileResult').mockReturnValue({
      at: '2026-07-12T12:00:00.000Z',
      receiptPath: '/tmp/opl-flow-receipt.json',
      status: 'opl_flow_optimize_completed',
      version: '1.0.0',
    });
    const reconcile = vi.fn().mockResolvedValue({
      ok: true,
      parsed: {
        workflow_package: {
          receipt_path: '/tmp/opl-flow-receipt.json',
          status: 'completed',
        },
      },
    });
    const { autoUpdaterService } = await import('@process/services/autoUpdaterService');

    autoUpdaterService.resetForTest();
    autoUpdaterService.initialize(undefined, reconcile);

    await vi.waitFor(() => expect(reconcile).toHaveBeenCalledOnce());
    expect(recordSpy).toHaveBeenCalledWith(claim, expect.objectContaining({ ok: true }), {
      currentAppVersion: '1.0.0',
      userDataPath: '/test/path',
    });

    claimSpy.mockRestore();
    recordSpy.mockRestore();
  });
});

describe('updateBridge allowlist includes CDN host', () => {
  it('accepts static.aionui.com URLs for download', async () => {
    vi.resetModules();
    vi.clearAllMocks();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-length': '0' }),
      body: {
        getReader: () => ({
          read: async () => ({ done: true, value: undefined }),
        }),
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const { initUpdateBridge } = await import('@process/bridge/updateBridge');
      const { ipcBridge } = await import('@/common');

      initUpdateBridge();

      const provider = vi.mocked(ipcBridge.update.download.provider);
      const lastCall = provider.mock.calls.at(-1);
      if (!lastCall) throw new Error('update.download handler not registered');
      const handler = lastCall[0];

      const result = await handler({
        url: 'https://static.aionui.com/releases/1.9.22/AionUi-1.9.22-mac-arm64.dmg',
        file_name: 'AionUi-1.9.22-mac-arm64.dmg',
      });

      expect(result.success).toBe(true);
      expect(result.data?.downloadId).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects non-allowlisted hosts', async () => {
    vi.resetModules();
    vi.clearAllMocks();

    const { initUpdateBridge } = await import('@process/bridge/updateBridge');
    const { ipcBridge } = await import('@/common');

    initUpdateBridge();

    const provider = vi.mocked(ipcBridge.update.download.provider);
    const lastCall = provider.mock.calls.at(-1);
    if (!lastCall) throw new Error('update.download handler not registered');
    const handler = lastCall[0];

    const result = await handler({
      url: 'https://evil.example.com/fake.dmg',
      file_name: 'fake.dmg',
    });

    // Download is refused before any network I/O; exact error text comes from i18n and isn't asserted here.
    expect(result.success).toBe(false);
  });
});
