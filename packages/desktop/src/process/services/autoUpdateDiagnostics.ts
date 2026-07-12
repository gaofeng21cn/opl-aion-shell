/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import semver from 'semver';
import type { AutoUpdateStatus } from './autoUpdaterService';

const AUTO_UPDATE_DIAGNOSTICS_FILE = 'auto-update-diagnostics.json';
const MAX_AUTO_UPDATE_EVENTS = 20;

export type AutoUpdateDiagnosticEvent = {
  at: string;
  currentVersion?: string;
  error?: string;
  mergePacketPath?: string;
  profileStatus?: string;
  progressPercent?: number;
  reason?: string;
  receiptPath?: string;
  status:
    | AutoUpdateStatus['status']
    | 'quit-and-install'
    | 'install-not-applied'
    | 'running_version_switched'
    | 'opl_flow_optimize_started'
    | 'opl_flow_optimize_completed'
    | 'opl_flow_optimize_attention_required'
    | 'opl_flow_optimize_failed';
  total?: number;
  transferred?: number;
  version?: string;
  workflowStatus?: string;
};

export type AutoUpdateDiagnostics = {
  currentAppVersion: string;
  events: AutoUpdateDiagnosticEvent[];
  lastEvent?: AutoUpdateDiagnosticEvent;
  lastQuitAndInstallAt?: string;
};

type AutoUpdateDiagnosticOptions = {
  currentAppVersion: string;
  now?: () => Date;
  userDataPath: string;
};

type InstallNotAppliedOptions = {
  currentAppVersion: string;
  now?: () => Date;
};

export type OplFlowPostAppUpdateReconcileClaim = {
  currentVersion: string;
  targetVersion: string;
};

export type OplFlowOptimizeCommandResult = {
  error?: {
    message: string;
  };
  ok?: boolean;
  parsed?: unknown;
};

type PostAppUpdateReconcileOptions = {
  currentAppVersion: string;
  now?: () => Date;
};

function getAutoUpdateDiagnosticsPath(userDataPath: string): string {
  return path.join(userDataPath, AUTO_UPDATE_DIAGNOSTICS_FILE);
}

function readDiagnosticsFile(filePath: string): AutoUpdateDiagnostics | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<AutoUpdateDiagnostics>;
    if (typeof parsed.currentAppVersion !== 'string' || !Array.isArray(parsed.events)) return undefined;
    const events = parsed.events.filter((event): event is AutoUpdateDiagnosticEvent => {
      if (!event || typeof event !== 'object') return false;
      return typeof event.at === 'string' && typeof event.status === 'string';
    });
    return {
      currentAppVersion: parsed.currentAppVersion,
      events,
      lastEvent: events.at(-1),
      lastQuitAndInstallAt: typeof parsed.lastQuitAndInstallAt === 'string' ? parsed.lastQuitAndInstallAt : undefined,
    };
  } catch {
    return undefined;
  }
}

function writeDiagnosticsFile(filePath: string, diagnostics: AutoUpdateDiagnostics): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(diagnostics, null, 2));
  } catch {
    // Update diagnostics must never interfere with the updater or startup path.
  }
}

export function appendAutoUpdateDiagnosticEvent(
  state: AutoUpdateDiagnostics,
  event: AutoUpdateDiagnosticEvent
): AutoUpdateDiagnostics {
  const events = [...state.events, event].slice(-MAX_AUTO_UPDATE_EVENTS);
  return {
    currentAppVersion: state.currentAppVersion,
    events,
    lastEvent: event,
    lastQuitAndInstallAt: event.status === 'quit-and-install' ? event.at : state.lastQuitAndInstallAt,
  };
}

function normalizeVersion(version: string | undefined): string | null {
  if (!version) return null;
  return semver.valid(version) || semver.coerce(version)?.version || null;
}

function findLastDownloadedVersion(events: AutoUpdateDiagnosticEvent[]): string | undefined {
  return events.toReversed().find((event) => event.status === 'downloaded' && typeof event.version === 'string')
    ?.version;
}

function findAppliedUpdateTarget(events: AutoUpdateDiagnosticEvent[]): string | undefined {
  const downloadedIndex = events.findLastIndex(
    (event) => event.status === 'downloaded' && typeof event.version === 'string'
  );
  if (downloadedIndex < 0) return undefined;
  const quitAndInstallObserved = events.slice(downloadedIndex + 1).some((event) => event.status === 'quit-and-install');
  return quitAndInstallObserved ? events[downloadedIndex]?.version : undefined;
}

