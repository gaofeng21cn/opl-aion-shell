import { Radio, Typography } from '@arco-design/web-react';
import React from 'react';
import type { RuntimeTranslate } from '../formatters';
import type { RuntimeStatusView, RuntimeWorkItem } from '../types';
import styles from '../RuntimePage.module.css';

type RuntimeStatusBarProps = {
  items: RuntimeWorkItem[];
  selectedView: RuntimeStatusView;
  t: RuntimeTranslate;
  onViewChange: (view: RuntimeStatusView) => void;
};

const STATUS_VIEWS: Array<{ id: RuntimeStatusView; labelKey: string }> = [
  { id: 'all', labelKey: 'common.runtime.savedView.all' },
  { id: 'in_progress', labelKey: 'common.runtime.primaryStates.inProgress' },
  { id: 'owner_decision_required', labelKey: 'common.runtime.primaryStates.ownerDecisionRequired' },
  { id: 'paused', labelKey: 'common.runtime.savedView.paused' },
  { id: 'system_attention_required', labelKey: 'common.runtime.primaryStates.systemAttentionRequired' },
];

export function RuntimeStatusBar({ items, selectedView, t, onViewChange }: RuntimeStatusBarProps) {
  const metrics = [
    {
      key: 'in-progress',
      label: t('common.runtime.primaryStates.inProgress'),
      count: items.filter((item) => item.primaryStatus === 'in_progress').length,
    },
    {
      key: 'automation-running',
      label: t('common.runtime.automationStates.running'),
      count: items.filter((item) => ['running', 'queued'].includes(item.execution.state)).length,
    },
    {
      key: 'delivered',
      label: t('common.runtime.primaryStates.deliveredAutoPaused'),
      count: items.filter((item) => item.primaryStatus === 'delivered_auto_paused').length,
    },
    {
      key: 'owner-decision',
      label: t('common.runtime.primaryStates.ownerDecisionRequired'),
      count: items.filter((item) => item.primaryStatus === 'owner_decision_required').length,
    },
    {
      key: 'system-attention',
      label: t('common.runtime.primaryStates.systemAttentionRequired'),
      count: items.filter((item) => item.primaryStatus === 'system_attention_required').length,
    },
  ];

  return (
    <section className={styles.statusRegion}>
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
      </div>
    </section>
  );
}
