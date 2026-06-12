/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSyncExternalStore } from 'react';
import { ipcBridge } from '@/common';
import type {
  IOplRuntimeCommandResult,
  IOplUpdateComponentRequest,
  IOplUpdateRepairRequest,
} from '@/common/adapter/ipcBridge';

export type ManagedUpdateMaintenanceTrigger =
  | 'app_startup_after_core_ready'
  | 'daily_background_maintenance'
  | 'manual_check_updates'
  | 'manual_refresh_status'
  | 'manual_plan'
  | 'component_action';

export type ManagedUpdateReadOperation = 'status' | 'check' | 'plan';
export type ManagedUpdateMutationKind = 'apply' | 'repair' | 'rollback';

export type ManagedUpdateMaintenanceSnapshot = {
  running: boolean;
  operation: ManagedUpdateReadOperation | ManagedUpdateMutationKind | null;
  busyAction: string | null;
  executionStatus: 'idle' | 'running' | 'completed' | 'failed' | 'skipped_locked';
  lastTrigger: ManagedUpdateMaintenanceTrigger | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastFailure: string | null;
  lockStatus: string | null;
  result: IOplRuntimeCommandResult | null;
};

const DAILY_BACKGROUND_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RETRY_INTERVAL_MS = 30 * 60 * 1000;
const MAX_RETRY_COUNT = 3;
const SNAPSHOT_STORAGE_KEY = 'opl.managedUpdateMaintenance.v1';

let retryCount = 0;
let schedulerStarted = false;
let schedulerTimer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<IOplRuntimeCommandResult | null> | null = null;

const listeners = new Set<() => void>();

const EMPTY_SNAPSHOT: ManagedUpdateMaintenanceSnapshot = {
  running: false,
  operation: null,
  busyAction: null,
  executionStatus: 'idle',
  lastTrigger: null,
  lastRunAt: null,
  nextRunAt: null,
  lastFailure: null,
  lockStatus: null,
  result: null,
};

let snapshot: ManagedUpdateMaintenanceSnapshot = {
  ...EMPTY_SNAPSHOT,
  ...readPersistedSnapshot(),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function nestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  return isRecord(value) && isRecord(value[key]) ? value[key] : null;
}

function managedUpdateRoot(result: IOplRuntimeCommandResult | null | undefined): Record<string, unknown> {
  const parsed = isRecord(result?.parsed) ? result.parsed : {};
  const appState = nestedRecord(parsed, 'app_state');
  return (
    nestedRecord(parsed, 'managed_update') ??
    nestedRecord(parsed, 'managed_update_plane') ??
    nestedRecord(appState, 'managed_update_plane') ??
    {}
  );
}

function readLockStatus(result: IOplRuntimeCommandResult | null | undefined): string | null {
  const root = managedUpdateRoot(result);
  return stringValue(nestedRecord(root, 'idempotency_lock')?.status) ?? stringValue(nestedRecord(root, 'lock')?.status);
}

function readExecutionStatus(
  result: IOplRuntimeCommandResult | null | undefined
): ManagedUpdateMaintenanceSnapshot['executionStatus'] {
  if (!result || result.ok === false) {
    return 'failed';
  }
  const root = managedUpdateRoot(result);
  const executionStatus =
    stringValue(nestedRecord(root, 'execution')?.status) ??
    stringValue(nestedRecord(root, 'summary')?.execution_status);
  if (executionStatus === 'failed' || executionStatus === 'failed_with_repair') {
    return 'failed';
  }
  if (executionStatus === 'skipped' || executionStatus === 'manual_required') {
    return 'completed';
  }
  return 'completed';
}

function resultErrorMessage(result: IOplRuntimeCommandResult | null | undefined): string | null {
  if (result?.ok === false) {
    return result.error?.message ?? 'OPL managed update command failed';
  }
  return null;
}

