/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Electron and Sentry are mocked so this suite runs under the `node` Vitest
 * project.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.0-test', getPath: () => '/tmp', isPackaged: false },
}));

let sentryInitOptions: { beforeSend?: (event: unknown) => unknown } | undefined;
const scopeSetContext = vi.fn();
const scopeSetExtra = vi.fn();
const scopeSetTag = vi.fn();

vi.mock('@sentry/electron/main', () => ({
  init: vi.fn((options: { beforeSend?: (event: unknown) => unknown }) => {
    sentryInitOptions = options;
  }),
  setTag: vi.fn(),
  setUser: vi.fn(),
  withScope: vi.fn((callback: (scope: unknown) => void) => {
    callback({
      setTag: scopeSetTag,
      setExtra: scopeSetExtra,
      setContext: scopeSetContext,
    });
  }),
  captureException: vi.fn(),
  captureEvent: vi.fn(),
  captureMessage: vi.fn(),
  flush: vi.fn(async () => true),
}));

vi.mock('@/process/utils/analyticsId', () => ({
  getOrCreateAnalyticsId: () => 'test-device-id',
}));

const autoUpdateDiagnosticsMock = vi.hoisted(() => ({
  readAutoUpdateDiagnostics: vi.fn(),
}));

vi.mock('@/process/services/autoUpdateDiagnostics', () => ({
  readAutoUpdateDiagnostics: autoUpdateDiagnosticsMock.readAutoUpdateDiagnostics,
}));

import * as Sentry from '@sentry/electron/main';
import { captureBackendStartupFailure, initSentry, scheduleStartupLogReport } from '@/sentry';

describe('scheduleStartupLogReport', () => {
  it('does not schedule automatic log uploads even when a DSN is configured', () => {
    vi.useFakeTimers();
    const previousDsn = process.env.SENTRY_DSN;
    process.env.SENTRY_DSN = 'https://public@example.invalid/1';

    try {
      scheduleStartupLogReport({
        webContents: {
          isLoading: () => false,
          once: vi.fn(),
        },
      } as Parameters<typeof scheduleStartupLogReport>[0]);

      expect(vi.getTimerCount()).toBe(0);
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    } finally {
      if (previousDsn === undefined) {
        delete process.env.SENTRY_DSN;
      } else {
        process.env.SENTRY_DSN = previousDsn;
      }
      vi.useRealTimers();
    }
  });
});

