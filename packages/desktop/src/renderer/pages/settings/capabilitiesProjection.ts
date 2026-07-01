/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getOplAssistantSkillProfile,
  getOplDefaultHomeAssistants,
  type OplHomeAssistant,
} from '@/common/config/oplProductProfile';
import type { OplAppStateRecord } from '@/common/types/opl/appState';
import { oplRecord, oplRecordList, oplString } from '@/renderer/hooks/system/useOplAppState';

export type CapabilityStatus = 'ready' | 'update' | 'repair' | 'missing';

export type CapabilityCodexVisibility = 'visible' | 'needsSync' | 'notVisible' | 'unknown';

export type CapabilityPurposeViewModel = {
  key: string;
  title: string;
  description: string;
  tags: string[];
  moduleIds: string[];
  status: CapabilityStatus;
  codexVisibility: CapabilityCodexVisibility;
  version: string | null;
  source: string | null;
  lastSync: string | null;
  failureReason: string | null;
  workflowRefs: CapabilityRefViewModel[];
  connectorReadinessRefs: CapabilityRefViewModel[];
  connectorReadinessGroups: CapabilityRefGroupViewModel[];
  exportBundleAction: CapabilityActionRefViewModel | null;
};

export type ExtraCapabilityPurposeInput = Omit<
  CapabilityPurposeViewModel,
  | 'status'
  | 'codexVisibility'
  | 'version'
  | 'source'
  | 'lastSync'
  | 'failureReason'
  | 'workflowRefs'
  | 'connectorReadinessRefs'
  | 'connectorReadinessGroups'
  | 'exportBundleAction'
>;

type RuntimeModuleItem = OplAppStateRecord;
type RuntimeTaskItem = OplAppStateRecord;

export type CapabilityRefViewModel = {
  id: string;
  title: string;
  status: string | null;
  ref: string;
  owner: string | null;
  nextAction: string | null;
};

export type CapabilityRefGroupViewModel = {
  key: string;
  refs: CapabilityRefViewModel[];
};

export type CapabilityActionRefViewModel = {
  actionId: string | null;
  ref: string;
  status: string | null;
  dryRunSummary: string | null;
  receiptSummary: string | null;
};

const ASSISTANT_MODULE_ALIASES: Record<string, string[]> = {
  mas: ['medautoscience', 'med-auto-science'],
  mag: ['medautogrant', 'med-auto-grant'],
  rca: ['redcube', 'redcubeai', 'redcube-ai'],
  bookforge: ['oplbookforge', 'opl-bookforge'],
  oma: ['oplmetaagent', 'opl-meta-agent'],
};

function normalizeCapabilityModuleId(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function capabilityModuleId(module: RuntimeModuleItem): string {
  return normalizeCapabilityModuleId(
    oplString(module.module_id) ??
      oplString(module.id) ??
      oplString(module.name) ??
      oplString(module.display_name) ??
      ''
  );
}

function capabilityModuleRecords(value: unknown): RuntimeModuleItem[] {
  if (Array.isArray(value)) return oplRecordList(value);
  const record = oplRecord(value);
  return Object.entries(record)
    .filter(([, module]) => Object.keys(oplRecord(module)).length > 0)
    .map(([id, module]) => Object.assign({}, oplRecord(module), { module_id: id }));
}

function capabilityTaskRecords(appState: OplAppStateRecord): RuntimeTaskItem[] {
  const operator = oplRecord(appState.operator);
  const workbench = oplRecord(operator.workbench);
  const drilldowns = workbench.task_drilldowns;
  if (Array.isArray(drilldowns)) return oplRecordList(drilldowns);
  return Object.entries(oplRecord(drilldowns))
    .filter(([, task]) => Object.keys(oplRecord(task)).length > 0)
    .map(([id, task]) => Object.assign({}, oplRecord(task), { task_id: id }));
}

function capabilityModuleStatus(module: RuntimeModuleItem | undefined): string {
  if (!module) return 'not_configured';
  return (
    oplString(module.status) ??
    oplString(module.health_status) ??
    (module.installed === true ? 'ready' : null) ??
    'unknown'
  );
}

function capabilityTaskId(task: RuntimeTaskItem): string {
  return normalizeCapabilityModuleId(
    oplString(task.task_id) ??
      oplString(task.domain_id) ??
      oplString(task.module_id) ??
      oplString(task.id) ??
      oplString(task.name) ??
      ''
  );
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const text = oplString(value);
    if (text) return text;
  }
  return null;
}

