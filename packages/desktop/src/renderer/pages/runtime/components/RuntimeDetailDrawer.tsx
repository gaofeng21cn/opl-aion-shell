import { Button, Collapse, Drawer, Empty, Tag, Typography } from '@arco-design/web-react';
import React from 'react';
import {
  actionKindLabel,
  currentStageLabel,
  executionStateLabel,
  formatDuration,
  formatItemElapsed,
  formatTimestamp,
  formatTokenObservation,
  nextStageLabel,
  primaryStatusLabel,
  stageMapUsageLabel,
  stageStateLabel,
  type RuntimeTranslate,
} from '../formatters';
import type {
  RuntimeAgent,
  RuntimeCondition,
  RuntimeProject,
  RuntimeSourceRef,
  RuntimeStage,
  RuntimeTokenObservation,
  RuntimeWorkItem,
} from '../types';
import styles from '../RuntimePage.module.css';

type RuntimeDetailDrawerProps = {
  item: RuntimeWorkItem | null;
  agent: RuntimeAgent | null;
  project: RuntimeProject | null;
  generatedAt: string | null;
  locale: string;
  t: RuntimeTranslate;
  canArchive: boolean;
  archiving: boolean;
  onArchive: () => void;
  onClose: () => void;
};

function TelemetryReason({ label, observation }: { label: string; observation: RuntimeTokenObservation }) {
  if (observation.state === 'observed') return null;
  return (
    <div className={styles.telemetryReason}>
      <Typography.Text className={styles.detailEntryLabel}>{label}</Typography.Text>
      <Typography.Text className={styles.detailEntryRef}>{observation.reason}</Typography.Text>
    </div>
  );
}

function ConditionList({ conditions, t }: { conditions: RuntimeCondition[]; t: RuntimeTranslate }) {
  if (conditions.length === 0) return <Empty description={t('common.runtime.taskDetails.noItems')} />;
  return (
    <div className={styles.detailEntries}>
      {conditions.map((condition, index) => (
        <div className={styles.detailEntry} key={`${condition.type}:${index}`}>
          <Typography.Text className={styles.detailEntryLabel}>{condition.message}</Typography.Text>
          <Typography.Text className={styles.detailEntrySummary}>
            {t('common.runtime.taskDetails.conditionOwner', { owner: condition.owner })}
          </Typography.Text>
          <Typography.Text className={styles.detailEntryRef}>
            {condition.type} · {condition.reason}
          </Typography.Text>
        </div>
      ))}
    </div>
  );
}

function SourceRefList({ refs, t }: { refs: RuntimeSourceRef[]; t: RuntimeTranslate }) {
  if (refs.length === 0) return null;
  return (
    <div className={styles.detailEntries}>
      <Typography.Text className={styles.detailGroupLabel}>
        {t('common.runtime.taskDetails.sourceRefs')}
      </Typography.Text>
      {refs.map((entry, index) => (
        <div className={styles.detailEntry} key={`${entry.role}:${index}`}>
          <Typography.Text className={styles.detailEntryLabel}>{entry.role}</Typography.Text>
          <Typography.Text className={styles.detailEntryRef}>{entry.ref}</Typography.Text>
        </div>
      ))}
    </div>
  );
}

