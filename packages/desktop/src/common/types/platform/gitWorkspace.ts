/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type GitWorkspaceErrorCode =
  | 'ABSOLUTE_PATH_REQUIRED'
  | 'COMMAND_FAILED'
  | 'DETACHED_HEAD'
  | 'EMPTY_COMMIT_MESSAGE'
  | 'INVALID_COMMAND_OUTPUT'
  | 'NO_STAGED_CHANGES'
  | 'NOT_GIT_REPOSITORY'
  | 'REMOTE_UNAVAILABLE'
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