function readPersistedSnapshot(): Partial<ManagedUpdateMaintenanceSnapshot> {
  try {
    const raw = localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      lastRunAt: stringValue(parsed.lastRunAt),
      nextRunAt: stringValue(parsed.nextRunAt),
      lastFailure: stringValue(parsed.lastFailure),
      lockStatus: stringValue(parsed.lockStatus),
      lastTrigger: stringValue(parsed.lastTrigger) as ManagedUpdateMaintenanceTrigger | null,
      executionStatus:
        parsed.executionStatus === 'completed' || parsed.executionStatus === 'failed' ? parsed.executionStatus : 'idle',
    };
  } catch {
    return {};
  }
}

function persistSnapshot(): void {
  try {
    localStorage.setItem(
      SNAPSHOT_STORAGE_KEY,
      JSON.stringify({
        lastRunAt: snapshot.lastRunAt,
        nextRunAt: snapshot.nextRunAt,
        lastFailure: snapshot.lastFailure,
        lockStatus: snapshot.lockStatus,
        lastTrigger: snapshot.lastTrigger,
        executionStatus: snapshot.executionStatus,
      })
    );
  } catch {
    // Runtime bridge status remains authoritative when localStorage is unavailable.
  }
}

function emit(next: Partial<ManagedUpdateMaintenanceSnapshot>): void {
  snapshot = { ...snapshot, ...next };
  persistSnapshot();
  for (const listener of listeners) listener();
}

function isoNow(): string {
  return new Date().toISOString();
}

function isoAfter(delayMs: number): string {
  return new Date(Date.now() + delayMs).toISOString();
}

function scheduleNextRun(delayMs: number): void {
  const nextRunAt = isoAfter(delayMs);
  emit({ nextRunAt });
  if (!schedulerStarted) return;
  if (schedulerTimer) clearTimeout(schedulerTimer);
  schedulerTimer = setTimeout(() => {
    void executeManagedUpdateRead('check', {
      background: true,
      trigger: 'daily_background_maintenance',
    });
  }, delayMs);
}

async function invokeRead(operation: ManagedUpdateReadOperation): Promise<IOplRuntimeCommandResult> {
  if (operation === 'check') return ipcBridge.oplRuntime.runUpdateCheck.invoke();
  if (operation === 'plan') return ipcBridge.oplRuntime.getUpdatePlan.invoke();
  return ipcBridge.oplRuntime.getUpdateStatus.invoke();
}

export function getManagedUpdateMaintenanceSnapshot(): ManagedUpdateMaintenanceSnapshot {
  return snapshot;
}

