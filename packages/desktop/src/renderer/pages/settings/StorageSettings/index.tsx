/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Alert, Button, Space, Tag, Tooltip, Typography } from '@arco-design/web-react';
import { CheckOne, Delete, FolderSearch, Refresh, Repair, UpdateRotation } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type {
  LocalDataLifecycleInventory,
  LocalDataLifecycleLogRetentionPlan,
  LocalDataLifecycleReceipt,
  LocalDataLifecycleRuntimePrunePlan,
  LocalDataLifecycleUpdaterCachePlan,
} from '@/common/adapter/ipcBridge';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import {
  buildStorageSettingsViewModel,
  formatStorageBytes,
  type StorageInventorySectionViewModel,
  type StoragePlan,
  type StoragePlanKind,
  type ResearchWorkspaceLifecycleRef,
} from '../storageProjection';

type AsyncAction =
  | 'inventory'
  | 'cleanup-preview'
  | 'archive'
  | 'restore'
  | 'delete-conversations'
  | 'runtime-plan'
  | 'runtime-execute'
  | 'logs-plan'
  | 'logs-execute'
  | 'updater-plan'
  | 'updater-execute';

type PendingDangerAction = 'delete-conversations' | 'runtime-execute' | 'logs-execute' | 'updater-execute' | null;

type StorageSettingsProps = {
  withWrapper?: boolean;
};

type SectionMeta = {
  titleKey: string;
  descriptionKey: string;
};

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
  user_data_artifacts: 'conversation-archives',
  runtime_substrate: 'runtime-cache',
  logs: 'logs',
};

const CLEANUP_MODE_LABEL_KEYS: Record<string, string> = {
  stale_installer_package_cleanup_allowed: 'settings.storagePage.inventory.cleanupModes.safeWithoutExtraProof',
  archive_required_before_cleanup: 'settings.storagePage.inventory.cleanupModes.needsArchiveProof',
  pointer_based_dry_run_required: 'settings.storagePage.inventory.cleanupModes.needsPreview',
  bounded_rotation_dry_run_required: 'settings.storagePage.inventory.cleanupModes.needsPreview',
};

const cleanupModeLabelKey = (mode: string | null | undefined): string =>
  mode
    ? (CLEANUP_MODE_LABEL_KEYS[mode] ?? 'settings.storagePage.inventory.cleanupModes.needsReview')
    : 'settings.storagePage.inventory.cleanupModes.needsReview';

const lifecycleTagColor = (state: ResearchWorkspaceLifecycleRef['state']) => {
  if (state === 'blocked') return 'red';
  if (state === 'attention') return 'orange';
  return 'green';
};

type StorageInventoryRowProps = {
  item: StorageInventorySectionViewModel;
  actions: React.ReactNode;
  status?: React.ReactNode;
  technicalDetails?: React.ReactNode;
};

