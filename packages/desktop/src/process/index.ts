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

type InitializeProcessOptions = {
  hostKind: 'desktop' | 'web';
  initializeStorage?: () => Promise<void>;
  logWarn?: (message: string) => void;
};

export const initializeProcess = async (options: InitializeProcessOptions) => {
  const t0 = performance.now();
  const mark = (label: string) => console.log(`[AionUi:process] ${label} +${Math.round(performance.now() - t0)}ms`);

  await (options.initializeStorage ?? initStorage)();
  mark('initStorage');

  if (options.hostKind === 'desktop') {
    try {
      await runStartupMaintenanceForHost(options.hostKind);
    } catch (error) {
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
      (options.logWarn ?? console.warn)(`[AionUi:opl-startup] ${JSON.stringify(record)}`);
    }
    mark('oplStartupMaintenance');
  }
};
