import type {
  RuntimeAgentAvailabilityState,
  RuntimeExecutionState,
  RuntimePrimaryStatus,
  RuntimeStatusView,
  RuntimeTokenObservation,
  RuntimeWorkItem,
} from './types';

export type RuntimeTranslate = (key: string, values?: Record<string, string | number>) => string;

const PRIMARY_STATUS_KEYS: Record<RuntimePrimaryStatus, string> = {
  in_progress: 'common.runtime.primaryStates.inProgress',
  delivered_auto_paused: 'common.runtime.primaryStates.deliveredAutoPaused',
  paused_waiting_for_direction: 'common.runtime.primaryStates.pausedWaitingForDirection',
  owner_decision_required: 'common.runtime.primaryStates.ownerDecisionRequired',
  system_attention_required: 'common.runtime.primaryStates.systemAttentionRequired',
  stopped: 'common.runtime.primaryStates.stopped',
  archived: 'common.runtime.primaryStates.archived',
  unavailable: 'common.runtime.primaryStates.unavailable',
};

const EXECUTION_STATE_KEYS: Record<RuntimeExecutionState, string> = {
  running: 'common.runtime.executionStates.running',
  queued: 'common.runtime.executionStates.queued',
  idle: 'common.runtime.executionStates.idle',
  succeeded: 'common.runtime.executionStates.succeeded',
  failed: 'common.runtime.executionStates.failed',
  unknown: 'common.runtime.executionStates.unknown',
};

const AVAILABILITY_KEYS: Record<RuntimeAgentAvailabilityState, string> = {
  available: 'common.runtime.agentAvailability.available',
  attention: 'common.runtime.agentAvailability.attention',
  unavailable: 'common.runtime.agentAvailability.unavailable',
  unknown: 'common.runtime.agentAvailability.unknown',
};

export function primaryStatusLabel(status: RuntimePrimaryStatus, t: RuntimeTranslate): string {
  return t(PRIMARY_STATUS_KEYS[status]);
}

export function executionStateLabel(state: RuntimeExecutionState, t: RuntimeTranslate): string {
  return t(EXECUTION_STATE_KEYS[state]);
}

export function availabilityLabel(state: RuntimeAgentAvailabilityState, t: RuntimeTranslate): string {
  return t(AVAILABILITY_KEYS[state]);
}

export function formatDuration(seconds: number | null, t: RuntimeTranslate): string {
  if (seconds === null) return t('common.runtime.timeNotRecorded');
  if (seconds < 60) return t('common.runtime.duration.seconds', { count: Math.floor(seconds) });
  if (seconds < 3600) return t('common.runtime.duration.minutes', { count: Math.floor(seconds / 60) });
  if (seconds < 86_400) return t('common.runtime.duration.hours', { count: Math.floor(seconds / 3600) });
  return t('common.runtime.duration.days', { count: Math.floor(seconds / 86_400) });
}

export function elapsedSeconds(item: RuntimeWorkItem, generatedAt: string): number | null {
  if (!item.execution.startedAt) return null;
  const start = Date.parse(item.execution.startedAt);
  const endValue = ['running', 'queued'].includes(item.execution.state)
    ? generatedAt
    : (item.execution.updatedAt ?? generatedAt);
  const end = Date.parse(endValue);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.floor((end - start) / 1000);
}

export function formatTimestamp(value: string | null, locale: string, t: RuntimeTranslate): string {
  if (!value) return t('common.runtime.timeNotRecorded');
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return t('common.runtime.timeNotRecorded');
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);
}

export function formatTokenObservation(
  observation: RuntimeTokenObservation,
  locale: string,
  t: RuntimeTranslate
): string {
  if (observation.state === 'observed') {
    return t('common.runtime.tokenCount', {
      count: new Intl.NumberFormat(locale).format(observation.totalTokens),
    });
  }
  if (observation.state === 'stale') return t('common.runtime.telemetryStale');
  return t('common.runtime.telemetryMissing');
}

export function formatUsagePair(
  stageUsage: RuntimeTokenObservation,
  taskUsage: RuntimeTokenObservation,
  locale: string,
  t: RuntimeTranslate
): string {
  return t('common.runtime.usageStageAndTotal', {
    stage: formatTokenObservation(stageUsage, locale, t),
    total: formatTokenObservation(taskUsage, locale, t),
  });
}

export function matchesStatusView(item: RuntimeWorkItem, view: RuntimeStatusView): boolean {
  if (view === 'all') return true;
  if (view === 'paused') {
    return ['delivered_auto_paused', 'paused_waiting_for_direction', 'stopped', 'archived'].includes(
      item.primaryStatus
    );
  }
  return item.primaryStatus === view;
}
