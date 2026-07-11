/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TConversationRuntimeSummary } from '@/common/config/storage';
import { Button, Tooltip } from '@arco-design/web-react';
import { Down, PauseOne, Pushpin, Up } from '@icon-park/react';
import classNames from 'classnames';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './current-task-awareness.css';

export type ConversationCurrentTask = NonNullable<TConversationRuntimeSummary['current_task']>;

type CurrentTaskAwarenessProps = {
  task?: ConversationCurrentTask | null;
  compact?: boolean;
  statusLabel?: string;
  stopDisabled?: boolean;
  onStop?: () => Promise<unknown> | unknown;
};

type CurrentTaskV2Card = Record<string, unknown>;
type JsonRecord = Record<string, unknown>;

type ConversationCurrentTaskV2 = ConversationCurrentTask & {
  conditions?: CurrentTaskV2Card[];
  evidence_cards?: CurrentTaskV2Card[];
  action_cards?: CurrentTaskV2Card[];
  resource_cards?: CurrentTaskV2Card[];
  diagnostics_ref?: string;
  progress_label?: string;
  plan_ref?: string;
  latest_receipt_ref?: string;
  latest_artifact_ref?: string;
  task_identity?: unknown;
  status?: unknown;
  artifact_or_blocker?: unknown;
  review_receipt?: unknown;
  action_receipt?: unknown;
  workflow_refs?: unknown;
  export_bundle_action_ref?: unknown;
  lineage_refs?: unknown;
  artifact_native_drilldown?: unknown;
  provenance_drawer?: unknown;
  provenance_bundle_refs?: unknown;
  provenance_refs?: unknown;
  structured_follow_up?: unknown;
  structured_followup?: unknown;
  request_change?: unknown;
  request_change_card?: unknown;
  elapsed?: unknown;
  elapsed_label?: unknown;
  duration_label?: unknown;
  timing?: unknown;
  long_running?: unknown;
};

export type CurrentTaskReferenceSummary = {
  artifacts: string[];
  evidence: string[];
  receipts: string[];
  sources: string[];
};

const SUMMARY_KEYS = ['summary', 'message', 'reason', 'why_it_matters', 'owner', 'status', 'status_label', 'label'];
const RESULT_KEYS = ['status_label', 'status', 'state', 'priority_bucket', 'progress_label', 'current_step'];
const REF_KEYS = [
  'ref',
  'refs',
  'summary_ref',
  'status_ref',
  'dry_run_ref',
  'execute_ref',
  'action_ref',
  'action_receipt',
  'receipt_ref',
  'rollback_ref',
  'verify_ref',
  'environment_ref',
  'usage_ref',
  'quota_ref',
  'billing_ref',
  'permission_ref',
  'cost_estimate_ref',
  'plan_ref',
  'latest_receipt_ref',
  'latest_artifact_ref',
  'projection_ref',
  'provenance_projection_ref',
  'provenance_index_ref',
  'ro_crate_metadata_ref',
  'replay_status_ref',
  'hash_ref',
  'content_hash_ref',
  'content_hash_refs',
  'lineage_refs',
  'workflow_refs',
  'provenance_bundle_refs',
  'agent_trace_refs',
  'review_refs',
  'action_refs',
  'resource_source_refs',
  'source_refs',
  'typed_issues',
  'route',
  'payload_ref',
  'open_action',
  'expected_output',
];

const trim = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const next = value.trim();
  return next.length ? next : undefined;
};

const record = (value: unknown): JsonRecord | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : undefined;

const cardList = (value: unknown): CurrentTaskV2Card[] =>
  Array.isArray(value) ? value.filter((entry): entry is CurrentTaskV2Card => Boolean(record(entry))) : [];

const firstCardText = (card: CurrentTaskV2Card, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = trim(card[key]);
    if (value) return value;
  }
  return undefined;
};

const recordText = (value: unknown, keys: string[]): string | undefined => {
  const entry = record(value);
  if (!entry) return trim(value);
  for (const key of keys) {
    const result = trim(entry[key]);
    if (result) return result;
  }
  return undefined;
};

const unique = (values: string[]): string[] => Array.from(new Set(values));

const refTexts = (value: unknown, keys = REF_KEYS): string[] => {
  const direct = trim(value);
  if (direct) return [direct];
  if (Array.isArray(value)) return unique(value.flatMap((entry) => refTexts(entry, keys)));
  const entry = record(value);
  if (!entry) return [];
  return unique(
    keys.flatMap((key) => {
      const field = entry[key];
      if (Array.isArray(field)) return field.flatMap((item) => refTexts(item, keys));
      const text = trim(field);
      if (text) return [text];
      return record(field) ? refTexts(field, keys) : [];
    })
  );
};