export function subscribeManagedUpdateMaintenance(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useManagedUpdateMaintenance(): ManagedUpdateMaintenanceSnapshot {
  return useSyncExternalStore(
    subscribeManagedUpdateMaintenance,
    getManagedUpdateMaintenanceSnapshot,
    getManagedUpdateMaintenanceSnapshot
  );
}

export async function executeManagedUpdateRead(
  operation: ManagedUpdateReadOperation,
  input: {
    trigger: ManagedUpdateMaintenanceTrigger;
    background?: boolean;
  }
): Promise<IOplRuntimeCommandResult | null> {
  if (inflight) {
    emit({
      executionStatus: 'skipped_locked',
      lastTrigger: input.trigger,
      lockStatus: snapshot.lockStatus ?? 'local_in_progress',
    });
    return inflight;
  }

  emit({
    running: true,
    operation,
    busyAction: null,
    executionStatus: 'running',
    lastTrigger: input.trigger,
    lastFailure: input.background ? snapshot.lastFailure : null,
  });

  inflight = invokeRead(operation)
    .then((result): IOplRuntimeCommandResult | null => {
      const lastFailure = resultErrorMessage(result);
      const executionStatus = readExecutionStatus(result);
      retryCount = lastFailure ? retryCount + 1 : 0;
      emit({
        running: false,
        operation: null,
        executionStatus,
        lastRunAt: isoNow(),
        lastFailure,
        lockStatus: readLockStatus(result),
        result,
      });
      scheduleNextRun(lastFailure && retryCount <= MAX_RETRY_COUNT ? RETRY_INTERVAL_MS : DAILY_BACKGROUND_INTERVAL_MS);
      return result;
    })
    .catch((error: unknown): IOplRuntimeCommandResult | null => {
      retryCount += 1;
      emit({
        running: false,
        operation: null,
        executionStatus: 'failed',
        lastRunAt: isoNow(),
        lastFailure: error instanceof Error ? error.message : String(error),
      });
      scheduleNextRun(retryCount <= MAX_RETRY_COUNT ? RETRY_INTERVAL_MS : DAILY_BACKGROUND_INTERVAL_MS);
      return null;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export async function executeManagedUpdateMutation(
  kind: ManagedUpdateMutationKind,
  input: {
    componentId: string;
    receiptId?: string;
  }
): Promise<IOplRuntimeCommandResult | null> {
  if (inflight) {
    emit({
      executionStatus: 'skipped_locked',
      lastTrigger: 'component_action',
      lockStatus: snapshot.lockStatus ?? 'local_in_progress',
    });
    return inflight;
  }

  const busyAction = `${kind}:${input.componentId}`;
  emit({
    running: true,
    operation: kind,
    busyAction,
    executionStatus: 'running',
    lastTrigger: 'component_action',
    lastFailure: null,
  });

  const request: IOplUpdateComponentRequest = { componentId: input.componentId };
  const repairRequest: IOplUpdateRepairRequest = {
    componentId: input.componentId,
    receiptId: input.receiptId,
  };

  inflight = (
    kind === 'apply'
      ? ipcBridge.oplRuntime.applyUpdateComponent.invoke(request)
      : kind === 'rollback'
        ? ipcBridge.oplRuntime.rollbackUpdateComponent.invoke(request)
        : ipcBridge.oplRuntime.repairUpdate.invoke(repairRequest)
  )
    .then((result): IOplRuntimeCommandResult | null => {
      const lastFailure = resultErrorMessage(result);
      retryCount = lastFailure ? retryCount + 1 : 0;
      emit({
        running: false,
        operation: null,
        busyAction: null,
        executionStatus: readExecutionStatus(result),
        lastRunAt: isoNow(),
        lastFailure,
        lockStatus: readLockStatus(result),
        result,
      });
      scheduleNextRun(lastFailure && retryCount <= MAX_RETRY_COUNT ? RETRY_INTERVAL_MS : DAILY_BACKGROUND_INTERVAL_MS);
      return result;
    })
    .catch((error: unknown): IOplRuntimeCommandResult | null => {
      retryCount += 1;
      emit({
        running: false,
        operation: null,
        busyAction: null,
        executionStatus: 'failed',
        lastRunAt: isoNow(),
        lastFailure: error instanceof Error ? error.message : String(error),
      });
      scheduleNextRun(retryCount <= MAX_RETRY_COUNT ? RETRY_INTERVAL_MS : DAILY_BACKGROUND_INTERVAL_MS);
      return null;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function startManagedUpdateMaintenanceScheduler(): () => void {
  if (!schedulerStarted) {
    schedulerStarted = true;
    scheduleNextRun(DAILY_BACKGROUND_INTERVAL_MS);
    void executeManagedUpdateRead('check', {
      background: true,
      trigger: 'app_startup_after_core_ready',
    });
  }

  return () => {
    if (schedulerTimer) {
      clearTimeout(schedulerTimer);
      schedulerTimer = null;
    }
    schedulerStarted = false;
  };
}

export function resetManagedUpdateMaintenanceForTest(): void {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
  retryCount = 0;
  schedulerStarted = false;
  inflight = null;
  snapshot = { ...EMPTY_SNAPSHOT };
  try {
    localStorage.removeItem(SNAPSHOT_STORAGE_KEY);
  } catch {
    // Ignore test environments without localStorage.
  }
  for (const listener of listeners) listener();
}