function isSameNormalizedVersion(left: string | undefined, right: string): boolean {
  const normalizedLeft = normalizeVersion(left);
  const normalizedRight = normalizeVersion(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function hasOplFlowReconcileAttempt(events: AutoUpdateDiagnosticEvent[], targetVersion: string): boolean {
  return events.some(
    (event) =>
      [
        'opl_flow_optimize_started',
        'opl_flow_optimize_completed',
        'opl_flow_optimize_attention_required',
        'opl_flow_optimize_failed',
      ].includes(event.status) && isSameNormalizedVersion(event.version, targetVersion)
  );
}

export function appendPostAppUpdateReconcileStartedIfNeeded(
  state: AutoUpdateDiagnostics,
  options: PostAppUpdateReconcileOptions
): { claim?: OplFlowPostAppUpdateReconcileClaim; state: AutoUpdateDiagnostics } {
  const targetVersion = findAppliedUpdateTarget(state.events);
  const normalizedTarget = normalizeVersion(targetVersion);
  const normalizedCurrent = normalizeVersion(options.currentAppVersion);
  const currentState = {
    ...state,
    currentAppVersion: options.currentAppVersion,
  };
  if (
    !targetVersion ||
    !normalizedTarget ||
    !normalizedCurrent ||
    semver.lt(normalizedCurrent, normalizedTarget) ||
    hasOplFlowReconcileAttempt(state.events, targetVersion)
  ) {
    return { state: currentState };
  }

  const at = (options.now ?? (() => new Date()))().toISOString();
  const claim = {
    currentVersion: options.currentAppVersion,
    targetVersion,
  };
  const switched = appendAutoUpdateDiagnosticEvent(currentState, {
    at,
    currentVersion: options.currentAppVersion,
    status: 'running_version_switched',
    version: targetVersion,
  });
  return {
    claim,
    state: appendAutoUpdateDiagnosticEvent(switched, {
      at,
      currentVersion: options.currentAppVersion,
      status: 'opl_flow_optimize_started',
      version: targetVersion,
    }),
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function eventFromOplFlowOptimizeResult(
  claim: OplFlowPostAppUpdateReconcileClaim,
  result: OplFlowOptimizeCommandResult,
  at: string
): AutoUpdateDiagnosticEvent {
  const parsed = asRecord(result.parsed);
  const workflowPackage = asRecord(parsed?.workflow_package);
  const profile = asRecord(workflowPackage?.profile);
  const workflowStatus = optionalString(workflowPackage?.status);
  const base = {
    at,
    currentVersion: claim.currentVersion,
    mergePacketPath: optionalString(profile?.merge_packet),
    profileStatus: optionalString(profile?.status),
    receiptPath: optionalString(workflowPackage?.receipt_path),
    version: claim.targetVersion,
    workflowStatus,
  };
  if (result.ok === true && workflowStatus === 'completed') {
    return {
      ...base,
      status: 'opl_flow_optimize_completed',
    };
  }
  if (result.ok === true && workflowStatus === 'profile_merge_required') {
    return {
      ...base,
      reason: 'profile_merge_required',
      status: 'opl_flow_optimize_attention_required',
    };
  }
  return {
    ...base,
    error: result.error?.message,
    reason: result.ok === true ? 'framework_receipt_missing_or_invalid' : 'framework_command_failed',
    status: 'opl_flow_optimize_failed',
  };
}

export function appendPostAppUpdateReconcileResult(
  state: AutoUpdateDiagnostics,
  claim: OplFlowPostAppUpdateReconcileClaim,
  result: OplFlowOptimizeCommandResult,
  options: { now?: () => Date } = {}
): AutoUpdateDiagnostics {
  const at = (options.now ?? (() => new Date()))().toISOString();
  return appendAutoUpdateDiagnosticEvent(
    {
      ...state,
      currentAppVersion: claim.currentVersion,
    },
    eventFromOplFlowOptimizeResult(claim, result, at)
  );
}

export function appendInstallNotAppliedDiagnosticIfNeeded(
  state: AutoUpdateDiagnostics,
  options: InstallNotAppliedOptions
): AutoUpdateDiagnostics {
  const targetVersion = findLastDownloadedVersion(state.events);
  const currentVersion = options.currentAppVersion;
  const normalizedTarget = normalizeVersion(targetVersion);
  const normalizedCurrent = normalizeVersion(currentVersion);
  if (
    !state.lastQuitAndInstallAt ||
    !targetVersion ||
    !normalizedTarget ||
    !normalizedCurrent ||
    semver.gte(normalizedCurrent, normalizedTarget) ||
    state.lastEvent?.status === 'install-not-applied'
  ) {
    return {
      ...state,
      currentAppVersion: currentVersion,
    };
  }
  const at = (options.now ?? (() => new Date()))().toISOString();
  return appendAutoUpdateDiagnosticEvent(
    {
      ...state,
      currentAppVersion: currentVersion,
    },
    {
      at,
      currentVersion,
      reason: 'current_version_lower_than_downloaded_after_quit_and_install',
      status: 'install-not-applied',
      version: targetVersion,
    }
  );
}

function eventFromStatus(status: AutoUpdateStatus, at: string): AutoUpdateDiagnosticEvent {
  return {
    at,
    error: status.error,
    progressPercent: status.progress?.percent,
    status: status.status,
    total: status.progress?.total,
    transferred: status.progress?.transferred,
    version: status.version,
  };
}

function updateAutoUpdateDiagnostics(event: AutoUpdateDiagnosticEvent, options: AutoUpdateDiagnosticOptions): void {
  const filePath = getAutoUpdateDiagnosticsPath(options.userDataPath);
  const previous = readDiagnosticsFile(filePath) ?? {
    currentAppVersion: options.currentAppVersion,
    events: [],
  };
  writeDiagnosticsFile(
    filePath,
    appendAutoUpdateDiagnosticEvent(
      {
        ...previous,
        currentAppVersion: options.currentAppVersion,
      },
      event
    )
  );
}

export function recordAutoUpdateStatus(status: AutoUpdateStatus, options: AutoUpdateDiagnosticOptions): void {
  const at = (options.now ?? (() => new Date()))().toISOString();
  updateAutoUpdateDiagnostics(eventFromStatus(status, at), options);
}

export function recordAutoUpdateQuitAndInstall(options: AutoUpdateDiagnosticOptions): void {
  const at = (options.now ?? (() => new Date()))().toISOString();
  updateAutoUpdateDiagnostics({ at, status: 'quit-and-install' }, options);
}

export function recordAutoUpdateInstallNotAppliedIfNeeded(options: AutoUpdateDiagnosticOptions): void {
  const filePath = getAutoUpdateDiagnosticsPath(options.userDataPath);
  const previous = readDiagnosticsFile(filePath);
  if (!previous) return;
  writeDiagnosticsFile(
    filePath,
    appendInstallNotAppliedDiagnosticIfNeeded(previous, {
      currentAppVersion: options.currentAppVersion,
      now: options.now,
    })
  );
}

export function claimAutoUpdateOplFlowReconcileIfNeeded(
  options: AutoUpdateDiagnosticOptions
): OplFlowPostAppUpdateReconcileClaim | undefined {
  const filePath = getAutoUpdateDiagnosticsPath(options.userDataPath);
  const previous = readDiagnosticsFile(filePath);
  if (!previous) return undefined;
  const next = appendPostAppUpdateReconcileStartedIfNeeded(previous, {
    currentAppVersion: options.currentAppVersion,
    now: options.now,
  });
  writeDiagnosticsFile(filePath, next.state);
  return next.claim;
}

export function recordAutoUpdateOplFlowReconcileResult(
  claim: OplFlowPostAppUpdateReconcileClaim,
  result: OplFlowOptimizeCommandResult,
  options: Pick<AutoUpdateDiagnosticOptions, 'now' | 'userDataPath'>
): AutoUpdateDiagnosticEvent | undefined {
  const filePath = getAutoUpdateDiagnosticsPath(options.userDataPath);
  const previous = readDiagnosticsFile(filePath);
  if (!previous) return undefined;
  const next = appendPostAppUpdateReconcileResult(previous, claim, result, { now: options.now });
  writeDiagnosticsFile(filePath, next);
  return next.lastEvent;
}

export function readAutoUpdateDiagnostics(userDataPath: string): AutoUpdateDiagnostics | undefined {
  return readDiagnosticsFile(getAutoUpdateDiagnosticsPath(userDataPath));
}
