/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  canonicalizeOplProfessionalAgentId,
  getOplFirstPartyPackagePresentations,
  getOplHomeAgentShortcuts,
  getOplProfessionalAgentPackages,
  type OplProfessionalAgentPackage,
} from '@/common/config/oplProductProfile';
import {
  parseOplProjectedPackageAction,
  type OplAppStateRecord,
  type OplProjectedPackageAction,
} from '@/common/types/opl/appState';
import { oplRecord, oplRecordList, oplString } from '@/renderer/hooks/system/useOplAppState';

export type CapabilityStatus =
  | 'ready'
  | 'update'
  | 'sync'
  | 'source'
  | 'verification'
  | 'inactive'
  | 'attention'
  | 'repair'
  | 'missing';

export type CapabilityAvailabilityStatus = Exclude<CapabilityStatus, 'source'>;

export type CapabilityCodexVisibility = 'visible' | 'verificationPending' | 'needsSync' | 'notVisible' | 'unknown';

export type CapabilityPrimaryAction = 'view' | 'configure' | 'maintenance';

export type CapabilityDependencyCheckViewModel = {
  packageId: string;
  ready: boolean | null;
  failureReasons: string[];
};

export type CapabilityDependencyReadinessViewModel = {
  status: 'ready' | 'repair_required' | 'blocked' | null;
  requiredCount: number | null;
  readyCount: number | null;
  checks: CapabilityDependencyCheckViewModel[];
};

export type CapabilityRepairActionViewModel = {
  actionId: string | null;
  commandRef: string | null;
  enabled: boolean | null;
  reasonCode: string | null;
};

export type CapabilityActivationActionViewModel = {
  actionId: 'agent_package_activate';
  commandRef: string;
  enabled: boolean;
  preparationStatus: 'not_installed' | 'prepare_required' | 'ready';
  reasonCode: string;
};

export type CapabilityPackageActionViewModel = OplProjectedPackageAction;

export type CapabilitySourceExplanationViewModel = {
  kind: string | null;
  source: string | null;
  summary: string | null;
  registryUrl: string | null;
};

export type CapabilityInstallabilityViewModel = {
  status: string | null;
  installable: boolean | null;
};

export type CapabilityReadinessViewModel = {
  status: string | null;
  operationalReady: boolean | null;
  launchAllowed: boolean | null;
  verificationDeferred: boolean | null;
  reason: string | null;
  statusReadError: string | null;
};

export type CapabilityDependentGuardViewModel = {
  requiredByPackageIds: string[];
  disableAllowed: boolean | null;
  disableReasonCode: string | null;
  uninstallAllowed: boolean | null;
  uninstallReasonCode: string | null;
};

export type CapabilityDependencyClosureViewModel = {
  transactionId: string | null;
  closureDigest: string | null;
  lastKnownGoodTransactionId: string | null;
  lastKnownGoodClosureDigest: string | null;
};

