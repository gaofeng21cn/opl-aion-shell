/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { oplRecord, oplRecordList, oplString } from '@/renderer/hooks/system/useOplAppState';

export type ManagedUpdateComponentId =
  | 'app_binary'
  | 'runtime_toolchain'
  | 'agent_package_channel'
  | 'capability_exposure';

export type ManagedUpdateCondition = {
  id: string;
  type: string;
  status: string;
  reason?: string;
  message?: string;
};

export type ManagedUpdateComponent = {
  id: ManagedUpdateComponentId;
  label: string;
  state: string;
  conditions: ManagedUpdateCondition[];
  receiptRef?: string;
  repairAction?: string;
  repairReceiptId?: string;
  rollbackRef?: string;
  currentVersion?: string;
  targetVersion?: string;
  latestVersion?: string;
  versionDetail?: string;
  needsRestart: boolean;
  needsReload: boolean;
  reloadGuidance?: string;
  manualGuidance?: string;
  manualRequired: boolean;
  developerCheckout: boolean;
  dirtyCheckout: boolean;
  safeToApply: boolean;
  repairAllowed: boolean;
  rollbackAllowed: boolean;
};

export type ManagedUpdatePlane = {
  operation?: string;
  operationMode?: string;
  updateChannel?: string;
  lockStatus?: string;
  summary?: string;
  reloadGuidance?: string;
  components: ManagedUpdateComponent[];
};

export const MANAGED_UPDATE_COMPONENT_IDS: ManagedUpdateComponentId[] = [
  'app_binary',
  'runtime_toolchain',
  'agent_package_channel',
  'capability_exposure',
];

const MANAGED_UPDATE_LABELS: Record<ManagedUpdateComponentId, string> = {
  app_binary: 'Installation carrier',
  runtime_toolchain: 'Runtime substrate',
  agent_package_channel: 'OPL capability packages',
  capability_exposure: 'Codex Surface',
};

const DEVELOPER_CHECKOUT_SOURCES = new Set([
  'developer_checkout',
  'developer_mode',
  'env_override',
  'local_checkout',
  'sibling_workspace',
  'source_checkout',
]);

function oplBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

function firstOplString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const stringValue = oplString(value);
    if (stringValue) return stringValue;
  }
  return undefined;
}

function managedUpdateRoot(parsed: unknown, appState: Record<string, unknown>): Record<string, unknown> {
  const parsedRecord = oplRecord(parsed);
  const parsedAppState = oplRecord(parsedRecord.app_state);
  return oplRecord(
    parsedRecord.managed_update ??
      parsedRecord.managed_update_plane ??
      parsedAppState.managed_update_plane ??
      appState.managed_update_plane
  );
}

function managedUpdateComponentRecords(root: Record<string, unknown>): Record<string, unknown>[] {
  const rawComponents = root.components ?? root.planes ?? root.items;
  if (Array.isArray(rawComponents)) return oplRecordList(rawComponents);
  const componentMap = oplRecord(rawComponents);
  return Object.entries(componentMap).map(([id, value]) => ({ ...oplRecord(value), component_id: id }));
}

function findRepairAction(root: Record<string, unknown>, componentId: string): Record<string, unknown> {
  return (
    oplRecordList(root.repair_actions).find(
      (action) => firstOplString(action.component_id, action.componentId) === componentId
    ) ?? {}
  );
}

function readManagedUpdateConditions(value: unknown, componentId: string): ManagedUpdateCondition[] {
  return oplRecordList(value).map((condition, index) => {
    const type = firstOplString(condition.type, condition.condition_type, condition.id) ?? `condition-${index + 1}`;
    const status = firstOplString(condition.status, condition.state) ?? 'Unknown';
    return {
      id: `${componentId}-${type}-${index + 1}`,
      type,
      status,
      reason: firstOplString(condition.reason),
      message: firstOplString(condition.message, condition.description),
    };
  });
}

function readVersionDetail(component: Record<string, unknown>): {
  currentVersion?: string;
  targetVersion?: string;
  latestVersion?: string;
  versionDetail?: string;
} {
  const currentVersion = firstOplString(
    component.current_version,
    component.currentVersion,
    component.installed_version,
    component.installedVersion,
    component.version
  );
  const targetVersion = firstOplString(
    component.target_version,
    component.targetVersion,
    component.to_version,
    component.toVersion,
    component.available_version,
    component.availableVersion
  );
  const latestVersion = firstOplString(component.latest_version, component.latestVersion);
  const nextVersion = targetVersion ?? latestVersion;
  const versionDetail =
    currentVersion && nextVersion && currentVersion !== nextVersion
      ? `${currentVersion} -> ${nextVersion}`
      : (currentVersion ?? nextVersion);
  return {
    currentVersion,
    targetVersion,
    latestVersion,
    versionDetail,
  };
}

