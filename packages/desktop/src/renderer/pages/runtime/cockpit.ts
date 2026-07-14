import type { IOplRuntimeCommandResult } from '@/common/adapter/ipcBridge';
import { getOplProfessionalAgentPackage } from '@/common/config/oplProductProfile';
import type { RuntimeSafeActionRoute } from '@/renderer/pages/settings/RuntimeSettings/types';

type JsonRecord = Record<string, unknown>;

export type RuntimeCockpitSummary = {
  availability: string | null;
  providerStatus: string | null;
  stageAttemptCount: number | null;
  blockedStateCount: number | null;
  safeActionCount: number;
  nextActionId: string | null;
};

export type RuntimeArchivedAttempt = {
  stageAttemptId: string;
  domainLabel: string;
  stageLabel: string;
  archivedAt: string | null;
};

export type RuntimeActionResultSummary = {
  preview: string | null;
  receipt: string | null;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function recordList(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function appState(root: unknown): JsonRecord {
  const wrapper = record(root);
  const nested = record(wrapper.app_state);
  return Object.keys(nested).length > 0 ? nested : wrapper;
}

function drilldown(root: unknown): JsonRecord {
  const wrapper = record(root);
  const tray = record(wrapper.runtime_tray_snapshot);
  const nested = record(wrapper.app_operator_drilldown);
  if (Object.keys(nested).length > 0) return nested;
  const trayDrilldown = record(tray.app_operator_drilldown);
  return Object.keys(trayDrilldown).length > 0 ? trayDrilldown : wrapper;
}

function workbench(root: unknown): JsonRecord {
  const state = appState(root);
  const operatorWorkbench = record(record(state.operator).workbench);
  if (Object.keys(operatorWorkbench).length > 0) return operatorWorkbench;
  return record(drilldown(root).runtime_workbench);
}

function firstString(source: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = stringValue(source[key]);
    if (value) return value;
  }
  return null;
}

function refText(value: unknown): string | null {
  return (
    stringValue(value) ??
    stringValue(record(value).ref) ??
    stringValue(record(value).source_ref) ??
    stringValue(record(value).receipt_ref)
  );
}

function firstRef(source: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const direct = refText(source[key]);
    if (direct) return direct;
    const nested = recordList(source[key])
      .map(refText)
      .find((value): value is string => Boolean(value));
    if (nested) return nested;
  }
  return null;
}

export function parseRuntimeCommandResult(result: IOplRuntimeCommandResult | null | undefined): JsonRecord | null {
  if (result?.ok === false) return null;
  if (isRecord(result?.parsed)) return result.parsed;
  if (!result?.stdout) return null;
  try {
    const parsed = JSON.parse(result.stdout) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function actionCandidates(root: unknown): JsonRecord[] {
  const state = appState(root);
  const operator = record(state.operator);
  const detail = drilldown(root);
  return [
    ...recordList(state.actions),
    ...recordList(operator.actions),
    ...recordList(record(operator.action_queue).items),
    record(record(detail.attention_first_payload).next_safe_action),
    ...recordList(record(detail.app_execution_bridge).safe_action_routes),
    ...recordList(record(detail.operator_action_routing_refs).refs),
  ].filter((entry) => Object.keys(entry).length > 0);
}

function readSafeAction(entry: JsonRecord): RuntimeSafeActionRoute | null {
  const id = firstString(entry, ['action_id', 'id', 'action_ref', 'ref']);
  if (!id) return null;
  const submitVia = stringValue(entry.submit_via);
  const appBoundary =
    submitVia === null ||
    submitVia === 'opl app action execute' ||
    entry.can_submit_to_safe_action_shell === true ||
    entry.execution_policy === 'opl_safe_action_shell';
  const explicitlySafe =
    submitVia === 'opl app action execute' ||
    entry.can_submit_to_safe_action_shell === true ||
    entry.execution_policy === 'opl_safe_action_shell';
  const payloadFree =
    entry.route_requires_domain_or_app_payload !== true &&
    (!Array.isArray(entry.payload_fields) || entry.payload_fields.length === 0);
  if (!appBoundary || !explicitlySafe || !payloadFree || entry.dry_run_supported === false) return null;
  return {
    id,
    label: firstString(entry, ['label', 'title']) ?? id,
    owner: firstString(entry, ['owner', 'authority_owner']) ?? undefined,
    route: firstString(entry, ['route', 'command']) ?? undefined,
    dryRunRequired: true,
  };
}

export function readRuntimeSafeActions(...roots: unknown[]): RuntimeSafeActionRoute[] {
  const actions: RuntimeSafeActionRoute[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    for (const candidate of actionCandidates(root)) {
      const action = readSafeAction(candidate);
      if (!action || seen.has(action.id)) continue;
      seen.add(action.id);
      actions.push(action);
    }
  }
  return actions.slice(0, 8);
}

export function readRuntimeCockpitSummary(root: unknown): RuntimeCockpitSummary | null {
  const detail = drilldown(root);
  if (Object.keys(detail).length === 0) return null;
  const summary = record(detail.summary);
  const controlSummary = record(record(detail.current_control_state).summary);
  const attention = record(detail.attention_first_payload);
  const provider = record(attention.provider_health);
  const nextAction = record(attention.next_safe_action);
  const safeActionCount =
    numberValue(summary.safe_action_ref_count) ??
    numberValue(summary.app_execution_bridge_safe_action_route_count) ??
    readRuntimeSafeActions(root).length;
  return {
    availability: stringValue(detail.availability),
    providerStatus: firstString(provider, ['health_status', 'status']),
    stageAttemptCount:
      numberValue(summary.stage_attempt_count) ?? numberValue(record(detail.stage_progress_log).attempt_count),
    blockedStateCount:
      numberValue(summary.current_control_state_blocked_count) ??
      numberValue(controlSummary.blocked_control_state_count),
    safeActionCount,
    nextActionId: firstString(nextAction, ['action_id', 'id']),
  };
}

function domainDisplayName(value: string | null): string {
  if (!value) return '';
  return getOplProfessionalAgentPackage(value)?.display_name ?? value;
}

export function readRuntimeArchivedAttempts(...roots: unknown[]): RuntimeArchivedAttempt[] {
  const attempts: RuntimeArchivedAttempt[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    for (const entry of recordList(workbench(root).archived_attempts)) {
      const stageAttemptId = stringValue(entry.stage_attempt_id);
      if (!stageAttemptId || seen.has(stageAttemptId)) continue;
      seen.add(stageAttemptId);
      const domainId = firstString(entry, ['domain_id', 'agent_id']);
      attempts.push({
        stageAttemptId,
        domainLabel: firstString(entry, ['domain_label', 'agent_display_name']) ?? domainDisplayName(domainId),
        stageLabel: firstString(entry, ['stage_label', 'stage_id']) ?? stageAttemptId,
        archivedAt: stringValue(entry.archived_at),
      });
    }
  }
  return attempts.slice(0, 25);
}

export function readActionResultSummary(root: unknown): RuntimeActionResultSummary {
  const payload = record(root);
  const actionPreview = record(payload.action_preview);
  const receipt = record(payload.receipt);
  return {
    preview:
      firstString(payload, ['action_preview_summary', 'preview_summary']) ??
      firstString(actionPreview, ['summary', 'message']),
    receipt:
      firstString(payload, ['receipt_summary']) ??
      firstString(receipt, ['summary', 'message']) ??
      firstRef(payload, ['receipt_ref', 'receipt_refs']) ??
      firstRef(receipt, ['ref', 'receipt_ref']),
  };
}