export type CapabilityPurposeViewModel = {
  key: string;
  title: string;
  description: string;
  tags: string[];
  moduleIds: string[];
  packageId: string | null;
  packageRole: string | null;
  publisher: string | null;
  trustTier: string | null;
  selectedVersion: string | null;
  stableVersion: string | null;
  installedVersion: string | null;
  sourceExplanation: CapabilitySourceExplanationViewModel;
  installability: CapabilityInstallabilityViewModel;
  readiness: CapabilityReadinessViewModel;
  codexVisibleEntry: string | null;
  defaultHomeVisible: boolean | null;
  userConfigurable: boolean | null;
  sourceKind: string | null;
  installState: string | null;
  updateState: string | null;
  sourceState: string | null;
  trustState: string | null;
  moduleId: string | null;
  actualSource: string | null;
  sourcePreference: 'auto' | 'managed' | 'developer';
  checkoutPath: string | null;
  managedCheckoutPath: string | null;
  developerCheckoutPath: string | null;
  sourceFallbackReason: string | null;
  packageLockRef: string | null;
  actionReceiptRef: string | null;
  rollbackRef: string | null;
  manifestUrl: string | null;
  registryUrl: string | null;
  physicalSurface: CapabilityPhysicalSurfaceViewModel | null;
  dependencyReadiness: CapabilityDependencyReadinessViewModel | null;
  operationalReady: boolean | null;
  launchAllowed: boolean | null;
  launchBlockedReason: string | null;
  allowedWhenBlocked: string[];
  repairAction: CapabilityRepairActionViewModel | null;
  availableActions: Record<string, CapabilityPackageActionViewModel>;
  recommendedActionId: string | null;
  recommendedAction: CapabilityPackageActionViewModel | null;
  installAction: CapabilityPackageActionViewModel | null;
  activationAction: CapabilityActivationActionViewModel | null;
  dependentGuard: CapabilityDependentGuardViewModel | null;
  dependencyClosure: CapabilityDependencyClosureViewModel | null;
  enabled: boolean | null;
  hidden: boolean | null;
  status: CapabilityStatus;
  availabilityStatus: CapabilityAvailabilityStatus;
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
  | 'availabilityStatus'
  | 'primaryAction'
  | 'codexVisibility'
  | 'version'
  | 'source'
  | 'lastSync'
  | 'failureReason'
  | 'workflowCandidateRefs'
  | 'packageId'
  | 'packageRole'
  | 'publisher'
  | 'trustTier'
  | 'selectedVersion'
  | 'stableVersion'
  | 'installedVersion'
  | 'sourceExplanation'
  | 'installability'
  | 'readiness'
  | 'codexVisibleEntry'
  | 'defaultHomeVisible'
  | 'userConfigurable'
  | 'sourceKind'
  | 'installState'
  | 'updateState'
  | 'sourceState'
  | 'trustState'
  | 'moduleId'
  | 'actualSource'
  | 'sourcePreference'
  | 'checkoutPath'
  | 'managedCheckoutPath'
  | 'developerCheckoutPath'
  | 'sourceFallbackReason'
  | 'packageLockRef'
  | 'actionReceiptRef'
  | 'rollbackRef'
  | 'manifestUrl'
  | 'registryUrl'
  | 'physicalSurface'
  | 'dependencyReadiness'
  | 'operationalReady'
  | 'launchAllowed'
  | 'launchBlockedReason'
  | 'allowedWhenBlocked'
  | 'repairAction'
  | 'availableActions'
  | 'recommendedActionId'
  | 'recommendedAction'
  | 'installAction'
  | 'activationAction'
  | 'dependentGuard'
  | 'dependencyClosure'
  | 'enabled'
  | 'hidden'
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
type RuntimeSourceCarrierItem = OplAppStateRecord;

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
  materializedRequiredSkillIds: string[];
  materializedRequiredSkillPaths: string[];
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
  return canonical || null;
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

function runtimeSourceCarrierIds(carrier: RuntimeSourceCarrierItem): string[] {
  return [firstString(carrier.carrier_id, carrier.module_id), firstString(carrier.package_id)]
    .filter((id): id is string => Boolean(id))
    .map(normalizeCapabilityModuleId);
}

function mergeRuntimeSourceCarrier(
  module: RuntimeModuleItem | undefined,
  carrier: RuntimeSourceCarrierItem
): RuntimeModuleItem {
  const carrierSourcePolicy = oplRecord(carrier.source_policy);
  const carrierGit = oplRecord(carrier.git);
  return {
    ...module,
    module_id: firstString(module?.module_id, carrier.carrier_id, carrier.package_id),
    install_origin: firstString(carrier.source_origin, module?.install_origin),
    checkout_path: firstString(carrier.source_path, module?.checkout_path),
    managed_checkout_path: firstString(carrier.managed_source_path, module?.managed_checkout_path),
    source_policy: Object.keys(carrierSourcePolicy).length > 0 ? carrierSourcePolicy : oplRecord(module?.source_policy),
    git: Object.keys(carrierGit).length > 0 ? carrierGit : oplRecord(module?.git),
  };
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

function isRecord(value: unknown): value is OplAppStateRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function statusReadError(value: unknown): string | null {
  if (typeof value === 'string') return firstString(value);
  if (!isRecord(value)) return null;
  return firstString(value.message, value.code, value.reason);
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
  return [...new Set(actions)];
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
  return refsFromKeys([
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
  const git = firstRecord(packageState?.git, module?.git);
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
  const installOrigin = normalizeStatusToken(
    firstString(
      packageState?.install_origin,
      module?.install_origin,
      packageState?.checkout_origin,
      module?.checkout_origin
    )
  );
  return (
    effectiveSource === 'gitcheckout' ||
    configuredBy === 'developermode' ||
    ['managedroot', 'siblingworkspace', 'envoverride'].includes(installOrigin ?? '') ||
    (!packageState && Object.keys(git).length > 0)
  );
}

const SESSION_PREPARED_READINESS_REASONS = new Set([
  'liveverificationdeferred',
  'verificationdeferred',
  'scopematerializationmissing',
  'packageactivationrequired',
]);

function isSessionPreparedReadiness(
  directoryState: RuntimePackageStateItem | undefined,
  packageStatus: RuntimePackageStateItem | undefined
): boolean {
  const readiness = oplRecord(directoryState?.readiness);
  const readinessStatus = normalizeStatusToken(firstString(readiness.status));
  const readinessReason = normalizeStatusToken(firstString(readiness.reason, packageStatus?.launch_blocked_reason));
  return (
    readiness.verification_deferred === true ||
    readinessStatus === 'verificationdeferred' ||
    SESSION_PREPARED_READINESS_REASONS.has(readinessReason ?? '')
  );
}

function mapCapabilityStatus(
  directoryState: RuntimePackageStateItem | undefined,
  packageStatus: RuntimePackageStateItem | undefined,
  module: RuntimeModuleItem | undefined
): CapabilityStatus {
  const status = normalizeStatusToken(
    firstString(
      directoryState?.status,
      directoryState?.health_status,
      directoryState?.state,
      packageStatus?.status,
      packageStatus?.health_status,
      packageStatus?.state,
      capabilityModuleStatus(module)
    )
  );
  const statusIndexStatus = normalizeStatusToken(
    firstString(packageStatus?.status, packageStatus?.health_status, packageStatus?.state)
  );
  const action = normalizeStatusToken(firstString(directoryState?.recommended_action));
  const git = firstRecord(directoryState?.git, module?.git);
  const syncStatus = normalizeStatusToken(firstString(git.sync_status, git.status));
  const exposure = oplRecord(packageStatus?.capability_exposure);
  const exposureStatus = normalizeStatusToken(firstString(exposure.status));
  const developerCheckout = isDeveloperCheckout(directoryState, module);
  if (!directoryState) return 'missing';
  const installability = oplRecord(directoryState.installability);
  const readiness = oplRecord(directoryState.readiness);
  const installState = normalizeStatusToken(
    firstString(installability.status, directoryState.install_state, directoryState.installation_state)
  );
  const exactReadinessStatus = normalizeStatusToken(firstString(readiness.status));
  const readinessReason = normalizeStatusToken(firstString(readiness.reason));
  const operationalReady = nullableBool(readiness.operational_ready) ?? nullableBool(packageStatus?.operational_ready);
  const launchAllowed = nullableBool(readiness.launch_allowed) ?? nullableBool(packageStatus?.launch_allowed);
  if (
    directoryState.installed === false ||
    (!firstString(directoryState.installed_version) &&
      ['missing', 'notinstalled', 'available'].includes(installState ?? ''))
  ) {
    return 'missing';
  }
  if (statusReadError(readiness.status_read_error) || statusReadError(packageStatus?.status_read_error))
    return 'repair';
  if (
    ['blocked', 'failed', 'repairrequired'].includes(exactReadinessStatus ?? '') ||
    ['unavailable', 'failed', 'failedwithrepair', 'blocking', 'packageunavailable'].includes(statusIndexStatus ?? '')
  ) {
    return 'repair';
  }
  if (isSessionPreparedReadiness(directoryState, packageStatus)) {
    return 'ready';
  }
  if (
    ['activationrequired', 'pendingactivation'].includes(exactReadinessStatus ?? '') ||
    readinessReason === 'packageactivationrequired'
  ) {
    return readinessReason === 'packageactivationrequired' && operationalReady !== false && launchAllowed !== false
      ? 'inactive'
      : 'attention';
  }
  const dependencyReadiness = normalizeStatusToken(
    firstString(capabilityDependencyReadinessRecord(packageStatus).status)
  );
  if (['repairrequired', 'blocked'].includes(dependencyReadiness ?? '')) {
    return 'repair';
  }
  if (readiness.operational_ready === false || packageStatus?.operational_ready === false) return 'attention';
  if (['updateavailable', 'staged'].includes(exactReadinessStatus ?? '')) return 'update';
  if (['needssync', 'stale', 'syncrequired'].includes(exactReadinessStatus ?? '')) return 'sync';
  if (['ready', 'compatible', 'ok', 'installed', 'current'].includes(exactReadinessStatus ?? '')) return 'ready';
  if (['missing', 'notinstalled', 'notconfigured'].includes(status ?? '')) return 'missing';
  if (
    ['manualrequired', 'skippedmanualrequired', 'failed', 'failedwithrepair', 'degraded', 'blocking'].includes(
      status ?? ''
    )
  ) {
    return 'repair';
  }
  if (
    developerCheckout &&
    (status === 'dirty' ||
      git.dirty === true ||
      ['behind', 'diverged', 'ahead'].includes(syncStatus ?? '') ||
      ['update', 'install', 'reinstall'].includes(action ?? '') ||
      ['updateavailable', 'staged'].includes(status ?? ''))
  ) {
    return 'source';
  }
  if (
    ['update', 'install', 'reinstall'].includes(action ?? '') ||
    ['updateavailable', 'staged'].includes(status ?? '')
  ) {
    return 'update';
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
  if (['ready', 'compatible', 'ok', 'installed', 'current'].includes(status ?? '')) return 'ready';
  return 'attention';
}

function capabilityAvailabilityStatus(status: CapabilityStatus): CapabilityAvailabilityStatus {
  return status === 'source' ? 'ready' : status;
}

function capabilityPrimaryAction(status: CapabilityStatus): CapabilityPrimaryAction {
  if (status === 'missing') return 'configure';
  if (status === 'update' || status === 'sync' || status === 'source' || status === 'repair') return 'maintenance';
  return 'view';
}

function capabilityCodexVisibility(
  directoryState: RuntimePackageStateItem | undefined,
  packageStatus: RuntimePackageStateItem | undefined,
  status: CapabilityStatus
): CapabilityCodexVisibility {
  if (!directoryState) return 'notVisible';
  const readiness = oplRecord(directoryState.readiness);
  if (status === 'repair' || status === 'missing') return 'notVisible';
  if (isSessionPreparedReadiness(directoryState, packageStatus)) return 'visible';
  const operationalReady =
    packageStatus?.operational_ready === false
      ? false
      : (nullableBool(readiness.operational_ready) ?? nullableBool(packageStatus?.operational_ready));
  const launchAllowed =
    packageStatus?.launch_allowed === false
      ? false
      : (nullableBool(readiness.launch_allowed) ?? nullableBool(packageStatus?.launch_allowed));
  if (operationalReady === false || launchAllowed === false) return 'notVisible';
  const exposure = oplRecord(packageStatus?.capability_exposure);
  const codexVisible =
    packageStatus?.codex_visible ??
    packageStatus?.visible_to_codex ??
    packageStatus?.exposed_to_codex ??
    exposure.codex_visible ??
    exposure.visible_to_codex ??
    exposure.exposed;
  const exposureStatus = normalizeStatusToken(firstString(exposure.status));
  if (status === 'update' || status === 'sync' || exposureStatus === 'stale' || exposureStatus === 'needssync') {
    return 'needsSync';
  }
  if (codexVisible === false) return 'notVisible';
  if (
    operationalReady === true &&
    launchAllowed === true &&
    (codexVisible === true || exposureStatus === 'visible' || exposureStatus === 'ready')
  ) {
    return 'visible';
  }
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
    oplString(module?.version) ??
    oplString(module?.package_version) ??
    oplString(module?.installed_version) ??
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
    oplString(module?.source) ??
    oplString(module?.install_origin) ??
    oplString(module?.checkout_source) ??
    oplString(sourcePolicy.source) ??
    oplString(sourcePolicy.mode)
  );
}

function capabilityLastSync(packageStatus: RuntimePackageStateItem | undefined): string | null {
  const exposure = oplRecord(packageStatus?.capability_exposure);
  return (
    oplString(packageStatus?.last_sync_at) ??
    oplString(packageStatus?.synced_at) ??
    oplString(packageStatus?.updated_at) ??
    oplString(exposure.last_sync_at) ??
    oplString(exposure.synced_at)
  );
}

function capabilityFailureReason(
  directoryState: RuntimePackageStateItem | undefined,
  packageStatus: RuntimePackageStateItem | undefined
): string | null {
  if (!directoryState && !packageStatus) return null;
  const error = firstRecord(packageStatus?.error, directoryState?.error);
  const exposure = oplRecord(packageStatus?.capability_exposure);
  const readiness = oplRecord(directoryState?.readiness);
  const readinessStatus = normalizeStatusToken(firstString(readiness.status));
  const directoryStatus = normalizeStatusToken(
    firstString(directoryState?.status, directoryState?.health_status, directoryState?.state)
  );
  const statusIndexStatus = normalizeStatusToken(
    firstString(packageStatus?.status, packageStatus?.health_status, packageStatus?.state)
  );
  const dependencyReadiness = capabilityDependencyReadinessRecord(packageStatus);
  const dependencyStatus = normalizeStatusToken(firstString(dependencyReadiness.status));
  const dependencyChecks = oplRecordList(dependencyReadiness.checks);
  const dependencyFailure = dependencyChecks
    .flatMap((check) => listValues(check.failure_reasons))
    .map(oplString)
    .find((reason): reason is string => Boolean(reason));
  const repairAction = oplRecord(packageStatus?.repair_action);
  const failureStatus = [readinessStatus, directoryStatus, statusIndexStatus, dependencyStatus].some((value) =>
    ['failed', 'failedwithrepair', 'blocked', 'blocking', 'repairrequired'].includes(value ?? '')
  );
  return (
    statusReadError(readiness.status_read_error) ??
    statusReadError(packageStatus?.status_read_error) ??
    oplString(packageStatus?.failure_reason) ??
    oplString(packageStatus?.last_failure) ??
    oplString(directoryState?.failure_reason) ??
    oplString(directoryState?.last_failure) ??
    oplString(error.message) ??
    oplString(exposure.failure_reason) ??
    oplString(exposure.last_failure) ??
    dependencyFailure ??
    (failureStatus
      ? firstString(
          readiness.reason,
          packageStatus?.blocker_summary,
          packageStatus?.reason,
          directoryState?.blocker_summary,
          directoryState?.reason,
          repairAction.reason_code,
          dependencyReadiness.status
        )
      : null)
  );
}

function capabilityDependencyReadiness(
  packageState: RuntimePackageStateItem | undefined
): CapabilityDependencyReadinessViewModel | null {
  const readiness = capabilityDependencyReadinessRecord(packageState);
  if (Object.keys(readiness).length === 0) return null;
  const status = firstString(readiness.status);
  return {
    status: status === 'ready' || status === 'repair_required' || status === 'blocked' ? status : null,
    requiredCount: typeof readiness.required_count === 'number' ? readiness.required_count : null,
    readyCount: typeof readiness.ready_count === 'number' ? readiness.ready_count : null,
    checks: oplRecordList(readiness.checks).map((check) => ({
      packageId: firstString(check.package_id, check.id) ?? '',
      ready: nullableBool(check.ready),
      failureReasons: listValues(check.failure_reasons)
        .map(oplString)
        .filter((reason): reason is string => Boolean(reason)),
    })),
  };
}

function capabilityDependencyReadinessRecord(packageState: RuntimePackageStateItem | undefined): OplAppStateRecord {
  const canonical = oplRecord(packageState?.dependency_readiness);
  if (Object.keys(canonical).length > 0) return canonical;
  return oplRecord(packageState?.package_dependency_readiness);
}

function capabilityRepairAction(
  packageState: RuntimePackageStateItem | undefined
): CapabilityRepairActionViewModel | null {
  const action = oplRecord(packageState?.repair_action);
  if (Object.keys(action).length === 0) return null;
  return {
    actionId: firstString(action.action_id),
    commandRef: firstString(action.command_ref),
    enabled: nullableBool(action.enabled),
    reasonCode: firstString(action.reason_code),
  };
}

function capabilityDependentGuard(
  packageState: RuntimePackageStateItem | undefined
): CapabilityDependentGuardViewModel | null {
  const guard = oplRecord(packageState?.dependent_guard);
  const disable = oplRecord(guard.disable);
  const uninstall = oplRecord(guard.uninstall);
  if (
    !Array.isArray(guard.required_by_package_ids) ||
    typeof disable.allowed !== 'boolean' ||
    !('reason_code' in disable) ||
    (disable.reason_code !== null && !oplString(disable.reason_code)) ||
    typeof uninstall.allowed !== 'boolean' ||
    !('reason_code' in uninstall) ||
    (uninstall.reason_code !== null && !oplString(uninstall.reason_code))
  ) {
    return null;
  }
  return {
    requiredByPackageIds: listValues(guard.required_by_package_ids)
      .map(oplString)
      .filter((id): id is string => Boolean(id)),
    disableAllowed: nullableBool(disable.allowed),
    disableReasonCode: firstString(disable.reason_code),
    uninstallAllowed: nullableBool(uninstall.allowed),
    uninstallReasonCode: firstString(uninstall.reason_code),
  };
}

function capabilityActivationAction(
  packageState: RuntimePackageStateItem | undefined
): CapabilityActivationActionViewModel | null {
  const action = oplRecord(packageState?.activation_action);
  const actionId = firstString(action.action_id);
  const commandRef = firstString(action.command_ref);
  const preparationStatus = firstString(action.preparation_status);
  const reasonCode = firstString(action.reason_code);
  if (
    actionId !== 'agent_package_activate' ||
    commandRef !== 'opl app action execute --action agent_package_activate --payload <json> --json' ||
    typeof action.enabled !== 'boolean' ||
    !preparationStatus ||
    !['not_installed', 'prepare_required', 'ready'].includes(preparationStatus) ||
    !reasonCode
  ) {
    return null;
  }
  return {
    actionId,
    commandRef,
    enabled: action.enabled,
    preparationStatus: preparationStatus as CapabilityActivationActionViewModel['preparationStatus'],
    reasonCode,
  };
}

function capabilityDependencyClosure(
  packageState: RuntimePackageStateItem | undefined
): CapabilityDependencyClosureViewModel | null {
  const readiness = capabilityDependencyReadinessRecord(packageState);
  const closure = firstRecord(readiness.closure, packageState?.dependency_closure);
  if (Object.keys(closure).length === 0) return null;
  return {
    transactionId: firstString(closure.transaction_id),
    closureDigest: firstString(closure.closure_digest),
    lastKnownGoodTransactionId: firstString(closure.last_known_good_transaction_id),
    lastKnownGoodClosureDigest: firstString(closure.last_known_good_closure_digest),
  };
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
    sourcePolicy.effective_install_update_source,
    sourcePolicy.configured_by,
    sourcePolicy.kind,
    sourcePolicy.source,
    sourcePolicy.mode
  );
}

function capabilityPackageLockRef(packageStatus: RuntimePackageStateItem | undefined): string | null {
  return refValue(packageStatus?.package_lock_ref) ?? refValue(packageStatus?.lock_ref);
}

function capabilityActionReceiptRef(packageStatus: RuntimePackageStateItem | undefined): string | null {
  return refValue(packageStatus?.action_receipt_ref);
}

function capabilityRollbackRef(packageStatus: RuntimePackageStateItem | undefined): string | null {
  return refValue(packageStatus?.rollback_ref);
}

function capabilityManifestUrl(directoryState: RuntimePackageStateItem | undefined): string | null {
  if (!directoryState) return null;
  const registryEntry = oplRecord(directoryState.registry_entry);
  return firstString(
    directoryState.manifest_url,
    directoryState.manifestUrl,
    registryEntry.manifest_url,
    registryEntry.manifestUrl
  );
}

function capabilityRegistryUrl(directoryState: RuntimePackageStateItem | undefined): string | null {
  if (!directoryState) return null;
  const registryEntry = oplRecord(directoryState.registry_entry);
  return firstString(
    directoryState.registry_url,
    directoryState.registryUrl,
    registryEntry.registry_url,
    registryEntry.registryUrl
  );
}

function nullableBool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

const CAPABILITY_EXPOSURE_STATE = {
  visible: { enabled: true, hidden: false },
  hidden: { enabled: true, hidden: true },
  enabled: { enabled: true, hidden: false },
  disabled: { enabled: false, hidden: true },
} as const;

function capabilityExposureState(
  packageStatus: RuntimePackageStateItem | undefined
): { enabled: boolean; hidden: boolean } | null {
  const status = normalizeStatusToken(firstString(oplRecord(packageStatus?.capability_exposure).status));
  return status && status in CAPABILITY_EXPOSURE_STATE
    ? CAPABILITY_EXPOSURE_STATE[status as keyof typeof CAPABILITY_EXPOSURE_STATE]
    : null;
}

function capabilityPackageEnabled(packageStatus: RuntimePackageStateItem | undefined): boolean | null {
  return capabilityExposureState(packageStatus)?.enabled ?? null;
}

function capabilityPackageHidden(packageStatus: RuntimePackageStateItem | undefined): boolean | null {
  return capabilityExposureState(packageStatus)?.hidden ?? null;
}

function capabilityPhysicalSurface(
  packageStatus: RuntimePackageStateItem | undefined
): CapabilityPhysicalSurfaceViewModel | null {
  const surface = oplRecord(packageStatus?.physical_surface);
  if (Object.keys(surface).length === 0) return null;
  return {
    status: firstString(surface.status, surface.state),
    reloadRequired: nullableBool(surface.reload_required),
    pluginId: firstString(surface.plugin_id),
    marketplaceId: firstString(surface.marketplace_id),
    codexPluginCachePath: firstString(surface.codex_plugin_cache_path),
    marketplacePath: firstString(surface.marketplace_path),
    codexConfigPath: firstString(surface.codex_config_path),
    materializedRequiredSkillIds: listValues(surface.materialized_required_skill_ids)
      .map(oplString)
      .filter((id): id is string => Boolean(id)),
    materializedRequiredSkillPaths: listValues(surface.materialized_required_skill_paths)
      .map(oplString)
      .filter((path): path is string => Boolean(path)),
  };
}

function sameCapabilityPackageAction(
  left: CapabilityPackageActionViewModel,
  right: CapabilityPackageActionViewModel
): boolean {
  return (
    left.actionId === right.actionId &&
    left.actionRef === right.actionRef &&
    left.confirmationRequired === right.confirmationRequired &&
    JSON.stringify(left.payloadRefsOnlyJson) === JSON.stringify(right.payloadRefsOnlyJson) &&
    JSON.stringify(left.requiredPayloadFields) === JSON.stringify(right.requiredPayloadFields)
  );
}

function capabilityPackageActions(packageState: RuntimePackageStateItem | undefined): {
  availableActions: Record<string, CapabilityPackageActionViewModel>;
  recommendedActionId: string | null;
  recommendedAction: CapabilityPackageActionViewModel | null;
} {
  const availableActions: Record<string, CapabilityPackageActionViewModel> = {};
  for (const candidate of oplRecordList(packageState?.available_actions)) {
    const action = parseOplProjectedPackageAction(candidate);
    if (action && !availableActions[action.actionId]) availableActions[action.actionId] = action;
  }
  const recommendedActionId = firstString(packageState?.recommended_action);
  const recommendedActionRef = parseOplProjectedPackageAction(packageState?.recommended_action_ref);
  const availableRecommendedAction = recommendedActionId ? availableActions[recommendedActionId] : undefined;
  const recommendedAction =
    recommendedActionRef &&
    availableRecommendedAction &&
    recommendedActionRef.actionId === recommendedActionId &&
    sameCapabilityPackageAction(recommendedActionRef, availableRecommendedAction)
      ? availableRecommendedAction
      : null;
  return { availableActions, recommendedActionId, recommendedAction };
}

function capabilityInstallState(packageState: RuntimePackageStateItem | undefined): string | null {
  if (!packageState) return null;
  const installability = oplRecord(packageState.installability);
  return (
    firstString(installability.status, packageState.install_state, packageState.installation_state) ??
    (packageState.installed === true || firstString(packageState.installed_version)
      ? 'installed'
      : packageState.installed === false
        ? 'not_installed'
        : null)
  );
}

function buildCapabilityPurpose(
  purpose: Omit<
    CapabilityPurposeViewModel,
    | 'status'
    | 'availabilityStatus'
    | 'primaryAction'
    | 'codexVisibility'
    | 'version'
    | 'source'
    | 'lastSync'
    | 'failureReason'
    | 'workflowCandidateRefs'
    | 'packageId'
    | 'packageRole'
    | 'publisher'
    | 'trustTier'
    | 'selectedVersion'
    | 'stableVersion'
    | 'installedVersion'
    | 'sourceExplanation'
    | 'installability'
    | 'readiness'
    | 'codexVisibleEntry'
    | 'defaultHomeVisible'
    | 'userConfigurable'
    | 'sourceKind'
    | 'installState'
    | 'updateState'
    | 'sourceState'
    | 'trustState'
    | 'moduleId'
    | 'actualSource'
    | 'sourcePreference'
    | 'checkoutPath'
    | 'managedCheckoutPath'
    | 'developerCheckoutPath'
    | 'sourceFallbackReason'
    | 'packageLockRef'
    | 'actionReceiptRef'
    | 'rollbackRef'
    | 'manifestUrl'
    | 'registryUrl'
    | 'physicalSurface'
    | 'dependencyReadiness'
    | 'operationalReady'
    | 'launchAllowed'
    | 'launchBlockedReason'
    | 'allowedWhenBlocked'
    | 'repairAction'
    | 'availableActions'
    | 'recommendedActionId'
    | 'recommendedAction'
    | 'installAction'
    | 'activationAction'
    | 'dependentGuard'
    | 'dependencyClosure'
    | 'enabled'
    | 'hidden'
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
  directoryState: RuntimePackageStateItem | undefined,
  packageStatus: RuntimePackageStateItem | undefined,
  module: RuntimeModuleItem | undefined,
  task: RuntimeTaskItem | undefined
): CapabilityPurposeViewModel {
  const status = mapCapabilityStatus(directoryState, packageStatus, module);
  const packageActions = capabilityPackageActions(directoryState);
  const directoryReadiness = oplRecord(directoryState?.readiness);
  const directoryOperationalReady = nullableBool(directoryReadiness.operational_ready);
  const statusOperationalReady = nullableBool(packageStatus?.operational_ready);
  const operationalReady =
    directoryOperationalReady === false || statusOperationalReady === false
      ? false
      : (statusOperationalReady ?? directoryOperationalReady);
  const directoryLaunchAllowed = nullableBool(directoryReadiness.launch_allowed);
  const statusLaunchAllowed = nullableBool(packageStatus?.launch_allowed);
  const launchAllowed =
    operationalReady === false || directoryLaunchAllowed === false || statusLaunchAllowed === false
      ? false
      : (statusLaunchAllowed ?? directoryLaunchAllowed);
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
    packageRole: firstString(directoryState?.package_role, directoryState?.role),
    publisher: firstString(directoryState?.publisher),
    trustTier: firstString(directoryState?.trust_tier),
    selectedVersion: firstString(directoryState?.selected_version),
    stableVersion: firstString(directoryState?.stable_version),
    installedVersion: firstString(directoryState?.installed_version),
    sourceExplanation: (() => {
      const explanation = oplRecord(directoryState?.source_explanation);
      return {
        kind: firstString(explanation.kind),
        source: firstString(explanation.source),
        summary: firstString(explanation.summary),
        registryUrl: firstString(explanation.registry_url),
      };
    })(),
    installability: (() => {
      const installability = oplRecord(directoryState?.installability);
      return {
        status: firstString(installability.status),
        installable: nullableBool(installability.installable),
      };
    })(),
    readiness: (() => {
      return {
        status: firstString(directoryReadiness.status),
        operationalReady: directoryOperationalReady,
        launchAllowed: directoryLaunchAllowed,
        verificationDeferred: nullableBool(directoryReadiness.verification_deferred),
        reason: firstString(directoryReadiness.reason),
        statusReadError:
          statusReadError(directoryReadiness.status_read_error) ?? statusReadError(packageStatus?.status_read_error),
      };
    })(),
    codexVisibleEntry: purpose.codexVisibleEntry ?? null,
    defaultHomeVisible: purpose.defaultHomeVisible ?? null,
    userConfigurable: purpose.userConfigurable ?? null,
    sourceKind:
      firstString(oplRecord(directoryState?.source_explanation).kind) ?? capabilitySourceKind(packageStatus, module),
    installState: capabilityInstallState(directoryState),
    updateState: firstString(packageStatus?.update_state, packageStatus?.update_status, packageStatus?.currentness),
    sourceState: firstString(packageStatus?.source_state, packageStatus?.source_status),
    trustState: firstString(
      directoryState?.trust_tier,
      packageStatus?.trust_state,
      packageStatus?.trust_status,
      oplRecord(packageStatus?.trust).status,
      packageStatus?.signature_status
    ),
    moduleId: module ? capabilityModuleId(module) : null,
    actualSource: firstString(module?.install_origin, packageStatus?.install_origin),
    sourcePreference: (() => {
      const sourcePolicy = firstRecord(packageStatus?.source_policy, module?.source_policy);
      const preference = firstString(sourcePolicy.source_preference);
      return preference === 'managed' || preference === 'developer' ? preference : 'auto';
    })(),
    checkoutPath: firstString(module?.checkout_path, packageStatus?.checkout_path),
    managedCheckoutPath: firstString(module?.managed_checkout_path, packageStatus?.managed_checkout_path),
    developerCheckoutPath: (() => {
      const sourcePolicy = firstRecord(packageStatus?.source_policy, module?.source_policy);
      return firstString(sourcePolicy.developer_checkout_path);
    })(),
    sourceFallbackReason: (() => {
      const sourcePolicy = firstRecord(packageStatus?.source_policy, module?.source_policy);
      const preference = firstString(sourcePolicy.source_preference);
      const actual = firstString(module?.install_origin, packageStatus?.install_origin);
      if (preference === 'developer' && actual !== 'sibling_workspace' && actual !== 'env_override') {
        return 'developer_checkout_unavailable';
      }
      return firstString(sourcePolicy.fallback_reason);
    })(),
    packageLockRef: capabilityPackageLockRef(packageStatus),
    actionReceiptRef: capabilityActionReceiptRef(packageStatus),
    rollbackRef: capabilityRollbackRef(packageStatus),
    manifestUrl: capabilityManifestUrl(directoryState),
    registryUrl:
      firstString(oplRecord(directoryState?.source_explanation).registry_url) ?? capabilityRegistryUrl(directoryState),
    physicalSurface: capabilityPhysicalSurface(packageStatus),
    dependencyReadiness: capabilityDependencyReadiness(packageStatus),
    operationalReady,
    launchAllowed,
    launchBlockedReason: firstString(packageStatus?.launch_blocked_reason, directoryReadiness.reason),
    allowedWhenBlocked: listValues(packageStatus?.allowed_when_blocked)
      .map(oplString)
      .filter((action): action is string => Boolean(action)),
    repairAction: capabilityRepairAction(packageStatus),
    availableActions: packageActions.availableActions,
    recommendedActionId: packageActions.recommendedActionId,
    recommendedAction: packageActions.recommendedAction,
    installAction: packageActions.availableActions.install_from_manifest_url ?? null,
    activationAction: capabilityActivationAction(packageStatus),
    dependentGuard: capabilityDependentGuard(packageStatus),
    dependencyClosure: capabilityDependencyClosure(packageStatus),
    enabled: capabilityPackageEnabled(packageStatus),
    hidden: capabilityPackageHidden(packageStatus),
    status,
    availabilityStatus: capabilityAvailabilityStatus(status),
    primaryAction: capabilityPrimaryAction(status),
    codexVisibility: capabilityCodexVisibility(directoryState, packageStatus, status),
    version:
      firstString(
        directoryState?.selected_version,
        directoryState?.installed_version,
        directoryState?.stable_version
      ) ?? capabilityVersion(packageStatus, module),
    source:
      firstString(
        oplRecord(directoryState?.source_explanation).summary,
        oplRecord(directoryState?.source_explanation).source
      ) ?? capabilitySource(packageStatus, module),
    lastSync: capabilityLastSync(packageStatus),
    failureReason: capabilityFailureReason(directoryState, packageStatus),
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
  localeKey: string,
  extraPurposes: ExtraCapabilityPurposeInput[] = []
): CapabilityPurposeViewModel[] {
  const canonicalAgentPackages = oplRecord(appState.agent_packages);
  const directory = oplRecord(canonicalAgentPackages.directory);
  const statusIndex = oplRecord(canonicalAgentPackages.status_index);
  const directoryEntries = packageStateRecords(directory.entries);
  const packageStatuses = new Map<string, RuntimePackageStateItem>();
  for (const packageStatus of packageStateRecords(statusIndex.packages)) {
    const id = packageStateId(packageStatus);
    if (!id) continue;
    packageStatuses.set(id, packageStatus);
  }
  const runtimeSourceCarriers = new Map<string, RuntimeSourceCarrierItem>();
  const runtimeSourceCarriersPayload = oplRecord(appState.runtime_source_carriers);
  for (const carrier of capabilityModuleRecords(runtimeSourceCarriersPayload.items)) {
    for (const id of runtimeSourceCarrierIds(carrier)) runtimeSourceCarriers.set(id, carrier);
  }
  const tasks = new Map<string, RuntimeTaskItem>();
  for (const task of capabilityTaskRecords(appState)) {
    tasks.set(capabilityTaskId(task), task);
  }

  const professionalPackages = getOplProfessionalAgentPackages();
  const normalizedLocaleKey: 'zh-CN' | 'en-US' = localeKey.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
  const firstPartyPresentationById = new Map(
    getOplFirstPartyPackagePresentations().map((entry) => [canonicalCapabilityPackageId(entry.package_id), entry])
  );
  const metadataById = new Map<string, OplProfessionalAgentPackage>();
  for (const agentPackage of professionalPackages) {
    for (const alias of agentPackageModuleIds(agentPackage)) metadataById.set(alias, agentPackage);
    for (const alias of [agentPackage.package_id, agentPackage.short_name, agentPackage.codex_visible_entry]) {
      const canonicalAlias = canonicalCapabilityPackageId(alias);
      if (canonicalAlias) metadataById.set(canonicalAlias, agentPackage);
      metadataById.set(normalizeCapabilityModuleId(alias), agentPackage);
    }
  }
  const metadataForId = (id: string) => metadataById.get(id) ?? metadataById.get(normalizeCapabilityModuleId(id));

  const shortcutsByPackageId = new Map(getOplHomeAgentShortcuts().map((shortcut) => [shortcut.package_id, shortcut]));
  const defaultPurposes = directoryEntries.flatMap((directoryEntry) => {
    const packageId = packageStateId(directoryEntry);
    if (!packageId) return [];
    const agentPackage = metadataForId(packageId);
    const firstPartyPresentation = firstPartyPresentationById.get(canonicalCapabilityPackageId(packageId));
    const moduleIds = agentPackage
      ? agentPackageModuleIds(agentPackage)
      : [packageId, firstString(directoryEntry.module_id), firstString(directoryEntry.codex_visible_entry)]
          .filter((id): id is string => Boolean(id))
          .map(normalizeCapabilityModuleId);
    const packageStatus = packageStatuses.get(packageId);
    const directoryState: RuntimePackageStateItem = {
      ...directoryEntry,
      package_id: firstString(directoryEntry.package_id, directoryEntry.id) ?? packageId,
      package_role: firstString(directoryEntry.package_role, directoryEntry.role, agentPackage?.role),
    };
    const runtimeSourceCarrier = moduleIds
      .concat(packageId)
      .map((id) => runtimeSourceCarriers.get(id))
      .find(Boolean);
    const module = runtimeSourceCarrier ? mergeRuntimeSourceCarrier(undefined, runtimeSourceCarrier) : undefined;
    const task = moduleIds.map((id) => tasks.get(id)).find(Boolean);
    const canonicalPackageId = packageId;
    const shortcut =
      shortcutsByPackageId.get(canonicalPackageId) ??
      (agentPackage ? shortcutsByPackageId.get(agentPackage.package_id) : undefined);
    const title =
      agentPackage?.display_name_i18n?.[normalizedLocaleKey] ??
      firstPartyPresentation?.display_name_i18n[normalizedLocaleKey] ??
      firstString(directoryEntry.display_name, directoryEntry.title, directoryEntry.name) ??
      agentPackage?.display_name ??
      canonicalPackageId;
    const role = firstString(directoryState.package_role, directoryState.role);
    const tags = [
      ...(agentPackage ? agentPackageTags(agentPackage) : []),
      ...listValues(directoryEntry.tags)
        .map(oplString)
        .filter((tag): tag is string => Boolean(tag)),
    ];
    if (role) tags.push(role);
    return [
      buildCapabilityPurpose(
        {
          key: agentPackage ? capabilityPurposeKey(agentPackage) : canonicalPackageId,
          title,
          description:
            agentPackage?.description_i18n?.[normalizedLocaleKey] ??
            firstPartyPresentation?.description_i18n[normalizedLocaleKey] ??
            firstString(directoryEntry.description, directoryEntry.summary, directoryEntry.purpose) ??
            shortcut?.primary_label ??
            agentPackage?.short_name ??
            title,
          tags: [...new Set(tags)],
          moduleIds,
          packageId: canonicalPackageId,
          codexVisibleEntry:
            firstString(directoryEntry.codex_visible_entry) ?? agentPackage?.codex_visible_entry ?? null,
          defaultHomeVisible: agentPackage?.default_home_visible ?? null,
          userConfigurable: shortcut?.user_configurable ?? false,
        },
        directoryState,
        packageStatus,
        module,
        task
      ),
    ];
  });
  const mergedPurposes = new Map(defaultPurposes.map((purpose) => [purpose.packageId ?? purpose.key, purpose]));
  const explicitPurposes = extraPurposes.flatMap((purpose) => {
    const moduleIds = purpose.moduleIds.map(normalizeCapabilityModuleId);
    const packageId = canonicalCapabilityPackageId(purpose.packageId ?? purpose.key) ?? '';
    const existing = [...mergedPurposes.values()].find(
      (entry) =>
        entry.packageId === packageId ||
        entry.key === purpose.key ||
        entry.moduleIds.some((id) => moduleIds.includes(id))
    );
    if (!existing) return [];
    return [
      {
        ...existing,
        tags: [...new Set([...existing.tags, ...purpose.tags])],
        moduleIds: [...new Set([...existing.moduleIds, ...moduleIds])],
      },
    ];
  });
  for (const purpose of explicitPurposes) {
    const packageKey = purpose.packageId ?? purpose.key;
    const existingEntry = [...mergedPurposes.values()].find(
      (entry) =>
        entry.packageId === packageKey ||
        entry.key === purpose.key ||
        entry.moduleIds.some((moduleId) => purpose.moduleIds.includes(moduleId))
    );
    if (!existingEntry) continue;
    mergedPurposes.set(existingEntry.packageId ?? existingEntry.key, {
      ...existingEntry,
      tags: [...new Set([...existingEntry.tags, ...purpose.tags])],
      moduleIds: [...new Set([...existingEntry.moduleIds, ...purpose.moduleIds])],
    });
  }
  return [...mergedPurposes.values()];
}
