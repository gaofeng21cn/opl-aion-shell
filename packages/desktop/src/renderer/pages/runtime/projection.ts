import {
  WORK_ITEM_PROJECTION_V2_SCHEMA,
  type RuntimeAgent,
  type RuntimeAgentAvailabilityState,
  type RuntimeBusinessState,
  type RuntimeCondition,
  type RuntimeExecutionState,
  type RuntimePrimaryStatus,
  type RuntimeProject,
  type RuntimeProjectionDiagnostic,
  type RuntimeProjectionReadResult,
  type RuntimeSourceRef,
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
const AVAILABILITY_STATES = new Set<RuntimeAgentAvailabilityState>([
  'available',
  'attention',
  'unavailable',
  'unknown',
]);
const CONDITION_STATUSES = new Set<RuntimeCondition['status']>(['True', 'False', 'Unknown']);
const CONDITION_SEVERITIES = new Set<RuntimeCondition['severity']>(['none', 'info', 'warning', 'error']);
const ATTENTION_KINDS = new Set(['none', 'user', 'system']);
const SOURCE_REF_KINDS = new Set<RuntimeSourceRef['kind']>(['file', 'sqlite', 'projection']);

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

function primaryStatus(
  businessState: RuntimeBusinessState,
  attentionKind: string,
  systemAttention: RuntimeSystemAttention | null
): { status: RuntimePrimaryStatus; unavailableReason: RuntimeWorkItem['statusUnavailableReason'] } {
  if (attentionKind === 'system') {
    return systemAttention
      ? { status: 'system_attention_required', unavailableReason: null }
      : { status: 'unavailable', unavailableReason: 'incomplete_system_attention' };
  }
  if (attentionKind === 'user') return { status: 'owner_decision_required', unavailableReason: null };
  const statusByBusinessState: Record<Exclude<RuntimeBusinessState, 'unknown'>, RuntimePrimaryStatus> = {
    active: 'in_progress',
    delivered_paused: 'delivered_auto_paused',
    paused: 'paused_waiting_for_direction',
    stopped: 'stopped',
    archived: 'archived',
  };
  return businessState === 'unknown'
    ? { status: 'unavailable', unavailableReason: 'unknown_business_state' }
    : { status: statusByBusinessState[businessState], unavailableReason: null };
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

  const id = requiredString(value.item_id);
  const displayName = requiredString(identity.work_item_display_name);
  const agentId = requiredString(identity.agent_id);
  const projectId = requiredString(identity.project_id);
  const businessState = enumValue(lifecycle.business_state, BUSINESS_STATES);
  const executionState = enumValue(execution.state, EXECUTION_STATES);
  const attentionKind = enumValue(attention.kind, ATTENTION_KINDS);
  const attentionReason = requiredString(attention.reason);
  const stageUsage = parseTokenObservation(telemetry.current_stage);
  const taskUsage = parseTokenObservation(telemetry.cumulative);
  const conditions = parseConditions(value.conditions);
  const sourceRefs = parseSourceRefs(value.source_refs);
  const inventoryObservedAt = requiredString(freshness.inventory_observed_at);
  if (
    !id ||
    !displayName ||
    !agentId ||
    !projectId ||
    !businessState ||
    !executionState ||
    !attentionKind ||
    !attentionReason ||
    !stageUsage ||
    !taskUsage ||
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
  if (execution.started_at !== null && execution.started_at !== undefined && !startedAt) return null;
  if (execution.last_heartbeat_at !== null && execution.last_heartbeat_at !== undefined && !lastHeartbeatAt)
    return null;
  if (execution.updated_at !== null && execution.updated_at !== undefined && !updatedAt) return null;
  if (lifecycle.control_updated_at !== null && lifecycle.control_updated_at !== undefined && !controlUpdatedAt)
    return null;

  const systemAttention = attentionKind === 'system' ? parseSystemAttention(attention) : null;
  const projectedStatus = primaryStatus(businessState, attentionKind, systemAttention);
  const action = systemAttention
    ? {
        kind: 'system_action' as const,
        title: systemAttention.repairAction,
        summary: systemAttention.expectedOutcome,
        ownerDisplayName: systemAttention.responsibleComponent,
      }
    : null;

  return {
    id,
    displayName,
    agentId,
    projectId,
    businessState,
    primaryStatus: projectedStatus.status,
    statusUnavailableReason: projectedStatus.unavailableReason,
    execution: { state: executionState, startedAt, lastHeartbeatAt, updatedAt },
    stageUsage,
    taskUsage,
    action,
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
  if (diagnosticCount === null || diagnosticCount !== diagnostics.length) return null;

  return {
    schemaVersion: WORK_ITEM_PROJECTION_V2_SCHEMA,
    profile,
    generatedAt,
    agents,
    projects,
    items,
    diagnostics,
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
