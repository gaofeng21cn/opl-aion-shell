/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  RuntimeGraphEdge,
  RuntimeGraphNode,
  RuntimeSafeActionRoute,
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

function asRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function firstRecord(...values: unknown[]): JsonRecord | undefined {
  return values.find(isRecord);
}

function readProjection(root: unknown): JsonRecord {
  if (!isRecord(root)) return {};
  const traySnapshot = firstRecord(root.runtime_tray_snapshot);
  const drilldown = firstRecord(traySnapshot?.app_operator_drilldown, root.app_operator_drilldown);
  const visualization = firstRecord(
    root.runtime_visualization_projection,
    drilldown?.runtime_visualization_projection,
    traySnapshot?.runtime_visualization_projection
  );
  return visualization ?? drilldown ?? root;
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

export function normalizeRuntimeProjection(root: unknown): RuntimeVisualizationModel {
  const projection = readProjection(root);
  const rootRecord = isRecord(root) ? root : {};
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
    sourceSurface:
      asString(projection.surface_kind) ??
      asString(projection.source_surface) ??
      (projection === firstRecord(rootRecord.runtime_visualization_projection)
        ? 'runtime_visualization_projection'
        : 'app_operator_drilldown'),
    state: asString(projection.state) ?? asString(projection.runtime_state) ?? asString(projection.status) ?? 'unknown',
    summary: readSummaryPairs(projection),
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
