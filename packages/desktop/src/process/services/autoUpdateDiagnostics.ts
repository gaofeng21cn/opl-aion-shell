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
  progressPercent?: number;
  reason?: string;
  status: AutoUpdateStatus['status'] | 'quit-and-install' | 'install-not-applied';
  total?: number;
  transferred?: number;
  version?: string;
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

export function readAutoUpdateDiagnostics(userDataPath: string): AutoUpdateDiagnostics | undefined {
  return readDiagnosticsFile(getAutoUpdateDiagnosticsPath(userDataPath));
}
