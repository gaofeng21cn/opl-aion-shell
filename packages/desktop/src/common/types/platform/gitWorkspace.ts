/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type GitWorkspaceErrorCode =
  | 'ABSOLUTE_PATH_REQUIRED'
  | 'BRANCH_ALREADY_EXISTS'
  | 'BRANCH_OCCUPIED'
  | 'COMMAND_FAILED'
  | 'DETACHED_HEAD'
  | 'EMPTY_COMMIT_MESSAGE'
  | 'INVALID_BRANCH_NAME'
  | 'INVALID_COMMAND_OUTPUT'
  | 'INVALID_START_REF'
  | 'INVALID_TASK_ID'
  | 'NO_STAGED_CHANGES'
  | 'NOT_GIT_REPOSITORY'
  | 'REMOTE_UNAVAILABLE'
  | 'TARGET_EXISTS'
  | 'UPSTREAM_UNAVAILABLE';

export type GitBranchSummary = {
  name: string;
  fullRef: string;
  head: string;
  kind: 'local' | 'remote';
  current: boolean;
  upstream: string | null;
  upstreamTrack: string | null;
  checkedOutAt: string | null;
};

export type GitWorktreeSummary = {
  path: string;
  head: string;
  branch: string | null;
  branchRef: string | null;
  detached: boolean;
  bare: boolean;
  lockedReason: string | null;
  prunableReason: string | null;
};

export type GitPullRequestContext =
  | {
      status: 'available';
      number: number;
      title: string;
      url: string;
      state: string;
      isDraft: boolean;
      headRefName: string;
      baseRefName: string;
    }
  | {
      status: 'unavailable';
      reason: 'detached_head' | 'gh_command_failed' | 'gh_not_found' | 'invalid_response' | 'no_current_pull_request';
      detail?: string;
    };

export type GitWorkspaceInspectRequest = {
  cwd: string;
};

export type GitWorkspaceInspection = {
  cwd: string;
  root: string;
  head: string;
  currentBranch: string | null;
  dirty: boolean;
  staged: boolean;
  branches: GitBranchSummary[];
  worktrees: GitWorktreeSummary[];
  pullRequest: GitPullRequestContext;
};

export type GitSourceChangeSummary = {
  staged: boolean;
  unstaged: boolean;
  unmerged: boolean;
  untrackedCount: number;
};

export type GitIgnoredFileCopyReceipt = {
  policy: 'worktreeinclude_and_agents_override_only';
  copied: string[];
  skippedExisting: string[];
  skippedSymlinks: string[];
};

export type GitManagedWorktreeHandoffReceipt =
  | {
      status: 'applied' | 'not_needed';
      source: GitSourceChangeSummary;
      ignoredFiles: GitIgnoredFileCopyReceipt;
    }
  | {
      status: 'not_run';
      reason: 'existing_task_worktree';
      source: GitSourceChangeSummary;
    }
  | {
      status: 'unsupported';
      reason:
        | 'existing_worktree_handoff_requires_coordinator'
        | 'selected_ref_differs_from_local_head'
        | 'unpatchable_tracked_changes'
        | 'unmerged_changes';
      detail: string;
      source: GitSourceChangeSummary;
    };

export type GitManagedWorktreeRequest = {
  repositoryPath: string;
  taskId: string;
  startRef: string;
  newBranch?: string;
};

export type GitWorkspaceHandoffMetadata = {
  schema: 'opl_workspace_handoff.v1';
  locality: 'local' | 'worktree';
  localWorkspace: string;
  worktreePath: string;
  taskId: string;
  startRef: string;
  startCommit: string;
  worktreeRetention: 'preserve_for_reuse_until_snapshotted_cleanup';
};

type GitManagedWorktreeResultBase = {
  repositoryRoot: string;
  targetPath: string;
  startRef: string;
  startCommit: string;
};

export type GitManagedWorktreeResult =
  | (GitManagedWorktreeResultBase & {
      status: 'created';
      worktree: GitWorktreeSummary;
      handoff: Extract<GitManagedWorktreeHandoffReceipt, { status: 'applied' | 'not_needed' }>;
    })
  | (GitManagedWorktreeResultBase & {
      status: 'reused';
      worktree: GitWorktreeSummary;
      handoff: Extract<GitManagedWorktreeHandoffReceipt, { status: 'not_run' }>;
    })
  | (GitManagedWorktreeResultBase & {
      status: 'unsupported';
      worktree: GitWorktreeSummary | null;
      handoff: Extract<GitManagedWorktreeHandoffReceipt, { status: 'unsupported' }>;
    });

export type GitCommitStagedRequest = {
  cwd: string;
  message: string;
};

export type GitCommitStagedResult = {
  root: string;
  branch: string | null;
  commitSha: string;
};

export type GitPushCurrentBranchRequest = {
  cwd: string;
};

export type GitPushCurrentBranchResult = {
  root: string;
  branch: string;
  remote: string;
  upstream: string;
};
