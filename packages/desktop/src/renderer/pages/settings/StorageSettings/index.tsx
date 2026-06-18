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
  LocalDataLifecycleInventorySection,
  LocalDataLifecycleLogRetentionPlan,
  LocalDataLifecycleReceipt,
  LocalDataLifecycleRuntimePrunePlan,
  LocalDataLifecycleSectionId,
  LocalDataLifecycleUpdaterCachePlan,
} from '@/common/adapter/ipcBridge';
import SettingsPageWrapper from '../components/SettingsPageWrapper';

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

type PlanKind = 'runtime' | 'logs' | 'updater';

type StorageSettingsProps = {
  withWrapper?: boolean;
};

type SectionMeta = {
  id: LocalDataLifecycleSectionId;
  titleKey: string;
  descriptionKey: string;
};

const SECTION_ORDER: LocalDataLifecycleSectionId[] = [
  'updater_cache',
  'conversation_artifacts',
  'runtime_toolchain',
  'logs',
];

const SECTION_META: Record<LocalDataLifecycleSectionId, SectionMeta> = {
  updater_cache: {
    id: 'updater_cache',
    titleKey: 'settings.storagePage.sections.updater.title',
    descriptionKey: 'settings.storagePage.sections.updater.description',
  },
  conversation_artifacts: {
    id: 'conversation_artifacts',
    titleKey: 'settings.storagePage.sections.conversations.title',
    descriptionKey: 'settings.storagePage.sections.conversations.description',
  },
  runtime_toolchain: {
    id: 'runtime_toolchain',
    titleKey: 'settings.storagePage.sections.runtime.title',
    descriptionKey: 'settings.storagePage.sections.runtime.description',
  },
  logs: {
    id: 'logs',
    titleKey: 'settings.storagePage.sections.logs.title',
    descriptionKey: 'settings.storagePage.sections.logs.description',
  },
};

