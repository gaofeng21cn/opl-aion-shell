/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { oplRecord, oplRecordList, oplString } from '@/renderer/hooks/system/useOplAppState';

export type ManagedUpdateComponentId = 'opl_base' | 'opl_app' | 'opl_packages';

export type ManagedUpdateCondition = {
  id: string;
  type: string;
  status: string;
  reason?: string;
  message?: string;
};

export type ManagedUpdateSubstatus = {
  id: 'dependency_status' | 'integration_status' | 'projection_status' | 'profile_migration_status';
  state: string;
  summary?: string;
  conditions: ManagedUpdateCondition[];
};

export type ManagedDependencyUpdateMode = 'silent_managed' | 'explicit_owner_delegated' | 'detect_only_guidance';

export type ManagedDependencyUpdateAction = {
  actionId: string;
  label?: string;
  surface?: string;
  delegatedSurface?: string;
  payloadFields: string[];
  confirmationRequired: boolean;
  ownerKind?: string;
  autoApplyAllowed: boolean;
};

export type ManagedDependency = {
  id: string;
  kind?: string;
  installed: boolean;
  version?: string;
  latestVersion?: string;
  currentness: string;
  ownership: string;
  updateMode: ManagedDependencyUpdateMode;
  updateAction?: ManagedDependencyUpdateAction;
  activationPolicy?: string;
  binaryPath?: string;
  guidance?: string;
  external: boolean;
};

export type ManagedDependencyCatalog = {
  lifecycleOwner?: string;
  flowDependencies: ManagedDependency[];
  dependencies: ManagedDependency[];
};

export type OplFlowManagedCapabilityCatalog = {
  skillIds: string[];
  cliDependencies: ManagedDependency[];
};

export type ManagedUpdateComponent = {
  id: ManagedUpdateComponentId;
  label: string;
  state: string;
  conditions: ManagedUpdateCondition[];
  substatuses: ManagedUpdateSubstatus[];
  packageId?: string;
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
  hostExecutorRequired: boolean;
  hostUpdateRoute?: string;
  hostUpdateRouteExamples: string[];
  dataVolumePreservation?: string;
  preservedMounts: string[];
  requiredPreservationEvidence: string[];
  developerCheckout: boolean;
  dirtyCheckout: boolean;
  safeToApply: boolean;
  repairAllowed: boolean;
  rollbackAllowed: boolean;
  dependencyCatalog?: ManagedDependencyCatalog;
};

export type ManagedUpdatePlane = {
  operation?: string;
  operationMode?: string;
  updateChannel?: string;
  lockStatus?: string;
  summary?: string;
  reloadGuidance?: string;
  packageManualRequiredTargetCount?: number;
  components: ManagedUpdateComponent[];
};

export const MANAGED_UPDATE_COMPONENT_IDS: ManagedUpdateComponentId[] = ['opl_base', 'opl_app', 'opl_packages'];

const MANAGED_UPDATE_LABELS: Record<ManagedUpdateComponentId, string> = {
  opl_base: 'OPL Base',
  opl_app: 'OPL App',
  opl_packages: 'OPL Packages',
};

const MUTATION_FORBIDDEN_COMPONENT_IDS = new Set<ManagedUpdateComponentId>(['opl_app']);
const APPLY_ALLOWED_COMPONENT_IDS = new Set<ManagedUpdateComponentId>(['opl_base', 'opl_packages']);
const MANAGED_UPDATE_SUBSTATUS_IDS: Record<ManagedUpdateComponentId, ManagedUpdateSubstatus['id'][]> = {
  opl_base: ['dependency_status', 'integration_status'],
  opl_app: [],
  opl_packages: ['projection_status', 'profile_migration_status'],
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

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => firstOplString(entry)).filter((entry): entry is string => Boolean(entry))
    : [];
}

function nonNegativeNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const numberValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
    if (Number.isFinite(numberValue) && numberValue >= 0) return numberValue;
  }
  return undefined;
}

function readManualRequiredTargetCount(component: Record<string, unknown> | undefined): number | undefined {
  if (!component) return undefined;
  const receipt = oplRecord(component.receipt ?? component.receipts);
  const statusDetail = oplRecord(component.status_detail ?? component.statusDetail);
  const receiptStatusDetail = oplRecord(receipt.status_detail ?? receipt.statusDetail);
  return nonNegativeNumber(
    statusDetail.manual_required_targets_count,
    statusDetail.manualRequiredTargetsCount,
    receiptStatusDetail.manual_required_targets_count,
    receiptStatusDetail.manualRequiredTargetsCount
  );
}

