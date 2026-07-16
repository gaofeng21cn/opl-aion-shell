import { describe, expect, it, vi } from 'vitest';

vi.mock('@/common/platform/register-electron', () => ({}));
vi.mock('@process/utils/configureChromium', () => ({}));
vi.mock('electron', () => ({ app: { isPackaged: false } }));
vi.mock('@/process/utils/initBridge', () => ({}));
vi.mock('@/process/services/i18n', () => ({}));
vi.mock('@/process/utils/initStorage', () => ({ default: vi.fn() }));
vi.mock('@/process/bridge/oplRuntimeBridge', () => ({ runStartupMaintenanceForHost: vi.fn() }));

import { initializeProcess } from '@/process';

describe('initializeProcess startup maintenance', () => {
  it('waits for storage but does not wait for pending Desktop maintenance', async () => {
    let storageCompleted = false;
    const pendingMaintenance = new Promise<never>(() => {});
    const startStartupMaintenance = vi.fn(() => {
      expect(storageCompleted).toBe(true);
      return pendingMaintenance;
    });

    await initializeProcess({
      hostKind: 'desktop',
      initializeStorage: async () => {
        storageCompleted = true;
      },
      startStartupMaintenance,
    });

    expect(startStartupMaintenance).toHaveBeenCalledTimes(1);
  });

  it('never starts Desktop maintenance for Web', async () => {
    const startStartupMaintenance = vi.fn();

    await initializeProcess({
      hostKind: 'web',
      initializeStorage: async () => {},
      startStartupMaintenance,
    });

    expect(startStartupMaintenance).not.toHaveBeenCalled();
  });

  it('captures a rejected background task without rejecting process initialization', async () => {
    const logWarn = vi.fn();
    await initializeProcess({
      hostKind: 'desktop',
      initializeStorage: async () => {},
      startStartupMaintenance: () => Promise.reject(new Error('background failure')),
      logWarn,
    });
    await Promise.resolve();

    expect(logWarn).toHaveBeenCalledTimes(1);
    expect(logWarn.mock.calls[0]?.[0]).toContain('background failure');
  });
});
