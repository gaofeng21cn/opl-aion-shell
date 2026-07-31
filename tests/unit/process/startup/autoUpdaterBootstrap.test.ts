/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  createAutoUpdaterBootstrap,
  isAutoUpdaterDisabled,
  type AutoUpdaterBootstrapDeps,
} from '@/process/startup/runtime/autoUpdaterBootstrap';

function createDeps(env: NodeJS.ProcessEnv = {}): {
  deps: AutoUpdaterBootstrapDeps;
  checkForUpdatesAndNotify: ReturnType<typeof vi.fn>;
  initialize: ReturnType<typeof vi.fn>;
  schedule: ReturnType<typeof vi.fn>;
  loadUpdateChannel: ReturnType<typeof vi.fn>;
  resolveUpdateCheck: ReturnType<typeof vi.fn>;
} {
  const initialize = vi.fn();
  const checkForUpdatesAndNotify = vi.fn(async () => undefined);
  const schedule = vi.fn();
  const loadUpdateChannel = vi.fn(async () => 'stable' as const);
  const resolveUpdateCheck = vi.fn(async () => ({
    currentVersion: '26.7.2803',
    updateAvailable: false,
    channel: 'stable' as const,
  }));

  return {
    deps: {
      env,
      loadAutoUpdater: vi.fn(async () => ({ initialize, checkForUpdatesAndNotify })),
      loadStatusBroadcast: vi.fn(async () => vi.fn()),
      loadUpdateChannel,
      resolveUpdateCheck,
      schedule,
      logInfo: vi.fn(),
      logError: vi.fn(),
    },
    checkForUpdatesAndNotify,
    initialize,
    schedule,
    loadUpdateChannel,
    resolveUpdateCheck,
  };
}

describe('createAutoUpdaterBootstrap', () => {
  it.each([{ AIONUI_DISABLE_AUTO_UPDATE: '1' }, { AIONUI_E2E_TEST: '1' }, { CI: 'true' }, { GITHUB_ACTIONS: 'true' }])(
    'honors the existing disable guard for %o',
    (env) => {
      expect(isAutoUpdaterDisabled(env)).toBe(true);
    }
  );

  it('initializes and schedules exactly one startup check across repeated callers', async () => {
    const { deps, checkForUpdatesAndNotify, initialize, schedule, loadUpdateChannel, resolveUpdateCheck } =
      createDeps();
    const bootstrap = createAutoUpdaterBootstrap(deps);

    const first = bootstrap();
    const second = bootstrap();
    await Promise.all([first, second]);

    expect(first).toBe(second);
    expect(deps.loadAutoUpdater).toHaveBeenCalledTimes(1);
    expect(deps.loadStatusBroadcast).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 3000);

    const scheduledCheck = schedule.mock.calls[0]?.[0] as (() => void) | undefined;
    expect(scheduledCheck).toBeTypeOf('function');
    scheduledCheck?.();
    await vi.waitFor(() => expect(checkForUpdatesAndNotify).toHaveBeenCalledWith(null));
    expect(loadUpdateChannel).toHaveBeenCalledTimes(1);
    expect(resolveUpdateCheck).toHaveBeenCalledWith('stable');
  });

  it('uses the persisted Preview channel and exact highest eligible release for startup checks', async () => {
    const { deps, checkForUpdatesAndNotify, schedule, loadUpdateChannel, resolveUpdateCheck } = createDeps();
    loadUpdateChannel.mockResolvedValue('nightly');
    resolveUpdateCheck.mockResolvedValue({
      currentVersion: '26.7.2803',
      updateAvailable: true,
      channel: 'nightly',
      latest: {
        tagName: 'v26.7.31-nightly',
        version: '26.7.31-nightly',
        updaterVersion: '26.7.3190-nightly.0',
        htmlUrl: 'https://github.com/gaofeng21cn/one-person-lab-app/releases/tag/v26.7.31-nightly',
        prerelease: true,
        draft: false,
        assets: [],
      },
    });
    const bootstrap = createAutoUpdaterBootstrap(deps);

    await bootstrap();
    const scheduledCheck = schedule.mock.calls[0]?.[0] as (() => void) | undefined;
    scheduledCheck?.();

    await vi.waitFor(() =>
      expect(checkForUpdatesAndNotify).toHaveBeenCalledWith({
        repo: 'gaofeng21cn/one-person-lab-app',
        tagName: 'v26.7.31-nightly',
        updaterVersion: '26.7.3190-nightly.0',
      })
    );
    expect(resolveUpdateCheck).toHaveBeenCalledWith('nightly');
  });

  it('does not load updater modules when the runtime guard disables updates', async () => {
    const { deps, schedule } = createDeps({ CI: '1' });
    const bootstrap = createAutoUpdaterBootstrap(deps);

    await Promise.all([bootstrap(), bootstrap()]);

    expect(deps.loadAutoUpdater).not.toHaveBeenCalled();
    expect(deps.loadStatusBroadcast).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
    expect(deps.logInfo).toHaveBeenCalledTimes(1);
  });

  it('fails open once when updater modules cannot be loaded', async () => {
    const { deps } = createDeps();
    vi.mocked(deps.loadAutoUpdater).mockRejectedValue(new Error('missing updater config'));
    const bootstrap = createAutoUpdaterBootstrap(deps);

    await bootstrap();
    await bootstrap();

    expect(deps.loadAutoUpdater).toHaveBeenCalledTimes(1);
    expect(deps.logError).toHaveBeenCalledTimes(1);
  });
});
