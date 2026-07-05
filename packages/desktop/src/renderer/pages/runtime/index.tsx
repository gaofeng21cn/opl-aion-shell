/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Collapse, Message, Select, Space, Tag, Typography } from '@arco-design/web-react';
import { Play, UpdateRotation } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import { resolveLegacySettingsRoute } from '@/renderer/pages/settings/registry/settingsRegistry';
import { normalizeRuntimeProjection } from '@/renderer/pages/settings/RuntimeSettings/runtimeProjection';
import type {
  RuntimeScopeOption,
  RuntimeTaskAutomationState,
  RuntimeTaskDrilldown,
  RuntimeTaskPrimaryState,
} from '@/renderer/pages/settings/RuntimeSettings/types';
import { oplRecord, oplRecordList, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';

type RuntimeSnapshot = Record<string, unknown>;
const RUNTIME_RUNNING_REFRESH_MS = 30_000;

function isRecord(value: unknown): value is RuntimeSnapshot {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): RuntimeSnapshot {
  return isRecord(value) ? value : {};
}

function recordList(value: unknown): RuntimeSnapshot[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

const RUNTIME_VALUE_KEYS: Record<string, string> = {
  available: 'common.runtime.values.available',
  empty: 'common.runtime.values.empty',
  ready: 'common.runtime.values.ready',
  compatible: 'settings.oplEnvironmentPage.status.compatible',
  installed: 'settings.oplEnvironmentPage.status.installed',
  missing: 'settings.oplEnvironmentPage.status.missing',
  blocking: 'settings.oplEnvironmentPage.status.blocking',
  blocked: 'settings.oplEnvironmentPage.status.blocking',
  failed: 'settings.oplEnvironmentPage.status.failed',
  warning: 'settings.oplEnvironmentPage.status.warning',
  degraded: 'settings.oplEnvironmentPage.status.degraded',
  pending: 'settings.oplEnvironmentPage.status.pending',
  unknown: 'settings.oplEnvironmentPage.status.unknown',
  attention_required: 'common.runtime.values.attentionRequired',
  attention_needed: 'common.runtime.values.attentionRequired',
  needs_attention: 'common.runtime.values.attentionRequired',
  update: 'settings.oplEnvironmentPage.moduleActions.update',
  'provider-worker:temporal:restart': 'common.runtime.values.restartTemporalWorker',
};

function formatValue(value: unknown, t: (key: string) => string): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  const text = stringValue(value);
  if (text) return RUNTIME_VALUE_KEYS[text] ? t(RUNTIME_VALUE_KEYS[text]) : text;
  return JSON.stringify(value);
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(stringValue).filter((item): item is string => Boolean(item)) : [];
}

function countValue(value: unknown): number {
  return numberValue(record(value).count) ?? 0;
}

function pickRecordFields(source: RuntimeSnapshot, keys: string[]): RuntimeSnapshot {
  const result: RuntimeSnapshot = {};
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      result[key] = source[key];
    }
  }
  return result;
}

function compactAction(action: RuntimeSnapshot): RuntimeSnapshot {
  return pickRecordFields(action, [
    'action_id',
    'action_kind',
    'label',
    'owner',
    'execution_policy',
    'submit_via',
    'can_submit_to_safe_action_shell',
    'route_requires_domain_or_app_payload',
    'dry_run_supported',
    'payload_fields',
    'provider_worker_lifecycle_status',
    'provider_worker_required_next_action',
    'provider_worker_repair_command',
  ]);
}

function isAppActionBoundary(action: RuntimeSnapshot): boolean {
  const submitVia = stringValue(action.submit_via);
  if (submitVia === 'opl runtime action execute') return false;
  return (
    submitVia === null ||
    submitVia === 'opl app action execute' ||
    action.can_submit_to_safe_action_shell === true ||
    action.execution_policy === 'opl_safe_action_shell'
  );
}

function isPayloadFreeAppAction(action: RuntimeSnapshot): boolean {
  if (action.route_requires_domain_or_app_payload === true) return false;
  return !Array.isArray(action.payload_fields) || action.payload_fields.length === 0;
}

function compactCurrentControlState(state: RuntimeSnapshot): RuntimeSnapshot {
  return pickRecordFields(state, [
    'task_id',
    'domain_id',
    'task_kind',
    'active_run_id',
    'active_stage_attempt_id',
    'active_workflow_id',
    'running_provider_attempt',
    'current_stage_attempt_id',
    'workflow_id',
    'provider_kind',
    'current_attempt_state',
    'reconciliation_status',
    'blocker_reason',
    'closeout_receipt_status',
    'derivation_sources',
    'forbidden_derivation_sources',
    'owner_receipt_refs',
    'typed_blocker_refs',
    'stage_progress_log',
    'provider_run',
  ]);
}

function compactCurrentControlStateSummary(summary: RuntimeSnapshot): RuntimeSnapshot {
  return pickRecordFields(summary, [
    'current_control_state_count',
    'blocked_control_state_count',
    'accepted_typed_closeout_count',
    'running_control_state_count',
    'running_provider_attempt_count',
    'running_provider_attempt_domain_ids',
    'running_provider_attempt_domain_id_omitted_count',
    'running_provider_attempt_task_kinds',
    'running_provider_attempt_task_kind_omitted_count',
    'running_provider_attempt_stage_attempt_ids',
    'running_provider_attempt_stage_attempt_id_omitted_count',
    'latest_running_provider_heartbeat_at',
    'running_provider_attempt_summary_policy',
  ]);
}

function compactDrilldown(drilldown: RuntimeSnapshot): RuntimeSnapshot {
  const attention = record(drilldown.attention_first_payload);
  const executionBridge = record(drilldown.app_execution_bridge);
  const actionRefs = record(drilldown.operator_action_routing_refs);
  const controlState = record(drilldown.current_control_state);
  return {
    ...pickRecordFields(drilldown, [
      'surface_kind',
      'projection_scope',
      'consumer',
      'availability',
      'projection_policy',
      'detail_level',
    ]),
    summary: pickRecordFields(record(drilldown.summary), [
      'stage_attempt_count',
      'current_control_state_running_count',
      'current_control_state_count',
      'current_control_state_blocked_count',
      'current_control_state_accepted_typed_closeout_count',
      'safe_action_ref_count',
      'app_execution_bridge_safe_action_route_count',
      'evidence_envelope_open_count',
      'evidence_envelope_blocked_count',
      'typed_blocker_count',
    ]),
    attention_first_payload: {
      provider_health: pickRecordFields(record(attention.provider_health), [
        'provider_kind',
        'health_status',
        'cadence_window_status',
        'capability_slo_status',
        'expected_receipt_count',
        'observed_receipt_count',
        'missing_receipt_count',
        'blocked_repair_receipt_count',
      ]),
      next_safe_action: compactAction(record(attention.next_safe_action)),
      lazy_load_targets: recordList(attention.lazy_load_targets),
    },
    app_execution_bridge: {
      safe_action_routes: recordList(executionBridge.safe_action_routes).slice(0, 8).map(compactAction),
    },
    operator_action_routing_refs: {
      refs: recordList(actionRefs.refs).slice(0, 8).map(compactAction),
    },
    runtime_workbench: {
      summary_cards: recordList(record(drilldown.runtime_workbench).summary_cards).slice(0, 8),
      activity_center: {
        active_projects: recordList(record(record(drilldown.runtime_workbench).activity_center).active_projects).slice(
          0,
          32
        ),
      },
      domain_lane_map: {
        lanes: recordList(record(record(drilldown.runtime_workbench).domain_lane_map).lanes).slice(0, 8),
      },
      task_drilldowns: recordList(record(drilldown.runtime_workbench).task_drilldowns).slice(0, 12),
    },
    visual_ref_groups: {
      active_project_refs: recordList(record(drilldown.visual_ref_groups).active_project_refs).slice(0, 32),
    },
    current_control_state: {
      summary: compactCurrentControlStateSummary(record(controlState.summary)),
      states: recordList(controlState.states).slice(0, 24).map(compactCurrentControlState),
    },
    stage_progress_log: pickRecordFields(record(drilldown.stage_progress_log), [
      'attempt_count',
      'temporal_attempt_count',
      'completed_attempt_count',
      'blocked_attempt_count',
      'runner_progress_event_count',
      'temporal_visibility_readiness_statuses',
      'temporal_webui_ref_count',
    ]),
    artifact_gallery_refs: {
      refs: recordList(record(drilldown.artifact_gallery_refs).refs).slice(0, 32),
    },
    memory_trace_projection: {
      source_refs: stringList(record(drilldown.memory_trace_projection).source_refs).slice(0, 32),
      writeback_receipt_refs: stringList(record(drilldown.memory_trace_projection).writeback_receipt_refs).slice(0, 32),
    },
    memory_writeback_refs: {
      writeback_receipt_refs: stringList(record(drilldown.memory_writeback_refs).writeback_receipt_refs).slice(0, 32),
    },
  };
}

function parseDrilldown(stdout: string): RuntimeSnapshot | null {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    const payload = record(parsed);
    const drilldown = record(payload.app_operator_drilldown);
    return Object.keys(drilldown).length > 0 ? compactDrilldown(drilldown) : null;
  } catch {
    return null;
  }
}

function parseBridgePayload(result: { parsed?: unknown; stdout?: string } | null | undefined): RuntimeSnapshot | null {
  if (isRecord(result?.parsed)) return result.parsed;
  if (typeof result?.stdout !== 'string') return null;
  try {
    return record(JSON.parse(result.stdout) as unknown);
  } catch {
    return null;
  }
}

function detailDigest(drilldown: RuntimeSnapshot): RuntimeSnapshot {
  const attention = record(drilldown.attention_first_payload);
  const taskRefs = workbenchTaskDrilldowns(drilldown)
    .map((task) =>
      pickRecordFields(task, [
        'task_id',
        'study_id',
        'state',
        'status',
        'active_stage_id',
        'active_run_id',
        'stage_attempt_ids',
        'runtime_closeout_observed',
        'runtime_closeout_ref',
        'mas_owner_consumption_status',
        'mas_owner_consumption_ref',
        'mas_owner_consumed_stage_attempt_id',
        'mas_owner_consumed_closeout_ref',
        'mas_owner_consumption_matches_runtime_closeout',
        'next_visible_step',
        'last_progress_at',
      ])
    )
    .filter((task) => Object.keys(task).length > 0);
  return {
    detail_level: stringValue(drilldown.detail_level) ?? 'full',
    root_section_count: Object.keys(drilldown).length,
    lazy_load_target_count: recordList(attention.lazy_load_targets).length,
    task_refs: taskRefs,
  };
}

