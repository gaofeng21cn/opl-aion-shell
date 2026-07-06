/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  canonicalizeOplProfessionalAgentId,
  getOplHomeAgentShortcuts,
  getOplProfessionalAgentPackages,
  type OplProfessionalAgentPackage,
} from '@/common/config/oplProductProfile';
import type { OplAppStateRecord } from '@/common/types/opl/appState';
import { oplRecord, oplRecordList, oplString } from '@/renderer/hooks/system/useOplAppState';

export type CapabilityStatus = 'ready' | 'update' | 'sync' | 'source' | 'attention' | 'repair' | 'missing';

export type CapabilityCodexVisibility = 'visible' | 'needsSync' | 'notVisible' | 'unknown';

export type CapabilityPrimaryAction = 'view' | 'configure' | 'maintenance';

export type CapabilityPurposeViewModel = {
  key: string;
  title: string;
  description: string;
  tags: string[];
  moduleIds: string[];
  packageId: string | null;
  codexVisibleEntry: string | null;
  defaultHomeVisible: boolean | null;
  userConfigurable: boolean | null;
  sourceKind: string | null;
  packageLockRef: string | null;
  actionReceiptRef: string | null;
  rollbackRef: string | null;
  physicalSurface: CapabilityPhysicalSurfaceViewModel | null;
  status: CapabilityStatus;
  primaryAction: CapabilityPrimaryAction;
  codexVisibility: CapabilityCodexVisibility;
  version: string | null;
  source: string | null;
  lastSync: string | null;
  failureReason: string | null;
  workflowCandidateRefs: CapabilityCandidateReportViewModel[];
  workflowRefs: CapabilityRefViewModel[];
  connectorReadinessRefs: CapabilityRefViewModel[];
  connectorReadinessGroups: CapabilityRefGroupViewModel[];
  resourceContextRefs: CapabilityRefViewModel[];
  resourceContextGroups: CapabilityRefGroupViewModel[];
  exportBundleAction: CapabilityActionRefViewModel | null;
};

export type ExtraCapabilityPurposeInput = Omit<
  CapabilityPurposeViewModel,
  | 'status'
  | 'primaryAction'
  | 'codexVisibility'
  | 'version'
  | 'source'
  | 'lastSync'
  | 'failureReason'
  | 'workflowCandidateRefs'
  | 'packageId'
  | 'codexVisibleEntry'
  | 'defaultHomeVisible'
  | 'userConfigurable'
  | 'sourceKind'
  | 'packageLockRef'
  | 'actionReceiptRef'
  | 'rollbackRef'
  | 'physicalSurface'
  | 'workflowRefs'
  | 'connectorReadinessRefs'
  | 'connectorReadinessGroups'
  | 'resourceContextRefs'
  | 'resourceContextGroups'
  | 'exportBundleAction'
> & {
  packageId?: string | null;
};

type RuntimeModuleItem = OplAppStateRecord;
type RuntimeTaskItem = OplAppStateRecord;
type RuntimePackageStateItem = OplAppStateRecord;

export type CapabilityRefViewModel = {
  id: string;
  title: string;
  status: string | null;
  ref: string;
  owner: string | null;
  nextAction: string | null;
};

export type CapabilityDecisionAction = 'review' | 'needsChanges' | 'continueInConversation';

