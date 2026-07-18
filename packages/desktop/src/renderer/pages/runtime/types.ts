export const WORK_ITEM_PROJECTION_V2_SCHEMA = 'work-item-projection.v2' as const;

export type RuntimeBusinessState = 'active' | 'delivered_paused' | 'paused' | 'stopped' | 'archived' | 'unknown';

export type RuntimePrimaryStatus =
  | 'automatically_advancing'
  | 'awaiting_user_decision'
  | 'system_attention'
  | 'delivered_auto_paused'
  | 'paused'
  | 'stopped'
  | 'sync_pending';

export type RuntimeExecutionState = 'running' | 'queued' | 'idle' | 'succeeded' | 'failed' | 'unknown';

export type RuntimeAgent = {
  id: string;
  displayName: string;
};

export type RuntimeProject = {
  id: string;
  agentId: string;
  displayName: string;
};

export type RuntimeTokenObservation =
  | {
      state: 'observed';
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      observedAt: string | null;
    }
  | {
      state: 'missing' | 'stale';
      reason: string;
    };

export type RuntimeActionKind = 'user_action' | 'system_action' | 'agent_action' | 'safe_action' | 'blocked_no_action';

export type RuntimeActionOwnerKind = 'user' | 'system' | 'agent' | 'other' | 'unknown';

export type RuntimeAction = {
  kind: RuntimeActionKind;
  titleKey: string | null;
  summaryKey: string | null;
  messageArgs: Record<string, string | number>;
  title: string;
  summary: string;
  owner: string;
  ownerKind: RuntimeActionOwnerKind;
  ownerDisplayName: string;
};

export type RuntimeWorkItemVisibility = {
  state: 'visible' | 'archived';
  source: string;
  updatedAt: string | null;
  controlRef: string | null;
  generation: number | null;
};

export type RuntimeStageState =
  | 'completed'
  | 'current'
  | 'next'
  | 'pending'
  | 'waiting_user'
  | 'system_attention'
  | 'stopped'
  | 'failed';

export type RuntimeStage = {
  id: string;
  displayName: string;
  displayNames: Record<string, string>;
  state: RuntimeStageState;
  ownerDisplayName: string | null;
  elapsedSeconds: number | null;
  usage: RuntimeTokenObservation | null;
  nextAction: string | null;
};

export type RuntimeSystemAttention = {
  responsibleComponent: string;
  issue: string;
  impact: string;
  repairAction: string;
  expectedOutcome: string;
};

export type RuntimeCondition = {
  type: string;
  status: 'True' | 'False' | 'Unknown';
  reason: string;
  message: string;
  owner: string;
  severity: 'none' | 'info' | 'warning' | 'error';
  lastTransitionAt: string | null;
  ref: string | null;
};

export type RuntimeTimelineEntry = {
  id: 'inventory_observed' | 'execution_updated' | 'control_updated';
  timestamp: string;
};

export type RuntimeSourceRef = {
  kind: 'file' | 'sqlite' | 'projection';
  role: string;
  ref: string;
};

export type DomainDetailViewAvailability = 'unread' | 'available' | 'missing' | 'stale' | 'invalid' | 'read_error';

export type DomainDetailViewReadAvailability = Exclude<DomainDetailViewAvailability, 'unread'>;

export type DomainDetailViewDescriptor = {
  itemId: string;
  viewId: string;
  viewKind: string;
  schemaVersion: string;
  availability: DomainDetailViewAvailability;
  revision: number | null;
  digest: string | null;
};

export type ScientificReasoningViewDescriptor = DomainDetailViewDescriptor & {
  viewId: 'scientific-reasoning';
  viewKind: 'scientific_reasoning_map';
  schemaVersion: ScientificReasoningMapSchema;
};

export type ScientificReasoningMapSchema = 'scientific-reasoning-map.v1' | 'scientific-reasoning-map.v2';

export type ScientificReasoningNodeKind =
  | 'hypothesis'
  | 'test'
  | 'finding'
  | 'decision'
  | 'route'
  | 'artifact'
  | 'human_gate';

export type ScientificReasoningEdgeKind =
  | 'tests'
  | 'supports'
  | 'does_not_support'
  | 'inconclusive'
  | 'revises'
  | 'supersedes'
  | 'routes_to'
  | 'requires'
  | 'produces';

export type ScientificReasoningMedicalNarrative = {
  researchQuestion: string | null;
  currentHypothesis: string | null;
  validationMethod: string | null;
  mainFindings: string | null;
  evidenceJudgment: string | null;
  routeAdjustment: string | null;
  nextResearchStep: string | null;
  limitations: string[];
  sourcesAndBasis: string[];
};

