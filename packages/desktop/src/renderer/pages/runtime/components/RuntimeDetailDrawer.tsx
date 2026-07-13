import { Drawer, Empty, Tabs, Tag, Typography } from '@arco-design/web-react';
import React from 'react';
import {
  elapsedSeconds,
  executionStateLabel,
  formatDuration,
  formatTimestamp,
  formatTokenObservation,
  primaryStatusLabel,
  type RuntimeTranslate,
} from '../formatters';
import type {
  RuntimeAgent,
  RuntimeCondition,
  RuntimeProject,
  RuntimeSourceRef,
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

export function RuntimeDetailDrawer({
  item,
  agent,
  project,
  generatedAt,
  locale,
  t,
  onClose,
}: RuntimeDetailDrawerProps) {
  return (
    <Drawer
      visible={Boolean(item)}
      width='min(720px, 100vw)'
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
            <Empty description={t('common.runtime.taskDetails.stageMapUnavailable')} />
          </section>

          <section className={styles.detailSection}>
            <Typography.Title heading={5}>{t('common.runtime.taskDetails.currentRun')}</Typography.Title>
            <div className={styles.detailFacts}>
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
                  {t('common.runtime.taskDetails.currentStage')}
                </Typography.Text>
                <Typography.Text className={styles.detailFactValue}>
                  {t('common.runtime.taskDetails.stageUnavailable')}
                </Typography.Text>
              </div>
              <div className={styles.detailFact}>
                <Typography.Text className={styles.detailFactLabel}>
                  {t('common.runtime.taskDetails.nextStage')}
                </Typography.Text>
                <Typography.Text className={styles.detailFactValue}>
                  {t('common.runtime.taskDetails.stageUnavailable')}
                </Typography.Text>
              </div>
              <div className={styles.detailFact}>
                <Typography.Text className={styles.detailFactLabel}>
                  {t('common.runtime.taskDetails.duration')}
                </Typography.Text>
                <Typography.Text className={styles.detailFactValue}>
                  {formatDuration(generatedAt ? elapsedSeconds(item, generatedAt) : null, t)}
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
              {item.action && <Tag>{t('common.runtime.actionKinds.system')}</Tag>}
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

          {item.primaryStatus === 'system_attention_required' && item.systemAttention && (
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

          <Tabs defaultActiveTab='artifacts' className={styles.detailTabs}>
            <Tabs.TabPane key='artifacts' title={t('common.runtime.taskDetails.artifacts')}>
              <Empty description={t('common.runtime.taskDetails.artifactsUnavailable')} />
            </Tabs.TabPane>
            <Tabs.TabPane key='timeline' title={t('common.runtime.taskDetails.timeline')}>
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
            </Tabs.TabPane>
            <Tabs.TabPane key='diagnostics' title={t('common.runtime.taskDetails.diagnostics')}>
              <div className={styles.telemetryReasons}>
                <TelemetryReason label={t('common.runtime.stageUsageLabel')} observation={item.stageUsage} />
                <TelemetryReason label={t('common.runtime.totalUsageLabel')} observation={item.taskUsage} />
              </div>
              <ConditionList conditions={item.conditions} t={t} />
              <SourceRefList refs={item.sourceRefs} t={t} />
            </Tabs.TabPane>
          </Tabs>
        </div>
      )}
    </Drawer>
  );
}
