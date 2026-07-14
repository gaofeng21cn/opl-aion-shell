/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type {
  GitCommitStagedRequest,
  GitCommitStagedResult,
  GitManagedWorktreeCleanupRequest,
  GitManagedWorktreeCleanupResult,
  GitManagedWorktreeRequest,
  GitManagedWorktreeRestoreRequest,
  GitManagedWorktreeRestoreResult,
  GitManagedWorktreeResult,
  GitPushCurrentBranchRequest,
  GitPushCurrentBranchResult,
  GitWorkspaceInspectRequest,
  GitWorkspaceInspection,
} from '@/common/types/platform/gitWorkspace';
import { GitWorkspaceAdapter } from './GitWorkspaceAdapter';

export type GitWorkspacePort = {
  inspect: (request: GitWorkspaceInspectRequest) => Promise<GitWorkspaceInspection>;
  ensureManagedWorktree: (request: GitManagedWorktreeRequest) => Promise<GitManagedWorktreeResult>;
  cleanupManagedWorktree: (request: GitManagedWorktreeCleanupRequest) => Promise<GitManagedWorktreeCleanupResult>;
  restoreManagedWorktree: (request: GitManagedWorktreeRestoreRequest) => Promise<GitManagedWorktreeRestoreResult>;
  commitStaged: (request: GitCommitStagedRequest) => Promise<GitCommitStagedResult>;
  pushCurrentBranch: (request: GitPushCurrentBranchRequest) => Promise<GitPushCurrentBranchResult>;
};

type Provider<Data, Params> = {
  provider: (handler: (params: Params) => Promise<Data>) => void;
};

export type GitWorkspaceBridgeApi = {
  inspect: Provider<GitWorkspaceInspection, GitWorkspaceInspectRequest>;
  ensureManagedWorktree: Provider<GitManagedWorktreeResult, GitManagedWorktreeRequest>;
  cleanupManagedWorktree: Provider<GitManagedWorktreeCleanupResult, GitManagedWorktreeCleanupRequest>;
  restoreManagedWorktree: Provider<GitManagedWorktreeRestoreResult, GitManagedWorktreeRestoreRequest>;
  commitStaged: Provider<GitCommitStagedResult, GitCommitStagedRequest>;
  pushCurrentBranch: Provider<GitPushCurrentBranchResult, GitPushCurrentBranchRequest>;
};

export function initGitWorkspaceBridge(
  port: GitWorkspacePort = new GitWorkspaceAdapter(),
  api: GitWorkspaceBridgeApi = ipcBridge.gitWorkspace
): void {
  api.inspect.provider((request) => port.inspect(request));
  api.ensureManagedWorktree.provider((request) => port.ensureManagedWorktree(request));
  api.cleanupManagedWorktree.provider((request) => port.cleanupManagedWorktree(request));
  api.restoreManagedWorktree.provider((request) => port.restoreManagedWorktree(request));
  api.commitStaged.provider((request) => port.commitStaged(request));
  api.pushCurrentBranch.provider((request) => port.pushCurrentBranch(request));
}

export {
  GitWorkspaceAdapter,
  type GitWorkspaceAdapterOptions,
  type GitWorktreeCreatePrimitiveRequest,
  type GitWorktreeCreatePrimitiveResult,
} from './GitWorkspaceAdapter';
export {
  CommandExecutionError,
  GitWorkspaceAdapterError,
  execFileCommand,
  type CommandResult,
  type CommandRunner,
  type CommandRunnerOptions,
} from './commandRunner';
