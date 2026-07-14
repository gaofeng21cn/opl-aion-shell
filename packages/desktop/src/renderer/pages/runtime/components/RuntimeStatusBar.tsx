import { Button, Radio, Select, Typography } from '@arco-design/web-react';
import { Inbox } from '@icon-park/react';
import React from 'react';
import type { RuntimeTranslate } from '../formatters';
import type { RuntimeStatusView, RuntimeWorkItem } from '../types';
import styles from '../RuntimePage.module.css';

type RuntimeStatusBarProps = {
  items: RuntimeWorkItem[];
  archivedCount: number;
  selectedView: RuntimeStatusView;
  t: RuntimeTranslate;
  onViewChange: (view: RuntimeStatusView) => void;
  onOpenArchived: () => void;
};

const STATUS_VIEWS: Array<{ id: RuntimeStatusView; labelKey: string }> = [
  { id: 'all', labelKey: 'common.runtime.savedView.all' },
  { id: 'automatically_advancing', labelKey: 'common.runtime.savedView.automaticallyAdvancing' },
  { id: 'awaiting_user_decision', labelKey: 'common.runtime.savedView.awaitingUserDecision' },
  { id: 'system_attention', labelKey: 'common.runtime.savedView.systemAttention' },
  { id: 'delivered_or_paused', labelKey: 'common.runtime.savedView.deliveredOrPaused' },
  { id: 'stopped', labelKey: 'common.runtime.savedView.stopped' },
  { id: 'sync_pending', labelKey: 'common.runtime.savedView.syncPending' },
];

export function RuntimeStatusBar({
  items,
  archivedCount,
  selectedView,
  t,
  onViewChange,
  onOpenArchived,
}: RuntimeStatusBarProps) {
  const metrics = [
    {
      key: 'total',
      label: t('common.runtime.metrics.total'),
      count: items.length,
    },
    {
      key: 'automation-running',
      label: t('common.runtime.primaryStates.automaticallyAdvancing'),
      count: items.filter((item) => item.primaryStatus === 'automatically_advancing').length,
    },
    {
      key: 'delivered',
      label: t('common.runtime.primaryStates.deliveredAutoPaused'),
      count: items.filter((item) => item.primaryStatus === 'delivered_auto_paused').length,
    },
    {
      key: 'owner-decision',
      label: t('common.runtime.primaryStates.ownerDecisionRequired'),
      count: items.filter((item) => item.primaryStatus === 'awaiting_user_decision').length,
    },
    {
      key: 'system-attention',
      label: t('common.runtime.primaryStates.systemAttentionRequired'),
      count: items.filter((item) => item.primaryStatus === 'system_attention').length,
    },
  ];

  return (
    <section className={styles.statusRegion} data-testid='runtime-status-region'>
      <div className={styles.metricGrid} data-testid='runtime-status-metrics'>
        {metrics.map((metric) => (
          <div className={styles.metric} key={metric.key}>
            <Typography.Text className={styles.metricLabel}>{metric.label}</Typography.Text>
            <Typography.Text className={styles.metricValue}>{metric.count}</Typography.Text>
          </div>
        ))}
      </div>
      <div className={styles.statusViewRow}>
        <div>
          <Typography.Title heading={5}>{t('common.runtime.taskListTitle')}</Typography.Title>
          <Typography.Text className={styles.statusViewHint}>
            {t('common.runtime.taskCountSummary', { count: items.length })}
          </Typography.Text>
        </div>
        <Radio.Group
          className={styles.desktopStatusViews}
          type='button'
          value={selectedView}
          onChange={(value) => onViewChange(value as RuntimeStatusView)}
          data-testid='runtime-status-views'
          aria-label={t('common.runtime.savedViews')}
        >
          {STATUS_VIEWS.map((view) => (
            <Radio value={view.id} key={view.id}>
              {t(view.labelKey)}
            </Radio>
          ))}
        </Radio.Group>
        <Select
          className={styles.mobileStatusView}
          value={selectedView}
          options={STATUS_VIEWS.map((view) => ({ label: t(view.labelKey), value: view.id }))}
          onChange={(value) => onViewChange(value as RuntimeStatusView)}
          data-testid='runtime-status-view-select'
          aria-label={t('common.runtime.savedViews')}
        />
        <Button
          className={styles.archiveEntry}
          icon={<Inbox theme='outline' />}
          onClick={onOpenArchived}
          data-testid='runtime-open-archive'
        >
          {t('common.runtime.archivedTasks.entry', { count: archivedCount })}
        </Button>
      </div>
    </section>
  );
}
