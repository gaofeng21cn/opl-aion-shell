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
      trim(task.workflow_ref) ||
      trim(task.gateway_status_ref) ||
      task.resource_source_refs?.some(trim) ||
      trim(task.environment_ref) ||
      trim(task.storage_ref) ||
      trim(task.resource_receipt_ref) ||
      trim(task.cost_estimate_ref))
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

type EvidenceItem = {
  label: string;
  value?: string;
  refValue?: string;
};

const hasEvidence = (items: EvidenceItem[]): boolean => items.some((item) => trim(item.value) || trim(item.refValue));

const EvidenceSection: React.FC<{ title: string; items: EvidenceItem[] }> = ({ title, items }) => {
  if (!hasEvidence(items)) return null;
  return (
    <div className='current-task-awareness__evidence-section'>
      <div className='current-task-awareness__section-title'>{title}</div>
      {items.map((item) => (
        <EvidenceLine key={`${item.label}:${item.value ?? item.refValue ?? ''}`} {...item} />
      ))}
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
  const resourceSources =
    task.resource_source_refs?.map((ref) => ({
      label: t('conversation.currentTask.resourceSource'),
      refValue: ref,
    })) ?? [];
  const workflowRef = trim(task.workflow_ref);
  const actionReceipt = trim(task.action_receipt_summary) ?? trim(task.action_receipt_ref);
  const gatewayStatusRef = trim(task.gateway_status_ref);
  const resourceReceiptRef = trim(task.resource_receipt_ref);

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
          <EvidenceSection
            title={t('conversation.currentTask.taskEvidence')}
            items={[
              {
                label: t('conversation.currentTask.artifact'),
                value: task.artifact_or_blocker_summary,
                refValue: task.artifact_or_blocker_ref,
              },
              {
                label: t('conversation.currentTask.review'),
                value: task.review_receipt_summary,
                refValue: task.review_receipt_ref,
              },
              {
                label: t('conversation.currentTask.action'),
                value: task.action_receipt_summary,
                refValue: task.action_receipt_ref,
              },
              { label: t('conversation.currentTask.workflow'), refValue: task.workflow_ref },
            ]}
          />
          <EvidenceSection
            title={t('conversation.currentTask.resourceSummary')}
            items={[
              { label: t('conversation.currentTask.gatewayStatus'), refValue: task.gateway_status_ref },
              ...resourceSources,
              { label: t('conversation.currentTask.environment'), refValue: task.environment_ref },
              { label: t('conversation.currentTask.storage'), refValue: task.storage_ref },
              { label: t('conversation.currentTask.costEstimate'), refValue: task.cost_estimate_ref },
            ]}
          />
          <EvidenceSection
            title={t('conversation.currentTask.resourceConfirmation')}
            items={[
              { label: t('conversation.currentTask.confirmPlan'), refValue: workflowRef },
              { label: t('conversation.currentTask.confirmApproval'), refValue: actionReceipt },
              { label: t('conversation.currentTask.confirmExecute'), refValue: actionReceipt },
              { label: t('conversation.currentTask.confirmMonitor'), refValue: gatewayStatusRef },
              { label: t('conversation.currentTask.confirmCollect'), refValue: resourceReceiptRef },
            ]}
          />
          <EvidenceSection
            title={t('conversation.currentTask.receiptProvenance')}
            items={[
              {
                label: t('conversation.currentTask.jobReceipt'),
                value: task.action_receipt_summary,
                refValue: task.action_receipt_ref,
              },
              { label: t('conversation.currentTask.resourceReceipt'), refValue: task.resource_receipt_ref },
              { label: t('conversation.currentTask.environment'), refValue: task.environment_ref },
              { label: t('conversation.currentTask.storage'), refValue: task.storage_ref },
              { label: t('conversation.currentTask.costEstimate'), refValue: task.cost_estimate_ref },
            ]}
          />
        </div>
      )}
    </section>
  );
};

export default CurrentTaskAwareness;
