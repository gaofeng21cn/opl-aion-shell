import { beforeEach, describe, expect, it, vi } from 'vitest';

const updater = vi.hoisted(() => ({
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  setFeedURL: vi.fn(),
  quitAndInstall: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));
vi.mock('electron-updater', () => ({ autoUpdater: updater }));
vi.mock('electron', () => ({ app: { getVersion: () => '26.8.2091', getPath: () => '/tmp/opl-updater-test' } }));
vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), transports: { file: {} } },
}));
vi.mock('@/process/services/autoUpdateDiagnostics', () => ({
  recordAutoUpdateInstallNotAppliedIfNeeded: vi.fn(),
  recordAutoUpdateQuitAndInstall: vi.fn(),
  recordAutoUpdateStatus: vi.fn(),
}));
vi.mock('@/process/services/autoUpdateCacheCleanup', () => ({
  getDefaultAutoUpdateCacheRoot: () => '/tmp/opl-updater-test',
  cleanupAutoUpdateCaches: () => ({ removedFiles: [], removedBytes: 0 }),
}));

import { autoUpdaterService } from '@/process/services/autoUpdaterService';

const target = { repo: 'gaofeng21cn/one-person-lab-app', tagName: 'v26.9.3', updaterVersion: '26.9.391' };

describe('background App update service', () => {
  beforeEach(() => {
    autoUpdaterService.resetForTest();
    vi.clearAllMocks();
    updater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: target.updaterVersion },
    });
    updater.downloadUpdate.mockResolvedValue([]);
    autoUpdaterService.initialize();
  });

  it('retries after no update or transport failure and merges concurrent checks', async () => {
    await autoUpdaterService.checkForUpdatesAndNotify(null);
    updater.checkForUpdates.mockRejectedValueOnce(new Error('offline'));
    await expect(autoUpdaterService.checkForUpdatesAndNotify(target)).rejects.toThrow('offline');
    await Promise.all([
      autoUpdaterService.checkForUpdatesAndNotify(target),
      autoUpdaterService.checkForUpdatesAndNotify(target),
    ]);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });

  it('rejects mismatched release bytes before download', async () => {
    updater.checkForUpdates.mockResolvedValue({ isUpdateAvailable: true, updateInfo: { version: '26.9.292' } });
    await expect(autoUpdaterService.checkForUpdatesAndNotify(target)).rejects.toThrow('Exact updater release mismatch');
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
  });

  it('preserves an in-progress download and a downloaded pending installer', async () => {
    const progress = updater.on.mock.calls.find(([event]) => event === 'download-progress')?.[1];
    progress({ bytesPerSecond: 1, percent: 25, transferred: 1, total: 4 });
    await autoUpdaterService.checkForUpdatesAndNotify(target);
    expect(autoUpdaterService.getStatusSnapshot()?.status).toBe('downloading');
    const downloaded = updater.on.mock.calls.find(([event]) => event === 'update-downloaded')?.[1];
    downloaded({ version: target.updaterVersion });
    await autoUpdaterService.checkForUpdatesAndNotify(null);
    expect(autoUpdaterService.getStatusSnapshot()?.status).toBe('downloaded');
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });
});
