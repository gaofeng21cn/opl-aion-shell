import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Collapse, Empty, Message, Spin, Tag } from '@arco-design/web-react';
import { FolderOpen, Left, Refresh } from '@icon-park/react';
import { ipcBridge } from '@/common';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  RUNTIME_TRAY_ITEM_STORAGE_KEY,
  type RuntimeTrayActionOwner,
  type RuntimeTrayItem,
  type RuntimeTrayOpenPayload,
  type RuntimeTraySnapshot,
} from './types';

const readStoredRuntimeItem = (): RuntimeTrayOpenPayload | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(RUNTIME_TRAY_ITEM_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RuntimeTrayOpenPayload) : null;
  } catch {
    return null;
  }
};

const isRuntimeTraySnapshot = (value: unknown): value is RuntimeTraySnapshot => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const snapshot = value as Partial<RuntimeTraySnapshot>;
  return (
    snapshot.schema_version === 'runtime_tray_snapshot.v1' &&
    Array.isArray(snapshot.running_items) &&
    Array.isArray(snapshot.attention_items) &&
    Array.isArray(snapshot.recent_items) &&
    Boolean(snapshot.runtime_health)
  );
};

const getSourceRefLabel = (ref: Record<string, unknown>, fallback: string): string => {
  for (const key of ['label', 'title', 'surface', 'kind', 'type']) {
    const value = ref[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
};

const getSourceRefDetail = (ref: Record<string, unknown>): string => {
  for (const key of ['path', 'file', 'url', 'href', 'ref', 'id']) {
    const value = ref[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  try {
    return JSON.stringify(ref, null, 2);
  } catch {
    return '';
  }
};

const toRuntimeOpenPayload = (item: RuntimeTrayItem): RuntimeTrayOpenPayload => ({
  projectId: item.project_id,
  projectLabel: item.project_label,
  itemId: item.item_id,
  title: item.title,
  statusLabel: item.status_label,
  summary: item.summary,
  updatedAt: item.updated_at,
  command: item.command,
  workspacePath: item.workspace_path,
  sourceRefs: item.source_refs,
  actionOwner: item.action_owner,
  requiresUserAction: item.requires_user_action,
  actionKind: item.action_kind,
  actionSummary: item.action_summary,
  studyId: item.study_id,
  workspaceLabel: item.workspace_label,
  detailSummary: item.detail_summary,
  nextActionSummary: item.next_action_summary,
  activeRunId: item.active_run_id,
  browserUrl: item.browser_url,
  questSessionApiUrl: item.quest_session_api_url,
  healthStatus: item.health_status,
  blockers: item.blockers,
  recommendedCommands: item.recommended_commands,
});

const runtimeHealthTagColor = (status?: string): string => {
  switch (status) {
    case 'needs_attention':
      return 'orangered';
    case 'running':
      return 'green';
    case 'offline':
      return 'red';
    default:
      return 'blue';
  }
};

const runtimeHealthLabel = (status: RuntimeTraySnapshot['runtime_health']['status'], t: RuntimeTranslator): string => {
  switch (status) {
    case 'needs_attention':
      return t('common.tray.runtimeStatusNeedsAttention');
    case 'running':
      return t('common.tray.runtimeStatusRunning');
    case 'offline':
      return t('common.tray.runtimeStatusOffline');
    case 'idle':
      return t('common.tray.runtimeStatusIdle');
  }
};

type RuntimeTranslator = ReturnType<typeof useTranslation>['t'];

const getRuntimeActionOwner = (item: RuntimeTrayOpenPayload): RuntimeTrayActionOwner => {
  if (item.requiresUserAction || item.actionOwner === 'user') {
    return 'user';
  }
  if (item.actionOwner === 'opl' || item.actionOwner === 'infrastructure') {
    return item.actionOwner;
  }
  return 'none';
};

const allSnapshotItems = (snapshot: RuntimeTraySnapshot): RuntimeTrayItem[] => [
  ...snapshot.attention_items,
  ...snapshot.running_items,
  ...snapshot.recent_items,
];

const getSnapshotGroups = (snapshot: RuntimeTraySnapshot) => {
  const items = allSnapshotItems(snapshot);
  const ownerForItem = (item: RuntimeTrayItem): RuntimeTrayActionOwner => {
    if (item.requires_user_action || item.action_owner === 'user') {
      return 'user';
    }
    if (item.action_owner === 'opl' || item.action_owner === 'infrastructure') {
      return item.action_owner;
    }
    return 'none';
  };

  const legacyAttention = snapshot.attention_items.filter((item) => ownerForItem(item) === 'none');
  return {
    user: items.filter((item) => ownerForItem(item) === 'user'),
    opl: [...items.filter((item) => ownerForItem(item) === 'opl'), ...legacyAttention],
    running: snapshot.running_items.filter((item) => ownerForItem(item) === 'none'),
    infrastructure: items.filter((item) => ownerForItem(item) === 'infrastructure'),
    recent: snapshot.recent_items.filter((item) => ownerForItem(item) === 'none'),
  };
};

const getSnapshotActionCounts = (snapshot: RuntimeTraySnapshot) => {
  if (snapshot.action_counts) {
    return snapshot.action_counts;
  }

  const counts = allSnapshotItems(snapshot).reduce(
    (counts, item) => {
      if (item.requires_user_action || item.action_owner === 'user') {
        counts.user += 1;
      } else if (item.action_owner === 'opl' || item.action_owner === 'infrastructure') {
        counts[item.action_owner] += 1;
      }
      return counts;
    },
    { user: 0, opl: 0, infrastructure: 0 }
  );
  counts.opl += snapshot.attention_items.filter((item) => !item.requires_user_action && !item.action_owner).length;
  return counts;
};

const getSnapshotSummary = (snapshot: RuntimeTraySnapshot, t: RuntimeTranslator): string => {
  if (snapshot.runtime_health.status === 'offline') {
    return snapshot.runtime_health.summary;
  }
  const counts = getSnapshotActionCounts(snapshot);
  return t('common.runtimeTray.summaryByOwner', {
    running: snapshot.running_items.length,
    opl: counts.opl,
    infrastructure: counts.infrastructure,
    user: counts.user,
  });
};

const getRuntimeActionSummary = (item: RuntimeTrayOpenPayload, t: RuntimeTranslator): string => {
  const actionSummary = item.actionSummary?.trim();
  if (actionSummary) {
    return actionSummary;
  }
  const nextAction = item.nextActionSummary?.trim();
  if (nextAction) {
    return nextAction;
  }
  const detailSummary = item.detailSummary?.trim();
  if (detailSummary) {
    return detailSummary;
  }
  return t('common.runtimeTray.actionSummaryDefault');
};

const isWaitingReviewRuntimeItem = (item: RuntimeTrayOpenPayload): boolean =>
  item.statusLabel.toLowerCase().includes('waiting review') || item.healthStatus === 'escalated';

const isRecoveringRuntimeItem = (item: RuntimeTrayOpenPayload): boolean =>
  item.statusLabel.toLowerCase().includes('recover') || item.healthStatus === 'recovering';

const getRuntimeAttentionReason = (item: RuntimeTrayOpenPayload, t: RuntimeTranslator): string => {
  const blockerCount = item.blockers?.filter((blocker) => blocker.trim()).length ?? 0;
  if (isWaitingReviewRuntimeItem(item)) {
    return t('common.runtimeTray.attentionReasonReview');
  }
  if (isRecoveringRuntimeItem(item)) {
    return t('common.runtimeTray.attentionReasonRecovering');
  }
  if (blockerCount > 0) {
    return t('common.runtimeTray.attentionReasonChecks', { count: blockerCount });
  }
  return t('common.runtimeTray.attentionReasonDefault');
};

const getRuntimeCurrentSituation = (item: RuntimeTrayOpenPayload, t: RuntimeTranslator): string => {
  const detailSummary = item.detailSummary?.trim();
  if (detailSummary) {
    return detailSummary;
  }
  if (isWaitingReviewRuntimeItem(item)) {
    return t('common.runtimeTray.attentionReasonReview');
  }
  if (isRecoveringRuntimeItem(item)) {
    return t('common.runtimeTray.attentionReasonRecovering');
  }
  return t('common.runtimeTray.attentionReasonDefault');
};

const getRuntimeNaturalLanguagePrompt = (item: RuntimeTrayOpenPayload, t: RuntimeTranslator): string => {
  if (isWaitingReviewRuntimeItem(item)) {
    return t('common.runtimeTray.tellOplReview', { title: item.title });
  }
  if (isRecoveringRuntimeItem(item)) {
    return t('common.runtimeTray.tellOplRecovering', { title: item.title });
  }
  if (item.nextActionSummary?.trim()) {
    return t('common.runtimeTray.tellOplNextAction', {
      title: item.title,
      nextAction: item.nextActionSummary.trim(),
    });
  }
  return t('common.runtimeTray.tellOplCheck', { title: item.title });
};

const RuntimeTrayItemPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const isItemRoute = location.pathname === '/runtime/item';
  const [snapshot, setSnapshot] = useState<RuntimeTraySnapshot | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const runtimeItem = useMemo(() => {
    const state = location.state as { runtimeItem?: RuntimeTrayOpenPayload } | null;
    return isItemRoute ? (state?.runtimeItem ?? readStoredRuntimeItem()) : null;
  }, [isItemRoute, location.state]);

  const handleOpenWorkspace = useCallback(() => {
    if (!runtimeItem?.workspacePath) return;
    void ipcBridge.shell.openFile.invoke(runtimeItem.workspacePath).catch((error) => {
      Message.error(error instanceof Error ? error.message : t('common.unknownError'));
    });
  }, [runtimeItem?.workspacePath, t]);

  const handleOpenExternal = useCallback(
    (url: string | null | undefined) => {
      if (!url) return;
      void ipcBridge.shell.openExternal.invoke(url).catch((error) => {
        Message.error(error instanceof Error ? error.message : t('common.unknownError'));
      });
    },
    [t]
  );

  const loadRuntimeSnapshot = useCallback(async () => {
    setLoadingSnapshot(true);
    setSnapshotError(null);
    try {
      const result = await ipcBridge.shell.runOplCommand.invoke({ args: ['runtime', 'snapshot', '--json'] });
      if (result.exitCode !== 0) {
        throw new Error(result.stderr || result.stdout || t('common.runtimeTray.snapshotLoadFailed'));
      }
      const payload = JSON.parse(result.stdout) as { runtime_tray_snapshot?: unknown };
      if (!isRuntimeTraySnapshot(payload.runtime_tray_snapshot)) {
        throw new Error(t('common.runtimeTray.snapshotInvalid'));
      }
      setSnapshot(payload.runtime_tray_snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('common.runtimeTray.snapshotLoadFailed');
      setSnapshotError(message);
      setSnapshot(null);
    } finally {
      setLoadingSnapshot(false);
    }
  }, [t]);

  useEffect(() => {
    if (!runtimeItem) {
      void loadRuntimeSnapshot();
    }
  }, [loadRuntimeSnapshot, runtimeItem]);

  const openRuntimeItem = (item: RuntimeTrayItem) => {
    const payload = toRuntimeOpenPayload(item);
    try {
      window.sessionStorage.setItem(RUNTIME_TRAY_ITEM_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Route state remains the primary handoff.
    }
    void navigate('/runtime/item', { state: { runtimeItem: payload } });
  };

  const renderRuntimeGuidance = (item: RuntimeTrayOpenPayload, compact = false) => {
    const owner = getRuntimeActionOwner(item);
    const guidanceItems =
      owner === 'user'
        ? [
            {
              label: t('common.runtimeTray.userActionRequired'),
              value: getRuntimeActionSummary(item, t),
            },
            {
              label: t('common.runtimeTray.tellOpl'),
              value: getRuntimeNaturalLanguagePrompt(item, t),
            },
          ]
        : owner === 'opl'
          ? [
              {
                label: t('common.runtimeTray.oplHandling'),
                value: getRuntimeActionSummary(item, t),
              },
              {
                label: t('common.runtimeTray.whyNotDone'),
                value: getRuntimeAttentionReason(item, t),
              },
            ]
          : owner === 'infrastructure'
            ? [
                {
                  label: t('common.runtimeTray.infrastructureProblem'),
                  value: getRuntimeActionSummary(item, t),
                },
                {
                  label: t('common.runtimeTray.infrastructureRecovery'),
                  value: item.nextActionSummary?.trim() || getRuntimeCurrentSituation(item, t),
                },
              ]
            : [
                {
                  label: t('common.runtimeTray.currentSituation'),
                  value: getRuntimeCurrentSituation(item, t),
                },
                {
                  label: t('common.runtimeTray.oplHandling'),
                  value: getRuntimeActionSummary(item, t),
                },
              ];

    return (
      <div className={compact ? 'mt-10px grid grid-cols-1 gap-8px' : 'flex flex-col gap-12px'}>
        {guidanceItems.map((guidanceItem) => (
          <div
            key={guidanceItem.label}
            className={
              compact
                ? 'rounded-6px bg-fill-2 px-10px py-8px text-13px leading-20px text-t-primary'
                : 'rounded-6px bg-fill-2 px-12px py-10px text-14px leading-22px text-t-primary'
            }
          >
            <div className='mb-4px text-12px font-medium text-t-secondary'>{guidanceItem.label}</div>
            {guidanceItem.value}
          </div>
        ))}
      </div>
    );
  };

  const renderSnapshotSection = (title: string, items: RuntimeTrayItem[]) => {
    if (items.length === 0) {
      return null;
    }

    return (
      <section className='flex flex-col gap-12px'>
        <h2 className='m-0 text-13px font-medium text-t-secondary'>{title}</h2>
        <div className='h-1px w-full bg-[var(--color-border-2)]' />
        <div className='grid grid-cols-1 gap-10px'>
          {items.map((item) => {
            const runtimePayload = toRuntimeOpenPayload(item);
            return (
              <div
                key={item.item_id}
                className='min-w-0 cursor-pointer rounded-6px border border-solid border-[var(--color-border-2)] bg-transparent px-12px py-10px text-left transition-colors hover:bg-fill-2'
                onClick={() => openRuntimeItem(item)}
              >
                <div className='flex flex-wrap items-center justify-between gap-8px'>
                  <div className='min-w-0 flex-1 text-14px font-medium text-t-primary'>{item.title}</div>
                  <Tag color='blue' className='shrink-0'>
                    {item.status_label}
                  </Tag>
                </div>
                <div className='mt-5px text-12px leading-18px text-t-secondary'>
                  {item.project_label}
                  {item.active_run_id ? ` · ${item.active_run_id}` : ''}
                </div>
                {renderRuntimeGuidance(runtimePayload, true)}
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  const snapshotGroups = snapshot ? getSnapshotGroups(snapshot) : null;
  const snapshotVisibleItemCount = snapshotGroups
    ? snapshotGroups.user.length +
      snapshotGroups.opl.length +
      snapshotGroups.running.length +
      snapshotGroups.infrastructure.length +
      snapshotGroups.recent.length
    : 0;

  if (!runtimeItem) {
    return (
      <div className='w-full min-h-full box-border overflow-y-auto px-14px pt-28px pb-24px md:px-40px md:pt-52px md:pb-42px'>
        <div className='mx-auto flex w-full max-w-860px flex-col gap-24px box-border'>
          <div className='flex flex-wrap items-start justify-between gap-14px'>
            <div className='flex flex-col gap-8px'>
              <h1 className='m-0 text-30px font-bold leading-38px text-t-primary md:text-34px md:leading-42px'>
                {t('common.runtimeTray.runtimeStatusTitle')}
              </h1>
              {snapshot && (
                <p className='m-0 text-15px leading-24px text-t-secondary'>{getSnapshotSummary(snapshot, t)}</p>
              )}
            </div>
            <div className='flex shrink-0 items-center gap-8px'>
              {snapshot?.runtime_health.status && (
                <Tag color={runtimeHealthTagColor(snapshot.runtime_health.status)}>
                  {runtimeHealthLabel(snapshot.runtime_health.status, t)}
                </Tag>
              )}
              <Button
                size='small'
                icon={<Refresh theme='outline' size={14} />}
                loading={loadingSnapshot}
                onClick={() => void loadRuntimeSnapshot()}
              >
                {t('common.refresh')}
              </Button>
            </div>
          </div>

          {loadingSnapshot && !snapshot ? (
            <div className='flex min-h-260px items-center justify-center'>
              <Spin />
            </div>
          ) : snapshotError ? (
            <div className='flex min-h-260px items-center justify-center'>
              <Empty
                description={
                  <div className='flex flex-col gap-6px text-center'>
                    <span className='text-t-primary'>{t('common.runtimeTray.snapshotLoadFailed')}</span>
                    <span className='text-t-secondary'>{snapshotError}</span>
                  </div>
                }
              />
            </div>
          ) : snapshot ? (
            <>
              {snapshotGroups && (
                <>
                  {renderSnapshotSection(t('common.tray.runtimeUserAction'), snapshotGroups.user)}
                  {renderSnapshotSection(t('common.tray.runtimeOplAction'), snapshotGroups.opl)}
                  {renderSnapshotSection(t('common.tray.runtimeRunning'), snapshotGroups.running)}
                  {renderSnapshotSection(t('common.tray.runtimeInfrastructure'), snapshotGroups.infrastructure)}
                  {renderSnapshotSection(t('common.tray.runtimeRecent'), snapshotGroups.recent)}
                </>
              )}
              {snapshotVisibleItemCount === 0 && (
                <div className='flex min-h-260px items-center justify-center'>
                  <Empty description={t('common.runtimeTray.noRuntimeItems')} />
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    );
  }

  const sourceRefs = runtimeItem.sourceRefs || [];

  return (
    <div className='w-full min-h-full box-border overflow-y-auto px-14px pt-28px pb-24px md:px-40px md:pt-52px md:pb-42px'>
      <div className='mx-auto flex w-full max-w-860px flex-col gap-28px box-border'>
        <Button
          type='text'
          size='small'
          className='w-fit !px-0 !text-14px md:!text-15px !text-t-secondary hover:!text-t-primary'
          icon={<Left theme='outline' size={16} className='line-height-0 shrink-0' />}
          onClick={() => navigate('/runtime')}
        >
          {t('common.historyBack')}
        </Button>

        <div className='flex flex-col gap-14px pb-8px'>
          <div className='flex flex-wrap items-start justify-between gap-14px'>
            <h1 className='m-0 min-w-0 flex-1 break-words text-30px font-bold leading-38px text-t-primary md:text-34px md:leading-42px'>
              {runtimeItem.title || t('common.tray.untitled')}
            </h1>
            {runtimeItem.statusLabel && (
              <Tag color='blue' className='shrink-0'>
                {runtimeItem.statusLabel}
              </Tag>
            )}
          </div>
        </div>

        <section className='flex flex-col gap-12px'>
          <h2 className='m-0 text-13px font-medium text-t-secondary'>{t('common.runtimeTray.physicianView')}</h2>
          <div className='h-1px w-full bg-[var(--color-border-2)]' />
          {renderRuntimeGuidance(runtimeItem)}
        </section>

        <Collapse bordered={false}>
          <Collapse.Item header={t('common.runtimeTray.developerDetails')} name='developer-details'>
            <section className='flex flex-col gap-12px'>
              <dl className='m-0 grid grid-cols-1 gap-14px md:grid-cols-[160px_minmax(0,1fr)]'>
                <dt className='text-13px text-t-secondary'>{t('common.runtimeTray.project')}</dt>
                <dd className='m-0 min-w-0 break-words text-14px text-t-primary'>{runtimeItem.projectLabel}</dd>
                <dt className='text-13px text-t-secondary'>{t('common.status')}</dt>
                <dd className='m-0 min-w-0 break-words text-14px text-t-primary'>{runtimeItem.statusLabel}</dd>
                {runtimeItem.summary && (
                  <>
                    <dt className='text-13px text-t-secondary'>{t('common.runtimeTray.operatorView')}</dt>
                    <dd className='m-0 min-w-0 break-words text-14px text-t-primary'>{runtimeItem.summary}</dd>
                  </>
                )}
                {runtimeItem.command && (
                  <>
                    <dt className='text-13px text-t-secondary'>{t('common.runtimeTray.primaryCommand')}</dt>
                    <dd className='m-0 min-w-0 break-words text-14px text-t-primary'>
                      <code className='block min-w-0 whitespace-pre-wrap break-all rounded bg-fill-2 px-6px py-2px text-12px'>
                        {runtimeItem.command}
                      </code>
                    </dd>
                  </>
                )}
                {runtimeItem.studyId && (
                  <>
                    <dt className='text-13px text-t-secondary'>{t('common.runtimeTray.study')}</dt>
                    <dd className='m-0 min-w-0 break-words text-14px text-t-primary'>{runtimeItem.studyId}</dd>
                  </>
                )}
                {runtimeItem.activeRunId && (
                  <>
                    <dt className='text-13px text-t-secondary'>{t('common.runtimeTray.activeRun')}</dt>
                    <dd className='m-0 min-w-0 break-words text-14px text-t-primary'>{runtimeItem.activeRunId}</dd>
                  </>
                )}
                {runtimeItem.healthStatus && (
                  <>
                    <dt className='text-13px text-t-secondary'>{t('common.runtimeTray.health')}</dt>
                    <dd className='m-0 min-w-0 break-words text-14px text-t-primary'>{runtimeItem.healthStatus}</dd>
                  </>
                )}
                {runtimeItem.updatedAt && (
                  <>
                    <dt className='text-13px text-t-secondary'>{t('common.runtimeTray.updatedAt')}</dt>
                    <dd className='m-0 min-w-0 break-words text-14px text-t-primary'>
                      {new Date(runtimeItem.updatedAt).toLocaleString()}
                    </dd>
                  </>
                )}
                {runtimeItem.workspacePath && (
                  <>
                    <dt className='text-13px text-t-secondary'>{t('common.workspace')}</dt>
                    <dd className='m-0 flex min-w-0 flex-wrap items-center gap-8px text-14px text-t-primary'>
                      <code className='min-w-0 break-all rounded bg-fill-2 px-6px py-2px text-12px'>
                        {runtimeItem.workspacePath}
                      </code>
                      <Button
                        size='mini'
                        type='text'
                        icon={<FolderOpen theme='outline' size={14} />}
                        onClick={handleOpenWorkspace}
                      >
                        {t('common.runtimeTray.openWorkspace')}
                      </Button>
                    </dd>
                  </>
                )}
                {runtimeItem.browserUrl && (
                  <>
                    <dt className='text-13px text-t-secondary'>{t('common.runtimeTray.monitoringUrl')}</dt>
                    <dd className='m-0 flex min-w-0 flex-wrap items-center gap-8px text-14px text-t-primary'>
                      <code className='min-w-0 break-all rounded bg-fill-2 px-6px py-2px text-12px'>
                        {runtimeItem.browserUrl}
                      </code>
                      <Button size='mini' type='text' onClick={() => handleOpenExternal(runtimeItem.browserUrl)}>
                        {t('common.open')}
                      </Button>
                    </dd>
                  </>
                )}
              </dl>

              <div className='h-1px w-full bg-[var(--color-border-2)]' />
              <h3 className='m-0 text-13px font-medium text-t-secondary'>{t('common.runtimeTray.sourceRefs')}</h3>
              {sourceRefs.length > 0 ? (
                <div className='flex flex-col gap-12px'>
                  {sourceRefs.map((ref, index) => (
                    <div key={`${runtimeItem.itemId}-${index}`} className='flex flex-col gap-5px'>
                      <div className='text-13px font-medium text-t-primary'>
                        {getSourceRefLabel(ref, t('common.runtimeTray.sourceRef', { index: index + 1 }))}
                      </div>
                      <code className='block min-w-0 whitespace-pre-wrap break-all rounded bg-fill-2 px-8px py-6px text-12px text-t-secondary'>
                        {getSourceRefDetail(ref)}
                      </code>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty description={t('common.runtimeTray.noSourceRefs')} />
              )}
            </section>
          </Collapse.Item>
        </Collapse>
      </div>
    </div>
  );
};

export default RuntimeTrayItemPage;
