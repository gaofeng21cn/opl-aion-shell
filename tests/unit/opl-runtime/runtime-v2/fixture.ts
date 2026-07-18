type FixtureItemOptions = {
  id: string;
  workItemId?: string;
  projectId: string;
  projectName: string;
  displayName: string;
  primaryState:
    | 'automatically_advancing'
    | 'awaiting_user_decision'
    | 'system_attention'
    | 'delivered_auto_paused'
    | 'paused'
    | 'stopped'
    | 'sync_pending';
  businessState?: 'active' | 'delivered_paused' | 'paused' | 'stopped';
  visibilityState?: 'visible' | 'archived';
  visibilityGeneration?: number | null;
  includeVisibilityGeneration?: boolean;
  executionState?: 'running' | 'idle';
  attentionKind?: 'none' | 'user' | 'system';
  observedTokens?: number;
  cumulativeTokens?: number;
  runtimeStageId?: string | null;
  currentStage?: { id: string; displayName: string } | null;
  nextStage?: { id: string; displayName: string } | null;
  action: {
    kind: 'user_action' | 'system_action' | 'agent_action' | 'safe_action' | 'blocked_no_action';
    title: string;
    summary: string;
    owner: string;
    titleKey?: string | null;
    summaryKey?: string | null;
    ownerKind?: string;
    ownerId?: string;
    messageArgs?: Record<string, string | number>;
  };
  stageMap: Array<{
    id: string;
    displayName: string;
    displayNames?: Record<string, string>;
    state: 'completed' | 'current' | 'next' | 'pending' | 'waiting_user' | 'system_attention' | 'stopped';
    elapsedSeconds?: number;
    usage?: number;
    nextAction?: string;
  }>;
  domainDetailViews?: unknown[];
};

type ScientificReasoningFixtureSchema = 'scientific-reasoning-map.v1' | 'scientific-reasoning-map.v2';

function createMedicalNarrative(
  schemaVersion: ScientificReasoningFixtureSchema,
  title: string,
  narrative: {
    research_question: string | null;
    current_hypothesis: string | null;
    validation_method: string | null;
    main_findings: string | null;
    evidence_judgment: string | null;
    route_adjustment: string | null;
    next_research_step: string | null;
    limitations: string[];
    sources_and_basis: string[];
  }
) {
  return schemaVersion === 'scientific-reasoning-map.v2'
    ? {
        surface_kind: 'mas_medical_research_narrative',
        version: 'mas-medical-narrative.v1',
        audience: 'clinical_and_scientific_readers',
        style: 'medical_manuscript',
        language: 'zh-CN',
        title,
        ...narrative,
      }
    : narrative;
}

function createScientificSourceRef(
  schemaVersion: ScientificReasoningFixtureSchema,
  kind: string,
  ref: string,
  digestCharacter: string
) {
  return schemaVersion === 'scientific-reasoning-map.v2'
    ? { kind, ref }
    : { kind, ref, sha256: `sha256:${digestCharacter.repeat(64)}` };
}

export function createScientificReasoningDescriptor(
  options: { schemaVersion?: ScientificReasoningFixtureSchema } = {}
) {
  return {
    item_id: 'diabetes:001',
    view_id: 'scientific-reasoning',
    view_kind: 'scientific_reasoning_map',
    schema_version: options.schemaVersion ?? 'scientific-reasoning-map.v2',
    availability: 'unread',
    revision: 7,
    digest: `sha256:${'b'.repeat(64)}`,
  };
}