function runtimeWorkbench(drilldown: RuntimeSnapshot): RuntimeSnapshot {
  return record(drilldown.runtime_workbench);
}

function workbenchTaskDrilldowns(drilldown: RuntimeSnapshot): RuntimeSnapshot[] {
  return recordList(runtimeWorkbench(drilldown).task_drilldowns).slice(0, 12);
}

function workbenchDomainLanes(drilldown: RuntimeSnapshot): RuntimeSnapshot[] {
  return recordList(record(runtimeWorkbench(drilldown).domain_lane_map).lanes).slice(0, 8);
}

function workbenchActiveProjectLines(drilldown: RuntimeSnapshot): RuntimeSnapshot[] {
  const workbench = runtimeWorkbench(drilldown);
  const activityLines = recordList(record(workbench.activity_center).active_projects);
  const visualLines = recordList(record(drilldown.visual_ref_groups).active_project_refs);
  const seen = new Set<string>();
  return [...activityLines, ...visualLines]
    .filter((line) => {
      const key = stringValue(line.task_id) ?? stringValue(line.id) ?? stringValue(line.source_ref);
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 32);
}

function currentControlState(drilldown: RuntimeSnapshot): RuntimeSnapshot {
  return record(drilldown.current_control_state);
}

function currentControlStateSummary(drilldown: RuntimeSnapshot): RuntimeSnapshot {
  return record(currentControlState(drilldown).summary);
}

function currentControlStateRecords(drilldown: RuntimeSnapshot): RuntimeSnapshot[] {
  return recordList(currentControlState(drilldown).states);
}

function refText(value: unknown): string | null {
  return (
    stringValue(value) ??
    stringValue(record(value).ref) ??
    stringValue(record(value).source_ref) ??
    stringValue(record(value).receipt_ref)
  );
}

function evidenceRefs(drilldown: RuntimeSnapshot): string[] {
  const refs = [
    ...recordList(record(drilldown.artifact_gallery_refs).refs).map(refText),
    ...stringList(record(drilldown.memory_trace_projection).source_refs),
    ...stringList(record(drilldown.memory_trace_projection).writeback_receipt_refs),
    ...stringList(record(drilldown.memory_writeback_refs).writeback_receipt_refs),
  ];
  const seen = new Set<string>();
  return refs
    .filter((ref): ref is string => Boolean(ref))
    .filter((ref) => {
      if (seen.has(ref)) return false;
      seen.add(ref);
      return true;
    })
    .slice(0, 32);
}

function summaryEntries(
  drilldown: RuntimeSnapshot,
  t: (key: string, options?: Record<string, string | number>) => string
): Array<{ key: string; label: string; value: unknown }> {
  const summary = record(drilldown.summary);
  const controlSummary = currentControlStateSummary(drilldown);
  const attention = record(drilldown.attention_first_payload);
  const providerHealth = record(attention.provider_health);
  const nextAction = record(attention.next_safe_action);
  const safeActionCount =
    numberValue(summary.safe_action_ref_count) ?? numberValue(summary.app_execution_bridge_safe_action_route_count);
  return [
    {
      key: 'availability',
      label: t('common.runtime.summaryAvailability'),
      value: stringValue(drilldown.availability) ?? t('settings.oplEnvironmentPage.status.unknown'),
    },
    {
      key: 'provider',
      label: t('common.runtime.summaryProvider'),
      value: stringValue(providerHealth.health_status) ?? t('settings.oplEnvironmentPage.status.unknown'),
    },
    {
      key: 'stage_attempts',
      label: t('common.runtime.summaryStageAttempts'),
      value:
        numberValue(summary.stage_attempt_count) ??
        numberValue(record(drilldown.stage_progress_log).attempt_count) ??
        0,
    },
    {
      key: 'blocked',
      label: t('common.runtime.summaryBlocked'),
      value:
        numberValue(summary.current_control_state_blocked_count) ??
        numberValue(controlSummary.blocked_control_state_count) ??
        0,
    },
    {
      key: 'safe_actions',
      label: t('common.runtime.summarySafeActions'),
      value: safeActionCount ?? 0,
    },
    {
      key: 'next_action',
      label: t('common.runtime.summaryNextAction'),
      value: stringValue(nextAction.action_id) ?? t('common.runtime.noSafeActions'),
    },
  ];
}

function collectSafeActions(drilldown: RuntimeSnapshot): RuntimeSnapshot[] {
  const attention = record(drilldown.attention_first_payload);
  const candidates = [
    record(attention.next_safe_action),
    ...recordList(record(drilldown.app_execution_bridge).safe_action_routes),
    ...recordList(record(drilldown.operator_action_routing_refs).refs),
  ];
  const seen = new Set<string>();
  return candidates
    .filter((candidate) => {
      const actionId = stringValue(candidate.action_id);
      if (!actionId || seen.has(actionId)) return false;
      const isSafe =
        isAppActionBoundary(candidate) &&
        isPayloadFreeAppAction(candidate) &&
        (candidate.can_submit_to_safe_action_shell === true ||
          candidate.execution_policy === 'opl_safe_action_shell' ||
          stringValue(candidate.submit_via) === 'opl app action execute') &&
        candidate.dry_run_supported !== false;
      if (!isSafe) return false;
      seen.add(actionId);
      return true;
    })
    .slice(0, 8);
}

function taskFallbackLabel(taskId: string | null, index: number): string {
  return taskId ?? `task-${index + 1}`;
}

function formatCountLabel(label: string, count: number): string | null {
  return count > 0 ? `${label}: ${count}` : null;
}

type RuntimeProjectProgress = {
  id: string;
  title: string;
  domainId: string | null;
  domainLabel: string;
  priorityBucket: string | null;
  stateRaw: string | null;
  statusRaw: string | null;
  progressClassRaw: string | null;
  stateLabel: string | null;
  statusLabel: string | null;
  stageLabel: string | null;
  nextStep: string | null;
  nextOwner: string | null;
  lastProgressAt: string | null;
  studyId: string | null;
  activeRunId: string | null;
  progressClassLabel: string | null;
  progressTone: 'green' | 'orange' | 'blue' | 'red';
  deliverableCount: number;
  platformRepairCount: number;
  blockerCount: number;
  safeActionCount: number;
  paperLensCount: number;
  stageAttemptCount: number;
  stageAttemptIds: string[];
  runtimeCloseoutObserved: boolean;
  runtimeCloseoutRef: string | null;
  masOwnerConsumptionStatus: string | null;
  masOwnerConsumptionRef: string | null;
  masOwnerConsumedStageAttemptId: string | null;
  masOwnerConsumedCloseoutRef: string | null;
  masOwnerConsumptionMatchesRuntimeCloseout: boolean | null;
  refsSummary: RuntimeRefsSummary;
  needsAttention: boolean;
};

type RuntimeTaskStatusItem = RuntimeProjectProgress & {
  running: boolean;
  currentAttemptState: string | null;
  providerStatus: string | null;
  lastHeartbeatAt: string | null;
  completedAt: string | null;
  livenessSource: string | null;
  blockerReason: string | null;
  stageStartedAt: string | null;
  usageTelemetryMissing: boolean;
};

type RuntimeModuleStatusItem = {
  id: string;
  title: string;
  statusRaw: string | null;
  statusLabel: string | null;
  detail: string | null;
  needsAttention: boolean;
};

type RuntimeRefsSummary = {
  artifact: string | null;
  blocker: string | null;
  reviewReceipt: string | null;
  actionReceipt: string | null;
};

type ActionResultSummary = {
  preview: string | null;
  receipt: string | null;
};

type RuntimeTaskOverview = {
  runningTaskCount: number;
  activeProjectCount: number;
  queuedTaskCount: number;
  attentionTaskCount: number;
  latestActivityAt: string | null;
  tasks: RuntimeTaskStatusItem[];
  runningTasks: RuntimeTaskStatusItem[];
  attentionTasks: RuntimeTaskStatusItem[];
  inactiveTasks: RuntimeTaskStatusItem[];
};

type RuntimeOverviewTaskItem = {
  task: RuntimeTaskDrilldown;
  primaryState: RuntimeTaskPrimaryState;
  automationState: RuntimeTaskAutomationState;
  primaryLabel: string;
  automationLabel: string;
  agentLabel: string;
  projectLabel: string;
  taskLabel: string;
  stageLabel: string | null;
  elapsedLabel: string | null;
  livenessLabel: string;
  stageUsageLabel: string;
  totalUsageLabel: string;
  nextStep: string | null;
  ownerLabel: string | null;
  blockerSummary: string | null;
  latestActivityAt: string | null;
  currentnessTag: string | null;
};

type RuntimeOverviewSection = {
  state: RuntimeTaskPrimaryState;
  title: string;
  summary: string;
  tasks: RuntimeOverviewTaskItem[];
};

const PRIMARY_STATE_ORDER: RuntimeTaskPrimaryState[] = [
  'in_progress',
  'delivered_auto_paused',
  'paused_waiting_for_direction',
  'owner_decision_required',
  'system_attention_required',
];

const PRIMARY_STATE_LABEL_KEYS: Record<RuntimeTaskPrimaryState, string> = {
  in_progress: 'common.runtime.primaryStates.inProgress',
  delivered_auto_paused: 'common.runtime.primaryStates.deliveredAutoPaused',
  paused_waiting_for_direction: 'common.runtime.primaryStates.pausedWaitingForDirection',
  owner_decision_required: 'common.runtime.primaryStates.ownerDecisionRequired',
  system_attention_required: 'common.runtime.primaryStates.systemAttentionRequired',
};

const AUTOMATION_STATE_LABEL_KEYS: Record<RuntimeTaskAutomationState, string> = {
  automation_running: 'common.runtime.automationStates.running',
  automation_idle: 'common.runtime.automationStates.idle',
  result_pending_terminalization: 'common.runtime.automationStates.pendingTerminalization',
  automation_failed: 'common.runtime.automationStates.failed',
};

const PROJECT_STATE_KEYS: Record<string, string> = {
  ready: 'common.runtime.projectStates.ready',
  running: 'common.runtime.projectStates.running',
  queued: 'common.runtime.projectStates.queued',
  pending: 'common.runtime.projectStates.pending',
  checkpointed: 'common.runtime.projectStates.checkpointed',
  quality_repair: 'common.runtime.projectStates.qualityRepair',
  repair: 'common.runtime.projectStates.qualityRepair',
  blocked: 'common.runtime.projectStates.blocked',
  blocking: 'common.runtime.projectStates.blocked',
  failed: 'common.runtime.projectStates.failed',
  error: 'common.runtime.projectStates.failed',
  missing: 'common.runtime.projectStates.needsSetup',
  attention_needed: 'common.runtime.projectStates.needsAttention',
  attention_required: 'common.runtime.projectStates.needsAttention',
};

const PROJECT_PROGRESS_CLASS_KEYS: Record<string, string> = {
  deliverable_progress: 'common.runtime.progressClasses.deliverable_progress',
  platform_repair: 'common.runtime.progressClasses.platform_repair',
  mixed: 'common.runtime.progressClasses.mixed',
  typed_blocker: 'common.runtime.progressClasses.typed_blocker',
  human_gate: 'common.runtime.progressClasses.human_gate',
  stop_loss: 'common.runtime.progressClasses.stop_loss',
};

const ATTENTION_STATES = new Set([
  'blocked',
  'blocking',
  'failed',
  'error',
  'missing',
  'attention_needed',
  'attention_required',
]);
const ATTENTION_PROGRESS_CLASSES = new Set(['typed_blocker', 'human_gate', 'stop_loss']);
const RUNNING_STATES = new Set(['running', 'in_progress', 'advancing']);
const QUEUED_STATES = new Set(['queued', 'pending', 'checkpointed']);
const MODULE_ATTENTION_STATES = new Set(['dirty', 'missing', 'blocked', 'failed', 'attention_needed', 'attention_required']);

function firstStringField(source: RuntimeSnapshot, keys: string[]): string | null {
  for (const key of keys) {
    const value = stringValue(source[key]);
    if (value) return value;
  }
  return null;
}

function firstRefField(source: RuntimeSnapshot, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    const direct = refText(value);
    if (direct) return direct;
    const fromList = recordList(value)
      .map(refText)
      .find((ref): ref is string => Boolean(ref));
    if (fromList) return fromList;
  }
  return null;
}

