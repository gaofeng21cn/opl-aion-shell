/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TConversationRuntimeSummary } from '@/common/config/storage';
import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';
import './current-task-awareness.css';

export type ConversationCurrentTask = NonNullable<TConversationRuntimeSummary['current_task']>;

type CurrentTaskAwarenessProps = {
  task?: ConversationCurrentTask | null;
  compact?: boolean;
};

const trim = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const next = value.trim();
  return next.length ? next : undefined;
};

export const hasCurrentTaskAwareness = (
  task: ConversationCurrentTask | null | undefined
): task is ConversationCurrentTask =>
  Boolean(
    task &&
    (trim(task.title) ||
      trim(task.stage) ||
      trim(task.progress) ||
      trim(task.next_owner) ||
      trim(task.next_step) ||
      trim(task.artifact_or_blocker_summary) ||
      trim(task.artifact_or_blocker_ref) ||
      trim(task.review_receipt_summary) ||
      trim(task.review_receipt_ref) ||
      trim(task.action_receipt_summary) ||
      trim(task.action_receipt_ref) ||
      trim(task.workflow_ref))
  );

const EvidenceLine: React.FC<{ label: string; value?: string; refValue?: string }> = ({ label, value, refValue }) => {
  const display = trim(value) ?? trim(refValue);
  if (!display) return null;
  return (
    <div className='current-task-awareness__evidence-line'>
      <span className='current-task-awareness__evidence-label'>{label}</span>
      <span className='current-task-awareness__evidence-value'>{display}</span>
    </div>
  );
};

const CurrentTaskAwareness: React.FC<CurrentTaskAwarenessProps> = ({ task, compact = false }) => {
  const { t } = useTranslation();
  if (!hasCurrentTaskAwareness(task)) return null;

  const title = trim(task.title) ?? trim(task.task_id) ?? t('conversation.currentTask.defaultTitle');
  const stage = trim(task.stage);
  const progress = trim(task.progress);
  const nextOwner = trim(task.next_owner);
  const nextStep = trim(task.next_step);

  return (
    <section
      className={classNames('current-task-awareness', {
        'current-task-awareness--compact': compact,
      })}
      data-testid={compact ? 'conversation-current-task-inline' : 'conversation-current-task-inspector'}
    >
      <div className='current-task-awareness__header'>
        <div className='current-task-awareness__kicker'>{t('conversation.currentTask.kicker')}</div>
        <div className='current-task-awareness__title'>{title}</div>
      </div>
      {(stage || progress || nextOwner || nextStep) && (
        <div className='current-task-awareness__meta'>
          {stage && <span>{stage}</span>}
          {progress && <span>{progress}</span>}
          {nextOwner && <span>{t('conversation.currentTask.owner', { owner: nextOwner })}</span>}
          {nextStep && <span>{nextStep}</span>}
        </div>
      )}
      {!compact && (
        <div className='current-task-awareness__evidence'>
          <EvidenceLine
            label={t('conversation.currentTask.artifact')}
            value={task.artifact_or_blocker_summary}
            refValue={task.artifact_or_blocker_ref}
          />
          <EvidenceLine
            label={t('conversation.currentTask.review')}
            value={task.review_receipt_summary}
            refValue={task.review_receipt_ref}
          />
          <EvidenceLine
            label={t('conversation.currentTask.action')}
            value={task.action_receipt_summary}
            refValue={task.action_receipt_ref}
          />
          <EvidenceLine label={t('conversation.currentTask.workflow')} refValue={task.workflow_ref} />
        </div>
      )}
    </section>
  );
};

export default CurrentTaskAwareness;
