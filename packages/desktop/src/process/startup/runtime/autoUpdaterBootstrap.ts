/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { UpdateCheckResult } from '../../../common/update/updateTypes';
import type { UpdaterReleaseChannel } from '../../../common/update/updateChannel';
import type {
  AutoUpdaterReleaseTarget,
  AutoUpdateStatus,
  StatusBroadcastCallback,
} from '../../services/autoUpdaterService';

type AutoUpdaterRuntime = {
  initialize: (statusBroadcast?: StatusBroadcastCallback) => void;
  checkForUpdatesAndNotify: (target: AutoUpdaterReleaseTarget | null) => Promise<void>;
};

export type AutoUpdaterBootstrapDeps = {
  env: NodeJS.ProcessEnv;
  loadAutoUpdater: () => Promise<AutoUpdaterRuntime>;
  loadStatusBroadcast: () => Promise<(status: AutoUpdateStatus) => void>;
  loadUpdateChannel: () => Promise<UpdaterReleaseChannel>;
  resolveUpdateCheck: (channel: UpdaterReleaseChannel) => Promise<UpdateCheckResult>;
  schedule: (callback: () => void, delayMs: number) => unknown;
  cancelSchedule?: (timer: unknown) => void;
  onResume?: (callback: () => void) => void;
  now?: () => number;
  logInfo: (message: string) => void;
  logError: (message: string, error: unknown) => void;
};

export function isAutoUpdaterDisabled(env: NodeJS.ProcessEnv): boolean {
  const isCiRuntime = env.CI === 'true' || env.CI === '1' || env.GITHUB_ACTIONS === 'true';
  return env.AIONUI_DISABLE_AUTO_UPDATE === '1' || env.AIONUI_E2E_TEST === '1' || isCiRuntime;
}

const defaultDeps: AutoUpdaterBootstrapDeps = {
  env: process.env,
  loadAutoUpdater: async () => (await import('../../services/autoUpdaterService')).autoUpdaterService,
  loadStatusBroadcast: async () => (await import('../../bridge/updateBridge')).createAutoUpdateStatusBroadcast(),
  loadUpdateChannel: async () => (await import('../../bridge/oplRuntimeBridge')).readOplAppUpdaterReleaseChannel(),
  resolveUpdateCheck: async (channel) => (await import('../../bridge/updateBridge')).resolveUpdateCheck({ channel }),
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancelSchedule: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  onResume: (callback) => {
    void import('electron').then(({ powerMonitor, app }) => {
      powerMonitor.on('resume', callback);
      app.once('before-quit', () => powerMonitor.removeListener('resume', callback));
    });
  },
  logInfo: (message) => console.log(message),
  logError: (message, error) => console.error(message, error),
};

export function createAutoUpdaterBootstrap(deps: AutoUpdaterBootstrapDeps = defaultDeps): () => Promise<void> {
  let bootstrap: Promise<void> | null = null;

  return () => {
    if (bootstrap) return bootstrap;

    if (isAutoUpdaterDisabled(deps.env)) {
      deps.logInfo('[AionUi] Auto-updater disabled via env/CI guard');
      bootstrap = Promise.resolve();
      return bootstrap;
    }

    bootstrap = Promise.all([deps.loadAutoUpdater(), deps.loadStatusBroadcast()])
      .then(([autoUpdater, statusBroadcast]) => {
        autoUpdater.initialize(statusBroadcast);
        const now = deps.now ?? Date.now;
        let timer: unknown;
        let dueAt = 0;
        let running = false;
        let failures = 0;
        const scheduleCheck = (delayMs: number) => {
          dueAt = now() + delayMs;
          timer = deps.schedule(() => {
            void check();
          }, delayMs);
        };
        const check = async () => {
          if (running) return;
          running = true;
          let delayMs = 6 * 60 * 60 * 1000;
          try {
            const channel = await deps.loadUpdateChannel();
            const decision = await deps.resolveUpdateCheck(channel);
            const target =
              decision.updateAvailable && decision.latest
                ? {
                    repo: 'gaofeng21cn/one-person-lab-app',
                    tagName: decision.latest.tagName,
                    updaterVersion: decision.latest.updaterVersion,
                  }
                : null;
            await autoUpdater.checkForUpdatesAndNotify(target);
            failures = 0;
          } catch (error) {
            deps.logError('[App] Background auto-update check failed:', error);
            failures += 1;
            if (failures <= 3) delayMs = 30 * 60 * 1000;
            else failures = 0;
          } finally {
            running = false;
            scheduleCheck(delayMs);
          }
        };
        deps.onResume?.(() => {
          if (running || now() < dueAt) return;
          deps.cancelSchedule?.(timer);
          void check();
        });
        scheduleCheck(3000);
      })
      .catch((error) => {
        deps.logError('[App] Failed to initialize autoUpdaterService:', error);
      });

    return bootstrap;
  };
}