export const summarizeCurrentTaskReferences = (
  task: ConversationCurrentTask | null | undefined
): CurrentTaskReferenceSummary => {
  if (!task) return { artifacts: [], evidence: [], receipts: [], sources: [] };

  const taskV2 = task as ConversationCurrentTaskV2;
  const taskRecord = task as unknown as JsonRecord;
  const artifactNativeDrilldown = record(taskV2.artifact_native_drilldown);
  const evidenceCards = cardList(taskV2.evidence_cards);
  const conditionCards = cardList(taskV2.conditions);
  const resourceCards = cardList(taskV2.resource_cards);

  return {
    artifacts: unique([
      ...refTexts(task.artifact_or_blocker_ref),
      ...refTexts(taskV2.latest_artifact_ref),
      ...refTexts(taskV2.artifact_or_blocker),
      ...refTexts(taskV2.lineage_refs),
      ...refTexts(taskV2.provenance_bundle_refs),
      ...refTexts(taskV2.provenance_refs),
      ...refTexts(artifactNativeDrilldown?.provenance_bundle_refs),
      ...refTexts(artifactNativeDrilldown?.provenance_index_ref),
      ...refTexts(artifactNativeDrilldown?.ro_crate_metadata_ref),
      ...refTexts(artifactNativeDrilldown?.content_hash_refs),
    ]),
    evidence: unique([
      ...evidenceCards.flatMap((card) => refTexts(card)),
      ...conditionCards.flatMap((card) => refTexts(card)),
      ...refTexts(taskV2.diagnostics_ref),
      ...refTexts(artifactNativeDrilldown?.agent_trace_refs),
      ...refTexts(artifactNativeDrilldown?.review_refs),
      ...refTexts(artifactNativeDrilldown?.typed_issues),
    ]),
    receipts: unique([
      ...refTexts(task.review_receipt_ref),
      ...refTexts(task.action_receipt_ref),
      ...refTexts(task.resource_receipt_ref),
      ...refTexts(taskV2.latest_receipt_ref),
      ...refTexts(taskV2.review_receipt),
      ...refTexts(taskV2.action_receipt),
    ]),
    sources: unique([
      ...refTexts(task.resource_source_refs),
      ...refTexts(taskRecord.source_refs),
      ...evidenceCards.flatMap((card) => refTexts(card.source_refs)),
      ...resourceCards.flatMap((card) => refTexts(card.source_refs)),
    ]),
  };
};

const evidenceItemsFromValue = (
  label: string,
  value: unknown,
  valueKeys = SUMMARY_KEYS,
  refKeys = REF_KEYS
): EvidenceItem[] => {
  if (Array.isArray(value)) return value.flatMap((entry) => evidenceItemsFromValue(label, entry, valueKeys, refKeys));
  const displayValue = record(value) ? recordText(value, valueKeys) : undefined;
  const refs = refTexts(value, refKeys);
  if (!displayValue && refs.length === 0) return [];
  if (refs.length === 0) return [{ label, value: displayValue }];
  return refs.map((refValue, index) => ({
    label,
    value: index === 0 ? displayValue : undefined,
    refValue,
  }));
};

const cardsToEvidenceItems = (cards: CurrentTaskV2Card[], fallbackLabel: string): EvidenceItem[] =>
  cards.flatMap((card, index): EvidenceItem[] => {
    const refs = unique([
      ...refTexts(card),
      ...refTexts(card.source_refs),
      ...refTexts(card.lineage_refs),
      ...refTexts(card.review_refs),
      ...refTexts(card.action_refs),
      ...refTexts(card.content_hash_refs),
    ]);
    const label = firstCardText(card, ['title', 'label', 'kind', 'type', 'resource_kind']) ?? fallbackLabel;
    const value =
      firstCardText(card, SUMMARY_KEYS) ??
      recordText(card.risk, ['mutation_policy', 'authority_boundary']) ??
      (refs.length ? undefined : label !== fallbackLabel ? label : undefined);
    if (!value && refs.length === 0) return [];
    if (refs.length === 0) return [{ label, value: value ?? `${fallbackLabel} ${index + 1}` }];
    return refs.map((refValue, refIndex) => ({
      label,
      refValue,
      value: refIndex === 0 ? value : undefined,
    }));
  });

