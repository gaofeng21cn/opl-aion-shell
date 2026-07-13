import { Button, Tag, Typography } from '@arco-design/web-react';
import { Data, Play, Refresh } from '@icon-park/react';
import React from 'react';
import type { RuntimeSafeActionRoute } from '@/renderer/pages/settings/RuntimeSettings/types';
import type { RuntimeTranslate } from '../formatters';
import type { RuntimeActionResultSummary, RuntimeArchivedAttempt, RuntimeCockpitSummary } from '../cockpit';
import styles from '../RuntimePage.module.css';

type RuntimeCockpitPanelProps = {
  summary: RuntimeCockpitSummary | null;
  safeActions: RuntimeSafeActionRoute[];
  archivedAttempts: RuntimeArchivedAttempt[];
  actionResult: RuntimeActionResultSummary | null;
  approvedActionId: string | null;
  runningActionId: string | null;
  summaryLoading: boolean;
  fullLoading: boolean;
  fullLoaded: boolean;
  t: RuntimeTranslate;
  onLoadSummary: () => void;
  onLoadFull: () => void;
  onDryRun: (action: RuntimeSafeActionRoute) => void;
  onExecute: (action: RuntimeSafeActionRoute) => void;
  onRestore: (attempt: RuntimeArchivedAttempt) => void;
};

function summaryValue(value: string | number | null, t: RuntimeTranslate): string {
  return value === null ? t('common.runtime.drilldownUnavailable') : String(value);
}

export function RuntimeCockpitPanel({
  summary,
  safeActions,
  archivedAttempts,
  actionResult,
  approvedActionId,
  runningActionId,
  summaryLoading,
  fullLoading,
  fullLoaded,
  t,
  onLoadSummary,
  onLoadFull,
  onDryRun,
  onExecute,
  onRestore,
}: RuntimeCockpitPanelProps) {
  const metrics = summary
    ? [
        { key: 'availability', label: t('common.runtime.summaryAvailability'), value: summary.availability },
        { key: 'provider', label: t('common.runtime.summaryProvider'), value: summary.providerStatus },
        { key: 'attempts', label: t('common.runtime.summaryStageAttempts'), value: summary.stageAttemptCount },
        { key: 'blocked', label: t('common.runtime.summaryBlocked'), value: summary.blockedStateCount },
        { key: 'actions', label: t('common.runtime.summarySafeActions'), value: summary.safeActionCount },
        { key: 'next', label: t('common.runtime.summaryNextAction'), value: summary.nextActionId },
      ]
    : [];

  return (
    <section className={styles.cockpit} data-testid='runtime-cockpit'>
      <div className={styles.cockpitHeader}>
        <Typography.Title heading={5}>{t('common.runtime.summary')}</Typography.Title>
        <div className={styles.cockpitCommands}>
          <Button
            icon={<Refresh theme='outline' />}
            loading={summaryLoading}
            onClick={onLoadSummary}
            data-testid='runtime-load-summary'
          >
            {t('common.runtime.summary')}
          </Button>
          <Button
            icon={<Data theme='outline' />}
            loading={fullLoading}
            onClick={onLoadFull}
            data-testid='runtime-load-full'
          >
            {t('common.runtime.fullDetail')}
          </Button>
          {fullLoaded && <Tag data-testid='runtime-full-loaded'>{t('common.runtime.detailFullLoaded')}</Tag>}
        </div>
      </div>

      {metrics.length > 0 && (
        <div className={styles.cockpitMetrics} data-testid='runtime-cockpit-summary'>
          {metrics.map((metric) => (
            <div className={styles.cockpitMetric} key={metric.key}>
              <Typography.Text className={styles.cockpitMetricLabel}>{metric.label}</Typography.Text>
              <Typography.Text className={styles.cockpitMetricValue}>{summaryValue(metric.value, t)}</Typography.Text>
            </div>
          ))}
        </div>
      )}

      <div className={styles.cockpitSections}>
        {safeActions.length > 0 && (
          <div className={styles.cockpitSection} data-testid='runtime-safe-actions'>
            <Typography.Text className={styles.cockpitSectionTitle}>{t('common.runtime.safeActions')}</Typography.Text>
            <div className={styles.cockpitRows}>
              {safeActions.map((action) => (
                <div className={styles.cockpitRow} key={action.id} data-testid={`runtime-safe-action-${action.id}`}>
                  <div className={styles.cockpitRowBody}>
                    <Typography.Text className={styles.cockpitRowTitle}>{action.label}</Typography.Text>
                    <Typography.Text className={styles.cockpitRowMeta}>{action.id}</Typography.Text>
                    {action.owner && <Tag>{action.owner}</Tag>}
                  </div>
                  <div className={styles.cockpitRowActions}>
                    <Button
                      icon={<Play theme='outline' />}
                      loading={runningActionId === `dry-run:${action.id}`}
                      onClick={() => onDryRun(action)}
                    >
                      {t('common.runtime.dryRun')}
                    </Button>
                    <Button
                      type='primary'
                      icon={<Play theme='filled' />}
                      loading={runningActionId === `execute:${action.id}`}
                      disabled={action.dryRunRequired !== false && approvedActionId !== action.id}
                      onClick={() => onExecute(action)}
                    >
                      {t('common.runtime.execute')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {archivedAttempts.length > 0 && (
          <div className={styles.cockpitSection} data-testid='runtime-archived-attempts'>
            <Typography.Text className={styles.cockpitSectionTitle}>
              {t('common.runtime.archiveTask.archivedTitle')}
            </Typography.Text>
            <div className={styles.cockpitRows}>
              {archivedAttempts.map((attempt) => (
                <div className={styles.cockpitRow} key={attempt.stageAttemptId}>
                  <div className={styles.cockpitRowBody}>
                    <Typography.Text className={styles.cockpitRowTitle}>
                      {attempt.domainLabel} · {attempt.stageLabel}
                    </Typography.Text>
                    <Typography.Text className={styles.cockpitRowMeta}>
                      {attempt.archivedAt ?? attempt.stageAttemptId}
                    </Typography.Text>
                  </div>
                  <Button
                    loading={runningActionId === `restore:${attempt.stageAttemptId}`}
                    onClick={() => onRestore(attempt)}
                  >
                    {t('common.runtime.archiveTask.restore')}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {actionResult && (actionResult.preview || actionResult.receipt) && (
        <div className={styles.actionResult} data-testid='runtime-action-result'>
          <Typography.Text className={styles.cockpitSectionTitle}>{t('common.runtime.actionResult')}</Typography.Text>
          {actionResult.preview && (
            <Typography.Text className={styles.actionResultLine}>
              {t('common.runtime.actionPreviewSummary')}: {actionResult.preview}
            </Typography.Text>
          )}
          {actionResult.receipt && (
            <Typography.Text className={styles.actionResultLine}>
              {t('common.runtime.actionReceiptSummary')}: {actionResult.receipt}
            </Typography.Text>
          )}
        </div>
      )}
    </section>
  );
}