function refsSummaryFromTask(task: RuntimeSnapshot | undefined): RuntimeRefsSummary {
  const source = task ?? {};
  return {
    artifact:
      firstStringField(source, ['artifact_provenance_summary', 'artifact_summary', 'artifact_or_blocker_summary']) ??
      firstRefField(source, ['artifact_or_blocker_ref', 'artifact_or_blocker_refs', 'artifact_ref', 'artifact_refs']) ??
      null,
    blocker:
      firstStringField(source, ['blocker_summary', 'typed_blocker_summary']) ??
      firstRefField(source, ['blocker_ref', 'blocker_refs', 'typed_blocker_ref', 'typed_blocker_refs']) ??
      null,
    reviewReceipt:
      firstStringField(source, ['reviewer_receipt_summary', 'review_receipt_summary', 'receipt_summary']) ??
      firstRefField(source, [
        'review_receipt_ref',
        'review_receipt_refs',
        'reviewer_receipt_ref',
        'reviewer_receipt_refs',
      ]) ??
      null,
    actionReceipt:
      firstStringField(source, ['action_receipt_summary']) ??
      firstRefField(source, ['action_receipt_ref', 'action_receipt_refs']) ??
      null,
  };
}

function actionResultSummary(result: RuntimeSnapshot | null): ActionResultSummary {
  const payload = record(result);
  const actionPreview = record(payload.action_preview);
  const receipt = record(payload.receipt);
  return {
    preview:
      firstStringField(payload, ['action_preview_summary', 'preview_summary']) ??
      firstStringField(actionPreview, ['summary', 'message']) ??
      null,
    receipt:
      firstStringField(payload, ['receipt_summary']) ??
      firstStringField(receipt, ['summary', 'message']) ??
      firstRefField(payload, ['receipt_ref', 'receipt_refs']) ??
      firstRefField(receipt, ['ref', 'receipt_ref']),
  };
}

function translateMappedValue(
  value: unknown,
  mapping: Record<string, string>,
  t: (key: string, options?: Record<string, string | number>) => string
): string | null {
  const text = stringValue(value);
  if (!text) return null;
  return mapping[text] ? t(mapping[text]) : text;
}

function progressTone(progressClass: string | null, deliverableCount: number, platformRepairCount: number) {
  if (progressClass === 'stop_loss') return 'red';
  if (progressClass && ATTENTION_PROGRESS_CLASSES.has(progressClass)) return 'orange';
  if (deliverableCount > 0) return 'green';
  if (platformRepairCount > 0 || progressClass === 'platform_repair') return 'orange';
  return 'blue';
}

function isUserProjectProgressTask(task: RuntimeSnapshot): boolean {
  const activeStage = stringValue(task.active_stage_id);
  const state = stringValue(task.state);
  if (activeStage === 'module_runtime') return false;
  if (state === 'dirty' || state === 'missing') return false;
  return Boolean(
    stringValue(task.progress_delta_classification) ||
    task.deliverable_progress_delta !== undefined ||
    task.platform_repair_delta !== undefined ||
    stringValue(task.next_visible_step) ||
    stringValue(task.next_owner)
  );
}

function activeProjectLineByTaskId(lines: RuntimeSnapshot[]): Map<string, RuntimeSnapshot> {
  const result = new Map<string, RuntimeSnapshot>();
  for (const line of lines) {
    const taskId = stringValue(line.task_id);
    if (taskId && !result.has(taskId)) {
      result.set(taskId, line);
    }
  }
  return result;
}

function taskFromActiveProjectLine(
  line: RuntimeSnapshot,
  index: number,
  t: (key: string, options?: Record<string, string | number>) => string,
  detail?: RuntimeSnapshot
): RuntimeProjectProgress {
  const taskId = stringValue(line.task_id) ?? stringValue(detail?.task_id);
  const title =
    stringValue(line.title) ??
    stringValue(detail?.title) ??
    stringValue(detail?.label) ??
    taskFallbackLabel(taskId, index);
  const domainLabel =
    stringValue(line.domain_label) ??
    stringValue(detail?.domain_label) ??
    stringValue(line.domain_id) ??
    stringValue(detail?.domain_id) ??
    t('common.runtime.unknownDomain');
  const state = stringValue(line.state) ?? stringValue(detail?.state);
  const status = stringValue(line.status) ?? stringValue(detail?.status);
  const statusLabel = stringValue(line.status_label) ?? stringValue(detail?.status_label);
  const progressClass = stringValue(detail?.progress_delta_classification);
  const deliverableCount = countValue(detail?.deliverable_progress_delta);
  const platformRepairCount = countValue(detail?.platform_repair_delta);
  const blockerCount = numberValue(detail?.blocker_ref_count) ?? numberValue(line.blocker_ref_count) ?? 0;
  const safeActionCount = numberValue(detail?.safe_action_ref_count) ?? numberValue(line.safe_action_ref_count) ?? 0;
  const paperLensCount =
    numberValue(detail?.paper_route_lens_ref_count) ?? numberValue(line.paper_route_lens_ref_count) ?? 0;
  const stageAttemptIds = stringList(detail?.stage_attempt_ids);
  const lineStageAttemptIds = stringList(line.stage_attempt_ids);
  const visibleStageAttemptIds = stageAttemptIds.length > 0 ? stageAttemptIds : lineStageAttemptIds;
  const stageAttemptCount = visibleStageAttemptIds.length;
  const needsAttention =
    blockerCount > 0 ||
    (state ? ATTENTION_STATES.has(state) : false) ||
    (status ? ATTENTION_STATES.has(status) : false) ||
    (progressClass ? ATTENTION_PROGRESS_CLASSES.has(progressClass) : false);

  return {
    id: taskId ?? `${title}-${index + 1}`,
    title,
    domainId: stringValue(line.domain_id) ?? stringValue(detail?.domain_id),
    domainLabel,
    priorityBucket: stringValue(line.priority_bucket) ?? stringValue(detail?.priority_bucket),
    stateRaw: state,
    statusRaw: status,
    progressClassRaw: progressClass,
    stateLabel: translateMappedValue(status ?? state, PROJECT_STATE_KEYS, t),
    statusLabel,
    stageLabel:
      stringValue(line.active_stage_label) ??
      stringValue(detail?.active_stage_label) ??
      stringValue(line.active_stage_id) ??
      stringValue(detail?.active_stage_id),
    nextStep:
      stringValue(line.next_visible_step) ??
      stringValue(detail?.next_visible_step) ??
      stringValue(detail?.next_step) ??
      stringValue(detail?.required_next_action) ??
      null,
    nextOwner: stringValue(detail?.next_owner) ?? stringValue(detail?.owner) ?? null,
    lastProgressAt: stringValue(detail?.last_progress_at) ?? stringValue(detail?.updated_at) ?? null,
    studyId: stringValue(line.study_id) ?? stringValue(detail?.study_id),
    activeRunId: stringValue(line.active_run_id) ?? stringValue(detail?.active_run_id),
    progressClassLabel: translateMappedValue(progressClass, PROJECT_PROGRESS_CLASS_KEYS, t),
    progressTone: progressTone(progressClass, deliverableCount, platformRepairCount),
    deliverableCount,
    platformRepairCount,
    blockerCount,
    safeActionCount,
    paperLensCount,
    stageAttemptCount,
    stageAttemptIds: visibleStageAttemptIds,
    runtimeCloseoutObserved: line.runtime_closeout_observed === true || detail?.runtime_closeout_observed === true,
    runtimeCloseoutRef: stringValue(line.runtime_closeout_ref) ?? stringValue(detail?.runtime_closeout_ref),
    masOwnerConsumptionStatus:
      stringValue(line.mas_owner_consumption_status) ?? stringValue(detail?.mas_owner_consumption_status),
    masOwnerConsumptionRef: stringValue(line.mas_owner_consumption_ref) ?? stringValue(detail?.mas_owner_consumption_ref),
    masOwnerConsumedStageAttemptId:
      stringValue(line.mas_owner_consumed_stage_attempt_id) ?? stringValue(detail?.mas_owner_consumed_stage_attempt_id),
    masOwnerConsumedCloseoutRef:
      stringValue(line.mas_owner_consumed_closeout_ref) ?? stringValue(detail?.mas_owner_consumed_closeout_ref),
    masOwnerConsumptionMatchesRuntimeCloseout:
      typeof line.mas_owner_consumption_matches_runtime_closeout === 'boolean'
        ? line.mas_owner_consumption_matches_runtime_closeout
        : typeof detail?.mas_owner_consumption_matches_runtime_closeout === 'boolean'
          ? detail.mas_owner_consumption_matches_runtime_closeout
          : null,
    refsSummary: refsSummaryFromTask(detail ?? line),
    needsAttention,
  };
}