function refValue(value: unknown): string | null {
  if (typeof value === 'string') return oplString(value);
  const record = oplRecord(value);
  return firstString(record.ref, record.reference, record.uri, record.url, record.path, record.id);
}

function listValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return [value];
  return oplRecordList(value);
}

function refIdFromRef(ref: string): string {
  return ref.split('/').filter(Boolean).pop() ?? ref;
}

function capabilityRef(
  value: unknown,
  fallback: Pick<CapabilityRefViewModel, 'owner' | 'nextAction' | 'status'>
): CapabilityRefViewModel | null {
  const record = oplRecord(value);
  const ref = refValue(value);
  if (!ref) return null;
  const id = firstString(record.id, record.workflow_id, record.connector_id, record.key) ?? refIdFromRef(ref);
  return {
    id,
    title: firstString(record.title, record.label, record.name) ?? id,
    status: firstString(record.status, record.state) ?? fallback.status,
    ref,
    owner: firstString(record.owner, record.next_owner) ?? fallback.owner,
    nextAction: firstString(record.next_action, record.next_visible_step, record.next_step) ?? fallback.nextAction,
  };
}

function capabilityRefsFromTask(task: RuntimeTaskItem | undefined, keys: string[]): CapabilityRefViewModel[] {
  if (!task) return [];
  const fallback = {
    owner: firstString(task.next_owner, task.owner),
    nextAction: firstString(task.next_visible_step, task.next_step),
    status: firstString(task.status, task.state, task.progress_label),
  };
  return keys
    .flatMap((key) => listValues(task[key]).map((entry) => capabilityRef(entry, fallback)))
    .filter((ref): ref is CapabilityRefViewModel => Boolean(ref));
}

function connectorGroupKey(ref: CapabilityRefViewModel): 'oplConnect' | 'oplFabric' | null {
  const text = `${ref.id} ${ref.title} ${ref.ref}`.toLowerCase();
  if (text.includes('fabric')) return 'oplFabric';
  if (text.includes('connect')) return 'oplConnect';
  return null;
}

function connectorReadinessGroups(refs: CapabilityRefViewModel[]): CapabilityRefGroupViewModel[] {
  const groups: CapabilityRefGroupViewModel[] = [
    { key: 'oplConnect', refs: refs.filter((ref) => connectorGroupKey(ref) === 'oplConnect') },
    { key: 'oplFabric', refs: refs.filter((ref) => connectorGroupKey(ref) === 'oplFabric') },
  ];
  return groups.filter((group) => group.refs.length > 0);
}

