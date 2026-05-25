import { describe, expect, it } from 'vitest';
import { normalizeRuntimeProjection } from '@/renderer/pages/settings/RuntimeSettings/runtimeProjection';

describe('runtime visualization projection normalization', () => {
  it('prefers runtime_visualization_projection and preserves refs-only graph data', () => {
    const model = normalizeRuntimeProjection({
      runtime_visualization_projection: {
        surface_kind: 'runtime_visualization_projection',
        state: 'running',
        summary: { stage_attempt_count: 2 },
        stage_graph: {
          nodes: [{ id: 'draft', label: 'Draft', state: 'done', owner: 'opl' }],
          edges: [{ from: 'draft', to: 'review', label: 'next', ref: 'edge://one' }],
        },
        route_graph: {
          nodes: [{ id: 'safe-action', label: 'Safe action', owner: 'opl' }],
        },
        decision_map: [{ id: 'go', label: 'Go', ref: 'decision://go' }],
        timeline: [{ id: 't1', label: 'Started', timestamp: '2026-05-26T00:00:00Z' }],
        research_paper_lens_refs: [{ id: 'paper', label: 'Paper lens', ref: 'paper://lens' }],
        owner_boundary: { can_write_domain_truth: false },
        safe_action_routes: [
          {
            action_id: 'stage-production:mas/analysis_campaign',
            label: 'Run analysis',
            owner: 'opl',
            payload_refs_only_json: { receipt_ref: 'receipt://one' },
          },
        ],
        memory_refs: [{ ref: 'memory://one' }],
      },
    });

    expect(model.sourceSurface).toBe('runtime_visualization_projection');
    expect(model.state).toBe('running');
    expect(model.summary).toContainEqual({ label: 'stage_attempt_count', value: '2' });
    expect(model.stageGraph.nodes[0]).toMatchObject({ id: 'draft', label: 'Draft', owner: 'opl' });
    expect(model.stageGraph.edges[0]).toMatchObject({ from: 'draft', to: 'review', label: 'next' });
    expect(model.decisionMap[0]?.ref).toBe('decision://go');
    expect(model.timeline[0]?.timestamp).toBe('2026-05-26T00:00:00Z');
    expect(model.researchPaperLensRefs[0]?.ref).toBe('paper://lens');
    expect(model.ownerBoundary).toContain('can_write_domain_truth: false');
    expect(model.safeActionRoutes[0]?.payloadRefsOnlyJson).toEqual({ receipt_ref: 'receipt://one' });
    expect(model.refs[0]?.ref).toBe('memory://one');
  });

  it('normalizes OPL full-detail runtime_visualization_projection graph and research lens', () => {
    const model = normalizeRuntimeProjection({
      app_operator_drilldown: {
        surface_kind: 'opl_app_operator_drilldown_read_model',
        runtime_visualization_projection: {
          surface_kind: 'opl_app_runtime_visualization_projection',
          projection_policy: 'refs_only_no_domain_truth_memory_body_artifact_body_or_verdict',
          summary: { node_count: 4, timeline_event_count: 1, paper_route_lens_ref_count: 1 },
          graph: {
            nodes: [
              {
                node_id: 'stage_attempt:attempt-1',
                node_kind: 'stage_attempt',
                ref: '/stage_attempt_workbench/attempts/attempt-1',
                domain_id: 'medautoscience',
                stage_id: 'write',
                stage_attempt_id: 'attempt-1',
                status: 'completed',
              },
              {
                node_id: 'route_graph:/stage_attempt_workbench/attempts/attempt-1/route_decision_graph',
                node_kind: 'route_graph',
                ref: '/stage_attempt_workbench/attempts/attempt-1/route_decision_graph',
                stage_attempt_id: 'attempt-1',
              },
              {
                node_id: 'decision_map:/stage_attempt_workbench/attempts/attempt-1/control_loop_summary/decision',
                node_kind: 'decision_map',
                ref: '/stage_attempt_workbench/attempts/attempt-1/control_loop_summary/decision',
                stage_attempt_id: 'attempt-1',
              },
              {
                node_id: 'typed_blocker:mas://blockers/currentness.json',
                node_kind: 'typed_blocker',
                ref: 'mas://blockers/currentness.json',
                stage_attempt_id: 'attempt-1',
              },
            ],
            edges: [
              {
                edge_id: 'attempt-1-route',
                edge_kind: 'attempt_has_route_graph',
                from_node_id: 'stage_attempt:attempt-1',
                to_node_id: 'route_graph:/stage_attempt_workbench/attempts/attempt-1/route_decision_graph',
                ref: '/stage_attempt_workbench/attempts/attempt-1#route',
                stage_attempt_id: 'attempt-1',
              },
            ],
          },
          timeline: {
            events: [
              {
                event_id: 'stage_attempt:attempt-1',
                event_kind: 'stage_attempt_status',
                ref: '/stage_attempt_workbench/attempts/attempt-1',
                stage_attempt_id: 'attempt-1',
                status: 'completed',
                updated_at: '2026-05-26T01:00:00Z',
              },
            ],
          },
          research_lens: {
            paper_route_lens_refs: [
              {
                ref: 'mas://studies/dm-cvd/paper-route-lens/latest.json',
                role: 'paper_route_lens_ref',
                domain_id: 'medautoscience',
              },
            ],
          },
          visual_ref_groups: {
            typed_blocker_refs: [{ ref: 'mas://blockers/currentness.json', role: 'typed_blocker_ref' }],
          },
        },
      },
    });

    expect(model.sourceSurface).toBe('opl_app_runtime_visualization_projection');
    expect(model.stageGraph.nodes[0]).toMatchObject({
      id: 'stage_attempt:attempt-1',
      kind: 'stage_attempt',
      domainId: 'medautoscience',
      stageAttemptId: 'attempt-1',
    });
    expect(model.routeGraph.nodes.map((node) => node.kind)).toContain('route_graph');
    expect(model.routeGraph.nodes.map((node) => node.kind)).toContain('typed_blocker');
    expect(model.routeGraph.edges[0]).toMatchObject({
      from: 'stage_attempt:attempt-1',
      kind: 'attempt_has_route_graph',
    });
    expect(model.decisionMap[0]?.kind).toBe('decision_map');
    expect(model.timeline[0]).toMatchObject({
      kind: 'stage_attempt_status',
      state: 'completed',
      timestamp: '2026-05-26T01:00:00Z',
    });
    expect(model.researchPaperLensRefs[0]).toMatchObject({
      ref: 'mas://studies/dm-cvd/paper-route-lens/latest.json',
      kind: 'paper_route_lens_ref',
    });
    expect(model.refs[0]?.ref).toBe('mas://blockers/currentness.json');
  });

  it('falls back to runtime_tray_snapshot.app_operator_drilldown', () => {
    const model = normalizeRuntimeProjection({
      runtime_tray_snapshot: {
        app_operator_drilldown: {
          surface_kind: 'opl_app_operator_drilldown_read_model',
          runtime_state: 'repair_needed',
          routes: [{ id: 'repair', label: 'Repair route' }],
        },
      },
    });

    expect(model.sourceSurface).toBe('opl_app_operator_drilldown_read_model');
    expect(model.state).toBe('repair_needed');
    expect(model.routeGraph.nodes[0]?.label).toBe('Repair route');
  });
});