function projectProgressItems(
  tasks: RuntimeSnapshot[],
  activeProjectLines: RuntimeSnapshot[],
  t: (key: string, options?: Record<string, string | number>) => string
): RuntimeProjectProgress[] {
  const lineByTaskId = activeProjectLineByTaskId(activeProjectLines);
  const taskById = new Map<string, RuntimeSnapshot>();
  for (const task of tasks) {
    const taskId = stringValue(task.task_id);
    if (taskId && isUserProjectProgressTask(task)) {
      taskById.set(taskId, task);
    }
  }

  const activeLineItems = activeProjectLines.map((line, index) => {
    const taskId = stringValue(line.task_id);
    return taskFromActiveProjectLine(line, index, t, taskId ? taskById.get(taskId) : undefined);
  });

  const activeLineTaskIds = new Set(activeProjectLines.map((line) => stringValue(line.task_id)).filter(Boolean));
  const drilldownItems = tasks
    .filter(isUserProjectProgressTask)
    .flatMap<RuntimeProjectProgress>((task, index): RuntimeProjectProgress[] => {
      const taskId = stringValue(task.task_id);
      if (taskId && activeLineTaskIds.has(taskId)) return [];
      const title = stringValue(task.title) ?? stringValue(task.label) ?? taskFallbackLabel(taskId, index);
      const domainLabel =
        stringValue(task.domain_label) ?? stringValue(task.domain_id) ?? t('common.runtime.unknownDomain');
      const state = stringValue(task.state);
      const status = stringValue(task.status) ?? stringValue(lineByTaskId.get(taskId ?? '')?.status);
      const statusLabel =
        stringValue(task.status_label) ?? stringValue(lineByTaskId.get(taskId ?? '')?.status_label);
      const progressClass = stringValue(task.progress_delta_classification);
      const deliverableCount = countValue(task.deliverable_progress_delta);
      const platformRepairCount = countValue(task.platform_repair_delta);
      const blockerCount = numberValue(task.blocker_ref_count) ?? 0;
      const safeActionCount = numberValue(task.safe_action_ref_count) ?? 0;
      const paperLensCount = numberValue(task.paper_route_lens_ref_count) ?? 0;
      const stageAttemptIds = stringList(task.stage_attempt_ids);
      const stageAttemptCount = stageAttemptIds.length;
      const needsAttention =
        blockerCount > 0 ||
        (state ? ATTENTION_STATES.has(state) : false) ||
        (progressClass ? ATTENTION_PROGRESS_CLASSES.has(progressClass) : false);

      return [
        {
          id: taskId ?? `${title}-${index + 1}`,
          title,
          domainId: stringValue(task.domain_id),
          domainLabel,
          priorityBucket: stringValue(task.priority_bucket),
          stateRaw: state,
          statusRaw: status,
          progressClassRaw: progressClass,
          stateLabel: translateMappedValue(status ?? state, PROJECT_STATE_KEYS, t),
          statusLabel,
          stageLabel: stringValue(task.active_stage_label) ?? stringValue(task.active_stage_id),
          nextStep:
            stringValue(task.next_visible_step) ??
            stringValue(task.next_step) ??
            stringValue(task.required_next_action) ??
            null,
          nextOwner: stringValue(task.next_owner) ?? stringValue(task.owner) ?? null,
          lastProgressAt: stringValue(task.last_progress_at) ?? stringValue(task.updated_at) ?? null,
          studyId: stringValue(task.study_id),
          activeRunId: stringValue(task.active_run_id),
          progressClassLabel: translateMappedValue(progressClass, PROJECT_PROGRESS_CLASS_KEYS, t),
          progressTone: progressTone(progressClass, deliverableCount, platformRepairCount),
          deliverableCount,
          platformRepairCount,
          blockerCount,
          safeActionCount,
          paperLensCount,
          stageAttemptCount,
          stageAttemptIds,
          runtimeCloseoutObserved: task.runtime_closeout_observed === true,
          runtimeCloseoutRef: stringValue(task.runtime_closeout_ref),
          masOwnerConsumptionStatus: stringValue(task.mas_owner_consumption_status),
          masOwnerConsumptionRef: stringValue(task.mas_owner_consumption_ref),
          masOwnerConsumedStageAttemptId: stringValue(task.mas_owner_consumed_stage_attempt_id),
          masOwnerConsumedCloseoutRef: stringValue(task.mas_owner_consumed_closeout_ref),
          masOwnerConsumptionMatchesRuntimeCloseout:
            typeof task.mas_owner_consumption_matches_runtime_closeout === 'boolean'
              ? task.mas_owner_consumption_matches_runtime_closeout
              : null,
          refsSummary: refsSummaryFromTask(task),
          needsAttention,
        },
      ];
    });

  return [...activeLineItems, ...drilldownItems];
}

function taskLooksRunning(project: RuntimeProjectProgress): boolean {
  return Boolean(
    (project.statusRaw && RUNNING_STATES.has(project.statusRaw)) ||
    (project.stateRaw && RUNNING_STATES.has(project.stateRaw))
  );
}

function parseModuleStatusItems(
  appState: RuntimeSnapshot,
  t: (key: string, options?: Record<string, string | number>) => string
): RuntimeModuleStatusItem[] {
  return oplRecordList(oplRecord(appState.modules).items).map((item, index) => {
    const status = oplString(item.status);
    const title = oplString(item.display_name) ?? oplString(item.module_id) ?? `module-${index + 1}`;
    const dirty = oplRecord(item.git).dirty === true;
    return {
      id: oplString(item.module_id) ?? title,
      title,
      statusRaw: dirty ? 'attention_needed' : status,
      statusLabel: dirty
        ? t('common.runtime.projectStates.needsAttention')
        : translateMappedValue(status, PROJECT_STATE_KEYS, t) ?? status,
      detail: dirty ? t('common.runtime.moduleDirty') : oplString(item.version) ?? null,
      needsAttention: dirty || (status ? MODULE_ATTENTION_STATES.has(status) : false),
    };
  });
}

function controlStateTimestamp(state: RuntimeSnapshot): number {
  const providerRun = record(state.provider_run);
  const timestamp =
    stringValue(providerRun.last_heartbeat_at) ??
    stringValue(providerRun.completed_at) ??
    stringValue(record(state.stage_progress_log).last_heartbeat_at);
  const epoch = timestamp ? Date.parse(timestamp) : Number.NaN;
  return Number.isFinite(epoch) ? epoch : 0;
}

function compareControlStates(left: RuntimeSnapshot, right: RuntimeSnapshot): number {
  const leftRunning = left.running_provider_attempt === true ? 1 : 0;
  const rightRunning = right.running_provider_attempt === true ? 1 : 0;
  if (leftRunning !== rightRunning) return rightRunning - leftRunning;
  return controlStateTimestamp(right) - controlStateTimestamp(left);
}

function buildControlStateIndex(states: RuntimeSnapshot[]) {
  const byRunId = new Map<string, RuntimeSnapshot[]>();
  const byStageAttemptId = new Map<string, RuntimeSnapshot[]>();

  const push = (map: Map<string, RuntimeSnapshot[]>, key: string | null, value: RuntimeSnapshot) => {
    if (!key) return;
    const existing = map.get(key) ?? [];
    existing.push(value);
    existing.sort(compareControlStates);
    map.set(key, existing);
  };

  for (const state of states) {
    push(byRunId, stringValue(state.active_run_id), state);
    push(
      byStageAttemptId,
      stringValue(state.current_stage_attempt_id) ?? stringValue(state.active_stage_attempt_id),
      state
    );
  }

  return { byRunId, byStageAttemptId };
}

function firstControlStateMatch(states: RuntimeSnapshot[]): RuntimeSnapshot | null {
  const matches: RuntimeSnapshot[] = [];
  const seen = new Set<string>();
  for (const state of states) {
    const key =
      stringValue(state.active_run_id) ??
      stringValue(state.current_stage_attempt_id) ??
      stringValue(state.active_stage_attempt_id) ??
      stringValue(state.domain_id) ??
      JSON.stringify(state);
    if (!seen.has(key)) {
      seen.add(key);
      matches.push(state);
    }
  }
  matches.sort(compareControlStates);
  return matches[0] ?? null;
}

function matchControlState(
  task: RuntimeProjectProgress,
  index: ReturnType<typeof buildControlStateIndex>
): RuntimeSnapshot | null {
  const matches: RuntimeSnapshot[] = [];
  if (task.activeRunId) matches.push(...(index.byRunId.get(task.activeRunId) ?? []));
  for (const attemptId of task.stageAttemptIds) {
    matches.push(...(index.byStageAttemptId.get(attemptId) ?? []));
  }
  return firstControlStateMatch(matches);
}

function pickStageStartedAt(state: RuntimeSnapshot | null): string | null {
  const stageProgress = record(state?.stage_progress_log);
  return (
    firstStringField(stageProgress, [
      'started_at',
      'stage_started_at',
      'current_stage_started_at',
      'first_progress_at',
      'entered_at',
    ]) ?? null
  );
}

function usageTelemetryMissing(state: RuntimeSnapshot | null): boolean {
  const stageProgress = record(state?.stage_progress_log);
  const explicitMissing =
    numberValue(stageProgress.missing_usage_telemetry_attempt_count) ??
    numberValue(stageProgress.missing_usage_telemetry_count);
  if (explicitMissing !== null) return explicitMissing > 0;
  return true;
}

function formatElapsedSince(timestamp: string | null, t: (key: string) => string): string | null {
  if (!timestamp) return null;
  const epoch = Date.parse(timestamp);
  if (!Number.isFinite(epoch)) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - epoch) / 1000));
  if (seconds < 60) return `${seconds}${t('common.unit.second_short')}`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}${t('common.unit.minute_short')}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${t('common.unit.hour_short')}`;
  return `${Math.floor(hours / 24)}${t('common.unit.day_short')}`;
}

function formatElapsedSeconds(seconds: number | null | undefined, t: (key: string) => string): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds < 60) return `${Math.floor(seconds)}${t('common.unit.second_short')}`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}${t('common.unit.minute_short')}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${t('common.unit.hour_short')}`;
  return `${Math.floor(hours / 24)}${t('common.unit.day_short')}`;
}

