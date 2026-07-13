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
import {
  canonicalManagedUpdateComponentId,
  type ManagedUpdateComponentId,
} from '@/renderer/services/managedUpdateProjection';

export type ManagedUpdateMaintenanceTrigger =
  | 'app_carrier_changed'
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
  componentId: ManagedUpdateComponentId;
  status: 'completed' | 'failed' | 'skipped';
  at: string;
  receiptRef?: string;
  reloadGuidance?: string;
  componentIds?: ManagedUpdateComponentId[];
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
  restartRequired: boolean;
  lastReconciledCarrierCheckpoint: string | null;
  lockStatus: string | null;
  result: IOplRuntimeCommandResult | null;
};

const DAILY_BACKGROUND_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RETRY_INTERVAL_MS = 30 * 60 * 1000;
const MAX_RETRY_COUNT = 3;
const SNAPSHOT_STORAGE_KEY = 'opl.managedUpdateMaintenance.v1';
const USER_APPLY_COMPONENT_IDS = new Set<ManagedUpdateComponentId>(['opl_base', 'opl_packages']);

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
  restartRequired: false,
  lastReconciledCarrierCheckpoint: null,
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
  const rootGuidance = stringValue(root.reload_guidance) ?? stringValue(root.restart_guidance);
  if (rootGuidance) return rootGuidance;
  const components = componentRecords(root);
  for (const component of components) {
    const postApplyGuidance = nestedRecord(component, 'post_apply_guidance');
    const receipt = nestedRecord(component, 'receipt');
    const guidance =
      stringValue(component.reload_guidance) ??
      stringValue(component.restart_guidance) ??
      stringValue(postApplyGuidance?.reload_guidance) ??
      stringValue(receipt?.reload_guidance);
    if (guidance) return guidance;
  }
  return null;
}

function readRestartRequired(result: IOplRuntimeCommandResult | null | undefined): boolean {
  const root = managedUpdateRoot(result);
  return (
    booleanValue(root.restart_required) ||
    componentRecords(root).some(
      (component) => booleanValue(component.needs_restart) || booleanValue(component.restart_required)
    )
  );
}

function readReceiptRef(result: IOplRuntimeCommandResult | null | undefined, componentId: string): string | null {
  const root = managedUpdateRoot(result);
  const component = componentRecords(root).find(
    (entry) => canonicalManagedUpdateComponentId(entry.component_id ?? entry.componentId ?? entry.id) === componentId
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
  const root = managedUpdateRoot(result);
  const executionStatus =
    stringValue(nestedRecord(root, 'execution')?.status) ??
    stringValue(nestedRecord(root, 'summary')?.execution_status);
  if (executionStatus === 'failed' || executionStatus === 'failed_with_repair') {
    return (
      stringValue(nestedRecord(root, 'summary')?.message) ??
      stringValue(root.message) ??
      `OPL managed update ${executionStatus}`
    );
  }
  return null;
}

function summarizeResultStatus(
  result: IOplRuntimeCommandResult | null | undefined
): ManagedUpdateMaintenanceAction['status'] {
  return resultErrorMessage(result) ? 'failed' : 'completed';
}

function managedUpdateAction(input: {
  kind: ManagedUpdateMaintenanceAction['kind'];
  componentId: ManagedUpdateComponentId;
  status: ManagedUpdateMaintenanceAction['status'];
  at: string;
  receiptRef?: string | null;
  reloadGuidance?: string | null;
  componentIds?: ManagedUpdateComponentId[];
}): ManagedUpdateMaintenanceAction {
  return {
    kind: input.kind,
    componentId: input.componentId,
    status: input.status,
    at: input.at,
    ...(input.receiptRef ? { receiptRef: input.receiptRef } : {}),
    ...(input.reloadGuidance ? { reloadGuidance: input.reloadGuidance } : {}),
    ...(input.componentIds && input.componentIds.length > 0 ? { componentIds: input.componentIds } : {}),
  };
}

function readPersistedAction(value: unknown): ManagedUpdateMaintenanceAction | null {
  if (!isRecord(value)) return null;
  const kind = stringValue(value.kind);
  const rawComponentId = stringValue(value.componentId);
  const componentId = canonicalManagedUpdateComponentId(rawComponentId);
  const status = stringValue(value.status);
  const at = stringValue(value.at);
  if (
    !kind ||
    !componentId ||
    componentId !== rawComponentId ||
    !at ||
    !['apply', 'repair', 'rollback', 'auto_apply'].includes(kind) ||
    !['completed', 'failed', 'skipped'].includes(status ?? '')
  ) {
    return null;
  }
  return managedUpdateAction({
    kind: kind as ManagedUpdateMaintenanceAction['kind'],
    componentId,
    status: status as ManagedUpdateMaintenanceAction['status'],
    at,
    receiptRef: stringValue(value.receiptRef),
    reloadGuidance: stringValue(value.reloadGuidance),
    componentIds: Array.isArray(value.componentIds)
      ? value.componentIds
          .map(canonicalManagedUpdateComponentId)
          .filter((entry): entry is ManagedUpdateComponentId => Boolean(entry))
      : undefined,
  });
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
      restartRequired: booleanValue(parsed.restartRequired),
      lastReconciledCarrierCheckpoint: stringValue(parsed.lastReconciledCarrierCheckpoint),
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
        restartRequired: snapshot.restartRequired,
        lastReconciledCarrierCheckpoint: snapshot.lastReconciledCarrierCheckpoint,
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
    void executeManagedUpdateReconciliation('daily_background_maintenance');
  }, delayMs);
}

