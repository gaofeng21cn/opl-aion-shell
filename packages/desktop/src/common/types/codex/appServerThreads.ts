/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type CodexThreadStatus = 'not_loaded' | 'idle' | 'running' | 'system_error' | 'archived';
export type CodexThreadTurnStatus = 'in_progress' | 'completed' | 'failed' | 'interrupted' | 'unknown';
export type CodexThreadHistoryRole = 'user' | 'assistant' | 'system' | 'tool' | 'unknown';
export type CodexThreadHistoryKind = 'text' | 'thinking' | 'plan' | 'tool';

export type CodexThreadDescriptor = {
  id: string;
  title: string;
  summary: string;
  status: CodexThreadStatus;
  projectId: string;
  workspace: string;
  host: string;
  owner: string | null;
  goal: string | null;
  parentThreadId: string | null;
  ancestorThreadIds: string[];
  activeTurnId: string | null;
  archived: boolean;
  updatedAt: string;
};

export type CodexThreadHistoryItem = {
  id: string;
  turnId: string;
  role: CodexThreadHistoryRole;
  kind: CodexThreadHistoryKind;
  text: string;
  data?: unknown;
  status: CodexThreadTurnStatus;
  createdAt: string | null;
};

export type CodexThreadModelDescriptor = {
  id: string;
  label: string;
  description: string;
  supportedReasoningEfforts: string[];
  defaultReasoningEffort: string | null;
  isDefault: boolean;
};

export type CodexThreadSettings = {
  model: string;
  effort: string | null;
  permissionMode: 'read-only' | 'default' | 'full-access';
};

export type CodexThreadDetail = {
  thread: CodexThreadDescriptor;
  history: CodexThreadHistoryItem[];
  settings?: CodexThreadSettings;
  models?: CodexThreadModelDescriptor[];
};

export type CodexThreadDirectoryRequest = {
  projectId?: string;
  workspace?: string;
  includeArchived?: boolean;
};

export type CodexThreadDirectory = {
  schema: 'opl_codex_thread_directory.v1';
  host: string;
  complete: boolean;
  threads: CodexThreadDescriptor[];
};

export type CodexThreadStartRequest = {
  workspace: string;
  model?: string;
};

export type CodexThreadIdRequest = { threadId: string };
export type CodexThreadReadRequest = CodexThreadIdRequest & { conversationId?: string };
export type CodexThreadPendingApprovalRequest = CodexThreadIdRequest & { conversationId: string };
export type CodexThreadRenameRequest = CodexThreadIdRequest & { name: string };
export type CodexThreadSettingsUpdateRequest = CodexThreadIdRequest & { cwd: string };
export type CodexThreadProjectAffinityAssignRequest = CodexThreadIdRequest & { projectId: string };
export type CodexThreadConfigurationUpdateRequest = CodexThreadIdRequest &
  Partial<Pick<CodexThreadSettings, 'model' | 'effort' | 'permissionMode'>>;

export type CodexThreadTurnStartRequest = CodexThreadIdRequest & {
  conversationId: string;
  input: string;
  files?: string[];
  msgId: string;
  model?: string;
  effort?: string;
  permissionMode?: string;
};

export type CodexThreadTurnStartResult = {
  msgId: string;
  turnId: string;
};

export type CodexThreadTurnInterruptRequest = CodexThreadIdRequest & {
  conversationId: string;
  turnId: string;
};

export type CodexThreadApprovalDecision =
  | 'accept'
  | 'acceptForSession'
  | 'acceptAlways'
  | 'acceptWithExecpolicyAmendment'
  | 'applyNetworkPolicyAmendment'
  | 'decline'
  | 'cancel';

export type CodexThreadUserInputQuestion = {
  id: string;
  header: string;
  question: string;
  isOther: boolean;
  isSecret: boolean;
  options: Array<{ label: string; description: string }> | null;
};

export type CodexThreadMcpElicitation = {
  mode: 'form' | 'openai/form' | 'url';
  message: string;
  requestedSchema?: Record<string, unknown>;
  url?: string;
  meta?: unknown;
};

export type CodexThreadPermissionRequest = {
  cwd: string;
  reason: string | null;
  permissions: Record<string, unknown>;
};

export type CodexThreadInteraction =
  | { kind: 'approval' }
  | { kind: 'request_user_input'; questions: CodexThreadUserInputQuestion[] }
  | { kind: 'mcp_elicitation'; elicitation: CodexThreadMcpElicitation }
  | { kind: 'permissions'; request: CodexThreadPermissionRequest };

export type CodexThreadApprovalResponseRequest = {
  requestId: string;
  decision: CodexThreadApprovalDecision;
  answers?: Record<string, { answers: string[] }>;
  content?: Record<string, unknown>;
};

export type CodexReviewDelivery = 'inline' | 'detached';
export type CodexReviewTarget =
  | { type: 'uncommittedChanges' }
  | { type: 'baseBranch'; branch: string }
  | { type: 'commit'; sha: string; title: string | null }
  | { type: 'custom'; instructions: string };

export type CodexReviewStartRequest = CodexThreadIdRequest & {
  target: CodexReviewTarget;
  delivery: CodexReviewDelivery;
};

export type CodexReviewStartResult = {
  reviewThreadId: string;
  turnId: string;
};