function normalizeScopeToken(value: string | null | undefined): string | null {
  return value && value.trim().length > 0 ? value.trim().toLowerCase() : null;
}

function scopeMatchesTask(task: RuntimeTaskDrilldown, scope: RuntimeScopeOption | null): boolean {
  if (!scope || scope.kind === 'all_projects') return true;
  const scopeValue = normalizeScopeToken(scope.value ?? scope.label);
  if (!scopeValue) return true;
  const matches = (...values: Array<string | undefined>) =>
    values.map(normalizeScopeToken).some((value) => value === scopeValue);
  if (scope.kind === 'agent') {
    return matches(task.domainId, task.domainLabel, task.agentDisplayName);
  }
  if (scope.kind === 'workspace') {
    return matches(task.workspaceId, task.workspaceLabel);
  }
  if (scope.kind === 'project') {
    return matches(task.projectId, task.projectDisplayName, task.studyId);
  }
  return matches(task.taskId, task.title, task.workItemDisplayName, task.executionRunLabel);
}

function primaryStateForTask(task: RuntimeTaskDrilldown): RuntimeTaskPrimaryState {
  return task.primaryState ?? 'paused_waiting_for_direction';
}

function automationStateForTask(task: RuntimeTaskDrilldown): RuntimeTaskAutomationState {
  return task.automationState ?? 'automation_idle';
}

function groupSummaryKey(state: RuntimeTaskPrimaryState): string {
  switch (state) {
    case 'in_progress':
      return 'common.runtime.groupSummaries.inProgress';
    case 'delivered_auto_paused':
      return 'common.runtime.groupSummaries.deliveredAutoPaused';
    case 'paused_waiting_for_direction':
      return 'common.runtime.groupSummaries.pausedWaiting';
    case 'owner_decision_required':
      return 'common.runtime.groupSummaries.ownerDecision';
    case 'system_attention_required':
      return 'common.runtime.groupSummaries.systemAttention';
  }
}

function controlStateFallbackForTask(task: RuntimeTaskDrilldown, states: RuntimeSnapshot[]): RuntimeSnapshot | null {
  if (states.length === 0) return null;
  const fallbackProject: RuntimeProjectProgress = {
    id: task.taskId,
    title: task.title,
    domainId: task.domainId ?? null,
    domainLabel: task.domainLabel ?? task.agentDisplayName ?? '',
    priorityBucket: null,
    stateRaw: task.state ?? null,
    statusRaw: task.status ?? null,
    progressClassRaw: null,
    stateLabel: null,
    statusLabel: task.status ?? null,
    stageLabel: task.stage ?? null,
    nextStep: task.nextStep ?? null,
    nextOwner: task.nextOwner ?? null,
    lastProgressAt: task.lastProgressAt ?? null,
    studyId: task.projectId ?? null,
    activeRunId: task.activeRunId ?? null,
    progressClassLabel: null,
    progressTone: 'blue',
    deliverableCount: 0,
    platformRepairCount: 0,
    blockerCount: task.blockerRefCount,
    safeActionCount: task.safeActionRefCount,
    paperLensCount: task.paperRouteLensRefCount,
    stageAttemptCount: task.stageAttemptIds.length,
    stageAttemptIds: task.stageAttemptIds,
    runtimeCloseoutObserved: false,
    runtimeCloseoutRef: null,
    masOwnerConsumptionStatus: null,
    masOwnerConsumptionRef: null,
    masOwnerConsumedStageAttemptId: null,
    masOwnerConsumedCloseoutRef: null,
    masOwnerConsumptionMatchesRuntimeCloseout: null,
    refsSummary: { artifact: null, blocker: task.typedBlockerSummary ?? null, reviewReceipt: null, actionReceipt: null },
    needsAttention: primaryStateForTask(task) === 'system_attention_required',
  };
  return matchControlState(fallbackProject, buildControlStateIndex(states));
}

function runtimeTaskItem(
  task: RuntimeTaskDrilldown,
  controlStates: RuntimeSnapshot[],
  t: (key: string, options?: Record<string, string | number>) => string
): RuntimeOverviewTaskItem {
  const primaryState = primaryStateForTask(task);
  const automationState = automationStateForTask(task);
  const controlState = controlStateFallbackForTask(task, controlStates);
  const providerRun = record(controlState?.provider_run);
  const lastHeartbeatAt = task.lastHeartbeatAt ?? stringValue(providerRun.last_heartbeat_at);
  const completedAt = stringValue(providerRun.completed_at);
  const stageElapsed =
    formatElapsedSeconds(task.elapsedSeconds, t) ?? formatElapsedSince(pickStageStartedAt(controlState), t);
  const livenessLabel =
    lastHeartbeatAt
      ? t('common.runtime.runningProofHeartbeat', { time: lastHeartbeatAt })
      : task.runningProofRef
        ? task.runningProofRef
        : completedAt
          ? t('common.runtime.runningProofCompleted', {
              status: stringValue(providerRun.provider_status) ?? stringValue(controlState?.current_attempt_state) ?? t('common.runtime.values.empty'),
              time: completedAt,
            })
          : t('common.runtime.telemetryMissing');
  const blockerSummary = task.typedBlockerSummary ?? stringValue(controlState?.blocker_reason) ?? null;
  return {
    task,
    primaryState,
    automationState,
    primaryLabel: task.primaryStateLabel ?? t(PRIMARY_STATE_LABEL_KEYS[primaryState]),
    automationLabel: task.automationStateLabel ?? t(AUTOMATION_STATE_LABEL_KEYS[automationState]),
    agentLabel: task.agentDisplayName ?? task.domainLabel ?? task.domainId ?? t('common.runtime.unknownDomain'),
    projectLabel: task.projectDisplayName ?? task.projectId ?? task.studyId ?? task.title,
    taskLabel: task.workItemDisplayName ?? task.title,
    stageLabel: task.stage ?? task.activeStageId ?? null,
    elapsedLabel: stageElapsed,
    livenessLabel,
    stageUsageLabel: task.stageUsage ?? t('common.runtime.telemetryMissing'),
    totalUsageLabel: task.taskTotalUsage ?? t('common.runtime.telemetryMissing'),
    nextStep: task.nextStep ?? task.typedBlockerResolutionRef ?? null,
    ownerLabel: task.nextOwner ?? task.typedBlockerOwner ?? null,
    blockerSummary,
    latestActivityAt: task.lastProgressAt ?? lastHeartbeatAt ?? completedAt ?? null,
    currentnessTag:
      typeof task.masOwnerConsumptionMatchesRuntimeCloseout === 'boolean'
        ? task.masOwnerConsumptionMatchesRuntimeCloseout
          ? t('common.runtime.masOwnerConsumptionCurrent')
          : t('common.runtime.masOwnerConsumptionDrift')
        : null,
  };
}

function buildOverviewSections(
  tasks: RuntimeTaskDrilldown[],
  scope: RuntimeScopeOption | null,
  controlStates: RuntimeSnapshot[],
  t: (key: string, options?: Record<string, string | number>) => string
): {
  sections: RuntimeOverviewSection[];
  latestActivityAt: string | null;
  automationRunningCount: number;
  counts: Record<RuntimeTaskPrimaryState, number>;
} {
  const filtered = tasks.filter((task) => scopeMatchesTask(task, scope));
  const items = filtered.map((task) => runtimeTaskItem(task, controlStates, t));
  const byState = new Map<RuntimeTaskPrimaryState, RuntimeOverviewTaskItem[]>();
  PRIMARY_STATE_ORDER.forEach((state) => byState.set(state, []));
  items.forEach((item) => {
    byState.get(item.primaryState)?.push(item);
  });
  const sections = PRIMARY_STATE_ORDER.map((state) => {
    const stateItems = (byState.get(state) ?? []).toSorted((left, right) =>
      (right.latestActivityAt ?? '').localeCompare(left.latestActivityAt ?? '') || left.task.title.localeCompare(right.task.title)
    );
    return {
      state,
      title: t(PRIMARY_STATE_LABEL_KEYS[state]),
      summary: t(groupSummaryKey(state), { count: stateItems.length }),
      tasks: stateItems,
    };
  });
  const latestActivityAt =
    items
      .map((item) => item.latestActivityAt)
      .filter((value): value is string => Boolean(value))
      .toSorted()
      .at(-1) ?? null;
  return {
    sections,
    latestActivityAt,
    automationRunningCount: items.filter((item) => item.automationState === 'automation_running').length,
    counts: {
      in_progress: byState.get('in_progress')?.length ?? 0,
      delivered_auto_paused: byState.get('delivered_auto_paused')?.length ?? 0,
      paused_waiting_for_direction: byState.get('paused_waiting_for_direction')?.length ?? 0,
      owner_decision_required: byState.get('owner_decision_required')?.length ?? 0,
      system_attention_required: byState.get('system_attention_required')?.length ?? 0,
    },
  };
}

function taskStatusItems(projects: RuntimeProjectProgress[], controlStates: RuntimeSnapshot[]): RuntimeTaskStatusItem[] {
  const controlIndex = buildControlStateIndex(controlStates);
  const projectItems: RuntimeTaskStatusItem[] = projects.map((project) => ({
    ...project,
    running: taskLooksRunning(project),
    currentAttemptState: null as string | null,
    providerStatus: null as string | null,
    lastHeartbeatAt: null as string | null,
    completedAt: null as string | null,
    livenessSource: null as string | null,
    blockerReason: null as string | null,
    stageStartedAt: null as string | null,
    usageTelemetryMissing: true,
  }));
  const enrichedItems = projectItems.map((project) => {
    const controlState = matchControlState(project, controlIndex);
    const providerRun = record(controlState?.provider_run);
    return {
      ...project,
      currentAttemptState: stringValue(controlState?.current_attempt_state),
      providerStatus: stringValue(providerRun.provider_status),
      lastHeartbeatAt: stringValue(providerRun.last_heartbeat_at),
      completedAt: stringValue(providerRun.completed_at),
      livenessSource: stringValue(providerRun.liveness_source),
      blockerReason: stringValue(controlState?.blocker_reason),
      stageStartedAt: pickStageStartedAt(controlState),
      usageTelemetryMissing: usageTelemetryMissing(controlState),
    };
  });
  if (enrichedItems.length > 0) {
    return enrichedItems.toSorted((left, right) => {
      if (left.running !== right.running) return left.running ? -1 : 1;
      if (left.needsAttention !== right.needsAttention) return left.needsAttention ? -1 : 1;
      return left.title.localeCompare(right.title);
    });
  }
  return [];
}

