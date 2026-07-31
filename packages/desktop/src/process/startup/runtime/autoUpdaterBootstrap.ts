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
        deps.schedule(() => {
          void (async () => {
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
          })().catch((error) => deps.logError('[App] Startup auto-update check failed:', error));
        }, 3000);
      })
      .catch((error) => {
        deps.logError('[App] Failed to initialize autoUpdaterService:', error);
      });

    return bootstrap;
  };
}