function formatBytes(bytes: number): string {
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

function sectionById(
  inventory: LocalDataLifecycleInventory | null,
  id: LocalDataLifecycleSectionId
): LocalDataLifecycleInventorySection | null {
  return inventory?.sections.find((section) => section.id === id) ?? null;
}

function candidateCount(
  plan:
    | LocalDataLifecycleRuntimePrunePlan
    | LocalDataLifecycleLogRetentionPlan
    | LocalDataLifecycleUpdaterCachePlan
    | null
): number {
  return plan?.remove_candidates.length ?? 0;
}

function candidateBytes(
  plan:
    | LocalDataLifecycleRuntimePrunePlan
    | LocalDataLifecycleLogRetentionPlan
    | LocalDataLifecycleUpdaterCachePlan
    | null
): number {
  return plan?.remove_bytes ?? 0;
}

function receiptId(receipt: LocalDataLifecycleReceipt | null): string | null {
  if (!receipt) return null;
  if ('receipt_path' in receipt) return receipt.receipt_path.trim() || null;
  return null;
}

function conversationId(receipt: LocalDataLifecycleReceipt | null): string | null {
  return receipt?.schema === 'opl_conversation_archive_receipt.v1' ? receipt.conversation_id : null;
}

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
  const [error, setError] = React.useState<string | null>(null);

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
    const id = receiptId(conversationProofReceipt);
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
    const id = receiptId(conversationProofReceipt);
    if (!id) return;
    void runAction(
      'delete-conversations',
      () =>
        ipcBridge.localDataLifecycle.deleteConversationArtifacts.invoke({
          receiptPath: id,
          confirmation: `delete:${conversationId(conversationProofReceipt) ?? ''}`,
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

  const renderInventorySection = (id: LocalDataLifecycleSectionId) => {
    const section = sectionById(inventory, id);
    const meta = SECTION_META[id];
    return (
      <Card key={id} bordered className='rd-8px' data-testid={`storage-inventory-${id}`}>
        <div className='flex flex-col gap-10px min-w-0'>
          <div className='flex items-start justify-between gap-12px'>
            <div className='min-w-0'>
              <Typography.Text className='font-600 text-t-primary'>{t(meta.titleKey)}</Typography.Text>
              <div className='text-12px text-t-secondary mt-4px'>{t(meta.descriptionKey)}</div>
            </div>
            <Tag color={section?.silent_delete_allowed ? 'green' : 'orange'}>
              {section?.silent_delete_allowed
                ? t('settings.storagePage.inventory.silentDeleteAllowed')
                : t('settings.storagePage.inventory.silentDeleteBlocked')}
            </Tag>
          </div>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-8px text-12px'>
            <span>{t('settings.storagePage.inventory.bytes', { bytes: formatBytes(section?.bytes ?? 0) })}</span>
            <span>
              {t('settings.storagePage.inventory.cleanupMode', {
                mode: section?.cleanup_mode ?? t('settings.oplEnvironmentPage.status.unknown'),
              })}
            </span>
            <span>{t('settings.storagePage.inventory.rootCount', { count: section?.roots.length ?? 0 })}</span>
          </div>
          <div className='flex flex-col gap-6px'>
            {(section?.roots ?? []).map((root) => (
              <div key={root.path} className='flex flex-col gap-2px text-12px break-words'>
                <span>{root.path}</span>
                <span className='text-t-secondary'>
                  {t('settings.storagePage.inventory.rootDetail', {
                    exists: root.exists
                      ? t('settings.storagePage.inventory.exists')
                      : t('settings.storagePage.inventory.missing'),
                    bytes: formatBytes(root.bytes),
                  })}
                </span>
              </div>
            ))}
            {section && section.roots.length === 0 && (
              <Typography.Text className='text-12px text-t-secondary'>
                {t('settings.storagePage.inventory.noRoots')}
              </Typography.Text>
            )}
            {!section && (
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
    kind: PlanKind,
    plan:
      | LocalDataLifecycleRuntimePrunePlan
      | LocalDataLifecycleLogRetentionPlan
      | LocalDataLifecycleUpdaterCachePlan
      | null
  ) => (
    <Alert
      type={plan ? 'info' : 'warning'}
      content={
        plan
          ? t(`settings.storagePage.plans.${kind}.summary`, {
              count: candidateCount(plan),
              bytes: formatBytes(candidateBytes(plan)),
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

      <div className='grid grid-cols-1 md:grid-cols-2 gap-14px'>{SECTION_ORDER.map(renderInventorySection)}</div>

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
              disabled={!receiptId(conversationProofReceipt)}
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
              disabled={!receiptId(conversationProofReceipt)}
              loading={loading === 'delete-conversations'}
              onClick={deleteConversationArtifacts}
              data-testid='storage-conversation-delete'
            >
              {t('settings.storagePage.actions.deleteWithReceipt')}
            </Button>
          </Space>
          <Typography.Text className='text-12px text-t-secondary break-words'>
            {receiptId(conversationProofReceipt)
              ? t('settings.storagePage.conversations.proofReceipt', {
                  receipt: receiptId(conversationProofReceipt) ?? '',
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
          {renderPlanSummary('runtime', runtimePlan)}
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
              disabled={!runtimePlan}
              loading={loading === 'runtime-execute'}
              onClick={executeRuntimePrune}
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
          {renderPlanSummary('logs', logsPlan)}
          {logsPlan && logsPlan.remove_candidates.length > 0 && (
            <div className='flex flex-col gap-6px'>
              {logsPlan.remove_candidates.slice(0, 5).map((candidate) => (
                <Typography.Text key={candidate.path} className='text-12px break-words'>
                  {t('settings.storagePage.logs.candidate', {
                    path: candidate.path,
                    reason: t(`settings.storagePage.logs.reasons.${candidate.reason}`),
                    bytes: formatBytes(candidate.bytes),
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
              disabled={!logsPlan}
              loading={loading === 'logs-execute'}
              onClick={executeLogRotation}
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
          {renderPlanSummary('updater', updaterPlan)}
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
              disabled={!updaterPlan}
              loading={loading === 'updater-execute'}
              onClick={executeUpdaterCleanup}
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
            receipt: receiptId(lastReceipt) ?? '',
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
