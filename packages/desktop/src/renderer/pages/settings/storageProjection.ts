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

export type StorageSettingsViewModel = {
  sections: StorageInventorySectionViewModel[];
  runtimePlan: StoragePlanViewModel;
  logsPlan: StoragePlanViewModel;
  updaterPlan: StoragePlanViewModel;
  conversationProof: StorageReceiptViewModel;
  lastReceipt: StorageReceiptViewModel;
  canDeleteConversationArtifacts: boolean;
};

export const STORAGE_SECTION_ORDER: LocalDataLifecycleSectionId[] = [
  'updater_cache',
  'user_data_artifacts',
  'runtime_substrate',
  'logs',
];

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
    runtimePlan: storagePlanViewModel('runtime', input.runtimePlan),
    logsPlan: storagePlanViewModel('logs', input.logsPlan),
    updaterPlan: storagePlanViewModel('updater', input.updaterPlan),
    conversationProof,
    lastReceipt: storageReceiptViewModel(input.lastReceipt),
    canDeleteConversationArtifacts: Boolean(conversationProof.receiptPath),
  };
}
