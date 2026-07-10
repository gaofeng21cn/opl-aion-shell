import { describe, expect, it } from 'vitest';
import {
  normalizeLegacyRuntimeVisualizationProjection,
  normalizeRuntimeProjection,
} from '@/renderer/pages/settings/RuntimeSettings/runtimeProjection';
import enUSCommon from '@/renderer/services/i18n/locales/en-US/common.json';
import zhCNCommon from '@/renderer/services/i18n/locales/zh-CN/common.json';

describe('runtime visualization projection normalization', () => {
  it('keeps missing usage copy human-readable in supported locales', () => {
    expect(enUSCommon['runtime.telemetryMissing']).toBe('Usage not recorded');
    expect(zhCNCommon['runtime.telemetryMissing']).toBe('用量未记录');
  });

  it('keeps unreported zero usage out of task token labels', () => {
    const model = normalizeRuntimeProjection({
      app_state: {
        schema_version: 'opl_app_state.v1',
        operator: {
          workbench: {
            task_run_projection_v2: {
              projection_kind: 'task_run_projection_v2',
              schema_version: 2,
              tasks: [
                {
                  task_id: 'dm-history',
                  title: 'Historical study',
                  domain_id: 'medautoscience',
                  workspace_scope_id: 'workspace:history',
                  workspace_label: '历史论文',
                  primary_state: 'paused_waiting_for_direction',
                  automation_state: 'automation_idle',
                  stage_run_cockpit: {
                    stage_usage: {
                      cost_status: 'observed_or_unreported',
                      total_tokens_observed: 0,
                    },
                    task_total_usage: {
                      telemetry_status: 'missing',
                      total_tokens_observed: 0,
                    },
                  },
                },
              ],
            },
          },
        },
      },
    });

    expect(model.taskRunProjectionV2.tasks[0]).toMatchObject({
      taskId: 'dm-history',
      workspaceId: 'workspace:history',
      workspaceLabel: '历史论文',
      stageUsage: undefined,
      taskTotalUsage: undefined,
    });
  });

  it('keeps canonical work item project scope separate from the paper identity', () => {
    const model = normalizeRuntimeProjection({
      app_state: {
        schema_version: 'opl_app_state.v1',
        operator: {
          workbench: {
            runtime_scope: {
              scope_options: [
                {
                  scope_kind: 'all_projects',
                  scope_id: 'all_projects',
                  label: '全部项目',
                },
                {
                  scope_kind: 'agent',
                  scope_id: 'agent:medautoscience',
                  label: 'Med Auto Science',
                },
                {
                  scope_kind: 'project',
                  scope_id: 'project:medautoscience:dm-binding',
                  label: '糖尿病',
                },
              ],
              current_scope: {
                scope_kind: 'all_projects',
                scope_id: 'all_projects',
                label: '全部项目',
              },
            },
            work_item_projection_v1: {
              surface_kind: 'opl_work_item_projection',
              schema_version: 'work-item-projection.v1',
              items: [
                {
                  item_id: 'medautoscience:binding:dm-binding:study:002-dm-paper',
                  title: '002-dm-paper',
                  work_item: {
                    work_item_id: '002-dm-paper',
                    label: '002-dm-paper',
                    kind: 'study',
                    study_id: '002-dm-paper',
                    project_label: '糖尿病',
                    project_scope_id: 'project:medautoscience:dm-binding',
                    workspace_binding_id: 'dm-binding',
                    workspace_label: '糖尿病',
                  },
                  agent: {
                    agent_id: 'medautoscience',
                    label: 'Med Auto Science',
                  },
                  status: {
                    primary_state: 'delivered_auto_paused',
                    automation_state: 'automation_idle',
                  },
                },
              ],
            },
          },
        },
      },
    });

    expect(model.scope.options.map((option) => option.label)).toEqual(['全部项目', 'Med Auto Science', '糖尿病']);
    expect(model.taskRunProjectionV2.tasks[0]).toMatchObject({
      taskId: 'medautoscience:binding:dm-binding:study:002-dm-paper',
      projectScopeId: 'project:medautoscience:dm-binding',
      projectDisplayName: '糖尿病',
      workspaceId: 'workspace:dm-binding',
      workspaceLabel: '糖尿病',
      projectId: '002-dm-paper',
      studyId: '002-dm-paper',
    });
  });

  it('normalizes OPL app state as the summary-first runtime model', () => {
    const model = normalizeRuntimeProjection({
      app_state: {
        schema_version: 'opl_app_state.v1',
        surface_kind: 'opl_app_state',
        meta: {
          profile: 'fast',
          read_policy: 'bounded_local_read_no_network_no_repair',
        },
        core: {
          codex: {
            parsed_version: '0.125.0',
            default_model: 'gpt-5.5',
            default_reasoning_effort: 'xhigh',
          },
        },
        provider: {
          temporal: {
            status: 'ready',
            health_status: 'ready',
            degraded_reason: null,
          },
        },
        modules: {
          summary: {
            default_modules_count: 4,
            healthy_default_modules_count: 4,
          },
          items: [
            {
              module_id: 'medautoscience',
              label: 'Med Auto Science',
              health_status: 'ready',
              checkout_path: '/Users/example/workspace/med-autoscience',
              git: { short_sha: 'abc1234' },
            },
          ],
        },
        assistants: {
          items: [
            {
              assistant_id: 'oplmetaagent',
              label: 'OPL Meta Agent',
              launch_hint: 'direct_click',
            },
          ],
        },
        operator: {
          status: 'ready',
          default_read_surface_policy: {
            surface_kind: 'opl_app_default_read_surface_policy',
            default_operator_payload: 'current_owner_delta',
            default_projection: 'opl_current_owner_delta',
            normal_state_surface: 'opl app state --profile fast --json',
            full_runtime_drilldown_surface: 'opl runtime app-operator-drilldown --detail full --json',
            raw_runtime_projection_policy: 'explicit_full_detail_or_lazy_diagnostic_only',
            first_screen_answers: [
              'next_safe_action_or_none',
              'current_owner',
              'required_delta',
              'accepted_return_shapes',
              'readiness_false_flags',
              'count_summary',
            ],
            fast_profile_excludes: ['runtime_tray_snapshot', 'raw_evidence_envelope'],
            shell_contract: {
              shell_must_not_use_full_drilldown_as_normal_state: true,
              shell_must_not_derive_layout_from_raw_runtime_projection: true,
              full_detail_auto_poll: false,
            },
          },
          summary: 'OPL runtime provider is ready.',
        },
        actions: [
          {
            action_id: 'provider_scheduler_status',
            label: 'Read Temporal scheduler status',
            delegated_surface: 'opl family-runtime scheduler status --provider temporal',
          },
        ],
      },
    });

    expect(model.sourceSurface).toBe('opl_app_state');
    expect(model.state).toBe('ready');
    expect(model.defaultReadSurfacePolicy).toMatchObject({
      defaultProjection: 'opl_current_owner_delta',
      normalStateSurface: 'opl app state --profile fast --json',
      fullRuntimeDrilldownSurface: 'opl runtime app-operator-drilldown --detail full --json',
      rawRuntimeProjectionPolicy: 'explicit_full_detail_or_lazy_diagnostic_only',
      firstScreenAnswers: [
        'next_safe_action_or_none',
        'current_owner',
        'required_delta',
        'accepted_return_shapes',
        'readiness_false_flags',
        'count_summary',
      ],
      forbiddenDefaultStateFields: ['runtime_tray_snapshot', 'raw_evidence_envelope'],
      fullDetailAutoPoll: false,
      shellMustNotUseFullDrilldownAsNormalState: true,
      shellMustNotDeriveLayoutFromRawRuntimeProjection: true,
    });
    expect(model.summaryCards).toContainEqual({
      id: 'codex',
      label: 'Codex CLI',
      value: '0.125.0 / gpt-5.5 xhigh',
      tone: 'ready',
    });
    expect(model.summaryCards).toContainEqual({
      id: 'temporal',
      label: 'Temporal',
      value: 'ready',
      tone: 'ready',
    });
    expect(model.scope).toMatchObject({
      current: {
        kind: 'all_projects',
      },
      source: 'default_global',
      frameworkBacked: false,
    });
    expect(model.domainLaneMap[0]).toMatchObject({
      domainId: 'medautoscience',
      label: 'Med Auto Science',
      activeTaskCount: 1,
    });
    expect(model.safeActionRoutes[0]).toMatchObject({
      id: 'provider_scheduler_status',
      label: 'Read Temporal scheduler status',
      route: 'opl family-runtime scheduler status --provider temporal',
    });
    expect(model.refs.map((ref) => ref.ref)).toContain('/Users/example/workspace/med-autoscience');
  });

  it('does not invent executable action ids for display-only safe action refs', () => {
    const model = normalizeRuntimeProjection({
      app_state: {
        schema_version: 'opl_app_state.v1',
        operator: { status: 'ready' },
        actions: [
          {
            label: 'Display-only action candidate',
            delegated_surface: 'opl app action execute --action generated-locally',
          },
          {
            action_ref: 'action://canonical-review-preview',
            label: 'Canonical review preview',
          },
        ],
      },
    });

    expect(model.safeActionRoutes).toEqual([
      {
        id: 'action://canonical-review-preview',
        label: 'Canonical review preview',
        owner: undefined,
        route: undefined,
        payloadRefsOnlyJson: undefined,
        dryRunRequired: true,
      },
    ]);
  });

  it('prefers workbench task_run_projection_v2 tasks over legacy task_drilldowns', () => {
    const model = normalizeRuntimeProjection({
      app_state: {
        schema_version: 'opl_app_state.v1',
        operator: {
          status: 'ready',
          workbench: {
            runtime_scope: {
              scope_source: 'inferred',
              inferred_scope_hint: 'dm-cvd-mortality-risk',
              current_scope: {
                kind: 'project',
                id: 'project:medautoscience:dm-cvd-mortality-risk',
                value: 'DM CVD Mortality Risk',
                label: 'DM CVD Mortality Risk',
              },
              scope_options: [
                {
                  kind: 'all_projects',
                  id: 'all-projects',
                  value: 'all_projects',
                  label: 'All projects',
                },
                {
                  kind: 'agent',
                  id: 'agent:medautoscience',
                  value: 'agent:medautoscience',
                  label: 'Med Auto Science',
                },
                {
                  kind: 'project',
                  id: 'project:medautoscience:dm-cvd-mortality-risk',
                  value: 'DM CVD Mortality Risk',
                  label: 'DM CVD Mortality Risk',
                  workspace_path: '/Users/example/workspace/Yang/DM-CVD-Mortality-Risk',
                },
              ],
            },
            task_run_projection_v2: {
              projection_kind: 'task_run_projection_v2',
              schema_version: 2,
              tasks: [
                {
                  task_id: 'dm002-taskrun',
                  title: 'DM002 TaskRun',
                  domain_id: 'medautoscience',
                  domain_label: 'Med Auto Science',
                  agent_display_name: 'MAS',
                  workspace_id: 'dm-cvd-mortality-risk',
                  workspace_label: 'DM CVD Mortality Risk',
                  project_scope_id: 'project:medautoscience:dm-cvd-mortality-risk',
                  project_id: 'dm002',
                  project_display_name: 'DM002 paper line',
                  work_item_display_name: 'Publication evaluation',
                  state: 'running',
                  primary_state: 'in_progress',
                  automation_state: 'automation_running',
                  status_label: 'Advancing',
                  stage: 'review',
                  progress_label: 'evidence ready',
                  next_owner: 'reviewer',
                  next_step: 'Review evidence cards',
                  last_progress_at: '2026-07-01T00:00:00Z',
                  stage_run_cockpit: {
                    elapsed_seconds: 5400,
                    last_heartbeat_at: '2026-07-01T00:05:00Z',
                    stage_usage: { total_tokens_observed: 1234 },
                    task_total_usage: { total_tokens: 4321 },
                    typed_blocker_summary: 'none',
                  },
                  blocker_refs: ['blocker://needs-owner'],
                  evidence_cards: [
                    {
                      card_id: 'artifact',
                      kind: 'artifact',
                      title: 'Publication artifact',
                      summary_ref: 'artifact://summary',
                      lineage_refs: ['lineage://one'],
                    },
                  ],
                  action_cards: [
                    {
                      action_id: 'dry-run-review',
                      label: 'Preview review',
                      dry_run_ref: 'action://dry-run',
                      execute_ref: 'action://execute',
                    },
                  ],
                  resource_cards: [
                    {
                      resource_id: 'fabric',
                      kind: 'fabric',
                      status_ref: 'resource://status',
                      source_refs: ['resource://source'],
                    },
                  ],
                  diagnostics_ref: 'diagnostics://task',
                },
              ],
            },
            task_drilldowns: [{ task_id: 'legacy-task', title: 'Legacy task' }],
          },
        },
      },
    });

    expect(model.taskRunProjectionV2).toMatchObject({
      projectionKind: 'task_run_projection_v2',
      schemaVersion: 2,
    });
    expect(model.scope).toMatchObject({
      source: 'inferred',
      inferredHint: 'dm-cvd-mortality-risk',
      current: {
        kind: 'project',
        label: 'DM CVD Mortality Risk',
      },
    });
    expect(model.scope.options.filter((option) => option.kind === 'project')).toHaveLength(1);
    expect(model.taskRunProjectionV2.tasks).toHaveLength(1);
    expect(model.taskRunProjectionV2.tasks[0]).toMatchObject({
      taskId: 'dm002-taskrun',
      title: 'DM002 TaskRun',
      agentDisplayName: 'MAS',
      workspaceLabel: 'DM CVD Mortality Risk',
      projectScopeId: 'project:medautoscience:dm-cvd-mortality-risk',
      projectDisplayName: 'DM002 paper line',
      workItemDisplayName: 'Publication evaluation',
      primaryState: 'in_progress',
      automationState: 'automation_running',
      status: 'Advancing',
      stage: 'review',
      progressLabel: 'evidence ready',
      nextOwner: 'reviewer',
      nextStep: 'Review evidence cards',
      elapsedSeconds: 5400,
      lastHeartbeatAt: '2026-07-01T00:05:00Z',
      stageUsage: '1234 tokens',
      taskTotalUsage: '4321 tokens',
      blockerRefCount: 1,
    });
    expect(model.taskRunProjectionV2.tasks[0]?.evidenceCards[0]).toMatchObject({
      id: 'artifact',
      label: 'Publication artifact',
      ref: 'artifact://summary',
    });
    expect(model.taskRunProjectionV2.tasks[0]?.actionCards[0]).toMatchObject({
      id: 'dry-run-review',
      label: 'Preview review',
      ref: 'action://dry-run',
    });
    expect(model.taskRunProjectionV2.tasks[0]?.resourceRefs[0]).toMatchObject({
      id: 'fabric',
      label: 'fabric',
      ref: 'resource://status',
    });
    expect(model.taskRunProjectionV2.tasks[0]?.diagnosticsRefs[0]?.ref).toBe('diagnostics://task');
    expect(model.taskRunProjectionV2.tasks.map((task) => task.taskId)).not.toContain('legacy-task');
    expect(model.taskDrilldowns.map((task) => task.taskId)).toEqual(['dm002-taskrun']);
  });

  it('uses canonical task states and only downgrades legacy status fallbacks', () => {
    const model = normalizeRuntimeProjection({
      app_state: {
        schema_version: 'opl_app_state.v1',
        operator: {
          workbench: {
            task_drilldowns: [
              {
                task_id: 'legacy-running',
                title: 'Legacy running task',
                state: 'running',
                status: 'running',
              },
              {
                task_id: 'legacy-complete',
                title: 'Legacy complete',
                state: 'completed',
                status: 'completed',
              },
              {
                task_id: 'legacy-error',
                title: 'Legacy error task',
                state: 'error',
              },
              {
                task_id: 'canonical-running',
                title: 'Canonical running task',
                status: 'completed',
                primary_state: 'in_progress',
                automation_state: 'automation_running',
              },
              {
                task_id: 'canonical-complete',
                title: 'Canonical complete task',
                state: 'running',
                primary_state: 'delivered_auto_paused',
                automation_state: 'automation_idle',
              },
            ],
          },
        },
      },
    });

    expect(
      model.taskRunProjectionV2.tasks.map((task) => [task.taskId, task.primaryState, task.automationState])
    ).toEqual([
      ['legacy-running', 'paused_waiting_for_direction', 'automation_idle'],
      ['legacy-complete', 'paused_waiting_for_direction', 'automation_idle'],
      ['legacy-error', 'system_attention_required', 'automation_failed'],
      ['canonical-running', 'in_progress', 'automation_running'],
      ['canonical-complete', 'delivered_auto_paused', 'automation_idle'],
    ]);
  });

  it('keeps top-level runtime_visualization_projection out of the main renderer path', () => {
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

    expect(model.sourceSurface).toBe('app_operator_drilldown');
    expect(model.state).toBe('unknown');
    expect(model.stageGraph.nodes).toEqual([]);
    expect(model.safeActionRoutes).toEqual([]);
  });

  it('isolates legacy runtime_visualization_projection parsing behind an explicit adapter', () => {
    const model = normalizeLegacyRuntimeVisualizationProjection({
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

  it('normalizes OPL full-detail runtime_visualization_projection graph only through the legacy adapter', () => {
    const model = normalizeLegacyRuntimeVisualizationProjection({
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
          runtime_workbench: {
            surface_kind: 'opl_app_runtime_workbench_visualization_model',
            layout_model: 'vertical_summary_action_queue_lane_map_task_drilldown.v1',
            refresh_policy: {
              summary_poll_interval_seconds: 10,
              full_detail_auto_poll: false,
              per_token_streaming: false,
            },
            performance_policy: {
              global_map_renderer: 'lightweight_dom_css_lane_map',
              graph_layout_recompute: 'topology_changes_only',
            },
            summary_cards: [
              { card_id: 'active_tasks', label: 'Active tasks', value: 1, tone: 'running' },
              { card_id: 'needs_user', label: 'Needs user', value: 0, tone: 'attention' },
            ],
            action_queue: {
              items: [
                {
                  item_id: 'task:dm-cvd',
                  task_id: 'dm-cvd',
                  domain_id: 'medautoscience',
                  stage_id: 'write',
                  priority_bucket: 'can_continue',
                  title: 'DM-CVD write',
                  subtitle: 'continue',
                  safe_action_ref_count: 1,
                  blocker_ref_count: 0,
                  paper_route_lens_ref_count: 1,
                },
              ],
            },
            domain_lane_map: {
              lanes: [
                {
                  domain_id: 'medautoscience',
                  lane_label: 'MAS',
                  active_task_count: 1,
                  tasks: [
                    {
                      task_id: 'dm-cvd',
                      label: 'DM-CVD write',
                      state: 'running',
                      active_stage_id: 'write',
                      active_path_node_ids: ['stage_attempt:attempt-1'],
                      paper_route_lens_ref_count: 1,
                    },
                  ],
                },
              ],
            },
            task_drilldowns: [
              {
                task_id: 'dm-cvd',
                domain_id: 'medautoscience',
                title: 'DM-CVD write',
                state: 'running',
                stage_attempt_ids: ['attempt-1'],
                paper_route_lens_ref_count: 1,
                active_path: [{ node_id: 'stage_attempt:attempt-1', label: 'write', state: 'completed' }],
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
    expect(model.refreshPolicy).toMatchObject({
      summaryPollIntervalSeconds: 10,
      fullDetailAutoPoll: false,
      perTokenStreaming: false,
    });
    expect(model.performancePolicy.globalMapRenderer).toBe('lightweight_dom_css_lane_map');
    expect(model.summaryCards[0]).toMatchObject({ id: 'active_tasks', value: '1', tone: 'running' });
    expect(model.actionQueue[0]).toMatchObject({
      taskId: 'dm-cvd',
      domainId: 'medautoscience',
      priorityBucket: 'can_continue',
      safeActionRefCount: 1,
      paperRouteLensRefCount: 1,
    });
    expect(model.domainLaneMap[0]).toMatchObject({
      domainId: 'medautoscience',
      label: 'MAS',
      activeTaskCount: 1,
    });
    expect(model.domainLaneMap[0]?.tasks[0]).toMatchObject({
      taskId: 'dm-cvd',
      activeStageId: 'write',
      paperRouteLensRefCount: 1,
    });
    expect(model.taskDrilldowns[0]).toMatchObject({
      taskId: 'dm-cvd',
      domainId: 'medautoscience',
      paperRouteLensRefCount: 1,
    });
    expect(model.taskDrilldowns[0]?.activePath[0]).toMatchObject({
      id: 'stage_attempt:attempt-1',
      state: 'completed',
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
