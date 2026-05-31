/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  RuntimeActionQueueItem,
  RuntimeDomainLane,
  RuntimeGraphEdge,
  RuntimeGraphNode,
  RuntimeLaneTask,
  RuntimePerformancePolicy,
  RuntimeRefreshPolicy,
  RuntimeSafeActionRoute,
  RuntimeSummaryCard,
  RuntimeTaskDrilldown,
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

function firstRecord(...values: unknown[]): JsonRecord | undefined {
  return values.find(isRecord);
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

function readSafeActionRoutes(value: unknown): RuntimeSafeActionRoute[] {
  return asRecordArray(value).map((entry, index) => {
    const id = asString(entry.id) ?? asString(entry.action_id) ?? `action-${index + 1}`;
    const payload = firstRecord(entry.payload_refs_only_json, entry.payload_refs, entry.payload);
    return {
      id,
      label: asString(entry.label) ?? asString(entry.title) ?? id,
      owner: asString(entry.owner) ?? asString(entry.authority_owner),
      route: asString(entry.route) ?? asString(entry.command),
      payloadRefsOnlyJson: payload,
      dryRunRequired: entry.dry_run_required !== false,
    };
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
  return asRecordArray(workbench.task_drilldowns).map((entry, index) => ({
    taskId: asString(entry.task_id) ?? `task-${index + 1}`,
    title: asString(entry.title) ?? asString(entry.task_id) ?? `Task ${index + 1}`,
    domainId: asString(entry.domain_id),
    domainLabel: asString(entry.domain_label),
    state: asString(entry.state),
    activeStageId: asString(entry.active_stage_id),
    stageAttemptIds: asStringArray(entry.stage_attempt_ids),
    paperRouteLensRefCount: asNumber(entry.paper_route_lens_ref_count) ?? 0,
    safeActionRefCount: asNumber(entry.safe_action_ref_count) ?? 0,
    blockerRefCount: asNumber(entry.blocker_ref_count) ?? 0,
    activePath: asRecordArray(entry.active_path).map((node, nodeIndex) => readNode(node, 'path', nodeIndex)),
  }));
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
  return asRecordArray(appState.actions).map((entry, index) => {
    const id = asString(entry.action_id) ?? asString(entry.id) ?? `action-${index + 1}`;
    const payload = firstRecord(entry.payload_refs_only_json, entry.payload_refs, entry.payload);
    return {
      id,
      label: asString(entry.label) ?? id,
      owner: asString(entry.owner) ?? asString(entry.authority_owner),
      route: asString(entry.delegated_surface) ?? asString(entry.route) ?? asString(entry.command),
      payloadRefsOnlyJson: payload,
      dryRunRequired: entry.dry_run_required !== false,
    };
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
  return {
    sourceSurface: asString(appState.surface_kind) ?? 'opl_app_state',
    state: asString(operator?.status) ?? asString(appState.status) ?? 'unknown',
    summary: asString(operator?.summary)
      ? [{ label: 'operator_summary', value: asString(operator?.summary) ?? '' }]
      : [],
    summaryCards: normalizeAppStateSummaryCards(appState),
    actionQueue: [],
    domainLaneMap: normalizeAppStateDomainLaneMap(appState),
    taskDrilldowns: [],
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
    actionQueue: readActionQueue(workbench),
    domainLaneMap: readDomainLaneMap(workbench),
    taskDrilldowns: readTaskDrilldowns(workbench),
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
