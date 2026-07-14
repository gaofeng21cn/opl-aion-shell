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
