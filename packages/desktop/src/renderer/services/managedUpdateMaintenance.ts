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
  | 'settings_make_opl_usable'
  | 'component_action';

export type ManagedUpdateReadOperation = 'status' | 'check' | 'plan';
export type ManagedUpdateMutationKind = 'apply' | 'repair' | 'rollback';

export type ManagedUpdateMaintenanceAction = {
  kind: ManagedUpdateMutationKind | 'auto_apply';
  componentId: string;
  status: 'completed' | 'failed' | 'skipped';
  at: string;
  receiptRef?: string;
  reloadGuidance?: string;
};

export type ManagedUpdateMaintenanceSnapshot = {
  running: boolean;
  operation: ManagedUpdateReadOperation | ManagedUpdateMutationKind | null;
  busyAction: string | null;
  executionStatus: 'idle' | 'running' | 'completed' | 'failed' | 'skipped_locked';
  lastTrigger: ManagedUpdateMaintenanceTrigger | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastFailure: string | null;
  lastAction: ManagedUpdateMaintenanceAction | null;
  lastSkipReason: string | null;
  reloadGuidance: string | null;
  lockStatus: string | null;
  result: IOplRuntimeCommandResult | null;
};

const DAILY_BACKGROUND_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RETRY_INTERVAL_MS = 30 * 60 * 1000;
const MAX_RETRY_COUNT = 3;
const SNAPSHOT_STORAGE_KEY = 'opl.managedUpdateMaintenance.v1';
const AUTO_APPLY_COMPONENT_IDS = new Set(['agent_package_channel', 'capability_exposure']);
const CONSERVATIVE_COMPONENT_IDS = new Set(['app_binary', 'runtime_toolchain']);
const AUTO_APPLY_STATES = new Set(['update_available', 'staged', 'needs_reload']);
const DEVELOPER_CHECKOUT_SOURCES = new Set([
  'developer_checkout',
  'developer_mode',
  'env_override',
  'local_checkout',
  'sibling_workspace',
  'source_checkout',
]);

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
  lastAction: null,
  lastSkipReason: null,
  reloadGuidance: null,
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