export const hasCurrentTaskAwareness = (
  task: ConversationCurrentTask | null | undefined
): task is ConversationCurrentTask => {
  if (!task) return false;
  const taskV2 = task as ConversationCurrentTaskV2;
  return Boolean(
    trim(task.title) ||
    trim(task.stage) ||
    trim(task.progress) ||
    trim(taskV2.progress_label) ||
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
    trim(task.cost_estimate_ref) ||
    recordText(taskV2.status, RESULT_KEYS) ||
    recordText(taskV2.task_identity, ['task_id', 'label', 'ref']) ||
    refTexts(taskV2.plan_ref).length > 0 ||
    refTexts(taskV2.latest_receipt_ref).length > 0 ||
    refTexts(taskV2.latest_artifact_ref).length > 0 ||
    recordText(taskV2.artifact_or_blocker, SUMMARY_KEYS) ||
    refTexts(taskV2.artifact_or_blocker).length > 0 ||
    recordText(taskV2.review_receipt, SUMMARY_KEYS) ||
    refTexts(taskV2.review_receipt).length > 0 ||
    recordText(taskV2.action_receipt, SUMMARY_KEYS) ||
    refTexts(taskV2.action_receipt).length > 0 ||
    refTexts(taskV2.workflow_refs).length > 0 ||
    refTexts(taskV2.export_bundle_action_ref).length > 0 ||
    refTexts(taskV2.lineage_refs).length > 0 ||
    refTexts(taskV2.artifact_native_drilldown).length > 0 ||
    refTexts(taskV2.provenance_drawer).length > 0 ||
    refTexts(taskV2.provenance_bundle_refs).length > 0 ||
    refTexts(taskV2.provenance_refs).length > 0 ||
    cardList(taskV2.conditions).length > 0 ||
    cardList(taskV2.evidence_cards).length > 0 ||
    cardList(taskV2.action_cards).length > 0 ||
    cardList(taskV2.resource_cards).length > 0 ||
    trim(taskV2.diagnostics_ref)
  );
};

const EvidenceLine: React.FC<{ label: string; value?: string; refValue?: string }> = ({ label, value, refValue }) => {
  const displayValue = trim(value);
  const displayRef = trim(refValue);
  if (!displayValue && !displayRef) return null;
  return (
    <div className='current-task-awareness__evidence-line'>
      <span className='current-task-awareness__evidence-label'>{label}</span>
      <span className='current-task-awareness__evidence-value'>
        {[displayValue, displayRef].filter(Boolean).join(' · ')}
      </span>
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
      {items.map((item, index) => (
        <EvidenceLine key={`${item.label}:${item.value ?? item.refValue ?? ''}:${index}`} {...item} />
      ))}
    </div>
  );
};

const EvidenceBlock: React.FC<{ title: string; text?: string }> = ({ title, text }) => {
  const value = trim(text);
  if (!value) return null;
  return (
    <div className='current-task-awareness__evidence-section'>
      <div className='current-task-awareness__section-title'>{title}</div>
      <pre className='current-task-awareness__follow-up'>{value}</pre>
    </div>
  );
};

