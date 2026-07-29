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
} {
  const initialize = vi.fn();
  const checkForUpdatesAndNotify = vi.fn(async () => undefined);
  const schedule = vi.fn();

  return {
    deps: {
      env,
      loadAutoUpdater: vi.fn(async () => ({ initialize, checkForUpdatesAndNotify })),
      loadStatusBroadcast: vi.fn(async () => vi.fn()),
      schedule,
      logInfo: vi.fn(),
      logError: vi.fn(),
    },
    checkForUpdatesAndNotify,
    initialize,
    schedule,
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
    const { deps, checkForUpdatesAndNotify, initialize, schedule } = createDeps();
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
    await vi.waitFor(() => expect(checkForUpdatesAndNotify).toHaveBeenCalledTimes(1));
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
