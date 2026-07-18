/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  LocalDataLifecycleInventory,
  LocalDataLifecycleInventorySection,
  LocalDataLifecycleLogRetentionPlan,
  LocalDataLifecycleReceipt,
  LocalDataLifecycleRuntimePrunePlan,
  LocalDataLifecycleSectionId,
  LocalDataLifecycleUpdaterCachePlan,
} from '@/common/adapter/ipcBridge';

export type StoragePlanKind = 'runtime' | 'logs' | 'updater';

export type StoragePlan =
  | LocalDataLifecycleRuntimePrunePlan
  | LocalDataLifecycleLogRetentionPlan
  | LocalDataLifecycleUpdaterCachePlan;

export type StorageInventorySectionViewModel = {
  id: LocalDataLifecycleSectionId;
  section: LocalDataLifecycleInventorySection | null;
  bytes: number;
  rootCount: number;
  cleanupMode: string | null;
  silentDeleteAllowed: boolean;
};

export type StoragePlanViewModel = {
  kind: StoragePlanKind;
  plan: StoragePlan | null;
  candidateCount: number;
  removeBytes: number;
  canExecute: boolean;
};

export type StorageReceiptViewModel = {
  receiptPath: string | null;
  conversationId: string | null;
};

export type ResearchWorkspaceLifecycleRef = {
  id: string;
  label: string;
  state: 'available' | 'attention' | 'blocked';
  ref: string;
  detail: string;
};

export type ResearchWorkspaceLifecycleViewModel = {
  planes: ResearchWorkspaceLifecycleRef[];
  largeBodyRefs: ResearchWorkspaceLifecycleRef[];
  smallFilePressureRefs: ResearchWorkspaceLifecycleRef[];
  runtimeCompactRefs: ResearchWorkspaceLifecycleRef[];
  completedProjectCloseoutRefs: ResearchWorkspaceLifecycleRef[];
  forbiddenGenericCleanupBoundary: ResearchWorkspaceLifecycleRef;
};

export type OwnerStorageSectionId = 'agent_package_store' | 'webui_data_volume';

export type OwnerStorageProjectedAction = {
  kind: 'navigate' | 'host_action_required';
  actionId: null;
  executionOwner: 'carrier_host' | null;
};

export type OwnerStorageInventoryViewModel = {
  id: OwnerStorageSectionId;
  status: string;
  observedAt: string | null;
  stale: boolean;
  bytes: number | null;
  reclaimableBytes: number | null;
  ownerRoute: '/settings/agents' | '/settings/storage#webui-data';
  projectedAction: OwnerStorageProjectedAction;
};

export type StorageSettingsViewModel = {
  sections: StorageInventorySectionViewModel[];
  ownerSections: OwnerStorageInventoryViewModel[];
  runtimePlan: StoragePlanViewModel;
  logsPlan: StoragePlanViewModel;
  updaterPlan: StoragePlanViewModel;
  conversationProof: StorageReceiptViewModel;
  lastReceipt: StorageReceiptViewModel;
  canDeleteConversationArtifacts: boolean;
  researchWorkspaceLifecycle: ResearchWorkspaceLifecycleViewModel;
};

