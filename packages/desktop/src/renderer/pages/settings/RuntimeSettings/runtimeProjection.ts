/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ArtifactProvenanceDrawer,
  ArtifactProvenanceOpenAction,
  ArtifactProvenanceRef,
  ArtifactProvenanceReviewRef,
  ArtifactProvenanceTraceRef,
  ArtifactProvenanceTypedIssue,
  RuntimeActionQueueItem,
  RuntimeDefaultReadSurfacePolicy,
  RuntimeDomainLane,
  RuntimeGraphEdge,
  RuntimeGraphNode,
  RuntimeScopeOption,
  RuntimeScopeOptionKind,
  RuntimeScopeProjection,
  RuntimeScopeSource,
  RuntimeLaneTask,
  RuntimePerformancePolicy,
  RuntimeRefreshPolicy,
  RuntimeSafeActionRoute,
  RuntimeSummaryCard,
  RuntimeTaskAutomationState,
  RuntimeTaskCondition,
  RuntimeTaskDrilldown,
  RuntimeTaskPrimaryState,
  RuntimeTaskRefCard,
  RuntimeTaskRunProjectionV2,
  RuntimeTimelineItem,
  RuntimeVisualizationModel,
} from './types';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(asString).filter((entry): entry is string => Boolean(entry)) : [];
}

function asRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstRecord(...values: unknown[]): JsonRecord | undefined {
  return values.find(isRecord);
}

