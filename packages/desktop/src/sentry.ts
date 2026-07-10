/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Sentry from '@sentry/electron/main';
import { app, type BrowserWindow } from 'electron';
import { getOrCreateAnalyticsId } from './process/utils/analyticsId';
import { readAutoUpdateDiagnostics } from './process/services/autoUpdateDiagnostics';
import { collectBackendInstallDiagnostics } from './process/startup/backendInstallDiagnostics';
import { classifyBackendStartupFailure } from './process/startup/backendStartupFailure';

// 抑制 Chromium GPU 崩溃噪声（参见 ELECTRON-9A / ELECTRON-9D）：
// 自愈逻辑在 gpuRecovery 中处理，事件流量已无价值。
const GPU_CRASH_DROP_PATTERNS = [
  /'GPU' process exited with /,
  /IntentionallyCrashBrowserForUnusableGpuProcess/,
  /GPU process isn't usable\. Goodbye/,
];
const BACKEND_STARTUP_SECONDARY_DROP_PATTERNS = [
  /globalThis\.__backendPort unset/,
  /window\.__backendPort/,
  /Failed to fetch/,
  /ECONNREFUSED/,
];

type SearchableEvent = {
  message?: unknown;
  exception?: { values?: unknown[] };
  contexts?: Record<string, unknown>;
  extra?: Record<string, unknown>;
};

function collectStringLeaves(value: unknown, haystacks: string[], seen = new WeakSet<object>(), depth = 0): void {
  if (typeof value === 'string') {
    haystacks.push(value);
    return;
  }
  if (!value || typeof value !== 'object' || depth > 6) {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringLeaves(item, haystacks, seen, depth + 1);
    }
    return;
  }
  for (const item of Object.values(value as Record<string, unknown>)) {
    collectStringLeaves(item, haystacks, seen, depth + 1);
  }
}

function collectEventSearchText(event: SearchableEvent): string[] {
  const haystacks: string[] = [];
  if (typeof event.message === 'string') haystacks.push(event.message);
  const exceptions = event.exception?.values ?? [];
  for (const ex of exceptions) {
    if (!ex || typeof ex !== 'object') continue;
    const value = (ex as { value?: unknown }).value;
    if (typeof value === 'string') haystacks.push(value);
    const frames = (ex as { stacktrace?: { frames?: unknown[] } }).stacktrace?.frames ?? [];
    for (const frame of frames) {
      if (!frame || typeof frame !== 'object') continue;
      const fn = (frame as { function?: unknown }).function;
      if (typeof fn === 'string') haystacks.push(fn);
    }
  }
  collectStringLeaves(event.contexts, haystacks);
  collectStringLeaves(event.extra, haystacks);
  return haystacks;
}

function hasBackendStartupFailed(): boolean {
  return (globalThis as typeof globalThis & { __backendStartupFailed?: boolean }).__backendStartupFailed === true;
}

function isBackendStartupFailureEvent(event: { tags?: Record<string, unknown> }): boolean {
  return event.tags?.['aionui.failure'] === 'backend_startup';
}

function isBackendStartupSecondaryEvent(event: { tags?: Record<string, unknown> }, haystacks: string[]): boolean {
  if (isBackendStartupFailureEvent(event)) {
    return false;
  }
  return (
    hasBackendStartupFailed() && BACKEND_STARTUP_SECONDARY_DROP_PATTERNS.some((re) => haystacks.some((h) => re.test(h)))
  );
}

export function initSentry(): void {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: app.isPackaged ? 'production' : 'development',
    beforeSend(event) {
      const haystacks = collectEventSearchText(event);
      if (GPU_CRASH_DROP_PATTERNS.some((re) => haystacks.some((h) => re.test(h)))) {
        return null;
      }
      if (isBackendStartupSecondaryEvent(event, haystacks)) {
        return null;
      }
      return event;
    },
  });

  Sentry.setTag('app.arch', process.arch);
  Sentry.setTag('app.version', app.getVersion());
  Sentry.setTag('os.name', process.platform);
}

