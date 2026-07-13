type FixtureItemOptions = {
  id: string;
  projectId: string;
  projectName: string;
  displayName: string;
  businessState?: 'active' | 'delivered_paused' | 'paused' | 'stopped';
  executionState?: 'running' | 'idle';
  attentionKind?: 'none' | 'user' | 'system';
  observedTokens?: number;
};

function tokenObservation(total: number | undefined, missingReason: string) {
  return total === undefined
    ? {
        state: 'missing',
        input_tokens: null,
        output_tokens: null,
        total_tokens: null,
        observed_at: null,
        missing_reason: missingReason,
        source_refs: [],
      }
    : {
        state: 'observed',
        input_tokens: total - 20,
        output_tokens: 20,
        total_tokens: total,
        observed_at: '2026-07-13T08:00:00Z',
        missing_reason: null,
        source_refs: [`usage://${total}`],
      };
}

function fixtureItem({
  id,
  projectId,
  projectName,
  displayName,
  businessState = 'active',
  executionState = 'running',
  attentionKind = 'none',
  observedTokens,
}: FixtureItemOptions) {
  const active = businessState === 'active';
  const stageTokens = observedTokens;
  const cumulativeTokens = observedTokens === undefined ? undefined : observedTokens * 2;
  return {
    item_id: `mas:${projectId}:${id}`,
    identity: {
      agent_id: 'mas',
      domain_id: 'medautoscience',
      project_id: projectId,
      project_display_name: projectName,
      project_scope_id: `project:${projectId}`,
      workspace_binding_id: `${projectId}-binding`,
      workspace_path: `/fixtures/${projectId}`,
      work_item_id: id,
      work_item_display_name: displayName,
      work_item_root: `/fixtures/${projectId}/studies/${id}`,
      work_item_scope_id: `work-item:${id}`,
      source_kind: 'domain_inventory',
    },
    lifecycle: {
      business_state: businessState,
      domain_business_state: businessState,
      control_state: businessState,
      raw_business_status: businessState,
      current_stage_id: active ? 'write' : null,
      current_stage_status: active ? 'running' : null,
      package_status: businessState === 'delivered_paused' ? 'milestone_delivered' : 'not_ready',
      lifecycle_ref: `/fixtures/${projectId}/studies/${id}/STUDY_STATUS.md`,
      source: 'domain_inventory_projection',
      control_ref: null,
      control_updated_at: null,
      observed_generation: `generation:${id}`,
    },
    execution: {
      state: executionState,
      stage_id: active ? 'write' : null,
      stage_status: active ? 'running' : null,
      attempt_id: active ? `attempt:${id}` : null,
      attempt_ids: active ? [`attempt:${id}`] : [],
      workflow_id: active ? `workflow:${id}` : null,
      provider_kind: active ? 'temporal' : null,
      started_at: active ? '2026-07-13T06:31:00Z' : null,
      last_heartbeat_at: active ? '2026-07-13T08:00:00Z' : null,
      updated_at: '2026-07-13T08:00:00Z',
      running_proof_status: active ? 'current' : 'not_running',
      diagnostic_reason: null,
    },
    attention: {
      kind: attentionKind,
      reason: attentionKind === 'user' ? 'domain_owner_decision_required' : 'no_attention_required',
      owner: attentionKind === 'user' ? 'user' : null,
      responsible_component: null,
      issue: null,
      impact: null,
      repair_action: null,
      expected_outcome: null,
    },
    telemetry: {
      state: observedTokens === undefined ? 'missing' : 'observed',
      current_stage: tokenObservation(stageTokens, 'no_stage_usage_observed'),
      cumulative: tokenObservation(cumulativeTokens, 'no_cumulative_usage_observed'),
      missing_reason: observedTokens === undefined ? 'no_usage_observed' : null,
    },
    conditions: [
      {
        type: 'InventoryResolved',
        status: 'True',
        reason: 'domain_inventory_item_resolved',
        message: 'The work item is present in the domain inventory.',
        owner: 'mas',
        severity: 'none',
        last_transition_time: '2026-07-13T08:00:00Z',
        observed_generation: `generation:${id}`,
        ref: null,
      },
    ],
    freshness: {
      state: 'current',
      inventory_observed_at: '2026-07-13T08:00:00Z',
      execution_observed_at: '2026-07-13T08:00:00Z',
      last_transition_time: '2026-07-13T08:00:00Z',
      observed_generation: `generation:${id}`,
      reason: 'inventory_current',
    },
    source_refs: [
      {
        ref_kind: 'file',
        ref: `/fixtures/${projectId}/studies/${id}/STUDY_STATUS.md`,
        role: 'lifecycle_ref',
      },
    ],
  };
}

