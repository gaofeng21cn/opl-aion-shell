import { Alert, Button, Drawer, Tag, Typography } from '@arco-design/web-react';
import { Inbox, Undo } from '@icon-park/react';
import React from 'react';
import {
  currentStageLabel,
  formatTimestamp,
  formatTokenObservation,
  nextStageLabel,
  resolveRuntimeAction,
  stageDisplayName,
  stageStateLabel,
  type RuntimeTranslate,
} from '../formatters';
import type { RuntimeWorkItem } from '../types';
import styles from '../RuntimePage.module.css';
import { isScientificReasoningViewDescriptor } from '../scientificReasoning';
import { ScientificReasoningSummary } from './ScientificReasoningSummary';
import { resolveDomainDetailViewRenderer } from '../domainDetailViewRegistry';

type RuntimeDetailDrawerProps = {
  item: RuntimeWorkItem | null;
  locale: string;
  t: RuntimeTranslate;
  visibilityChanging: boolean;
  onOpenDomainDetailView: (item: RuntimeWorkItem, viewId: string) => void;
  onVisibilityChange: (state: 'visible' | 'archived') => void;
  onClose: () => void;
};

function StageMap({ item, locale, t }: { item: RuntimeWorkItem; locale: string; t: RuntimeTranslate }) {
  if (item.stageMap.length === 0) {
    return (
      <div className={styles.stageMapUnavailable} data-testid='runtime-stage-map-unavailable'>
        <Typography.Text>{t('common.runtime.taskDetails.stageMapUnavailable')}</Typography.Text>
      </div>
    );
  }
  return (
    <div className={styles.stageMap} data-testid='runtime-stage-map'>
      {item.stageMap.map((stage) => (
        <div
          className={styles.stageStep}
          data-stage-state={stage.state}
          data-testid='runtime-stage-step'
          key={stage.id}
        >
          <span className={styles.stageMarker} aria-hidden='true' />
          <div className={styles.stageStepBody}>
            <div className={styles.stageStepTitleRow}>
              <Typography.Text className={styles.stageStepTitle}>{stageDisplayName(stage, locale)}</Typography.Text>
              <Tag>{stageStateLabel(stage.state, t)}</Tag>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RuntimeDetailDrawer({
  item,
  locale,
  t,
  visibilityChanging,
  onOpenDomainDetailView,
  onVisibilityChange,
  onClose,
}: RuntimeDetailDrawerProps) {
  const resolvedAction = item?.action ? resolveRuntimeAction(item.action, t) : null;
  const archived = item?.visibility.state === 'archived';
  const reasoningDescriptor = item?.domainDetailViews.find(isScientificReasoningViewDescriptor);
  const unsupportedDescriptors = item?.domainDetailViews.filter(
    (descriptor) => !isScientificReasoningViewDescriptor(descriptor) && !resolveDomainDetailViewRenderer(descriptor)
  ) ?? [];
  return (
    <Drawer
      visible={Boolean(item)}
      width='min(680px, 100vw)'
      title={item ? t('common.runtime.taskDetails.title', { task: item.displayName }) : undefined}
      footer={null}
      onCancel={onClose}
      className={styles.detailDrawer}
      data-testid='runtime-task-detail'
    >
      {item && (
        <div className={styles.detailBody}>
          <section className={styles.detailSection}>
            <Typography.Title heading={5}>{t('common.runtime.taskDetails.stageMap')}</Typography.Title>
            <StageMap item={item} locale={locale} t={t} />
          </section>

          <section className={styles.detailSection}>
            <Typography.Title heading={5}>{t('common.runtime.taskDetails.stageAndRun')}</Typography.Title>
            <div className={styles.detailFacts}>
              <div className={styles.detailFact}>
                <Typography.Text className={styles.detailFactLabel}>
                  {t('common.runtime.taskDetails.currentStage')}
                </Typography.Text>
                <Typography.Text className={styles.detailFactValue} data-testid='runtime-current-stage'>
                  {currentStageLabel(item, locale, t)}
                </Typography.Text>
              </div>
              <div className={styles.detailFact}>
                <Typography.Text className={styles.detailFactLabel}>
                  {t('common.runtime.taskDetails.nextStage')}
                </Typography.Text>
                <Typography.Text className={styles.detailFactValue} data-testid='runtime-next-stage'>
                  {nextStageLabel(item, locale, t)}
                </Typography.Text>
              </div>
              <div className={styles.detailFact}>
                <Typography.Text className={styles.detailFactLabel}>
                  {t('common.runtime.taskDetails.currentAttempt')}
                </Typography.Text>
                {item.execution.attemptId ? (
                  <code className={styles.detailAttemptId}>{item.execution.attemptId}</code>
                ) : (
                  <Typography.Text className={styles.detailFactValue}>
                    {t('common.runtime.noActiveRun')}
                  </Typography.Text>
                )}
              </div>
              <div className={styles.detailFact}>
                <Typography.Text className={styles.detailFactLabel}>
                  {t('common.runtime.taskDetails.heartbeat')}
                </Typography.Text>
                <Typography.Text className={styles.detailFactValue}>
                  {formatTimestamp(item.execution.lastHeartbeatAt, locale, t)}
                </Typography.Text>
              </div>
              <div className={styles.detailFact}>
                <Typography.Text className={styles.detailFactLabel}>
                  {t('common.runtime.stageUsageLabel')}
                </Typography.Text>
                <Typography.Text className={styles.detailFactValue}>
                  {formatTokenObservation(item.stageUsage, locale, t)}
                </Typography.Text>
              </div>
              <div className={styles.detailFact}>
                <Typography.Text className={styles.detailFactLabel}>
                  {t('common.runtime.totalUsageLabel')}
                </Typography.Text>
                <Typography.Text className={styles.detailFactValue}>
                  {formatTokenObservation(item.taskUsage, locale, t)}
                </Typography.Text>
              </div>
            </div>
          </section>

          <section className={styles.detailSection} data-testid='runtime-next-action'>
            <Typography.Title heading={5}>{t('common.runtime.taskDetails.nextAction')}</Typography.Title>
            {item.action && resolvedAction ? (
              <>
                <Typography.Text className={styles.actionTitle}>{resolvedAction.title}</Typography.Text>
                <Typography.Text className={styles.actionSummary}>{resolvedAction.summary}</Typography.Text>
                <Typography.Text className={styles.actionOwner}>
                  {t('common.runtime.nextOwner', { owner: resolvedAction.owner })}
                </Typography.Text>
              </>
            ) : (
              <Typography.Text className={styles.actionSummary}>{t('common.runtime.noNextAction')}</Typography.Text>
            )}
          </section>

          {reasoningDescriptor && (
            <ScientificReasoningSummary
              descriptor={reasoningDescriptor}
              t={t}
              onOpen={() => onOpenDomainDetailView(item, reasoningDescriptor.viewId)}
            />
          )}

          {unsupportedDescriptors.map((descriptor) => (
            <section
              className={styles.detailSection}
              data-testid='runtime-domain-detail-view-unavailable'
              key={descriptor.viewId}
            >
              <Typography.Title heading={5}>
                {descriptor.title ?? t('common.runtime.domainDetailView.title')}
              </Typography.Title>
              <Alert
                type='info'
                showIcon
                title={t('common.runtime.domainDetailView.unsupportedTitle')}
                content={t('common.runtime.domainDetailView.unsupportedDescription')}
              />
            </section>
          ))}

          {item.primaryStatus === 'system_attention' && item.systemAttention && (
            <section className={styles.systemAttention} data-testid='runtime-system-attention'>
              <Typography.Title heading={5}>{t('common.runtime.systemAttention.title')}</Typography.Title>
              <dl className={styles.systemAttentionGrid}>
                <div>
                  <dt>{t('common.runtime.systemAttention.responsibleComponent')}</dt>
                  <dd>{item.systemAttention.responsibleComponent}</dd>
                </div>
                <div>
                  <dt>{t('common.runtime.systemAttention.issue')}</dt>
                  <dd>{item.systemAttention.issue}</dd>
                </div>
                <div>
                  <dt>{t('common.runtime.systemAttention.impact')}</dt>
                  <dd>{item.systemAttention.impact}</dd>
                </div>
                <div>
                  <dt>{t('common.runtime.systemAttention.repairAction')}</dt>
                  <dd>{item.systemAttention.repairAction}</dd>
                </div>
                <div>
                  <dt>{t('common.runtime.systemAttention.expectedOutcome')}</dt>
                  <dd>{item.systemAttention.expectedOutcome}</dd>
                </div>
              </dl>
            </section>
          )}

          <div className={styles.detailActions}>
            <Button
              type={archived ? 'primary' : 'default'}
              status={archived ? undefined : 'warning'}
              icon={archived ? <Undo theme='outline' /> : <Inbox theme='outline' />}
              loading={visibilityChanging}
              onClick={() => onVisibilityChange(archived ? 'visible' : 'archived')}
              data-testid={archived ? 'runtime-restore-work-item' : 'runtime-archive-work-item'}
            >
              {t(archived ? 'common.runtime.archivedTasks.restore' : 'common.runtime.archivedTasks.archive')}
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