function jsonSummary(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const parts = Object.entries(value).flatMap(([key, entry]) => {
    const scalar = asString(entry) ?? asNumber(entry)?.toString() ?? asBoolean(entry)?.toString();
    return scalar ? [`${key}: ${scalar}`] : [];
  });
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function readDiagnosticDrilldown(root: unknown): JsonRecord | undefined {
  if (!isRecord(root)) return undefined;
  const traySnapshot = firstRecord(root.runtime_tray_snapshot);
  return firstRecord(root.app_operator_drilldown, traySnapshot?.app_operator_drilldown);
}

function readLegacyVisualizationProjection(root: unknown): JsonRecord | undefined {
  if (!isRecord(root)) return undefined;
  const drilldown = readDiagnosticDrilldown(root);
  const traySnapshot = firstRecord(root.runtime_tray_snapshot);
  return firstRecord(
    drilldown?.runtime_visualization_projection,
    traySnapshot?.runtime_visualization_projection,
    root.runtime_visualization_projection
  );
}

function readProjection(root: unknown, options: { allowLegacyVisualizationProjection?: boolean } = {}): JsonRecord {
  if (!isRecord(root)) return {};
  if (options.allowLegacyVisualizationProjection) {
    const visualization = readLegacyVisualizationProjection(root);
    if (visualization) return visualization;
  }
  return readDiagnosticDrilldown(root) ?? root;
}

function readAppState(root: unknown): JsonRecord | undefined {
  if (!isRecord(root)) return undefined;
  const appState = firstRecord(root.app_state, root);
  return asString(appState?.schema_version) === 'opl_app_state.v1' ? appState : undefined;
}

function normalizePrimaryState(value: unknown): RuntimeTaskPrimaryState | undefined {
  switch (asString(value)) {
    case 'in_progress':
    case 'delivered_auto_paused':
    case 'paused_waiting_for_direction':
    case 'owner_decision_required':
    case 'system_attention_required':
      return asString(value) as RuntimeTaskPrimaryState;
    default:
      return undefined;
  }
}

function normalizeAutomationState(value: unknown): RuntimeTaskAutomationState | undefined {
  switch (asString(value)) {
    case 'automation_running':
    case 'automation_idle':
    case 'result_pending_terminalization':
    case 'automation_failed':
      return asString(value) as RuntimeTaskAutomationState;
    default:
      return undefined;
  }
}

function normalizeScopeKind(value: unknown): RuntimeScopeOptionKind | undefined {
  switch (asString(value)) {
    case 'all_projects':
    case 'agent':
    case 'workspace':
    case 'project':
    case 'task':
      return asString(value) as RuntimeScopeOptionKind;
    default:
      return undefined;
  }
}

function normalizeScopeSource(value: unknown): RuntimeScopeSource | undefined {
  switch (asString(value)) {
    case 'default_global':
    case 'user_selected':
    case 'inferred':
      return asString(value) as RuntimeScopeSource;
    default:
      return undefined;
  }
}

function normalizeStageUsage(value: unknown): string | undefined {
  const scalar = asString(value) ?? asNumber(value)?.toString();
  if (scalar) return scalar;
  if (!isRecord(value)) return undefined;
  const totalTokens =
    asNumber(value.total_tokens) ??
    asNumber(value.total_tokens_observed) ??
    asNumber(value.total_token_count) ??
    asNumber(value.token_count) ??
    asNumber(value.tokens);
  if (totalTokens !== undefined) return `${totalTokens} tokens`;
  const inputTokens = asNumber(value.input_tokens) ?? asNumber(value.prompt_tokens);
  const outputTokens = asNumber(value.output_tokens) ?? asNumber(value.completion_tokens);
  if (inputTokens !== undefined || outputTokens !== undefined) {
    return [
      inputTokens !== undefined ? `in ${inputTokens}` : null,
      outputTokens !== undefined ? `out ${outputTokens}` : null,
    ]
      .filter((entry): entry is string => Boolean(entry))
      .join(' · ');
  }
  return jsonSummary(value);
}

function readSummaryPairs(projection: JsonRecord): Array<{ label: string; value: string }> {
  const summary = firstRecord(projection.summary, projection.runtime_summary, projection.counts);
  if (!summary) return [];
  return Object.entries(summary)
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .map(([label, value]) => ({ label, value: String(value) }));
}

function readNode(record: JsonRecord, fallbackPrefix: string, index: number): RuntimeGraphNode {
  const kind = asString(record.node_kind) ?? asString(record.kind) ?? asString(record.role);
  const id =
    asString(record.id) ??
    asString(record.node_id) ??
    asString(record.key) ??
    asString(record.ref) ??
    `${fallbackPrefix}-${index + 1}`;
  return {
    id,
    label:
      asString(record.label) ??
      asString(record.name) ??
      asString(record.stage_id) ??
      asString(record.action_kind) ??
      asString(record.role) ??
      id,
    kind,
    state:
      asString(record.state) ??
      asString(record.status) ??
      asString(record.current_control_state) ??
      asString(record.production_evidence_status),
    owner: asString(record.owner) ?? asString(record.authority_owner) ?? asString(record.domain_id),
    domainId: asString(record.domain_id),
    stageId: asString(record.stage_id),
    stageAttemptId: asString(record.stage_attempt_id),
    ref: asString(record.ref) ?? asString(record.source_ref) ?? asString(record.receipt_ref),
  };
}

function readEdge(record: JsonRecord): RuntimeGraphEdge | null {
  const from =
    asString(record.from) ?? asString(record.from_node_id) ?? asString(record.source) ?? asString(record.source_id);
  const to =
    asString(record.to) ?? asString(record.to_node_id) ?? asString(record.target) ?? asString(record.target_id);
  if (!from || !to) return null;
  return {
    id: asString(record.id) ?? asString(record.edge_id),
    from,
    to,
    label: asString(record.label) ?? asString(record.edge_kind) ?? asString(record.kind),
    kind: asString(record.edge_kind) ?? asString(record.kind),
    ref: asString(record.ref) ?? asString(record.source_ref),
  };
}

function readGraph(value: unknown, fallbackPrefix: string): { nodes: RuntimeGraphNode[]; edges: RuntimeGraphEdge[] } {
  if (Array.isArray(value)) {
    return { nodes: asRecordArray(value).map((entry, index) => readNode(entry, fallbackPrefix, index)), edges: [] };
  }
  if (!isRecord(value)) return { nodes: [], edges: [] };
  const nodes = asRecordArray(value.nodes ?? value.stages ?? value.routes ?? value.decisions).map((entry, index) =>
    readNode(entry, fallbackPrefix, index)
  );
  const edges = asRecordArray(value.edges ?? value.links)
    .map(readEdge)
    .filter((edge): edge is RuntimeGraphEdge => Boolean(edge));
  return { nodes, edges };
}

function readTimeline(value: unknown): RuntimeTimelineItem[] {
  const entries = isRecord(value) ? value.events : value;
  return asRecordArray(entries).map((entry, index) => {
    const kind = asString(entry.event_kind) ?? asString(entry.kind);
    return {
      id: asString(entry.id) ?? asString(entry.event_id) ?? asString(entry.ref) ?? `timeline-${index + 1}`,
      label:
        asString(entry.label) ??
        asString(entry.event) ??
        asString(entry.stage) ??
        asString(entry.stage_id) ??
        kind ??
        `#${index + 1}`,
      kind,
      state: asString(entry.state) ?? asString(entry.status) ?? asString(entry.current_control_state),
      timestamp:
        asString(entry.timestamp) ?? asString(entry.time) ?? asString(entry.created_at) ?? asString(entry.updated_at),
      domainId: asString(entry.domain_id),
      stageId: asString(entry.stage_id),
      stageAttemptId: asString(entry.stage_attempt_id),
      ref: asString(entry.ref) ?? asString(entry.receipt_ref) ?? asString(entry.source_ref),
    };
  });
}

function readRefs(value: unknown, fallbackPrefix: string): RuntimeGraphNode[] {
  return asRecordArray(value).map((entry, index) => readNode(entry, fallbackPrefix, index));
}

function readOwnerBoundary(projection: JsonRecord): string[] {
  const boundary = firstRecord(projection.owner_boundary, projection.authority_boundary);
  if (!boundary) return [];
  return Object.entries(boundary)
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .map(([key, value]) => `${key}: ${String(value)}`);
}

function readActionRouteId(entry: JsonRecord): string | undefined {
  return asString(entry.action_id) ?? asString(entry.id) ?? asString(entry.action_ref) ?? asString(entry.ref);
}

function readSafeActionRoutes(value: unknown): RuntimeSafeActionRoute[] {
  return asRecordArray(value).flatMap((entry) => {
    const id = readActionRouteId(entry);
    if (!id) return [];
    const payload = firstRecord(entry.payload_refs_only_json, entry.payload_refs, entry.payload);
    return [
      {
        id,
        label: asString(entry.label) ?? asString(entry.title) ?? id,
        owner: asString(entry.owner) ?? asString(entry.authority_owner),
        route: asString(entry.route) ?? asString(entry.command),
        payloadRefsOnlyJson: payload,
        dryRunRequired: entry.dry_run_required !== false,
      },
    ];
  });
}

function readRuntimeWorkbench(projection: JsonRecord): JsonRecord {
  return firstRecord(projection.runtime_workbench) ?? {};
}

function readSummaryCards(workbench: JsonRecord): RuntimeSummaryCard[] {
  return asRecordArray(workbench.summary_cards).map((entry, index) => ({
    id: asString(entry.card_id) ?? asString(entry.id) ?? `summary-${index + 1}`,
    label: asString(entry.label) ?? asString(entry.card_id) ?? `Summary ${index + 1}`,
    value: String(entry.value ?? ''),
    tone: asString(entry.tone),
  }));
}

function readRefreshPolicy(workbench: JsonRecord): RuntimeRefreshPolicy | undefined {
  const policy = firstRecord(workbench.refresh_policy);
  if (!policy) return undefined;
  return {
    summaryPollIntervalSeconds: asNumber(policy.summary_poll_interval_seconds) ?? 10,
    fullDetailAutoPoll: asBoolean(policy.full_detail_auto_poll) ?? false,
    perTokenStreaming: asBoolean(policy.per_token_streaming) ?? false,
  };
}

function readPerformancePolicy(workbench: JsonRecord): RuntimePerformancePolicy {
  const policy = firstRecord(workbench.performance_policy);
  if (!policy) return {};
  return {
    globalMapRenderer: asString(policy.global_map_renderer),
    graphLayoutRecompute: asString(policy.graph_layout_recompute),
  };
}

function readDefaultReadSurfacePolicy(value: unknown): RuntimeDefaultReadSurfacePolicy | undefined {
  const policy = firstRecord(value);
  if (!policy) return undefined;
  const shellContract = firstRecord(policy.shell_contract);
  return {
    defaultProjection: asString(policy.default_projection) ?? asString(policy.default_operator_payload),
    normalStateSurface: asString(policy.normal_state_surface),
    fullRuntimeDrilldownSurface: asString(policy.full_runtime_drilldown_surface),
    rawRuntimeProjectionPolicy: asString(policy.raw_runtime_projection_policy) ?? asString(policy.raw_refs_policy),
    firstScreenAnswers: asStringArray(policy.first_screen_answers),
    forbiddenDefaultStateFields: asStringArray(policy.forbidden_default_state_fields ?? policy.fast_profile_excludes),
    fullDetailAutoPoll: asBoolean(policy.full_detail_auto_poll) ?? asBoolean(shellContract?.full_detail_auto_poll),
    shellMustNotUseFullDrilldownAsNormalState:
      asBoolean(policy.shell_must_not_use_full_drilldown_as_normal_state) ??
      asBoolean(shellContract?.shell_must_not_use_full_drilldown_as_normal_state),
    shellMustNotDeriveLayoutFromRawRuntimeProjection:
      asBoolean(policy.shell_must_not_derive_layout_from_raw_runtime_projection) ??
      asBoolean(shellContract?.shell_must_not_derive_layout_from_raw_runtime_projection),
  };
}

function readActionQueue(workbench: JsonRecord): RuntimeActionQueueItem[] {
  const queue = firstRecord(workbench.action_queue);
  return asRecordArray(queue?.items).map((entry, index) => ({
    id: asString(entry.item_id) ?? asString(entry.id) ?? `queue-${index + 1}`,
    taskId: asString(entry.task_id) ?? `task-${index + 1}`,
    title: asString(entry.title) ?? asString(entry.task_id) ?? `Task ${index + 1}`,
    subtitle: asString(entry.subtitle),
    domainId: asString(entry.domain_id),
    domainLabel: asString(entry.domain_label),
    state: asString(entry.state),
    priorityBucket: asString(entry.priority_bucket),
    safeActionRefCount: asNumber(entry.safe_action_ref_count) ?? 0,
    blockerRefCount: asNumber(entry.blocker_ref_count) ?? 0,
    paperRouteLensRefCount: asNumber(entry.paper_route_lens_ref_count) ?? 0,
  }));
}

function readLaneTask(entry: JsonRecord, index: number): RuntimeLaneTask {
  return {
    taskId: asString(entry.task_id) ?? `lane-task-${index + 1}`,
    label: asString(entry.label) ?? asString(entry.title) ?? asString(entry.task_id) ?? `Task ${index + 1}`,
    state: asString(entry.state),
    priorityBucket: asString(entry.priority_bucket),
    activeStageId: asString(entry.active_stage_id),
    activePathNodeIds: asStringArray(entry.active_path_node_ids),
    paperRouteLensRefCount: asNumber(entry.paper_route_lens_ref_count) ?? 0,
  };
}

function readDomainLaneMap(workbench: JsonRecord): RuntimeDomainLane[] {
  const laneMap = firstRecord(workbench.domain_lane_map);
  return asRecordArray(laneMap?.lanes).map((entry, index) => ({
    domainId: asString(entry.domain_id) ?? `domain-${index + 1}`,
    label: asString(entry.lane_label) ?? asString(entry.label) ?? asString(entry.domain_id) ?? `Domain ${index + 1}`,
    activeTaskCount: asNumber(entry.active_task_count) ?? 0,
    blockedTaskCount: asNumber(entry.blocked_task_count) ?? 0,
    paperRouteLensRefCount: asNumber(entry.paper_route_lens_ref_count) ?? 0,
    tasks: asRecordArray(entry.tasks).map(readLaneTask),
  }));
}

function readTaskDrilldowns(workbench: JsonRecord): RuntimeTaskDrilldown[] {
  return asRecordArray(workbench.task_drilldowns).map((entry, index) => readTaskRunRecord(entry, index));
}

function derivePrimaryState(entry: JsonRecord): RuntimeTaskPrimaryState {
  const explicit = normalizePrimaryState(entry.primary_state);
  if (explicit) return explicit;
  const state = asString(entry.state);
  const status = asString(entry.status);
  const progress = asString(entry.progress_delta_classification);
  if (
    ['blocked', 'blocking', 'failed', 'error', 'attention_needed', 'attention_required', 'missing'].includes(
      state ?? ''
    ) ||
    ['blocked', 'blocking', 'failed', 'error', 'attention_needed', 'attention_required', 'missing'].includes(
      status ?? ''
    ) ||
    ['human_gate', 'platform_repair', 'typed_blocker', 'stop_loss'].includes(progress ?? '')
  ) {
    return 'system_attention_required';
  }
  return 'paused_waiting_for_direction';
}

function deriveAutomationState(entry: JsonRecord): RuntimeTaskAutomationState {
  const explicit = normalizeAutomationState(entry.automation_state);
  if (explicit) return explicit;
  const state = asString(entry.state);
  const status = asString(entry.status);
  if (
    ['blocked', 'blocking', 'failed', 'error', 'attention_needed', 'attention_required', 'missing'].includes(
      state ?? ''
    ) ||
    ['blocked', 'blocking', 'failed', 'error', 'attention_needed', 'attention_required', 'missing'].includes(
      status ?? ''
    ) ||
    ['platform_repair', 'typed_blocker', 'stop_loss'].includes(asString(entry.progress_delta_classification) ?? '')
  ) {
    return 'automation_failed';
  }
  return 'automation_idle';
}

function readScopeOption(entry: JsonRecord, index: number): RuntimeScopeOption {
  const kind = normalizeScopeKind(entry.kind ?? entry.scope_kind ?? entry.option_kind) ?? 'task';
  const value =
    asString(entry.value) ??
    asString(entry.scope_value) ??
    asString(entry.scope_id) ??
    asString(entry.id) ??
    `${kind}-${index + 1}`;
  return {
    id: asString(entry.id) ?? `${kind}:${value}`,
    kind,
    label: asString(entry.label) ?? asString(entry.display_label) ?? asString(entry.title) ?? value,
    value,
  };
}

function uniqueScopeOptions(options: RuntimeScopeOption[]): RuntimeScopeOption[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = `${option.kind}:${option.value ?? option.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deriveScopeOptionsFromTasks(tasks: RuntimeTaskDrilldown[]): RuntimeScopeOption[] {
  const options: RuntimeScopeOption[] = [
    { id: 'all-projects', kind: 'all_projects', label: 'All projects', value: 'all_projects' },
  ];
  const append = (kind: RuntimeScopeOptionKind, value: string | undefined, label: string | undefined) => {
    const normalizedValue = value?.trim();
    const normalizedLabel = label?.trim();
    if (!normalizedValue || !normalizedLabel) return;
    options.push({ id: `${kind}:${normalizedValue}`, kind, label: normalizedLabel, value: normalizedValue });
  };
  tasks.forEach((task) => {
    append('agent', task.domainId ?? task.agentDisplayName, task.agentDisplayName ?? task.domainLabel);
    append('workspace', task.workspaceId ?? task.workspaceLabel, task.workspaceLabel);
    append(
      'project',
      task.projectId ?? task.projectDisplayName ?? task.studyId,
      task.projectDisplayName ?? task.studyId ?? task.title
    );
    append('task', task.taskId, task.workItemDisplayName ?? task.title);
  });
  return uniqueScopeOptions(options);
}

function readRuntimeScope(workbench: JsonRecord, tasks: RuntimeTaskDrilldown[]): RuntimeScopeProjection {
  const runtimeScope = firstRecord(workbench.runtime_scope);
  const projectedOptions = asRecordArray(runtimeScope?.scope_options).map(readScopeOption);
  const options =
    projectedOptions.length > 0 ? uniqueScopeOptions(projectedOptions) : deriveScopeOptionsFromTasks(tasks);
  const projectedCurrent = firstRecord(runtimeScope?.current_scope);
  const projectedCurrentOption = projectedCurrent
    ? readScopeOption(projectedCurrent, 0)
    : (options[0] ?? { id: 'all-projects', kind: 'all_projects', label: 'All projects', value: 'all_projects' });
  const current =
    options.find(
      (option) =>
        option.id === projectedCurrentOption.id ||
        (option.kind === projectedCurrentOption.kind && option.value === projectedCurrentOption.value)
    ) ?? projectedCurrentOption;
  const inferredHint =
    asString(runtimeScope?.inferred_scope_hint) ??
    asString(projectedCurrent?.inferred_scope_hint) ??
    asString(firstRecord(runtimeScope?.inferred_scope_hint)?.label);
  return {
    options: options.length > 0 ? options : [current],
    current,
    source: normalizeScopeSource(runtimeScope?.scope_source ?? projectedCurrent?.scope_source) ?? 'default_global',
    inferredHint,
    frameworkBacked: Boolean(runtimeScope),
  };
}

function readRefCardValue(value: unknown): { value?: string; ref?: string; kind?: string } {
  if (isRecord(value)) {
    return {
      value: asString(value.summary) ?? asString(value.message) ?? asString(value.label) ?? asString(value.title),
      ref:
        asString(value.ref) ??
        asString(value.summary_ref) ??
        asString(value.receipt_ref) ??
        asString(value.status_ref) ??
        asString(value.dry_run_ref) ??
        asString(value.execute_ref) ??
        asString(value.action_receipt) ??
        asString(value.environment_ref) ??
        asString(value.usage_ref) ??
        asStringArray(value.source_refs)[0] ??
        asStringArray(value.lineage_refs)[0],
      kind: asString(value.kind) ?? asString(value.type),
    };
  }
  return { ref: asString(value) };
}

function readRefCards(value: unknown, fallbackPrefix: string, fallbackLabel: string): RuntimeTaskRefCard[] {
  return asArray(value).flatMap((entry, index): RuntimeTaskRefCard[] => {
    const card = readRefCardValue(entry);
    if (!card.value && !card.ref) return [];
    const record = isRecord(entry) ? entry : {};
    const openAction = firstRecord(record.open_action);
    const risk = firstRecord(record.risk);
    const expectedOutput = firstRecord(record.expected_output);
    const detailEntries = [
      ['kind', asString(record.kind) ?? asString(record.resource_kind) ?? asString(record.type)],
      ['owner', asString(record.owner)],
      ['updated_at', asString(record.updated_at)],
      ['why_it_matters', asString(record.why_it_matters)],
      ['open_action', asString(openAction?.route) ?? asString(openAction?.action_id)],
      ['risk', jsonSummary(risk)],
      ['write_targets', asStringArray(record.write_targets).join(', ')],
      ['expected_output', asString(expectedOutput?.ref) ?? jsonSummary(expectedOutput)],
      ['rollback_ref', asString(record.rollback_ref)],
      ['verify_ref', asString(record.verify_ref)],
      ['status_ref', asString(record.status_ref)],
      ['usage_ref', asString(record.usage_ref)],
      ['quota_ref', asString(record.quota_ref)],
      ['permission_ref', asString(record.permission_ref)],
      ['cost_estimate_ref', asString(record.cost_estimate_ref)],
    ].flatMap(([key, detailValue]) =>
      typeof detailValue === 'string' && detailValue.trim().length > 0 ? [{ key, value: detailValue }] : []
    );
    return [
      {
        id:
          asString(record.card_id) ??
          asString(record.action_id) ??
          asString(record.resource_id) ??
          asString(record.id) ??
          card.ref ??
          `${fallbackPrefix}-${index + 1}`,
        label:
          asString(record.title) ??
          asString(record.label) ??
          asString(record.kind) ??
          asString(record.type) ??
          fallbackLabel,
        value: card.value,
        ref: card.ref,
        kind: card.kind,
        details: detailEntries,
      },
    ];
  });
}

function readSingleRefCard(
  value: unknown,
  id: string,
  label: string,
  options: { value?: unknown; kind?: string } = {}
): RuntimeTaskRefCard[] {
  const ref = readRefCardValue(value);
  const display = asString(options.value) ?? ref.value;
  if (!display && !ref.ref) return [];
  return [{ id, label, value: display, ref: ref.ref, kind: options.kind ?? ref.kind, details: [] }];
}

function readTaskConditions(entry: JsonRecord): RuntimeTaskCondition[] {
  const explicitConditions = asRecordArray(entry.conditions).map((condition, index) => ({
    id: asString(condition.id) ?? asString(condition.type) ?? asString(condition.reason) ?? `condition-${index + 1}`,
    type: asString(condition.type),
    status: asString(condition.status),
    reason: asString(condition.reason),
    message: asString(condition.message),
  }));
  const refConditions = [
    ...readRefCards(entry.blocker_refs, 'blocker', 'Blocker'),
    ...readRefCards(entry.human_gate_refs, 'human-gate', 'Human gate'),
    ...readRefCards(entry.readiness_false_flag_refs, 'readiness-flag', 'Readiness flag'),
  ].map((card) => ({
    id: card.id,
    type: card.label,
    status: asString(entry.attention_state),
    message: card.value ?? card.ref,
  }));
  return [...explicitConditions, ...refConditions];
}

function readArtifactProvenanceRefs(value: unknown): ArtifactProvenanceRef[] {
  return asArray(value).flatMap((entry): ArtifactProvenanceRef[] => {
    if (isRecord(entry)) {
      const provenanceRef = {
        artifactId: asString(entry.artifact_id),
        artifactRef: asString(entry.artifact_ref),
        bundleRef: asString(entry.bundle_ref),
        ledgerRecordRef: asString(entry.ledger_record_ref),
        contentHashRef: asString(entry.content_hash_ref),
      };
      return Object.values(provenanceRef).some(Boolean) ? [provenanceRef] : [];
    }
    const bundleRef = asString(entry);
    return bundleRef ? [{ bundleRef }] : [];
  });
}

function readArtifactProvenanceTraceRefs(value: unknown): ArtifactProvenanceTraceRef[] {
  return asArray(value).flatMap((entry): ArtifactProvenanceTraceRef[] => {
    if (isRecord(entry)) {
      const traceRef = {
        traceKind: asString(entry.trace_kind),
        traceRef: asString(entry.trace_ref),
        access: asString(entry.access),
      };
      return Object.values(traceRef).some(Boolean) ? [traceRef] : [];
    }
    const traceRef = asString(entry);
    return traceRef ? [{ traceRef }] : [];
  });
}

function readArtifactProvenanceReviewRefs(value: unknown): ArtifactProvenanceReviewRef[] {
  return asArray(value).flatMap((entry): ArtifactProvenanceReviewRef[] => {
    if (isRecord(entry)) {
      const reviewRef = {
        reviewKind: asString(entry.review_kind),
        reviewRef: asString(entry.review_ref),
        reviewerOwner: asString(entry.reviewer_owner),
      };
      return Object.values(reviewRef).some(Boolean) ? [reviewRef] : [];
    }
    const reviewRef = asString(entry);
    return reviewRef ? [{ reviewRef }] : [];
  });
}

function readArtifactProvenanceTypedIssues(value: unknown): ArtifactProvenanceTypedIssue[] {
  return asArray(value).flatMap((entry): ArtifactProvenanceTypedIssue[] => {
    if (isRecord(entry)) {
      const issue = {
        issueType: asString(entry.issue_type),
        severity: asString(entry.severity),
        ref: asString(entry.ref),
        owner: asString(entry.owner),
      };
      return Object.values(issue).some(Boolean) ? [issue] : [];
    }
    const ref = asString(entry);
    return ref ? [{ ref }] : [];
  });
}

function readArtifactProvenanceOpenAction(value: unknown): ArtifactProvenanceOpenAction | undefined {
  const openAction = firstRecord(value);
  if (!openAction) return undefined;
  const action = {
    actionId: asString(openAction.action_id),
    actionRef: asString(openAction.action_ref),
    route: asString(openAction.route),
    requiredMode: asString(openAction.required_mode),
  };
  return Object.values(action).some(Boolean) ? action : undefined;
}

function readArtifactProvenanceDrawer(value: unknown): ArtifactProvenanceDrawer | undefined {
  const artifactDrilldown = firstRecord(value);
  if (!artifactDrilldown) return undefined;
  const drawer = firstRecord(artifactDrilldown.provenance_drawer);
  const provenanceDrawer = {
    provenanceProjectionKind: asString(artifactDrilldown.provenance_projection_kind),
    provenanceProjectionRef: asString(artifactDrilldown.provenance_projection_ref),
    provenanceIndexRef: asString(artifactDrilldown.provenance_index_ref),
    provenanceBundleRefs: readArtifactProvenanceRefs(artifactDrilldown.provenance_bundle_refs),
    roCrateMetadataRef: asString(artifactDrilldown.ro_crate_metadata_ref),
    replayStatusRef: asString(artifactDrilldown.replay_status_ref),
    agentTraceRefs: readArtifactProvenanceTraceRefs(artifactDrilldown.agent_trace_refs),
    reviewRefs: readArtifactProvenanceReviewRefs(artifactDrilldown.review_refs),
    typedIssues: readArtifactProvenanceTypedIssues(artifactDrilldown.typed_issues),
    drawerSurfaceKind: asString(drawer?.surface_kind),
    drawerRoute: asString(drawer?.route),
    drawerProjectionRef: asString(drawer?.projection_ref),
    openAction: readArtifactProvenanceOpenAction(drawer?.open_action),
  };
  const hasContent =
    Boolean(
      provenanceDrawer.provenanceProjectionKind ??
      provenanceDrawer.provenanceProjectionRef ??
      provenanceDrawer.provenanceIndexRef ??
      provenanceDrawer.roCrateMetadataRef ??
      provenanceDrawer.replayStatusRef ??
      provenanceDrawer.drawerSurfaceKind ??
      provenanceDrawer.drawerRoute ??
      provenanceDrawer.drawerProjectionRef ??
      provenanceDrawer.openAction
    ) ||
    provenanceDrawer.provenanceBundleRefs.length > 0 ||
    provenanceDrawer.agentTraceRefs.length > 0 ||
    provenanceDrawer.reviewRefs.length > 0 ||
    provenanceDrawer.typedIssues.length > 0;
  return hasContent ? provenanceDrawer : undefined;
}

function readTaskRunRecord(entry: JsonRecord, index: number): RuntimeTaskDrilldown {
  const taskId = asString(entry.task_id) ?? `task-${index + 1}`;
  const blockerRefsCount = asArray(entry.blocker_refs).length;
  const stageRun = firstRecord(entry.stage_run_cockpit, entry.stage_run_current_owner_delta);
  const stageRunSummary = firstRecord(entry.stage_run_cockpit_summary);
  const activeStage = firstRecord(entry.stage, entry.active_stage);
  const nextOwner = firstRecord(entry.next_owner, entry.owner);
  return {
    taskId,
    title: asString(entry.title) ?? taskId,
    domainId: asString(entry.domain_id),
    domainLabel: asString(entry.domain_label),
    agentDisplayName: asString(entry.agent_display_name) ?? asString(entry.domain_label) ?? asString(entry.domain_id),
    workspaceId: asString(entry.workspace_id),
    workspaceLabel: asString(entry.workspace_label),
    projectId: asString(entry.project_id) ?? asString(entry.study_id),
    projectDisplayName: asString(entry.project_display_name) ?? asString(entry.study_id),
    studyId: asString(entry.study_id),
    workItemDisplayName: asString(entry.work_item_display_name) ?? asString(entry.title),
    executionRunLabel: asString(entry.execution_run_label) ?? asString(entry.active_run_id),
    state: asString(entry.state),
    status: asString(entry.status_label) ?? asString(entry.status),
    primaryState: derivePrimaryState(entry),
    primaryStateLabel: asString(entry.primary_state_label),
    primaryStateReason: asString(entry.primary_state_reason),
    automationState: deriveAutomationState(entry),
    automationStateLabel: asString(entry.automation_state_label),
    automationStateReason: asString(entry.automation_state_reason),
    stage:
      asString(entry.stage) ??
      asString(entry.active_stage_label) ??
      asString(activeStage?.label) ??
      asString(activeStage?.stage_id) ??
      asString(entry.active_stage_id),
    progressLabel: asString(entry.progress_label) ?? asString(entry.progress_delta_classification),
    nextStep: asString(entry.next_step) ?? asString(entry.next_visible_step) ?? asString(entry.required_next_action),
    nextOwner:
      asString(entry.next_owner) ?? asString(entry.owner) ?? asString(nextOwner?.owner) ?? asString(nextOwner?.label),
    lastProgressAt: asString(entry.last_progress_at) ?? asString(entry.updated_at),
    activeStageId: asString(entry.active_stage_id) ?? asString(activeStage?.stage_id),
    activeRunId: asString(entry.active_run_id),
    elapsedSeconds:
      asNumber(stageRun?.elapsed_seconds) ??
      asNumber(stageRunSummary?.elapsed_seconds) ??
      asNumber(entry.elapsed_seconds),
    lastHeartbeatAt:
      asString(stageRun?.last_heartbeat_at) ??
      asString(stageRunSummary?.last_heartbeat_at) ??
      asString(entry.last_heartbeat_at),
    runningProofRef: asString(stageRun?.running_proof_ref) ?? asString(stageRunSummary?.running_proof_ref),
    stageUsage:
      normalizeStageUsage(stageRun?.stage_usage) ??
      normalizeStageUsage(stageRunSummary?.stage_usage) ??
      normalizeStageUsage(entry.stage_usage),
    taskTotalUsage:
      normalizeStageUsage(stageRun?.task_total_usage) ??
      normalizeStageUsage(stageRunSummary?.task_total_usage) ??
      normalizeStageUsage(entry.task_total_usage),
    typedBlockerSummary:
      asString(stageRun?.typed_blocker_summary) ??
      asString(stageRunSummary?.typed_blocker_summary) ??
      asString(entry.typed_blocker_summary) ??
      asString(entry.blocker_summary),
    typedBlockerOwner:
      asString(stageRun?.typed_blocker_owner) ??
      asString(stageRunSummary?.typed_blocker_owner) ??
      asString(entry.next_owner),
    typedBlockerResolutionRef:
      asString(stageRun?.typed_blocker_resolution_ref) ?? asString(stageRunSummary?.typed_blocker_resolution_ref),
    runtimeCloseoutObserved: entry.runtime_closeout_observed === true,
    runtimeCloseoutRef: asString(entry.runtime_closeout_ref),
    masOwnerConsumptionStatus: asString(entry.mas_owner_consumption_status),
    masOwnerConsumptionRef: asString(entry.mas_owner_consumption_ref),
    masOwnerConsumedStageAttemptId: asString(entry.mas_owner_consumed_stage_attempt_id),
    masOwnerConsumedCloseoutRef: asString(entry.mas_owner_consumed_closeout_ref),
    masOwnerConsumptionMatchesRuntimeCloseout:
      typeof entry.mas_owner_consumption_matches_runtime_closeout === 'boolean'
        ? entry.mas_owner_consumption_matches_runtime_closeout
        : undefined,
    stageAttemptIds: asStringArray(entry.stage_attempt_ids),
    paperRouteLensRefCount: asNumber(entry.paper_route_lens_ref_count) ?? 0,
    safeActionRefCount: asNumber(entry.safe_action_ref_count) ?? asRecordArray(entry.action_cards).length,
    blockerRefCount: asNumber(entry.blocker_ref_count) ?? blockerRefsCount + asRecordArray(entry.conditions).length,
    activePath: asRecordArray(entry.active_path).map((node, nodeIndex) => readNode(node, 'path', nodeIndex)),
    conditions: readTaskConditions(entry),
    evidenceCards: [
      ...readRefCards(entry.evidence_cards, 'evidence', 'Evidence'),
      ...readSingleRefCard(entry.artifact_or_blocker, 'artifact-or-blocker', 'Artifact or blocker'),
      ...readSingleRefCard(entry.review_receipt, 'review-receipt', 'Review receipt'),
    ],
    actionCards: [
      ...readRefCards(entry.action_cards, 'action', 'Action'),
      ...readSingleRefCard(entry.action_receipt, 'action-receipt', 'Action receipt'),
      ...readSingleRefCard(entry.export_bundle_action_ref, 'export-bundle', 'Export bundle'),
    ],
    resourceRefs: [
      ...readRefCards(entry.resource_cards, 'resource', 'Resource'),
      ...readSingleRefCard(entry.gateway_status_ref, 'gateway-status', 'Gateway status'),
      ...readRefCards(entry.resource_source_refs, 'resource-source', 'Resource source'),
      ...readSingleRefCard(entry.environment_ref, 'environment', 'Environment'),
      ...readSingleRefCard(entry.storage_ref, 'storage', 'Storage'),
      ...readSingleRefCard(entry.resource_usage_ref, 'resource-usage', 'Resource usage'),
      ...readSingleRefCard(entry.resource_receipt_ref, 'resource-receipt', 'Resource receipt'),
      ...readSingleRefCard(entry.cost_estimate_ref, 'cost-estimate', 'Cost estimate'),
    ],
    diagnosticsRefs: [
      ...readRefCards(entry.diagnostics_refs, 'diagnostics', 'Diagnostics'),
      ...readSingleRefCard(entry.diagnostics_ref, 'diagnostics-ref', 'Diagnostics'),
    ],
    artifactProvenanceDrawer: readArtifactProvenanceDrawer(entry.artifact_native_drilldown),
  };
}

function readTaskRunProjectionV2(workbench: JsonRecord): RuntimeTaskRunProjectionV2 {
  const projection = firstRecord(workbench.task_run_projection_v2);
  if (projection) {
    const summary = firstRecord(projection.summary) ?? {};
    return {
      projectionKind: asString(projection.projection_kind),
      schemaVersion: asNumber(projection.schema_version),
      summary: {
        running: asNumber(summary.running_task_count) ?? asNumber(summary.running) ?? 0,
        waiting: asNumber(summary.waiting_task_count) ?? asNumber(summary.waiting) ?? 0,
        attention: asNumber(summary.attention_task_count) ?? asNumber(summary.attention) ?? 0,
        completed: asNumber(summary.completed_task_count) ?? asNumber(summary.completed) ?? 0,
        failed: asNumber(summary.failed_task_count) ?? asNumber(summary.failed) ?? 0,
        available:
          asNumber(summary.task_count) ?? asNumber(summary.available) ?? asRecordArray(projection.tasks).length,
      },
      tasks: asRecordArray(projection.tasks).map((entry, index) => readTaskRunRecord(entry, index)),
    };
  }
  const tasks = readTaskDrilldowns(workbench);
  return {
    summary: {
      running: tasks.filter((task) => task.state === 'running').length,
      waiting: tasks.filter((task) => task.state === 'waiting').length,
      attention: tasks.filter((task) => task.state === 'attention_needed').length,
      completed: tasks.filter((task) => task.state === 'completed').length,
      failed: tasks.filter((task) => task.state === 'failed').length,
      available: tasks.length,
    },
    tasks,
  };
}

function statusTone(status: string | undefined): string {
  if (!status) return 'neutral';
  return ['ready', 'healthy', 'ok', 'installed', 'enabled'].includes(status) ? 'ready' : 'attention';
}

function normalizeAppStateSummaryCards(appState: JsonRecord): RuntimeSummaryCard[] {
  const core = firstRecord(appState.core);
  const codex = firstRecord(core?.codex);
  const provider = firstRecord(appState.provider);
  const temporal = firstRecord(provider?.temporal);
  const modules = firstRecord(appState.modules);
  const moduleSummary = firstRecord(modules?.summary);
  const codexVersion = asString(codex?.parsed_version) ?? asString(codex?.version) ?? 'missing';
  const codexModel = asString(codex?.default_model);
  const codexReasoning = asString(codex?.default_reasoning_effort);
  const codexStatus = asString(codex?.status) ?? (codexVersion === 'missing' ? 'missing' : 'ready');
  const temporalStatus = asString(temporal?.status) ?? asString(temporal?.health_status) ?? 'unknown';
  const defaultModuleCount = asNumber(moduleSummary?.default_modules_count);
  const healthyDefaultModuleCount = asNumber(moduleSummary?.healthy_default_modules_count);

  return [
    {
      id: 'codex',
      label: 'Codex CLI',
      value: [codexVersion, [codexModel, codexReasoning].filter(Boolean).join(' ')].filter(Boolean).join(' / '),
      tone: statusTone(codexStatus),
    },
    {
      id: 'temporal',
      label: 'Temporal',
      value: temporalStatus,
      tone: statusTone(temporalStatus),
    },
    {
      id: 'modules',
      label: 'Runtime modules',
      value:
        defaultModuleCount === undefined || healthyDefaultModuleCount === undefined
          ? 'unknown'
          : `${healthyDefaultModuleCount}/${defaultModuleCount}`,
      tone:
        defaultModuleCount !== undefined && healthyDefaultModuleCount === defaultModuleCount ? 'ready' : 'attention',
    },
  ];
}

function normalizeAppStateDomainLaneMap(appState: JsonRecord): RuntimeDomainLane[] {
  const modules = firstRecord(appState.modules);
  return asRecordArray(modules?.items).map((entry, index) => {
    const domainId = asString(entry.module_id) ?? asString(entry.id) ?? `module-${index + 1}`;
    const healthStatus = asString(entry.health_status) ?? asString(entry.status);
    const label = asString(entry.label) ?? domainId;
    return {
      domainId,
      label,
      activeTaskCount: 1,
      blockedTaskCount: healthStatus && statusTone(healthStatus) !== 'ready' ? 1 : 0,
      paperRouteLensRefCount: 0,
      tasks: [
        {
          taskId: domainId,
          label,
          state: healthStatus,
          activePathNodeIds: [] as string[],
          paperRouteLensRefCount: 0,
        },
      ],
    };
  });
}

function normalizeAppStateActions(appState: JsonRecord): RuntimeSafeActionRoute[] {
  return asRecordArray(appState.actions).flatMap((entry) => {
    const id = readActionRouteId(entry);
    if (!id) return [];
    const payload = firstRecord(entry.payload_refs_only_json, entry.payload_refs, entry.payload);
    return [
      {
        id,
        label: asString(entry.label) ?? id,
        owner: asString(entry.owner) ?? asString(entry.authority_owner),
        route: asString(entry.delegated_surface) ?? asString(entry.route) ?? asString(entry.command),
        payloadRefsOnlyJson: payload,
        dryRunRequired: entry.dry_run_required !== false,
      },
    ];
  });
}

function normalizeAppStateRefs(appState: JsonRecord): RuntimeGraphNode[] {
  const modules = firstRecord(appState.modules);
  return asRecordArray(modules?.items).flatMap((entry, index) => {
    const moduleId = asString(entry.module_id) ?? asString(entry.id) ?? `module-${index + 1}`;
    const label = asString(entry.label) ?? moduleId;
    const refs: RuntimeGraphNode[] = [];
    const checkoutPath = asString(entry.checkout_path);
    if (checkoutPath) {
      refs.push({
        id: `${moduleId}:checkout_path`,
        label: `${label} checkout`,
        kind: 'module_checkout',
        state: asString(entry.health_status) ?? asString(entry.status),
        domainId: moduleId,
        ref: checkoutPath,
      });
    }
    const managedCheckoutPath = asString(entry.managed_checkout_path);
    if (managedCheckoutPath && managedCheckoutPath !== checkoutPath) {
      refs.push({
        id: `${moduleId}:managed_checkout_path`,
        label: `${label} managed checkout`,
        kind: 'module_checkout',
        state: asString(entry.health_status) ?? asString(entry.status),
        domainId: moduleId,
        ref: managedCheckoutPath,
      });
    }
    return refs;
  });
}

function normalizeAppStateProjection(appState: JsonRecord): RuntimeVisualizationModel {
  const operator = firstRecord(appState.operator);
  const workbench = firstRecord(operator?.workbench);
  const taskRunProjectionV2 = readTaskRunProjectionV2(workbench ?? {});
  return {
    sourceSurface: asString(appState.surface_kind) ?? 'opl_app_state',
    state: asString(operator?.status) ?? asString(appState.status) ?? 'unknown',
    summary: asString(operator?.summary)
      ? [{ label: 'operator_summary', value: asString(operator?.summary) ?? '' }]
      : [],
    summaryCards: normalizeAppStateSummaryCards(appState),
    scope: readRuntimeScope(workbench ?? {}, taskRunProjectionV2.tasks),
    actionQueue: [],
    domainLaneMap: normalizeAppStateDomainLaneMap(appState),
    taskDrilldowns: taskRunProjectionV2.tasks,
    taskRunProjectionV2,
    defaultReadSurfacePolicy: readDefaultReadSurfacePolicy(
      operator?.default_read_surface_policy ?? workbench?.default_read_surface_policy
    ),
    refreshPolicy: undefined,
    performancePolicy: {},
    stageGraph: { nodes: [], edges: [] },
    routeGraph: { nodes: [], edges: [] },
    decisionMap: [],
    timeline: [],
    researchPaperLensRefs: [],
    ownerBoundary: [],
    safeActionRoutes: normalizeAppStateActions(appState),
    refs: normalizeAppStateRefs(appState),
  };
}

function normalizeProjectionRecord(projection: JsonRecord): RuntimeVisualizationModel {
  const workbench = readRuntimeWorkbench(projection);
  const taskRunProjectionV2 = readTaskRunProjectionV2(workbench);
  const unifiedGraph = readGraph(projection.graph, 'runtime');
  const stageGraph =
    unifiedGraph.nodes.length > 0
      ? {
          nodes: unifiedGraph.nodes.filter((node) => ['stage_attempt', 'stage_evidence'].includes(node.kind ?? '')),
          edges: unifiedGraph.edges.filter((edge) => ['attempt_has_stage_evidence'].includes(edge.kind ?? '')),
        }
      : readGraph(projection.stage_graph ?? projection.stages, 'stage');
  const routeGraph =
    unifiedGraph.nodes.length > 0
      ? {
          nodes: unifiedGraph.nodes.filter((node) =>
            ['route_graph', 'owner_receipt', 'typed_blocker', 'safe_action'].includes(node.kind ?? '')
          ),
          edges: unifiedGraph.edges.filter((edge) =>
            [
              'attempt_has_route_graph',
              'attempt_observed_owner_receipt',
              'attempt_observed_typed_blocker',
              'attempt_has_safe_action_route',
            ].includes(edge.kind ?? '')
          ),
        }
      : readGraph(projection.route_graph ?? projection.routes, 'route');
  const decisionMap =
    unifiedGraph.nodes.length > 0
      ? unifiedGraph.nodes.filter((node) => node.kind === 'decision_map')
      : readGraph(projection.decision_map ?? projection.decisions, 'decision').nodes;
  const researchLens = firstRecord(projection.research_lens);
  const visualRefGroups = firstRecord(projection.visual_ref_groups);
  const refs = [
    ...readRefs(projection.refs, 'ref'),
    ...readRefs(projection.memory_refs, 'memory'),
    ...readRefs(projection.quality_refs, 'quality'),
    ...readRefs(projection.provider_slo_refs, 'slo'),
    ...readRefs(visualRefGroups?.owner_receipt_refs, 'owner-receipt'),
    ...readRefs(visualRefGroups?.typed_blocker_refs, 'typed-blocker'),
  ];

  return {
    sourceSurface: asString(projection.surface_kind) ?? asString(projection.source_surface) ?? 'app_operator_drilldown',
    state: asString(projection.state) ?? asString(projection.runtime_state) ?? asString(projection.status) ?? 'unknown',
    summary: readSummaryPairs(projection),
    summaryCards: readSummaryCards(workbench),
    scope: readRuntimeScope(workbench, taskRunProjectionV2.tasks),
    actionQueue: readActionQueue(workbench),
    domainLaneMap: readDomainLaneMap(workbench),
    taskDrilldowns: taskRunProjectionV2.tasks,
    taskRunProjectionV2,
    defaultReadSurfacePolicy: readDefaultReadSurfacePolicy(
      projection.default_read_surface_policy ?? workbench.default_read_surface_policy
    ),
    refreshPolicy: readRefreshPolicy(workbench),
    performancePolicy: readPerformancePolicy(workbench),
    stageGraph,
    routeGraph,
    decisionMap,
    timeline: readTimeline(projection.timeline ?? projection.events),
    researchPaperLensRefs: readRefs(
      researchLens?.paper_route_lens_refs ?? projection.research_paper_lens_refs,
      'paper'
    ),
    ownerBoundary: readOwnerBoundary(projection),
    safeActionRoutes: readSafeActionRoutes(projection.safe_action_routes ?? visualRefGroups?.safe_action_refs),
    refs,
  };
}

export function normalizeRuntimeProjection(root: unknown): RuntimeVisualizationModel {
  const appState = readAppState(root);
  if (appState) {
    return normalizeAppStateProjection(appState);
  }

  return normalizeProjectionRecord(readProjection(root));
}

export function normalizeLegacyRuntimeVisualizationProjection(root: unknown): RuntimeVisualizationModel {
  return normalizeProjectionRecord(readProjection(root, { allowLegacyVisualizationProjection: true }));
}