function exportBundleActionFromTask(task: RuntimeTaskItem | undefined): CapabilityActionRefViewModel | null {
  if (!task) return null;
  const actionReceipt = oplRecord(task.action_receipt);
  const actionRecord = oplRecord(task.export_bundle_action_ref);
  const actionFallback = oplRecord(task.export_bundle_action);
  const ref =
    refValue(task.export_bundle_action_ref) ??
    refValue(task.export_bundle_action) ??
    refValue(actionRecord) ??
    refValue(actionFallback) ??
    firstString(actionReceipt.dry_run_action_ref);
  if (!ref) return null;
  return {
    actionId:
      firstString(actionRecord.action_id, actionRecord.id, actionFallback.action_id, actionFallback.id) ??
      refIdFromRef(ref),
    ref,
    status: firstString(actionRecord.status, actionFallback.status, actionReceipt.status, task.status, task.state),
    dryRunSummary: firstString(
      actionRecord.dry_run_summary,
      actionRecord.preview_summary,
      actionFallback.dry_run_summary,
      actionFallback.preview_summary,
      actionReceipt.dry_run_summary,
      actionReceipt.action_route,
      actionReceipt.dry_run_action_ref
    ),
    receiptSummary: firstString(
      actionRecord.receipt_summary,
      actionFallback.receipt_summary,
      actionReceipt.receipt_summary,
      actionReceipt.latest_receipt_ref,
      actionReceipt.execute_receipt_ref
    ),
  };
}

function mapCapabilityStatus(module: RuntimeModuleItem | undefined): CapabilityStatus {
  const status = capabilityModuleStatus(module);
  const action = oplString(module?.recommended_action);
  if (!module || ['missing', 'not_installed', 'notInstalled', 'not_configured'].includes(status)) return 'missing';
  if (['update', 'install', 'reinstall'].includes(action ?? '') || ['update_available', 'staged'].includes(status)) {
    return 'update';
  }
  if (
    [
      'dirty',
      'manual_required',
      'skipped_manual_required',
      'failed',
      'failed_with_repair',
      'degraded',
      'blocking',
      'attention_required',
      'unknown',
    ].includes(status)
  ) {
    return 'repair';
  }
  if (['ready', 'compatible', 'ok', 'installed', 'current'].includes(status)) return 'ready';
  return 'repair';
}

function capabilityCodexVisibility(
  module: RuntimeModuleItem | undefined,
  status: CapabilityStatus
): CapabilityCodexVisibility {
  if (!module) return 'notVisible';
  const exposure = oplRecord(module.capability_exposure);
  const codexVisible =
    module.codex_visible ??
    module.visible_to_codex ??
    module.exposed_to_codex ??
    exposure.codex_visible ??
    exposure.visible_to_codex ??
    exposure.exposed;
  const exposureStatus = oplString(exposure.status) ?? oplString(module.exposure_status);
  if (codexVisible === true || exposureStatus === 'visible' || exposureStatus === 'ready') return 'visible';
  if (status === 'ready') return 'visible';
  if (status === 'update' || exposureStatus === 'stale' || exposureStatus === 'needs_sync') return 'needsSync';
  if (status === 'missing') return 'notVisible';
  return 'unknown';
}

function capabilityVersion(module: RuntimeModuleItem | undefined): string | null {
  if (!module) return null;
  const git = oplRecord(module.git);
  return (
    oplString(module.version) ??
    oplString(module.package_version) ??
    oplString(module.installed_version) ??
    oplString(git.short_sha)
  );
}

function capabilitySource(module: RuntimeModuleItem | undefined): string | null {
  if (!module) return null;
  const sourcePolicy = oplRecord(module.source_policy);
  return (
    oplString(module.source) ??
    oplString(module.install_origin) ??
    oplString(module.checkout_source) ??
    oplString(sourcePolicy.source) ??
    oplString(sourcePolicy.mode)
  );
}

function capabilityLastSync(module: RuntimeModuleItem | undefined): string | null {
  if (!module) return null;
  const exposure = oplRecord(module.capability_exposure);
  return (
    oplString(module.last_sync_at) ??
    oplString(module.synced_at) ??
    oplString(module.updated_at) ??
    oplString(exposure.last_sync_at) ??
    oplString(exposure.synced_at)
  );
}

function capabilityFailureReason(module: RuntimeModuleItem | undefined): string | null {
  if (!module) return null;
  const error = oplRecord(module.error);
  const exposure = oplRecord(module.capability_exposure);
  return (
    oplString(module.failure_reason) ??
    oplString(module.last_failure) ??
    oplString(module.reason) ??
    oplString(error.message) ??
    oplString(exposure.failure_reason) ??
    oplString(exposure.last_failure)
  );
}