function booleanValue(value: unknown): boolean {
  return value === true || value === 'true';
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

function componentRecords(root: Record<string, unknown>): Record<string, unknown>[] {
  const rawComponents = root.components ?? root.planes ?? root.items;
  if (Array.isArray(rawComponents)) {
    return rawComponents.filter(isRecord);
  }
  if (!isRecord(rawComponents)) {
    return [];
  }
  return Object.entries(rawComponents).map(([id, value]) => ({
    ...((isRecord(value) ? value : {}) as Record<string, unknown>),
    component_id: id,
  }));
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.map(stringValue).filter((entry): entry is string => Boolean(entry)) : [];
}

function autoApplyInfo(component: Record<string, unknown>): {
  eligible: boolean;
  appBackgroundSafe: boolean;
  commandRef: string | null;
  blockedReasons: string[];
} | null {
  const raw = nestedRecord(component, 'auto_apply');
  if (!raw) return null;
  return {
    eligible: booleanValue(raw.eligible),
    appBackgroundSafe: booleanValue(raw.app_background_safe),
    commandRef: stringValue(raw.command_ref),
    blockedReasons: stringArrayValue(raw.blocked_reasons),
  };
}

function readLockStatus(result: IOplRuntimeCommandResult | null | undefined): string | null {
  const root = managedUpdateRoot(result);
  return stringValue(nestedRecord(root, 'idempotency_lock')?.status) ?? stringValue(nestedRecord(root, 'lock')?.status);
}

function readReloadGuidance(result: IOplRuntimeCommandResult | null | undefined): string | null {
  const root = managedUpdateRoot(result);
  return stringValue(root.reload_guidance) ?? stringValue(root.restart_guidance);
}

function readReceiptRef(result: IOplRuntimeCommandResult | null | undefined, componentId: string): string | null {
  const root = managedUpdateRoot(result);
  const component = componentRecords(root).find(
    (entry) => stringValue(entry.component_id ?? entry.componentId ?? entry.id) === componentId
  );
  const receipt = nestedRecord(component, 'receipt') ?? nestedRecord(component, 'receipts');
  return (
    stringValue(component?.receipt_ref) ??
    stringValue(component?.last_receipt_ref) ??
    stringValue(receipt?.last_receipt_ref) ??
    stringValue(receipt?.receipt_ref) ??
    stringValue(receipt?.ref) ??
    null
  );
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

function summarizeResultStatus(
  result: IOplRuntimeCommandResult | null | undefined
): ManagedUpdateMaintenanceAction['status'] {
  return resultErrorMessage(result) ? 'failed' : 'completed';
}

function readPersistedAction(value: unknown): ManagedUpdateMaintenanceAction | null {
  if (!isRecord(value)) return null;
  const kind = stringValue(value.kind);
  const componentId = stringValue(value.componentId);
  const status = stringValue(value.status);
  const at = stringValue(value.at);
  if (
    !kind ||
    !componentId ||
    !at ||
    !['apply', 'repair', 'rollback', 'auto_apply'].includes(kind) ||
    !['completed', 'failed', 'skipped'].includes(status ?? '')
  ) {
    return null;
  }
  return {
    kind: kind as ManagedUpdateMaintenanceAction['kind'],
    componentId,
    status: status as ManagedUpdateMaintenanceAction['status'],
    at,
    receiptRef: stringValue(value.receiptRef),
    reloadGuidance: stringValue(value.reloadGuidance),
  };
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
      lastAction: readPersistedAction(parsed.lastAction),
      lastSkipReason: stringValue(parsed.lastSkipReason),
      reloadGuidance: stringValue(parsed.reloadGuidance),
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
        lastAction: snapshot.lastAction,
        lastSkipReason: snapshot.lastSkipReason,
        reloadGuidance: snapshot.reloadGuidance,
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

function skipReasonForComponent(component: Record<string, unknown>): string | null {
  const componentId = stringValue(component.component_id ?? component.componentId ?? component.id);
  if (!componentId) return null;
  const state = stringValue(component.state ?? component.status ?? component.health_status) ?? 'unknown';
  const actionableState = AUTO_APPLY_STATES.has(state);
  const explicitAutoApply = autoApplyInfo(component);
  const safeToApply =
    booleanValue(component.safe_to_apply) || booleanValue(component.apply_allowed) || booleanValue(component.can_apply);
  const needsRestart = booleanValue(component.needs_restart) || booleanValue(component.restart_required);
  const source = stringValue(component.source ?? component.install_origin ?? component.checkout_source);
  const dirtyCheckout =
    state === 'dirty' ||
    booleanValue(component.dirty_checkout) ||
    booleanValue(component.checkout_dirty) ||
    booleanValue(component.working_tree_dirty) ||
    booleanValue(nestedRecord(component, 'git')?.dirty);
  const developerCheckout = Boolean(source && DEVELOPER_CHECKOUT_SOURCES.has(source));
  const manualRequired =
    state === 'manual_required' ||
    state === 'skipped_manual_required' ||
    booleanValue(component.manual_required) ||
    Boolean(stringValue(component.manual_guidance));
  const applyRequested = explicitAutoApply
    ? explicitAutoApply.eligible ||
      explicitAutoApply.blockedReasons.length > 0 ||
      actionableState ||
      safeToApply ||
      manualRequired
    : actionableState || safeToApply;
  if (CONSERVATIVE_COMPONENT_IDS.has(componentId) && applyRequested) {
    return `${componentId}: ${needsRestart ? 'restart_required' : 'manual_confirmation_required'}`;
  }
  if (!AUTO_APPLY_COMPONENT_IDS.has(componentId) && applyRequested) {
    return `${componentId}: unsupported_component`;
  }
  if (!applyRequested) {
    return null;
  }
  if (dirtyCheckout) {
    return `${componentId}: dirty_checkout`;
  }
  if (developerCheckout) {
    return `${componentId}: developer_checkout`;
  }
  if (manualRequired) {
    return `${componentId}: manual_required`;
  }
  if (explicitAutoApply) {
    if (explicitAutoApply.blockedReasons.length > 0) {
      return `${componentId}: ${explicitAutoApply.blockedReasons.join(', ')}`;
    }
    if (!explicitAutoApply.eligible || !explicitAutoApply.appBackgroundSafe) {
      return `${componentId}: not_safe_to_apply`;
    }
    if (!explicitAutoApply.commandRef) {
      return `${componentId}: missing_command_ref`;
    }
  } else if (!safeToApply) {
    return `${componentId}: not_safe_to_apply`;
  }
  if (needsRestart) {
    return `${componentId}: restart_required`;
  }
  return null;
}

function isAutoApplyCandidate(component: Record<string, unknown>): boolean {
  const state = stringValue(component.state ?? component.status ?? component.health_status) ?? 'unknown';
  const explicitAutoApply = autoApplyInfo(component);
  if (explicitAutoApply) {
    return (
      explicitAutoApply.eligible &&
      explicitAutoApply.appBackgroundSafe &&
      Boolean(explicitAutoApply.commandRef) &&
      !booleanValue(component.needs_restart) &&
      !booleanValue(component.restart_required) &&
      !booleanValue(component.manual_required) &&
      !booleanValue(component.dirty_checkout) &&
      !booleanValue(component.checkout_dirty) &&
      !booleanValue(component.working_tree_dirty) &&
      !booleanValue(nestedRecord(component, 'git')?.dirty) &&
      !DEVELOPER_CHECKOUT_SOURCES.has(
        stringValue(component.source ?? component.install_origin ?? component.checkout_source) ?? ''
      ) &&
      !stringValue(component.manual_guidance)
    );
  }
  return (
    AUTO_APPLY_STATES.has(state) &&
    (booleanValue(component.safe_to_apply) ||
      booleanValue(component.apply_allowed) ||
      booleanValue(component.can_apply)) &&
    !booleanValue(component.needs_restart) &&
    !booleanValue(component.restart_required) &&
    !booleanValue(component.manual_required) &&
    !booleanValue(component.dirty_checkout) &&
    !booleanValue(component.checkout_dirty) &&
    !booleanValue(component.working_tree_dirty) &&
    !booleanValue(nestedRecord(component, 'git')?.dirty) &&
    !DEVELOPER_CHECKOUT_SOURCES.has(
      stringValue(component.source ?? component.install_origin ?? component.checkout_source) ?? ''
    ) &&
    !stringValue(component.manual_guidance)
  );
}

function autoApplyCandidates(result: IOplRuntimeCommandResult): {
  candidates: string[];
  skipReasons: string[];
} {
  if (result.ok === false) {
    return { candidates: [], skipReasons: [] };
  }
  const candidates: string[] = [];
  const skipReasons: string[] = [];
  for (const component of componentRecords(managedUpdateRoot(result))) {
    const componentId = stringValue(component.component_id ?? component.componentId ?? component.id);
    const skipReason = skipReasonForComponent(component);
    if (skipReason) {
      skipReasons.push(skipReason);
      continue;
    }
    if (componentId && AUTO_APPLY_COMPONENT_IDS.has(componentId) && isAutoApplyCandidate(component)) {
      candidates.push(componentId);
    }
  }
  return { candidates, skipReasons };
}

async function invokeApply(componentId: string): Promise<IOplRuntimeCommandResult> {
  return ipcBridge.oplRuntime.applyUpdateComponent.invoke({ componentId });
}

async function applyBackgroundCandidates(result: IOplRuntimeCommandResult): Promise<IOplRuntimeCommandResult> {
  const { candidates, skipReasons } = autoApplyCandidates(result);
  if (skipReasons.length > 0) {
    emit({ lastSkipReason: skipReasons.join('; ') });
  } else {
    emit({ lastSkipReason: null });
  }
  let latestResult = result;
  for (const componentId of candidates) {
    const applyResult = await invokeApply(componentId);
    const actionAt = isoNow();
    latestResult = applyResult;
    const reloadGuidance = readReloadGuidance(applyResult) ?? readReloadGuidance(result) ?? snapshot.reloadGuidance;
    emit({
      lastAction: {
        kind: 'auto_apply',
        componentId,
        status: summarizeResultStatus(applyResult),
        at: actionAt,
        receiptRef: readReceiptRef(applyResult, componentId) ?? readReceiptRef(result, componentId) ?? undefined,
        reloadGuidance: reloadGuidance ?? undefined,
      },
      reloadGuidance,
    });
    if (applyResult.ok === false) {
      return applyResult;
    }
  }
  if (candidates.length === 0) {
    emit({ reloadGuidance: readReloadGuidance(result) ?? snapshot.reloadGuidance });
  }
  return latestResult;
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
    .then(async (readResult): Promise<IOplRuntimeCommandResult | null> => {
      const result =
        input.background && (operation === 'check' || operation === 'plan')
          ? await applyBackgroundCandidates(readResult)
          : readResult;
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
        reloadGuidance: readReloadGuidance(result) ?? snapshot.reloadGuidance,
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
      const actionAt = isoNow();
      const reloadGuidance = readReloadGuidance(result) ?? snapshot.reloadGuidance;
      retryCount = lastFailure ? retryCount + 1 : 0;
      emit({
        running: false,
        operation: null,
        busyAction: null,
        executionStatus: readExecutionStatus(result),
        lastRunAt: actionAt,
        lastFailure,
        lastAction: {
          kind,
          componentId: input.componentId,
          status: summarizeResultStatus(result),
          at: actionAt,
          receiptRef: readReceiptRef(result, input.componentId) ?? input.receiptId,
          reloadGuidance: reloadGuidance ?? undefined,
        },
        lockStatus: readLockStatus(result),
        reloadGuidance,
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
