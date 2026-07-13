import {
  WORK_ITEM_PROJECTION_V2_SCHEMA,
  type RuntimeAction,
  type RuntimeActionKind,
  type RuntimeAgent,
  type RuntimeAgentAvailabilityState,
  type RuntimeBusinessState,
  type RuntimeCondition,
  type RuntimeExecutionState,
  type RuntimePrimaryStatus,
  type RuntimeProject,
  type RuntimeProjectionDiagnostic,
  type RuntimeProjectionDiagnosticDetailPolicy,
  type RuntimeProjectionReadResult,
  type RuntimeSourceRef,
  type RuntimeStage,
  type RuntimeStageState,
  type RuntimeSystemAttention,
  type RuntimeTimelineEntry,
  type RuntimeTokenObservation,
  type RuntimeWorkItem,
  type RuntimeWorkItemProjectionV2,
} from './types';

type JsonRecord = Record<string, unknown>;

const BUSINESS_STATES = new Set<RuntimeBusinessState>([
  'active',
  'delivered_paused',
  'paused',
  'stopped',
  'archived',
  'unknown',
]);
const EXECUTION_STATES = new Set<RuntimeExecutionState>([
  'running',
  'queued',
  'idle',
  'succeeded',
  'failed',
  'unknown',
]);
const PRIMARY_STATUSES = new Set<RuntimePrimaryStatus>([
  'automatically_advancing',
  'awaiting_user_decision',
  'system_attention',
  'delivered_auto_paused',
  'paused',
  'stopped',
  'sync_pending',
]);
const AVAILABILITY_STATES = new Set<RuntimeAgentAvailabilityState>(['available', 'attention_required', 'unavailable']);
const CONDITION_STATUSES = new Set<RuntimeCondition['status']>(['True', 'False', 'Unknown']);
const CONDITION_SEVERITIES = new Set<RuntimeCondition['severity']>(['none', 'info', 'warning', 'error']);
const ATTENTION_KINDS = new Set(['none', 'user', 'system']);
const ACTION_KINDS = new Set<RuntimeActionKind>([
  'user_action',
  'system_action',
  'agent_action',
  'safe_action',
  'blocked_no_action',
]);
const STAGE_STATES = new Set<RuntimeStageState>([
  'completed',
  'current',
  'next',
  'pending',
  'waiting_user',
  'system_attention',
  'stopped',
  'failed',
]);
const SOURCE_REF_KINDS = new Set<RuntimeSourceRef['kind']>(['file', 'sqlite', 'projection']);
const DIAGNOSTIC_DETAIL_POLICIES = new Set<RuntimeProjectionDiagnosticDetailPolicy>(['summary_only', 'included']);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

function records(value: unknown): JsonRecord[] | null {
  return Array.isArray(value) && value.every(isRecord) ? value : null;
}

