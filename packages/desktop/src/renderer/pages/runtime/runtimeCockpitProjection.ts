type JsonRecord = Record<string, unknown>;

export type RuntimeTokenObservation =
  | {
      state: 'observed';
      totalTokens?: number;
      inputTokens?: number;
      outputTokens?: number;
      displayValue?: string;
    }
  | {
      state: 'missing';
      missingReason: string | null;
    };

export type RuntimeSystemAttentionProjection = {
  responsibleComponent: string | null;
  issue: string | null;
  repairAction: string | null;
  impact: string | null;
  expectedOutcome: string | null;
  complete: boolean;
};

export type RuntimeTaskCockpitProjection = {
  systemAttention: RuntimeSystemAttentionProjection | null;
  stageUsage: RuntimeTokenObservation | null;
  taskTotalUsage: RuntimeTokenObservation | null;
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
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function firstRecord(...values: unknown[]): JsonRecord {
  return values.find(isRecord) ?? {};
}

function displayText(value: unknown, keys: string[]): string | null {
  const direct = stringValue(value);
  if (direct) return direct;
  const source = record(value);
  for (const key of keys) {
    const text = stringValue(source[key]);
    if (text) return text;
  }
  return null;
}

function firstDisplayText(sources: JsonRecord[], keys: string[], valueKeys: string[]): string | null {
  for (const source of sources) {
    for (const key of keys) {
      const text = displayText(source[key], valueKeys);
      if (text) return text;
    }
  }
  return null;
}

function firstNumberEntry(source: JsonRecord, keys: string[]): { key: string; value: number } | null {
  for (const key of keys) {
    const value = numberValue(source[key]);
    if (value !== null) return { key, value };
  }
  return null;
}

function firstReason(sources: JsonRecord[], keys: string[]): string | null {
  return firstDisplayText(sources, keys, ['display_label', 'label', 'message', 'summary', 'reason']);
}

function isObservedStatus(value: unknown): boolean {
  const status = stringValue(value)?.toLowerCase();
  return Boolean(status && ['observed', 'recorded', 'reported', 'available', 'complete'].includes(status));
}

function isMissingStatus(value: unknown): boolean {
  const status = stringValue(value)?.toLowerCase();
  return Boolean(
    status &&
    (status === 'missing' || status === 'unreported' || status === 'unavailable' || status.startsWith('not_measured'))
  );
}

function hasObservedMarker(source: JsonRecord): boolean {
  if (source.observed === true || source.token_usage_observed === true || source.usage_observed === true) return true;
  if (
    isObservedStatus(source.telemetry_status) ||
    isObservedStatus(source.usage_status) ||
    isObservedStatus(source.observation_status)
  ) {
    return true;
  }
  return (
    (numberValue(source.token_observed_count) ??
      numberValue(source.observed_token_count) ??
      numberValue(source.token_usage_observed_count) ??
      0) > 0
  );
}

function readNestedUsage(value: unknown, fallbackReason: string | null): RuntimeTokenObservation | null {
  const scalarNumber = numberValue(value);
  if (scalarNumber !== null) {
    return scalarNumber > 0
      ? { state: 'observed', totalTokens: scalarNumber }
      : { state: 'missing', missingReason: fallbackReason };
  }
  const scalarText = stringValue(value);
  if (scalarText) {
    return /^0(?:\.0+)?(?:\s+tokens?)?$/i.test(scalarText)
      ? { state: 'missing', missingReason: fallbackReason }
      : { state: 'observed', displayValue: scalarText };
  }
  if (!isRecord(value)) return fallbackReason ? { state: 'missing', missingReason: fallbackReason } : null;

  const source = value;
  const missingReason =
    firstReason([source], ['missing_reason', 'reason', 'telemetry_missing_reason', 'usage_missing_reason']) ??
    fallbackReason;
  const observedMarker = hasObservedMarker(source);
  const total = firstNumberEntry(source, [
    'observed_total_tokens',
    'total_tokens_observed',
    'total_tokens',
    'total_token_count',
    'token_count',
    'tokens',
  ]);
  if (total) {
    const explicitlyObservedField = total.key.includes('observed');
    if (total.value > 0 || observedMarker || explicitlyObservedField) {
      return { state: 'observed', totalTokens: total.value };
    }
    return { state: 'missing', missingReason };
  }

  const input = firstNumberEntry(source, ['observed_input_tokens', 'input_tokens', 'prompt_tokens']);
  const output = firstNumberEntry(source, ['observed_output_tokens', 'output_tokens', 'completion_tokens']);
  if (input || output) {
    const explicitlyObservedField = Boolean(input?.key.includes('observed') || output?.key.includes('observed'));
    if ((input?.value ?? 0) > 0 || (output?.value ?? 0) > 0 || observedMarker || explicitlyObservedField) {
      return {
        state: 'observed',
        inputTokens: input?.value,
        outputTokens: output?.value,
      };
    }
    return { state: 'missing', missingReason };
  }

  if (
    missingReason ||
    isMissingStatus(source.telemetry_status) ||
    isMissingStatus(source.usage_status) ||
    isMissingStatus(source.observation_status)
  ) {
    return { state: 'missing', missingReason };
  }
  return null;
}

function readUsage(
  sources: JsonRecord[],
  observedKeys: string[],
  nestedKeys: string[],
  missingReasonKeys: string[]
): RuntimeTokenObservation | null {
  const directReason = firstReason(sources, missingReasonKeys);
  for (const source of sources) {
    const observed = firstNumberEntry(source, observedKeys);
    if (observed) return { state: 'observed', totalTokens: observed.value };
  }
  for (const source of sources) {
    for (const key of nestedKeys) {
      if (source[key] === undefined || source[key] === null) continue;
      const usage = readNestedUsage(source[key], directReason);
      if (usage) return usage;
    }
  }
  return directReason ? { state: 'missing', missingReason: directReason } : null;
}

function readSystemAttention(entry: JsonRecord): RuntimeSystemAttentionProjection | null {
  const status = record(entry.status);
  const sources = [record(entry.system_attention), record(status.system_attention), status, entry];
  const responsibleComponent = firstDisplayText(
    sources,
    ['responsible_component'],
    ['display_name', 'display_label', 'label', 'owner', 'component']
  );
  const issue = firstDisplayText(sources, ['issue'], ['display_label', 'label', 'summary', 'message', 'reason']);
  const repairAction = firstDisplayText(
    sources,
    ['repair_action'],
    ['display_label', 'label', 'title', 'summary', 'message', 'non_action_reason']
  );
  const impact = firstDisplayText(sources, ['impact'], ['display_label', 'label', 'summary', 'message']);
  const expectedOutcome = firstDisplayText(
    sources,
    ['expected_outcome'],
    ['display_label', 'label', 'summary', 'message']
  );
  const values = { responsibleComponent, issue, repairAction, impact, expectedOutcome };
  if (!Object.values(values).some(Boolean)) return null;
  return { ...values, complete: Object.values(values).every(Boolean) };
}

function readTaskCockpitProjection(entry: JsonRecord): RuntimeTaskCockpitProjection {
  const attempt = record(entry.attempt);
  const stageRun = firstRecord(entry.stage_run_cockpit, entry.stage_run_current_owner_delta);
  const stageRunSummary = record(entry.stage_run_cockpit_summary);
  const usageSources = [
    record(entry.token_usage),
    record(attempt.token_usage),
    entry,
    attempt,
    stageRun,
    stageRunSummary,
  ];
  return {
    systemAttention: readSystemAttention(entry),
    stageUsage: readUsage(
      usageSources,
      ['observed_current_stage_tokens'],
      ['stage_usage', 'current_stage_usage'],
      [
        'current_stage_tokens_missing_reason',
        'observed_current_stage_tokens_missing_reason',
        'stage_usage_missing_reason',
        'stage_token_usage_missing_reason',
      ]
    ),
    taskTotalUsage: readUsage(
      usageSources,
      ['observed_task_total_tokens'],
      ['task_total_usage', 'total_usage'],
      [
        'task_total_tokens_missing_reason',
        'observed_task_total_tokens_missing_reason',
        'task_total_usage_missing_reason',
        'total_token_usage_missing_reason',
      ]
    ),
  };
}

function mergeSystemAttention(
  current: RuntimeSystemAttentionProjection | null,
  candidate: RuntimeSystemAttentionProjection | null
): RuntimeSystemAttentionProjection | null {
  if (!current) return candidate;
  if (!candidate) return current;
  const merged = {
    responsibleComponent: candidate.responsibleComponent ?? current.responsibleComponent,
    issue: candidate.issue ?? current.issue,
    repairAction: candidate.repairAction ?? current.repairAction,
    impact: candidate.impact ?? current.impact,
    expectedOutcome: candidate.expectedOutcome ?? current.expectedOutcome,
  };
  return { ...merged, complete: Object.values(merged).every(Boolean) };
}

function mergeTaskCockpitProjection(
  current: RuntimeTaskCockpitProjection | undefined,
  candidate: RuntimeTaskCockpitProjection
): RuntimeTaskCockpitProjection {
  return {
    systemAttention: mergeSystemAttention(current?.systemAttention ?? null, candidate.systemAttention),
    stageUsage: candidate.stageUsage ?? current?.stageUsage ?? null,
    taskTotalUsage: candidate.taskTotalUsage ?? current?.taskTotalUsage ?? null,
  };
}

function taskId(entry: JsonRecord): string | null {
  return stringValue(entry.item_id) ?? stringValue(entry.task_id);
}

export function readRuntimeTaskCockpitProjectionIndex(
  appStateValue: unknown
): Map<string, RuntimeTaskCockpitProjection> {
  const appStateRecord = record(appStateValue);
  const appState =
    Object.keys(record(appStateRecord.app_state)).length > 0 ? record(appStateRecord.app_state) : appStateRecord;
  const workbench = record(record(appState.operator).workbench);
  const taskRunProjection = record(workbench.task_run_projection_v2);
  const workItemProjection = firstRecord(workbench.work_item_projection_v1, taskRunProjection.work_item_projection_v1);
  const entries = [
    ...recordList(workbench.task_drilldowns),
    ...recordList(taskRunProjection.tasks),
    ...recordList(workItemProjection.items),
  ];
  const projections = new Map<string, RuntimeTaskCockpitProjection>();
  for (const entry of entries) {
    const id = taskId(entry);
    if (!id) continue;
    projections.set(id, mergeTaskCockpitProjection(projections.get(id), readTaskCockpitProjection(entry)));
  }
  return projections;
}
