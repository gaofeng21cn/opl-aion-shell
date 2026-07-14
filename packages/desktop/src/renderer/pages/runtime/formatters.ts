import type {
  RuntimeActionKind,
  RuntimeAgentAvailabilityState,
  RuntimeExecutionState,
  RuntimePrimaryStatus,
  RuntimeStage,
  RuntimeStageState,
  RuntimeStatusView,
  RuntimeTokenObservation,
  RuntimeAction,
  RuntimeWorkItem,
} from './types';

export type RuntimeTranslate = (key: string, values?: Record<string, string | number>) => string;

const PRIMARY_STATUS_KEYS: Record<RuntimePrimaryStatus, string> = {
  automatically_advancing: 'common.runtime.primaryStates.automaticallyAdvancing',
  awaiting_user_decision: 'common.runtime.primaryStates.awaitingUserDecision',
  system_attention: 'common.runtime.primaryStates.systemAttention',
  delivered_auto_paused: 'common.runtime.primaryStates.deliveredAutoPaused',
  paused: 'common.runtime.primaryStates.paused',
  stopped: 'common.runtime.primaryStates.stopped',
  sync_pending: 'common.runtime.primaryStates.syncPending',
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
  attention_required: 'common.runtime.agentAvailability.attentionRequired',
  unavailable: 'common.runtime.agentAvailability.unavailable',
};

const AVAILABILITY_DESCRIPTION_KEYS: Record<Exclude<RuntimeAgentAvailabilityState, 'available'>, string> = {
  attention_required: 'common.runtime.agentAvailability.description.attentionRequired',
  unavailable: 'common.runtime.agentAvailability.description.unavailable',
};

const ACTION_KIND_KEYS: Record<RuntimeActionKind, string> = {
  user_action: 'common.runtime.actionKinds.user',
  system_action: 'common.runtime.actionKinds.system',
  agent_action: 'common.runtime.actionKinds.agent',
  safe_action: 'common.runtime.actionKinds.safe',
  blocked_no_action: 'common.runtime.actionKinds.blocked',
};

const GENERIC_ACTION_KEYS: Record<RuntimeActionKind, { title: string; summary: string }> = {
  user_action: {
    title: ACTION_KIND_KEYS.user_action,
    summary: 'common.runtime.actionKinds.userSummary',
  },
  system_action: {
    title: ACTION_KIND_KEYS.system_action,
    summary: 'common.runtime.actionKinds.systemSummary',
  },
  agent_action: {
    title: ACTION_KIND_KEYS.agent_action,
    summary: 'common.runtime.actionKinds.agentSummary',
  },
  safe_action: {
    title: ACTION_KIND_KEYS.safe_action,
    summary: 'common.runtime.actionKinds.safeSummary',
  },
  blocked_no_action: {
    title: ACTION_KIND_KEYS.blocked_no_action,
    summary: 'common.runtime.actionKinds.blockedSummary',
  },
};

const STAGE_STATE_KEYS: Record<RuntimeStageState, string> = {
  completed: 'common.runtime.taskDetails.stage.completed',
  current: 'common.runtime.taskDetails.stage.current',
  next: 'common.runtime.taskDetails.stage.next',
  pending: 'common.runtime.taskDetails.stage.pending',
  waiting_user: 'common.runtime.taskDetails.stage.waitingUser',
  system_attention: 'common.runtime.taskDetails.stage.systemHandling',
  stopped: 'common.runtime.taskDetails.stage.stopped',
  failed: 'common.runtime.taskDetails.stage.failed',
};

const ACTION_SEMANTIC_KEY_MAP: Readonly<Record<string, string>> = {
  'lifecycle.active.title': 'common.runtime.semanticAction.lifecycle.active.title',
  'lifecycle.active.summary': 'common.runtime.semanticAction.lifecycle.active.summary',
  'lifecycle.deliveredPaused.title': 'common.runtime.semanticAction.lifecycle.deliveredPaused.title',
  'lifecycle.deliveredPaused.summary': 'common.runtime.semanticAction.lifecycle.deliveredPaused.summary',
  'lifecycle.paused.title': 'common.runtime.semanticAction.lifecycle.paused.title',
  'lifecycle.paused.summary': 'common.runtime.semanticAction.lifecycle.paused.summary',
  'lifecycle.stopped.title': 'common.runtime.semanticAction.lifecycle.stopped.title',
  'lifecycle.stopped.summary': 'common.runtime.semanticAction.lifecycle.stopped.summary',
  'lifecycle.archived.title': 'common.runtime.semanticAction.lifecycle.archived.title',
  'lifecycle.archived.summary': 'common.runtime.semanticAction.lifecycle.archived.summary',
  'lifecycle.unknown.title': 'common.runtime.semanticAction.lifecycle.unknown.title',
  'lifecycle.unknown.summary': 'common.runtime.semanticAction.lifecycle.unknown.summary',
  'inventory.nextAction.title': 'common.runtime.semanticAction.inventoryNextAction.title',
  'inventory.nextAction.summary': 'common.runtime.semanticAction.inventoryNextAction.summary',
  'systemRepair.action.title': 'common.runtime.semanticAction.systemRepair.title',
  'systemRepair.action.summary': 'common.runtime.semanticAction.systemRepair.summary',
};