const CurrentTaskAwareness: React.FC<CurrentTaskAwarenessProps> = ({
  task,
  compact = false,
  statusLabel,
  stopDisabled = false,
  onStop,
}) => {
  const { t } = useTranslation();
  const taskV2 = (task ?? {}) as ConversationCurrentTaskV2;
  const taskKey = trim(task?.task_id) ?? trim(task?.title) ?? '';
  const timingRecord = record(taskV2.timing);
  const runtimePinned = taskV2.long_running === true || timingRecord?.long_running === true;
  const [expanded, setExpanded] = useState(!compact);
  const [pinned, setPinned] = useState(runtimePinned);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    setPinned(runtimePinned);
  }, [runtimePinned, taskKey]);

  if (!hasCurrentTaskAwareness(task)) return null;

  const taskRecord = task as unknown as JsonRecord;
  const statusRecord = record(taskV2.status);
  const progressRecord = record(taskRecord.progress);
  const artifactNativeDrilldown = record(taskV2.artifact_native_drilldown);
  const provenanceDrawer = record(taskV2.provenance_drawer) ?? record(artifactNativeDrilldown?.provenance_drawer);
  const title = trim(task.title) ?? trim(task.task_id) ?? t('conversation.currentTask.defaultTitle');
  const status = statusLabel ?? recordText(taskV2.status, ['status_label', 'status', 'state', 'priority_bucket']);
  const stage = trim(task.stage) ?? recordText(statusRecord, ['active_stage_label', 'active_stage_id']);
  const elapsed =
    trim(taskV2.elapsed_label) ??
    trim(taskV2.duration_label) ??
    trim(taskV2.elapsed) ??
    recordText(taskV2.timing, ['elapsed_label', 'duration_label', 'elapsed', 'duration']);
  const progress =
    trim(task.progress) ??
    trim(taskV2.progress_label) ??
    recordText(progressRecord, ['progress_label', 'current_step', 'progress_ref']);
  const nextOwner = trim(task.next_owner) ?? recordText(taskV2.task_identity, ['current_owner', 'owner']);
  const nextStep =
    trim(task.next_step) ??
    recordText(progressRecord, ['current_step']) ??
    recordText(taskV2.task_identity, ['required_delta']);
  const resourceSources = refTexts(task.resource_source_refs).map((ref) => ({
    label: t('conversation.currentTask.resourceSource'),
    refValue: ref,
  }));
  const artifactOrBlocker = {
    summary: task.artifact_or_blocker_summary,
    ref: task.artifact_or_blocker_ref,
  };
  const reviewReceipt = {
    summary: task.review_receipt_summary,
    ref: task.review_receipt_ref,
  };
  const actionReceipt = {
    summary: task.action_receipt_summary,
    ref: task.action_receipt_ref,
  };
  const workflowRefs = trim(task.workflow_ref) ?? taskV2.workflow_refs;
  const conditionItems = cardsToEvidenceItems(cardList(taskV2.conditions), t('conversation.currentTask.condition'));
  const evidenceItems = cardsToEvidenceItems(cardList(taskV2.evidence_cards), t('conversation.currentTask.evidence'));
  const actionItems = cardsToEvidenceItems(cardList(taskV2.action_cards), t('conversation.currentTask.action'));
  const resourceItems = cardsToEvidenceItems(cardList(taskV2.resource_cards), t('conversation.currentTask.resource'));
  const followUpSource =
    taskV2.structured_follow_up ?? taskV2.structured_followup ?? taskV2.request_change ?? taskV2.request_change_card;
  const explicitFollowUp = recordText(followUpSource, ['text', 'message', 'summary', 'comment']);
  const followUpRefs = [
    ...evidenceItemsFromValue(t('conversation.currentTask.artifact'), taskV2.artifact_or_blocker ?? artifactOrBlocker),
    ...evidenceItemsFromValue(t('conversation.currentTask.review'), taskV2.review_receipt ?? reviewReceipt),
    ...evidenceItemsFromValue(t('conversation.currentTask.action'), taskV2.action_receipt ?? actionReceipt),
    ...evidenceItemsFromValue(t('conversation.currentTask.workflow'), workflowRefs),
  ].filter((item) => trim(item.refValue));
  const generatedFollowUp =
    followUpRefs.length > 0
      ? [
          t('conversation.currentTask.requestChangePrompt'),
          ...followUpRefs.map((item) => `${item.label}: ${item.refValue}`),
          nextStep ? `${t('conversation.currentTask.nextStep')}: ${nextStep}` : undefined,
        ]
          .filter((line): line is string => Boolean(line))
          .join('\n')
      : undefined;
  const followUpText = explicitFollowUp ?? generatedFollowUp;
  const unavailable = t('conversation.currentTask.unavailable');
  const handleStop = async () => {
    if (!onStop || stopDisabled || stopping) return;
    setStopping(true);
    try {
      await onStop();
    } catch (error) {
      console.warn('[CurrentTaskAwareness] stop request failed', error);
    } finally {
      setStopping(false);
    }
  };

  return (
    <section
      className={classNames('current-task-awareness', {
        'current-task-awareness--compact': compact,
        'current-task-awareness--pinned': pinned,
        'current-task-awareness--expanded': expanded,
      })}
      data-testid={compact ? 'conversation-current-task-inline' : 'conversation-current-task-inspector'}
    >
      <div className='current-task-awareness__summary'>
        <div className='current-task-awareness__header'>
          <div className='current-task-awareness__kicker'>{t('conversation.currentTask.kicker')}</div>
          <div className='current-task-awareness__title'>{title}</div>
        </div>
        <div className='current-task-awareness__summary-fields'>
          <span>
            <b>{t('conversation.currentTask.status')}</b>
            {status ?? unavailable}
          </span>
          <span>
            <b>{t('conversation.currentTask.elapsed')}</b>
            {elapsed ?? unavailable}
          </span>
          <span>
            <b>{t('conversation.currentTask.progress')}</b>
            {progress ?? stage ?? unavailable}
          </span>
          <span>
            <b>{t('conversation.currentTask.nextAction')}</b>
            {nextStep ?? unavailable}
          </span>
        </div>
        {compact && (
          <div className='current-task-awareness__controls'>
            <Tooltip content={pinned ? t('conversation.currentTask.unpin') : t('conversation.currentTask.pin')} mini>
              <Button
                type='text'
                size='mini'
                icon={<Pushpin size={14} />}
                aria-label={pinned ? t('conversation.currentTask.unpin') : t('conversation.currentTask.pin')}
                aria-pressed={pinned}
                onClick={() => setPinned((value) => !value)}
              />
            </Tooltip>
            <Tooltip
              content={expanded ? t('conversation.currentTask.collapse') : t('conversation.currentTask.expand')}
              mini
            >
              <Button
                type='text'
                size='mini'
                icon={expanded ? <Up size={14} /> : <Down size={14} />}
                aria-label={expanded ? t('conversation.currentTask.collapse') : t('conversation.currentTask.expand')}
                aria-expanded={expanded}
                onClick={() => setExpanded((value) => !value)}
              />
            </Tooltip>
            <Tooltip
              content={
                onStop && !stopDisabled
                  ? t('conversation.currentTask.stop')
                  : t('conversation.currentTask.stopUnavailable')
              }
              mini
            >
              <Button
                type='text'
                status='danger'
                size='mini'
                icon={<PauseOne size={14} />}
                aria-label={t('conversation.currentTask.stop')}
                disabled={!onStop || stopDisabled}
                loading={stopping}
                onClick={() => void handleStop()}
              />
            </Tooltip>
          </div>
        )}
      </div>
      {expanded && (stage || nextOwner) && (
        <div className='current-task-awareness__meta'>
          {stage && <span>{stage}</span>}
          {nextOwner && <span>{t('conversation.currentTask.owner', { owner: nextOwner })}</span>}
        </div>
      )}
      {expanded && (
        <div className='current-task-awareness__evidence'>
          <EvidenceSection
            title={t('conversation.currentTask.result')}
            items={[
              { label: t('conversation.currentTask.status'), value: status },
              { label: t('conversation.currentTask.stage'), value: stage },
              { label: t('conversation.currentTask.progress'), value: progress },
              { label: t('conversation.currentTask.ownerLabel'), value: nextOwner },
              { label: t('conversation.currentTask.nextStep'), value: nextStep },
              ...evidenceItemsFromValue(t('conversation.currentTask.taskIdentity'), taskV2.task_identity, [
                'task_id',
                'label',
                'summary',
              ]),
              ...conditionItems,
            ]}
          />
          <EvidenceSection
            title={t('conversation.currentTask.artifactsProvenanceRefs')}
            items={[
              ...evidenceItems,
              ...evidenceItemsFromValue(
                t('conversation.currentTask.artifact'),
                taskV2.artifact_or_blocker ?? artifactOrBlocker
              ),
              ...evidenceItemsFromValue(t('conversation.currentTask.latestArtifact'), taskV2.latest_artifact_ref),
              ...evidenceItemsFromValue(
                t('conversation.currentTask.exportBundleAction'),
                taskV2.export_bundle_action_ref
              ),
              ...evidenceItemsFromValue(t('conversation.currentTask.lineage'), taskV2.lineage_refs),
              ...evidenceItemsFromValue(
                t('conversation.currentTask.provenanceBundle'),
                taskV2.provenance_bundle_refs ??
                  artifactNativeDrilldown?.provenance_bundle_refs ??
                  taskV2.provenance_refs
              ),
              ...evidenceItemsFromValue(
                t('conversation.currentTask.provenanceIndex'),
                artifactNativeDrilldown?.provenance_index_ref
              ),
              ...evidenceItemsFromValue(
                t('conversation.currentTask.roCrateMetadata'),
                artifactNativeDrilldown?.ro_crate_metadata_ref
              ),
              ...evidenceItemsFromValue(
                t('conversation.currentTask.replayStatus'),
                artifactNativeDrilldown?.replay_status_ref
              ),
              ...evidenceItemsFromValue(
                t('conversation.currentTask.agentTrace'),
                artifactNativeDrilldown?.agent_trace_refs
              ),
              ...evidenceItemsFromValue(t('conversation.currentTask.reviewRef'), artifactNativeDrilldown?.review_refs),
              ...evidenceItemsFromValue(
                t('conversation.currentTask.typedIssue'),
                artifactNativeDrilldown?.typed_issues,
                ['summary', 'issue', 'kind', 'label', 'message']
              ),
              ...evidenceItemsFromValue(
                t('conversation.currentTask.contentHash'),
                artifactNativeDrilldown?.content_hash_refs
              ),
              ...evidenceItemsFromValue(t('conversation.currentTask.drawerRoute'), provenanceDrawer?.route),
              ...evidenceItemsFromValue(
                t('conversation.currentTask.drawerProjection'),
                provenanceDrawer?.projection_ref
              ),
            ]}
          />
          <EvidenceSection
            title={t('conversation.currentTask.reviewFollowUp')}
            items={[
              ...evidenceItemsFromValue(t('conversation.currentTask.review'), taskV2.review_receipt ?? reviewReceipt),
              ...evidenceItemsFromValue(t('conversation.currentTask.structuredFollowUp'), followUpSource),
            ]}
          />
          <EvidenceBlock title={t('conversation.currentTask.structuredFollowUp')} text={followUpText} />
          <EvidenceSection
            title={t('conversation.currentTask.workflowResourceActionRefs')}
            items={[
              ...evidenceItemsFromValue(t('conversation.currentTask.workflow'), workflowRefs),
              ...evidenceItemsFromValue(t('conversation.currentTask.plan'), taskV2.plan_ref),
              ...evidenceItemsFromValue(t('conversation.currentTask.latestReceipt'), taskV2.latest_receipt_ref),
              ...evidenceItemsFromValue(t('conversation.currentTask.action'), taskV2.action_receipt ?? actionReceipt),
              ...actionItems,
              { label: t('conversation.currentTask.gatewayStatus'), refValue: task.gateway_status_ref },
              ...resourceSources,
              ...resourceItems,
              ...evidenceItemsFromValue(t('conversation.currentTask.resourcePlan'), taskRecord.resource_plan_ref),
              ...evidenceItemsFromValue(
                t('conversation.currentTask.resourceApproval'),
                taskRecord.resource_approval_ref
              ),
              ...evidenceItemsFromValue(t('conversation.currentTask.resourceExecute'), taskRecord.resource_execute_ref),
              ...evidenceItemsFromValue(t('conversation.currentTask.resourceMonitor'), taskRecord.resource_monitor_ref),
              ...evidenceItemsFromValue(t('conversation.currentTask.resourceCollect'), taskRecord.resource_collect_ref),
              ...evidenceItemsFromValue(t('conversation.currentTask.resourceUsage'), taskRecord.resource_usage_ref),
              ...evidenceItemsFromValue(t('conversation.currentTask.consolePolicy'), taskRecord.console_policy_ref),
              ...evidenceItemsFromValue(t('conversation.currentTask.quota'), taskRecord.quota_ref),
              ...evidenceItemsFromValue(t('conversation.currentTask.billing'), taskRecord.billing_ref),
              ...evidenceItemsFromValue(t('conversation.currentTask.permission'), taskRecord.permission_ref),
              { label: t('conversation.currentTask.resourceReceipt'), refValue: task.resource_receipt_ref },
              { label: t('conversation.currentTask.environment'), refValue: task.environment_ref },
              ...evidenceItemsFromValue(
                t('conversation.currentTask.environmentTemplate'),
                taskRecord.environment_template_ref
              ),
              ...evidenceItemsFromValue(
                t('conversation.currentTask.environmentVersion'),
                taskRecord.environment_version_ref
              ),
              ...evidenceItemsFromValue(
                t('conversation.currentTask.environmentSource'),
                taskRecord.environment_source_ref
              ),
              ...evidenceItemsFromValue(
                t('conversation.currentTask.environmentTask'),
                taskRecord.environment_task_refs
              ),
              { label: t('conversation.currentTask.storage'), refValue: task.storage_ref },
              { label: t('conversation.currentTask.costEstimate'), refValue: task.cost_estimate_ref },
              { label: t('conversation.currentTask.diagnostics'), refValue: taskV2.diagnostics_ref },
            ]}
          />
        </div>
      )}
    </section>
  );
};

export default CurrentTaskAwareness;
