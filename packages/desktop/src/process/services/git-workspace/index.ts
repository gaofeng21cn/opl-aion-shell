/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type {
  GitCommitStagedRequest,
  GitCommitStagedResult,
  GitPushCurrentBranchRequest,
  GitPushCurrentBranchResult,
  GitWorkspaceInspectRequest,
  GitWorkspaceInspection,
} from '@/common/types/platform/gitWorkspace';
import { GitWorkspaceAdapter } from './GitWorkspaceAdapter';

export type GitWorkspacePort = {
  inspect: (request: GitWorkspaceInspectRequest) => Promise<GitWorkspaceInspection>;
  commitStaged: (request: GitCommitStagedRequest) => Promise<GitCommitStagedResult>;
  pushCurrentBranch: (request: GitPushCurrentBranchRequest) => Promise<GitPushCurrentBranchResult>;
};

type Provider<Data, Params> = {
  provider: (handler: (params: Params) => Promise<Data>) => void;
};

export type GitWorkspaceBridgeApi = {
  inspect: Provider<GitWorkspaceInspection, GitWorkspaceInspectRequest>;
  commitStaged: Provider<GitCommitStagedResult, GitCommitStagedRequest>;
  pushCurrentBranch: Provider<GitPushCurrentBranchResult, GitPushCurrentBranchRequest>;
};

export function initGitWorkspaceBridge(
  port: GitWorkspacePort = new GitWorkspaceAdapter(),
  api: GitWorkspaceBridgeApi = ipcBridge.gitWorkspace
): void {
  api.inspect.provider((request) => port.inspect(request));
  api.commitStaged.provider((request) => port.commitStaged(request));
  api.pushCurrentBranch.provider((request) => port.pushCurrentBranch(request));
}

export { GitWorkspaceAdapter, type GitWorkspaceAdapterOptions } from './GitWorkspaceAdapter';
export {
  CommandExecutionError,
  GitWorkspaceAdapterError,
  execFileCommand,
  type CommandResult,
  type CommandRunner,
  type CommandRunnerOptions,
} from './commandRunner';