/**
 * Attach the persistent anonymous installation id to the active Sentry scope
 * so crashes and explicitly submitted feedback carry a stable device
 * identifier.
 */
export function setSentryDeviceId(): void {
  const id = getOrCreateAnalyticsId();
  Sentry.setUser({ id });
  Sentry.setTag('device_id', id);
}

function getBackendStartupDetails(error: unknown): Record<string, unknown> | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const details = (error as { details?: unknown }).details;
  if (!details || typeof details !== 'object') return undefined;
  return details as Record<string, unknown>;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getBooleanTagValue(value: boolean | undefined): string | undefined {
  return typeof value === 'boolean' ? String(value) : undefined;
}

function getFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getNumberBucket(value: unknown, buckets: readonly [number, string][], overflow: string): string | undefined {
  const numberValue = getFiniteNumber(value);
  if (numberValue === undefined) return undefined;
  for (const [max, label] of buckets) {
    if (numberValue <= max) return label;
  }
  return overflow;
}

function getHealthAttemptBucket(value: unknown): string | undefined {
  return getNumberBucket(
    value,
    [
      [1, '1'],
      [25, '2-25'],
      [75, '26-75'],
      [150, '76-150'],
    ],
    '151+'
  );
}

function getDurationBucket(value: unknown): string | undefined {
  return getNumberBucket(
    value,
    [
      [0, '0ms'],
      [1_000, '1s_or_less'],
      [10_000, '1s_to_10s'],
      [60_000, '10s_to_60s'],
    ],
    'over_60s'
  );
}

