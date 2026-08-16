import { describe, expect, it, vi } from 'vitest';
import { startChannelProviderHost } from '@/process/services/codexAppServer/channelProviderHost';

describe('channelProviderHost', () => {
  it('loads the selected Framework public bootstrap and returns its disposable', async () => {
    const callback = {
      startThread: vi.fn(),
      resumeThread: vi.fn(),
      startTurn: vi.fn(),
      subscribeTurn: vi.fn(),
    };
    const disposable = { dispose: vi.fn(async () => undefined) };
    const bootstrap = vi.fn(async () => disposable);
    const loadBootstrap = vi.fn(async () => bootstrap);

    await expect(
      startChannelProviderHost({
        frameworkPackageRoot: '/selected/opl-framework',
        callback,
        loadBootstrap,
      })
    ).resolves.toBe(disposable);
    expect(loadBootstrap).toHaveBeenCalledWith('/selected/opl-framework');
    expect(bootstrap).toHaveBeenCalledWith({ callback });
  });

  it('rejects a Framework bootstrap that does not preserve lifecycle disposal', async () => {
    await expect(
      startChannelProviderHost({
        frameworkPackageRoot: '/selected/opl-framework',
        callback: {} as never,
        loadBootstrap: async () => vi.fn(async () => ({}) as never),
      })
    ).rejects.toThrow(/returned no disposable/);
  });
});
