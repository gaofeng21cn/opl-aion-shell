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
const MANAGED_UPDATE_COMPONENT_STATES = new Set([
  'current',
  'currentness_not_checked',
  'update_available',
  'staged',
  'needs_restart',
  'needs_reload',
  'failed_with_repair',
  'skipped_manual_required',
]);

let retryCount = 0;
let lastAttemptedCarrierCheckpoint: string | null = null;
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
    const structured = nestedRecord(postApplyGuidance, 'reload_guidance') ?? nestedRecord(receipt, 'reload_guidance');
    const guidance =
      stringValue(component.reload_guidance) ??
      stringValue(component.restart_guidance) ??
      stringValue(postApplyGuidance?.reload_guidance) ??
      stringValue(receipt?.reload_guidance) ??
      (structured && (booleanValue(structured.reload_required) || booleanValue(structured.reload_recommended))
        ? (stringValue(structured.reason) ?? stringValue(structured.command_ref))
        : null);
    if (guidance) return guidance;
  }
  return null;
}

function readRestartRequired(result: IOplRuntimeCommandResult | null | undefined): boolean {
  const root = managedUpdateRoot(result);
  return (
    booleanValue(root.restart_required) ||
    componentRecords(root).some(
      (component) =>
        component.state === 'needs_restart' ||
        booleanValue(component.needs_restart) ||
        booleanValue(component.restart_required)
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

function terminalStatusReadbackError(result: IOplRuntimeCommandResult | null | undefined): string | null {
  const commandError = resultErrorMessage(result);
  if (commandError) return commandError;
  if (!result || result.surface !== 'update_status' || !isRecord(result.parsed)) {
    return 'Framework status readback unavailable';
  }
  const root = nestedRecord(result.parsed, 'managed_update');
  if (
    !root ||
    stringValue(root.surface_id) !== 'opl_managed_updater_kernel' ||
    stringValue(root.operation) !== 'status' ||
    !Array.isArray(root.components) ||
    root.components.length === 0
  ) {
    return 'Framework status readback unavailable';
  }
  const componentIds = root.components.flatMap((component) => {
    if (!isRecord(component)) return [];
    const rawComponentId = stringValue(component.component_id);
    const componentId = canonicalManagedUpdateComponentId(rawComponentId);
    const state = stringValue(component.state);
    return rawComponentId && componentId === rawComponentId && state && MANAGED_UPDATE_COMPONENT_STATES.has(state)
      ? [componentId]
      : [];
  });
  if (componentIds.length !== root.components.length || new Set(componentIds).size !== componentIds.length) {
    return 'Framework status readback unavailable';
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

function readPersistedSnapshot(): Partial<ManagedUpdateMaintenanceSnapshot> {
  try {
    const raw = localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    lastAttemptedCarrierCheckpoint =
      stringValue(parsed.lastAttemptedCarrierCheckpoint) ?? stringValue(parsed.lastReconciledCarrierCheckpoint);
    retryCount =
      typeof parsed.retryCount === 'number' && Number.isInteger(parsed.retryCount)
        ? Math.max(0, Math.min(MAX_RETRY_COUNT + 1, parsed.retryCount))
        : 0;
    return {
      lastRunAt: stringValue(parsed.lastRunAt),
      nextRunAt: stringValue(parsed.nextRunAt),
      lastReconciledCarrierCheckpoint: stringValue(parsed.lastReconciledCarrierCheckpoint),
      lastFailure: stringValue(parsed.lastFailure),
      lastSkipReason: stringValue(parsed.lastSkipReason),
      reloadGuidance: stringValue(parsed.reloadGuidance),
      restartRequired: parsed.restartRequired === true,
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
        lastReconciledCarrierCheckpoint: snapshot.lastReconciledCarrierCheckpoint,
        retryCount,
        lastAttemptedCarrierCheckpoint,
        lastFailure: snapshot.lastFailure,
        lastSkipReason: snapshot.lastSkipReason,
        reloadGuidance: snapshot.reloadGuidance,
        restartRequired: snapshot.restartRequired,
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
  const packageMutation = componentId === 'opl_packages';
  const message = packageMutation
    ? 'Package lifecycle mutations require a Framework projected action through opl app action execute'
    : `OPL Settings ${kind} accepts only opl_base. opl_app uses its host or carrier updater.`;
  const command =
    componentId === 'opl_base'
      ? `opl update ${kind} --json`
      : componentId === 'opl_packages'
        ? 'opl app action execute --action <package-action-id> --json'
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
        ...(lastFailure ? {} : { lastAction: null }),
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

  lastAttemptedCarrierCheckpoint = currentCarrierCheckpoint();
  emit({
    running: true,
    operation: 'status',
    busyAction: null,
    executionStatus: 'running',
    lastTrigger: trigger,
    lastFailure: null,
    lastAction: null,
  });

  inflight = (async (): Promise<IOplRuntimeCommandResult | null> => {
    let preflightStatusResult: IOplRuntimeCommandResult | null = null;
    try {
      preflightStatusResult = await invokeRead('status');
    } catch {
      // The read-only projection prefetch must not block the owned reconciliation sequence.
    }
    let projectionResult: IOplRuntimeCommandResult | null = null;
    if (!resultErrorMessage(preflightStatusResult)) {
      projectionResult = preflightStatusResult;
      emit({
        result: preflightStatusResult,
        lastFailure: null,
        lastAction: null,
        lockStatus: readLockStatus(preflightStatusResult),
        reloadGuidance: readReloadGuidance(preflightStatusResult) ?? snapshot.reloadGuidance,
        restartRequired: readRestartRequired(preflightStatusResult),
      });
    }

    emit({ operation: 'check' });
    let result = await invokeRead('check');
    let lastFailure = resultErrorMessage(result);
    let planResult: IOplRuntimeCommandResult | null = null;
    let applyResult: IOplRuntimeCommandResult | null = null;
    let eligibleComponentIds: ManagedUpdateComponentId[] = [];

    if (!lastFailure) {
      projectionResult = result;
      emit({ operation: 'plan' });
      planResult = await invokeRead('plan');
      result = planResult;
      lastFailure = resultErrorMessage(result);
      if (!lastFailure) projectionResult = result;
    }

    if (!lastFailure && planResult) {
      const decision = projectBackgroundPlan(planResult);
      eligibleComponentIds = decision.eligibleComponentIds;
    }

    if (!lastFailure && eligibleComponentIds.length > 0) {
      emit({ operation: 'apply', busyAction: 'auto_apply:managed_update_plan' });
      applyResult = await ipcBridge.oplRuntime.applyUpdatePlan.invoke();
      result = applyResult;
      lastFailure = resultErrorMessage(applyResult);
    }

    if (!lastFailure && applyResult) {
      emit({ operation: 'status', busyAction: null });
      result = await invokeRead('status');
      lastFailure = terminalStatusReadbackError(result);
      if (!lastFailure) projectionResult = result;
    }

    retryCount = lastFailure ? retryCount + 1 : 0;
    const applyActionStatus = applyResult ? summarizeResultStatus(applyResult) : null;
    const verifiedAction =
      applyResult && (applyActionStatus === 'failed' || !lastFailure)
        ? managedUpdateAction({
            kind: 'auto_apply',
            componentId: eligibleComponentIds[0],
            componentIds: eligibleComponentIds,
            status: applyActionStatus ?? 'failed',
            at: isoNow(),
            receiptRef: eligibleComponentIds
              .map((componentId) => readReceiptRef(result, componentId) ?? readReceiptRef(applyResult, componentId))
              .find(Boolean),
            reloadGuidance:
              readReloadGuidance(result) ?? readReloadGuidance(applyResult) ?? readReloadGuidance(planResult),
          })
        : null;
    const restartRequired =
      Boolean(verifiedAction) &&
      (readRestartRequired(result) || readRestartRequired(applyResult) || readRestartRequired(planResult));
    emit({
      running: false,
      operation: null,
      busyAction: null,
      executionStatus: lastFailure ? 'failed' : readExecutionStatus(result),
      lastRunAt: isoNow(),
      lastFailure,
      lastAction: verifiedAction,
      lockStatus: readLockStatus(result),
      reloadGuidance:
        verifiedAction || !applyResult
          ? (readReloadGuidance(result) ?? readReloadGuidance(applyResult) ?? readReloadGuidance(planResult))
          : null,
      restartRequired,
      ...(lastFailure ? {} : { lastReconciledCarrierCheckpoint: currentCarrierCheckpoint() }),
      result: projectionResult ?? result,
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
        lastAction: null,
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
  const componentId = canonicalManagedUpdateComponentId(input.componentId);
  if (!componentId || componentId !== input.componentId || componentId !== 'opl_base') {
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
    lastAction: null,
  });

  const request: IOplUpdateComponentRequest = {
    componentId,
  };
  const repairRequest: IOplUpdateRepairRequest = {
    componentId,
    receiptId: input.receiptId,
  };

  inflight = (
    kind === 'apply'
      ? ipcBridge.oplRuntime.applyUpdateComponent.invoke(request)
      : kind === 'rollback'
        ? ipcBridge.oplRuntime.rollbackUpdateComponent.invoke(request)
        : ipcBridge.oplRuntime.repairUpdate.invoke(repairRequest)
  )
    .then(async (mutationResult): Promise<IOplRuntimeCommandResult | null> => {
      const mutationFailure = resultErrorMessage(mutationResult);
      let result = mutationResult;
      let lastFailure = mutationFailure;
      if (!mutationFailure) {
        emit({ operation: 'status', busyAction: null });
        result = await invokeRead('status');
        lastFailure = terminalStatusReadbackError(result);
      }
      const actionAt = isoNow();
      const mutationVerified = !mutationFailure && !lastFailure;
      const actionFailed = Boolean(mutationFailure);
      const reloadGuidance =
        mutationVerified || actionFailed ? (readReloadGuidance(result) ?? readReloadGuidance(mutationResult)) : null;
      retryCount = lastFailure ? retryCount + 1 : 0;
      emit({
        running: false,
        operation: null,
        busyAction: null,
        executionStatus: lastFailure ? 'failed' : readExecutionStatus(result),
        lastRunAt: actionAt,
        lastFailure,
        lastAction:
          mutationVerified || actionFailed
            ? managedUpdateAction({
                kind,
                componentId,
                status: actionFailed ? 'failed' : 'completed',
                at: actionAt,
                receiptRef:
                  readReceiptRef(result, componentId) ?? readReceiptRef(mutationResult, componentId) ?? input.receiptId,
                reloadGuidance,
              })
            : null,
        lockStatus: lastFailure ? null : readLockStatus(result),
        reloadGuidance,
        restartRequired: mutationVerified && (readRestartRequired(result) || readRestartRequired(mutationResult)),
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
        lastAction: null,
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
  const resumeWhenDue = () => {
    if (document.visibilityState === 'hidden' || navigator.onLine === false || inflight) return;
    const dueAt = Date.parse(snapshot.nextRunAt ?? '');
    if (!Number.isFinite(dueAt) || Date.now() >= dueAt) {
      if (schedulerTimer) clearTimeout(schedulerTimer);
      void executeManagedUpdateReconciliation('daily_background_maintenance');
    }
  };
  if (!schedulerStarted) {
    schedulerStarted = true;
    const carrierChanged = lastAttemptedCarrierCheckpoint !== currentCarrierCheckpoint();
    const dueAt = Date.parse(snapshot.nextRunAt ?? '');
    if (carrierChanged || !Number.isFinite(dueAt) || dueAt <= Date.now()) {
      void executeManagedUpdateReconciliation(carrierChanged ? 'app_carrier_changed' : 'app_startup_after_core_ready');
    } else {
      scheduleNextRun(dueAt - Date.now());
      void invokeRead('status')
        .then((result) => {
          if (!schedulerStarted || inflight || resultErrorMessage(result)) return;
          emit({
            result,
            reloadGuidance: readReloadGuidance(result),
            restartRequired: readRestartRequired(result),
            lockStatus: readLockStatus(result),
          });
        })
        .catch(() => {
          /* Preserve recovery hints until a valid owner readback arrives. */
        });
    }
    window.addEventListener('online', resumeWhenDue);
    document.addEventListener('visibilitychange', resumeWhenDue);
  }

  return () => {
    window.removeEventListener('online', resumeWhenDue);
    document.removeEventListener('visibilitychange', resumeWhenDue);
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
  lastAttemptedCarrierCheckpoint = null;
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
