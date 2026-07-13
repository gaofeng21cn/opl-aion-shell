export const WORK_ITEM_PROJECTION_V2_SCHEMA = 'work-item-projection.v2' as const;

export type RuntimeBusinessState = 'active' | 'delivered_paused' | 'paused' | 'stopped' | 'archived' | 'unknown';

export type RuntimePrimaryStatus =
  | 'in_progress'
  | 'delivered_auto_paused'
  | 'paused_waiting_for_direction'
  | 'owner_decision_required'
  | 'system_attention_required'
  | 'stopped'
  | 'archived'
  | 'unavailable';

export type RuntimeExecutionState = 'running' | 'queued' | 'idle' | 'succeeded' | 'failed' | 'unknown';

export type RuntimeAgentAvailabilityState = 'available' | 'attention' | 'unavailable' | 'unknown';

export type RuntimeAgent = {
  id: string;
  displayName: string;
  availability: {
    state: RuntimeAgentAvailabilityState;
    reason: string;
  };
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

export type RuntimeAction = {
  kind: 'system_action';
  title: string;
  summary: string;
  ownerDisplayName: string;
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
  displayName: string;
  agentId: string;
  projectId: string;
  businessState: RuntimeBusinessState;
  primaryStatus: RuntimePrimaryStatus;
  statusUnavailableReason: 'incomplete_system_attention' | 'unknown_business_state' | null;
  execution: {
    state: RuntimeExecutionState;
    startedAt: string | null;
    lastHeartbeatAt: string | null;
    updatedAt: string | null;
  };
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

export type RuntimeWorkItemProjectionV2 = {
  schemaVersion: typeof WORK_ITEM_PROJECTION_V2_SCHEMA;
  profile: 'fast' | 'full';
  generatedAt: string;
  agents: RuntimeAgent[];
  projects: RuntimeProject[];
  items: RuntimeWorkItem[];
  diagnostics: RuntimeProjectionDiagnostic[];
};

export type RuntimeProjectionReadResult =
  | { state: 'ready'; projection: RuntimeWorkItemProjectionV2 }
  | { state: 'legacy' | 'missing' | 'invalid'; projection: null };

export type RuntimeStatusView =
  | 'all'
  | 'in_progress'
  | 'owner_decision_required'
  | 'paused'
  | 'system_attention_required';
