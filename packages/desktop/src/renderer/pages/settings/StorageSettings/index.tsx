/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Alert, Button, Card, Message, Space, Tag, Typography } from '@arco-design/web-react';
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
} from '../storageProjection';

type AsyncAction =
  | 'inventory'
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

export const StorageSettingsContent: React.FC = () => {
  const { t } = useTranslation();
  const messageRef = React.useRef(Message);
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
  const [error, setError] = React.useState<string | null>(null);
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

  const runAction = React.useCallback(
    async <Result,>(action: AsyncAction, task: () => Promise<Result>, onSuccess: (result: Result) => void) => {
      setLoading(action);
      setError(null);
      try {
        const result = await task();
        onSuccess(result);
        messageRef.current.success(t('settings.storagePage.messages.actionComplete'));
      } catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : String(actionError);
        setError(message);
        messageRef.current.error(t('settings.storagePage.messages.actionFailed'));
      } finally {
        setLoading(null);
      }
    },
    [t]
  );

  const loadInventory = React.useCallback(() => {
    void runAction(
      'inventory',
      () => ipcBridge.localDataLifecycle.getInventory.invoke(),
      (result) => {
        setInventory(result);
      }
    );
  }, [runAction]);

  React.useEffect(() => {
    loadInventory();
  }, [loadInventory]);

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
      (receipt) => {
        setLastReceipt(receipt);
        loadInventory();
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
      (receipt) => {
        setLastReceipt(receipt);
        setRuntimePlan(null);
        loadInventory();
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
      (receipt) => {
        setLastReceipt(receipt);
        setLogsPlan(null);
        loadInventory();
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

  const executeUpdaterCleanup = () => {
    if (!updaterPlan) return;
    void runAction(
      'updater-execute',
      () =>
        ipcBridge.localDataLifecycle.executeUpdaterCacheCleanup.invoke({
          plan: updaterPlan,
          planHash: updaterPlan.plan_hash,
        }),
      (receipt) => {
        setLastReceipt(receipt);
        setUpdaterPlan(null);
        loadInventory();
      }
    );
  };

  const requestDangerAction = (action: Exclude<PendingDangerAction, null>) => {
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
        ? t('settings.storagePage.conversations.proofReceipt', { receipt: viewModel.conversationProof.receiptPath })
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

  const renderInventorySection = (item: StorageInventorySectionViewModel) => {
    const meta = SECTION_META[item.id];
    return (
      <Card key={item.id} bordered className='rd-8px' data-testid={`storage-inventory-${item.id}`}>
        <div className='flex flex-col gap-10px min-w-0'>
          <div className='flex items-start justify-between gap-12px'>
            <div className='min-w-0'>
              <Typography.Text className='font-600 text-t-primary'>{t(meta.titleKey)}</Typography.Text>
              <div className='text-12px text-t-secondary mt-4px'>{t(meta.descriptionKey)}</div>
            </div>
            <Tag color={item.silentDeleteAllowed ? 'green' : 'orange'}>
              {item.silentDeleteAllowed
                ? t('settings.storagePage.inventory.silentDeleteAllowed')
                : t('settings.storagePage.inventory.silentDeleteBlocked')}
            </Tag>
          </div>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-8px text-12px'>
            <span>{t('settings.storagePage.inventory.bytes', { bytes: formatStorageBytes(item.bytes) })}</span>
            <span>
              {t('settings.storagePage.inventory.cleanupMode', {
                mode: t(cleanupModeLabelKey(item.cleanupMode)),
              })}
            </span>
            <span>{t('settings.storagePage.inventory.rootCount', { count: item.rootCount })}</span>
          </div>
          <div className='flex flex-col gap-6px'>
            {(item.section?.roots ?? []).map((root) => (
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
            {item.section && item.section.roots.length === 0 && (
              <Typography.Text className='text-12px text-t-secondary'>
                {t('settings.storagePage.inventory.noRoots')}
              </Typography.Text>
            )}
            {!item.section && (
              <Typography.Text className='text-12px text-t-secondary'>
                {t('settings.storagePage.inventory.notLoaded')}
              </Typography.Text>
            )}
          </div>
        </div>
      </Card>
    );
  };

  const renderPlanSummary = (
    kind: StoragePlanKind,
    plan: StoragePlan | null,
    candidateCount: number,
    removeBytes: number
  ) => (
    <Alert
      type={plan ? 'info' : 'warning'}
      content={
        plan
          ? t(`settings.storagePage.plans.${kind}.summary`, {
              count: candidateCount,
              bytes: formatStorageBytes(removeBytes),
            })
          : t(`settings.storagePage.plans.${kind}.required`)
      }
    />
  );

  return (
    <div className='flex flex-col gap-16px' data-testid='storage-settings-page'>
      <div className='flex items-start justify-between gap-12px'>
        <div>
          <Typography.Title heading={4} className='mb-6px'>
            {t('settings.storagePage.title')}
          </Typography.Title>
          <Typography.Text className='text-t-secondary'>{t('settings.storagePage.description')}</Typography.Text>
        </div>
        <Button
          htmlType='button'
          icon={<Refresh />}
          loading={loading === 'inventory'}
          onClick={loadInventory}
          data-testid='storage-refresh'
        >
          {t('settings.storagePage.actions.refresh')}
        </Button>
      </div>

      {error && <Alert type='error' content={error} />}

      {pendingDangerAction && (
        <Alert
          type='warning'
          title={t('settings.updateConfirm')}
          data-testid='storage-action-confirmation'
          content={
            <div className='flex flex-col gap-8px'>
              <span className='break-words'>{dangerActionSummary()}</span>
              <Space wrap size='small'>
                <Button htmlType='button' size='small' onClick={cancelDangerAction}>
                  {t('common.cancel')}
                </Button>
                <Button
                  htmlType='button'
                  size='small'
                  type='primary'
                  status='danger'
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
      )}

      <div className='grid grid-cols-1 md:grid-cols-2 gap-14px'>{viewModel.sections.map(renderInventorySection)}</div>

      <Card bordered className='rd-8px' data-testid='storage-conversations'>
        <div className='flex flex-col gap-12px'>
          <div>
            <Typography.Text className='font-600 text-t-primary'>
              {t('settings.storagePage.conversations.title')}
            </Typography.Text>
            <div className='text-12px text-t-secondary mt-4px'>{t('settings.storagePage.conversations.detail')}</div>
          </div>
          <Space wrap>
            <Button
              htmlType='button'
              icon={<FolderSearch />}
              loading={loading === 'archive'}
              onClick={archiveConversations}
            >
              {t('settings.storagePage.actions.archive')}
            </Button>
            <Button
              htmlType='button'
              icon={<CheckOne />}
              disabled={!viewModel.conversationProof.receiptPath}
              loading={loading === 'restore'}
              onClick={restoreConversationProof}
              data-testid='storage-conversation-restore'
            >
              {t('settings.storagePage.actions.restoreProof')}
            </Button>
            <Button
              htmlType='button'
              status='danger'
              icon={<Delete />}
              disabled={!viewModel.canDeleteConversationArtifacts}
              loading={loading === 'delete-conversations'}
              onClick={() => requestDangerAction('delete-conversations')}
              data-testid='storage-conversation-delete'
            >
              {t('settings.storagePage.actions.deleteWithReceipt')}
            </Button>
          </Space>
          <Typography.Text className='text-12px text-t-secondary break-words'>
            {viewModel.conversationProof.receiptPath
              ? t('settings.storagePage.conversations.proofReceipt', {
                  receipt: viewModel.conversationProof.receiptPath,
                })
              : t('settings.storagePage.conversations.receiptRequired')}
          </Typography.Text>
        </div>
      </Card>

      <Card bordered className='rd-8px' data-testid='storage-runtime'>
        <div className='flex flex-col gap-12px'>
          <div>
            <Typography.Text className='font-600 text-t-primary'>
              {t('settings.storagePage.runtime.title')}
            </Typography.Text>
            <div className='text-12px text-t-secondary mt-4px'>{t('settings.storagePage.runtime.detail')}</div>
          </div>
          {renderPlanSummary(
            'runtime',
            viewModel.runtimePlan.plan,
            viewModel.runtimePlan.candidateCount,
            viewModel.runtimePlan.removeBytes
          )}
          <Space wrap>
            <Button
              htmlType='button'
              icon={<FolderSearch />}
              loading={loading === 'runtime-plan'}
              onClick={dryRunRuntimePrune}
            >
              {t('settings.storagePage.actions.dryRunRuntime')}
            </Button>
            <Button
              htmlType='button'
              status='danger'
              icon={<Repair />}
              disabled={!viewModel.runtimePlan.canExecute}
              loading={loading === 'runtime-execute'}
              onClick={() => requestDangerAction('runtime-execute')}
              data-testid='storage-runtime-execute'
            >
              {t('settings.storagePage.actions.executeRuntime')}
            </Button>
          </Space>
        </div>
      </Card>

      <Card bordered className='rd-8px' data-testid='storage-logs'>
        <div className='flex flex-col gap-12px'>
          <div>
            <Typography.Text className='font-600 text-t-primary'>
              {t('settings.storagePage.logs.title')}
            </Typography.Text>
            <div className='text-12px text-t-secondary mt-4px'>{t('settings.storagePage.logs.detail')}</div>
          </div>
          {renderPlanSummary(
            'logs',
            viewModel.logsPlan.plan,
            viewModel.logsPlan.candidateCount,
            viewModel.logsPlan.removeBytes
          )}
          {logsPlan && logsPlan.remove_candidates.length > 0 && (
            <div className='flex flex-col gap-6px'>
              {logsPlan.remove_candidates.slice(0, 5).map((candidate) => (
                <Typography.Text key={candidate.path} className='text-12px break-words'>
                  {t('settings.storagePage.logs.candidate', {
                    path: candidate.path,
                    reason: t(`settings.storagePage.logs.reasons.${candidate.reason}`),
                    bytes: formatStorageBytes(candidate.bytes),
                  })}
                </Typography.Text>
              ))}
            </div>
          )}
          <Space wrap>
            <Button
              htmlType='button'
              icon={<FolderSearch />}
              loading={loading === 'logs-plan'}
              onClick={dryRunLogRotation}
            >
              {t('settings.storagePage.actions.dryRunLogs')}
            </Button>
            <Button
              htmlType='button'
              status='danger'
              icon={<UpdateRotation />}
              disabled={!viewModel.logsPlan.canExecute}
              loading={loading === 'logs-execute'}
              onClick={() => requestDangerAction('logs-execute')}
              data-testid='storage-logs-execute'
            >
              {t('settings.storagePage.actions.executeLogs')}
            </Button>
          </Space>
        </div>
      </Card>

      <Card bordered className='rd-8px' data-testid='storage-updater-cache'>
        <div className='flex flex-col gap-12px'>
          <div>
            <Typography.Text className='font-600 text-t-primary'>
              {t('settings.storagePage.updater.title')}
            </Typography.Text>
            <div className='text-12px text-t-secondary mt-4px'>{t('settings.storagePage.updater.detail')}</div>
          </div>
          {renderPlanSummary(
            'updater',
            viewModel.updaterPlan.plan,
            viewModel.updaterPlan.candidateCount,
            viewModel.updaterPlan.removeBytes
          )}
          <Space wrap>
            <Button
              htmlType='button'
              icon={<FolderSearch />}
              loading={loading === 'updater-plan'}
              onClick={dryRunUpdaterCleanup}
            >
              {t('settings.storagePage.actions.dryRunUpdater')}
            </Button>
            <Button
              htmlType='button'
              icon={<Repair />}
              disabled={!viewModel.updaterPlan.canExecute}
              loading={loading === 'updater-execute'}
              onClick={() => requestDangerAction('updater-execute')}
              data-testid='storage-updater-execute'
            >
              {t('settings.storagePage.actions.executeUpdater')}
            </Button>
          </Space>
        </div>
      </Card>

      {lastReceipt && (
        <Alert
          type='success'
          content={t('settings.storagePage.receipt', {
            operation: lastReceipt.schema,
            receipt: viewModel.lastReceipt.receiptPath ?? '',
          })}
        />
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
