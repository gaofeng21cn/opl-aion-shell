/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Collapse, Message, Modal, Select, Space, Tag, Typography } from '@arco-design/web-react';
import {
  Attention,
  BookOpen,
  Cube,
  Data,
  Experiment,
  FileText,
  Heartbeat,
  People,
  Play,
  Robot,
  UpdateRotation,
} from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import { canonicalizeOplProfessionalAgentId, getOplProfessionalAgentPackages } from '@/common/config/oplProductProfile';
import { resolveLegacySettingsRoute } from '@/renderer/pages/settings/registry/settingsRegistry';
import { normalizeRuntimeProjection } from '@/renderer/pages/settings/RuntimeSettings/runtimeProjection';
import type {
  RuntimeScopeOption,
  RuntimeTaskAutomationState,
  RuntimeTaskDrilldown,
  RuntimeTaskPrimaryState,
} from '@/renderer/pages/settings/RuntimeSettings/types';
import { oplRecord, oplRecordList, oplString, useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import styles from './RuntimePage.module.css';
import {
  readRuntimeTaskCockpitProjectionIndex,
  type RuntimeSystemAttentionProjection,
  type RuntimeTaskCockpitProjection,
  type RuntimeTokenObservation,
} from './runtimeCockpitProjection';

type RuntimeSnapshot = Record<string, unknown>;
const RUNTIME_RUNNING_REFRESH_MS = 30_000;
const TWO_LINE_CLAMP_STYLE: React.CSSProperties = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  overflow: 'hidden',
  wordBreak: 'break-word',
};
const ONE_LINE_CLAMP_STYLE: React.CSSProperties = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 1,
  overflow: 'hidden',
  wordBreak: 'break-word',
};

function isRecord(value: unknown): value is RuntimeSnapshot {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): RuntimeSnapshot {
  return isRecord(value) ? value : {};
}

