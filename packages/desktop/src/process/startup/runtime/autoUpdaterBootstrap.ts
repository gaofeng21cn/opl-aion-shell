/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AutoUpdateStatus, StatusBroadcastCallback } from '../../services/autoUpdaterService';

type AutoUpdaterRuntime = {
  initialize: (statusBroadcast?: StatusBroadcastCallback) => void;
  checkForUpdatesAndNotify: () => Promise<void>;
};

export type AutoUpdaterBootstrapDeps = {
  env: NodeJS.ProcessEnv;
  loadAutoUpdater: () => Promise<AutoUpdaterRuntime>;
  loadStatusBroadcast: () => Promise<(status: AutoUpdateStatus) => void>;
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
          void autoUpdater
            .checkForUpdatesAndNotify()
            .catch((error) => deps.logError('[App] Startup auto-update check failed:', error));
        }, 3000);
      })
      .catch((error) => {
        deps.logError('[App] Failed to initialize autoUpdaterService:', error);
      });

    return bootstrap;
  };
}
