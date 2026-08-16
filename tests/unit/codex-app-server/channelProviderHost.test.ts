import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  runActiveChannelProviderAccess,
  setActiveChannelProviderHost,
  startChannelProviderHost,
} from '@/process/services/codexAppServer/channelProviderHost';

describe('channelProviderHost', () => {
  afterEach(() => setActiveChannelProviderHost(null));

  it('loads the selected Framework public bootstrap and returns its bounded handle', async () => {
    const callback = {
      startThread: vi.fn(),
      resumeThread: vi.fn(),
      startTurn: vi.fn(),
      subscribeTurn: vi.fn(),
    };
    const handle = {
      dispose: vi.fn(async () => undefined),
      appStatePatch: vi.fn(() => ({ ui_contributions: { entries: [] } })),
      readChannelAccess: vi.fn(async () => ({})),
      executeChannelAccessAction: vi.fn(async () => ({})),
    };
    const bootstrap = vi.fn(async () => handle);
    const loadBootstrap = vi.fn(async () => bootstrap);

    await expect(
      startChannelProviderHost({
        frameworkPackageRoot: '/selected/opl-framework',
        callback,
        loadBootstrap,
      })
    ).resolves.toBe(handle);
    expect(loadBootstrap).toHaveBeenCalledWith('/selected/opl-framework');
    expect(bootstrap).toHaveBeenCalledWith({ callback });
  });

  it('rejects a Framework bootstrap that does not expose the bounded access handle', async () => {
    await expect(
      startChannelProviderHost({
        frameworkPackageRoot: '/selected/opl-framework',
        callback: {} as never,
        loadBootstrap: async () => vi.fn(async () => ({}) as never),
      })
    ).rejects.toThrow(/invalid handle/);
  });

  it('routes only descriptor-projected channel_access refs to the active Host', async () => {
    const readback = { opl_app_contribution: { response: { ok: true } } };
    const host = {
      dispose: vi.fn(),
      appStatePatch: () => ({
        ui_contributions: {
          entries: [
            {
              package_id: 'opl-channel-weixin',
              view: { view_type: 'channel_access', data_ref: 'weixin.channel.state' },
              commands: [{ action_ref: 'weixin.channel.connect' }],
            },
          ],
        },
      }),
      readChannelAccess: vi.fn(async () => readback),
      executeChannelAccessAction: vi.fn(async () => readback),
    };
    setActiveChannelProviderHost(Promise.resolve(host));

    await expect(
      runActiveChannelProviderAccess(
        {
          package_id: 'opl-channel-weixin',
          ref: 'weixin.channel.state',
        },
        'read'
      )
    ).resolves.toBe(readback);
    await expect(
      runActiveChannelProviderAccess(
        {
          package_id: 'opl-channel-weixin',
          ref: 'other.ref',
        },
        'read'
      )
    ).resolves.toBeUndefined();
    await expect(
      runActiveChannelProviderAccess(
        {
          package_id: 'opl-channel-weixin',
          ref: 'weixin.channel.connect',
        },
        'execute'
      )
    ).resolves.toBe(readback);
    expect(host.readChannelAccess).toHaveBeenCalledOnce();
    expect(host.executeChannelAccessAction).toHaveBeenCalledOnce();
  });
});