function recordList(value: unknown): RuntimeSnapshot[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function keyedRecordList(value: unknown, idKey: string): RuntimeSnapshot[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  return Object.entries(record(value)).map(([id, entry]) => ({
    ...record(entry),
    [idKey]: record(entry)[idKey] ?? id,
  }));
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
      archived_attempts: recordList(record(drilldown.runtime_workbench).archived_attempts).slice(0, 25),
      activity_center: {
        active_projects: recordList(record(record(drilldown.runtime_workbench).activity_center).active_projects).slice(
          0,
          32
        ),
      },
      domain_lane_map: {
        lanes: recordList(record(record(drilldown.runtime_workbench).domain_lane_map).lanes).slice(0, 8),
      },
      work_item_projection_v1: {
        ...pickRecordFields(record(record(drilldown.runtime_workbench).work_item_projection_v1), [
          'surface_kind',
          'schema_version',
          'source_ref',
          'derived_from',
          'refs_only',
          'summary',
          'authority_boundary',
        ]),
        items: recordList(record(record(drilldown.runtime_workbench).work_item_projection_v1).items).slice(0, 12),
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

type RuntimeAgentAvailabilityState = 'available' | 'maintenance_required' | 'not_installed';

type RuntimeAgentAvailabilityItem = {
  id: string;
  title: string;
  availability: RuntimeAgentAvailabilityState;
  availabilityLabel: string;
  detail: string | null;
  activeTaskCount: number;
  automationRunningCount: number;
  latestActivityAt: string | null;
};

type ActionResultSummary = {
  preview: string | null;
  receipt: string | null;
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
  stageUsageLabel: string | null;
  totalUsageLabel: string | null;
  stageUsageMissingReason: string | null;
  totalUsageMissingReason: string | null;
  nextStep: string | null;
  ownerLabel: string | null;
  blockerSummary: string | null;
  systemAttention: RuntimeSystemAttentionSummary | null;
  latestActivityAt: string | null;
  currentnessTag: string | null;
};

type RuntimeModuleVisual = {
  icon: React.ReactNode;
  color: string;
  background: string;
};

type RuntimeUsageDisplay = {
  valueLabel: string | null;
  missingReason: string | null;
};

type RuntimeSystemAttentionSummary = {
  responsibleComponent: string;
  issueAndRepair: string;
  impact: string;
  expectedOutcome: string;
  diagnosticsRequired: boolean;
};

type RuntimeTaskStageMapItem = {
  key: string;
  label: string;
  value: string;
  color?: string;
};

type RuntimeTaskDetailRow = {
  key: string;
  label: string;
  value: string;
};

type RuntimeOverviewSection = {
  state: RuntimeTaskPrimaryState;
  title: string;
  summary: string;
  tasks: RuntimeOverviewTaskItem[];
};

type RuntimeSavedViewId = 'all' | 'automation_running' | 'owner_decision' | 'system_attention';

const RUNTIME_SAVED_VIEW_IDS: RuntimeSavedViewId[] = [
  'all',
  'automation_running',
  'owner_decision',
  'system_attention',
];

const PRIMARY_STATE_ORDER: RuntimeTaskPrimaryState[] = [
  'in_progress',
  'system_attention_required',
  'owner_decision_required',
  'delivered_auto_paused',
  'paused_waiting_for_direction',
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

const OPL_RUNTIME_LABELS: Record<string, string> = {
  bookforge: 'OPL Book Forge',
  mag: 'Med Auto Grant',
  mas: 'Med Auto Science',
  medautogrant: 'Med Auto Grant',
  medautoscience: 'Med Auto Science',
  obf: 'OPL Book Forge',
  oma: 'OPL Meta Agent',
  oplbookforge: 'OPL Book Forge',
  oplflow: 'OPL Flow',
  oplmetaagent: 'OPL Meta Agent',
  rca: 'RedCube AI',
  redcube: 'RedCube AI',
  redcubeai: 'RedCube AI',
};

const RUNTIME_STAGE_DISPLAY_LABELS: Record<string, { en: string; zh: string }> = {
  domainroutereconcileapply: {
    en: 'Sync project status / review runtime result',
    zh: '同步项目状态/复核运行结果',
  },
  submissionmilestonecandidatefollowthrough: {
    en: 'Submission package follow-up',
    zh: '投稿包后续处理',
  },
  submissionmilestonecandidatefollowthroughfollowthrough01: {
    en: 'Submission package follow-up',
    zh: '投稿包后续处理',
  },
  write: {
    en: 'Write',
    zh: '写作',
  },
  papercleanroomrebuildrequired: {
    en: 'Wait for paper rebuild decision',
    zh: '等待重新整理论文',
  },
};

const RUNTIME_TITLE_ACRONYMS = new Set(['ai', 'cvd', 'dm', 'dpcc', 'mas', 'mag', 'oma', 'opl', 'us']);

const ARCHIVABLE_TASK_STATES = new Set(['completed', 'failed', 'dead_lettered']);

function isArchivableTask(task: RuntimeTaskDrilldown): boolean {
  return (
    task.runtimeCloseoutObserved === true ||
    ARCHIVABLE_TASK_STATES.has(task.state ?? '') ||
    ARCHIVABLE_TASK_STATES.has(task.status ?? '')
  );
}

function humanLabelKey(value: string | null | undefined): string | null {
  const key = value?.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return key && key.length > 0 ? key : null;
}

function runtimeLabelFor(value: string | null | undefined): string | null {
  const key = humanLabelKey(value);
  return key ? (OPL_RUNTIME_LABELS[key] ?? null) : null;
}

function humanizeRuntimeActor(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  const mapped = runtimeLabelFor(text);
  if (mapped) return mapped;
  const parts = text.split(/[\s_:/-]+/).filter(Boolean);
  const prefix = runtimeLabelFor(parts[0]);
  if (prefix && parts.length > 1) return [prefix, ...parts.slice(1)].join(' ');
  return text;
}

function pathLeaf(value: string | null | undefined): string | null {
  const parts = value
    ?.trim()
    .split(/[\\/]+/)
    .filter(Boolean);
  return parts?.at(-1) ?? null;
}

function workspaceScopeValue(option: RuntimeScopeOption): string | null {
  return option.value ?? option.label ?? pathLeaf(option.workspacePath) ?? option.id;
}

function humanizeScopeOptionLabel(
  option: RuntimeScopeOption,
  t: (key: string, options?: Record<string, string | number>) => string
): string {
  if (option.kind === 'all_projects') return t('common.runtime.scopeSource.default_global');
  if (option.kind === 'agent') {
    return t('common.runtime.scopeOption.agent', {
      label: runtimeLabelFor(option.label) ?? runtimeLabelFor(option.value) ?? option.label,
    });
  }
  if (option.kind === 'workspace') {
    return t('common.runtime.scopeOption.project', {
      label:
        titleCaseRuntimeTitle(option.label) ??
        titleCaseRuntimeTitle(pathLeaf(option.workspacePath)) ??
        titleCaseRuntimeTitle(option.value) ??
        option.label,
    });
  }
  return t('common.runtime.scopeOption.project', {
    label: titleCaseRuntimeTitle(option.label) ?? titleCaseRuntimeTitle(option.value) ?? option.label,
  });
}

function moduleVisualFor(item: RuntimeAgentAvailabilityItem): RuntimeModuleVisual {
  const key = humanLabelKey(item.id) ?? humanLabelKey(item.title);
  if (key === 'medautoscience' || key === 'mas') {
    return {
      icon: <Experiment theme='outline' />,
      color: 'var(--color-blue-6)',
      background: 'var(--color-blue-light-1)',
    };
  }
  if (key === 'medautogrant' || key === 'mag') {
    return {
      icon: <FileText theme='outline' />,
      color: 'var(--color-green-6)',
      background: 'var(--color-green-light-1)',
    };
  }
  if (key === 'redcube' || key === 'redcubeai' || key === 'rca') {
    return {
      icon: <Cube theme='outline' />,
      color: 'var(--color-red-6)',
      background: 'var(--color-red-light-1)',
    };
  }
  if (key === 'oplbookforge' || key === 'bookforge' || key === 'obf') {
    return {
      icon: <BookOpen theme='outline' />,
      color: 'var(--color-orange-6)',
      background: 'var(--color-orange-light-1)',
    };
  }
  if (key === 'oplmetaagent' || key === 'oma') {
    return {
      icon: <Robot theme='outline' />,
      color: 'var(--color-purple-6)',
      background: 'var(--color-purple-light-1)',
    };
  }
  return {
    icon: <Data theme='outline' />,
    color: 'var(--color-gray-8)',
    background: 'var(--color-fill-2)',
  };
}

function isRawRuntimeStage(value: string): boolean {
  return value.length > 48 || /[:/]/.test(value) || (/[_-]/.test(value) && /^[a-z0-9_:/.-]+$/i.test(value));
}

function titleCaseRuntimeStage(value: string): string {
  const words = value
    .replace(/::/g, ' ')
    .replace(/[/_-]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0 && !/^\d+$/.test(word));
  const deduped = words.filter((word, index) => index === 0 || word.toLowerCase() !== words[index - 1]?.toLowerCase());
  return deduped
    .map((word) => {
      const lower = word.toLowerCase();
      return OPL_RUNTIME_LABELS[lower] ?? `${lower[0]?.toUpperCase() ?? ''}${lower.slice(1)}`;
    })
    .join(' ');
}

function isChineseRuntimeLanguage(language: string | null | undefined): boolean {
  return Boolean(language?.toLowerCase().startsWith('zh'));
}

function knownRuntimeStageLabel(value: string | null | undefined, language: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  const key = humanLabelKey(text);
  const label = key ? RUNTIME_STAGE_DISPLAY_LABELS[key] : null;
  if (!label) return null;
  return isChineseRuntimeLanguage(language) ? label.zh : label.en;
}

function runtimeStageLabel(value: string | null | undefined, language: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  const mapped = knownRuntimeStageLabel(text, language);
  if (mapped) return mapped;
  return isRawRuntimeStage(text) ? titleCaseRuntimeStage(text) : text;
}

function humanizeRuntimeStage(
  label: string | null | undefined,
  activeStageId: string | null | undefined,
  language: string | null | undefined
): string | null {
  const knownStage = knownRuntimeStageLabel(activeStageId, language);
  if (knownStage) return knownStage;
  const displayLabel = label?.trim();
  if (displayLabel && !isRawRuntimeStage(displayLabel)) return displayLabel;
  return runtimeStageLabel(displayLabel ?? activeStageId, language);
}

function isRawRuntimeTitle(value: string | null | undefined): boolean {
  const text = value?.trim();
  if (!text) return false;
  return /^[a-z0-9]+(?:[-_:/][a-z0-9]+){2,}$/i.test(text) || text.length > 64;
}

function titleCaseRuntimeTitle(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  if (!isRawRuntimeTitle(text)) return text;
  const words = text
    .replace(/::/g, ' ')
    .replace(/[/_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return words
    .map((word) => {
      const lower = word.toLowerCase();
      const mapped = OPL_RUNTIME_LABELS[lower];
      if (mapped) return mapped;
      if (RUNTIME_TITLE_ACRONYMS.has(lower)) return lower.toUpperCase();
      if (/^dm\d+$/i.test(word)) return word.toUpperCase();
      if (/^\d+$/.test(word)) return word;
      return `${lower[0]?.toUpperCase() ?? ''}${lower.slice(1)}`;
    })
    .join(' ');
}

function humanizeProjectLabel(task: RuntimeTaskDrilldown): string {
  const workItemName = titleCaseRuntimeTitle(task.workItemDisplayName);
  if (task.studyId && workItemName) return workItemName;
  const projectName = titleCaseRuntimeTitle(task.projectDisplayName);
  if (projectName && !isRawRuntimeTitle(task.projectDisplayName)) return projectName;
  const titleName = titleCaseRuntimeTitle(task.title);
  if (titleName && !isRawRuntimeTitle(task.title)) return titleName;
  return (
    projectName ??
    titleName ??
    titleCaseRuntimeTitle(task.projectId) ??
    titleCaseRuntimeTitle(task.studyId) ??
    task.taskId
  );
}

function humanizeProjectContextLabel(task: RuntimeTaskDrilldown): string | null {
  return titleCaseRuntimeTitle(task.projectDisplayName) ?? titleCaseRuntimeTitle(task.workspaceLabel) ?? null;
}

function normalizedDisplayLabel(value: string | null | undefined): string | null {
  const text = value?.trim().replace(/\s+/g, ' ').toLowerCase();
  return text && text.length > 0 ? text : null;
}

function shouldShowTaskLabel(projectLabel: string, taskLabel: string): boolean {
  return normalizedDisplayLabel(projectLabel) !== normalizedDisplayLabel(taskLabel);
}

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

function parseAgentAvailabilityItems(
  appState: RuntimeSnapshot,
  taskItems: RuntimeOverviewTaskItem[],
  t: (key: string, options?: Record<string, string | number>) => string
): RuntimeAgentAvailabilityItem[] {
  const taskStats = new Map<
    string,
    { activeTaskCount: number; automationRunningCount: number; latestActivityAt: string | null }
  >();
  taskItems.forEach((item) => {
    const actor = item.task.domainId ?? item.task.domainLabel ?? item.task.agentDisplayName ?? item.agentLabel;
    const key = canonicalizeOplProfessionalAgentId(actor);
    const current = taskStats.get(key) ?? { activeTaskCount: 0, automationRunningCount: 0, latestActivityAt: null };
    current.activeTaskCount += 1;
    if (item.automationState === 'automation_running') {
      current.automationRunningCount += 1;
    }
    if ((item.latestActivityAt ?? '') > (current.latestActivityAt ?? '')) {
      current.latestActivityAt = item.latestActivityAt;
    }
    taskStats.set(key, current);
  });
  const statsFor = (packageId: string) =>
    taskStats.get(canonicalizeOplProfessionalAgentId(packageId)) ?? {
      activeTaskCount: 0,
      automationRunningCount: 0,
      latestActivityAt: null,
    };

  const agentPackages = oplRecord(appState.agent_packages);
  const directory = oplRecord(agentPackages.directory);
  const statusIndex = oplRecord(agentPackages.status_index);
  const canonicalSurfacePresent = Object.keys(agentPackages).length > 0;
  const installedById = new Map(
    keyedRecordList(directory.installed_packages, 'package_id').flatMap((item) => {
      const packageId = oplString(item.package_id);
      return packageId ? [[canonicalizeOplProfessionalAgentId(packageId), item] as const] : [];
    })
  );
  const statusById = new Map(
    keyedRecordList(statusIndex.packages, 'package_id').flatMap((item) => {
      const packageId = oplString(item.package_id);
      return packageId ? [[canonicalizeOplProfessionalAgentId(packageId), item] as const] : [];
    })
  );
  const legacyById = new Map(
    oplRecordList(oplRecord(appState.modules).items).flatMap((item) => {
      const moduleId = oplString(item.module_id) ?? oplString(item.package_id);
      return moduleId ? [[canonicalizeOplProfessionalAgentId(moduleId), item] as const] : [];
    })
  );
  const availableStates = new Set(['available', 'ready', 'healthy', 'installed']);

  return getOplProfessionalAgentPackages()
    .filter((profile) => profile.installed_manageable)
    .map((profile) => {
      const id = canonicalizeOplProfessionalAgentId(profile.package_id);
      const installed = installedById.get(id);
      const status = statusById.get(id);
      const legacy = legacyById.get(id);
      const activationAction = oplRecord(status?.activation_action);
      const launchBlockedReason = oplString(status?.launch_blocked_reason);
      const explicitNotInstalled =
        oplString(activationAction.preparation_status) === 'not_installed' ||
        launchBlockedReason === 'package_not_installed';
      let availability: RuntimeAgentAvailabilityState;
      if (canonicalSurfacePresent) {
        if (explicitNotInstalled || (!installed && !status)) {
          availability = 'not_installed';
        } else if (
          status?.operational_ready === true &&
          status?.launch_allowed !== false &&
          launchBlockedReason === null
        ) {
          availability = 'available';
        } else if (
          typeof status?.operational_ready !== 'boolean' &&
          availableStates.has(oplString(status?.status) ?? '') &&
          status?.launch_allowed !== false
        ) {
          availability = 'available';
        } else {
          availability = 'maintenance_required';
        }
      } else {
        const legacyStatus = oplString(legacy?.status) ?? oplString(legacy?.health_status);
        if (!legacy || legacyStatus === 'missing') {
          availability = 'not_installed';
        } else if (availableStates.has(legacyStatus ?? '') && oplRecord(legacy.git).dirty !== true) {
          availability = 'available';
        } else {
          availability = 'maintenance_required';
        }
      }
      const stats = statsFor(id);
      return {
        id,
        title: profile.display_name,
        availability,
        availabilityLabel: t(`common.runtime.agentAvailability.status.${availability}`),
        detail:
          availability === 'maintenance_required'
            ? t('common.runtime.agentAvailability.maintenanceDetail')
            : availability === 'not_installed'
              ? t('common.runtime.agentAvailability.notInstalledDetail')
              : null,
        activeTaskCount: stats.activeTaskCount,
        automationRunningCount: stats.automationRunningCount,
        latestActivityAt: stats.latestActivityAt,
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
  task: {
    activeRunId: string | null;
    stageAttemptIds: string[];
  },
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

function formatClockTime(timestamp: string | null): string | null {
  if (!timestamp) return null;
  const epoch = Date.parse(timestamp);
  if (!Number.isFinite(epoch)) return null;
  const date = new Date(epoch);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatRecentActivityHint(
  timestamp: string | null,
  t: (key: string, options?: Record<string, string>) => string
): string {
  const elapsed = formatElapsedSince(timestamp, t);
  return elapsed ? t('common.runtime.recentActivityRelative', { elapsed }) : t('common.runtime.noRecentActivity');
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

function normalizeRuntimeActorScopeToken(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  const unprefixed = text.replace(/^agent:/i, '');
  return humanLabelKey(runtimeLabelFor(unprefixed)) ?? humanLabelKey(unprefixed);
}

function scopeDisplayOptions(
  options: RuntimeScopeOption[],
  t: (key: string, options?: Record<string, string | number>) => string
): RuntimeScopeOption[] {
  const seen = new Set<string>();
  const displayOptions = options.flatMap((option) => {
    if (!['all_projects', 'agent', 'project'].includes(option.kind)) return [];
    const label = humanizeScopeOptionLabel(option, t);
    const value = option.kind === 'workspace' ? (workspaceScopeValue(option) ?? option.value) : option.value;
    const key =
      option.kind === 'all_projects'
        ? option.kind
        : `${option.kind}:${option.kind === 'workspace' ? (option.workspacePath ?? value ?? option.id) : (humanLabelKey(label) ?? option.id)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...option, label, value }];
  });
  if (displayOptions.some((option) => option.kind === 'all_projects')) return displayOptions;
  return [
    {
      id: 'all-projects',
      kind: 'all_projects',
      label: t('common.runtime.scopeSource.default_global'),
      value: 'all_projects',
    },
    ...displayOptions,
  ];
}

function isModuleRuntimeTask(task: RuntimeTaskDrilldown): boolean {
  const hasProject = Boolean(
    normalizeScopeToken(task.projectId) ??
    normalizeScopeToken(task.projectDisplayName) ??
    normalizeScopeToken(task.studyId)
  );
  if (hasProject) return false;
  const stage = normalizeScopeToken(task.activeStageId ?? task.stage);
  return stage === 'module_runtime';
}

function taskDedupeKey(task: RuntimeTaskDrilldown): string {
  const agent = normalizeScopeToken(task.domainId ?? task.domainLabel ?? task.agentDisplayName) ?? 'unknown-agent';
  const project = normalizeScopeToken(task.projectId ?? task.projectDisplayName ?? task.studyId);
  const workItem = normalizeScopeToken(task.workItemDisplayName ?? task.title);
  if (project && workItem) return `project:${agent}:${project}:${workItem}`;
  if (project) return `project:${agent}:${project}`;
  const bindingAgnosticTaskId = task.taskId.replace(/:binding:[^:]+/g, '');
  return `task:${agent}:${normalizeScopeToken(bindingAgnosticTaskId) ?? normalizeScopeToken(task.title) ?? task.taskId}`;
}

function itemStateRank(item: RuntimeOverviewTaskItem): number {
  const primaryRank: Record<RuntimeTaskPrimaryState, number> = {
    in_progress: 80,
    delivered_auto_paused: 95,
    system_attention_required: 60,
    owner_decision_required: 50,
    paused_waiting_for_direction: 30,
  };
  const automationRank: Record<RuntimeTaskAutomationState, number> = {
    automation_running: 40,
    result_pending_terminalization: 30,
    automation_failed: 20,
    automation_idle: 0,
  };
  return primaryRank[item.primaryState] + automationRank[item.automationState];
}

function isMasPaperTask(task: RuntimeTaskDrilldown): boolean {
  const agent = humanLabelKey(task.domainId ?? task.domainLabel ?? task.agentDisplayName);
  const hasPaperIdentity = Boolean(task.studyId ?? task.projectId ?? task.projectDisplayName);
  return hasPaperIdentity && (agent === 'medautoscience' || agent === 'mas');
}

function taskTextForClassification(task: RuntimeTaskDrilldown): string {
  return [
    task.activeStageId,
    task.stage,
    task.title,
    task.workItemDisplayName,
    task.nextStep,
    task.runtimeCloseoutRef,
    task.masOwnerConsumedCloseoutRef,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();
}

function isSubmissionMilestoneFollowthrough(task: RuntimeTaskDrilldown): boolean {
  const text = taskTextForClassification(task);
  return (
    text.includes('submission_milestone_candidate') ||
    text.includes('submission milestone') ||
    text.includes('submission package') ||
    text.includes('followthrough')
  );
}

function isDeliveredPaperAutoPausedTask(task: RuntimeTaskDrilldown): boolean {
  if (!isMasPaperTask(task)) return false;
  if (task.primaryState === 'delivered_auto_paused') return true;
  if (task.masOwnerConsumptionStatus !== 'owner_consumed_route_checkpoint') return false;
  const status = normalizeScopeToken(task.status);
  const state = normalizeScopeToken(task.state);
  return Boolean(
    task.runtimeCloseoutObserved ||
    task.masOwnerConsumedCloseoutRef ||
    isSubmissionMilestoneFollowthrough(task) ||
    status === 'completed' ||
    state === 'completed'
  );
}

function isMasOwnerTypedBlockerPausedTask(task: RuntimeTaskDrilldown): boolean {
  if (!isMasPaperTask(task)) return false;
  if (task.automationState === 'automation_running' || task.automationState === 'result_pending_terminalization') {
    return false;
  }
  return (
    humanLabelKey(task.activeStageId ?? task.stage) === 'domainroutereconcileapply' &&
    humanLabelKey(task.typedBlockerSummary) === 'masowneranswertypedblockerobserved'
  );
}

function latestActivityTime(item: RuntimeOverviewTaskItem): number {
  const epoch = item.latestActivityAt ? Date.parse(item.latestActivityAt) : Number.NaN;
  return Number.isFinite(epoch) ? epoch : 0;
}

function shouldReplaceTaskItem(current: RuntimeOverviewTaskItem, candidate: RuntimeOverviewTaskItem): boolean {
  const currentRank = itemStateRank(current);
  const candidateRank = itemStateRank(candidate);
  if (candidateRank !== currentRank) return candidateRank > currentRank;
  const currentCompleteness = [
    current.stageLabel,
    current.ownerLabel,
    current.nextStep,
    current.task.stageUsage,
    current.task.taskTotalUsage,
  ].filter(Boolean).length;
  const candidateCompleteness = [
    candidate.stageLabel,
    candidate.ownerLabel,
    candidate.nextStep,
    candidate.task.stageUsage,
    candidate.task.taskTotalUsage,
  ].filter(Boolean).length;
  if (candidateCompleteness !== currentCompleteness) return candidateCompleteness > currentCompleteness;
  return latestActivityTime(candidate) > latestActivityTime(current);
}

function dedupeTaskItems(items: RuntimeOverviewTaskItem[]): RuntimeOverviewTaskItem[] {
  const byKey = new Map<string, RuntimeOverviewTaskItem>();
  for (const item of items) {
    const key = taskDedupeKey(item.task);
    const current = byKey.get(key);
    if (!current || shouldReplaceTaskItem(current, item)) {
      byKey.set(key, item);
    }
  }
  return Array.from(byKey.values());
}

function tokenMissingReasonLabel(
  reason: string | null,
  t: (key: string, options?: Record<string, string | number>) => string
): string {
  if (!reason) return t('common.runtime.tokenUsage.missingReason.notProvided');
  const normalized = reason
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
  if (normalized.includes('provider') && /(report|return|emit)/.test(normalized)) {
    return t('common.runtime.tokenUsage.missingReason.providerDidNotReport');
  }
  if (normalized.includes('not_measured') || normalized.includes('measurement_not_enabled')) {
    return t('common.runtime.tokenUsage.missingReason.notMeasured');
  }
  if (normalized.includes('not_applicable')) {
    return t('common.runtime.tokenUsage.missingReason.notApplicable');
  }
  if (normalized.includes('legacy') || normalized.includes('histor')) {
    return t('common.runtime.tokenUsage.missingReason.legacyRecord');
  }
  if (normalized.includes('telemetry') || normalized.includes('unavailable') || normalized.includes('missing')) {
    return t('common.runtime.tokenUsage.missingReason.telemetryUnavailable');
  }
  return t('common.runtime.tokenUsage.missingReason.unavailableDetail');
}

function combinedUsageLabel(
  item: RuntimeOverviewTaskItem,
  t: (key: string, options?: Record<string, string | number>) => string
): string {
  const hasStageUsage = Boolean(item.stageUsageLabel);
  const hasTotalUsage = Boolean(item.totalUsageLabel);
  if (item.stageUsageLabel && item.totalUsageLabel) {
    return t('common.runtime.usageStageAndTotal', { stage: item.stageUsageLabel, total: item.totalUsageLabel });
  }
  if (item.stageUsageLabel) {
    return t('common.runtime.tokenUsage.stageObservedTotalMissing', {
      stage: item.stageUsageLabel,
      reason: tokenMissingReasonLabel(item.totalUsageMissingReason, t),
    });
  }
  if (item.totalUsageLabel) {
    return t('common.runtime.tokenUsage.stageMissingTotalObserved', {
      total: item.totalUsageLabel,
      reason: tokenMissingReasonLabel(item.stageUsageMissingReason, t),
    });
  }
  if (!hasStageUsage && !hasTotalUsage) {
    const stageReason = tokenMissingReasonLabel(item.stageUsageMissingReason, t);
    const totalReason = tokenMissingReasonLabel(item.totalUsageMissingReason, t);
    return stageReason === totalReason
      ? t('common.runtime.tokenUsage.missingWithReason', { reason: stageReason })
      : t('common.runtime.tokenUsage.missingWithStageAndTotalReasons', {
          stageReason,
          totalReason,
        });
  }
  return t('common.runtime.tokenUsage.missingWithReason', {
    reason: t('common.runtime.tokenUsage.missingReason.notProvided'),
  });
}

function stagePathLabels(task: RuntimeTaskDrilldown, language: string | null | undefined, states: string[]): string[] {
  return task.activePath
    .filter((node) => states.includes((node.state ?? '').toLowerCase()))
    .map((node) => runtimeStageLabel(node.label ?? node.stageId ?? node.id, language))
    .filter((value): value is string => Boolean(value));
}

function taskStageMap(
  item: RuntimeOverviewTaskItem,
  t: (key: string, options?: Record<string, string | number>) => string,
  language: string | null | undefined
): RuntimeTaskStageMapItem[] {
  const empty = t('common.runtime.values.empty');
  const completedPath = stagePathLabels(item.task, language, ['done', 'completed', 'accepted', 'closed']);
  const completed =
    completedPath.at(-1) ??
    (item.task.runtimeCloseoutObserved || item.primaryState === 'delivered_auto_paused' ? item.primaryLabel : empty);
  const userWait = item.primaryState === 'owner_decision_required' ? (item.ownerLabel ?? item.primaryLabel) : empty;
  const systemWait =
    item.primaryState === 'system_attention_required' ||
    item.automationState === 'automation_failed' ||
    item.automationState === 'result_pending_terminalization'
      ? (item.systemAttention?.issueAndRepair ?? t('common.runtime.systemAttention.unknownWork'))
      : empty;
  return [
    {
      key: 'completed',
      label: t('common.runtime.taskDetails.stage.completed'),
      value: completed,
      color: completed === empty ? undefined : 'green',
    },
    {
      key: 'current',
      label: t('common.runtime.taskDetails.stage.current'),
      value: item.stageLabel ?? empty,
      color: 'blue',
    },
    {
      key: 'next',
      label: t('common.runtime.taskDetails.stage.next'),
      value: item.nextStep ?? item.automationLabel,
      color: 'cyan',
    },
    {
      key: 'waiting-user',
      label: t('common.runtime.taskDetails.stage.waitingUser'),
      value: userWait,
      color: userWait === empty ? undefined : 'purple',
    },
    {
      key: 'system-handling',
      label: t('common.runtime.taskDetails.stage.systemHandling'),
      value: systemWait,
      color: systemWait === empty ? undefined : 'orange',
    },
  ];
}

function taskDetailRows(
  item: RuntimeOverviewTaskItem,
  usageLabel: string,
  t: (key: string, options?: Record<string, string | number>) => string
): RuntimeTaskDetailRow[] {
  const empty = t('common.runtime.values.empty');
  const attemptCount = item.task.stageAttemptIds.length;
  const attemptValue = attemptCount > 0 ? String(attemptCount) : empty;
  const currentAttempt =
    attemptCount > 0
      ? t('common.runtime.taskDetails.currentAttemptValue', { current: attemptCount, count: attemptCount })
      : empty;
  return [
    {
      key: 'stage',
      label: t('common.runtime.taskDetails.currentStage'),
      value: item.stageLabel ?? t('common.runtime.noCurrentStage'),
    },
    {
      key: 'attempt-count',
      label: t('common.runtime.taskDetails.attemptCount'),
      value: attemptValue,
    },
    {
      key: 'current-attempt',
      label: t('common.runtime.taskDetails.currentAttempt'),
      value: currentAttempt,
    },
    {
      key: 'next',
      label: t('common.runtime.taskDetails.nextAction'),
      value: item.nextStep ?? t('common.runtime.nextStepUnavailable'),
    },
    {
      key: 'duration',
      label: t('common.runtime.taskDetails.duration'),
      value: item.elapsedLabel ?? t('common.runtime.durationMissing'),
    },
    {
      key: 'usage',
      label: t('common.runtime.taskDetails.usage'),
      value: usageLabel,
    },
    {
      key: 'heartbeat',
      label: t('common.runtime.taskDetails.heartbeat'),
      value: item.livenessLabel,
    },
  ];
}

function isRawRuntimeNextStep(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    value.length > 110 ||
    /stage[_ -]?attempt|workflow|current_control_state|owner-consumed|runtime closeout|paper-progress claim|receipt|readback|terminalization|operator attention|domain_route|reconcile/.test(
      normalized
    ) ||
    normalized.includes('opl runtime')
  );
}

function humanizeNextStep(
  rawStep: string | null | undefined,
  primaryState: RuntimeTaskPrimaryState,
  automationState: RuntimeTaskAutomationState,
  t: (key: string, options?: Record<string, string | number>) => string,
  language: string | null | undefined
): string | null {
  const raw = rawStep?.trim();
  if (!raw) {
    return automationState === 'result_pending_terminalization' && primaryState !== 'system_attention_required'
      ? t('common.runtime.primaryStates.systemAttentionRequired')
      : null;
  }
  const rawRuntimeStep = isRawRuntimeNextStep(raw);
  const stageStep = knownRuntimeStageLabel(raw, language);
  if (stageStep && !(rawRuntimeStep && /domain_route|reconcile/.test(raw.toLowerCase()))) return stageStep;
  if (!rawRuntimeStep) return raw;
  if (automationState === 'result_pending_terminalization') {
    return primaryState === 'system_attention_required'
      ? null
      : t('common.runtime.primaryStates.systemAttentionRequired');
  }
  if (automationState === 'automation_failed' || primaryState === 'system_attention_required') {
    return null;
  }
  if (primaryState === 'owner_decision_required') {
    return t('common.runtime.primaryStates.ownerDecisionRequired');
  }
  return t(AUTOMATION_STATE_LABEL_KEYS[automationState]);
}

function scopeMatchesTask(task: RuntimeTaskDrilldown, scope: RuntimeScopeOption | null): boolean {
  if (!scope || scope.kind === 'all_projects') return true;
  const scopeValue = normalizeScopeToken(scope.value ?? scope.label);
  if (!scopeValue) return true;
  const matches = (...values: Array<string | undefined>) =>
    values.map(normalizeScopeToken).some((value) => value === scopeValue);
  if (scope.kind === 'agent') {
    const actorScopeValue = normalizeRuntimeActorScopeToken(scope.value ?? scope.label);
    if (!actorScopeValue) return true;
    return [task.domainId, task.domainLabel, task.agentDisplayName]
      .map(normalizeRuntimeActorScopeToken)
      .some((value) => value === actorScopeValue);
  }
  if (scope.kind === 'workspace') {
    const scopeCandidates = new Set(
      [scope.value, scope.label, scope.id, scope.workspacePath, pathLeaf(scope.workspacePath)].map(normalizeScopeToken)
    );
    return [task.workspaceId, task.workspaceLabel]
      .map(normalizeScopeToken)
      .some((value) => value && scopeCandidates.has(value));
  }
  if (scope.kind === 'project') {
    return matches(task.projectScopeId, task.projectId, task.projectDisplayName, task.workspaceId, task.workspaceLabel);
  }
  return matches(task.taskId, task.title, task.workItemDisplayName, task.executionRunLabel);
}

function savedViewMatchesItem(
  item: Pick<RuntimeOverviewTaskItem, 'primaryState' | 'automationState'>,
  savedView: RuntimeSavedViewId
): boolean {
  if (savedView === 'all') return true;
  if (savedView === 'automation_running') return item.automationState === 'automation_running';
  if (savedView === 'owner_decision') return item.primaryState === 'owner_decision_required';
  if (savedView === 'system_attention') return item.primaryState === 'system_attention_required';
  return false;
}

function primaryStateForTask(task: RuntimeTaskDrilldown): RuntimeTaskPrimaryState {
  if (isDeliveredPaperAutoPausedTask(task)) return 'delivered_auto_paused';
  if (isMasOwnerTypedBlockerPausedTask(task)) return 'paused_waiting_for_direction';
  return task.primaryState ?? 'paused_waiting_for_direction';
}

function automationStateForTask(task: RuntimeTaskDrilldown): RuntimeTaskAutomationState {
  if (isDeliveredPaperAutoPausedTask(task)) return 'automation_idle';
  if (isMasOwnerTypedBlockerPausedTask(task)) return 'automation_idle';
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

function primaryStateAccent(state: RuntimeTaskPrimaryState): { color: string; background: string } {
  switch (state) {
    case 'in_progress':
      return { color: '#2563eb', background: '#eff6ff' };
    case 'system_attention_required':
      return { color: '#f97316', background: '#fff7ed' };
    case 'owner_decision_required':
      return { color: '#7c3aed', background: '#f5f3ff' };
    case 'delivered_auto_paused':
      return { color: '#059669', background: '#ecfdf5' };
    case 'paused_waiting_for_direction':
      return { color: '#64748b', background: '#f1f5f9' };
  }
}

function controlStateFallbackForTask(task: RuntimeTaskDrilldown, states: RuntimeSnapshot[]): RuntimeSnapshot | null {
  if (states.length === 0) return null;
  return matchControlState(
    {
      activeRunId: task.activeRunId ?? null,
      stageAttemptIds: task.stageAttemptIds,
    },
    buildControlStateIndex(states)
  );
}

function formatObservedTokenUsage(
  observation: Extract<RuntimeTokenObservation, { state: 'observed' }>,
  t: (key: string, options?: Record<string, string | number>) => string
): string | null {
  if (observation.totalTokens !== undefined) {
    return t('common.runtime.tokenUsage.count', { count: observation.totalTokens });
  }
  if (observation.inputTokens !== undefined && observation.outputTokens !== undefined) {
    return t('common.runtime.tokenUsage.inputAndOutput', {
      input: observation.inputTokens,
      output: observation.outputTokens,
    });
  }
  if (observation.inputTokens !== undefined) {
    return t('common.runtime.tokenUsage.inputOnly', { input: observation.inputTokens });
  }
  if (observation.outputTokens !== undefined) {
    return t('common.runtime.tokenUsage.outputOnly', { output: observation.outputTokens });
  }
  return observation.displayValue ?? null;
}

function displayUsage(
  value: string | null | undefined,
  observation: RuntimeTokenObservation | null | undefined,
  t: (key: string, options?: Record<string, string | number>) => string
): RuntimeUsageDisplay {
  if (observation?.state === 'observed') {
    return { valueLabel: formatObservedTokenUsage(observation, t), missingReason: null };
  }
  if (observation?.state === 'missing') {
    return { valueLabel: null, missingReason: observation.missingReason };
  }
  const text = value?.trim();
  if (!text) return { valueLabel: null, missingReason: null };
  const lower = text.toLowerCase();
  if (lower.includes('telemetry_status') || lower.includes('source_ref_count') || lower.includes('usage_ref')) {
    return { valueLabel: null, missingReason: null };
  }
  return { valueLabel: text, missingReason: null };
}

function userFacingAttentionText(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text || isRawRuntimeNextStep(text) || isRawRuntimeTitle(text)) return null;
  return text;
}

function systemAttentionSummary(
  task: RuntimeTaskDrilldown,
  projection: RuntimeSystemAttentionProjection | null | undefined,
  nextStep: string | null,
  ownerLabel: string | null,
  t: (key: string, options?: Record<string, string | number>) => string
): RuntimeSystemAttentionSummary {
  const conditionIssue = task.conditions.map((condition) => userFacingAttentionText(condition.message)).find(Boolean);
  const resolvedResponsibleComponent = humanizeRuntimeActor(projection?.responsibleComponent) ?? ownerLabel;
  const issue =
    userFacingAttentionText(projection?.issue) ??
    userFacingAttentionText(task.typedBlockerSummary) ??
    userFacingAttentionText(task.primaryStateReason) ??
    userFacingAttentionText(task.automationStateReason) ??
    conditionIssue ??
    null;
  const repairAction = userFacingAttentionText(projection?.repairAction) ?? nextStep;
  const impact = userFacingAttentionText(projection?.impact);
  const expectedOutcome = userFacingAttentionText(projection?.expectedOutcome);
  return {
    responsibleComponent: resolvedResponsibleComponent ?? t('common.runtime.systemAttention.unknownOwner'),
    issueAndRepair:
      issue && repairAction
        ? t('common.runtime.systemAttention.issueAndRepair', { issue, repair: repairAction })
        : (issue ?? repairAction ?? t('common.runtime.systemAttention.unknownWork')),
    impact: impact ?? t('common.runtime.systemAttention.unknownImpact'),
    expectedOutcome: expectedOutcome ?? t('common.runtime.systemAttention.unknownOutcome'),
    diagnosticsRequired: !(resolvedResponsibleComponent && issue && repairAction && impact && expectedOutcome),
  };
}

function runtimeTaskItem(
  task: RuntimeTaskDrilldown,
  controlStates: RuntimeSnapshot[],
  cockpitProjection: RuntimeTaskCockpitProjection | undefined,
  t: (key: string, options?: Record<string, string | number>) => string,
  language: string | null | undefined
): RuntimeOverviewTaskItem {
  const primaryState = primaryStateForTask(task);
  const automationState = automationStateForTask(task);
  const deliveredAutoPaused = isDeliveredPaperAutoPausedTask(task);
  const masOwnerPaused = isMasOwnerTypedBlockerPausedTask(task);
  const noActiveStage = primaryState !== 'in_progress' && automationState !== 'automation_running';
  const controlState = controlStateFallbackForTask(task, controlStates);
  const providerRun = record(controlState?.provider_run);
  const lastHeartbeatAt = task.lastHeartbeatAt ?? stringValue(providerRun.last_heartbeat_at);
  const completedAt = stringValue(providerRun.completed_at);
  const stageElapsed =
    formatElapsedSeconds(task.elapsedSeconds, t) ?? formatElapsedSince(pickStageStartedAt(controlState), t);
  const livenessLabel = lastHeartbeatAt
    ? t('common.runtime.runningProofHeartbeat', { time: lastHeartbeatAt })
    : task.runningProofRef
      ? task.runningProofRef
      : completedAt
        ? t('common.runtime.runningProofCompleted', {
            status:
              stringValue(providerRun.provider_status) ??
              stringValue(controlState?.current_attempt_state) ??
              t('common.runtime.values.empty'),
            time: completedAt,
          })
        : t('common.runtime.runningProofMissing');
  const blockerSummary =
    cockpitProjection?.systemAttention?.issue ??
    task.typedBlockerSummary ??
    stringValue(controlState?.blocker_reason) ??
    null;
  const projectedRepairAction = userFacingAttentionText(cockpitProjection?.systemAttention?.repairAction);
  const nextStep = deliveredAutoPaused
    ? t('common.runtime.waitingSubmissionInfo')
    : masOwnerPaused
      ? t('common.runtime.waitingNextDirection')
      : humanizeNextStep(
          projectedRepairAction ?? task.nextStep ?? task.typedBlockerResolutionRef,
          primaryState,
          automationState,
          t,
          language
        );
  const ownerLabel =
    noActiveStage && primaryState !== 'system_attention_required'
      ? null
      : (humanizeRuntimeActor(cockpitProjection?.systemAttention?.responsibleComponent) ??
        humanizeRuntimeActor(task.nextOwner ?? task.typedBlockerOwner));
  const stageUsage = displayUsage(task.stageUsage, cockpitProjection?.stageUsage, t);
  const totalUsage = displayUsage(task.taskTotalUsage, cockpitProjection?.taskTotalUsage, t);
  return {
    task,
    primaryState,
    automationState,
    primaryLabel:
      task.primaryState === primaryState && task.primaryStateLabel
        ? task.primaryStateLabel
        : t(PRIMARY_STATE_LABEL_KEYS[primaryState]),
    automationLabel:
      task.automationState === automationState && task.automationStateLabel
        ? task.automationStateLabel
        : t(AUTOMATION_STATE_LABEL_KEYS[automationState]),
    agentLabel:
      humanizeRuntimeActor(task.agentDisplayName) ??
      humanizeRuntimeActor(task.domainLabel) ??
      humanizeRuntimeActor(task.domainId) ??
      t('common.runtime.unknownDomain'),
    projectLabel: humanizeProjectLabel(task),
    taskLabel: titleCaseRuntimeTitle(task.workItemDisplayName) ?? titleCaseRuntimeTitle(task.title) ?? task.taskId,
    stageLabel: noActiveStage
      ? t('common.runtime.noCurrentStage')
      : humanizeRuntimeStage(task.stage, task.activeStageId, language),
    elapsedLabel: stageElapsed,
    livenessLabel,
    stageUsageLabel: stageUsage.valueLabel,
    totalUsageLabel: totalUsage.valueLabel,
    stageUsageMissingReason: stageUsage.missingReason,
    totalUsageMissingReason: totalUsage.missingReason,
    nextStep,
    ownerLabel,
    blockerSummary,
    systemAttention:
      primaryState === 'system_attention_required'
        ? systemAttentionSummary(task, cockpitProjection?.systemAttention, nextStep, ownerLabel, t)
        : null,
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
  savedView: RuntimeSavedViewId,
  controlStates: RuntimeSnapshot[],
  cockpitProjections: Map<string, RuntimeTaskCockpitProjection>,
  t: (key: string, options?: Record<string, string | number>) => string,
  language: string | null | undefined
): {
  sections: RuntimeOverviewSection[];
  latestActivityAt: string | null;
  automationRunningCount: number;
  counts: Record<RuntimeTaskPrimaryState, number>;
  visibleTaskCount: number;
} {
  const scopedTasks = tasks.filter((task) => scopeMatchesTask(task, scope) && !isModuleRuntimeTask(task));
  const items = dedupeTaskItems(
    scopedTasks.map((task) => runtimeTaskItem(task, controlStates, cockpitProjections.get(task.taskId), t, language))
  ).filter((item) => savedViewMatchesItem(item, savedView));
  const byState = new Map<RuntimeTaskPrimaryState, RuntimeOverviewTaskItem[]>();
  PRIMARY_STATE_ORDER.forEach((state) => byState.set(state, []));
  items.forEach((item) => {
    byState.get(item.primaryState)?.push(item);
  });
  const sections = PRIMARY_STATE_ORDER.map((state) => {
    const stateItems = (byState.get(state) ?? []).toSorted(
      (left, right) =>
        (right.latestActivityAt ?? '').localeCompare(left.latestActivityAt ?? '') ||
        left.task.title.localeCompare(right.task.title)
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
    visibleTaskCount: items.length,
    counts: {
      in_progress: byState.get('in_progress')?.length ?? 0,
      delivered_auto_paused: byState.get('delivered_auto_paused')?.length ?? 0,
      paused_waiting_for_direction: byState.get('paused_waiting_for_direction')?.length ?? 0,
      owner_decision_required: byState.get('owner_decision_required')?.length ?? 0,
      system_attention_required: byState.get('system_attention_required')?.length ?? 0,
    },
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
  const { t, i18n } = useTranslation();
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
  const [selectedSavedViewId, setSelectedSavedViewId] = useState<RuntimeSavedViewId>('all');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [pendingArchiveItem, setPendingArchiveItem] = useState<RuntimeOverviewTaskItem | null>(null);
  const runtimeLanguage = i18n.resolvedLanguage ?? i18n.language;

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
  const taskCockpitProjections = useMemo(
    () => readRuntimeTaskCockpitProjectionIndex(appStateQuery.appState),
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
  const controlStates = useMemo(() => currentControlStateRecords(displayDrilldown ?? {}), [displayDrilldown]);
  const maintenanceAttentionCount = useMemo(
    () => lanes.reduce((total, lane) => total + (numberValue(lane.blocked_task_count) ?? 0), 0),
    [lanes]
  );
  const runtimeScope = runtimeModel.scope;
  const displayScopeOptions = useMemo(() => scopeDisplayOptions(runtimeScope.options, t), [runtimeScope.options, t]);
  const selectedScope =
    displayScopeOptions.find((option) => option.id === selectedScopeId) ??
    displayScopeOptions.find((option) => option.id === runtimeScope.current?.id) ??
    displayScopeOptions[0] ??
    null;
  const scopeLabel = useMemo(() => {
    if (!selectedScope) return t('common.runtime.scopeSource.default_global');
    if (selectedScope.kind === 'all_projects') return t('common.runtime.scopeSource.default_global');
    return selectedScope.label;
  }, [selectedScope, t]);
  const overview = useMemo(
    () =>
      buildOverviewSections(
        runtimeModel.taskRunProjectionV2.tasks,
        selectedScope,
        selectedSavedViewId,
        controlStates,
        taskCockpitProjections,
        t,
        runtimeLanguage
      ),
    [
      controlStates,
      runtimeLanguage,
      runtimeModel.taskRunProjectionV2.tasks,
      selectedSavedViewId,
      selectedScope,
      t,
      taskCockpitProjections,
    ]
  );
  const agentAvailabilityItems = useMemo(
    () =>
      parseAgentAvailabilityItems(
        appStateQuery.appState,
        overview.sections.flatMap((section) => section.tasks),
        t
      ),
    [appStateQuery.appState, overview.sections, t]
  );
  const archivedAttempts = useMemo(
    () => recordList(record(displayDrilldown?.runtime_workbench).archived_attempts),
    [displayDrilldown]
  );
  const refs = useMemo(() => evidenceRefs(displayDrilldown ?? {}), [displayDrilldown]);
  const advancedTaskRefs = useMemo(
    () =>
      overview.sections
        .flatMap((section) => section.tasks)
        .map((item) => {
          const rows = [
            item.task.activeRunId ? t('common.runtime.activeRun', { run: item.task.activeRunId }) : null,
            item.task.stageAttemptIds.length > 0
              ? t('common.runtime.stageAttemptRefsWithCount', { count: item.task.stageAttemptIds.length })
              : null,
            item.task.runningProofRef ? t('common.runtime.runningProof', { proof: item.task.runningProofRef }) : null,
            item.task.nextStep && item.task.nextStep !== item.nextStep
              ? t('common.runtime.nextStep', { step: item.task.nextStep })
              : null,
            item.task.runtimeCloseoutRef
              ? t('common.runtime.closeoutEvidence', { ref: item.task.runtimeCloseoutRef })
              : null,
            item.task.masOwnerConsumptionStatus
              ? t('common.runtime.masOwnerConsumption', { status: item.task.masOwnerConsumptionStatus })
              : null,
            item.task.masOwnerConsumedStageAttemptId
              ? t('common.runtime.masOwnerConsumedAttempt', { attempt: item.task.masOwnerConsumedStageAttemptId })
              : null,
            item.currentnessTag,
          ].filter((row): row is string => Boolean(row));
          return { id: item.task.taskId, title: item.projectLabel, rows };
        })
        .filter((item) => item.rows.length > 0),
    [overview.sections, t]
  );
  const availableAgentCount = agentAvailabilityItems.filter((item) => item.availability === 'available').length;
  const maintenanceAgentCount = agentAvailabilityItems.filter(
    (item) => item.availability === 'maintenance_required'
  ).length;
  const notInstalledAgentCount = agentAvailabilityItems.filter((item) => item.availability === 'not_installed').length;
  const installedAgentCount = availableAgentCount + maintenanceAgentCount;
  const metricCards = [
    {
      key: 'in_progress',
      label: t('common.runtime.primaryStates.inProgress'),
      value: overview.counts.in_progress,
      color: '#2563eb',
      icon: <Play theme='outline' />,
    },
    {
      key: 'automation',
      label: t('common.runtime.automationStates.running'),
      value: overview.automationRunningCount,
      color: '#0f766e',
      icon: <Robot theme='outline' />,
    },
    {
      key: 'delivered_auto_paused',
      label: t('common.runtime.primaryStates.deliveredAutoPaused'),
      value: overview.counts.delivered_auto_paused,
      color: '#059669',
      icon: <Heartbeat theme='outline' />,
    },
    {
      key: 'owner_decision',
      label: t('common.runtime.primaryStates.ownerDecisionRequired'),
      value: overview.counts.owner_decision_required,
      color: '#7c3aed',
      icon: <People theme='outline' />,
    },
    {
      key: 'system_attention',
      label: t('common.runtime.primaryStates.systemAttentionRequired'),
      value: overview.counts.system_attention_required,
      color: '#c2410c',
      icon: <Attention theme='outline' />,
    },
  ];

  useEffect(() => {
    const currentScopeId =
      displayScopeOptions.find((option) => option.id === runtimeScope.current?.id)?.id ??
      displayScopeOptions[0]?.id ??
      null;
    setSelectedScopeId((previous) => {
      if (!previous) return currentScopeId;
      return displayScopeOptions.some((option) => option.id === previous) ? previous : currentScopeId;
    });
  }, [displayScopeOptions, runtimeScope.current]);

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

  const confirmArchiveTask = useCallback(async () => {
    if (!pendingArchiveItem) return;
    const item = pendingArchiveItem;
    const stageAttemptId = item.task.stageAttemptIds[0] ?? item.task.taskId;
    setRunningActionId(`archive:${stageAttemptId}`);
    try {
      const result = await ipcBridge.oplRuntime.executeAction.invoke({
        actionId: 'runtime_archive_attempt',
        payloadRefsOnlyJson: {
          stage_attempt_id: stageAttemptId,
          reason: 'user_archived_from_runtime_overview',
        },
        dryRun: false,
      });
      if (result.ok === false) {
        messageRef.current.error(result.error?.message ?? t('common.runtime.archiveTask.failed'));
        return;
      }
      setPendingArchiveItem(null);
      if (expandedTaskId === item.task.taskId) setExpandedTaskId(null);
      await refreshAppState(true);
      messageRef.current.success(t('common.runtime.archiveTask.success'));
    } finally {
      setRunningActionId(null);
    }
  }, [expandedTaskId, pendingArchiveItem, refreshAppState, t]);

  const restoreArchivedAttempt = useCallback(
    async (attempt: RuntimeSnapshot) => {
      const stageAttemptId = stringValue(attempt.stage_attempt_id);
      if (!stageAttemptId) return;
      setRunningActionId(`restore:${stageAttemptId}`);
      try {
        const result = await ipcBridge.oplRuntime.executeAction.invoke({
          actionId: 'runtime_restore_attempt',
          payloadRefsOnlyJson: {
            stage_attempt_id: stageAttemptId,
            reason: 'user_restored_from_runtime_overview',
          },
          dryRun: false,
        });
        if (result.ok === false) {
          messageRef.current.error(result.error?.message ?? t('common.runtime.archiveTask.restoreFailed'));
          return;
        }
        await refreshAppState(true);
        messageRef.current.success(t('common.runtime.archiveTask.restoreSuccess'));
      } finally {
        setRunningActionId(null);
      }
    },
    [refreshAppState, t]
  );

  const renderTaskRefCards = useCallback(
    (cards: RuntimeTaskDrilldown['evidenceCards']) =>
      cards.length > 0 ? (
        <div className='grid grid-cols-1 md:grid-cols-2 gap-10px'>
          {cards.map((card) => (
            <div key={card.id} className='rounded-6px border border-border-1 px-12px py-10px min-w-0'>
              <Typography.Text className='block font-600 text-t-primary break-words'>{card.label}</Typography.Text>
              {card.value && (
                <Typography.Text className='block mt-4px text-12px text-t-secondary break-words'>
                  {card.value}
                </Typography.Text>
              )}
              {card.ref && (
                <Typography.Text className='block mt-4px text-12px text-t-secondary break-all'>
                  {card.ref}
                </Typography.Text>
              )}
              {card.details.length > 0 && (
                <div className='mt-8px flex flex-col gap-3px'>
                  {card.details.map((detail) => (
                    <Typography.Text
                      key={`${card.id}-${detail.key}`}
                      className='block text-12px text-t-secondary break-words'
                    >
                      {detail.key}: {detail.value}
                    </Typography.Text>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Alert type='info' content={t('common.runtime.taskDetails.noItems')} />
      ),
    [t]
  );

  const renderTaskDetails = useCallback(
    (item: RuntimeOverviewTaskItem, usageLabel: string) => {
      const stageMap = taskStageMap(item, t, runtimeLanguage);
      const rows = taskDetailRows(item, usageLabel, t);
      const timelineRows = [
        item.latestActivityAt
          ? {
              key: 'last-progress',
              label: t('common.runtime.lastProgressAt', { time: item.latestActivityAt }),
            }
          : null,
        {
          key: 'heartbeat',
          label: item.livenessLabel,
        },
        item.blockerSummary
          ? {
              key: 'blocker',
              label: t('common.runtime.blockerSummaryLine', { summary: item.blockerSummary }),
            }
          : null,
      ].filter((row): row is { key: string; label: string } => Boolean(row));
      const sections = [
        { key: 'evidence', title: t('common.runtime.taskDetails.evidence'), cards: item.task.evidenceCards },
        { key: 'actions', title: t('common.runtime.taskDetails.actions'), cards: item.task.actionCards },
        { key: 'resources', title: t('common.runtime.taskDetails.resources'), cards: item.task.resourceRefs },
        { key: 'diagnostics', title: t('common.runtime.taskDetails.diagnostics'), cards: item.task.diagnosticsRefs },
      ];
      return (
        <div
          data-testid={`runtime-task-detail-${item.task.taskId}`}
          className='px-18px py-16px'
          style={{ borderTop: '1px solid #e5e7eb', background: '#f8fafc', minWidth: 0 }}
        >
          <div className='flex flex-col gap-16px'>
            <div className='flex flex-col gap-4px'>
              <Typography.Text className='font-600 text-t-primary'>
                {t('common.runtime.taskDetails.title', { task: item.projectLabel })}
              </Typography.Text>
              <Typography.Text className='text-13px text-t-secondary break-words'>{item.taskLabel}</Typography.Text>
            </div>

            <div className='flex flex-col gap-10px'>
              <Typography.Text className='font-600 text-t-primary'>
                {t('common.runtime.taskDetails.stageMap')}
              </Typography.Text>
              <div className='grid grid-cols-1 md:grid-cols-5 gap-8px'>
                {stageMap.map((stage) => (
                  <div key={stage.key} className='rounded-6px border border-border-1 bg-white px-10px py-8px min-w-0'>
                    <Typography.Text className='block text-12px text-t-secondary break-words'>
                      {stage.label}
                    </Typography.Text>
                    <Tag color={stage.color} className='mt-6px'>
                      {stage.value}
                    </Tag>
                  </div>
                ))}
              </div>
            </div>

            <div className='grid grid-cols-1 md:grid-cols-2 gap-10px'>
              {rows.map((row) => (
                <div key={row.key} className='rounded-6px border border-border-1 bg-white px-10px py-8px min-w-0'>
                  <Typography.Text className='block text-12px text-t-secondary break-words'>
                    {row.label}
                  </Typography.Text>
                  <Typography.Text className='block mt-4px text-13px text-t-primary break-words'>
                    {row.value}
                  </Typography.Text>
                </div>
              ))}
            </div>

            <div className='flex flex-col gap-8px'>
              <Typography.Text className='font-600 text-t-primary'>
                {t('common.runtime.taskDetails.timeline')}
              </Typography.Text>
              <div className='flex flex-col divide-y divide-border-1 rounded-6px border border-border-1 bg-white'>
                {timelineRows.map((row) => (
                  <Typography.Text
                    key={row.key}
                    className='block px-10px py-8px text-13px text-t-secondary break-words'
                  >
                    {row.label}
                  </Typography.Text>
                ))}
              </div>
            </div>

            {sections.map((section) => (
              <div key={section.key} className='flex flex-col gap-8px'>
                <Typography.Text className='font-600 text-t-primary'>{section.title}</Typography.Text>
                {renderTaskRefCards(section.cards)}
              </div>
            ))}
            {isArchivableTask(item.task) && (
              <div className='flex justify-end'>
                <Button status='warning' onClick={() => setPendingArchiveItem(item)}>
                  {t('common.runtime.archiveTask.confirm')}
                </Button>
              </div>
            )}
          </div>
        </div>
      );
    },
    [renderTaskRefCards, runtimeLanguage, t]
  );

  const renderTaskItem = useCallback(
    (item: RuntimeOverviewTaskItem) => {
      const { task } = item;
      const accent = primaryStateAccent(item.primaryState);
      const usageLabel = combinedUsageLabel(item, t);
      const expanded = expandedTaskId === task.taskId;
      const showTaskLabel = shouldShowTaskLabel(item.projectLabel, item.taskLabel);
      const projectContextLabel = humanizeProjectContextLabel(task);
      const showProjectContext = projectContextLabel && shouldShowTaskLabel(item.projectLabel, projectContextLabel);
      return (
        <React.Fragment key={task.taskId}>
          <div
            data-testid='runtime-task-row'
            className={styles.taskRow}
            style={{
              borderTop: '1px solid #e5e7eb',
              alignItems: 'start',
              padding: '14px 18px',
              background: '#fff',
            }}
          >
            <div className='flex items-start gap-10px min-w-0'>
              <span
                aria-hidden='true'
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: accent.color,
                  marginTop: 6,
                  flexShrink: 0,
                }}
              />
              <div className='min-w-0 flex-1'>
                <Typography.Text className='block font-600 text-t-primary' style={TWO_LINE_CLAMP_STYLE}>
                  {item.projectLabel}
                </Typography.Text>
                <div className='mt-5px flex flex-wrap items-center gap-6px min-w-0'>
                  <Tag size='small' color='blue'>
                    {item.agentLabel}
                  </Tag>
                  {showProjectContext && <Tag size='small'>{projectContextLabel}</Tag>}
                  {showTaskLabel && (
                    <Typography.Text className='text-12px text-t-secondary' style={ONE_LINE_CLAMP_STYLE}>
                      {item.taskLabel}
                    </Typography.Text>
                  )}
                  <Button size='mini' type='text' onClick={() => setExpandedTaskId(expanded ? null : task.taskId)}>
                    {expanded ? t('common.runtime.taskDetails.close') : t('common.runtime.taskDetails.open')}
                  </Button>
                </div>
              </div>
            </div>
            <div className='min-w-0'>
              <Typography.Text className={`${styles.mobileFieldLabel} text-12px text-t-secondary`}>
                {t('common.runtime.taskField.stage')}
              </Typography.Text>
              <Typography.Text className='block text-13px text-t-primary' style={TWO_LINE_CLAMP_STYLE}>
                {item.stageLabel ?? t('common.runtime.noCurrentStage')}
              </Typography.Text>
            </div>
            <div className='min-w-0'>
              <Typography.Text className={`${styles.mobileFieldLabel} text-12px text-t-secondary`}>
                {t('common.runtime.taskField.next')}
              </Typography.Text>
              <Typography.Text className='block text-13px text-t-primary' style={TWO_LINE_CLAMP_STYLE}>
                {item.nextStep ?? t('common.runtime.nextStepUnavailable')}
              </Typography.Text>
              {item.ownerLabel && (
                <Typography.Text className='block mt-4px text-12px text-t-secondary' style={ONE_LINE_CLAMP_STYLE}>
                  {t('common.runtime.nextOwner', { owner: item.ownerLabel })}
                </Typography.Text>
              )}
            </div>
            <div className='min-w-0'>
              <Typography.Text className={`${styles.mobileFieldLabel} text-12px text-t-secondary`}>
                {t('common.runtime.taskField.elapsed')} / {t('common.runtime.taskField.usage')}
              </Typography.Text>
              <Typography.Text className='block text-13px text-t-primary' style={ONE_LINE_CLAMP_STYLE}>
                {item.elapsedLabel ?? t('common.runtime.durationMissing')}
              </Typography.Text>
              <Typography.Text className='block mt-4px text-12px text-t-secondary' style={TWO_LINE_CLAMP_STYLE}>
                {usageLabel}
              </Typography.Text>
            </div>
            {item.systemAttention && (
              <div data-testid='runtime-system-attention-summary' className={styles.systemAttentionSummary}>
                {[
                  {
                    key: 'owner',
                    label: t('common.runtime.systemAttention.responsibleComponent'),
                    value: item.systemAttention.responsibleComponent,
                  },
                  {
                    key: 'work',
                    label: t('common.runtime.systemAttention.issueAndAction'),
                    value: item.systemAttention.issueAndRepair,
                  },
                  {
                    key: 'impact',
                    label: t('common.runtime.systemAttention.impact'),
                    value: item.systemAttention.impact,
                  },
                  {
                    key: 'outcome',
                    label: t('common.runtime.systemAttention.expectedOutcome'),
                    value: item.systemAttention.expectedOutcome,
                  },
                ].map((entry) => (
                  <div key={entry.key} className='min-w-0'>
                    <Typography.Text className='block text-12px text-t-secondary break-words'>
                      {entry.label}
                    </Typography.Text>
                    <Typography.Text className='block mt-3px text-13px text-t-primary break-words'>
                      {entry.value}
                    </Typography.Text>
                  </div>
                ))}
                {item.systemAttention.diagnosticsRequired && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <Button size='mini' type='text' onClick={() => setExpandedTaskId(expanded ? null : task.taskId)}>
                      {t('common.runtime.systemAttention.openDiagnostics')}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
          {expanded && renderTaskDetails(item, usageLabel)}
        </React.Fragment>
      );
    },
    [expandedTaskId, renderTaskDetails, t]
  );

  const renderTaskTableHeader = useCallback(
    () => (
      <div
        className={`${styles.taskHeader} px-18px py-10px text-12px text-t-secondary`}
        style={{
          borderTop: '1px solid #e5e7eb',
          background: '#f8fafc',
        }}
      >
        {[
          t('common.runtime.taskField.projectPaper'),
          t('common.runtime.taskField.stage'),
          t('common.runtime.taskField.next'),
          `${t('common.runtime.taskField.elapsed')} / ${t('common.runtime.taskField.usage')}`,
        ].map((label) => (
          <Typography.Text key={label} className='font-600 text-t-secondary' style={ONE_LINE_CLAMP_STYLE}>
            {label}
          </Typography.Text>
        ))}
      </div>
    ),
    [t]
  );

  const renderTaskGroups = useCallback(
    () =>
      overview.sections
        .filter((section) => section.tasks.length > 0)
        .map((section) => {
          const accent = primaryStateAccent(section.state);
          const icon =
            section.state === 'in_progress' ? (
              <Play theme='filled' />
            ) : section.state === 'system_attention_required' ? (
              <Attention theme='outline' />
            ) : section.state === 'owner_decision_required' ? (
              <People theme='outline' />
            ) : (
              <Robot theme='outline' />
            );
          return (
            <div key={section.state} data-testid={`runtime-group-${section.state}`} style={{ minWidth: 0 }}>
              <div className='flex items-start gap-10px px-18px py-14px' style={{ background: accent.background }}>
                <span
                  aria-hidden='true'
                  className='flex items-center justify-center'
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    color: accent.color,
                    background: '#fff',
                    flexShrink: 0,
                  }}
                >
                  {icon}
                </span>
                <div className='min-w-0'>
                  <Typography.Text className='block font-600 text-t-primary break-words'>
                    {section.title} ({section.tasks.length})
                  </Typography.Text>
                  <Typography.Text className='block mt-2px text-12px text-t-secondary break-words'>
                    {section.summary}
                  </Typography.Text>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>{section.tasks.map(renderTaskItem)}</div>
            </div>
          );
        }),
    [overview.sections, renderTaskItem]
  );

  return (
    <div className='w-full h-full overflow-auto box-border' style={{ background: '#f6f8fb', padding: '24px 32px' }}>
      {contextHolder}
      <Modal
        visible={Boolean(pendingArchiveItem)}
        title={t('common.runtime.archiveTask.title')}
        onCancel={() => setPendingArchiveItem(null)}
        footer={
          <div className='flex justify-end gap-8px'>
            <Button onClick={() => setPendingArchiveItem(null)}>{t('common.cancel')}</Button>
            <Button
              type='primary'
              status='warning'
              loading={Boolean(runningActionId?.startsWith('archive:'))}
              onClick={() => void confirmArchiveTask()}
              data-testid='runtime-archive-confirm'
            >
              {t('common.runtime.archiveTask.confirm')}
            </Button>
          </div>
        }
        unmountOnExit
      >
        {pendingArchiveItem
          ? t('common.runtime.archiveTask.description', { task: pendingArchiveItem.projectLabel })
          : null}
      </Modal>
      <div style={{ maxWidth: 1360, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className='flex flex-col gap-12px xl:flex-row xl:items-end xl:justify-between'>
          <div>
            <Typography.Title heading={4} className='mb-6px'>
              {t('common.runtime.title')}
            </Typography.Title>
            <Typography.Text className='text-t-secondary'>{t('common.runtime.description')}</Typography.Text>
          </div>
          <div className='flex flex-col gap-8px sm:flex-row sm:items-center'>
            <Typography.Text className='text-13px text-t-secondary'>
              {t('common.runtime.scopeSelector')}
            </Typography.Text>
            <Select
              style={{ width: 220 }}
              data-testid='runtime-scope-selector'
              value={selectedScope?.id}
              onChange={(value) => setSelectedScopeId(String(value))}
              options={displayScopeOptions.map((option) => ({
                label: option.label,
                value: option.id,
              }))}
            />
            <Button
              icon={<UpdateRotation theme='outline' />}
              loading={loading}
              onClick={() => void refreshAppState(true)}
            >
              {t('common.refresh')}
            </Button>
            <Button type='text' size='small' onClick={() => navigate(resolveLegacySettingsRoute('runtime'))}>
              {t('common.runtime.settings')}
            </Button>
            <Typography.Text className='text-13px text-t-secondary flex items-center gap-6px'>
              <span
                aria-hidden='true'
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: loading ? 'var(--color-orange-6)' : 'var(--color-green-6)',
                  flexShrink: 0,
                }}
              />
              {lastLoadedAt ? t('common.runtime.loadedAt', { time: lastLoadedAt }) : t('common.runtime.refreshing')}
            </Typography.Text>
          </div>
        </div>

        {displayDrilldown ? (
          <>
            <div className='rounded-8px border border-border-1 bg-white px-16px py-12px shadow-sm'>
              <div className='flex flex-col gap-10px lg:flex-row lg:items-center lg:justify-between'>
                <div
                  className='grid gap-x-16px gap-y-6px min-w-0'
                  style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', flex: 1 }}
                >
                  <Typography.Text className='text-13px text-t-secondary break-words'>
                    {t('common.runtime.overviewSummaryText', {
                      scope: scopeLabel,
                      tasks: overview.visibleTaskCount,
                      automation: overview.automationRunningCount,
                    })}
                  </Typography.Text>
                  <Typography.Text className='text-13px text-t-secondary break-words'>
                    {formatRecentActivityHint(overview.latestActivityAt, t)}
                    {formatClockTime(overview.latestActivityAt)
                      ? ` · ${formatClockTime(overview.latestActivityAt)}`
                      : ''}
                  </Typography.Text>
                </div>
                <Tag color={loading ? 'orange' : 'green'} style={{ flexShrink: 0 }}>
                  {loading ? t('common.runtime.refreshing') : t('common.runtime.drilldownLoaded')}
                </Tag>
              </div>
            </div>

            <div
              data-testid='runtime-primary-summary'
              style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}
            >
              {metricCards.map((card) => (
                <Card
                  key={card.key}
                  bordered
                  className='rd-8px'
                  bodyStyle={{ padding: 16 }}
                  style={{ boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)' }}
                >
                  <div className='flex items-start gap-12px min-w-0'>
                    <span
                      aria-hidden='true'
                      className='flex items-center justify-center'
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        color: card.color,
                        background: `${card.color}14`,
                        flexShrink: 0,
                      }}
                    >
                      {card.icon}
                    </span>
                    <div className='flex flex-col gap-4px min-w-0'>
                      <Typography.Text className='block text-13px text-t-primary break-words'>
                        {card.label}
                      </Typography.Text>
                      <Typography.Text
                        className='block font-600 text-26px leading-32px break-words'
                        style={{ color: card.color }}
                      >
                        {card.value}
                      </Typography.Text>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <div className='grid grid-cols-1 xl:grid-cols-3 gap-16px items-start'>
              <div className='xl:col-span-2 flex flex-col gap-16px min-w-0'>
                <Card
                  bordered
                  className='rd-8px'
                  bodyStyle={{ padding: 0 }}
                  style={{ boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)' }}
                >
                  <div className='flex flex-col gap-12px px-18px py-16px lg:flex-row lg:items-start lg:justify-between'>
                    <div className='flex flex-col gap-4px min-w-0'>
                      <Typography.Text className='font-600 text-t-primary'>
                        {t('common.runtime.taskListTitle')}
                      </Typography.Text>
                      <Typography.Text className='text-13px text-t-secondary break-words'>
                        {t('common.runtime.taskListSummaryText', {
                          count: overview.visibleTaskCount,
                          automation: overview.automationRunningCount,
                        })}
                      </Typography.Text>
                    </div>
                    <div
                      data-testid='runtime-saved-views'
                      className='flex flex-wrap items-center gap-8px'
                      style={{ maxWidth: 520 }}
                    >
                      <Typography.Text className='text-13px text-t-secondary'>
                        {t('common.runtime.savedViews')}
                      </Typography.Text>
                      {RUNTIME_SAVED_VIEW_IDS.map((viewId) => (
                        <Button
                          key={viewId}
                          size='small'
                          type={selectedSavedViewId === viewId ? 'primary' : 'secondary'}
                          data-testid={`runtime-saved-view-${viewId}`}
                          onClick={() => setSelectedSavedViewId(viewId)}
                        >
                          {t(`common.runtime.savedView.${viewId}`)}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className={styles.taskTable}>
                    {overview.sections.some((section) => section.tasks.length > 0) ? (
                      <>
                        {renderTaskTableHeader()}
                        {renderTaskGroups()}
                      </>
                    ) : (
                      <div className='px-18px py-16px' style={{ borderTop: '1px solid #e5e7eb' }}>
                        <Alert type='info' content={t('common.runtime.noTasksInScope')} />
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              <aside style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
                <Card bordered className='rd-8px' style={{ boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)' }}>
                  <div className='flex flex-col gap-12px'>
                    <Typography.Text className='font-600 text-t-primary'>
                      {t('common.runtime.agentAvailability.title')}
                    </Typography.Text>
                    <Typography.Text className='text-13px text-t-secondary break-words'>
                      {t('common.runtime.agentAvailability.summary', {
                        installed: installedAgentCount,
                        available: availableAgentCount,
                        maintenance: maintenanceAgentCount,
                        notInstalled: notInstalledAgentCount,
                      })}
                    </Typography.Text>
                    <Typography.Text className='text-12px text-t-secondary break-words'>
                      {t('common.runtime.agentAvailability.explanation')}
                    </Typography.Text>
                    <div className='flex flex-col divide-y divide-border-1'>
                      {agentAvailabilityItems.map((item) => {
                        const visual = moduleVisualFor(item);
                        const availabilityColor =
                          item.availability === 'available'
                            ? 'green'
                            : item.availability === 'maintenance_required'
                              ? 'orange'
                              : 'gray';
                        return (
                          <div
                            key={item.id}
                            data-testid={`runtime-agent-availability-${item.id}`}
                            className='flex items-start gap-12px py-12px min-w-0'
                          >
                            <span
                              aria-hidden='true'
                              className='flex items-center justify-center'
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 8,
                                color: visual.color,
                                background: visual.background,
                                flexShrink: 0,
                              }}
                            >
                              {visual.icon}
                            </span>
                            <div className='min-w-0 flex-1'>
                              <div className='flex items-start justify-between gap-10px min-w-0'>
                                <Typography.Text className='block font-600 text-t-primary' style={ONE_LINE_CLAMP_STYLE}>
                                  {item.title}
                                </Typography.Text>
                                <Tag color={availabilityColor} style={{ flexShrink: 0, whiteSpace: 'normal' }}>
                                  {item.availabilityLabel}
                                </Tag>
                              </div>
                              {item.detail && (
                                <Typography.Text className='block mt-6px text-12px text-t-secondary break-words'>
                                  {item.detail}
                                </Typography.Text>
                              )}
                              <Typography.Text className='block mt-4px text-12px text-t-secondary break-words'>
                                {item.activeTaskCount > 0
                                  ? t('common.runtime.agentAvailability.workload', {
                                      count: item.activeTaskCount,
                                      running: item.automationRunningCount,
                                    })
                                  : t('common.runtime.agentAvailability.noTasks')}
                              </Typography.Text>
                              {item.latestActivityAt && (
                                <Typography.Text className='block mt-2px text-12px text-t-secondary'>
                                  {formatRecentActivityHint(item.latestActivityAt, t)}
                                </Typography.Text>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Card>

                <Card bordered className='rd-8px' style={{ boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)' }}>
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
                        <div className='flex flex-col gap-6px'>
                          <Typography.Text className='font-600 text-t-primary'>
                            {t('common.runtime.scopeDiagnostics')}
                          </Typography.Text>
                          <Typography.Text className='text-13px text-t-secondary break-words'>
                            {t('common.runtime.scopeSourceLabel', {
                              source: t(`common.runtime.scopeSource.${runtimeScope.source}`),
                            })}
                            {runtimeScope.inferredHint
                              ? ` · ${t('common.runtime.scopeInferredHint', { hint: runtimeScope.inferredHint })}`
                              : ''}
                          </Typography.Text>
                        </div>

                        {agentAvailabilityItems.some((item) => item.detail) && (
                          <div className='flex flex-col gap-8px'>
                            <Typography.Text className='font-600 text-t-primary'>
                              {t('common.runtime.agentAvailability.title')}
                            </Typography.Text>
                            <div className='flex flex-col divide-y divide-border-1'>
                              {agentAvailabilityItems
                                .filter((item) => item.detail)
                                .map((item) => (
                                  <div key={`agent-detail-${item.id}`} className='py-8px'>
                                    <Typography.Text className='block text-13px text-t-primary break-words'>
                                      {item.title}
                                    </Typography.Text>
                                    <Typography.Text className='block mt-4px text-12px text-t-secondary break-words'>
                                      {item.detail}
                                    </Typography.Text>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}

                        {archivedAttempts.length > 0 && (
                          <div className='flex flex-col gap-8px' data-testid='runtime-archived-attempts'>
                            <Typography.Text className='font-600 text-t-primary'>
                              {t('common.runtime.archiveTask.archivedTitle')}
                            </Typography.Text>
                            <Typography.Text className='text-12px text-t-secondary'>
                              {t('common.runtime.archiveTask.archivedDescription')}
                            </Typography.Text>
                            <div className='flex flex-col divide-y divide-border-1'>
                              {archivedAttempts.map((attempt) => {
                                const stageAttemptId = stringValue(attempt.stage_attempt_id) ?? 'archived-attempt';
                                const domainLabel =
                                  humanizeRuntimeActor(stringValue(attempt.domain_id)) ??
                                  t('common.runtime.unknownDomain');
                                const stageLabel =
                                  runtimeStageLabel(stringValue(attempt.stage_id), runtimeLanguage) ??
                                  t('common.runtime.noCurrentStage');
                                return (
                                  <div
                                    key={stageAttemptId}
                                    className='flex items-center justify-between gap-12px py-8px'
                                  >
                                    <div className='min-w-0'>
                                      <Typography.Text className='block text-13px text-t-primary'>
                                        {domainLabel} · {stageLabel}
                                      </Typography.Text>
                                      <Typography.Text className='block mt-2px text-12px text-t-secondary'>
                                        {stringValue(attempt.archived_at) ?? stageAttemptId}
                                      </Typography.Text>
                                    </div>
                                    <Button
                                      size='small'
                                      loading={runningActionId === `restore:${stageAttemptId}`}
                                      onClick={() => void restoreArchivedAttempt(attempt)}
                                    >
                                      {t('common.runtime.archiveTask.restore')}
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

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
                              <div
                                key={item.key}
                                className='min-w-0 rounded-6px border border-border-1 px-12px py-10px'
                              >
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
                                <Typography.Text
                                  key={ref}
                                  className='block py-8px text-12px text-t-secondary break-all'
                                >
                                  {ref}
                                </Typography.Text>
                              ))}
                            </div>
                          </div>
                        )}

                        {advancedTaskRefs.length > 0 && (
                          <div className='flex flex-col gap-12px'>
                            <Typography.Text className='font-600 text-t-primary'>
                              {t('common.runtime.taskOverview')}
                            </Typography.Text>
                            <div className='flex flex-col divide-y divide-border-1'>
                              {advancedTaskRefs.map((task) => (
                                <div key={task.id} className='py-8px'>
                                  <Typography.Text className='block font-600 text-t-primary break-words'>
                                    {task.title}
                                  </Typography.Text>
                                  {task.rows.map((row) => (
                                    <Typography.Text
                                      key={row}
                                      className='block mt-4px text-12px text-t-secondary break-all'
                                    >
                                      {row}
                                    </Typography.Text>
                                  ))}
                                </div>
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
                                        {stringValue(action.action_kind) && (
                                          <Tag>{stringValue(action.action_kind)}</Tag>
                                        )}
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
                              ].filter((row): row is { key: string; label: string; value: string } =>
                                Boolean(row.value)
                              );
                              return rows.length > 0 ? (
                                <div className='mb-10px flex flex-col gap-4px'>
                                  {rows.map((row) => (
                                    <Typography.Text
                                      key={row.key}
                                      className='block text-12px text-t-secondary break-words'
                                    >
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
              </aside>
            </div>
          </>
        ) : (
          <Alert type='info' content={t('common.runtime.drilldownUnavailableDescription')} />
        )}
      </div>
    </div>
  );
};

export default RuntimePage;