export const STORAGE_SECTION_ORDER: LocalDataLifecycleSectionId[] = [
  'updater_cache',
  'user_data_artifacts',
  'runtime_substrate',
  'logs',
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const nullableStorageBytes = (value: unknown): number | null | undefined => {
  if (value === null) return null;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
};

const nullableObservedAt = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

function ownerStorageProjection(id: OwnerStorageSectionId, value: unknown): OwnerStorageInventoryViewModel | null {
  if (!isRecord(value) || !isRecord(value.projected_action)) return null;
  const expectedOwnerRoute = id === 'agent_package_store' ? '/settings/agents' : '/settings/storage#webui-data';
  const expectedActionKind = id === 'agent_package_store' ? 'navigate' : 'host_action_required';
  const expectedExecutionOwner = id === 'webui_data_volume' ? 'carrier_host' : null;
  const status = typeof value.status === 'string' && value.status.trim() ? value.status.trim() : null;
  const observedAt = nullableObservedAt(value.observed_at);
  const bytes = nullableStorageBytes(value.bytes);
  const reclaimableBytes = nullableStorageBytes(value.reclaimable_bytes);
  const action = value.projected_action;

  if (
    !status ||
    observedAt === undefined ||
    bytes === undefined ||
    reclaimableBytes === undefined ||
    typeof value.stale !== 'boolean' ||
    value.owner_route !== expectedOwnerRoute ||
    action.kind !== expectedActionKind ||
    action.action_id !== null ||
    (id === 'webui_data_volume' && action.execution_owner !== expectedExecutionOwner)
  ) {
    return null;
  }

  return {
    id,
    status,
    observedAt,
    stale: value.stale,
    bytes,
    reclaimableBytes,
    ownerRoute: expectedOwnerRoute,
    projectedAction: {
      kind: expectedActionKind,
      actionId: null,
      executionOwner: expectedExecutionOwner,
    },
  };
}

export function ownerStorageInventoryViewModels(appState: unknown): OwnerStorageInventoryViewModel[] {
  if (!isRecord(appState)) return [];
  const agentPackages = isRecord(appState.agent_packages) ? appState.agent_packages : {};
  const settingsControlCenter = isRecord(appState.settings_control_center) ? appState.settings_control_center : {};
  const appSettingsReadModel = isRecord(settingsControlCenter.app_settings_read_model)
    ? settingsControlCenter.app_settings_read_model
    : {};
  const storageLifecycle = isRecord(appSettingsReadModel.storage_lifecycle)
    ? appSettingsReadModel.storage_lifecycle
    : {};
  const topLevelAgentPackageStore = ownerStorageProjection('agent_package_store', agentPackages.storage_inventory);
  const fallbackAgentPackageStore = ownerStorageProjection('agent_package_store', storageLifecycle.agent_package_store);
  const webuiDataVolume = ownerStorageProjection('webui_data_volume', storageLifecycle.webui_data_volume);
  return [topLevelAgentPackageStore ?? fallbackAgentPackageStore, webuiDataVolume].filter(
    (section): section is OwnerStorageInventoryViewModel => section !== null
  );
}

function sectionById(
  inventory: LocalDataLifecycleInventory | null,
  id: LocalDataLifecycleSectionId
): LocalDataLifecycleInventorySection | null {
  return inventory?.sections.find((section) => section.id === id) ?? null;
}

export function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

export function storagePlanCandidateCount(plan: StoragePlan | null): number {
  return plan?.remove_candidates.length ?? 0;
}

export function storagePlanCandidateBytes(plan: StoragePlan | null): number {
  return plan?.remove_bytes ?? 0;
}

export function storageReceiptViewModel(receipt: LocalDataLifecycleReceipt | null): StorageReceiptViewModel {
  const receiptPath = receipt && 'receipt_path' in receipt ? receipt.receipt_path.trim() || null : null;
  return {
    receiptPath,
    conversationId: receipt?.schema === 'opl_conversation_archive_receipt.v1' ? receipt.conversation_id : null,
  };
}

export const RESEARCH_WORKSPACE_LIFECYCLE_REFS: ResearchWorkspaceLifecycleViewModel = {
  planes: [
    {
      id: 'lifecycle-planes',
      label: 'Work data stages',
      state: 'available',
      ref: 'app_state.storage.research_workspace_lifecycle.planes',
      detail: 'Source context for active, retention, archive, and completed-project stages.',
    },
  ],
  largeBodyRefs: [
    {
      id: 'large-body-refs',
      label: 'Large file references',
      state: 'available',
      ref: 'app_state.storage.research_workspace_lifecycle.large_body_refs',
      detail: 'Source references only; clinical data bodies and artifact bodies stay outside the App view.',
    },
  ],
  smallFilePressureRefs: [
    {
      id: 'small-file-pressure',
      label: 'Many small files',
      state: 'attention',
      ref: 'app_state.storage.research_workspace_lifecycle.small_file_pressure_refs',
      detail: 'Source context only; the App does not scan work directories.',
    },
  ],
  runtimeCompactRefs: [
    {
      id: 'runtime-compact-dry-run',
      label: 'Runtime cache cleanup preview',
      state: 'available',
      ref: 'app_state.storage.research_workspace_lifecycle.runtime_compact_dry_run_refs',
      detail: 'Preview source context from OPL Framework; apply remains owner-routed.',
    },
  ],
  completedProjectCloseoutRefs: [
    {
      id: 'completed-project-closeout',
      label: 'Completed project archive',
      state: 'available',
      ref: 'app_state.storage.research_workspace_lifecycle.completed_project_closeout_refs',
      detail: 'Closeout source context from OPL/MAS for completed research workspaces.',
    },
  ],
  forbiddenGenericCleanupBoundary: {
    id: 'forbidden-generic-cleanup',
    label: 'Generic cleanup blocked',
    state: 'blocked',
    ref: 'contracts/app-gui-product-contract.json#pages.settings_storage',
    detail: 'Cleanup without owner, preview, or closeout source context is forbidden.',
  },
};

function storagePlanViewModel(kind: StoragePlanKind, plan: StoragePlan | null): StoragePlanViewModel {
  return {
    kind,
    plan,
    candidateCount: storagePlanCandidateCount(plan),
    removeBytes: storagePlanCandidateBytes(plan),
    canExecute: Boolean(plan),
  };
}

export function buildStorageSettingsViewModel(input: {
  appState?: unknown;
  inventory: LocalDataLifecycleInventory | null;
  conversationProofReceipt: LocalDataLifecycleReceipt | null;
  lastReceipt: LocalDataLifecycleReceipt | null;
  runtimePlan: LocalDataLifecycleRuntimePrunePlan | null;
  logsPlan: LocalDataLifecycleLogRetentionPlan | null;
  updaterPlan: LocalDataLifecycleUpdaterCachePlan | null;
}): StorageSettingsViewModel {
  const conversationProof = storageReceiptViewModel(input.conversationProofReceipt);
  return {
    sections: STORAGE_SECTION_ORDER.map((id) => {
      const section = sectionById(input.inventory, id);
      return {
        id,
        section,
        bytes: section?.bytes ?? 0,
        rootCount: section?.roots.length ?? 0,
        cleanupMode: section?.cleanup_mode ?? null,
        silentDeleteAllowed: section?.silent_delete_allowed ?? false,
      };
    }),
    ownerSections: ownerStorageInventoryViewModels(input.appState),
    runtimePlan: storagePlanViewModel('runtime', input.runtimePlan),
    logsPlan: storagePlanViewModel('logs', input.logsPlan),
    updaterPlan: storagePlanViewModel('updater', input.updaterPlan),
    conversationProof,
    lastReceipt: storageReceiptViewModel(input.lastReceipt),
    canDeleteConversationArtifacts: Boolean(conversationProof.receiptPath),
    researchWorkspaceLifecycle: RESEARCH_WORKSPACE_LIFECYCLE_REFS,
  };
}
