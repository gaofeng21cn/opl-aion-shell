export const RUNTIME_TRAY_ITEM_STORAGE_KEY = 'opl.runtimeTrayItem';

export type RuntimeTrayCommand = {
  step_id: string;
  title: string;
  surface_kind: string;
  command: string;
};

export type RuntimeTrayActionOwner = 'user' | 'opl' | 'infrastructure' | 'none';
export type RuntimeTrayActionKind =
  | 'human_gate'
  | 'handoff_review'
  | 'quality_gate'
  | 'publication_gate'
  | 'infrastructure_timeout'
  | 'infrastructure_recovery'
  | 'running';

export type RuntimeTrayActionCounts = {
  user: number;
  opl: number;
  infrastructure: number;
};

export type RuntimeTrayOpenPayload = {
  projectId: string;
  projectLabel: string;
  itemId: string;
  title: string;
  statusLabel: string;
  summary: string | null;
  updatedAt: string | null;
  command: string | null;
  workspacePath: string | null;
  sourceRefs: Array<Record<string, unknown>>;
  actionOwner?: RuntimeTrayActionOwner;
  requiresUserAction?: boolean;
  actionKind?: RuntimeTrayActionKind | null;
  actionSummary?: string;
  studyId?: string | null;
  workspaceLabel?: string | null;
  detailSummary?: string | null;
  nextActionSummary?: string | null;
  activeRunId?: string | null;
  browserUrl?: string | null;
  questSessionApiUrl?: string | null;
  healthStatus?: string | null;
  blockers?: string[];
  recommendedCommands?: RuntimeTrayCommand[];
};

export type RuntimeTrayItem = {
  item_id: string;
  project_id: string;
  project_label: string;
  title: string;
  status_label: string;
  summary: string | null;
  updated_at: string | null;
  command: string | null;
  workspace_path: string | null;
  source_refs: Array<Record<string, unknown>>;
  action_owner?: RuntimeTrayActionOwner;
  requires_user_action?: boolean;
  action_kind?: RuntimeTrayActionKind | null;
  action_summary?: string;
  study_id?: string | null;
  workspace_label?: string | null;
  detail_summary?: string | null;
  next_action_summary?: string | null;
  active_run_id?: string | null;
  browser_url?: string | null;
  quest_session_api_url?: string | null;
  health_status?: string | null;
  blockers?: string[];
  recommended_commands?: RuntimeTrayCommand[];
};

export type RuntimeTraySnapshot = {
  schema_version: 'runtime_tray_snapshot.v1';
  runtime_health: {
    status: 'offline' | 'needs_attention' | 'running' | 'idle';
    label: string;
    summary: string;
  };
  last_updated: string;
  running_items: RuntimeTrayItem[];
  attention_items: RuntimeTrayItem[];
  recent_items: RuntimeTrayItem[];
  action_counts?: RuntimeTrayActionCounts;
  source_refs: Array<Record<string, unknown>>;
};