export type CapabilityCandidateReportViewModel = CapabilityRefViewModel & {
  purpose: string | null;
  reportRef: string | null;
  decisionStatus: string | null;
  decisionActions: CapabilityDecisionAction[];
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

export type CapabilityPhysicalSurfaceViewModel = {
  status: string | null;
  reloadRequired: boolean | null;
  pluginId: string | null;
  marketplaceId: string | null;
  codexPluginCachePath: string | null;
  marketplacePath: string | null;
  codexConfigPath: string | null;
};

const ASSISTANT_MODULE_ALIASES: Record<string, string[]> = {
  'med-autoscience': ['mas', 'medautoscience', 'med-auto-science'],
  'med-autogrant': ['mag', 'medautogrant', 'med-auto-grant'],
  'redcube-ai': ['rca', 'redcube', 'redcubeai', 'redcube-ai'],
  'opl-bookforge': ['obf', 'oplbookforge', 'opl-bookforge'],
  'opl-meta-agent': ['oma', 'oplmetaagent', 'opl-meta-agent'],
};

const DISPLAY_TOKEN_LABELS: Record<string, string> = {
  mas: 'MAS',
  mag: 'MAG',
  rca: 'RCA',
  obf: 'OBF',
  oma: 'OMA',
  medautoscience: 'MAS',
  medautogrant: 'MAG',
  redcubeai: 'RCA',
  oplbookforge: 'OBF',
  oplmetaagent: 'OMA',
};

function normalizeCapabilityModuleId(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function capabilityPurposeKey(agentPackage: OplProfessionalAgentPackage): string {
  const normalized = normalizeCapabilityModuleId(agentPackage.short_name);
  return normalized || normalizeCapabilityModuleId(agentPackage.package_id);
}

function canonicalCapabilityPackageId(value: string | null | undefined): string | null {
  if (!value) return null;
  const canonical = canonicalizeOplProfessionalAgentId(value);
  return canonical ? normalizeCapabilityModuleId(canonical) : null;
}

export function formatCapabilityDisplayToken(value: string | null | undefined): string {
  if (!value) return '';
  const normalized = normalizeCapabilityModuleId(value);
  const mapped = DISPLAY_TOKEN_LABELS[normalized];
  if (mapped) return mapped;
  if (/^[a-z0-9-]+$/.test(value) && value === value.toLowerCase()) return value.toUpperCase();
  return value;
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

function packageStateId(packageState: RuntimePackageStateItem): string {
  return (
    canonicalCapabilityPackageId(firstString(packageState.package_id, packageState.id, packageState.module_id)) ??
    normalizeCapabilityModuleId(
      firstString(packageState.package_id, packageState.id, packageState.module_id, packageState.name) ?? ''
    )
  );
}

function packageStateRecords(value: unknown): RuntimePackageStateItem[] {
  if (Array.isArray(value)) return oplRecordList(value);
  const record = oplRecord(value);
  if (Object.keys(record).length === 0) return [];
  const directId = firstString(record.package_id, record.id, record.module_id, record.name);
  if (directId) return [record];
  return Object.entries(record)
    .filter(([key, entry]) => key !== 'home_shortcut_preferences' && Object.keys(oplRecord(entry)).length > 0)
    .map(([key, entry]) =>
      Object.assign({}, oplRecord(entry), { package_id: firstString(oplRecord(entry).package_id, key) ?? key })
    );
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

function normalizeStatusToken(value: string | null): string | null {
  return value ? value.replace(/[^a-z0-9]/gi, '').toLowerCase() : null;
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
  const record = oplRecord(value);
  if (Object.keys(record).length > 0) return [record];
  return [];
}

function refIdFromRef(ref: string): string {
  return ref.split('/').filter(Boolean).pop() ?? ref;
}

function firstRecord(...values: unknown[]): OplAppStateRecord {
  for (const value of values) {
    const record = oplRecord(value);
    if (Object.keys(record).length > 0) return record;
  }
  return {};
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

const DEFAULT_CANDIDATE_DECISION_ACTIONS: CapabilityDecisionAction[] = [
  'review',
  'needsChanges',
  'continueInConversation',
];

function candidateRefValue(value: unknown): string | null {
  const record = oplRecord(value);
  const report = firstRecord(record.candidate_report, record.report, record.review);
  return (
    refValue(value) ??
    firstString(
      record.candidate_ref,
      record.candidate_report_ref,
      record.report_ref,
      record.review_ref,
      record.workflow_ref,
      record.current_workflow_ref,
      record.stage_workflow_ref,
      record.skill_ref,
      record.skill_candidate_ref,
      record.codex_ref,
      record.open_codex_ref,
      record.action_ref,
      record.route
    ) ??
    refValue(report)
  );
}

function normalizeDecisionAction(value: string): CapabilityDecisionAction | null {
  const normalized = value.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (
    normalized.includes('needschange') ||
    normalized.includes('needchange') ||
    normalized.includes('requestchange') ||
    normalized.includes('changesrequested')
  ) {
    return 'needsChanges';
  }
  if (
    normalized.includes('continueconversation') ||
    normalized.includes('conversation') ||
    normalized.includes('opencodex') ||
    normalized.includes('codex')
  ) {
    return 'continueInConversation';
  }
  if (normalized.includes('review')) return 'review';
  return null;
}

function decisionActionStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const record = oplRecord(entry);
      const text = firstString(entry, record.id, record.action_id, record.key, record.label, record.title, record.name);
      return text ? [text] : [];
    });
  }
  const record = oplRecord(value);
  if (Object.keys(record).length === 0) {
    const text = firstString(value);
    return text ? [text] : [];
  }
  return Object.entries(record)
    .filter(([, enabled]) => enabled !== false && enabled !== null)
    .map(([key, entry]) => firstString(oplRecord(entry).id, oplRecord(entry).action_id, key))
    .filter((text): text is string => Boolean(text));
}

function capabilityDecisionActions(record: OplAppStateRecord): CapabilityDecisionAction[] {
  const actions = [
    ...decisionActionStrings(record.decision_actions),
    ...decisionActionStrings(record.available_decisions),
    ...decisionActionStrings(record.available_actions),
    ...decisionActionStrings(record.review_actions),
    ...decisionActionStrings(record.actions),
  ]
    .map(normalizeDecisionAction)
    .filter((action): action is CapabilityDecisionAction => Boolean(action));
  return actions.length > 0 ? [...new Set(actions)] : DEFAULT_CANDIDATE_DECISION_ACTIONS;
}

function capabilityCandidateReport(
  value: unknown,
  fallback: Pick<CapabilityRefViewModel, 'owner' | 'nextAction' | 'status'>
): CapabilityCandidateReportViewModel | null {
  const record = oplRecord(value);
  const report = firstRecord(record.candidate_report, record.report, record.review);
  const ref = candidateRefValue(value);
  if (!ref) return null;
  const id =
    firstString(record.id, record.candidate_id, record.report_id, record.review_id, record.workflow_id, record.key) ??
    refIdFromRef(ref);
  return {
    id,
    title:
      firstString(record.title, record.candidate_title, record.report_title, record.label, record.name, report.title) ??
      id,
    status:
      firstString(record.status, record.state, record.candidate_status, record.review_status, report.status) ??
      fallback.status,
    ref,
    owner: firstString(record.owner, record.next_owner, report.owner, report.reviewer_owner) ?? fallback.owner,
    nextAction:
      firstString(
        record.next_action,
        record.next_visible_step,
        record.next_step,
        report.next_action,
        report.next_visible_step
      ) ?? fallback.nextAction,
    purpose:
      firstString(
        record.candidate_purpose,
        record.purpose,
        record.intended_use,
        record.use_case,
        record.description,
        record.summary,
        report.purpose,
        report.summary
      ) ?? null,
    reportRef:
      firstString(record.candidate_report_ref, record.report_ref, record.review_ref, report.report_ref, report.ref) ??
      refValue(report),
    decisionStatus:
      firstString(
        record.decision_status,
        record.review_status,
        record.candidate_decision_status,
        report.decision_status,
        report.review_status
      ) ?? null,
    decisionActions: capabilityDecisionActions(record),
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

function capabilityCandidateReportsFromTask(task: RuntimeTaskItem | undefined): CapabilityCandidateReportViewModel[] {
  if (!task) return [];
  const fallback = {
    owner: firstString(task.next_owner, task.owner),
    nextAction: firstString(task.next_visible_step, task.next_step),
    status: firstString(task.status, task.state, task.progress_label),
  };
  const refsFromKeys = (keys: string[]) =>
    keys
      .flatMap((key) => listValues(task[key]).map((entry) => capabilityCandidateReport(entry, fallback)))
      .filter((ref): ref is CapabilityCandidateReportViewModel => Boolean(ref));
  const reportFirstRefs = refsFromKeys([
    'workflow_candidate_refs',
    'candidate_workflow_refs',
    'candidate_report_refs',
    'candidate_reports',
    'report_refs',
    'review_refs',
    'skill_candidate_refs',
    'skill_pack_refs',
    'skill_refs',
  ]);
  return reportFirstRefs.length > 0 ? reportFirstRefs : refsFromKeys(['workflow_refs']);
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

function resourceContextGroupKey(ref: CapabilityRefViewModel): string {
  const text = `${ref.id} ${ref.title} ${ref.ref}`.toLowerCase();
  if (text.includes('gateway')) return 'gateway';
  if (text.includes('environment') || text.includes('template')) return 'environment';
  if (text.includes('storage')) return 'storage';
  if (text.includes('receipt')) return 'receipts';
  if (text.includes('cost') || text.includes('quota') || text.includes('billing')) return 'costs';
  return 'resources';
}

function resourceContextGroups(refs: CapabilityRefViewModel[]): CapabilityRefGroupViewModel[] {
  return ['gateway', 'environment', 'storage', 'resources', 'receipts', 'costs']
    .map((key) => ({ key, refs: refs.filter((ref) => resourceContextGroupKey(ref) === key) }))
    .filter((group) => group.refs.length > 0);
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

function isDeveloperCheckout(
  packageState: RuntimePackageStateItem | undefined,
  module: RuntimeModuleItem | undefined
): boolean {
  const sourcePolicy = firstRecord(packageState?.source_policy, module?.source_policy);
  const effectiveSource = normalizeStatusToken(
    firstString(
      sourcePolicy.effective_install_update_source,
      sourcePolicy.source,
      sourcePolicy.mode,
      packageState?.checkout_source,
      module?.checkout_source,
      packageState?.source,
      module?.source,
      packageState?.install_origin,
      module?.install_origin
    )
  );
  const configuredBy = normalizeStatusToken(
    firstString(sourcePolicy.configured_by, packageState?.configured_by, module?.configured_by)
  );
  return effectiveSource === 'gitcheckout' || configuredBy === 'developermode';
}

function mapCapabilityStatus(
  packageState: RuntimePackageStateItem | undefined,
  module: RuntimeModuleItem | undefined
): CapabilityStatus {
  const status = normalizeStatusToken(
    firstString(packageState?.status, packageState?.health_status, packageState?.state, capabilityModuleStatus(module))
  );
  const action = normalizeStatusToken(firstString(packageState?.recommended_action, module?.recommended_action));
  const git = firstRecord(packageState?.git, module?.git);
  const syncStatus = normalizeStatusToken(firstString(git.sync_status, git.status));
  const exposure = firstRecord(packageState?.capability_exposure, module?.capability_exposure);
  const exposureStatus = normalizeStatusToken(
    firstString(exposure.status, packageState?.exposure_status, module?.exposure_status)
  );
  if (!packageState && !module) return 'missing';
  if (['missing', 'notinstalled', 'notconfigured'].includes(status ?? '')) return 'missing';
  if (
    ['update', 'install', 'reinstall'].includes(action ?? '') ||
    ['updateavailable', 'staged'].includes(status ?? '')
  ) {
    return 'update';
  }
  if (
    isDeveloperCheckout(packageState, module) &&
    (status === 'dirty' || git.dirty === true || ['behind', 'diverged', 'ahead'].includes(syncStatus ?? ''))
  ) {
    return 'source';
  }
  if (
    ['needssync', 'stale', 'syncrequired'].includes(exposureStatus ?? '') &&
    !['failed', 'failedwithrepair', 'manualrequired', 'skippedmanualrequired', 'degraded', 'blocking'].includes(
      status ?? ''
    )
  ) {
    return 'sync';
  }
  if (status === 'dirty' || ['unknown', 'attentionrequired'].includes(status ?? '')) {
    return 'attention';
  }
  if (
    ['manualrequired', 'skippedmanualrequired', 'failed', 'failedwithrepair', 'degraded', 'blocking'].includes(
      status ?? ''
    )
  ) {
    return 'repair';
  }
  if (['ready', 'compatible', 'ok', 'installed', 'current'].includes(status ?? '')) return 'ready';
  return 'attention';
}

function capabilityPrimaryAction(status: CapabilityStatus): CapabilityPrimaryAction {
  if (status === 'missing') return 'configure';
  if (status === 'update' || status === 'sync' || status === 'repair') return 'maintenance';
  return 'view';
}

function capabilityCodexVisibility(
  packageState: RuntimePackageStateItem | undefined,
  module: RuntimeModuleItem | undefined,
  status: CapabilityStatus
): CapabilityCodexVisibility {
  if (!packageState && !module) return 'notVisible';
  const exposure = firstRecord(packageState?.capability_exposure, module?.capability_exposure);
  const codexVisible =
    packageState?.codex_visible ??
    packageState?.visible_to_codex ??
    packageState?.exposed_to_codex ??
    module?.codex_visible ??
    module?.visible_to_codex ??
    module?.exposed_to_codex ??
    exposure.codex_visible ??
    exposure.visible_to_codex ??
    exposure.exposed;
  const exposureStatus = normalizeStatusToken(
    firstString(exposure.status, packageState?.exposure_status, module?.exposure_status)
  );
  if (codexVisible === true || exposureStatus === 'visible' || exposureStatus === 'ready') return 'visible';
  if (status === 'ready' || status === 'source') return 'visible';
  if (status === 'update' || status === 'sync' || exposureStatus === 'stale' || exposureStatus === 'needssync') {
    return 'needsSync';
  }
  if (status === 'missing') return 'notVisible';
  return 'unknown';
}

function capabilityVersion(
  packageState: RuntimePackageStateItem | undefined,
  module: RuntimeModuleItem | undefined
): string | null {
  if (!packageState && !module) return null;
  const git = firstRecord(packageState?.git, module?.git);
  return (
    oplString(packageState?.version) ??
    oplString(packageState?.package_version) ??
    oplString(packageState?.installed_version) ??
    oplString(module.version) ??
    oplString(module.package_version) ??
    oplString(module.installed_version) ??
    oplString(git.short_sha)
  );
}

function capabilitySource(
  packageState: RuntimePackageStateItem | undefined,
  module: RuntimeModuleItem | undefined
): string | null {
  if (!packageState && !module) return null;
  const sourcePolicy = firstRecord(packageState?.source_policy, module?.source_policy);
  return (
    oplString(packageState?.source) ??
    oplString(packageState?.install_origin) ??
    oplString(packageState?.checkout_source) ??
    oplString(module.source) ??
    oplString(module.install_origin) ??
    oplString(module.checkout_source) ??
    oplString(sourcePolicy.source) ??
    oplString(sourcePolicy.mode)
  );
}

function capabilityLastSync(
  packageState: RuntimePackageStateItem | undefined,
  module: RuntimeModuleItem | undefined
): string | null {
  if (!packageState && !module) return null;
  const exposure = firstRecord(packageState?.capability_exposure, module?.capability_exposure);
  return (
    oplString(packageState?.last_sync_at) ??
    oplString(packageState?.synced_at) ??
    oplString(packageState?.updated_at) ??
    oplString(module.last_sync_at) ??
    oplString(module.synced_at) ??
    oplString(module.updated_at) ??
    oplString(exposure.last_sync_at) ??
    oplString(exposure.synced_at)
  );
}

function capabilityFailureReason(
  packageState: RuntimePackageStateItem | undefined,
  module: RuntimeModuleItem | undefined
): string | null {
  if (!packageState && !module) return null;
  const error = firstRecord(packageState?.error, module?.error);
  const exposure = firstRecord(packageState?.capability_exposure, module?.capability_exposure);
  return (
    oplString(packageState?.failure_reason) ??
    oplString(packageState?.last_failure) ??
    oplString(packageState?.reason) ??
    oplString(module.failure_reason) ??
    oplString(module.last_failure) ??
    oplString(module.reason) ??
    oplString(error.message) ??
    oplString(exposure.failure_reason) ??
    oplString(exposure.last_failure)
  );
}

function capabilitySourceKind(
  packageState: RuntimePackageStateItem | undefined,
  module: RuntimeModuleItem | undefined
): string | null {
  if (!packageState && !module) return null;
  const sourcePolicy = firstRecord(packageState?.source_policy, module?.source_policy);
  return firstString(
    packageState?.source_kind,
    packageState?.source_type,
    module?.source_kind,
    module?.source_type,
    sourcePolicy.kind,
    sourcePolicy.source,
    sourcePolicy.mode
  );
}

function capabilityPackageLockRef(
  packageState: RuntimePackageStateItem | undefined,
  module: RuntimeModuleItem | undefined
): string | null {
  if (!packageState && !module) return null;
  const packageLock = firstRecord(packageState?.package_lock, module?.package_lock);
  const lockReceipt = firstRecord(packageState?.lock_receipt, module?.lock_receipt);
  return (
    refValue(packageState?.package_lock_ref) ??
    refValue(packageState?.lock_ref) ??
    refValue(module?.package_lock_ref) ??
    refValue(module?.lock_ref) ??
    refValue(packageLock) ??
    refValue(lockReceipt) ??
    firstString(packageLock.receipt_id, lockReceipt.receipt_id)
  );
}

function capabilityActionReceiptRef(
  packageState: RuntimePackageStateItem | undefined,
  module: RuntimeModuleItem | undefined,
  task: RuntimeTaskItem | undefined
): string | null {
  const packageReceipt = oplRecord(packageState?.action_receipt);
  const moduleReceipt = oplRecord(module?.action_receipt);
  const taskReceipt = oplRecord(task?.action_receipt);
  return (
    refValue(packageState?.action_receipt_ref) ??
    refValue(module?.action_receipt_ref) ??
    refValue(task?.action_receipt_ref) ??
    refValue(packageReceipt) ??
    refValue(moduleReceipt) ??
    refValue(taskReceipt) ??
    firstString(
      packageReceipt.receipt_id,
      packageReceipt.latest_receipt_ref,
      packageReceipt.execute_receipt_ref,
      moduleReceipt.receipt_id,
      moduleReceipt.latest_receipt_ref,
      moduleReceipt.execute_receipt_ref,
      taskReceipt.receipt_id,
      taskReceipt.latest_receipt_ref,
      taskReceipt.execute_receipt_ref
    )
  );
}

function capabilityRollbackRef(
  packageState: RuntimePackageStateItem | undefined,
  module: RuntimeModuleItem | undefined
): string | null {
  if (!packageState && !module) return null;
  const rollback = firstRecord(packageState?.rollback, module?.rollback);
  return (
    refValue(packageState?.rollback_ref) ??
    refValue(packageState?.rollback_receipt_ref) ??
    refValue(module.rollback_ref) ??
    refValue(module.rollback_receipt_ref) ??
    refValue(rollback) ??
    firstString(rollback.ref, rollback.receipt_id)
  );
}

function nullableBool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function capabilityPhysicalSurface(
  packageState: RuntimePackageStateItem | undefined,
  module: RuntimeModuleItem | undefined
): CapabilityPhysicalSurfaceViewModel | null {
  if (!packageState && !module) return null;
  const packageLock = firstRecord(packageState?.package_lock, module?.package_lock);
  const actionReceipt = firstRecord(packageState?.action_receipt, module?.action_receipt);
  const surface = firstRecord(
    packageState?.physical_surface,
    module?.physical_surface,
    packageLock.physical_surface,
    actionReceipt.physical_surface
  );
  if (Object.keys(surface).length === 0) return null;
  return {
    status: firstString(surface.status, surface.state),
    reloadRequired: nullableBool(surface.reload_required),
    pluginId: firstString(surface.plugin_id),
    marketplaceId: firstString(surface.marketplace_id),
    codexPluginCachePath: firstString(surface.codex_plugin_cache_path),
    marketplacePath: firstString(surface.marketplace_path),
    codexConfigPath: firstString(surface.codex_config_path),
  };
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
    | 'workflowCandidateRefs'
    | 'packageId'
    | 'codexVisibleEntry'
    | 'defaultHomeVisible'
    | 'userConfigurable'
    | 'sourceKind'
    | 'packageLockRef'
    | 'actionReceiptRef'
    | 'rollbackRef'
    | 'physicalSurface'
    | 'workflowRefs'
    | 'connectorReadinessRefs'
    | 'connectorReadinessGroups'
    | 'resourceContextRefs'
    | 'resourceContextGroups'
    | 'exportBundleAction'
  > &
    Partial<
      Pick<CapabilityPurposeViewModel, 'packageId' | 'codexVisibleEntry' | 'defaultHomeVisible' | 'userConfigurable'>
    >,
  packageState: RuntimePackageStateItem | undefined,
  module: RuntimeModuleItem | undefined,
  task: RuntimeTaskItem | undefined
): CapabilityPurposeViewModel {
  const status = mapCapabilityStatus(packageState, module);
  const connectorReadinessRefs = capabilityRefsFromTask(task, ['connector_readiness_refs']);
  const resourceContextRefs = capabilityRefsFromTask(task, [
    'resource_source_refs',
    'gateway_status_ref',
    'environment_ref',
    'environment_refs',
    'environment_template_ref',
    'environment_template_refs',
    'template_ref',
    'template_refs',
    'environment_version_ref',
    'environment_version_refs',
    'environment_source_ref',
    'environment_source_refs',
    'task_applicability_ref',
    'task_applicability_refs',
    'storage_ref',
    'resource_receipt_ref',
    'cost_estimate_ref',
  ]);
  return {
    ...purpose,
    packageId: purpose.packageId ?? null,
    codexVisibleEntry: purpose.codexVisibleEntry ?? null,
    defaultHomeVisible: purpose.defaultHomeVisible ?? null,
    userConfigurable: purpose.userConfigurable ?? null,
    sourceKind: capabilitySourceKind(packageState, module),
    packageLockRef: capabilityPackageLockRef(packageState, module),
    actionReceiptRef: capabilityActionReceiptRef(packageState, module, task),
    rollbackRef: capabilityRollbackRef(packageState, module),
    physicalSurface: capabilityPhysicalSurface(packageState, module),
    status,
    primaryAction: capabilityPrimaryAction(status),
    codexVisibility: capabilityCodexVisibility(packageState, module, status),
    version: capabilityVersion(packageState, module),
    source: capabilitySource(packageState, module),
    lastSync: capabilityLastSync(packageState, module),
    failureReason: capabilityFailureReason(packageState, module),
    workflowCandidateRefs: capabilityCandidateReportsFromTask(task),
    workflowRefs: capabilityRefsFromTask(task, ['workflow_refs']),
    connectorReadinessRefs,
    connectorReadinessGroups: connectorReadinessGroups(connectorReadinessRefs),
    resourceContextRefs,
    resourceContextGroups: resourceContextGroups(resourceContextRefs),
    exportBundleAction: exportBundleActionFromTask(task),
  };
}

function agentPackageModuleIds(agentPackage: OplProfessionalAgentPackage): string[] {
  const canonicalPackageId = canonicalizeOplProfessionalAgentId(agentPackage.package_id);
  const ids = [
    canonicalPackageId,
    agentPackage.short_name,
    agentPackage.codex_visible_entry,
    ...agentPackage.required_skill_ids,
    ...(ASSISTANT_MODULE_ALIASES[canonicalPackageId] ?? []),
  ];
  return [...new Set(ids.map(normalizeCapabilityModuleId).filter(Boolean))];
}

function agentPackageTags(agentPackage: OplProfessionalAgentPackage): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const token of [agentPackage.short_name, ...agentPackage.required_skill_ids].filter(Boolean)) {
    const formatted = formatCapabilityDisplayToken(token);
    if (!formatted || seen.has(formatted)) continue;
    seen.add(formatted);
    tags.push(formatted);
  }
  return tags;
}

export function buildCapabilitiesViewModel(
  appState: OplAppStateRecord,
  _localeKey: string,
  extraPurposes: ExtraCapabilityPurposeInput[] = []
): CapabilityPurposeViewModel[] {
  const packageStates = new Map<string, RuntimePackageStateItem>();
  const canonicalAgentPackages = oplRecord(appState.agent_packages);
  const packageRoots = [
    oplRecord(canonicalAgentPackages.directory),
    oplRecord(canonicalAgentPackages.status_index),
    oplRecord(appState.opl_agent_packages),
    oplRecord(appState.opl_agent_package_status),
  ];
  for (const root of packageRoots) {
    for (const candidate of [
      root.items,
      root.packages,
      root.statuses,
      root.package_status,
      root.package_states,
      root,
    ]) {
      for (const packageState of packageStateRecords(candidate)) {
        const id = packageStateId(packageState);
        if (!id) continue;
        const existing = packageStates.get(id) ?? {};
        packageStates.set(id, { ...existing, ...packageState });
      }
    }
  }
  const modulesPayload = oplRecord(appState.modules);
  const modules = new Map<string, RuntimeModuleItem>();
  for (const module of capabilityModuleRecords(modulesPayload.items ?? modulesPayload.modules ?? modulesPayload)) {
    modules.set(capabilityModuleId(module), module);
  }
  const tasks = new Map<string, RuntimeTaskItem>();
  for (const task of capabilityTaskRecords(appState)) {
    tasks.set(capabilityTaskId(task), task);
  }

  const shortcutsByPackageId = new Map(getOplHomeAgentShortcuts().map((shortcut) => [shortcut.package_id, shortcut]));
  const defaultPurposes = getOplProfessionalAgentPackages().map((agentPackage) => {
    const moduleIds = agentPackageModuleIds(agentPackage);
    const packageState = packageStates.get(canonicalCapabilityPackageId(agentPackage.package_id) ?? '');
    const module = moduleIds.map((id) => modules.get(id)).find(Boolean);
    const task = moduleIds.map((id) => tasks.get(id)).find(Boolean);
    const canonicalPackageId = canonicalizeOplProfessionalAgentId(agentPackage.package_id);
    const shortcut = shortcutsByPackageId.get(canonicalPackageId) ?? shortcutsByPackageId.get(agentPackage.package_id);
    return buildCapabilityPurpose(
      {
        key: capabilityPurposeKey(agentPackage),
        title: agentPackage.display_name,
        description: shortcut?.primary_label ?? agentPackage.short_name ?? agentPackage.display_name,
        tags: agentPackageTags(agentPackage),
        moduleIds,
        packageId: canonicalPackageId,
        codexVisibleEntry: agentPackage.codex_visible_entry,
        defaultHomeVisible: agentPackage.default_home_visible,
        userConfigurable: shortcut?.user_configurable ?? false,
      },
      packageState,
      module,
      task
    );
  });
  const mergedPurposes = new Map(defaultPurposes.map((purpose) => [purpose.packageId ?? purpose.key, purpose]));
  const explicitPurposes = extraPurposes.map((purpose) => {
    const moduleIds = purpose.moduleIds.map(normalizeCapabilityModuleId);
    const packageState = packageStates.get(canonicalCapabilityPackageId(purpose.packageId ?? purpose.key) ?? '');
    const module = moduleIds.map((id) => modules.get(id)).find(Boolean);
    const task = moduleIds.map((id) => tasks.get(id)).find(Boolean);
    return buildCapabilityPurpose(
      {
        ...purpose,
        packageId: purpose.packageId ? canonicalizeOplProfessionalAgentId(purpose.packageId) : purpose.packageId,
        moduleIds,
      },
      packageState,
      module,
      task
    );
  });
  for (const purpose of explicitPurposes) {
    const packageKey = purpose.packageId ?? purpose.key;
    const existingEntry = [...mergedPurposes.values()].find(
      (entry) =>
        entry.packageId === packageKey ||
        entry.key === purpose.key ||
        entry.moduleIds.some((moduleId) => purpose.moduleIds.includes(moduleId))
    );
    if (!existingEntry) {
      mergedPurposes.set(packageKey, purpose);
      continue;
    }
    mergedPurposes.set(existingEntry.packageId ?? existingEntry.key, {
      ...existingEntry,
      tags: [...new Set([...existingEntry.tags, ...purpose.tags])],
      moduleIds: [...new Set([...existingEntry.moduleIds, ...purpose.moduleIds])],
    });
  }
  return [...mergedPurposes.values()];
}