function requiredString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function optionalString(value: unknown): string | null {
  return value === null || value === undefined ? null : requiredString(value);
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function enumValue<T extends string>(value: unknown, values: Set<T>): T | null {
  const candidate = requiredString(value);
  return candidate && values.has(candidate as T) ? (candidate as T) : null;
}

function hasUniqueIds(values: Array<{ id: string }>): boolean {
  return new Set(values.map((value) => value.id)).size === values.length;
}

function parseSourceRefs(value: unknown): RuntimeSourceRef[] | null {
  const source = records(value);
  if (!source) return null;
  const result: RuntimeSourceRef[] = [];
  for (const entry of source) {
    const kind = enumValue(entry.ref_kind, SOURCE_REF_KINDS);
    const role = requiredString(entry.role);
    const ref = requiredString(entry.ref);
    if (!kind || !role || !ref) return null;
    result.push({ kind, role, ref });
  }
  return result;
}

function parseTokenObservation(value: unknown): RuntimeTokenObservation | null {
  const source = record(value);
  const state = requiredString(source?.state);
  if (!source || !state) return null;
  if (state === 'observed') {
    const inputTokens = nonNegativeInteger(source.input_tokens);
    const outputTokens = nonNegativeInteger(source.output_tokens);
    const totalTokens = nonNegativeInteger(source.total_tokens);
    const observedAt = optionalString(source.observed_at);
    if (inputTokens === null || outputTokens === null || totalTokens === null) return null;
    if (source.observed_at !== null && source.observed_at !== undefined && !observedAt) return null;
    if (source.missing_reason !== null) return null;
    return { state, inputTokens, outputTokens, totalTokens, observedAt };
  }
  if (state === 'missing' || state === 'stale') {
    const reason = requiredString(source.missing_reason);
    if (!reason || source.input_tokens !== null || source.output_tokens !== null || source.total_tokens !== null) {
      return null;
    }
    return { state, reason };
  }
  return null;
}

function parseCondition(value: JsonRecord): RuntimeCondition | null {
  const type = requiredString(value.type);
  const status = enumValue(value.status, CONDITION_STATUSES);
  const reason = requiredString(value.reason);
  const message = requiredString(value.message);
  const owner = requiredString(value.owner);
  const severity = enumValue(value.severity, CONDITION_SEVERITIES);
  const lastTransitionAt = optionalString(value.last_transition_time);
  const ref = optionalString(value.ref);
  if (!type || !status || !reason || !message || !owner || !severity) return null;
  if (value.last_transition_time !== null && value.last_transition_time !== undefined && !lastTransitionAt) return null;
  if (value.ref !== null && value.ref !== undefined && !ref) return null;
  return { type, status, reason, message, owner, severity, lastTransitionAt, ref };
}

function parseConditions(value: unknown): RuntimeCondition[] | null {
  const source = records(value);
  if (!source) return null;
  const result = source.map(parseCondition);
  return result.some((condition) => !condition) ? null : (result as RuntimeCondition[]);
}

function parseSystemAttention(value: JsonRecord): RuntimeSystemAttention | null {
  const responsibleComponent = requiredString(value.responsible_component);
  const issue = requiredString(value.issue);
  const impact = requiredString(value.impact);
  const repairAction = requiredString(value.repair_action);
  const expectedOutcome = requiredString(value.expected_outcome);
  return responsibleComponent && issue && impact && repairAction && expectedOutcome
    ? { responsibleComponent, issue, impact, repairAction, expectedOutcome }
    : null;
}

function parseAction(value: unknown): RuntimeAction | null | false {
  if (value === null || value === undefined) return null;
  const source = record(value);
  if (!source) return false;
  const kind = enumValue(source.kind, ACTION_KINDS);
  const title = requiredString(source.title);
  const summary = requiredString(source.summary);
  const ownerDisplayName = requiredString(source.owner_display_name) ?? requiredString(source.owner);
  return kind && title && summary && ownerDisplayName ? { kind, title, summary, ownerDisplayName } : false;
}

function parseStageMap(value: unknown): RuntimeStage[] | null {
  if (value === null || value === undefined) return [];
  const source = records(value);
  if (!source) return null;
  const stages: RuntimeStage[] = [];
  for (const entry of source) {
    const id = requiredString(entry.stage_id);
    const displayName = requiredString(entry.display_name);
    const state = enumValue(entry.state, STAGE_STATES);
    const ownerDisplayName = optionalString(entry.owner_display_name ?? entry.owner);
    const elapsedSeconds =
      entry.elapsed_seconds === null || entry.elapsed_seconds === undefined
        ? null
        : nonNegativeInteger(entry.elapsed_seconds);
    const usage = entry.usage === null || entry.usage === undefined ? null : parseTokenObservation(entry.usage);
    const nextAction = optionalString(entry.next_action);
    if (
      !id ||
      !displayName ||
      !state ||
      (elapsedSeconds === null && entry.elapsed_seconds !== null && entry.elapsed_seconds !== undefined)
    ) {
      return null;
    }
    if (entry.owner_display_name !== null && entry.owner_display_name !== undefined && !ownerDisplayName) return null;
    if (entry.usage !== null && entry.usage !== undefined && !usage) return null;
    if (entry.next_action !== null && entry.next_action !== undefined && !nextAction) return null;
    stages.push({ id, displayName, state, ownerDisplayName, elapsedSeconds, usage, nextAction });
  }
  return stages;
}

function parseTimeline(input: {
  inventoryObservedAt: string;
  executionUpdatedAt: string | null;
  controlUpdatedAt: string | null;
}): RuntimeTimelineEntry[] {
  const entries: RuntimeTimelineEntry[] = [{ id: 'inventory_observed', timestamp: input.inventoryObservedAt }];
  if (input.executionUpdatedAt) entries.push({ id: 'execution_updated', timestamp: input.executionUpdatedAt });
  if (input.controlUpdatedAt) entries.push({ id: 'control_updated', timestamp: input.controlUpdatedAt });
  return entries;
}

function parseWorkItem(value: JsonRecord): RuntimeWorkItem | null {
  const identity = record(value.identity);
  const lifecycle = record(value.lifecycle);
  const execution = record(value.execution);
  const attention = record(value.attention);
  const telemetry = record(value.telemetry);
  const freshness = record(value.freshness);
  if (!identity || !lifecycle || !execution || !attention || !telemetry || !freshness) return null;

  const itemEnvelopeId = requiredString(value.item_id);
  const workItemId = requiredString(identity.work_item_id);
  const displayName = requiredString(identity.work_item_display_name);
  const agentId = requiredString(identity.agent_id);
  const projectId = requiredString(identity.project_id);
  const businessState = enumValue(lifecycle.business_state, BUSINESS_STATES);
  const projectedPrimaryStatus = enumValue(lifecycle.primary_state, PRIMARY_STATUSES);
  const executionState = enumValue(execution.state, EXECUTION_STATES);
  const attentionKind = enumValue(attention.kind, ATTENTION_KINDS);
  const attentionReason = requiredString(attention.reason);
  const stageUsage = parseTokenObservation(telemetry.current_stage);
  const taskUsage = parseTokenObservation(telemetry.cumulative);
  const stageMap = parseStageMap(value.stage_map);
  const projectedAction = parseAction(value.action);
  const conditions = parseConditions(value.conditions);
  const sourceRefs = parseSourceRefs(value.source_refs);
  const inventoryObservedAt = requiredString(freshness.inventory_observed_at);
  if (
    !itemEnvelopeId ||
    !workItemId ||
    !displayName ||
    !agentId ||
    !projectId ||
    !businessState ||
    !executionState ||
    !attentionKind ||
    !attentionReason ||
    !stageUsage ||
    !taskUsage ||
    !stageMap ||
    projectedAction === false ||
    !conditions ||
    !sourceRefs ||
    !inventoryObservedAt
  ) {
    return null;
  }

  const startedAt = optionalString(execution.started_at);
  const lastHeartbeatAt = optionalString(execution.last_heartbeat_at);
  const updatedAt = optionalString(execution.updated_at);
  const controlUpdatedAt = optionalString(lifecycle.control_updated_at);
  const currentStageId = optionalString(execution.current_stage_id) ?? optionalString(lifecycle.current_stage_id);
  const currentStageDisplayName =
    optionalString(execution.current_stage_display_name) ?? optionalString(lifecycle.current_stage_display_name);
  const nextStageId = optionalString(execution.next_stage_id);
  const nextStageDisplayName = optionalString(execution.next_stage_display_name);
  if (execution.started_at !== null && execution.started_at !== undefined && !startedAt) return null;
  if (execution.last_heartbeat_at !== null && execution.last_heartbeat_at !== undefined && !lastHeartbeatAt)
    return null;
  if (execution.updated_at !== null && execution.updated_at !== undefined && !updatedAt) return null;
  if (lifecycle.control_updated_at !== null && lifecycle.control_updated_at !== undefined && !controlUpdatedAt)
    return null;
  if (
    execution.current_stage_display_name !== null &&
    execution.current_stage_display_name !== undefined &&
    !currentStageDisplayName
  )
    return null;
  if (execution.next_stage_id !== null && execution.next_stage_id !== undefined && !nextStageId) return null;
  if (
    execution.next_stage_display_name !== null &&
    execution.next_stage_display_name !== undefined &&
    !nextStageDisplayName
  )
    return null;

  const systemAttention = attentionKind === 'system' ? parseSystemAttention(attention) : null;
  const incompleteSystemAttention = projectedPrimaryStatus === 'system_attention' && !systemAttention;
  const primaryStatus = incompleteSystemAttention ? 'sync_pending' : (projectedPrimaryStatus ?? 'sync_pending');
  const statusSyncReason = incompleteSystemAttention
    ? 'incomplete_system_attention'
    : projectedPrimaryStatus
      ? null
      : 'missing_primary_state';

  return {
    id: workItemId,
    displayName,
    agentId,
    projectId,
    businessState,
    primaryStatus,
    statusSyncReason,
    execution: {
      state: executionState,
      currentStageId,
      currentStageDisplayName,
      nextStageId,
      nextStageDisplayName,
      startedAt,
      lastHeartbeatAt,
      updatedAt,
    },
    stageMap,
    stageUsage,
    taskUsage,
    action: projectedAction,
    systemAttention,
    conditions,
    timeline: parseTimeline({ inventoryObservedAt, executionUpdatedAt: updatedAt, controlUpdatedAt }),
    sourceRefs,
  };
}

function parseProjection(value: JsonRecord): RuntimeWorkItemProjectionV2 | null {
  if (value.surface_kind !== 'opl_work_item_projection') return null;
  const profile = value.profile === 'fast' || value.profile === 'full' ? value.profile : null;
  const generatedAt = requiredString(value.generated_at);
  const agentCatalog = records(value.agent_catalog);
  const availabilityCatalog = records(value.agent_availability);
  const projectCatalog = records(value.project_catalog);
  const itemCatalog = records(value.items);
  const diagnosticEnvelope = record(value.diagnostics);
  const diagnosticItems = records(diagnosticEnvelope?.items);
  if (
    !profile ||
    !generatedAt ||
    !agentCatalog ||
    !availabilityCatalog ||
    !projectCatalog ||
    !itemCatalog ||
    !diagnosticItems
  ) {
    return null;
  }

  const availabilityByAgent = new Map<string, { state: RuntimeAgentAvailabilityState; reason: string }>();
  for (const entry of availabilityCatalog) {
    const agentId = requiredString(entry.agent_id);
    const state = enumValue(entry.availability, AVAILABILITY_STATES);
    const reason = requiredString(entry.reason);
    if (!agentId || !state || !reason || availabilityByAgent.has(agentId)) return null;
    availabilityByAgent.set(agentId, { state, reason });
  }

  const agents: RuntimeAgent[] = [];
  for (const entry of agentCatalog) {
    const id = requiredString(entry.agent_id);
    const displayName = requiredString(entry.display_name);
    const availability = id ? availabilityByAgent.get(id) : null;
    if (!id || !displayName || !availability) return null;
    agents.push({ id, displayName, availability });
  }
  if (!hasUniqueIds(agents) || availabilityByAgent.size !== agents.length) return null;

  const projects: RuntimeProject[] = [];
  for (const entry of projectCatalog) {
    const id = requiredString(entry.project_id);
    const agentId = requiredString(entry.agent_id);
    const displayName = requiredString(entry.display_name);
    if (!id || !agentId || !displayName) return null;
    projects.push({ id, agentId, displayName });
  }
  if (!hasUniqueIds(projects)) return null;

  const parsedItems = itemCatalog.map(parseWorkItem);
  if (parsedItems.some((item) => !item)) return null;
  const items = parsedItems as RuntimeWorkItem[];
  if (!hasUniqueIds(items)) return null;

  const agentIds = new Set(agents.map((agent) => agent.id));
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  if (projects.some((project) => !agentIds.has(project.agentId))) return null;
  if (items.some((item) => projectsById.get(item.projectId)?.agentId !== item.agentId)) return null;

  const diagnostics: RuntimeProjectionDiagnostic[] = [];
  for (const entry of diagnosticItems) {
    const reason = requiredString(entry.reason);
    if (!reason) return null;
    diagnostics.push({ reason });
  }
  const diagnosticCount = nonNegativeInteger(diagnosticEnvelope?.count);
  const diagnosticDetailPolicy = enumValue(diagnosticEnvelope?.detail_policy, DIAGNOSTIC_DETAIL_POLICIES);
  if (diagnosticCount === null || !diagnosticDetailPolicy) return null;
  if (diagnosticDetailPolicy === 'included' && diagnosticCount !== diagnostics.length) return null;
  if (diagnosticDetailPolicy === 'summary_only' && diagnostics.length > diagnosticCount) return null;

  return {
    schemaVersion: WORK_ITEM_PROJECTION_V2_SCHEMA,
    profile,
    generatedAt,
    agents,
    projects,
    items,
    diagnostics,
    diagnosticCount,
    diagnosticDetailPolicy,
  };
}

export function readRuntimeWorkItemProjectionV2(appStateValue: unknown): RuntimeProjectionReadResult {
  const wrapper = record(appStateValue);
  const appState = record(wrapper?.app_state) ?? wrapper;
  const operator = record(appState?.operator);
  const workbench = record(operator?.workbench);
  const candidate = record(workbench?.work_item_projection_v2);
  if (candidate) {
    if (candidate.schema_version !== WORK_ITEM_PROJECTION_V2_SCHEMA) return { state: 'invalid', projection: null };
    const projection = parseProjection(candidate);
    return projection ? { state: 'ready', projection } : { state: 'invalid', projection: null };
  }
  const legacy = record(workbench?.work_item_projection_v1) ?? record(workbench?.work_item_projection);
  if (legacy?.schema_version === 'work-item-projection.v1') return { state: 'legacy', projection: null };
  return { state: 'missing', projection: null };
}
