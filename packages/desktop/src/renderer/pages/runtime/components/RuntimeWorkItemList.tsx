import { Empty, Tag, Typography } from '@arco-design/web-react';
import { Right } from '@icon-park/react';
import React from 'react';
import {
  currentStageLabel,
  executionStateLabel,
  formatItemElapsed,
  formatTokenObservation,
  nextStageLabel,
  primaryStatusLabel,
  type RuntimeTranslate,
} from '../formatters';
import type { RuntimeAgent, RuntimeProject, RuntimeWorkItem } from '../types';
import styles from '../RuntimePage.module.css';

type RuntimeWorkItemListProps = {
  items: RuntimeWorkItem[];
  agentsById: Map<string, RuntimeAgent>;
  projectsById: Map<string, RuntimeProject>;
  locale: string;
  generatedAt: string;
  t: RuntimeTranslate;
  onOpen: (item: RuntimeWorkItem) => void;
};

export function RuntimeWorkItemList({
  items,
  agentsById,
  projectsById,
  locale,
  generatedAt,
  t,
  onOpen,
}: RuntimeWorkItemListProps) {
  if (items.length === 0) {
    return <Empty className={styles.emptyState} description={t('common.runtime.noTasksInScope')} />;
  }

  return (
    <section className={styles.workItemList} data-testid='runtime-work-item-list'>
      <div className={styles.workItemHeader} data-testid='runtime-work-item-grid-header' data-responsive-columns='4'>
        <Typography.Text>{t('common.runtime.taskField.projectPaper')}</Typography.Text>
        <Typography.Text>{t('common.runtime.taskField.status')}</Typography.Text>
        <Typography.Text>{t('common.runtime.taskField.progressNext')}</Typography.Text>
        <Typography.Text>{t('common.runtime.taskField.timeUsage')}</Typography.Text>
      </div>
      <div className={styles.workItemRows}>
        {items.map((item) => {
          const agent = agentsById.get(item.agentId);
          const project = projectsById.get(item.projectId);
          return (
            <article
              className={styles.workItemRow}
              data-testid='runtime-task-row'
              key={item.id}
              role='button'
              tabIndex={0}
              aria-label={t('common.runtime.taskDetails.openNamed', { task: item.displayName })}
              onClick={() => onOpen(item)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onOpen(item);
                }
              }}
            >
              <div className={styles.workItemIdentity}>
                <Typography.Text className={styles.projectName}>{project?.displayName}</Typography.Text>
                <div className={styles.workItemTitleLine}>
                  <Typography.Text className={styles.workItemTitle}>{item.displayName}</Typography.Text>
                  <span className={styles.rowDisclosureIcon} aria-hidden='true'>
                    <Right theme='outline' />
                  </span>
                </div>
                <Typography.Text className={styles.agentLabel}>{agent?.displayName}</Typography.Text>
              </div>

              <div className={styles.workItemStatus}>
                <Tag data-runtime-status={item.primaryStatus}>{primaryStatusLabel(item.primaryStatus, t)}</Tag>
                {['running', 'queued'].includes(item.execution.state) && (
                  <Typography.Text className={styles.executionLabel}>
                    {executionStateLabel(item.execution.state, t)}
                  </Typography.Text>
                )}
                {item.primaryStatus === 'system_attention' && item.systemAttention && (
                  <Typography.Text className={styles.attentionSummary}>
                    {t('common.runtime.systemAttention.rowSummary', {
                      component: item.systemAttention.responsibleComponent,
                      issue: item.systemAttention.issue,
                    })}
                  </Typography.Text>
                )}
                {item.statusSyncReason && (
                  <Typography.Text className={styles.attentionSummary}>
                    {t('common.runtime.projection.incompleteSystemAttention')}
                  </Typography.Text>
                )}
              </div>

              <div className={styles.workItemProgress}>
                <Typography.Text className={styles.progressLabel}>
                  {t('common.runtime.currentStage', {
                    stage: currentStageLabel(item, t),
                  })}
                </Typography.Text>
                <Typography.Text className={styles.nextLabel}>
                  {t('common.runtime.nextStep', { step: nextStageLabel(item, t) })}
                </Typography.Text>
                {item.action && (
                  <Typography.Text className={styles.ownerLabel}>
                    {t('common.runtime.nextOwner', { owner: item.action.ownerDisplayName })}
                  </Typography.Text>
                )}
              </div>

              <div className={styles.workItemTelemetry}>
                <Typography.Text className={styles.durationLabel}>
                  {t('common.runtime.elapsedValue', {
                    value: formatItemElapsed(item, generatedAt, t),
                  })}
                </Typography.Text>
                <dl className={styles.usagePair}>
                  <div>
                    <dt>{t('common.runtime.stageUsageShort')}</dt>
                    <dd>{formatTokenObservation(item.stageUsage, locale, t)}</dd>
                  </div>
                  <div>
                    <dt>{t('common.runtime.totalUsageShort')}</dt>
                    <dd>{formatTokenObservation(item.taskUsage, locale, t)}</dd>
                  </div>
                </dl>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
