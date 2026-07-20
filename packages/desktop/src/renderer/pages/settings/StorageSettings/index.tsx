/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Alert, Button, Modal, Space, Tag, Typography } from '@arco-design/web-react';
import { Delete, FolderSearch, Info, Repair, Right, Undo, UpdateRotation } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type {
  LocalDataLifecycleInventory,
  LocalDataLifecycleInventorySnapshot,
  LocalDataLifecycleLogRetentionPlan,
  LocalDataLifecycleReceipt,
  LocalDataLifecycleRuntimePrunePlan,
  LocalDataLifecycleUpdaterCachePlan,
} from '@/common/adapter/ipcBridge';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import OplRefreshIconButton from '@/renderer/components/opl/OplRefreshIconButton';
import { useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { useNavigate } from 'react-router-dom';
import {
  buildStorageSettingsViewModel,
  formatStorageBytes,
  type StorageInventorySectionViewModel,
  type StoragePlan,
  type StoragePlanKind,
  type ResearchWorkspaceLifecycleRef,
  type OwnerStorageInventoryViewModel,
} from '../storageProjection';
import {
  executeWebuiDataLifecycle,
  planWebuiDataLifecycle,
  readWebuiDataLifecycleCapability,
  restoreWebuiDataLifecycle,
  type WebuiDataLifecycleCapability,
  type WebuiDataLifecyclePlan,
  type WebuiDataLifecycleReceipt,
  type WebuiDataLifecycleRestoreReceipt,
} from './webuiDataLifecycleClient';

type AsyncAction =
  | 'inventory'
  | 'cleanup-preview'
  | 'archive'
  | 'restore-conversations'
  | 'delete-conversations'
  | 'runtime-plan'
  | 'runtime-execute'
  | 'logs-plan'
  | 'logs-execute'
  | 'updater-plan'
  | 'updater-execute'
  | 'webui-plan'
  | 'webui-execute'
  | 'webui-restore';

type PendingDangerAction =
  | 'restore-conversations'
  | 'delete-conversations'
  | 'runtime-execute'
  | 'logs-execute'
  | 'updater-execute'
  | 'webui-execute'
  | null;

type StorageSettingsProps = {
  withWrapper?: boolean;
};

type SectionMeta = {
  titleKey: string;
  descriptionKey: string;
};

type StorageUnavailableReason = 'desktopCarrier' | 'permission' | 'service' | 'unknown';

const SECTION_META: Record<StorageInventorySectionViewModel['id'], SectionMeta> = {
  updater_cache: {
    titleKey: 'settings.storagePage.sections.updater.title',
    descriptionKey: 'settings.storagePage.sections.updater.description',
  },
  user_data_artifacts: {
    titleKey: 'settings.storagePage.sections.conversations.title',
    descriptionKey: 'settings.storagePage.sections.conversations.description',
  },
  runtime_substrate: {
    titleKey: 'settings.storagePage.sections.runtime.title',
    descriptionKey: 'settings.storagePage.sections.runtime.description',
  },
  logs: {
    titleKey: 'settings.storagePage.sections.logs.title',
    descriptionKey: 'settings.storagePage.sections.logs.description',
  },
};

const SECTION_ANCHORS: Record<StorageInventorySectionViewModel['id'], string> = {
  updater_cache: 'installer-cache',
  user_data_artifacts: 'archives',
  runtime_substrate: 'runtime-cache',
  logs: 'log-cleanup',
};

const LATEST_CONVERSATION_ARCHIVE_RECEIPT_KEY = 'opl.storage.latestConversationArchiveReceipt.v1';
const STORAGE_ACTION_ICON_PROPS = {
  theme: 'outline' as const,
  size: 16,
  fill: 'currentColor',
  strokeWidth: 2,
};

const classifyStorageUnavailableReason = (
  desktopCarrier: boolean,
  rawError: string | null
): StorageUnavailableReason => {
  if (rawError) {
    if (/\b(?:EACCES|EPERM)\b|permission denied|access denied|not authorized|forbidden/i.test(rawError)) {
      return 'permission';
    }
    if (
      /\b(?:ECONNREFUSED|ENOTCONN|EPIPE|ETIMEDOUT)\b|timed? out|service|bridge|\bipc\b|not ready|unavailable|failed to fetch|network/i.test(
        rawError
      )
    ) {
      return 'service';
    }
    return 'unknown';
  }
  return desktopCarrier ? 'service' : 'desktopCarrier';
};

// This pointer only locates a restore candidate; restoreConversationProof remains authoritative.
const readLatestConversationArchiveReceiptPath = (): string | null => {
  try {
    return localStorage.getItem(LATEST_CONVERSATION_ARCHIVE_RECEIPT_KEY);
  } catch {
    return null;
  }
};

const rememberLatestConversationArchiveReceipt = (receiptPath: string): void => {
  try {
    localStorage.setItem(LATEST_CONVERSATION_ARCHIVE_RECEIPT_KEY, receiptPath);
  } catch {
    // The receipt itself remains authoritative when renderer storage is unavailable.
  }
};

const forgetLatestConversationArchiveReceipt = (): void => {
  try {
    localStorage.removeItem(LATEST_CONVERSATION_ARCHIVE_RECEIPT_KEY);
  } catch {
    // Ignore unavailable renderer storage.
  }
};

const lifecycleTagColor = (state: ResearchWorkspaceLifecycleRef['state']) => {
  if (state === 'blocked') return 'red';
  if (state === 'attention') return 'orange';
  return 'green';
};

type StorageInventoryRowProps = {
  item: StorageInventorySectionViewModel;
  actions: React.ReactNode;
  actionsWhenEmpty?: boolean;
  status?: React.ReactNode;
};

const StorageInventoryRow: React.FC<StorageInventoryRowProps> = ({
  item,
  actions,
  actionsWhenEmpty = false,
  status,
}) => {
  const { t } = useTranslation();
  const meta = SECTION_META[item.id];
  const hasInventory = item.section !== null;
  const isEmpty = hasInventory && item.bytes <= 0;

  return (
    <div className='opl-settings-row' id={SECTION_ANCHORS[item.id]} data-testid={`storage-inventory-${item.id}`}>
      <div className='opl-settings-row__main'>
        <Typography.Text className='font-600 text-t-primary'>{t(meta.titleKey)}</Typography.Text>
        <Typography.Text className='text-12px text-t-secondary break-words'>{t(meta.descriptionKey)}</Typography.Text>
        {isEmpty && (
          <Typography.Text className='text-12px text-t-secondary'>
            {t('settings.storagePage.inventory.noCleanupNeeded')}
          </Typography.Text>
        )}
        {!isEmpty && status && <div className='text-12px text-t-secondary break-words'>{status}</div>}
        {!hasInventory && (
          <Typography.Text className='text-12px text-t-secondary'>
            {t('settings.storagePage.inventory.notLoaded')}
          </Typography.Text>
        )}
      </div>
      <div className='opl-settings-row__meta'>
        <Typography.Text className='text-13px font-600 text-t-primary whitespace-nowrap'>
          {hasInventory ? formatStorageBytes(item.bytes) : t('settings.storagePage.inventory.unknownSize')}
        </Typography.Text>
        {hasInventory && (!isEmpty || actionsWhenEmpty) && (
          <div className='flex flex-wrap items-center justify-end gap-8px'>{actions}</div>
        )}
      </div>
    </div>
  );
};

const ownerStorageStatusLabelKey = (status: string): string => {
  if (status === 'available') return 'settings.resourcesPage.statusLabels.available';
  if (status === 'attention_required') return 'settings.resourcesPage.statusLabels.attention_required';
  if (status === 'not_configured') return 'settings.resourcesPage.statusLabels.not_configured';
  if (status === 'unavailable') return 'settings.unavailable';
  return 'settings.accessPage.statusLabels.unknown';
};

const ownerStorageStatusColor = (status: string): string => {
  if (status === 'available') return 'green';
  if (status === 'attention_required') return 'orange';
  return 'gray';
};

type OwnerStorageInventoryRowProps = {
  item: OwnerStorageInventoryViewModel;
  onOpenAgents: () => void;
  actions?: React.ReactNode;
  statusDetail?: React.ReactNode;
};

const OwnerStorageInventoryRow: React.FC<OwnerStorageInventoryRowProps> = ({
  item,
  onOpenAgents,
  actions,
  statusDetail,
}) => {
  const { t } = useTranslation();
  const isAgentPackageStore = item.id === 'agent_package_store';
  return (
    <div
      className='opl-settings-row'
      id={isAgentPackageStore ? 'agent-package-store' : 'webui-data'}
      data-testid={`storage-owner-${item.id}`}
    >
      <div className='opl-settings-row__main'>
        <Typography.Text className='font-600 text-t-primary'>
          {t(isAgentPackageStore ? 'settings.agentsPage.title' : 'settings.accessPage.remote.docker')}
        </Typography.Text>
        <Typography.Text className='text-12px text-t-secondary break-words'>
          {t(isAgentPackageStore ? 'settings.agentsPage.description' : 'settings.workspacePage.logs.webuiDescription')}
        </Typography.Text>
        <div className='flex flex-wrap items-center gap-6px text-12px text-t-secondary'>
          <Tag size='small' color={ownerStorageStatusColor(item.status)}>
            {t(ownerStorageStatusLabelKey(item.status))}
          </Tag>
          {item.stale && <Tag size='small'>{t('settings.storagePage.inventory.stale')}</Tag>}
          {!isAgentPackageStore && item.projectedAction.kind === 'host_action_required' && !actions && (
            <span>{t('settings.resourcesPage.resourceSources.management.selfManaged')}</span>
          )}
        </div>
        {statusDetail && <div className='text-12px text-t-secondary break-words'>{statusDetail}</div>}
      </div>
      <div className='opl-settings-row__meta'>
        <Typography.Text className='text-13px font-600 text-t-primary whitespace-nowrap'>
          {item.bytes === null ? t('settings.storagePage.inventory.unknownSize') : formatStorageBytes(item.bytes)}
        </Typography.Text>
        {isAgentPackageStore && (
          <Button
            htmlType='button'
            icon={<Right {...STORAGE_ACTION_ICON_PROPS} />}
            onClick={onOpenAgents}
            data-testid='storage-owner-agent-package-store-open'
          >
            {t('settings.agentsPage.title')}
          </Button>
        )}
        {!isAgentPackageStore && actions && (
          <div className='flex flex-wrap items-center justify-end gap-8px'>{actions}</div>
        )}
      </div>
    </div>
  );
};

export const StorageSettingsContent: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const desktopCarrier = isElectronDesktop();
  const appStateQuery = useOplAppState('fast');
  const [inventory, setInventory] = React.useState<LocalDataLifecycleInventory | null>(null);
  const [inventorySnapshot, setInventorySnapshot] = React.useState<LocalDataLifecycleInventorySnapshot | null>(null);
  const [lastReceipt, setLastReceipt] = React.useState<LocalDataLifecycleReceipt | null>(null);
  const [conversationProofReceipt, setConversationProofReceipt] = React.useState<LocalDataLifecycleReceipt | null>(
    null
  );
  const [runtimePlan, setRuntimePlan] = React.useState<LocalDataLifecycleRuntimePrunePlan | null>(null);
  const [logsPlan, setLogsPlan] = React.useState<LocalDataLifecycleLogRetentionPlan | null>(null);
  const [updaterPlan, setUpdaterPlan] = React.useState<LocalDataLifecycleUpdaterCachePlan | null>(null);
  const [webuiCapability, setWebuiCapability] = React.useState<WebuiDataLifecycleCapability | null>(null);
  const [webuiPlan, setWebuiPlan] = React.useState<WebuiDataLifecyclePlan | null>(null);
  const [webuiReceipt, setWebuiReceipt] = React.useState<WebuiDataLifecycleReceipt | null>(null);
  const [webuiRecoveryReceiptRef, setWebuiRecoveryReceiptRef] = React.useState<string | null>(null);
  const [webuiRestoreReceipt, setWebuiRestoreReceipt] = React.useState<WebuiDataLifecycleRestoreReceipt | null>(null);
  const [loading, setLoading] = React.useState<AsyncAction | null>(null);
  const [pendingDangerAction, setPendingDangerAction] = React.useState<PendingDangerAction>(null);
  const [diagnosticsVisible, setDiagnosticsVisible] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [inventoryReadError, setInventoryReadError] = React.useState<string | null>(null);
  const [inventoryReadSettled, setInventoryReadSettled] = React.useState(!desktopCarrier);
  const activeActionRef = React.useRef<AsyncAction | null>(null);
  const dangerConfirmationRef = React.useRef<HTMLDivElement>(null);
  const viewModel = React.useMemo(
    () =>
      buildStorageSettingsViewModel({
        appState: appStateQuery.appState,
        inventory,
        conversationProofReceipt,
        lastReceipt,
        runtimePlan,
        logsPlan,
        updaterPlan,
      }),
    [appStateQuery.appState, conversationProofReceipt, inventory, lastReceipt, logsPlan, runtimePlan, updaterPlan]
  );
  const totalBytes =
    (desktopCarrier ? viewModel.sections : []).reduce((sum, section) => sum + section.bytes, 0) +
    viewModel.ownerSections.reduce((sum, section) => sum + (section.bytes ?? 0), 0);
  const totalBytesKnown = desktopCarrier
    ? Boolean(inventory) && viewModel.ownerSections.every((section) => section.bytes !== null)
    : viewModel.ownerSections.length === 2 && viewModel.ownerSections.every((section) => section.bytes !== null);
  const cleanupCandidatesAvailable =
    desktopCarrier &&
    Boolean(inventory) &&
    viewModel.sections.some((section) => section.id !== 'user_data_artifacts' && section.bytes > 0);
  const conversationSection = viewModel.sections.find((section) => section.id === 'user_data_artifacts');
  const conversationFilesAvailable = (conversationSection?.bytes ?? 0) > 0;
  const conversationArchiveCanRestore =
    Boolean(conversationSection?.section) &&
    Boolean(viewModel.conversationProof.receiptPath) &&
    !conversationFilesAvailable;
  const interactionLocked = loading !== null || pendingDangerAction !== null;
  const hasLocalStorageReadback = Boolean(inventory);
  const hasOwnerStorageReadback = viewModel.ownerSections.some(
    (section) => section.bytes !== null && Number.isFinite(section.bytes)
  );
  const hasStorageReadback = hasLocalStorageReadback || hasOwnerStorageReadback;
  const storageUnavailableRawError = inventoryReadError ?? appStateQuery.error ?? error;
  const storageUnavailable = desktopCarrier
    ? inventoryReadSettled && (Boolean(inventoryReadError) || !hasLocalStorageReadback)
    : !appStateQuery.loading && !hasOwnerStorageReadback;
  const storageUnavailableReason = classifyStorageUnavailableReason(desktopCarrier, storageUnavailableRawError);
  const storageRecoveryRoute =
    storageUnavailableReason === 'permission' ? '/settings/workspace' : '/settings/environment';

  const applyInventorySnapshot = React.useCallback((snapshot: LocalDataLifecycleInventorySnapshot) => {
    setInventorySnapshot(snapshot);
    setInventory(snapshot.inventory);
    setInventoryReadError(snapshot.error);
    setInventoryReadSettled(true);
  }, []);

  const restoreRememberedConversationProof = React.useCallback(async () => {
    const receiptPath = readLatestConversationArchiveReceiptPath();
    if (!receiptPath) return;
    try {
      const receipt = await ipcBridge.localDataLifecycle.restoreConversationProof.invoke({ receiptPath });
      setConversationProofReceipt(receipt);
    } catch {
      forgetLatestConversationArchiveReceipt();
      setConversationProofReceipt(null);
    }
  }, []);

  const refreshInventory = React.useCallback(async () => {
    try {
      const snapshot = await ipcBridge.localDataLifecycle.refreshInventory.invoke();
      applyInventorySnapshot(snapshot);
    } catch (refreshError) {
      setInventoryReadError(refreshError instanceof Error ? refreshError.message : String(refreshError));
      setInventoryReadSettled(true);
      throw refreshError;
    }
  }, [applyInventorySnapshot]);

  const refreshWebuiCapability = React.useCallback(async () => {
    if (desktopCarrier) return;
    const capability = await readWebuiDataLifecycleCapability().catch((): null => null);
    setWebuiCapability(capability);
    if (!capability) {
      setWebuiPlan(null);
      setWebuiReceipt(null);
      setWebuiRecoveryReceiptRef(null);
      setWebuiRestoreReceipt(null);
    }
  }, [desktopCarrier]);

  const runAction = React.useCallback(
    async <Result,>(
      action: AsyncAction,
      task: () => Promise<Result>,
      onSuccess: (result: Result) => void | Promise<void>
    ) => {
      if (activeActionRef.current) return;
      activeActionRef.current = action;
      setLoading(action);
      setError(null);
      try {
        const result = await task();
        await onSuccess(result);
      } catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : String(actionError);
        setError(message);
      } finally {
        activeActionRef.current = null;
        setLoading(null);
      }
    },
    []
  );

  const loadInventory = React.useCallback(() => {
    void runAction(
      'inventory',
      async () => {
        const ownerInventoryRefresh = Promise.allSettled([
          ipcBridge.oplRuntime.executeAction.invoke({
            actionId: 'settings_inventory_agent_package_store',
            dryRun: false,
          }),
          ipcBridge.oplRuntime.executeAction.invoke({
            actionId: 'settings_inventory_webui_data_volume',
            dryRun: false,
          }),
        ]);
        const capabilityRefresh = refreshWebuiCapability();
        if (!desktopCarrier) {
          await Promise.allSettled([ownerInventoryRefresh, capabilityRefresh]);
          await appStateQuery.load('fast', { forceFresh: true, showRefreshing: false }).catch((): null => null);
          return;
        }
        const [localInventoryResult] = await Promise.allSettled([refreshInventory()]);
        await ownerInventoryRefresh;
        await appStateQuery.load('fast', { forceFresh: true, showRefreshing: false }).catch((): null => null);
        if (localInventoryResult.status === 'rejected') throw localInventoryResult.reason;
      },
      () => {}
    );
  }, [appStateQuery, desktopCarrier, refreshInventory, refreshWebuiCapability, runAction]);

  React.useEffect(() => {
    void refreshWebuiCapability();
  }, [refreshWebuiCapability]);

  React.useEffect(() => {
    if (!desktopCarrier) return;
    let active = true;
    const unsubscribe = ipcBridge.localDataLifecycle.inventoryUpdated.on((snapshot) => {
      if (active) applyInventorySnapshot(snapshot);
    });
    void ipcBridge.localDataLifecycle.getInventorySnapshot.invoke().then(
      (snapshot) => {
        if (active) applyInventorySnapshot(snapshot);
      },
      (snapshotError) => {
        if (active) {
          setInventoryReadError(snapshotError instanceof Error ? snapshotError.message : String(snapshotError));
          setInventoryReadSettled(true);
        }
      }
    );
    void restoreRememberedConversationProof();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [applyInventorySnapshot, desktopCarrier, restoreRememberedConversationProof]);

  React.useEffect(() => {
    if (!pendingDangerAction) return;
    dangerConfirmationRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    dangerConfirmationRef.current?.focus({ preventScroll: true });
  }, [pendingDangerAction]);

  const archiveConversations = () => {
    void runAction(
      'archive',
      () => ipcBridge.localDataLifecycle.archiveConversations.invoke(),
      (receipt) => {
        setLastReceipt(receipt);
        setConversationProofReceipt(receipt);
        rememberLatestConversationArchiveReceipt(receipt.receipt_path);
      }
    );
  };

  const deleteConversationArtifacts = () => {
    const id = viewModel.conversationProof.receiptPath;
    if (!id) return;
    void runAction(
      'delete-conversations',
      () =>
        ipcBridge.localDataLifecycle.deleteConversationArtifacts.invoke({
          receiptPath: id,
          confirmation: `delete:${viewModel.conversationProof.conversationId ?? ''}`,
        }),
      async (receipt) => {
        setLastReceipt(receipt);
        await refreshInventory();
      }
    );
  };

  const restoreConversationArchive = () => {
    const receiptPath = viewModel.conversationProof.receiptPath;
    if (!receiptPath) return;
    void runAction(
      'restore-conversations',
      () => ipcBridge.localDataLifecycle.restoreConversationArchive.invoke({ receiptPath }),
      async (receipt) => {
        setLastReceipt(receipt);
        await refreshInventory();
      }
    );
  };

  const dryRunRuntimePrune = () => {
    void runAction(
      'runtime-plan',
      () => ipcBridge.localDataLifecycle.planRuntimePrune.invoke(),
      (plan) => {
        setRuntimePlan(plan);
      }
    );
  };

  const executeRuntimePrune = () => {
    if (!runtimePlan) return;
    void runAction(
      'runtime-execute',
      () =>
        ipcBridge.localDataLifecycle.executeRuntimePrune.invoke({ plan: runtimePlan, planHash: runtimePlan.plan_hash }),
      async (receipt) => {
        setLastReceipt(receipt);
        setRuntimePlan(null);
        await refreshInventory();
      }
    );
  };

  const dryRunLogRotation = () => {
    void runAction(
      'logs-plan',
      () => ipcBridge.localDataLifecycle.planLogRotation.invoke(),
      (plan) => {
        setLogsPlan(plan);
      }
    );
  };

  const executeLogRotation = () => {
    if (!logsPlan) return;
    void runAction(
      'logs-execute',
      () => ipcBridge.localDataLifecycle.executeLogRotation.invoke({ plan: logsPlan, planHash: logsPlan.plan_hash }),
      async (receipt) => {
        setLastReceipt(receipt);
        setLogsPlan(null);
        await refreshInventory();
      }
    );
  };

  const dryRunUpdaterCleanup = () => {
    void runAction(
      'updater-plan',
      () => ipcBridge.localDataLifecycle.planUpdaterCacheCleanup.invoke(),
      (plan) => {
        setUpdaterPlan(plan);
      }
    );
  };

  const previewCleanup = () => {
    void runAction(
      'cleanup-preview',
      () =>
        Promise.all([
          ipcBridge.localDataLifecycle.planRuntimePrune.invoke(),
          ipcBridge.localDataLifecycle.planLogRotation.invoke(),
          ipcBridge.localDataLifecycle.planUpdaterCacheCleanup.invoke(),
        ]),
      ([nextRuntimePlan, nextLogsPlan, nextUpdaterPlan]) => {
        setRuntimePlan(nextRuntimePlan);
        setLogsPlan(nextLogsPlan);
        setUpdaterPlan(nextUpdaterPlan);
      }
    );
  };

  const executeUpdaterCleanup = () => {
    if (!updaterPlan) return;
    void runAction(
      'updater-execute',
      () =>
        ipcBridge.localDataLifecycle.executeUpdaterCacheCleanup.invoke({
          plan: updaterPlan,
          planHash: updaterPlan.plan_hash,
        }),
      async (receipt) => {
        setLastReceipt(receipt);
        setUpdaterPlan(null);
        await refreshInventory();
      }
    );
  };

  const planWebuiCleanup = () => {
    void runAction('webui-plan', planWebuiDataLifecycle, (plan) => {
      setWebuiPlan(plan);
      setWebuiReceipt(null);
      setWebuiRecoveryReceiptRef(null);
      setWebuiRestoreReceipt(null);
    });
  };

  const executeWebuiCleanup = () => {
    if (!webuiPlan) return;
    void runAction(
      'webui-execute',
      async () => {
        try {
          return await executeWebuiDataLifecycle(webuiPlan);
        } catch (actionError) {
          const receiptRef =
            actionError && typeof actionError === 'object' && 'receiptRef' in actionError
              ? actionError.receiptRef
              : null;
          if (typeof receiptRef === 'string' && receiptRef.length > 0) {
            setWebuiReceipt(null);
            setWebuiRecoveryReceiptRef(receiptRef);
            setWebuiRestoreReceipt(null);
            setWebuiPlan(null);
          } else if (
            actionError instanceof Error &&
            ['PLAN_ALREADY_USED', 'PLAN_EXPIRED', 'PLAN_NOT_FOUND', 'PLAN_STALE'].includes(actionError.message)
          ) {
            setWebuiPlan(null);
          }
          throw actionError;
        }
      },
      async (receipt) => {
        setWebuiReceipt(receipt);
        setWebuiRecoveryReceiptRef(receipt.receipt_ref);
        setWebuiRestoreReceipt(null);
        setWebuiPlan(null);
        await appStateQuery.load('fast', { forceFresh: true, showRefreshing: false }).catch((): null => null);
      }
    );
  };

  const webuiRestoreSourceRef = webuiReceipt?.receipt_ref ?? webuiRecoveryReceiptRef;

  const restoreWebuiCleanup = () => {
    if (!webuiRestoreSourceRef) return;
    void runAction(
      'webui-restore',
      () => restoreWebuiDataLifecycle(webuiRestoreSourceRef),
      async (receipt) => {
        setWebuiRestoreReceipt(receipt);
        await appStateQuery.load('fast', { forceFresh: true, showRefreshing: false }).catch((): null => null);
      }
    );
  };

  const requestDangerAction = (action: Exclude<PendingDangerAction, null>) => {
    if (activeActionRef.current || pendingDangerAction) return;
    setPendingDangerAction(action);
  };

  const cancelDangerAction = () => {
    setPendingDangerAction(null);
  };

  const confirmDangerAction = () => {
    const action = pendingDangerAction;
    setPendingDangerAction(null);
    if (action === 'restore-conversations') {
      restoreConversationArchive();
      return;
    }
    if (action === 'delete-conversations') {
      deleteConversationArtifacts();
      return;
    }
    if (action === 'runtime-execute') {
      executeRuntimePrune();
      return;
    }
    if (action === 'logs-execute') {
      executeLogRotation();
      return;
    }
    if (action === 'updater-execute') {
      executeUpdaterCleanup();
      return;
    }
    if (action === 'webui-execute') executeWebuiCleanup();
  };

  const dangerActionSummary = () => {
    if (pendingDangerAction === 'restore-conversations') {
      return t('settings.storagePage.conversations.restoreConfirmation', {
        defaultValue: 'Restore the archived conversation files to their original location without overwriting files.',
      });
    }
    if (pendingDangerAction === 'delete-conversations') {
      return viewModel.conversationProof.receiptPath
        ? t('settings.storagePage.conversations.deleteConfirmation')
        : t('settings.storagePage.conversations.receiptRequired');
    }
    if (pendingDangerAction === 'runtime-execute') {
      return t('settings.storagePage.plans.runtime.summary', {
        count: viewModel.runtimePlan.candidateCount,
        bytes: formatStorageBytes(viewModel.runtimePlan.removeBytes),
      });
    }
    if (pendingDangerAction === 'logs-execute') {
      return t('settings.storagePage.plans.logs.summary', {
        count: viewModel.logsPlan.candidateCount,
        bytes: formatStorageBytes(viewModel.logsPlan.removeBytes),
      });
    }
    if (pendingDangerAction === 'updater-execute') {
      return t('settings.storagePage.plans.updater.summary', {
        count: viewModel.updaterPlan.candidateCount,
        bytes: formatStorageBytes(viewModel.updaterPlan.removeBytes),
      });
    }
    if (pendingDangerAction === 'webui-execute' && webuiPlan) {
      return t('settings.storagePage.plans.runtime.summary', {
        count: webuiPlan.candidate_count,
        bytes: formatStorageBytes(webuiPlan.estimated_reclaimable_bytes),
      });
    }
    return '';
  };

  const dangerActionLabel = () => {
    if (pendingDangerAction === 'restore-conversations') return t('common.runtime.archiveTask.restore');
    if (pendingDangerAction === 'delete-conversations') return t('settings.storagePage.actions.deleteWithReceipt');
    if (pendingDangerAction === 'runtime-execute') return t('settings.storagePage.actions.executeRuntime');
    if (pendingDangerAction === 'logs-execute') return t('settings.storagePage.actions.executeLogs');
    if (pendingDangerAction === 'updater-execute') return t('settings.storagePage.actions.executeUpdater');
    if (pendingDangerAction === 'webui-execute') return t('settings.storagePage.actions.executeRuntime');
    return '';
  };

  const renderPlanSummary = (kind: StoragePlanKind, plan: StoragePlan | null, candidateCount: number, bytes: number) =>
    plan
      ? t(`settings.storagePage.plans.${kind}.summary`, {
          count: candidateCount,
          bytes: formatStorageBytes(bytes),
        })
      : null;

  const renderLifecycleRef = (item: ResearchWorkspaceLifecycleRef) => (
    <div key={item.id} className='flex flex-col gap-4px min-w-0'>
      <div className='flex items-start justify-between gap-8px'>
        <Typography.Text className='font-600 text-t-primary'>{item.label}</Typography.Text>
        <Tag color={lifecycleTagColor(item.state)}>
          {t(`settings.storagePage.researchLifecycle.states.${item.state}`)}
        </Tag>
      </div>
      <Typography.Text className='text-12px text-t-secondary'>{item.detail}</Typography.Text>
      <Typography.Text className='text-12px break-words'>{item.ref}</Typography.Text>
    </div>
  );

  const categoryPresentation: Record<
    StorageInventorySectionViewModel['id'],
    {
      actions: React.ReactNode;
      actionsWhenEmpty?: boolean;
      status?: React.ReactNode;
      technicalDetails?: React.ReactNode;
    }
  > = {
    user_data_artifacts: {
      actions: (
        <>
          {!viewModel.conversationProof.receiptPath && (
            <Button
              htmlType='button'
              icon={<FolderSearch {...STORAGE_ACTION_ICON_PROPS} />}
              disabled={interactionLocked}
              loading={loading === 'archive'}
              onClick={archiveConversations}
            >
              {t('settings.storagePage.actions.archive')}
            </Button>
          )}
          {conversationArchiveCanRestore && (
            <Button
              htmlType='button'
              icon={<Undo {...STORAGE_ACTION_ICON_PROPS} />}
              disabled={interactionLocked}
              loading={loading === 'restore-conversations'}
              onClick={() => requestDangerAction('restore-conversations')}
              data-testid='storage-conversation-restore'
            >
              {t('common.runtime.archiveTask.restore')}
            </Button>
          )}
          {viewModel.conversationProof.receiptPath && conversationFilesAvailable && (
            <Button
              htmlType='button'
              status='danger'
              icon={<Delete {...STORAGE_ACTION_ICON_PROPS} />}
              disabled={interactionLocked || !viewModel.canDeleteConversationArtifacts}
              loading={loading === 'delete-conversations'}
              onClick={() => requestDangerAction('delete-conversations')}
              data-testid='storage-conversation-delete'
            >
              {t('settings.storagePage.actions.deleteWithReceipt')}
            </Button>
          )}
        </>
      ),
      actionsWhenEmpty: conversationArchiveCanRestore,
      status: viewModel.conversationProof.receiptPath ? t('settings.storagePage.conversations.proofReady') : undefined,
      technicalDetails: viewModel.conversationProof.receiptPath ? (
        <Typography.Text className='text-12px break-words'>
          {t('settings.storagePage.conversations.technicalReceipt', {
            receipt: viewModel.conversationProof.receiptPath,
          })}
        </Typography.Text>
      ) : undefined,
    },
    runtime_substrate: {
      actions: viewModel.runtimePlan.canExecute ? (
        <Button
          htmlType='button'
          status='danger'
          icon={<Repair {...STORAGE_ACTION_ICON_PROPS} />}
          disabled={interactionLocked}
          loading={loading === 'runtime-execute'}
          onClick={() => requestDangerAction('runtime-execute')}
          data-testid='storage-runtime-execute'
        >
          {t('settings.storagePage.actions.executeRuntime')}
        </Button>
      ) : (
        <Button
          htmlType='button'
          icon={<FolderSearch {...STORAGE_ACTION_ICON_PROPS} />}
          disabled={interactionLocked}
          loading={loading === 'runtime-plan'}
          onClick={dryRunRuntimePrune}
        >
          {t('settings.storagePage.actions.dryRunRuntime')}
        </Button>
      ),
      status: renderPlanSummary(
        'runtime',
        viewModel.runtimePlan.plan,
        viewModel.runtimePlan.candidateCount,
        viewModel.runtimePlan.removeBytes
      ),
    },
    logs: {
      actions: viewModel.logsPlan.canExecute ? (
        <Button
          htmlType='button'
          status='danger'
          icon={<UpdateRotation {...STORAGE_ACTION_ICON_PROPS} />}
          disabled={interactionLocked}
          loading={loading === 'logs-execute'}
          onClick={() => requestDangerAction('logs-execute')}
          data-testid='storage-logs-execute'
        >
          {t('settings.storagePage.actions.executeLogs')}
        </Button>
      ) : (
        <Button
          htmlType='button'
          icon={<FolderSearch {...STORAGE_ACTION_ICON_PROPS} />}
          disabled={interactionLocked}
          loading={loading === 'logs-plan'}
          onClick={dryRunLogRotation}
        >
          {t('settings.storagePage.actions.dryRunLogs')}
        </Button>
      ),
      status: renderPlanSummary(
        'logs',
        viewModel.logsPlan.plan,
        viewModel.logsPlan.candidateCount,
        viewModel.logsPlan.removeBytes
      ),
      technicalDetails:
        logsPlan && logsPlan.remove_candidates.length > 0
          ? logsPlan.remove_candidates.slice(0, 5).map((candidate) => (
              <Typography.Text key={candidate.path} className='text-12px break-words'>
                {t('settings.storagePage.logs.candidate', {
                  path: candidate.path,
                  reason: t(`settings.storagePage.logs.reasons.${candidate.reason}`),
                  bytes: formatStorageBytes(candidate.bytes),
                })}
              </Typography.Text>
            ))
          : undefined,
    },
    updater_cache: {
      actions: viewModel.updaterPlan.canExecute ? (
        <Button
          htmlType='button'
          icon={<Repair {...STORAGE_ACTION_ICON_PROPS} />}
          disabled={interactionLocked}
          loading={loading === 'updater-execute'}
          onClick={() => requestDangerAction('updater-execute')}
          data-testid='storage-updater-execute'
        >
          {t('settings.storagePage.actions.executeUpdater')}
        </Button>
      ) : (
        <Button
          htmlType='button'
          icon={<FolderSearch {...STORAGE_ACTION_ICON_PROPS} />}
          disabled={interactionLocked}
          loading={loading === 'updater-plan'}
          onClick={dryRunUpdaterCleanup}
        >
          {t('settings.storagePage.actions.dryRunUpdater')}
        </Button>
      ),
      status: renderPlanSummary(
        'updater',
        viewModel.updaterPlan.plan,
        viewModel.updaterPlan.candidateCount,
        viewModel.updaterPlan.removeBytes
      ),
    },
  };

  const webuiLifecycleActions = webuiCapability ? (
    <>
      {webuiPlan && webuiPlan.candidate_count > 0 ? (
        <Button
          htmlType='button'
          icon={<Repair {...STORAGE_ACTION_ICON_PROPS} />}
          disabled={interactionLocked}
          loading={loading === 'webui-execute'}
          onClick={() => requestDangerAction('webui-execute')}
          data-testid='storage-webui-execute'
        >
          {t('settings.storagePage.actions.executeRuntime')}
        </Button>
      ) : (
        <Button
          htmlType='button'
          icon={<FolderSearch {...STORAGE_ACTION_ICON_PROPS} />}
          disabled={interactionLocked}
          loading={loading === 'webui-plan'}
          onClick={planWebuiCleanup}
          data-testid='storage-webui-plan'
        >
          {t('settings.storagePage.actions.dryRunRuntime')}
        </Button>
      )}
      {webuiRestoreSourceRef && !webuiRestoreReceipt && (
        <Button
          htmlType='button'
          icon={<Undo {...STORAGE_ACTION_ICON_PROPS} />}
          disabled={interactionLocked}
          loading={loading === 'webui-restore'}
          onClick={restoreWebuiCleanup}
          data-testid='storage-webui-restore'
        >
          {t('common.runtime.archiveTask.restore')}
        </Button>
      )}
    </>
  ) : undefined;
  const webuiLifecycleStatus = webuiPlan
    ? t('settings.storagePage.plans.runtime.summary', {
        count: webuiPlan.candidate_count,
        bytes: formatStorageBytes(webuiPlan.estimated_reclaimable_bytes),
      })
    : undefined;

  return (
    <div className='opl-settings-page flex flex-col gap-16px' data-testid='settings-page-storage'>
      <span data-testid='storage-settings-page' aria-hidden='true' />
      <div className='opl-settings-page-header'>
        <div className='opl-settings-page-header__copy'>
          <Typography.Title heading={4} className='mb-6px'>
            {t('settings.storagePage.title')}
          </Typography.Title>
          <Typography.Text className='text-t-secondary'>{t('settings.storagePage.description')}</Typography.Text>
          {hasStorageReadback && (
            <Typography.Text className='mt-6px block text-12px text-t-secondary' data-testid='storage-overview'>
              {t('settings.storagePage.overview.total')}:{' '}
              {totalBytesKnown ? formatStorageBytes(totalBytes) : t('settings.storagePage.inventory.unknownSize')}
            </Typography.Text>
          )}
          {desktopCarrier && hasLocalStorageReadback && (
            <Typography.Text
              className='mt-2px block text-12px text-t-tertiary'
              data-testid='storage-inventory-freshness'
            >
              {inventorySnapshot?.observed_at
                ? t('settings.storagePage.inventory.freshness', {
                    observedAt: new Date(inventorySnapshot.observed_at).toLocaleString(),
                    duration: inventorySnapshot.scan_duration_ms ?? 0,
                    state: t(
                      inventorySnapshot.stale
                        ? 'settings.storagePage.inventory.stale'
                        : 'settings.storagePage.inventory.current'
                    ),
                  })
                : t('settings.storagePage.inventory.awaitingSnapshot')}
            </Typography.Text>
          )}
        </div>
      </div>

      {storageUnavailable && (
        <section
          className='opl-settings-section opl-settings-surface--status'
          data-testid='settings-storage-unavailable'
        >
          <Alert
            type='warning'
            title={t('settings.uiOptimization.storage.unavailable.title')}
            content={
              <div className='flex min-w-0 flex-col gap-10px'>
                <Typography.Text className='text-13px text-t-secondary'>
                  {t('settings.uiOptimization.storage.unavailable.description')}
                </Typography.Text>
                <Typography.Text
                  className='text-13px text-t-primary'
                  data-testid={`settings-storage-unavailable-reason-${storageUnavailableReason}`}
                >
                  {t(`settings.uiOptimization.storage.unavailable.reasons.${storageUnavailableReason}`)}
                </Typography.Text>
                <Space wrap size='small'>
                  <Button
                    htmlType='button'
                    type='primary'
                    icon={<UpdateRotation {...STORAGE_ACTION_ICON_PROPS} />}
                    loading={loading === 'inventory'}
                    disabled={interactionLocked}
                    onClick={loadInventory}
                    data-testid='settings-storage-unavailable-retry'
                  >
                    {t('settings.uiOptimization.storage.unavailable.actions.retry')}
                  </Button>
                  <Button
                    htmlType='button'
                    icon={<Right {...STORAGE_ACTION_ICON_PROPS} />}
                    onClick={() => navigate(storageRecoveryRoute)}
                    data-testid='settings-storage-unavailable-recovery'
                  >
                    {t(
                      storageUnavailableReason === 'permission'
                        ? 'settings.uiOptimization.storage.unavailable.actions.openWorkspace'
                        : 'settings.uiOptimization.storage.unavailable.actions.openMaintenance'
                    )}
                  </Button>
                </Space>
                {storageUnavailableRawError && (
                  <details
                    className='min-w-0 text-12px text-t-secondary'
                    data-testid='settings-storage-unavailable-technical-details'
                  >
                    <summary className='w-fit cursor-pointer font-500'>
                      {t('settings.uiOptimization.maintenance.technicalDetails')}
                    </summary>
                    <pre className='m-0 mt-6px max-w-full whitespace-pre-wrap break-all font-mono text-11px'>
                      {storageUnavailableRawError}
                    </pre>
                  </details>
                )}
              </div>
            }
          />
        </section>
      )}

      {hasStorageReadback && (
        <>
          {error && !storageUnavailable && (
            <Alert type='error' content={error} data-testid='settings-storage-exception' />
          )}

          {pendingDangerAction && (
            <div
              ref={dangerConfirmationRef}
              tabIndex={-1}
              className='outline-none'
              data-testid='storage-action-confirmation'
            >
              <Alert
                type={pendingDangerAction === 'restore-conversations' ? 'info' : 'warning'}
                title={t('settings.updateConfirm')}
                content={
                  <div className='flex flex-col gap-8px'>
                    <span className='break-words'>{dangerActionSummary()}</span>
                    <Space wrap size='small'>
                      <Button htmlType='button' size='small' disabled={loading !== null} onClick={cancelDangerAction}>
                        {t('common.cancel')}
                      </Button>
                      <Button
                        htmlType='button'
                        size='small'
                        type='primary'
                        status={pendingDangerAction === 'restore-conversations' ? undefined : 'danger'}
                        disabled={loading !== null}
                        loading={loading === pendingDangerAction}
                        onClick={confirmDangerAction}
                        data-testid='storage-action-confirm'
                      >
                        {dangerActionLabel()}
                      </Button>
                    </Space>
                  </div>
                }
              />
            </div>
          )}

          {(lastReceipt || webuiReceipt || webuiRestoreReceipt) && (
            <Alert type='success' content={t('settings.storagePage.messages.actionComplete')} />
          )}

          <div id='storage-categories' data-testid='settings-storage-primary'>
            <span id='cleanup-preview' aria-hidden='true' />
            <div className='mb-10px flex flex-wrap items-center gap-8px'>
              {cleanupCandidatesAvailable && (
                <Button
                  htmlType='button'
                  type='primary'
                  icon={<FolderSearch {...STORAGE_ACTION_ICON_PROPS} />}
                  disabled={interactionLocked}
                  loading={loading === 'cleanup-preview'}
                  onClick={previewCleanup}
                  data-testid='settings-storage-primary-action'
                >
                  {t('settings.storagePage.actions.previewAll')}
                </Button>
              )}
              {desktopCarrier && hasLocalStorageReadback && (
                <Button
                  type='secondary'
                  icon={<Info {...STORAGE_ACTION_ICON_PROPS} />}
                  data-testid='settings-storage-diagnostics-action'
                  onClick={() => setDiagnosticsVisible(true)}
                >
                  {t('settings.oplEnvironmentPage.updates.diagnostics.title')}
                </Button>
              )}
              <OplRefreshIconButton
                htmlType='button'
                label={t('settings.storagePage.actions.refresh')}
                disabled={interactionLocked}
                loading={loading === 'inventory'}
                onClick={loadInventory}
                data-testid='storage-refresh'
              />
            </div>
            {!desktopCarrier && <span id='archives' aria-hidden='true' />}
            <div className='opl-settings-list' data-testid='storage-category-list'>
              {desktopCarrier &&
                hasLocalStorageReadback &&
                viewModel.sections.map((item) => (
                  <StorageInventoryRow key={item.id} item={item} {...categoryPresentation[item.id]} />
                ))}
              {viewModel.ownerSections.map((item) => {
                const hostReadback = webuiRestoreReceipt?.readback ?? webuiReceipt?.readback;
                const displayItem =
                  item.id === 'webui_data_volume' && hostReadback
                    ? {
                        ...item,
                        bytes: hostReadback.bytes,
                        reclaimableBytes: hostReadback.reclaimable_bytes,
                        stale: false,
                      }
                    : item;
                return (
                  <OwnerStorageInventoryRow
                    key={item.id}
                    item={displayItem}
                    onOpenAgents={() => navigate('/settings/agents')}
                    actions={item.id === 'webui_data_volume' ? webuiLifecycleActions : undefined}
                    statusDetail={item.id === 'webui_data_volume' ? webuiLifecycleStatus : undefined}
                  />
                );
              })}
            </div>
          </div>

          {!desktopCarrier && <span id='cleanup-history' aria-hidden='true' />}

          {desktopCarrier && hasLocalStorageReadback && (
            <span data-testid='storage-research-lifecycle' aria-hidden='true' />
          )}
          {desktopCarrier && hasLocalStorageReadback && (
            <Modal
              visible={diagnosticsVisible}
              title={t('settings.oplEnvironmentPage.updates.diagnostics.title')}
              footer={null}
              onCancel={() => setDiagnosticsVisible(false)}
              unmountOnExit
              style={{ width: 'min(860px, calc(100vw - 48px))' }}
            >
              <div
                className='opl-settings-surface--diagnostic max-h-[70vh] overflow-auto'
                data-testid='settings-storage-technical-details'
              >
                <div className='flex flex-col gap-12px' data-testid='storage-research-lifecycle-details'>
                  {viewModel.sections.map((item) => (
                    <div key={item.id} className='border-0 border-b border-solid border-[var(--border-base)] pb-10px'>
                      <Typography.Text className='block font-600 text-t-primary'>
                        {t(SECTION_META[item.id].titleKey)}
                      </Typography.Text>
                      <div className='mt-6px flex flex-col gap-6px'>
                        {item.section?.roots.map((root) => (
                          <div key={root.path} className='flex flex-col gap-2px break-words text-12px'>
                            <span>{root.path}</span>
                            <span className='text-t-secondary'>
                              {t('settings.storagePage.inventory.rootDetail', {
                                exists: root.exists
                                  ? t('settings.storagePage.inventory.exists')
                                  : t('settings.storagePage.inventory.missing'),
                                bytes: formatStorageBytes(root.bytes),
                              })}
                            </span>
                          </div>
                        ))}
                        {categoryPresentation[item.id].technicalDetails}
                      </div>
                    </div>
                  ))}
                  <div>
                    <Typography.Text className='font-600 text-t-primary'>
                      {t('settings.storagePage.researchLifecycle.title')}
                    </Typography.Text>
                    <div className='text-12px text-t-secondary mt-4px'>
                      {t('settings.storagePage.researchLifecycle.detail')}
                    </div>
                  </div>
                  <Alert type='info' content={t('settings.storagePage.researchLifecycle.boundary')} />
                  <div className='grid grid-cols-1 md:grid-cols-2 gap-12px'>
                    {viewModel.researchWorkspaceLifecycle.planes.map(renderLifecycleRef)}
                    {viewModel.researchWorkspaceLifecycle.largeBodyRefs.map(renderLifecycleRef)}
                    {viewModel.researchWorkspaceLifecycle.smallFilePressureRefs.map(renderLifecycleRef)}
                    {viewModel.researchWorkspaceLifecycle.runtimeCompactRefs.map(renderLifecycleRef)}
                    {viewModel.researchWorkspaceLifecycle.completedProjectCloseoutRefs.map(renderLifecycleRef)}
                    {renderLifecycleRef(viewModel.researchWorkspaceLifecycle.forbiddenGenericCleanupBoundary)}
                  </div>
                </div>
              </div>
            </Modal>
          )}

          {desktopCarrier && hasLocalStorageReadback && (
            <section className='opl-settings-section opl-settings-surface--status' id='cleanup-history'>
              <div className='opl-settings-row'>
                <div className='opl-settings-row__main'>
                  <Typography.Text className='font-600 text-t-primary'>
                    {t('settings.storagePage.history.title')}
                  </Typography.Text>
                  <Typography.Text className='break-all text-12px text-t-secondary'>
                    {lastReceipt
                      ? t('settings.storagePage.history.latest', { time: lastReceipt.created_at })
                      : t('settings.storagePage.history.empty')}
                  </Typography.Text>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};

const StorageSettings: React.FC<StorageSettingsProps> = ({ withWrapper = true }) => {
  const content = <StorageSettingsContent />;
  if (!withWrapper) return content;
  return <SettingsPageWrapper>{content}</SettingsPageWrapper>;
};

export default StorageSettings;