export type ResolvedRuntimeAction = {
  title: string;
  summary: string;
  owner: string;
};

function resolveActionMessage(
  semanticKey: string | null,
  actionKind: RuntimeActionKind,
  messagePart: 'title' | 'summary',
  messageArgs: Record<string, string | number>,
  t: RuntimeTranslate
): string {
  const semanticI18nKey = semanticKey ? ACTION_SEMANTIC_KEY_MAP[semanticKey] : null;
  return t(semanticI18nKey ?? GENERIC_ACTION_KEYS[actionKind][messagePart], messageArgs);
}

export function resolveRuntimeAction(action: RuntimeAction, t: RuntimeTranslate): ResolvedRuntimeAction {
  return {
    title: resolveActionMessage(action.titleKey, action.kind, 'title', action.messageArgs, t),
    summary: resolveActionMessage(action.summaryKey, action.kind, 'summary', action.messageArgs, t),
    owner:
      action.ownerKind === 'user'
        ? t('common.runtime.owner.you')
        : action.ownerKind === 'system'
          ? t('common.runtime.owner.system')
          : action.ownerDisplayName,
  };
}

export function primaryStatusLabel(status: RuntimePrimaryStatus, t: RuntimeTranslate): string {
  return t(PRIMARY_STATUS_KEYS[status]);
}

export function executionStateLabel(state: RuntimeExecutionState, t: RuntimeTranslate): string {
  return t(EXECUTION_STATE_KEYS[state]);
}

export function availabilityLabel(state: RuntimeAgentAvailabilityState, t: RuntimeTranslate): string {
  return t(AVAILABILITY_KEYS[state]);
}

export function availabilityDescription(
  state: Exclude<RuntimeAgentAvailabilityState, 'available'>,
  t: RuntimeTranslate
): string {
  return t(AVAILABILITY_DESCRIPTION_KEYS[state]);
}

export function actionKindLabel(kind: RuntimeActionKind, t: RuntimeTranslate): string {
  return t(ACTION_KIND_KEYS[kind]);
}

export function stageStateLabel(state: RuntimeStageState, t: RuntimeTranslate): string {
  return t(STAGE_STATE_KEYS[state]);
}

function humanizeStageId(value: string): string {
  const normalized = value
    .trim()
    .replace(/[._/-]+/g, ' ')
    .replace(/\s+/g, ' ');
  return normalized ? normalized[0]!.toUpperCase() + normalized.slice(1) : value;
}

export function currentStageLabel(item: RuntimeWorkItem, t: RuntimeTranslate): string {
  if (item.execution.currentStageDisplayName) return item.execution.currentStageDisplayName;
  if (item.execution.currentStageId) return humanizeStageId(item.execution.currentStageId);
  return t('common.runtime.taskDetails.noCurrentStage');
}

export function nextStageLabel(item: RuntimeWorkItem, t: RuntimeTranslate): string {
  if (item.execution.nextStageDisplayName) return item.execution.nextStageDisplayName;
  if (item.execution.nextStageId) return humanizeStageId(item.execution.nextStageId);
  if (item.action) return resolveRuntimeAction(item.action, t).title;
  return t('common.runtime.noNextAction');
}

export function stageMapUsageLabel(stage: RuntimeStage, locale: string, t: RuntimeTranslate): string | null {
  return stage.usage ? formatTokenObservation(stage.usage, locale, t) : null;
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

export function formatItemElapsed(item: RuntimeWorkItem, generatedAt: string, t: RuntimeTranslate): string {
  const elapsed = elapsedSeconds(item, generatedAt);
  if (elapsed !== null) return formatDuration(elapsed, t);
  if (['idle', 'succeeded'].includes(item.execution.state)) return t('common.runtime.noActiveRun');
  return t('common.runtime.timeNotRecorded');
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
  if (view === 'automatically_advancing') return item.primaryStatus === 'automatically_advancing';
  if (view === 'awaiting_user_decision') return item.primaryStatus === 'awaiting_user_decision';
  if (view === 'system_attention') return item.primaryStatus === 'system_attention';
  if (view === 'delivered_or_paused') {
    return ['delivered_auto_paused', 'paused'].includes(item.primaryStatus);
  }
  if (view === 'stopped') return item.primaryStatus === 'stopped';
  return item.primaryStatus === 'sync_pending';
}