async function invokeRead(operation: ManagedUpdateReadOperation): Promise<IOplRuntimeCommandResult> {
  if (operation === 'check') return ipcBridge.oplRuntime.runUpdateCheck.invoke();
  if (operation === 'plan') return ipcBridge.oplRuntime.getUpdatePlan.invoke();
  return ipcBridge.oplRuntime.getUpdateStatus.invoke();
}

function currentCarrierCheckpoint(): string {
  const appVersion = __OPL_RELEASE_VERSION__ || __APP_VERSION__;
  return `${appVersion}:${__SHELL_VERSION__}`;
}

function backgroundPlanDecision(result: IOplRuntimeCommandResult): {
  eligibleComponentIds: ManagedUpdateComponentId[];
  attentionReasons: string[];
} {
  const eligibleComponentIds: ManagedUpdateComponentId[] = [];
  const attentionReasons: string[] = [];
  if (result.ok === false) return { eligibleComponentIds, attentionReasons };

  for (const component of componentRecords(managedUpdateRoot(result))) {
    const componentId = canonicalManagedUpdateComponentId(
      component.component_id ?? component.componentId ?? component.id
    );
    if (!componentId) continue;
    const state = stringValue(component.state ?? component.status ?? component.health_status) ?? 'unknown';
    const autoApply = autoApplyInfo(component);
    const manualRequired =
      state === 'manual_required' ||
      state === 'host_executor_required' ||
      state === 'skipped_manual_required' ||
      booleanValue(component.host_executor_required) ||
      booleanValue(component.hostExecutorRequired) ||
      booleanValue(component.manual_required) ||
      Boolean(stringValue(component.manual_guidance));

    if (componentId === 'opl_app') {
      if (autoApply?.eligible || manualRequired) {
        attentionReasons.push(
          `${componentId}: ${state === 'host_executor_required' ? state : 'carrier_update_route_required'}`
        );
      }
      continue;
    }
    if (autoApply?.eligible && autoApply.appBackgroundSafe && autoApply.commandRef) {
      eligibleComponentIds.push(componentId);
      continue;
    }
    if (autoApply?.blockedReasons.length) {
      attentionReasons.push(`${componentId}: ${autoApply.blockedReasons.join(', ')}`);
      continue;
    }
    if (autoApply?.eligible && !autoApply.appBackgroundSafe) {
      attentionReasons.push(`${componentId}: framework_background_apply_not_safe`);
      continue;
    }
    if (autoApply?.eligible && !autoApply.commandRef) {
      attentionReasons.push(`${componentId}: framework_command_ref_missing`);
      continue;
    }
    if (manualRequired) {
      attentionReasons.push(`${componentId}: ${state === 'host_executor_required' ? state : 'manual_required'}`);
      continue;
    }
    if (!autoApply && ['update_available', 'staged', 'needs_reload'].includes(state)) {
      attentionReasons.push(`${componentId}: framework_auto_apply_not_declared`);
    }
  }
  return { eligibleComponentIds, attentionReasons };
}

function projectBackgroundPlan(result: IOplRuntimeCommandResult): ReturnType<typeof backgroundPlanDecision> {
  const decision = backgroundPlanDecision(result);
  emit({
    lastSkipReason: decision.attentionReasons.length > 0 ? decision.attentionReasons.join('; ') : null,
    reloadGuidance: readReloadGuidance(result) ?? snapshot.reloadGuidance,
    restartRequired: readRestartRequired(result),
  });
  return decision;
}