function buildCapabilityPurpose(
  purpose: Omit<
    CapabilityPurposeViewModel,
    | 'status'
    | 'codexVisibility'
    | 'version'
    | 'source'
    | 'lastSync'
    | 'failureReason'
    | 'workflowRefs'
    | 'connectorReadinessRefs'
    | 'connectorReadinessGroups'
    | 'exportBundleAction'
  >,
  module: RuntimeModuleItem | undefined,
  task: RuntimeTaskItem | undefined
): CapabilityPurposeViewModel {
  const status = mapCapabilityStatus(module);
  const connectorReadinessRefs = capabilityRefsFromTask(task, ['connector_readiness_refs']);
  return {
    ...purpose,
    status,
    codexVisibility: capabilityCodexVisibility(module, status),
    version: capabilityVersion(module),
    source: capabilitySource(module),
    lastSync: capabilityLastSync(module),
    failureReason: capabilityFailureReason(module),
    workflowRefs: capabilityRefsFromTask(task, ['workflow_refs']),
    connectorReadinessRefs,
    connectorReadinessGroups: connectorReadinessGroups(connectorReadinessRefs),
    exportBundleAction: exportBundleActionFromTask(task),
  };
}

function assistantModuleIds(assistant: OplHomeAssistant): string[] {
  const profile = getOplAssistantSkillProfile(assistant.id);
  const ids = [
    assistant.id,
    assistant.short_name,
    ...(profile?.required_skills ?? []),
    ...(ASSISTANT_MODULE_ALIASES[assistant.id] ?? []),
  ];
  return [...new Set(ids.map(normalizeCapabilityModuleId).filter(Boolean))];
}

function assistantTags(assistant: OplHomeAssistant): string[] {
  const profile = getOplAssistantSkillProfile(assistant.id);
  return [...new Set([assistant.short_name, ...(profile?.required_skills ?? [])].filter(Boolean))];
}

export function buildCapabilitiesViewModel(
  appState: OplAppStateRecord,
  localeKey: string,
  extraPurposes: ExtraCapabilityPurposeInput[] = []
): CapabilityPurposeViewModel[] {
  const modulesPayload = oplRecord(appState.modules);
  const modules = new Map<string, RuntimeModuleItem>();
  for (const module of capabilityModuleRecords(modulesPayload.items ?? modulesPayload.modules ?? modulesPayload)) {
    modules.set(capabilityModuleId(module), module);
  }
  const tasks = new Map<string, RuntimeTaskItem>();
  for (const task of capabilityTaskRecords(appState)) {
    tasks.set(capabilityTaskId(task), task);
  }

  const defaultPurposes = getOplDefaultHomeAssistants().map((assistant) => {
    const moduleIds = assistantModuleIds(assistant);
    const module = moduleIds.map((id) => modules.get(id)).find(Boolean);
    const task = moduleIds.map((id) => tasks.get(id)).find(Boolean);
    return buildCapabilityPurpose(
      {
        key: assistant.id,
        title: assistant.home_purpose_label,
        description:
          assistant.description_i18n[localeKey] ?? assistant.description_i18n['en-US'] ?? assistant.display_name,
        tags: assistantTags(assistant),
        moduleIds,
      },
      module,
      task
    );
  });
  const explicitPurposes = extraPurposes.map((purpose) => {
    const moduleIds = purpose.moduleIds.map(normalizeCapabilityModuleId);
    const module = moduleIds.map((id) => modules.get(id)).find(Boolean);
    const task = moduleIds.map((id) => tasks.get(id)).find(Boolean);
    return buildCapabilityPurpose(
      {
        ...purpose,
        moduleIds,
      },
      module,
      task
    );
  });
  return [...defaultPurposes, ...explicitPurposes];
}
