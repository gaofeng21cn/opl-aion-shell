/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type CodexThreadStatus = 'not_loaded' | 'idle' | 'running' | 'system_error' | 'archived';
export type CodexThreadTurnStatus = 'in_progress' | 'completed' | 'failed' | 'interrupted' | 'unknown';
export type CodexThreadHistoryRole = 'user' | 'assistant' | 'system' | 'tool' | 'unknown';

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
  text: string;
  status: CodexThreadTurnStatus;
  createdAt: string | null;
};

export type CodexThreadDetail = {
  thread: CodexThreadDescriptor;
  history: CodexThreadHistoryItem[];
};

export type CodexThreadDirectoryRequest = {
  projectId?: string;
  workspace?: string;
  includeArchived?: boolean;
};

export type CodexThreadDirectory = {
  schema: 'opl_codex_thread_directory.v1';
  host: string;
  threads: CodexThreadDescriptor[];
};

export type CodexThreadStartRequest = {
  workspace: string;
  model?: string;
};

export type CodexThreadIdRequest = { threadId: string };
export type CodexThreadRenameRequest = CodexThreadIdRequest & { name: string };
export type CodexThreadWorkspaceRequest = CodexThreadIdRequest & { workspace: string };

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