const AGENTS = [
  ['mas', 'medautoscience', 'Med Auto Science'],
  ['mag', 'medautogrant', 'Med Auto Grant'],
  ['rca', 'redcube-ai', 'RedCube AI'],
  ['oma', 'opl-meta-agent', 'OPL Meta Agent'],
  ['obf', 'opl-bookforge', 'OPL Book Forge'],
] as const;

function project(projectId: string, displayName: string) {
  return {
    project_id: projectId,
    scope_id: `project:${projectId}`,
    agent_id: 'mas',
    domain_id: 'medautoscience',
    display_name: displayName,
    workspace_path: `/fixtures/${projectId}`,
    binding_status: 'active',
    selected_binding_id: `${projectId}-binding`,
    binding_ids: [`${projectId}-binding`],
    source_refs: [
      {
        ref_kind: 'projection',
        ref: `workspace-binding:${projectId}-binding`,
        role: 'workspace_binding',
      },
    ],
  };
}

export function createRuntimeV2Projection() {
  const items = [
    fixtureItem({
      id: 'dm001',
      projectId: 'diabetes',
      projectName: '糖尿病',
      displayName: '001 DM CVD Mortality Risk',
      observedTokens: 1200,
    }),
    fixtureItem({
      id: 'dm002',
      projectId: 'diabetes',
      projectName: '糖尿病',
      displayName: '002 DM China US Mortality Attribution',
      businessState: 'delivered_paused',
      executionState: 'idle',
    }),
    fixtureItem({
      id: 'dm003',
      projectId: 'diabetes',
      projectName: '糖尿病',
      displayName: '003 DPCC Primary Care Phenotype Treatment Gap',
      businessState: 'delivered_paused',
      executionState: 'idle',
    }),
    fixtureItem({
      id: 'dm004',
      projectId: 'diabetes',
      projectName: '糖尿病',
      displayName: '004 DPCC Longitudinal Care Inertia Gap',
      businessState: 'paused',
      executionState: 'idle',
    }),
    fixtureItem({
      id: 'nf001',
      projectId: 'nf-pitnet',
      projectName: '无功能垂体瘤',
      displayName: 'NF-PitNET Paper 1',
      businessState: 'stopped',
      executionState: 'idle',
    }),
    fixtureItem({
      id: 'nf002',
      projectId: 'nf-pitnet',
      projectName: '无功能垂体瘤',
      displayName: 'NF-PitNET Paper 2',
      businessState: 'delivered_paused',
      executionState: 'idle',
    }),
    fixtureItem({
      id: 'nf003',
      projectId: 'nf-pitnet',
      projectName: '无功能垂体瘤',
      displayName: 'NF-PitNET Paper 3',
      businessState: 'delivered_paused',
      executionState: 'idle',
    }),
    fixtureItem({
      id: 'nf004',
      projectId: 'nf-pitnet',
      projectName: '无功能垂体瘤',
      displayName: 'NF-PitNET Paper 4',
      businessState: 'stopped',
      executionState: 'idle',
    }),
    fixtureItem({
      id: 'obesity001',
      projectId: 'obesity',
      projectName: '肥胖',
      displayName: 'Obesity Paper 1',
      executionState: 'idle',
      attentionKind: 'user',
    }),
  ];
  return {
    surface_kind: 'opl_work_item_projection',
    schema_version: 'work-item-projection.v2',
    profile: 'fast',
    generated_at: '2026-07-13T08:01:00Z',
    agent_catalog: AGENTS.map(([agentId, domainId, displayName]) => ({
      agent_id: agentId,
      domain_id: domainId,
      display_name: displayName,
      short_label: displayName,
      package_id: agentId,
      scope_id: `agent:${agentId}`,
    })),
    agent_availability: AGENTS.map(([agentId, domainId, displayName]) => ({
      agent_id: agentId,
      domain_id: domainId,
      display_name: displayName,
      availability: 'available',
      reason: 'package_health_ready',
      package_id: agentId,
      source_ref: `/packages/${agentId}`,
    })),
    project_catalog: [project('diabetes', '糖尿病'), project('nf-pitnet', '无功能垂体瘤'), project('obesity', '肥胖')],
    summary: {
      agent_count: 5,
      project_count: 3,
      work_item_count: 9,
      running_count: 1,
      user_attention_count: 1,
      system_attention_count: 0,
      telemetry_observed_count: 1,
      telemetry_missing_count: 8,
    },
    items,
    diagnostics: { count: 0, items: [], detail_policy: 'summary_only' },
    detail_policy: {
      all_work_item_summaries_included: true,
      attempt_ref_limit_per_item: 3,
      diagnostic_details: 'lazy',
    },
    authority_boundary: {
      projection_only: true,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_quality_verdict: false,
      temporal_is_work_item_inventory: false,
    },
  };
}

export function createRuntimeV2AppState() {
  return {
    app_state: {
      schema_version: 'opl_app_state.v1',
      operator: {
        status: 'ready',
        workbench: { work_item_projection_v2: createRuntimeV2Projection() },
      },
    },
  };
}