function taskLooksQueued(task: RuntimeTaskStatusItem): boolean {
  return (
    (task.statusRaw ? QUEUED_STATES.has(task.statusRaw) : false) ||
    (task.stateRaw ? QUEUED_STATES.has(task.stateRaw) : false) ||
    (task.priorityBucket !== null && task.priorityBucket === 'waiting') ||
    task.progressClassRaw === 'human_gate'
  );
}

function buildTaskOverview(projects: RuntimeProjectProgress[], controlStates: RuntimeSnapshot[]): RuntimeTaskOverview {
  const tasks = taskStatusItems(projects, controlStates);
  const runningTasks = tasks.filter((task) => task.running);
  const attentionTasks = tasks.filter((task) => !task.running && task.needsAttention);
  const inactiveTasks = tasks.filter((task) => !task.running && !task.needsAttention);
  const runningTaskCount = runningTasks.length;
  const activeProjectCount = projects.length;
  const queuedTaskCount = tasks.filter(taskLooksQueued).length;
  const attentionTaskCount = tasks.filter((task) => task.needsAttention).length;
  const latestActivityAt =
    tasks
      .map((task) => task.lastProgressAt)
      .filter((value): value is string => Boolean(value))
      .toSorted()
      .at(-1) ?? null;
  return {
    runningTaskCount,
    activeProjectCount,
    queuedTaskCount,
    attentionTaskCount,
    latestActivityAt,
    tasks,
    runningTasks,
    attentionTasks,
    inactiveTasks,
  };
}

function summarizeProjectProgress(projects: RuntimeProjectProgress[], lanes: RuntimeSnapshot[]) {
  const maintenanceAttention = lanes.reduce((total, lane) => total + (numberValue(lane.blocked_task_count) ?? 0), 0);
  return {
    total: projects.length,
    attention: projects.filter((project) => project.needsAttention).length,
    maintenanceAttention,
  };
}

function appStateToRuntimeProjection(appState: RuntimeSnapshot): RuntimeSnapshot | null {
  if (Object.keys(appState).length === 0) return null;
  const operator = oplRecord(appState.operator);
  const provider = oplRecord(appState.provider);
  const temporal = oplRecord(provider.temporal);
  const actions = [
    ...oplRecordList(appState.actions),
    ...oplRecordList(operator.actions),
    ...oplRecordList(oplRecord(operator.action_queue).items),
  ].filter((action) => isAppActionBoundary(action) && isPayloadFreeAppAction(action));
  const firstAction = actions[0] ?? {};
  return {
    availability:
      oplString(operator.availability) ?? oplString(appState.availability) ?? oplString(temporal.status) ?? 'available',
    summary: oplRecord(operator.summary),
    attention_first_payload: {
      provider_health: {
        provider_kind: 'temporal',
        health_status: oplString(temporal.status) ?? oplString(temporal.health_status) ?? 'unknown',
      },
      next_safe_action: compactAction(firstAction),
      lazy_load_targets: oplRecordList(operator.lazy_load_targets),
    },
    app_execution_bridge: {
      safe_action_routes: actions.map(compactAction),
    },
    operator_action_routing_refs: {
      refs: actions.map(compactAction),
    },
    runtime_workbench: oplRecord(operator.workbench),
    visual_ref_groups: oplRecord(operator.visual_ref_groups),
  };
}

const RuntimePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [message, contextHolder] = Message.useMessage();
  const appStateQuery = useOplAppState('fast');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const [summaryDrilldown, setSummaryDrilldown] = useState<RuntimeSnapshot | null>(null);
  const [fullDetailDrilldown, setFullDetailDrilldown] = useState<RuntimeSnapshot | null>(null);
  const [fullDetailDigest, setFullDetailDigest] = useState<RuntimeSnapshot | null>(null);
  const [actionResult, setActionResult] = useState<RuntimeSnapshot | null>(null);
  const messageRef = useRef(message);
  const tRef = useRef(t);
  const requestSeq = useRef({ summary: 0, full: 0 });
  const runningRefreshInFlight = useRef(false);
  const [selectedScopeId, setSelectedScopeId] = useState<string | null>(null);

  useEffect(() => {
    messageRef.current = message;
  }, [message]);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const appStateProjection = useMemo(
    () => appStateToRuntimeProjection(appStateQuery.appState),
    [appStateQuery.appState]
  );
  const runtimeModel = useMemo(() => normalizeRuntimeProjection(appStateQuery.appState), [appStateQuery.appState]);
  const userTaskDrilldown = appStateProjection;
  const displayDrilldown = fullDetailDrilldown ?? summaryDrilldown ?? appStateProjection;
  const actionDrilldown = useMemo(() => {
    const safeActionCount = collectSafeActions(displayDrilldown ?? {}).length;
    if (safeActionCount > 0 || !appStateProjection) return displayDrilldown;
    return appStateProjection;
  }, [appStateProjection, displayDrilldown]);
  const loading = appStateQuery.loading || appStateQuery.refreshing || summaryLoading;
  const lastLoadedAt = appStateQuery.loadedAt;

  const loadSummaryDrilldown = useCallback(async (options: { showToast?: boolean } = {}) => {
    requestSeq.current.summary += 1;
    const requestId = requestSeq.current.summary;
    setSummaryLoading(true);
    try {
      const result = await ipcBridge.oplRuntime.getDrilldown.invoke({ detail: 'summary' });
      if (requestSeq.current.summary !== requestId) return;
      const parsed =
        parseDrilldown(result.stdout) ??
        compactDrilldown(record(record(parseBridgePayload(result)).app_operator_drilldown));
      setSummaryDrilldown(parsed);
      setFullDetailDrilldown(null);
      setFullDetailDigest(null);
      if (options.showToast) {
        messageRef.current.success(tRef.current('common.refreshSuccess'));
      }
    } catch {
      if (options.showToast) {
        messageRef.current.error(tRef.current('settings.oplEnvironmentPage.messages.commandFailed'));
      }
    } finally {
      if (requestSeq.current.summary === requestId) {
        setSummaryLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadSummaryDrilldown();
  }, [loadSummaryDrilldown]);

  const refreshAppState = useCallback(
    async (showToast = false) => {
      const nextPayload = await appStateQuery.load('fast', { showRefreshing: true });
      await loadSummaryDrilldown({ showToast: false });
      if (showToast && !nextPayload) {
        messageRef.current.error(tRef.current('settings.oplEnvironmentPage.messages.commandFailed'));
      } else if (showToast) {
        messageRef.current.success(tRef.current('common.refreshSuccess'));
      }
    },
    [appStateQuery.load, loadSummaryDrilldown]
  );

  const loadFullDrilldown = useCallback(async (options: { showToast?: boolean } = {}) => {
    requestSeq.current.full += 1;
    const requestId = requestSeq.current.full;
    setDetailLoading(true);
    try {
      const result = await ipcBridge.oplRuntime.getDrilldown.invoke({ detail: 'full' });
      if (requestSeq.current.full !== requestId) return;
      const parsed =
        parseDrilldown(result.stdout) ??
        compactDrilldown(record(record(parseBridgePayload(result)).app_operator_drilldown));
      setFullDetailDrilldown(parsed);
      setFullDetailDigest(parsed ? detailDigest(parsed) : null);
      if (options.showToast) {
        messageRef.current.success(tRef.current('common.runtime.detailFullLoaded'));
      }
    } catch {
      if (options.showToast) {
        messageRef.current.error(tRef.current('settings.oplEnvironmentPage.messages.commandFailed'));
      }
    } finally {
      if (requestSeq.current.full === requestId) {
        setDetailLoading(false);
      }
    }
  }, []);

  const actions = useMemo(() => collectSafeActions(actionDrilldown ?? {}), [actionDrilldown]);
  const summary = useMemo(() => summaryEntries(displayDrilldown ?? {}, t), [displayDrilldown, t]);
  const lanes = useMemo(() => workbenchDomainLanes(userTaskDrilldown ?? {}), [userTaskDrilldown]);
  const moduleStatusItems = useMemo(() => parseModuleStatusItems(appStateQuery.appState, t), [appStateQuery.appState, t]);
  const controlStates = useMemo(() => currentControlStateRecords(displayDrilldown ?? {}), [displayDrilldown]);
  const maintenanceAttentionCount = useMemo(
    () => lanes.reduce((total, lane) => total + (numberValue(lane.blocked_task_count) ?? 0), 0),
    [lanes]
  );
  const runtimeScope = runtimeModel.scope;
  const selectedScope =
    runtimeScope.options.find((option) => option.id === selectedScopeId) ??
    runtimeScope.current ??
    runtimeScope.options[0] ??
    null;
  const scopeLabel = useMemo(() => {
    if (!selectedScope) return t('common.runtime.scopeSource.default_global');
    if (selectedScope.kind === 'all_projects') return t('common.runtime.scopeSource.default_global');
    return selectedScope.label;
  }, [selectedScope, t]);
  const overview = useMemo(
    () => buildOverviewSections(runtimeModel.taskRunProjectionV2.tasks, selectedScope, controlStates, t),
    [controlStates, runtimeModel.taskRunProjectionV2.tasks, selectedScope, t]
  );
  const refs = useMemo(() => evidenceRefs(displayDrilldown ?? {}), [displayDrilldown]);

  useEffect(() => {
    const currentScopeId = runtimeScope.current?.id ?? runtimeScope.options[0]?.id ?? null;
    setSelectedScopeId((previous) => {
      if (!previous) return currentScopeId;
      return runtimeScope.options.some((option) => option.id === previous) ? previous : currentScopeId;
    });
  }, [runtimeScope.current, runtimeScope.options]);

  useEffect(() => {
    if (overview.automationRunningCount <= 0) return undefined;
    const timer = window.setInterval(() => {
      if (runningRefreshInFlight.current) return;
      runningRefreshInFlight.current = true;
      void refreshAppState(false).finally(() => {
        runningRefreshInFlight.current = false;
      });
    }, RUNTIME_RUNNING_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [overview.automationRunningCount, refreshAppState]);

  const dryRunAction = useCallback(async (actionId: string) => {
    setRunningActionId(actionId);
    try {
      const result = await ipcBridge.oplRuntime.executeAction.invoke({
        actionId,
        dryRun: true,
      });
      setActionResult(parseBridgePayload(result) ?? {});
      messageRef.current.success(tRef.current('common.runtime.dryRunSuccess'));
    } catch {
      setActionResult({ stderr: tRef.current('settings.oplEnvironmentPage.messages.commandFailed') });
      messageRef.current.error(tRef.current('common.runtime.dryRunFailed'));
    } finally {
      setRunningActionId(null);
    }
  }, []);

  const renderTaskItem = useCallback(
    (item: RuntimeOverviewTaskItem) => {
      const { task } = item;
      return (
        <div key={task.taskId} className='py-12px'>
          <div className='flex flex-col md:flex-row md:items-start md:justify-between gap-8px'>
            <div className='min-w-0'>
              <Typography.Text className='block font-600 text-t-primary break-words'>{item.taskLabel}</Typography.Text>
              <Typography.Text className='block text-12px text-t-secondary break-words mt-2px'>
                {item.projectLabel}
              </Typography.Text>
            </div>
            <Space wrap size='mini'>
              <Tag color={item.primaryState === 'in_progress' ? 'blue' : item.primaryState === 'system_attention_required' ? 'orange' : 'green'}>
                {item.primaryLabel}
              </Tag>
              <Tag>{item.automationLabel}</Tag>
              {item.currentnessTag && (
                <Tag color={task.masOwnerConsumptionMatchesRuntimeCloseout ? 'green' : 'orange'}>{item.currentnessTag}</Tag>
              )}
            </Space>
          </div>
          <div className='mt-8px grid grid-cols-1 md:grid-cols-2 gap-8px'>
            <Typography.Text className='block text-12px text-t-secondary break-words'>
              {t('common.runtime.agentModule', { agent: item.agentLabel })}
            </Typography.Text>
            <Typography.Text className='block text-12px text-t-secondary break-words'>
              {t('common.runtime.projectTask', { task: item.projectLabel })}
            </Typography.Text>
            {item.stageLabel && (
              <Typography.Text className='block text-13px text-t-primary break-words'>
                {t('common.runtime.currentStage', { stage: item.stageLabel })}
              </Typography.Text>
            )}
            <Typography.Text className='block text-12px text-t-secondary break-words'>
              {t('common.runtime.stageElapsed', {
                value: item.elapsedLabel ?? t('common.runtime.telemetryMissing'),
              })}
            </Typography.Text>
            <Typography.Text className='block text-12px text-t-secondary break-words'>
              {t('common.runtime.runningProof', { proof: item.livenessLabel })}
            </Typography.Text>
            <Typography.Text className='block text-12px text-t-secondary break-words'>
              {t('common.runtime.stageUsage', { value: item.stageUsageLabel })}
            </Typography.Text>
            <Typography.Text className='block text-12px text-t-secondary break-words'>
              {t('common.runtime.totalUsage', { value: item.totalUsageLabel })}
            </Typography.Text>
            {item.ownerLabel && (
              <Typography.Text className='block text-13px text-t-primary break-words'>
                {t('common.runtime.nextOwner', { owner: item.ownerLabel })}
              </Typography.Text>
            )}
            {item.blockerSummary && (
              <Typography.Text className='block md:col-span-2 text-12px text-t-secondary break-words'>
                {t('common.runtime.blockerSummaryLine', { summary: item.blockerSummary })}
              </Typography.Text>
            )}
            {item.nextStep && (
              <Typography.Text className='block md:col-span-2 text-13px text-t-primary break-words'>
                {t('common.runtime.blockerRoute', { route: item.nextStep })}
              </Typography.Text>
            )}
            {item.latestActivityAt && (
              <Typography.Text className='block text-12px text-t-secondary break-words'>
                {t('common.runtime.lastProgressAt', { time: item.latestActivityAt })}
              </Typography.Text>
            )}
          </div>
        </div>
      );
    },
    [t]
  );

  return (
    <div className='w-full h-full overflow-auto px-24px md:px-48px py-28px box-border'>
      {contextHolder}
      <div className='max-w-1080px mx-auto flex flex-col gap-16px'>
        <div className='flex flex-col gap-12px md:flex-row md:items-end md:justify-between'>
          <div>
            <Typography.Title heading={4} className='mb-6px'>
              {t('common.runtime.title')}
            </Typography.Title>
            <Typography.Text className='text-t-secondary'>{t('common.runtime.description')}</Typography.Text>
          </div>
          <div className='flex gap-8px'>
            <Button onClick={() => navigate(resolveLegacySettingsRoute('runtime'))}>
              {t('common.runtime.settings')}
            </Button>
            <Button
              type='primary'
              icon={<UpdateRotation theme='outline' />}
              loading={loading}
              onClick={() => void refreshAppState(true)}
            >
              {t('common.refresh')}
            </Button>
          </div>
        </div>

        <Card bordered className='rd-8px' data-testid='runtime-scope-card'>
          <div className='flex flex-col gap-12px md:flex-row md:items-end md:justify-between'>
            <div className='min-w-0 flex-1'>
              <Typography.Text className='block font-600 text-t-primary'>
                {t('common.runtime.scopeSelector')}
              </Typography.Text>
              <Typography.Text className='block text-12px text-t-secondary break-words mt-4px'>
                {t('common.runtime.scopeSourceLabel', {
                      source: t(`common.runtime.scopeSource.${runtimeScope.source}`),
                    })}
              </Typography.Text>
              {runtimeScope.inferredHint && (
                <Typography.Text className='block text-12px text-t-secondary break-words mt-4px'>
                  {t('common.runtime.scopeInferredHint', { hint: runtimeScope.inferredHint })}
                </Typography.Text>
              )}
            </div>
            <Select
              className='min-w-240px'
              data-testid='runtime-scope-selector'
              value={selectedScope?.id}
              onChange={(value) => setSelectedScopeId(String(value))}
              options={runtimeScope.options.map((option) => ({
                label: option.kind === 'all_projects' ? t('common.runtime.scopeSource.default_global') : option.label,
                value: option.id,
              }))}
            />
          </div>
        </Card>

        <Card bordered className='rd-8px'>
          <div className='flex items-center justify-between gap-16px'>
            <div className='min-w-0'>
              <Typography.Text className='block font-600 text-t-primary'>
                {t('common.runtime.drilldownStatus')}
              </Typography.Text>
              {lastLoadedAt && (
                <Typography.Text className='block text-12px text-t-secondary'>
                  {t('common.runtime.loadedAt', { time: lastLoadedAt })}
                </Typography.Text>
              )}
            </div>
            <Tag color={displayDrilldown ? 'green' : 'orange'}>
              {loading
                ? displayDrilldown
                  ? t('common.runtime.refreshing')
                  : t('common.loading')
                : displayDrilldown
                  ? t('common.runtime.drilldownLoaded')
                  : t('common.runtime.drilldownUnavailable')}
            </Tag>
          </div>
        </Card>

        {displayDrilldown ? (
          <>
            <Card bordered className='rd-8px'>
              <div className='flex flex-col gap-12px'>
                <div className='flex flex-col gap-4px'>
                  <Typography.Text className='font-600 text-t-primary'>
                    {t('common.runtime.overviewTitle')}
                  </Typography.Text>
                  <Typography.Text className='text-13px text-t-secondary'>
                    {t('common.runtime.overviewSummaryText', {
                      scope: scopeLabel,
                      tasks: runtimeModel.taskRunProjectionV2.tasks.filter((task) => scopeMatchesTask(task, selectedScope)).length,
                      automation: overview.automationRunningCount,
                    })}
                  </Typography.Text>
                </div>
                <div className='grid grid-cols-1 md:grid-cols-5 gap-12px' data-testid='runtime-primary-summary'>
                  <div className='min-w-0 rounded-6px border border-border-1 px-12px py-10px'>
                    <Typography.Text className='block text-12px text-t-secondary'>
                      {t('common.runtime.primaryStates.inProgress')}
                    </Typography.Text>
                    <Typography.Text className='block font-600 text-t-primary'>
                      {overview.counts.in_progress}
                    </Typography.Text>
                  </div>
                  <div className='min-w-0 rounded-6px border border-border-1 px-12px py-10px'>
                    <Typography.Text className='block text-12px text-t-secondary'>
                      {t('common.runtime.primaryStates.deliveredAutoPaused')}
                    </Typography.Text>
                    <Typography.Text className='block font-600 text-t-primary'>
                      {overview.counts.delivered_auto_paused}
                    </Typography.Text>
                  </div>
                  <div className='min-w-0 rounded-6px border border-border-1 px-12px py-10px'>
                    <Typography.Text className='block text-12px text-t-secondary'>
                      {t('common.runtime.primaryStates.pausedWaitingForDirection')}
                    </Typography.Text>
                    <Typography.Text className='block font-600 text-t-primary'>
                      {overview.counts.paused_waiting_for_direction}
                    </Typography.Text>
                  </div>
                  <div className='min-w-0 rounded-6px border border-border-1 px-12px py-10px'>
                    <Typography.Text className='block text-12px text-t-secondary'>
                      {t('common.runtime.primaryStates.ownerDecisionRequired')}
                    </Typography.Text>
                    <Typography.Text className='block font-600 text-t-primary break-words'>
                      {overview.counts.owner_decision_required}
                    </Typography.Text>
                  </div>
                  <div className='min-w-0 rounded-6px border border-border-1 px-12px py-10px'>
                    <Typography.Text className='block text-12px text-t-secondary'>
                      {t('common.runtime.primaryStates.systemAttentionRequired')}
                    </Typography.Text>
                    <Typography.Text className='block font-600 text-t-primary break-words'>
                      {overview.counts.system_attention_required}
                    </Typography.Text>
                  </div>
                </div>
                <div className='flex flex-col gap-4px md:flex-row md:items-center md:justify-between'>
                  <Typography.Text className='text-12px text-t-secondary break-words'>
                    {t('common.runtime.automationRunningCount', { count: overview.automationRunningCount })}
                  </Typography.Text>
                  {overview.latestActivityAt && (
                    <Typography.Text className='text-12px text-t-secondary break-words'>
                      {t('common.runtime.latestActivityAt', { time: overview.latestActivityAt })}
                    </Typography.Text>
                  )}
                </div>
              </div>
            </Card>

            <Card bordered className='rd-8px'>
              <div className='flex flex-col gap-12px'>
                <Typography.Text className='font-600 text-t-primary'>
                  {t('common.runtime.runtimeGroupsTitle')}
                </Typography.Text>
                <Typography.Text className='text-13px text-t-secondary'>
                  {t('common.runtime.runtimeGroupsSummaryText', {
                    count: runtimeModel.taskRunProjectionV2.tasks.filter((task) => scopeMatchesTask(task, selectedScope)).length,
                  })}
                </Typography.Text>
                {overview.sections.some((section) => section.tasks.length > 0) ? (
                  <div className='flex flex-col gap-12px'>
                    {overview.sections
                      .filter((section) => section.tasks.length > 0)
                      .map((section) => (
                        <div key={section.state} className='flex flex-col gap-8px' data-testid={`runtime-group-${section.state}`}>
                          <div className='flex flex-col gap-2px'>
                            <Typography.Text className='font-600 text-t-primary'>{section.title}</Typography.Text>
                            <Typography.Text className='text-12px text-t-secondary'>{section.summary}</Typography.Text>
                          </div>
                          <div className='flex flex-col divide-y divide-border-1'>{section.tasks.map(renderTaskItem)}</div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <Alert type='info' content={t('common.runtime.noTasksInScope')} />
                )}
              </div>
            </Card>

            <Card bordered className='rd-8px'>
              <div className='flex flex-col gap-12px'>
                <Typography.Text className='font-600 text-t-primary'>
                  {t('common.runtime.moduleStatus')}
                </Typography.Text>
                <Typography.Text className='text-13px text-t-secondary'>
                  {t('common.runtime.moduleStatusSummaryText', {
                    healthy: moduleStatusItems.filter((item) => !item.needsAttention).length,
                    attention: moduleStatusItems.filter((item) => item.needsAttention).length,
                  })}
                </Typography.Text>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-12px'>
                  {moduleStatusItems.map((item) => (
                    <div key={item.id} className='rounded-6px border border-border-1 px-12px py-10px'>
                      <div className='flex items-start justify-between gap-10px'>
                        <Typography.Text className='font-600 text-t-primary break-words'>{item.title}</Typography.Text>
                        {item.statusLabel && <Tag color={item.needsAttention ? 'orange' : 'green'}>{item.statusLabel}</Tag>}
                      </div>
                      {item.detail && (
                        <Typography.Text className='block mt-6px text-12px text-t-secondary break-words'>
                          {item.detail}
                        </Typography.Text>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card bordered className='rd-8px'>
              <Collapse bordered={false}>
                <Collapse.Item
                  name='advanced-runtime'
                  header={
                    <div className='flex flex-col gap-2px'>
                      <Typography.Text className='font-600 text-t-primary'>
                        {t('common.runtime.advancedRuntimeDetails')}
                      </Typography.Text>
                      <Typography.Text className='text-12px text-t-secondary'>
                        {t('common.runtime.advancedRuntimeDetailsHint')}
                      </Typography.Text>
                    </div>
                  }
                >
                  <div className='flex flex-col gap-16px'>
                    <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-10px'>
                      <Typography.Text className='text-13px text-t-secondary'>
                        {t('common.runtime.fullDetailHint')}
                      </Typography.Text>
                      <Button
                        icon={<UpdateRotation theme='outline' />}
                        loading={detailLoading}
                        onClick={() => void loadFullDrilldown({ showToast: true })}
                      >
                        {t('common.runtime.fullDetail')}
                      </Button>
                    </div>

                    {lanes.length > 0 && (
                      <div className='flex flex-col gap-12px'>
                        <Typography.Text className='font-600 text-t-primary'>
                          {t('common.runtime.maintenanceAttention')}
                        </Typography.Text>
                        <Typography.Text className='text-13px text-t-secondary'>
                          {t('common.runtime.maintenanceAttentionSummaryText', {
                            count: maintenanceAttentionCount,
                          })}
                        </Typography.Text>
                        <div className='grid grid-cols-1 md:grid-cols-2 gap-12px'>
                          {lanes.map((lane, laneIndex) => {
                            const laneId = stringValue(lane.domain_id) ?? `lane-${laneIndex + 1}`;
                            return (
                              <div key={laneId} className='rounded-6px border border-border-1 px-12px py-10px'>
                                <div className='flex items-start justify-between gap-10px'>
                                  <Typography.Text className='font-600 text-t-primary break-words'>
                                    {stringValue(lane.lane_label) ?? laneId}
                                  </Typography.Text>
                                  <Space wrap size='mini'>
                                    {(numberValue(lane.blocked_task_count) ?? 0) > 0 && (
                                      <Tag color='orange'>{`${t('common.runtime.needAttention')}: ${numberValue(lane.blocked_task_count) ?? 0}`}</Tag>
                                    )}
                                  </Space>
                                </div>
                                <div className='mt-8px flex flex-col gap-6px'>
                                  {recordList(lane.tasks)
                                    .slice(0, 4)
                                    .map((task, taskIndex) => {
                                      const taskId = stringValue(task.task_id);
                                      return (
                                        <div key={taskId ?? taskIndex} className='min-w-0'>
                                          <Typography.Text className='block text-13px text-t-primary break-words'>
                                            {stringValue(task.label) ?? taskFallbackLabel(taskId, taskIndex)}
                                          </Typography.Text>
                                          <Space wrap size='mini' className='mt-4px'>
                                            {stringValue(task.state) && (
                                              <Tag>{translateMappedValue(task.state, PROJECT_STATE_KEYS, t)}</Tag>
                                            )}
                                            {stringValue(task.active_stage_id) && (
                                              <Tag>
                                                {stringValue(task.active_stage_label) ??
                                                  stringValue(task.active_stage_id)}
                                              </Tag>
                                            )}
                                          </Space>
                                        </div>
                                      );
                                    })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className='flex flex-col gap-12px'>
                      <Typography.Text className='font-600 text-t-primary'>
                        {t('common.runtime.diagnostics')}
                      </Typography.Text>
                      <div className='grid grid-cols-1 md:grid-cols-3 gap-12px'>
                        {summary.map((item) => (
                          <div key={item.key} className='min-w-0 rounded-6px border border-border-1 px-12px py-10px'>
                            <Typography.Text className='block text-12px text-t-secondary break-words'>
                              {item.label}
                            </Typography.Text>
                            <Typography.Text className='block font-600 text-t-primary break-words'>
                              {formatValue(item.value, t)}
                            </Typography.Text>
                          </div>
                        ))}
                      </div>
                    </div>

                    {refs.length > 0 && (
                      <div className='flex flex-col gap-12px'>
                        <Typography.Text className='font-600 text-t-primary'>
                          {t('common.runtime.evidenceRefs')}
                        </Typography.Text>
                        <div className='flex flex-col divide-y divide-border-1'>
                          {refs.map((ref) => (
                            <Typography.Text key={ref} className='block py-8px text-12px text-t-secondary break-all'>
                              {ref}
                            </Typography.Text>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className='flex flex-col gap-12px'>
                      <Typography.Text className='font-600 text-t-primary'>
                        {t('common.runtime.safeActions')}
                      </Typography.Text>
                      {actions.length > 0 ? (
                        <div className='flex flex-col divide-y divide-border-1'>
                          {actions.map((action) => {
                            const actionId = stringValue(action.action_id) ?? '';
                            return (
                              <div
                                key={actionId}
                                className='flex flex-col md:flex-row md:items-center md:justify-between gap-10px py-12px'
                              >
                                <div className='min-w-0'>
                                  <Typography.Text className='block font-600 text-t-primary break-all'>
                                    {actionId}
                                  </Typography.Text>
                                  <Space wrap size='mini' className='mt-6px'>
                                    {stringValue(action.action_kind) && <Tag>{stringValue(action.action_kind)}</Tag>}
                                    {stringValue(action.owner) && <Tag>{stringValue(action.owner)}</Tag>}
                                    {action.route_requires_domain_or_app_payload === true && (
                                      <Tag color='orange'>{t('common.runtime.payloadRequired')}</Tag>
                                    )}
                                  </Space>
                                </div>
                                <Button
                                  icon={<Play theme='outline' />}
                                  loading={runningActionId === actionId}
                                  disabled={!actionId}
                                  onClick={() => void dryRunAction(actionId)}
                                >
                                  {t('common.runtime.dryRun')}
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <Alert type='info' content={t('common.runtime.noSafeActions')} />
                      )}
                    </div>

                    {actionResult && (
                      <div>
                        <Typography.Text className='block font-600 text-t-primary mb-10px'>
                          {t('common.runtime.actionResult')}
                        </Typography.Text>
                        {(() => {
                          const resultSummary = actionResultSummary(actionResult);
                          const rows = [
                            {
                              key: 'preview',
                              label: t('common.runtime.actionPreviewSummary'),
                              value: resultSummary.preview,
                            },
                            {
                              key: 'receipt',
                              label: t('common.runtime.actionReceiptSummary'),
                              value: resultSummary.receipt,
                            },
                          ].filter((row): row is { key: string; label: string; value: string } => Boolean(row.value));
                          return rows.length > 0 ? (
                            <div className='mb-10px flex flex-col gap-4px'>
                              {rows.map((row) => (
                                <Typography.Text key={row.key} className='block text-12px text-t-secondary break-words'>
                                  {row.label}: {row.value}
                                </Typography.Text>
                              ))}
                            </div>
                          ) : null;
                        })()}
                        <pre className='m-0 max-h-360px overflow-auto text-12px leading-18px whitespace-pre-wrap break-words'>
                          {JSON.stringify(actionResult, null, 2)}
                        </pre>
                      </div>
                    )}

                    {fullDetailDigest && (
                      <div>
                        <Typography.Text className='block font-600 text-t-primary mb-10px'>
                          {t('common.runtime.fullDetail')}
                        </Typography.Text>
                        <Alert type='info' content={t('common.runtime.fullDetailReady')} />
                        <pre className='m-0 mt-12px max-h-180px overflow-auto text-12px leading-18px whitespace-pre-wrap break-words'>
                          {JSON.stringify(fullDetailDigest, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </Collapse.Item>
              </Collapse>
            </Card>
          </>
        ) : (
          <Alert type='info' content={t('common.runtime.drilldownUnavailableDescription')} />
        )}
      </div>
    </div>
  );
};

export default RuntimePage;