function mutationForbiddenResult(kind: ManagedUpdateMutationKind, componentId: string): IOplRuntimeCommandResult {
  const message = `OPL Settings ${kind} accepts only opl_base and explicitly targeted opl_packages. opl_app uses its host or carrier updater.`;
  const command =
    componentId === 'opl_base'
      ? `opl update ${kind} --json`
      : componentId === 'opl_packages'
        ? `opl packages ${kind === 'apply' ? 'update' : kind} --package-id <package_id> --json`
        : componentId === 'opl_app'
          ? 'host or carrier updater'
          : `unsupported managed update lifecycle id: ${componentId}`;
  return {
    ok: false,
    surface: `update_${kind}`,
    command,
    stdout: '',
    parsed: null,
    error: {
      message,
    },
  };
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
      if (input.background && (operation === 'check' || operation === 'plan')) {
        projectBackgroundPlan(readResult);
      }
      const result = readResult;
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
        restartRequired: readRestartRequired(result),
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

export async function executeManagedUpdateReconciliation(
  trigger: 'app_carrier_changed' | 'app_startup_after_core_ready' | 'daily_background_maintenance'
): Promise<IOplRuntimeCommandResult | null> {
  if (inflight) {
    emit({
      executionStatus: 'skipped_locked',
      lastTrigger: trigger,
      lockStatus: snapshot.lockStatus ?? 'local_in_progress',
    });
    return inflight;
  }

  emit({
    running: true,
    operation: 'check',
    busyAction: null,
    executionStatus: 'running',
    lastTrigger: trigger,
    lastFailure: snapshot.lastFailure,
  });

  inflight = (async (): Promise<IOplRuntimeCommandResult | null> => {
    let result = await invokeRead('check');
    let lastFailure = resultErrorMessage(result);
    let planResult: IOplRuntimeCommandResult | null = null;
    let eligibleComponentIds: ManagedUpdateComponentId[] = [];

    if (!lastFailure) {
      emit({ operation: 'plan' });
      planResult = await invokeRead('plan');
      result = planResult;
      lastFailure = resultErrorMessage(result);
    }

    if (!lastFailure && planResult) {
      const decision = projectBackgroundPlan(planResult);
      eligibleComponentIds = decision.eligibleComponentIds;
    }

    if (!lastFailure && eligibleComponentIds.length > 0) {
      emit({ operation: 'apply', busyAction: 'auto_apply:managed_update_plan' });
      result = await ipcBridge.oplRuntime.applyUpdatePlan.invoke();
      lastFailure = resultErrorMessage(result);
      const actionAt = isoNow();
      const reloadGuidance = readReloadGuidance(result) ?? readReloadGuidance(planResult) ?? snapshot.reloadGuidance;
      emit({
        lastAction: managedUpdateAction({
          kind: 'auto_apply',
          componentId: eligibleComponentIds[0],
          componentIds: eligibleComponentIds,
          status: summarizeResultStatus(result),
          at: actionAt,
          receiptRef: eligibleComponentIds.map((componentId) => readReceiptRef(result, componentId)).find(Boolean),
          reloadGuidance,
        }),
        reloadGuidance,
      });
    }

    retryCount = lastFailure ? retryCount + 1 : 0;
    const restartRequired = readRestartRequired(result) || readRestartRequired(planResult);
    emit({
      running: false,
      operation: null,
      busyAction: null,
      executionStatus: readExecutionStatus(result),
      lastRunAt: isoNow(),
      lastFailure,
      lockStatus: readLockStatus(result),
      reloadGuidance: readReloadGuidance(result) ?? readReloadGuidance(planResult) ?? snapshot.reloadGuidance,
      restartRequired,
      ...(lastFailure ? {} : { lastReconciledCarrierCheckpoint: currentCarrierCheckpoint() }),
      result,
    });
    scheduleNextRun(lastFailure && retryCount <= MAX_RETRY_COUNT ? RETRY_INTERVAL_MS : DAILY_BACKGROUND_INTERVAL_MS);
    return result;
  })()
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

export async function executeManagedUpdateMutation(
  kind: ManagedUpdateMutationKind,
  input: {
    componentId: string;
    packageId?: string;
    receiptId?: string;
  }
): Promise<IOplRuntimeCommandResult | null> {
  const componentId = canonicalManagedUpdateComponentId(input.componentId);
  if (
    !componentId ||
    componentId !== input.componentId ||
    (kind === 'apply' && !USER_APPLY_COMPONENT_IDS.has(componentId)) ||
    componentId === 'opl_app' ||
    (componentId === 'opl_packages' && !input.packageId)
  ) {
    const result = mutationForbiddenResult(kind, input.componentId);
    emit({
      running: false,
      operation: null,
      busyAction: null,
      executionStatus: 'failed',
      lastTrigger: 'component_action',
      lastRunAt: isoNow(),
      lastFailure: result.error?.message ?? null,
      result,
    });
    return result;
  }

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

  const request: IOplUpdateComponentRequest = {
    componentId,
    ...(input.packageId ? { packageId: input.packageId } : {}),
  };
  const repairRequest: IOplUpdateRepairRequest = {
    componentId,
    ...(input.packageId ? { packageId: input.packageId } : {}),
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
        lastAction: managedUpdateAction({
          kind,
          componentId,
          status: summarizeResultStatus(result),
          at: actionAt,
          receiptRef: readReceiptRef(result, componentId) ?? input.receiptId,
          reloadGuidance,
        }),
        lockStatus: readLockStatus(result),
        reloadGuidance,
        restartRequired: readRestartRequired(result),
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
    const trigger =
      snapshot.lastReconciledCarrierCheckpoint === currentCarrierCheckpoint()
        ? 'app_startup_after_core_ready'
        : 'app_carrier_changed';
    void executeManagedUpdateReconciliation(trigger);
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
