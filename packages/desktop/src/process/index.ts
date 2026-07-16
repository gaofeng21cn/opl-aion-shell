/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import '@/common/platform/register-electron';
// configureChromium sets app name (dev isolation) and Chromium flags — must run before other modules
import '@process/utils/configureChromium';

import { app } from 'electron';

// Force node-gyp-build to skip build/ directory and use prebuilds/ only in production
// This prevents loading wrong architecture binaries from development environment
// Only apply in packaged app to allow development builds to use build/Release/
if (app.isPackaged) {
  process.env.PREBUILDS_ONLY = '1';
}
import initStorage from './utils/initStorage';
import './utils/initBridge';
import './services/i18n'; // Initialize i18n for main process
import { runStartupMaintenanceForHost } from './bridge/oplRuntimeBridge';

export type InitializeProcessOptions = {
  hostKind: 'desktop' | 'web';
  initializeStorage?: () => Promise<void>;
  logWarn?: (message: string) => void;
  startStartupMaintenance?: typeof runStartupMaintenanceForHost;
};

export const initializeProcess = async (options: InitializeProcessOptions) => {
  const t0 = performance.now();
  const mark = (label: string) => console.log(`[AionUi:process] ${label} +${Math.round(performance.now() - t0)}ms`);

  await (options.initializeStorage ?? initStorage)();
  mark('initStorage');

  if (options.hostKind === 'desktop') {
    const recordFailure = (error: unknown) => {
      const record = {
        schema: 'opl.desktop_startup_maintenance.v1',
        observed_at: new Date().toISOString(),
        host_kind: 'desktop',
        surface: 'startup_maintenance',
        ok: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      };
      try {
        (options.logWarn ?? console.warn)(`[AionUi:opl-startup] ${JSON.stringify(record)}`);
      } catch {
        // Background maintenance and diagnostics must not block the Desktop startup path.
      }
    };
    try {
      const maintenanceTask = (options.startStartupMaintenance ?? runStartupMaintenanceForHost)(options.hostKind);
      void maintenanceTask.catch(recordFailure);
    } catch (error) {
      recordFailure(error);
    }
    mark('oplStartupMaintenanceScheduled');
  }
};