function StageMeta({ stage, locale, t }: { stage: RuntimeStage; locale: string; t: RuntimeTranslate }) {
  const usage = stageMapUsageLabel(stage, locale, t);
  return (
    <div className={styles.stageMeta}>
      {stage.ownerDisplayName && (
        <Typography.Text>{t('common.runtime.nextOwner', { owner: stage.ownerDisplayName })}</Typography.Text>
      )}
      {stage.elapsedSeconds !== null && (
        <Typography.Text>
          {t('common.runtime.elapsedValue', { value: formatDuration(stage.elapsedSeconds, t) })}
        </Typography.Text>
      )}
      {usage && <Typography.Text>{t('common.runtime.stageUsage', { value: usage })}</Typography.Text>}
      {stage.nextAction && (
        <Typography.Text>{t('common.runtime.nextStep', { step: stage.nextAction })}</Typography.Text>
      )}
    </div>
  );
}

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
              <Typography.Text className={styles.stageStepTitle}>{stage.displayName}</Typography.Text>
              <Tag>{stageStateLabel(stage.state, t)}</Tag>
            </div>
            <StageMeta stage={stage} locale={locale} t={t} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RuntimeDetailDrawer({
  item,
  agent,
  project,
  generatedAt,
  locale,
  t,
  canArchive,
  archiving,
  onArchive,
  onClose,
}: RuntimeDetailDrawerProps) {
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
          <div className={styles.detailIdentity}>
            <Typography.Text className={styles.detailProject}>{project?.displayName}</Typography.Text>
            <Typography.Text className={styles.detailAgent}>{agent?.displayName}</Typography.Text>
            <Tag data-runtime-status={item.primaryStatus}>{primaryStatusLabel(item.primaryStatus, t)}</Tag>
          </div>

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
                <Typography.Text className={styles.detailFactValue}>{currentStageLabel(item, t)}</Typography.Text>
              </div>
              <div className={styles.detailFact}>
                <Typography.Text className={styles.detailFactLabel}>
                  {t('common.runtime.taskDetails.nextStage')}
                </Typography.Text>
                <Typography.Text className={styles.detailFactValue}>{nextStageLabel(item, t)}</Typography.Text>
              </div>
              <div className={styles.detailFact}>
                <Typography.Text className={styles.detailFactLabel}>
                  {t('common.runtime.taskDetails.currentProgress')}
                </Typography.Text>
                <Typography.Text className={styles.detailFactValue}>
                  {executionStateLabel(item.execution.state, t)}
                </Typography.Text>
              </div>
              <div className={styles.detailFact}>
                <Typography.Text className={styles.detailFactLabel}>
                  {t('common.runtime.taskDetails.duration')}
                </Typography.Text>
                <Typography.Text className={styles.detailFactValue}>
                  {generatedAt ? formatItemElapsed(item, generatedAt, t) : t('common.runtime.timeNotRecorded')}
                </Typography.Text>
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
            <div className={styles.sectionTitleRow}>
              <Typography.Title heading={5}>{t('common.runtime.taskDetails.nextAction')}</Typography.Title>
              {item.action && <Tag>{actionKindLabel(item.action.kind, t)}</Tag>}
            </div>
            {item.action ? (
              <>
                <Typography.Text className={styles.actionTitle}>{item.action.title}</Typography.Text>
                <Typography.Text className={styles.actionSummary}>{item.action.summary}</Typography.Text>
                <Typography.Text className={styles.actionOwner}>
                  {t('common.runtime.nextOwner', { owner: item.action.ownerDisplayName })}
                </Typography.Text>
              </>
            ) : (
              <Typography.Text className={styles.actionSummary}>{t('common.runtime.noNextAction')}</Typography.Text>
            )}
          </section>

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

          <Collapse bordered={false} className={styles.detailDisclosure} data-testid='runtime-detail-disclosure'>
            <Collapse.Item name='artifacts' header={t('common.runtime.taskDetails.artifacts')}>
              <Empty description={t('common.runtime.taskDetails.artifactsUnavailable')} />
            </Collapse.Item>
            <Collapse.Item name='timeline' header={t('common.runtime.taskDetails.timeline')}>
              <div className={styles.detailEntries}>
                {item.timeline.map((entry) => (
                  <div className={styles.detailEntry} key={entry.id}>
                    <Typography.Text className={styles.detailEntryLabel}>
                      {t(`common.runtime.taskDetails.timelineEvents.${entry.id}`)}
                    </Typography.Text>
                    <Typography.Text className={styles.detailEntryMeta}>
                      {formatTimestamp(entry.timestamp, locale, t)}
                    </Typography.Text>
                  </div>
                ))}
              </div>
            </Collapse.Item>
            <Collapse.Item name='evidence' header={t('common.runtime.taskDetails.evidence')}>
              {item.sourceRefs.length > 0 ? (
                <SourceRefList refs={item.sourceRefs} t={t} />
              ) : (
                <Empty description={t('common.runtime.taskDetails.noItems')} />
              )}
            </Collapse.Item>
            <Collapse.Item name='diagnostics' header={t('common.runtime.taskDetails.diagnostics')}>
              <div className={styles.telemetryReasons}>
                <TelemetryReason label={t('common.runtime.stageUsageLabel')} observation={item.stageUsage} />
                <TelemetryReason label={t('common.runtime.totalUsageLabel')} observation={item.taskUsage} />
              </div>
              <ConditionList conditions={item.conditions} t={t} />
            </Collapse.Item>
          </Collapse>

          {canArchive && (
            <div className={styles.detailActions}>
              <Button status='warning' loading={archiving} onClick={onArchive} data-testid='runtime-archive-attempt'>
                {t('common.runtime.archiveTask.confirm')}
              </Button>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