export function createScientificReasoningViewResponse(
  options: {
    notModified?: boolean;
    schemaVersion?: ScientificReasoningFixtureSchema;
    revision?: number;
    extraHistoricalNodes?: number;
  } = {}
) {
  const notModified = options.notModified === true;
  const schemaVersion = options.schemaVersion ?? 'scientific-reasoning-map.v2';
  const revision = options.revision ?? 7;
  const historicalStepLabels = [
    '复核替代结局定义',
    '复核暴露时间窗',
    '审查混杂控制策略',
    '评估缺失数据处理',
    '复核竞争风险影响',
    '评估亚组稳定性',
    '审查模型设定差异',
    '复核随访窗口选择',
  ].slice(0, options.extraHistoricalNodes ?? 0);
  const extraNodes = historicalStepLabels.map((label, index) => {
    const nodeNumber = index + 2;
    return {
      id: `route-historical-${nodeNumber}`,
      kind: 'route',
      label,
      status: 'pivoted',
      summary: '该分析路线经方法学复核后未纳入当前主要证据链。',
      branch_id: 'branch-historical',
      occurred_at: `2026-07-15T${String(index + 9).padStart(2, '0')}:00:00Z`,
      details: createMedicalNarrative(schemaVersion, label, {
        research_question: `${label}是否能够提高主要分析的解释效度？`,
        current_hypothesis: null,
        validation_method: '比较预设方案与替代方案的临床合理性、偏倚风险和估计稳定性。',
        main_findings: '替代方案未显示足以取代预设分析的明确优势。',
        evidence_judgment: '保留为历史探索，不据此改变当前结论。',
        route_adjustment: '回到预设主路线，并保留本次方法学判断供后续复核。',
        next_research_step: '继续执行当前路线的稳健性验证。',
        limitations: ['该路线仅用于方法学比较，不能独立支持临床结论。'],
        sources_and_basis: ['预设统计分析计划与阶段性方法学复核。'],
      }),
      source_refs: [
        createScientificSourceRef(
          schemaVersion,
          'analysis_plan',
          `mas-source:historical-route-${nodeNumber}`,
          String((index + 7) % 10)
        ),
      ],
    };
  });
  const extraEdges = extraNodes.map((node, index) => ({
    id: `edge-historical-${index + 2}`,
    source: index === 0 ? 'route-historical-1' : extraNodes[index - 1]!.id,
    target: node.id,
    kind: 'routes_to',
    label: '完成方法学复核后返回主路线',
    status: 'historical',
    source_refs: [
      createScientificSourceRef(
        schemaVersion,
        'analysis_plan',
        `mas-source:edge-historical-${index + 2}`,
        String((index + 5) % 10)
      ),
    ],
  }));
  return {
    schema_version: 'opl_domain_detail_view.v1',
    surface_kind: 'opl_domain_detail_view',
    item_id: 'diabetes:001',
    view_id: 'scientific-reasoning',
    view_kind: 'scientific_reasoning_map',
    availability: 'available',
    revision,
    generation: revision,
    digest: `sha256:${(revision === 7 ? 'b' : 'c').repeat(64)}`,
    not_modified: notModified,
    payload_schema: schemaVersion,
    payload: notModified
      ? null
      : {
          ...(schemaVersion === 'scientific-reasoning-map.v2'
            ? {
                surface_kind: 'mas_research_trajectory_snapshot',
                version: 'mas-research-trajectory-snapshot.v2',
                study_ref: { kind: 'mas_study', ref: 'mas-study:001' },
                revision,
              }
            : {}),
          study_id: '001',
          status: 'active',
          summary: {
            primary_hypothesis: '较高的基线炎症负荷与远期心血管死亡风险相关。',
            latest_finding: '分层分析显示关联方向一致，但效应量存在人群差异。',
            current_judgment: '当前证据支持继续验证，尚不足以形成因果结论。',
            next_research_step: '完成敏感性分析并复核关键亚组的稳健性。',
            updated_at: '2026-07-17T04:30:00Z',
          },
          current_focus: {
            node_id: 'finding-1',
            primary_hypothesis: '较高的基线炎症负荷与远期心血管死亡风险相关。',
          },
          active_branch: { branch_id: 'branch-primary', label: '炎症负荷验证路线' },
          ...(schemaVersion === 'scientific-reasoning-map.v2'
            ? {
                current_focus_node_refs: ['finding-1'],
                active_branch_node_refs: ['hypothesis-1', 'test-1', 'finding-1'],
              }
            : {}),
          nodes: [
            {
              id: 'hypothesis-1',
              kind: 'hypothesis',
              label: '提出主要研究假设',
              status: 'proposed',
              summary: '评估基线炎症负荷与远期心血管死亡风险的关系。',
              branch_id: 'branch-primary',
              occurred_at: '2026-07-15T02:00:00Z',
              details: createMedicalNarrative(schemaVersion, '主要研究假设', {
                research_question: '炎症负荷能否识别心血管死亡高风险人群？',
                current_hypothesis: '较高的基线炎症负荷与远期心血管死亡风险相关。',
                validation_method: '预设多变量生存模型与分层分析。',
                main_findings: null,
                evidence_judgment: '等待分析结果。',
                route_adjustment: null,
                next_research_step: '完成主分析。',
                limitations: ['观察性设计不能单独支持因果推断。'],
                sources_and_basis: ['研究方案预设问题与既有队列变量可支持该验证。'],
              }),
              source_refs: [createScientificSourceRef(schemaVersion, 'protocol', 'mas-source:protocol', 'c')],
            },
            {
              id: 'test-1',
              kind: 'test',
              label: '执行预设验证',
              status: 'completed',
              summary: '完成主模型、分层模型与缺失数据敏感性分析。',
              branch_id: 'branch-primary',
              occurred_at: '2026-07-16T06:00:00Z',
              details: createMedicalNarrative(schemaVersion, '预设验证', {
                research_question: '主要关联在不同人群和处理假设下是否稳健？',
                current_hypothesis: '主要关联方向在关键亚组中保持一致。',
                validation_method: '多变量模型、预设交互项与多重插补敏感性分析。',
                main_findings: '大多数模型方向一致，部分亚组区间较宽。',
                evidence_judgment: '结果具有一致性，但精度仍需复核。',
                route_adjustment: '保留主路线并增加关键亚组稳健性复核。',
                next_research_step: '复核亚组样本量与模型设定。',
                limitations: ['部分亚组事件数有限。'],
                sources_and_basis: ['预设统计分析计划与冻结分析输出。'],
              }),
              source_refs: [createScientificSourceRef(schemaVersion, 'analysis', 'mas-source:analysis-primary', 'd')],
            },
            {
              id: 'finding-1',
              kind: 'finding',
              label: '形成阶段性证据判断',
              status: 'active',
              summary: '关联方向一致，效应量存在人群差异，继续验证而不提前定论。',
              branch_id: 'branch-primary',
              occurred_at: '2026-07-17T04:30:00Z',
              details: createMedicalNarrative(schemaVersion, '阶段性证据判断', {
                research_question: '现有结果是否足以支持继续推进该研究路线？',
                current_hypothesis: '较高的基线炎症负荷与远期心血管死亡风险相关。',
                validation_method: '综合主分析、亚组分析和敏感性分析判断。',
                main_findings: '分层分析显示关联方向一致，但效应量存在人群差异。',
                evidence_judgment: '当前证据支持继续验证，尚不足以形成因果结论。',
                route_adjustment: '保留主路线，补充关键亚组稳健性复核。',
                next_research_step: '完成敏感性分析并复核关键亚组的稳健性。',
                limitations: ['观察性残余混杂仍可能存在。', '部分亚组估计精度有限。'],
                sources_and_basis: ['冻结主分析结果。', '独立统计复核给出的阶段性判断。'],
              }),
              source_refs: [createScientificSourceRef(schemaVersion, 'analysis', 'mas-source:finding-primary', 'e')],
            },
            {
              id: 'route-historical-1',
              kind: 'route',
              label: '评估替代分析路线',
              status: 'pivoted',
              summary: '曾考虑简化的组间比较，因混杂控制不足而未作为正式分析路线。',
              branch_id: 'branch-historical',
              occurred_at: '2026-07-15T08:30:00Z',
              details: createMedicalNarrative(schemaVersion, '替代分析路线评估', {
                research_question: '简化的组间比较能否快速支持风险差异判断？',
                current_hypothesis: null,
                validation_method: '审查比较设计、基线平衡和混杂控制充分性。',
                main_findings: '基线不可比性可能显著影响未经校正的组间差异。',
                evidence_judgment: '该路线不足以形成可靠的证据判断。',
                route_adjustment: '回到预设多变量模型与敏感性分析路线。',
                next_research_step: '按预设方案完成校正分析。',
                limitations: ['简化比较未充分控制已知混杂因素。'],
                sources_and_basis: ['预设统计分析方案中的混杂控制要求。'],
              }),
              source_refs: [createScientificSourceRef(schemaVersion, 'analysis_plan', 'mas-source:analysis-plan', 'f')],
            },
            ...extraNodes,
          ],
          edges: [
            {
              id: 'edge-1',
              source: 'hypothesis-1',
              target: 'test-1',
              kind: 'tests',
              label: '按预设方案验证',
              status: 'historical',
              source_refs: [createScientificSourceRef(schemaVersion, 'analysis_plan', 'mas-source:edge-tests', '1')],
            },
            {
              id: 'edge-2',
              source: 'test-1',
              target: 'finding-1',
              kind: 'supports',
              label: '形成阶段性支持',
              status: 'active',
              source_refs: [createScientificSourceRef(schemaVersion, 'analysis', 'mas-source:edge-supports', '2')],
            },
            {
              id: 'edge-3',
              source: 'hypothesis-1',
              target: 'route-historical-1',
              kind: 'routes_to',
              label: '曾评估替代分析路线',
              status: 'historical',
              source_refs: [createScientificSourceRef(schemaVersion, 'analysis_plan', 'mas-source:edge-route', '3')],
            },
            ...extraEdges,
          ],
          ...(schemaVersion === 'scientific-reasoning-map.v2'
            ? {
                medical_narrative: createMedicalNarrative(schemaVersion, '科研路线概述', {
                  research_question: '炎症负荷能否识别心血管死亡高风险人群？',
                  current_hypothesis: '较高的基线炎症负荷与远期心血管死亡风险相关。',
                  validation_method: '采用预设多变量生存模型、分层分析与敏感性分析。',
                  main_findings: '分层分析显示关联方向一致，但效应量存在人群差异。',
                  evidence_judgment: '当前证据支持继续验证，尚不足以形成因果结论。',
                  route_adjustment: '保留主路线，并补充关键亚组稳健性复核。',
                  next_research_step: '完成敏感性分析并复核关键亚组的稳健性。',
                  limitations: ['观察性残余混杂仍可能存在。', '部分亚组估计精度有限。'],
                  sources_and_basis: ['冻结主分析结果。', '预设统计分析计划。'],
                }),
              }
            : {}),
          source_refs: [createScientificSourceRef(schemaVersion, 'snapshot', 'mas-source:trajectory-snapshot', '4')],
          conditions: [
            {
              type: 'EvidenceCurrent',
              status: 'True',
              reason: 'machine_only_reason',
              ...(schemaVersion === 'scientific-reasoning-map.v2'
                ? {
                    message: '医学研究证据已同步至当前科研路线。',
                    source_refs: [],
                  }
                : { ref: '/private/research/receipt.json' }),
            },
          ],
        },
    conditions: [{ type: 'ViewReady', reason: 'machine_only_envelope_reason' }],
  };
}

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
  workItemId = id,
  projectId,
  projectName,
  displayName,
  primaryState,
  businessState = 'active',
  visibilityState = 'visible',
  visibilityGeneration = 0,
  includeVisibilityGeneration = true,
  executionState = 'running',
  attentionKind = 'none',
  observedTokens,
  cumulativeTokens,
  runtimeStageId,
  currentStage = null,
  nextStage = null,
  action,
  stageMap,
  domainDetailViews = [],
}: FixtureItemOptions) {
  const active = executionState === 'running';
  const lifecycleSemanticState = businessState === 'delivered_paused' ? 'deliveredPaused' : businessState;
  const stageTokens = observedTokens;
  const resolvedCumulativeTokens = cumulativeTokens ?? (observedTokens === undefined ? undefined : observedTokens * 2);
  return {
    item_id: `${projectId}:${encodeURIComponent(workItemId)}`,
    identity: {
      agent_id: 'mas',
      domain_id: 'medautoscience',
      project_id: projectId,
      project_display_name: projectName,
      project_scope_id: `project:${projectId}`,
      workspace_binding_id: `${projectId}-binding`,
      workspace_path: `/fixtures/${projectName}`,
      work_item_id: workItemId,
      work_item_display_name: displayName,
      work_item_root: `/fixtures/${projectName}/studies/${id}`,
      work_item_scope_id: `work-item:${workItemId}`,
      source_kind: 'domain_inventory',
    },
    visibility: {
      state: visibilityState,
      source: visibilityState === 'archived' ? 'work_item_visibility_control' : 'default_visible',
      updated_at: visibilityState === 'archived' ? '2026-07-13T08:00:00Z' : null,
      control_ref: visibilityState === 'archived' ? `visibility-control://${projectId}/${id}` : null,
      ...(includeVisibilityGeneration ? { generation: visibilityGeneration } : {}),
    },
    lifecycle: {
      business_state: businessState,
      domain_business_state: businessState,
      control_state: businessState,
      raw_business_status: businessState,
      primary_state: primaryState,
      primary_state_label: primaryState,
      reason: `fixture_${primaryState}`,
      current_stage_id: currentStage?.id ?? null,
      current_stage_display_name: currentStage?.displayName ?? null,
      current_stage_status: active ? 'running' : null,
      package_status: businessState === 'delivered_paused' ? 'milestone_delivered' : 'not_ready',
      lifecycle_ref: `/fixtures/${projectName}/studies/${id}/STUDY_STATUS.md`,
      source: 'domain_inventory_projection',
      control_ref: null,
      control_updated_at: null,
      observed_generation: `generation:${id}`,
    },
    execution: {
      state: executionState,
      stage_id: runtimeStageId ?? currentStage?.id ?? null,
      current_stage_id: currentStage?.id ?? null,
      current_stage_display_name: currentStage?.displayName ?? null,
      next_stage_id: nextStage?.id ?? null,
      next_stage_display_name: nextStage?.displayName ?? null,
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
      state:
        observedTokens === undefined ? (resolvedCumulativeTokens === undefined ? 'missing' : 'partial') : 'observed',
      current_stage: tokenObservation(stageTokens, 'no_stage_usage_observed'),
      cumulative: tokenObservation(resolvedCumulativeTokens, 'no_cumulative_usage_observed'),
      missing_reason:
        observedTokens === undefined && resolvedCumulativeTokens === undefined ? 'no_usage_observed' : null,
    },
    action: {
      kind: action.kind,
      title_key: action.titleKey ?? `lifecycle.${lifecycleSemanticState}.title`,
      summary_key: action.summaryKey ?? `lifecycle.${lifecycleSemanticState}.summary`,
      message_args: action.messageArgs ?? {
        agent_id: 'mas',
        agent_display_name: action.owner,
      },
      title: action.title,
      summary: action.summary,
      owner: action.ownerId ?? (action.owner === '你' ? 'user' : 'mas'),
      owner_kind: action.ownerKind ?? (action.owner === '你' ? 'user' : 'agent'),
      owner_display_name: action.owner,
    },
    stage_map: stageMap.map((stage) => ({
      stage_id: stage.id,
      display_name: stage.displayName,
      display_names: stage.displayNames ?? {},
      state: stage.state,
      owner_display_name: 'Med Auto Science',
      elapsed_seconds: stage.elapsedSeconds ?? null,
      usage: stage.usage === undefined ? null : tokenObservation(stage.usage, 'stage_usage_missing'),
      next_action: stage.nextAction ?? null,
    })),
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
        ref: `/fixtures/${projectName}/studies/${id}/STUDY_STATUS.md`,
        role: 'lifecycle_ref',
      },
    ],
    domain_detail_views: domainDetailViews,
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
    workspace_path: `/fixtures/${displayName}`,
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
  const deliveredStages = [
    { id: 'intake', displayName: '研究立项', state: 'completed' as const },
    { id: 'analysis', displayName: '统计分析', state: 'completed' as const },
    { id: 'write', displayName: '论文写作', state: 'completed' as const },
    { id: 'submission', displayName: '投稿包交付', state: 'completed' as const },
  ];
  const stoppedStages = [
    { id: 'intake', displayName: '研究立项', state: 'completed' as const },
    { id: 'publication_gate', displayName: '发表可行性评估', state: 'stopped' as const },
  ];
  const items = [
    fixtureItem({
      id: 'dm001',
      workItemId: '001',
      projectId: 'diabetes',
      projectName: 'DM-CVD-Mortality-Risk',
      displayName: '001 DM CVD Mortality Risk',
      primaryState: 'automatically_advancing',
      visibilityGeneration: 3,
      observedTokens: 1200,
      currentStage: { id: 'analysis_review', displayName: '分析结果复核' },
      nextStage: { id: 'write', displayName: '医学写作' },
      action: {
        kind: 'agent_action',
        title: '完成结果复核并进入写作',
        summary: 'Med Auto Science 正在复核结果，完成后进入论文写作。',
        owner: 'Med Auto Science',
      },
      domainDetailViews: [createScientificReasoningDescriptor()],
      stageMap: [
        {
          id: 'intake',
          displayName: '研究立项',
          displayNames: { 'zh-CN': '研究立项', 'en-US': 'Study intake' },
          state: 'completed',
        },
        {
          id: 'analysis',
          displayName: '统计分析',
          displayNames: { 'zh-CN': '统计分析', 'en-US': 'Statistical analysis' },
          state: 'completed',
          elapsedSeconds: 3200,
          usage: 900,
        },
        {
          id: 'analysis_review',
          displayName: '分析结果复核',
          displayNames: { 'zh-CN': '分析结果复核', 'en-US': 'Analysis review' },
          state: 'current',
          elapsedSeconds: 5340,
          usage: 1200,
          nextAction: '完成结果复核',
        },
        {
          id: 'write',
          displayName: '医学写作',
          displayNames: { 'zh-CN': '医学写作', 'en-US': 'Medical writing' },
          state: 'next',
          nextAction: '生成论文初稿',
        },
        {
          id: 'review',
          displayName: '医学审稿',
          displayNames: { 'zh-CN': '医学审稿', 'en-US': 'Medical review' },
          state: 'pending',
        },
      ],
    }),
    fixtureItem({
      id: 'dm002',
      projectId: 'diabetes',
      projectName: 'DM-CVD-Mortality-Risk',
      displayName: '002 DM China US Mortality Attribution',
      primaryState: 'delivered_auto_paused',
      businessState: 'delivered_paused',
      executionState: 'idle',
      includeVisibilityGeneration: false,
      cumulativeTokens: 1500,
      runtimeStageId: 'runtime_token_telemetry_verification',
      action: {
        kind: 'user_action',
        title: '补齐投稿信息',
        summary: '里程碑投稿包已交付，待补齐作者和机构等客观信息。',
        owner: '你',
      },
      stageMap: deliveredStages,
    }),
    fixtureItem({
      id: 'dm003',
      projectId: 'diabetes',
      projectName: 'DM-CVD-Mortality-Risk',
      displayName: '003 DPCC Primary Care Phenotype Treatment Gap',
      primaryState: 'delivered_auto_paused',
      businessState: 'delivered_paused',
      executionState: 'idle',
      action: {
        kind: 'user_action',
        title: '补齐投稿信息',
        summary: '里程碑投稿包已交付，待补齐作者和机构等客观信息。',
        owner: '你',
      },
      stageMap: deliveredStages,
    }),
    fixtureItem({
      id: 'dm004',
      projectId: 'diabetes',
      projectName: 'DM-CVD-Mortality-Risk',
      displayName: '004 DPCC Longitudinal Care Inertia Gap',
      primaryState: 'paused',
      businessState: 'paused',
      executionState: 'idle',
      action: {
        kind: 'user_action',
        title: '明确是否继续推进',
        summary: '当前方向已暂停，等待更明确的研究判断。',
        owner: '你',
      },
      stageMap: [
        ...deliveredStages.slice(0, 3),
        { id: 'decision', displayName: '后续方向决定', state: 'waiting_user' },
      ],
    }),
    fixtureItem({
      id: 'nf001',
      workItemId: '001',
      projectId: 'nf-pitnet',
      projectName: 'NF-PitNET',
      displayName: 'NF-PitNET Paper 1',
      primaryState: 'stopped',
      businessState: 'stopped',
      executionState: 'idle',
      action: {
        kind: 'blocked_no_action',
        title: '已停止推进',
        summary: '发表可行性不足，已在早期止损。',
        owner: 'Med Auto Science',
      },
      stageMap: stoppedStages,
    }),
    fixtureItem({
      id: 'nf002',
      projectId: 'nf-pitnet',
      projectName: 'NF-PitNET',
      displayName: 'NF-PitNET Paper 2',
      primaryState: 'delivered_auto_paused',
      businessState: 'delivered_paused',
      executionState: 'idle',
      action: {
        kind: 'user_action',
        title: '补齐投稿信息',
        summary: '里程碑投稿包已交付，等待投稿所需客观信息。',
        owner: '你',
      },
      stageMap: deliveredStages,
    }),
    fixtureItem({
      id: 'nf003',
      projectId: 'nf-pitnet',
      projectName: 'NF-PitNET',
      displayName: 'NF-PitNET Paper 3',
      primaryState: 'delivered_auto_paused',
      businessState: 'delivered_paused',
      executionState: 'idle',
      action: {
        kind: 'user_action',
        title: '补齐投稿信息',
        summary: '里程碑投稿包已交付，等待投稿所需客观信息。',
        owner: '你',
      },
      stageMap: deliveredStages,
    }),
    fixtureItem({
      id: 'nf004',
      projectId: 'nf-pitnet',
      projectName: 'NF-PitNET',
      displayName: 'NF-PitNET Paper 4',
      primaryState: 'stopped',
      businessState: 'stopped',
      executionState: 'idle',
      action: {
        kind: 'blocked_no_action',
        title: '已停止推进',
        summary: '完成评估后确认发表可行性不足，不再自动推进。',
        owner: 'Med Auto Science',
      },
      stageMap: [
        ...deliveredStages.slice(0, 3),
        { id: 'publication_gate', displayName: '发表可行性评估', state: 'stopped' },
      ],
    }),
    fixtureItem({
      id: 'obesity001',
      projectId: 'obesity',
      projectName: 'Obesity',
      displayName: 'Obesity Paper 1',
      primaryState: 'awaiting_user_decision',
      executionState: 'idle',
      attentionKind: 'user',
      currentStage: { id: 'idea', displayName: '研究方向确认' },
      nextStage: { id: 'protocol', displayName: '研究设计' },
      action: {
        kind: 'user_action',
        title: '确认研究问题和终点',
        summary: '确认研究方向后，Med Auto Science 将进入研究设计。',
        owner: '你',
      },
      stageMap: [
        { id: 'idea', displayName: '研究方向确认', state: 'waiting_user', nextAction: '确认研究问题和终点' },
        { id: 'protocol', displayName: '研究设计', state: 'next' },
        { id: 'analysis', displayName: '统计分析', state: 'pending' },
      ],
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
    project_catalog: [
      project('diabetes', 'DM-CVD-Mortality-Risk'),
      project('nf-pitnet', 'NF-PitNET'),
      project('obesity', 'Obesity'),
    ],
    summary: {
      agent_count: 5,
      project_count: 3,
      work_item_count: 9,
      visible_work_item_count: 9,
      archived_work_item_count: 0,
      total_work_item_count: 9,
      running_count: 1,
      user_attention_count: 1,
      system_attention_count: 0,
      telemetry_observed_count: 2,
      telemetry_missing_count: 7,
    },
    items,
    diagnostics: { count: 3, items: [], detail_policy: 'summary_only' },
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
