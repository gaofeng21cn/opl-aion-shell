/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const CODEX_THREAD_COORDINATION_METHODS = [
  'thread/list',
  'thread/read',
  'thread/resume',
  'thread/fork',
  'thread/archive',
  'turn/start',
  'turn/steer',
] as const;

export type CodexThreadCoordinationMethod = (typeof CODEX_THREAD_COORDINATION_METHODS)[number];
export type CodexThreadCoordinationStatus = 'not_loaded' | 'idle' | 'running' | 'system_error' | 'archived';
export type CodexThreadTurnStatus = 'in_progress' | 'completed' | 'failed' | 'interrupted' | 'unknown';
export type CodexThreadHistoryRole = 'user' | 'assistant' | 'system' | 'tool' | 'unknown';
export type CodexThreadPermission = 'read_only' | 'workspace_write';

export type CodexThreadDescriptor = {
  id: string;
  title: string;
  summary: string;
  status: CodexThreadCoordinationStatus;
  projectId: string;
  workspace: string;
  host: string;
  owner: string | null;
  goal: string | null;
  parentThreadId: string | null;
  ancestorThreadIds: string[];
  activeTurnId: string | null;
  activeWriteSet: string[];
  activePermission: CodexThreadPermission | null;
  archived: boolean;
  updatedAt: string;
};

export type CodexThreadHistoryItem = {
  id: string;
  turnId: string;
  role: CodexThreadHistoryRole;
  text: string;
  status: CodexThreadTurnStatus;
  createdAt: string | null;
};

export type CodexThreadDetail = {
  thread: CodexThreadDescriptor;
  history: CodexThreadHistoryItem[];
};

export type ThreadCoordinationActor = {
  kind: 'model' | 'user';
  id: string;
  threadId: string | null;
};

export type ThreadCoordinationErrorCode =
  | 'protocol_unavailable'
  | 'protocol_error'
  | 'invalid_request'
  | 'thread_not_found'
  | 'not_top_level_thread'
  | 'self_delivery'
  | 'delivery_loop'
  | 'duplicate_delivery'
  | 'confirmation_required'
  | 'confirmation_invalid'
  | 'cross_host_delivery'
  | 'cross_project_write'
  | 'permission_expansion_denied'
  | 'write_set_required'
  | 'write_set_unknown'
  | 'write_set_conflict'
  | 'running_turn_unknown'
  | 'thread_not_writable';

export type ThreadCoordinationAuditResult = 'accepted' | 'confirmation_required' | 'rejected' | 'failed';
export type ThreadCoordinationDecision = 'allowed' | 'confirmation_required' | 'denied' | 'not_applicable';

export type ThreadCoordinationPermissionDecision = {
  requested: CodexThreadPermission | null;
  decision: ThreadCoordinationDecision;
  reason: string;
};

export type ThreadCoordinationWriteSetDecision = {
  requestedPathCount: number;
  decision: ThreadCoordinationDecision;
  reason: string;
  conflictingThreadId: string | null;
};

export type ThreadCoordinationAuditEvent = {
  schema: 'opl_codex_thread_coordination_audit.v1';
  id: string;
  observedAt: string;
  completedAt: string;
  actor: ThreadCoordinationActor;
  action: ThreadCoordinationActionRequest['action'];
  senderThreadId: string | null;
  receiverThreadId: string;
  senderLabel: string;
  receiverLabel: string;
  reason: string;
  messageSummary: string | null;
  result: ThreadCoordinationAuditResult;
  resultMessage: string;
  protocolMethod: CodexThreadCoordinationMethod | null;
  permission: CodexThreadPermission | null;
  writeSet: string[];
  permissionDecision: ThreadCoordinationPermissionDecision;
  writeSetDecision: ThreadCoordinationWriteSetDecision;
  threadStatusBefore: CodexThreadCoordinationStatus | null;
  threadStatusAfter: CodexThreadCoordinationStatus | null;
  idempotencyKey: string | null;
  errorCode: ThreadCoordinationErrorCode | null;
};

export type ThreadCoordinationAvailability = {
  status: 'available' | 'unavailable';
  host: string | null;
  protocolVersion: string | null;
  methods: CodexThreadCoordinationMethod[];
  reasonCode: ThreadCoordinationErrorCode | null;
  detail: string | null;
};

export type ThreadCoordinationOverviewRequest = {
  projectId?: string;
  workspace?: string;
  includeArchived?: boolean;
  sourceThreadIdHint?: string;
};

export type ThreadCoordinationOverview = {
  schema: 'opl_codex_thread_coordination_overview.v1';
  availability: ThreadCoordinationAvailability;
  currentThreadId: string | null;
  currentProjectId: string | null;
  threads: CodexThreadDescriptor[];
  audit: ThreadCoordinationAuditEvent[];
};

export type ThreadCoordinationReadRequest = {
  threadId: string;
};

export type ThreadCoordinationReadResult =
  | { ok: true; detail: CodexThreadDetail }
  | { ok: false; errorCode: ThreadCoordinationErrorCode; message: string };

export type ThreadCoordinationLifecycleRequest = {
  action: 'resume' | 'fork' | 'archive';
  targetThreadId: string;
  actor: ThreadCoordinationActor;
  reason: string;
  confirmationToken?: string;
};

export type ThreadCoordinationDeliveryRequest = {
  action: 'deliver';
  sourceThreadId: string;
  targetThreadId: string;
  actor: ThreadCoordinationActor;
  reason: string;
  message: string;
  permission: CodexThreadPermission;
  writeSet: string[];
  idempotencyKey: string;
  route: {
    visitedThreadIds: string[];
    hopCount: number;
  };
  confirmationToken?: string;
};

export type ThreadCoordinationActionRequest = ThreadCoordinationLifecycleRequest | ThreadCoordinationDeliveryRequest;

export type ThreadCoordinationExecuteRequest = {
  request: ThreadCoordinationActionRequest;
};

export type ThreadCoordinationActionResult = {
  ok: boolean;
  outcome: ThreadCoordinationAuditResult;
  action: ThreadCoordinationActionRequest['action'];
  targetThreadId: string;
  forkedThreadId: string | null;
  protocolMethod: CodexThreadCoordinationMethod | null;
  auditId: string;
  errorCode: ThreadCoordinationErrorCode | null;
  message: string;
  confirmation: {
    token: string;
    expiresAt: string;
    risks: string[];
  } | null;
};
