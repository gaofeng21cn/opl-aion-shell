import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/common', () => ({
  ipcBridge: {
    application: {
      systemInfo: { provider: vi.fn() },
      updateSystemInfo: { provider: vi.fn() },
      appVersions: { provider: vi.fn() },
      getPath: { provider: vi.fn() },
      restart: { provider: vi.fn() },
      openDevTools: { provider: vi.fn() },
      isDevToolsOpened: { provider: vi.fn() },
      getZoomFactor: { provider: vi.fn() },
      setZoomFactor: { provider: vi.fn() },
      getCdpStatus: { provider: vi.fn() },
      updateCdpConfig: { provider: vi.fn() },
      logStream: { emit: vi.fn() },
      devToolsStateChanged: { emit: vi.fn() },
    },
  },
}));

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => '/mock/app'),
    getVersion: vi.fn(() => '26.4.27'),
  },
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    readFileSync: vi.fn((filePath: string, encoding?: BufferEncoding) => {
      if (filePath === '/mock/app/package.json') {
        return JSON.stringify({ version: '26.4.27', oplGuiVersion: '1.9.21' });
      }
      return actual.readFileSync(filePath, encoding);
    }),
  };
});

vi.mock('@process/utils/initStorage', () => ({
  getSystemDir: () => ({
    cacheDir: '/mock/cache',
    workDir: '/mock/work',
    logDir: '/mock/logs',
    platform: 'linux',
    arch: 'x64',
  }),
  ProcessEnv: { set: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@process/utils', () => ({
  copyDirectoryRecursively: vi.fn().mockResolvedValue(undefined),
  getConfigPath: vi.fn(() => '/mock/cache'),
  getDataPath: vi.fn(() => '/mock/work'),
  resolveCliSafePath: vi.fn((value: string) => value),
}));

describe('initApplicationBridgeCore', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('imports without requiring electron', async () => {
    const mod = await import('@process/bridge/applicationBridgeCore');
    expect(mod.initApplicationBridgeCore).toBeTypeOf('function');
  });

  it('registers systemInfo and updateSystemInfo providers', async () => {
    const { ipcBridge } = await import('@/common');
    const { initApplicationBridgeCore } = await import('@process/bridge/applicationBridgeCore');
    initApplicationBridgeCore();
    expect(ipcBridge.application.systemInfo.provider).toHaveBeenCalledOnce();
    expect(ipcBridge.application.updateSystemInfo.provider).toHaveBeenCalledOnce();
  });

  it('reports OPL release version separately from GUI baseline version', async () => {
    const { ipcBridge } = await import('@/common');
    const { initApplicationBridgeCore } = await import('@process/bridge/applicationBridgeCore');
    initApplicationBridgeCore();

    const provider = vi.mocked(ipcBridge.application.appVersions.provider).mock.calls[0][0];
    await expect(provider()).resolves.toMatchObject({
      oplVersion: '26.4.27',
      guiVersion: '1.9.21',
    });
  });
});