function getInstallPathKind(resourcesPath: unknown): string | undefined {
  const pathValue = getString(resourcesPath);
  if (!pathValue) return undefined;

  const normalized = pathValue.replace(/\//g, '\\').toLowerCase();
  if (normalized.includes('\\appdata\\local\\programs\\aionui\\resources')) {
    return 'user_local_programs';
  }
  if (
    normalized.includes('\\program files\\aionui\\resources') ||
    normalized.includes('\\program files (x86)\\aionui\\resources')
  ) {
    return 'program_files';
  }
  if (pathValue.startsWith('/Applications/') && pathValue.includes('.app/Contents/Resources')) {
    return 'mac_applications';
  }
  if (pathValue.startsWith('/opt/')) {
    return 'linux_opt';
  }
  return 'custom';
}

function getSecondsSince(timestamp: string | undefined): string | undefined {
  if (!timestamp) return undefined;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return undefined;
  const elapsedSeconds = Math.floor((Date.now() - parsed) / 1000);
  return elapsedSeconds >= 0 ? String(elapsedSeconds) : undefined;
}

const BACKEND_STARTUP_FLUSH_TIMEOUT_MS = 2000;

export async function captureBackendStartupFailure(error: unknown): Promise<void> {
  (globalThis as typeof globalThis & { __backendStartupFailed?: boolean }).__backendStartupFailed = true;
  const capturedError = error instanceof Error ? error : new Error(String(error));
  const details = getBackendStartupDetails(error);
  const failureInfo = classifyBackendStartupFailure(error);
  const installDiagnostics = collectBackendInstallDiagnostics(details, {
    appVersion: app.getVersion(),
    arch: process.arch,
    execPath: process.execPath,
    isPackaged: app.isPackaged,
    platform: process.platform,
    resourcesPath: process.resourcesPath,
  });
  const autoUpdateDiagnostics = readAutoUpdateDiagnostics(app.getPath('userData'));
  Sentry.withScope((scope) => {
    scope.setTag('aionui.failure', 'backend_startup');
    scope.setTag('aionui.backend_startup.reason', failureInfo.reason);
    if (failureInfo.runtime) {
      scope.setTag('aionui.backend_startup.runtime', failureInfo.runtime);
    }
    if (failureInfo.packageArch) {
      scope.setTag('aionui.backend_startup.package_arch', failureInfo.packageArch);
    }
    if (failureInfo.deviceArch) {
      scope.setTag('aionui.backend_startup.device_arch', failureInfo.deviceArch);
    }
    if (failureInfo.expectedDownloadArch) {
      scope.setTag('aionui.backend_startup.expected_download_arch', failureInfo.expectedDownloadArch);
    }
    if (typeof failureInfo.isRosettaTranslated === 'boolean') {
      scope.setTag('aionui.backend_startup.rosetta_translated', getBooleanTagValue(failureInfo.isRosettaTranslated));
    }
    if (typeof details?.stage === 'string') {
      scope.setTag('aionui.backend_startup.stage', details.stage);
    }
    if (failureInfo.incompleteInstallationKind) {
      scope.setTag('aionui.backend_startup.incomplete_installation_kind', failureInfo.incompleteInstallationKind);
    }
    for (const [tag, value] of [
      ['aionui.backend_startup.missing_bundled_dir', getBooleanTagValue(failureInfo.missingBundledAioncoreDir)],
      ['aionui.backend_startup.missing_runtime_dir', getBooleanTagValue(failureInfo.missingRuntimeDir)],
      ['aionui.backend_startup.missing_binary', getBooleanTagValue(failureInfo.missingBackendBinary)],
      ['aionui.backend_startup.missing_hub_dir', getBooleanTagValue(failureInfo.missingHubDir)],
      ['aionui.backend_startup.missing_pet_states_dir', getBooleanTagValue(failureInfo.missingPetStatesDir)],
      ['aionui.backend_startup.missing_pwa_dir', getBooleanTagValue(failureInfo.missingPwaDir)],
      ['aionui.backend_startup.install_path_kind', getInstallPathKind(details?.resourcesPath)],
      ['aionui.backend_startup.last_update_status', getString(autoUpdateDiagnostics?.lastEvent?.status)],
      [
        'aionui.backend_startup.health_polling_delayed',
        getBooleanTagValue(
          typeof details?.healthCheckPollingDelayed === 'boolean' ? details.healthCheckPollingDelayed : undefined
        ),
      ],
      ['aionui.backend_startup.health_attempts_bucket', getHealthAttemptBucket(details?.healthCheckAttempts)],
      [
        'aionui.backend_startup.health_attempt_deficit_bucket',
        getHealthAttemptBucket(details?.healthCheckAttemptDeficit),
      ],
      ['aionui.backend_startup.health_timeout_overrun_bucket', getDurationBucket(details?.healthCheckTimeoutOverrunMs)],
      ['aionui.backend_startup.health_max_attempt_gap_bucket', getDurationBucket(details?.healthCheckMaxAttemptGapMs)],
      [
        'aionui.backend_startup.seconds_since_quit_and_install',
        getSecondsSince(autoUpdateDiagnostics?.lastQuitAndInstallAt),
      ],
    ] as const) {
      if (value) scope.setTag(tag, value);
    }
    if (details) {
      scope.setContext('aioncore_startup', details);
      scope.setExtra('aioncore_startup', details);
    }
    scope.setContext('aioncore_startup_classification', { ...failureInfo });
    scope.setExtra('aioncore_startup_classification', failureInfo);
    scope.setContext('aioncore_install_diagnostics', installDiagnostics);
    scope.setExtra('aioncore_install_diagnostics', installDiagnostics);
    if (autoUpdateDiagnostics) {
      scope.setContext('auto_update_diagnostics', autoUpdateDiagnostics);
      scope.setExtra('auto_update_diagnostics', autoUpdateDiagnostics);
    }
    Sentry.captureException(capturedError);
  });
  try {
    await Sentry.flush(BACKEND_STARTUP_FLUSH_TIMEOUT_MS);
  } catch {
    // If Sentry cannot flush during fatal startup, keep shutdown deterministic.
  }
}

/**
 * Retained for the existing startup caller. Diagnostic logs are attached only
 * through explicit opt-in in the feedback form.
 */
export function scheduleStartupLogReport(_window: BrowserWindow): void {
  return;
}