export type ScientificReasoningNode = {
  id: string;
  kind: ScientificReasoningNodeKind;
  label: string;
  status:
    | 'proposed'
    | 'planned'
    | 'active'
    | 'completed'
    | 'execution_failed'
    | 'not_assessed'
    | 'supported'
    | 'does_not_support'
    | 'inconclusive'
    | 'design_invalid'
    | 'refined'
    | 'superseded'
    | 'continued'
    | 'narrowed'
    | 'pivoted'
    | 'stopped'
    | 'human_review_required'
    | 'produced';
  summary: string;
  branchId: string | null;
  occurredAt: string;
  details: ScientificReasoningMedicalNarrative;
};

export type ScientificReasoningEdge = {
  id: string;
  source: string;
  target: string;
  kind: ScientificReasoningEdgeKind;
  label: string;
  status: 'active' | 'historical' | 'blocked';
};

export type ScientificReasoningMapPayload = {
  status:
    | 'empty'
    | 'active'
    | 'awaiting_evidence'
    | 'route_reconsideration'
    | 'human_review_required'
    | 'stopped'
    | 'completed';
  summary: {
    primaryHypothesis: string | null;
    latestFinding: string | null;
    currentJudgment: string | null;
    nextResearchStep: string | null;
    updatedAt: string | null;
  };
  currentFocus: { nodeId: string | null; primaryHypothesis: string | null };
  activeBranch: { branchId: string | null; label: string | null };
  currentFocusNodeRefs: string[];
  activeBranchNodeRefs: string[];
  nodes: ScientificReasoningNode[];
  edges: ScientificReasoningEdge[];
  medicalNarrative: ScientificReasoningMedicalNarrative | null;
};

export type ScientificReasoningViewEnvelope = {
  itemId: string;
  viewId: string;
  viewKind: 'scientific_reasoning_map';
  availability: DomainDetailViewReadAvailability;
  revision: number;
  digest: string | null;
  payloadSchema: ScientificReasoningMapSchema;
  notModified: boolean;
  payload: ScientificReasoningMapPayload | null;
};

export type RuntimeWorkItem = {
  id: string;
  workItemId: string;
  displayName: string;
  agentId: string;
  projectId: string;
  visibility: RuntimeWorkItemVisibility;
  businessState: RuntimeBusinessState;
  primaryStatus: RuntimePrimaryStatus;
  statusSyncReason: 'incomplete_system_attention' | 'missing_primary_state' | null;
  execution: {
    state: RuntimeExecutionState;
    attemptId: string | null;
    currentStageId: string | null;
    currentStageDisplayName: string | null;
    nextStageId: string | null;
    nextStageDisplayName: string | null;
    startedAt: string | null;
    lastHeartbeatAt: string | null;
    updatedAt: string | null;
  };
  stageMap: RuntimeStage[];
  stageUsage: RuntimeTokenObservation;
  taskUsage: RuntimeTokenObservation;
  action: RuntimeAction | null;
  systemAttention: RuntimeSystemAttention | null;
  conditions: RuntimeCondition[];
  timeline: RuntimeTimelineEntry[];
  sourceRefs: RuntimeSourceRef[];
  domainDetailViews: DomainDetailViewDescriptor[];
};

export type RuntimeProjectionDiagnostic = {
  reason: string;
};

export type RuntimeProjectionDiagnosticDetailPolicy = 'summary_only' | 'included';

export type RuntimeWorkItemProjectionV2 = {
  schemaVersion: typeof WORK_ITEM_PROJECTION_V2_SCHEMA;
  profile: 'fast' | 'full';
  generatedAt: string;
  agents: RuntimeAgent[];
  projects: RuntimeProject[];
  items: RuntimeWorkItem[];
  diagnostics: RuntimeProjectionDiagnostic[];
  diagnosticCount: number;
  diagnosticDetailPolicy: RuntimeProjectionDiagnosticDetailPolicy;
};

export type RuntimeProjectionReadResult =
  | { state: 'ready'; projection: RuntimeWorkItemProjectionV2 }
  | { state: 'legacy' | 'missing' | 'invalid'; projection: null };

export type RuntimeStatusView =
  | 'all'
  | 'automatically_advancing'
  | 'awaiting_user_decision'
  | 'system_attention'
  | 'delivered_or_paused'
  | 'stopped'
  | 'sync_pending';