export function readManagedUpdatePlane(parsed: unknown, appState: Record<string, unknown>): ManagedUpdatePlane {
  const root = managedUpdateRoot(parsed, appState);
  const byId = new Map<string, Record<string, unknown>>();
  for (const component of managedUpdateComponentRecords(root)) {
    const id = firstOplString(component.component_id, component.componentId, component.id);
    if (id) byId.set(id, component);
  }
  const components = MANAGED_UPDATE_COMPONENT_IDS.map((id) => {
    const component = byId.get(id) ?? {};
    const receipt = oplRecord(component.receipt ?? component.receipts);
    const repairAction = findRepairAction(root, id);
    const state = firstOplString(component.state, component.status, component.health_status) ?? 'unknown';
    const receiptRef = firstOplString(
      component.receipt_ref,
      component.last_receipt_ref,
      receipt.last_receipt_ref,
      receipt.receipt_ref,
      receipt.ref
    );
    const repairReceiptId = firstOplString(
      component.repair_receipt_ref,
      receipt.repair_receipt_ref,
      repairAction.receipt_ref,
      repairAction.receiptId,
      receiptRef
    );
    const rollbackRef = firstOplString(
      component.rollback_ref,
      component.rollbackRef,
      receipt.rollback_ref,
      receipt.rollbackRef
    );
    const repairActionRef = firstOplString(
      component.repair_action,
      receipt.repair_action,
      repairAction.action_ref,
      repairAction.ref
    );
    const rawSafeToApply =
      oplBoolean(component.safe_to_apply) || oplBoolean(component.apply_allowed) || oplBoolean(component.can_apply);
    const rawRepairAllowed =
      oplBoolean(component.repair_allowed) ||
      oplBoolean(component.can_repair) ||
      state === 'failed_with_repair' ||
      Boolean(repairActionRef);
    const rawRollbackAllowed =
      oplBoolean(component.rollback_allowed) || oplBoolean(component.can_rollback) || Boolean(rollbackRef);
    const source = firstOplString(component.source, component.install_origin, component.checkout_source);
    const manualGuidance = firstOplString(
      component.manual_guidance,
      component.rollback_manual_guidance,
      component.repair_manual_guidance
    );
    const manualRequired =
      state === 'manual_required' ||
      state === 'skipped_manual_required' ||
      oplBoolean(component.manual_required) ||
      Boolean(manualGuidance);
    const developerCheckout = Boolean(source && DEVELOPER_CHECKOUT_SOURCES.has(source));
    const dirtyCheckout =
      state === 'dirty' ||
      oplBoolean(component.dirty_checkout) ||
      oplBoolean(component.checkout_dirty) ||
      oplBoolean(component.working_tree_dirty) ||
      oplBoolean(oplRecord(component.git).dirty);
    const mutationBlocked = manualRequired || developerCheckout || dirtyCheckout;
    return {
      id,
      label: firstOplString(component.display_group, component.label, component.name) ?? MANAGED_UPDATE_LABELS[id],
      state,
      conditions: readManagedUpdateConditions(component.conditions, id),
      receiptRef,
      repairAction: repairActionRef,
      repairReceiptId,
      rollbackRef,
      ...readVersionDetail(component),
      needsRestart: oplBoolean(component.needs_restart) || oplBoolean(component.restart_required),
      needsReload: oplBoolean(component.needs_reload) || oplBoolean(component.reload_required),
      reloadGuidance: firstOplString(component.reload_guidance, component.restart_guidance, root.reload_guidance),
      manualGuidance,
      manualRequired,
      developerCheckout,
      dirtyCheckout,
      safeToApply: rawSafeToApply && !mutationBlocked,
      repairAllowed: rawRepairAllowed && !mutationBlocked,
      rollbackAllowed: rawRollbackAllowed && !mutationBlocked,
    };
  });
  return {
    operation: firstOplString(root.operation),
    operationMode: firstOplString(root.operation_mode, root.operationMode),
    updateChannel: firstOplString(root.update_channel, root.channel),
    lockStatus: firstOplString(oplRecord(root.idempotency_lock).status, oplRecord(root.lock).status),
    summary: firstOplString(oplRecord(root.summary).message, root.summary),
    reloadGuidance: firstOplString(root.reload_guidance),
    components,
  };
}