const StorageInventoryRow: React.FC<StorageInventoryRowProps> = ({ item, actions, status, technicalDetails }) => {
  const { t } = useTranslation();
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const meta = SECTION_META[item.id];
  const hasTechnicalDetails = Boolean(item.section || technicalDetails);

  return (
    <section
      className='opl-settings-section'
      id={SECTION_ANCHORS[item.id]}
      data-testid={`storage-inventory-${item.id}`}
    >
      <div className='flex h-full flex-col gap-14px p-16px'>
        <div className='min-w-0'>
          <Typography.Text className='font-600 text-t-primary'>{t(meta.titleKey)}</Typography.Text>
          <div className='text-12px text-t-secondary mt-4px'>{t(meta.descriptionKey)}</div>
        </div>
        <div className='flex flex-wrap items-center justify-between gap-8px'>
          <Typography.Text className='text-16px font-600 text-t-primary'>
            {formatStorageBytes(item.bytes)}
          </Typography.Text>
          <Tag color={item.silentDeleteAllowed ? 'gray' : 'orange'}>{t(cleanupModeLabelKey(item.cleanupMode))}</Tag>
        </div>
        {status && <div className='text-12px text-t-secondary'>{status}</div>}
        {!item.section && (
          <Typography.Text className='block text-12px text-t-secondary'>
            {t('settings.storagePage.inventory.notLoaded')}
          </Typography.Text>
        )}
        <div className='mt-auto flex flex-wrap items-center gap-8px'>{actions}</div>
      </div>
      {hasTechnicalDetails && (
        <details
          className='border-0 border-t border-solid border-border-1 px-16px py-12px'
          onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
          data-testid={`storage-inventory-details-${item.id}`}
        >
          <summary className='cursor-pointer text-12px text-t-secondary'>
            {t('settings.storagePage.inventory.details')}
          </summary>
          {detailsOpen && (
            <div className='mt-6px flex flex-col gap-6px'>
              {item.section?.roots.map((root) => (
                <div key={root.path} className='flex flex-col gap-2px text-12px break-words'>
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
              {item.section?.roots.length === 0 && (
                <Typography.Text className='text-12px text-t-secondary'>
                  {t('settings.storagePage.inventory.noRoots')}
                </Typography.Text>
              )}
              {technicalDetails}
            </div>
          )}
        </details>
      )}
    </section>
  );
};

export const StorageSettingsContent: React.FC = () => {
  const { t } = useTranslation();
  const [inventory, setInventory] = React.useState<LocalDataLifecycleInventory | null>(null);
  const [lastReceipt, setLastReceipt] = React.useState<LocalDataLifecycleReceipt | null>(null);
  const [conversationProofReceipt, setConversationProofReceipt] = React.useState<LocalDataLifecycleReceipt | null>(
    null
  );
  const [runtimePlan, setRuntimePlan] = React.useState<LocalDataLifecycleRuntimePrunePlan | null>(null);
  const [logsPlan, setLogsPlan] = React.useState<LocalDataLifecycleLogRetentionPlan | null>(null);
  const [updaterPlan, setUpdaterPlan] = React.useState<LocalDataLifecycleUpdaterCachePlan | null>(null);
  const [loading, setLoading] = React.useState<AsyncAction | null>(null);
  const [pendingDangerAction, setPendingDangerAction] = React.useState<PendingDangerAction>(null);
  const [researchDetailsOpen, setResearchDetailsOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const activeActionRef = React.useRef<AsyncAction | null>(null);
  const dangerConfirmationRef = React.useRef<HTMLDivElement>(null);
  const viewModel = React.useMemo(
    () =>
      buildStorageSettingsViewModel({
        inventory,
        conversationProofReceipt,
        lastReceipt,
        runtimePlan,
        logsPlan,
        updaterPlan,
      }),
    [conversationProofReceipt, inventory, lastReceipt, logsPlan, runtimePlan, updaterPlan]
  );
  const totalBytes = viewModel.sections.reduce((sum, section) => sum + section.bytes, 0);
  const cleanupCandidatesAvailable = viewModel.sections.some(
    (section) => section.id !== 'user_data_artifacts' && section.bytes > 0
  );
  const interactionLocked = loading !== null || pendingDangerAction !== null;

  const refreshInventory = React.useCallback(async () => {
    const result = await ipcBridge.localDataLifecycle.getInventory.invoke();
    setInventory(result);
  }, []);

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
      () => refreshInventory(),
      () => {}
    );
  }, [refreshInventory, runAction]);

  React.useEffect(() => {
    loadInventory();
  }, [loadInventory]);

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
      }
    );
  };

  const restoreConversationProof = () => {
    const id = viewModel.conversationProof.receiptPath;
    if (!id) return;
    void runAction(
      'restore',
      () => ipcBridge.localDataLifecycle.restoreConversationProof.invoke({ receiptPath: id }),
      (receipt) => {
        setLastReceipt(receipt);
        setConversationProofReceipt(receipt);
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
    }
  };

  const dangerActionSummary = () => {
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
    return '';
  };

  const dangerActionLabel = () => {
    if (pendingDangerAction === 'delete-conversations') return t('settings.storagePage.actions.deleteWithReceipt');
    if (pendingDangerAction === 'runtime-execute') return t('settings.storagePage.actions.executeRuntime');
    if (pendingDangerAction === 'logs-execute') return t('settings.storagePage.actions.executeLogs');
    if (pendingDangerAction === 'updater-execute') return t('settings.storagePage.actions.executeUpdater');
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
    { actions: React.ReactNode; status?: React.ReactNode; technicalDetails?: React.ReactNode }
  > = {
    user_data_artifacts: {
      actions: (
        <>
          {!viewModel.conversationProof.receiptPath && (
            <Button
              htmlType='button'
              icon={<FolderSearch />}
              disabled={interactionLocked}
              loading={loading === 'archive'}
              onClick={archiveConversations}
            >
              {t('settings.storagePage.actions.archive')}
            </Button>
          )}
          {viewModel.conversationProof.receiptPath && (
            <Button
              htmlType='button'
              icon={<CheckOne />}
              disabled={interactionLocked}
              loading={loading === 'restore'}
              onClick={restoreConversationProof}
              data-testid='storage-conversation-restore'
            >
              {t('settings.storagePage.actions.restoreProof')}
            </Button>
          )}
          <Button
            htmlType='button'
            status='danger'
            icon={<Delete />}
            disabled={interactionLocked || !viewModel.canDeleteConversationArtifacts}
            loading={loading === 'delete-conversations'}
            onClick={() => requestDangerAction('delete-conversations')}
            data-testid='storage-conversation-delete'
          >
            {t('settings.storagePage.actions.deleteWithReceipt')}
          </Button>
        </>
      ),
      status: viewModel.conversationProof.receiptPath
        ? t('settings.storagePage.conversations.proofReady')
        : t('settings.storagePage.conversations.receiptRequired'),
      technicalDetails: viewModel.conversationProof.receiptPath ? (
        <Typography.Text className='text-12px break-words'>
          {t('settings.storagePage.conversations.technicalReceipt', {
            receipt: viewModel.conversationProof.receiptPath,
          })}
        </Typography.Text>
      ) : undefined,
    },
    runtime_substrate: {
      actions: (
        <>
          <Button
            htmlType='button'
            icon={<FolderSearch />}
            disabled={interactionLocked}
            loading={loading === 'runtime-plan'}
            onClick={dryRunRuntimePrune}
          >
            {t('settings.storagePage.actions.dryRunRuntime')}
          </Button>
          <Button
            htmlType='button'
            status='danger'
            icon={<Repair />}
            disabled={interactionLocked || !viewModel.runtimePlan.canExecute}
            loading={loading === 'runtime-execute'}
            onClick={() => requestDangerAction('runtime-execute')}
            data-testid='storage-runtime-execute'
          >
            {t('settings.storagePage.actions.executeRuntime')}
          </Button>
        </>
      ),
      status: renderPlanSummary(
        'runtime',
        viewModel.runtimePlan.plan,
        viewModel.runtimePlan.candidateCount,
        viewModel.runtimePlan.removeBytes
      ),
    },
    logs: {
      actions: (
        <>
          <Button
            htmlType='button'
            icon={<FolderSearch />}
            disabled={interactionLocked}
            loading={loading === 'logs-plan'}
            onClick={dryRunLogRotation}
          >
            {t('settings.storagePage.actions.dryRunLogs')}
          </Button>
          <Button
            htmlType='button'
            status='danger'
            icon={<UpdateRotation />}
            disabled={interactionLocked || !viewModel.logsPlan.canExecute}
            loading={loading === 'logs-execute'}
            onClick={() => requestDangerAction('logs-execute')}
            data-testid='storage-logs-execute'
          >
            {t('settings.storagePage.actions.executeLogs')}
          </Button>
        </>
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
      actions: (
        <>
          <Button
            htmlType='button'
            icon={<FolderSearch />}
            disabled={interactionLocked}
            loading={loading === 'updater-plan'}
            onClick={dryRunUpdaterCleanup}
          >
            {t('settings.storagePage.actions.dryRunUpdater')}
          </Button>
          <Button
            htmlType='button'
            icon={<Repair />}
            disabled={interactionLocked || !viewModel.updaterPlan.canExecute}
            loading={loading === 'updater-execute'}
            onClick={() => requestDangerAction('updater-execute')}
            data-testid='storage-updater-execute'
          >
            {t('settings.storagePage.actions.executeUpdater')}
          </Button>
        </>
      ),
      status: renderPlanSummary(
        'updater',
        viewModel.updaterPlan.plan,
        viewModel.updaterPlan.candidateCount,
        viewModel.updaterPlan.removeBytes
      ),
    },
  };

  return (
    <div className='opl-settings-page flex flex-col gap-16px' data-testid='settings-page-storage'>
      <span data-testid='storage-settings-page' aria-hidden='true' />
      <div className='opl-settings-page-header'>
        <div className='opl-settings-page-header__copy'>
          <Typography.Title heading={4} className='mb-6px'>
            {t('settings.storagePage.title')}
          </Typography.Title>
          <Typography.Text className='text-t-secondary'>{t('settings.storagePage.description')}</Typography.Text>
        </div>
        <div className='opl-settings-page-header__actions'>
          {cleanupCandidatesAvailable && (
            <Button
              htmlType='button'
              type='primary'
              icon={<FolderSearch />}
              disabled={interactionLocked}
              loading={loading === 'cleanup-preview'}
              onClick={previewCleanup}
              data-testid='settings-storage-primary-action'
            >
              {t('settings.storagePage.actions.previewAll')}
            </Button>
          )}
          <Tooltip content={t('settings.storagePage.actions.refresh')}>
            <Button
              htmlType='button'
              icon={<Refresh />}
              aria-label={t('settings.storagePage.actions.refresh')}
              disabled={interactionLocked}
              loading={loading === 'inventory'}
              onClick={loadInventory}
              data-testid='storage-refresh'
            />
          </Tooltip>
        </div>
      </div>

      {error && <Alert type='error' content={error} data-testid='settings-storage-exception' />}

      {pendingDangerAction && (
        <div
          ref={dangerConfirmationRef}
          tabIndex={-1}
          className='outline-none'
          data-testid='storage-action-confirmation'
        >
          <Alert
            type='warning'
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
                    status='danger'
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

      {lastReceipt && <Alert type='success' content={t('settings.storagePage.messages.actionComplete')} />}

      <div data-testid='settings-storage-primary'>
        <section className='opl-settings-section' id='storage-categories' data-testid='storage-overview'>
          <span id='cleanup-preview' aria-hidden='true' />
          <div className='flex flex-wrap items-center justify-between gap-12px p-16px'>
            <div>
              <Typography.Text className='block font-600 text-t-primary'>
                {t('settings.storagePage.overview.categories')}
              </Typography.Text>
              <Typography.Text className='mt-4px block text-12px text-t-secondary'>
                {t('settings.storagePage.description')}
              </Typography.Text>
            </div>
            <div className='text-right'>
              <Typography.Text className='block text-12px text-t-secondary'>
                {t('settings.storagePage.overview.total')}
              </Typography.Text>
              <Typography.Text className='block text-18px font-600 text-t-primary'>
                {formatStorageBytes(totalBytes)}
              </Typography.Text>
            </div>
          </div>
        </section>

        <div className='mt-14px grid grid-cols-1 gap-14px md:grid-cols-2' data-testid='storage-category-list'>
          {viewModel.sections.map((item) => (
            <StorageInventoryRow key={item.id} item={item} {...categoryPresentation[item.id]} />
          ))}
        </div>
      </div>

      <div data-testid='storage-research-lifecycle'>
        <div data-testid='settings-storage-technical-details'>
          <details
            className='opl-settings-details'
            onToggle={(event) => setResearchDetailsOpen(event.currentTarget.open)}
            data-testid='storage-research-lifecycle-details'
          >
            <summary className='cursor-pointer text-13px text-t-secondary'>
              {t('settings.storagePage.researchLifecycle.technicalDetails')}
            </summary>
            {researchDetailsOpen && (
              <div className='mt-10px flex flex-col gap-12px'>
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
            )}
          </details>
        </div>
      </div>

      <section className='opl-settings-section' id='cleanup-history'>
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
    </div>
  );
};

const StorageSettings: React.FC<StorageSettingsProps> = ({ withWrapper = true }) => {
  const content = <StorageSettingsContent />;
  if (!withWrapper) return content;
  return <SettingsPageWrapper>{content}</SettingsPageWrapper>;
};

export default StorageSettings;