export function canonicalManagedUpdateComponentId(value: unknown): ManagedUpdateComponentId | null {
  const raw = firstOplString(value);
  if (!raw) return null;
  if (MANAGED_UPDATE_COMPONENT_IDS.includes(raw as ManagedUpdateComponentId)) {
    return raw as ManagedUpdateComponentId;
  }
  return null;
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
      (action) =>
        canonicalManagedUpdateComponentId(firstOplString(action.component_id, action.componentId)) === componentId
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

function readManagedUpdateSubstatuses(
  component: Record<string, unknown>,
  componentId: ManagedUpdateComponentId
): ManagedUpdateSubstatus[] {
  return MANAGED_UPDATE_SUBSTATUS_IDS[componentId].flatMap((id) => {
    const raw = component[id];
    if (raw === undefined || raw === null) return [];
    const record = oplRecord(raw);
    const state = firstOplString(
      typeof raw === 'string' ? raw : undefined,
      record.state,
      record.status,
      record.health_status
    );
    if (!state) return [];
    return [
      {
        id,
        state,
        summary: firstOplString(record.summary, record.message, record.description, record.guidance, record.reason),
        conditions: readManagedUpdateConditions(record.conditions, id),
      },
    ];
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

function versionValue(value: unknown): string | undefined {
  const scalar = firstOplString(value);
  if (scalar) return scalar;
  const record = oplRecord(value);
  const entries = Object.entries(record)
    .map(([key, entry]) => {
      const version = firstOplString(entry);
      return version ? `${key} ${version}` : null;
    })
    .filter((entry): entry is string => Boolean(entry));
  return entries.length > 0 ? entries.join(', ') : undefined;
}

function managedDependencyUpdateMode(value: unknown): ManagedDependencyUpdateMode {
  const normalized = firstOplString(value);
  if (normalized === 'silent_managed' || normalized === 'explicit_owner_delegated') return normalized;
  if (
    normalized === 'silent_stage_verify' ||
    normalized === 'silent_managed_reconcile' ||
    normalized === 'updated_with_opl_base_framework_generation' ||
    normalized === 'updated_with_app_runtime_generation'
  ) {
    return 'silent_managed';
  }
  return 'detect_only_guidance';
}

function readManagedDependencyAction(value: unknown): ManagedDependencyUpdateAction | undefined {
  const action = oplRecord(value);
  const actionId = firstOplString(action.action_id, action.actionId);
  if (!actionId) return undefined;
  return {
    actionId,
    label: firstOplString(action.label),
    surface: firstOplString(action.surface),
    delegatedSurface: firstOplString(action.delegated_surface, action.delegatedSurface),
    payloadFields: stringArrayValue(action.payload_fields ?? action.payloadFields),
    confirmationRequired: action.confirmation_required !== false,
    ownerKind: firstOplString(action.owner_kind, action.ownerKind),
    autoApplyAllowed: oplBoolean(action.auto_apply_allowed ?? action.autoApplyAllowed),
  };
}

function readManagedDependency(value: unknown, fallbackId: string, external = false): ManagedDependency | null {
  const dependency = oplRecord(value);
  const id = firstOplString(dependency.dependency_id, dependency.id, fallbackId);
  if (!id) return null;
  const updateMode = managedDependencyUpdateMode(dependency.update_mode ?? dependency.update_policy);
  const updateAction =
    updateMode === 'explicit_owner_delegated' ? readManagedDependencyAction(dependency.update_action) : undefined;
  return {
    id,
    kind: firstOplString(dependency.dependency_kind, dependency.kind),
    installed: oplBoolean(dependency.installed) || Boolean(firstOplString(dependency.binary_path, dependency.path)),
    version: versionValue(dependency.version ?? dependency.current_version),
    latestVersion: versionValue(dependency.latest_version),
    currentness:
      firstOplString(dependency.currentness, dependency.version_status, dependency.status) ??
      (oplBoolean(dependency.installed) ? 'unknown' : 'missing'),
    ownership: firstOplString(dependency.ownership, dependency.owner) ?? 'unknown',
    updateMode,
    updateAction,
    activationPolicy: firstOplString(dependency.activation_policy),
    binaryPath: firstOplString(dependency.binary_path, dependency.path),
    guidance: firstOplString(dependency.guidance, dependency.note),
    external,
  };
}

export function readOplFlowManagedCapabilityCatalog(
  catalog: ManagedDependencyCatalog | undefined
): OplFlowManagedCapabilityCatalog {
  if (!catalog) return { skillIds: [], cliDependencies: [] };
  const skillIds = catalog.flowDependencies
    .filter((dependency) => dependency.kind === 'codex_skill')
    .map((dependency) => dependency.id);
  const baseDependenciesById = new Map(catalog.dependencies.map((dependency) => [dependency.id, dependency]));
  const cliDependencies = catalog.flowDependencies
    .filter((dependency) => dependency.kind === 'cli')
    .map((dependency) => baseDependenciesById.get(dependency.id) ?? dependency)
    .filter((dependency) => !dependency.external);
  return { skillIds, cliDependencies };
}

function readManagedDependencyCatalog(component: Record<string, unknown>): ManagedDependencyCatalog | undefined {
  const current = oplRecord(component.current);
  const catalog = oplRecord(component.dependency_catalog ?? current.dependency_catalog);
  const dependencies = oplRecordList(catalog.dependencies).flatMap((entry, index) => {
    const primary = readManagedDependency(entry, `dependency-${index + 1}`);
    const externalInstallations = oplRecordList(entry.external_installations).flatMap((external, externalIndex) => {
      const externalDependency = readManagedDependency(
        external,
        `${primary?.id ?? `dependency-${index + 1}`}-external-${externalIndex + 1}`,
        true
      );
      return externalDependency ? [externalDependency] : [];
    });
    return primary ? [primary, ...externalInstallations] : externalInstallations;
  });
  const flowDependencies = oplRecordList(catalog.flow_dependencies).flatMap((entry, index) => {
    const dependency = readManagedDependency(entry, `flow-dependency-${index + 1}`);
    return dependency ? [dependency] : [];
  });
  if (dependencies.length === 0 && flowDependencies.length === 0) return undefined;
  return {
    lifecycleOwner: firstOplString(catalog.lifecycle_owner),
    flowDependencies,
    dependencies,
  };
}

export function readManagedUpdatePlane(parsed: unknown, appState: Record<string, unknown>): ManagedUpdatePlane {
  const root = managedUpdateRoot(parsed, appState);
  const rawComponents = managedUpdateComponentRecords(root);
  const byId = new Map<string, Record<string, unknown>>();
  for (const component of rawComponents) {
    const sourceId = firstOplString(component.component_id, component.componentId, component.id);
    const id = canonicalManagedUpdateComponentId(sourceId);
    if (id && !byId.has(id)) byId.set(id, component);
  }
  const components = MANAGED_UPDATE_COMPONENT_IDS.map((id) => {
    const component = byId.get(id) ?? {};
    const receipt = oplRecord(component.receipt ?? component.receipts);
    const repairAction = findRepairAction(root, id);
    const repairActionSourceId = firstOplString(repairAction.component_id, repairAction.componentId);
    const canonicalRepairActionSource = !repairActionSourceId || repairActionSourceId === id;
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
    const hostUpdateRoute = firstOplString(component.host_update_route, component.hostUpdateRoute);
    const dataVolumePreservation = firstOplString(component.data_volume_preservation, component.dataVolumePreservation);
    const hostExecutorRequired =
      state === 'host_executor_required' ||
      oplBoolean(component.host_executor_required) ||
      oplBoolean(component.hostExecutorRequired);
    const manualRequired =
      state === 'manual_required' ||
      state === 'skipped_manual_required' ||
      state === 'host_executor_required' ||
      oplBoolean(component.manual_required) ||
      hostExecutorRequired ||
      Boolean(manualGuidance);
    const developerCheckout = Boolean(source && DEVELOPER_CHECKOUT_SOURCES.has(source));
    const dirtyCheckout =
      state === 'dirty' ||
      oplBoolean(component.dirty_checkout) ||
      oplBoolean(component.checkout_dirty) ||
      oplBoolean(component.working_tree_dirty) ||
      oplBoolean(oplRecord(component.git).dirty);
    const mutationBlocked = manualRequired || developerCheckout || dirtyCheckout;
    const packageId = firstOplString(component.package_id, component.packageId, component.action_package_id);
    const packageTargetReady = id !== 'opl_packages' || Boolean(packageId);
    return {
      id,
      label: firstOplString(component.display_group, component.label, component.name) ?? MANAGED_UPDATE_LABELS[id],
      state,
      conditions: readManagedUpdateConditions(component.conditions, id),
      substatuses: readManagedUpdateSubstatuses(component, id),
      packageId,
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
      hostExecutorRequired,
      hostUpdateRoute,
      hostUpdateRouteExamples: stringArrayValue(
        component.host_update_route_examples ?? component.hostUpdateRouteExamples
      ),
      dataVolumePreservation,
      preservedMounts: stringArrayValue(component.preserved_mounts),
      requiredPreservationEvidence: stringArrayValue(component.required_preservation_evidence),
      developerCheckout,
      dirtyCheckout,
      safeToApply:
        rawSafeToApply &&
        packageTargetReady &&
        !mutationBlocked &&
        APPLY_ALLOWED_COMPONENT_IDS.has(id) &&
        !MUTATION_FORBIDDEN_COMPONENT_IDS.has(id),
      repairAllowed:
        rawRepairAllowed &&
        packageTargetReady &&
        canonicalRepairActionSource &&
        !mutationBlocked &&
        !MUTATION_FORBIDDEN_COMPONENT_IDS.has(id),
      rollbackAllowed:
        rawRollbackAllowed && packageTargetReady && !mutationBlocked && !MUTATION_FORBIDDEN_COMPONENT_IDS.has(id),
      dependencyCatalog: id === 'opl_base' ? readManagedDependencyCatalog(component) : undefined,
    };
  });
  return {
    operation: firstOplString(root.operation),
    operationMode: firstOplString(root.operation_mode, root.operationMode),
    updateChannel: firstOplString(root.update_channel, root.channel),
    lockStatus: firstOplString(oplRecord(root.idempotency_lock).status, oplRecord(root.lock).status),
    summary: firstOplString(oplRecord(root.summary).message, root.summary),
    reloadGuidance: firstOplString(root.reload_guidance),
    packageManualRequiredTargetCount: readManualRequiredTargetCount(
      rawComponents.find((component) => {
        const id = firstOplString(component.component_id, component.componentId, component.id);
        return id === 'opl_packages' || id === 'capability_packages';
      })
    ),
    components,
  };
}