describe('captureBackendStartupFailure', () => {
  it('captures and flushes a dedicated backend startup failure with diagnostics', async () => {
    autoUpdateDiagnosticsMock.readAutoUpdateDiagnostics.mockReturnValue(undefined);
    const error = new Error('aioncore failed to start within timeout') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'health_timeout',
      binaryPath: '/abs/path/aioncore',
      port: 33334,
      stderrTail: 'database is locked',
    };

    await captureBackendStartupFailure(error);

    expect(Sentry.captureException).toHaveBeenCalledWith(error);
    expect(Sentry.flush).toHaveBeenCalledWith(2000);
    expect(Sentry.withScope).toHaveBeenCalledOnce();
    expect(scopeSetContext).toHaveBeenCalledWith(
      'aioncore_install_diagnostics',
      expect.objectContaining({
        appVersion: '0.0.0-test',
        isPackaged: false,
        platform: process.platform,
      })
    );
  });

  it('sets flattened incomplete-installation tags for update-related missing directory resources', async () => {
    scopeSetTag.mockClear();
    scopeSetContext.mockClear();
    autoUpdateDiagnosticsMock.readAutoUpdateDiagnostics.mockReturnValue({
      currentAppVersion: '2.1.8',
      events: [],
      lastEvent: {
        at: '2026-06-01T22:41:03.273Z',
        status: 'quit-and-install',
      },
      lastQuitAndInstallAt: '2026-06-01T22:41:03.273Z',
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T22:41:49.273Z'));

    try {
      const error = new Error('aioncore startup failed while resolving backend binary') as Error & {
        details?: Record<string, unknown>;
      };
      error.details = {
        stage: 'resolve_binary',
        isPackaged: true,
        runtimeKey: 'win32-x64',
        binaryName: 'aioncore.exe',
        resourcesPath: 'C:\\Users\\alice\\AppData\\Local\\Programs\\AionUi\\resources',
        bundledDirExists: false,
        runtimeDirExists: false,
        resourcesDirEntries: [
          'app-update.yml',
          'app.asar',
          'app.asar.unpacked/',
          'app.png',
          'elevate.exe',
          'manifest.webmanifest',
          'sw.js',
        ],
      };

      await captureBackendStartupFailure(error);

      expect(scopeSetTag).toHaveBeenCalledWith(
        'aionui.backend_startup.incomplete_installation_kind',
        'missing_directory_resources'
      );
      expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.missing_bundled_dir', 'true');
      expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.missing_runtime_dir', 'true');
      expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.missing_binary', 'true');
      expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.missing_hub_dir', 'true');
      expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.last_update_status', 'quit-and-install');
      expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.seconds_since_quit_and_install', '46');
      expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.install_path_kind', 'user_local_programs');
      expect(scopeSetContext).toHaveBeenCalledWith(
        'aioncore_startup_classification',
        expect.objectContaining({
          incompleteInstallationKind: 'missing_directory_resources',
          missingBundledAioncoreDir: true,
          missingRuntimeDir: true,
          missingBackendBinary: true,
        })
      );
    } finally {
      vi.useRealTimers();
      autoUpdateDiagnosticsMock.readAutoUpdateDiagnostics.mockReturnValue(undefined);
    }
  });

  it('sets bucketed health polling tags for backend startup timeouts', async () => {
    scopeSetTag.mockClear();
    autoUpdateDiagnosticsMock.readAutoUpdateDiagnostics.mockReturnValue(undefined);
    const error = new Error('aioncore failed to start within timeout') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'health_timeout',
      binaryPath: '/abs/path/aioncore',
      port: 33334,
      healthCheckAttempts: 1,
      healthCheckExpectedAttempts: 150,
      healthCheckAttemptDeficit: 149,
      healthCheckPollingDelayed: true,
      healthCheckTimeoutOverrunMs: 515_417,
      healthCheckMaxAttemptGapMs: 0,
    };

    await captureBackendStartupFailure(error);

    expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.health_polling_delayed', 'true');
    expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.health_attempts_bucket', '1');
    expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.health_attempt_deficit_bucket', '76-150');
    expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.health_timeout_overrun_bucket', 'over_60s');
    expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.health_max_attempt_gap_bucket', '0ms');
  });
});

describe('initSentry beforeSend', () => {
  it('drops native GPU unusable crashes reported only through crashpad context', () => {
    initSentry();

    const event = {
      contexts: {
        electron: {
          'crashpad.LOG_FATAL': "gpu_data_manager_impl_private.cc:415: GPU process isn't usable. Goodbye.\n",
        },
      },
    };

    expect(sentryInitOptions?.beforeSend?.(event)).toBeNull();
  });

  it('keeps native shutdown fatal crashes while filtering GPU crashpad noise', () => {
    initSentry();

    const event = {
      contexts: {
        electron: {
          'crashpad.LOG_FATAL': 'electron_browser_main_parts.cc:501: Failed to shutdown.\n',
        },
      },
    };

    expect(sentryInitOptions?.beforeSend?.(event)).toBe(event);
  });

  it('drops backend-port secondary errors after backend startup already failed', () => {
    initSentry();
    (globalThis as { __backendStartupFailed?: boolean }).__backendStartupFailed = true;

    const event = {
      exception: {
        values: [
          {
            value: '[WebUI] Cannot start: aioncore is not running (globalThis.__backendPort unset)',
          },
        ],
      },
    };

    expect(sentryInitOptions?.beforeSend?.(event)).toBeNull();

    delete (globalThis as { __backendStartupFailed?: boolean }).__backendStartupFailed;
  });

  it('keeps the primary backend startup failure even when its details contain secondary text', () => {
    initSentry();
    (globalThis as { __backendStartupFailed?: boolean }).__backendStartupFailed = true;

    const event = {
      tags: {
        'aionui.failure': 'backend_startup',
      },
      exception: {
        values: [
          {
            value: 'BackendStartupError: connect ECONNREFUSED 127.0.0.1:33334',
          },
        ],
      },
    };

    expect(sentryInitOptions?.beforeSend?.(event)).toBe(event);

    delete (globalThis as { __backendStartupFailed?: boolean }).__backendStartupFailed;
  });
});
