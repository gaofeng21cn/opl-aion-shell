/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import type {
  GitCommitStagedRequest,
  GitCommitStagedResult,
  GitPullRequestContext,
  GitPushCurrentBranchRequest,
  GitPushCurrentBranchResult,
  GitWorkspaceInspectRequest,
  GitWorkspaceInspection,
  GitWorktreeSummary,
} from '@/common/types/platform/gitWorkspace';
import {
  CommandExecutionError,
  GitWorkspaceAdapterError,
  MUTATION_COMMAND_TIMEOUT_MS,
  commandErrorDetail,
  execFileCommand,
  type CommandResult,
  type CommandRunner,
  type CommandRunnerOptions,
} from './commandRunner';
import { parseBranches, parsePullRequest, parseWorktrees } from './gitWorkspaceParsers';

export type GitWorkspaceAdapterOptions = {
  commandRunner?: CommandRunner;
};

export class GitWorkspaceAdapter {
  private readonly commandRunner: CommandRunner;

  constructor(options: GitWorkspaceAdapterOptions = {}) {
    this.commandRunner = options.commandRunner ?? execFileCommand;
  }

  async inspect({ cwd }: GitWorkspaceInspectRequest): Promise<GitWorkspaceInspection> {
    const root = await this.resolveRepository(cwd);
    const [head, currentBranch, status, stagedResult, worktrees, branchOutput] = await Promise.all([
      this.readHead(root),
      this.readCurrentBranch(root),
      this.git(['-C', root, 'status', '--porcelain=v1', '-z', '--untracked-files=all'], {}, 'read status'),
      this.git(
        ['-C', root, 'diff', '--cached', '--quiet', '--exit-code', '--'],
        { allowExitCodes: [1] },
        'read staged changes'
      ),
      this.readWorktrees(root),
      this.git(
        [
          '-C',
          root,
          'for-each-ref',
          '--format=%(refname)%00%(refname:short)%00%(objectname)%00%(upstream:short)%00%(upstream:trackshort)%00%(symref)',
          'refs/heads',
          'refs/remotes',
        ],
        {},
        'list branches'
      ),
    ]);

    return {
      cwd,
      root,
      head,
      currentBranch,
      dirty: status.stdout.length > 0,
      staged: stagedResult.exitCode === 1,
      branches: parseBranches(branchOutput.stdout, currentBranch, worktrees),
      worktrees,
      pullRequest: await this.readPullRequest(root, currentBranch),
    };
  }

  async commitStaged({ cwd, message }: GitCommitStagedRequest): Promise<GitCommitStagedResult> {
    const commitMessage = message.trim();
    if (!commitMessage) {
      throw new GitWorkspaceAdapterError('EMPTY_COMMIT_MESSAGE', 'Commit message must not be empty.');
    }
    const root = await this.resolveRepository(cwd);
    if (!(await this.hasStagedChanges(root))) {
      throw new GitWorkspaceAdapterError('NO_STAGED_CHANGES', 'There are no staged changes to commit.');
    }
    await this.git(
      ['-C', root, 'commit', '-m', commitMessage],
      { timeoutMs: MUTATION_COMMAND_TIMEOUT_MS },
      'commit staged changes'
    );
    return {
      root,
      branch: await this.readCurrentBranch(root),
      commitSha: await this.readHead(root),
    };
  }

  async pushCurrentBranch({ cwd }: GitPushCurrentBranchRequest): Promise<GitPushCurrentBranchResult> {
    const root = await this.resolveRepository(cwd);
    const branch = await this.readCurrentBranch(root);
    if (!branch) {
      throw new GitWorkspaceAdapterError('DETACHED_HEAD', 'Cannot push because the worktree has a detached HEAD.');
    }

    const [remoteResult, mergeResult] = await Promise.all([
      this.git(
        ['-C', root, 'config', '--get', `branch.${branch}.remote`],
        { allowExitCodes: [1] },
        'read branch remote'
      ),
      this.git(
        ['-C', root, 'config', '--get', `branch.${branch}.merge`],
        { allowExitCodes: [1] },
        'read branch merge ref'
      ),
    ]);
    const remote = remoteResult.stdout.trim();
    const remoteRef = mergeResult.stdout.trim();
    if (remoteResult.exitCode !== 0 || mergeResult.exitCode !== 0 || !remote || !remoteRef.startsWith('refs/heads/')) {
      throw new GitWorkspaceAdapterError(
        'UPSTREAM_UNAVAILABLE',
        `Current branch "${branch}" has no configured upstream.`
      );
    }

    try {
      await this.commandRunner('git', ['-C', root, 'remote', 'get-url', remote]);
    } catch (error) {
      const detail = commandErrorDetail(error);
      throw new GitWorkspaceAdapterError('REMOTE_UNAVAILABLE', `Configured remote "${remote}" is unavailable.`, detail);
    }

    await this.git(
      ['-C', root, 'push', remote, `HEAD:${remoteRef}`],
      { timeoutMs: MUTATION_COMMAND_TIMEOUT_MS },
      'push current branch'
    );
    const upstream = `${remote}/${remoteRef.slice('refs/heads/'.length)}`;
    return { root, branch, remote, upstream };
  }

  private async hasStagedChanges(repositoryRoot: string): Promise<boolean> {
    const result = await this.git(
      ['-C', repositoryRoot, 'diff', '--cached', '--quiet', '--exit-code', '--'],
      { allowExitCodes: [1] },
      'read staged changes'
    );
    return result.exitCode === 1;
  }

  private async readWorktrees(repositoryRoot: string): Promise<GitWorktreeSummary[]> {
    const result = await this.git(
      ['-C', repositoryRoot, 'worktree', 'list', '--porcelain', '-z'],
      {},
      'list worktrees'
    );
    return parseWorktrees(result.stdout);
  }

  private async readHead(repositoryRoot: string): Promise<string> {
    const result = await this.git(['-C', repositoryRoot, 'rev-parse', 'HEAD'], {}, 'read HEAD');
    const head = result.stdout.trim();
    if (!/^[0-9a-f]{40,64}$/i.test(head)) {
      throw new GitWorkspaceAdapterError('INVALID_COMMAND_OUTPUT', 'Git returned an invalid HEAD commit.');
    }
    return head;
  }

  private async readCurrentBranch(repositoryRoot: string): Promise<string | null> {
    const result = await this.git(
      ['-C', repositoryRoot, 'symbolic-ref', '--quiet', '--short', 'HEAD'],
      { allowExitCodes: [1] },
      'read current branch'
    );
    return result.exitCode === 0 ? result.stdout.trim() || null : null;
  }

  private async resolveRepository(cwd: string): Promise<string> {
    this.assertAbsolutePath(cwd, 'Git cwd');
    try {
      const result = await this.commandRunner('git', ['-C', cwd, 'rev-parse', '--show-toplevel']);
      const root = result.stdout.trim();
      if (!path.isAbsolute(root)) {
        throw new GitWorkspaceAdapterError('INVALID_COMMAND_OUTPUT', 'Git returned a non-absolute repository root.');
      }
      return root;
    } catch (error) {
      if (error instanceof GitWorkspaceAdapterError) throw error;
      if (error instanceof CommandExecutionError && error.systemCode === 'ENOENT') {
        throw new GitWorkspaceAdapterError('COMMAND_FAILED', 'Git executable is unavailable.');
      }
      throw new GitWorkspaceAdapterError(
        'NOT_GIT_REPOSITORY',
        'The requested path is not inside a Git worktree.',
        commandErrorDetail(error)
      );
    }
  }

  private async readPullRequest(repositoryRoot: string, currentBranch: string | null): Promise<GitPullRequestContext> {
    try {
      await this.commandRunner('gh', ['--version'], { timeoutMs: 5_000 });
    } catch (error) {
      if (error instanceof CommandExecutionError && error.systemCode === 'ENOENT') {
        return { status: 'unavailable', reason: 'gh_not_found' };
      }
      return {
        status: 'unavailable',
        reason: 'gh_command_failed',
        detail: commandErrorDetail(error),
      };
    }
    if (!currentBranch) return { status: 'unavailable', reason: 'detached_head' };

    try {
      const result = await this.commandRunner(
        'gh',
        ['pr', 'view', '--json', 'baseRefName,headRefName,isDraft,number,state,title,url'],
        { cwd: repositoryRoot, timeoutMs: 10_000 }
      );
      return parsePullRequest(result.stdout);
    } catch (error) {
      const detail = commandErrorDetail(error);
      const normalized = detail?.toLowerCase() ?? '';
      if (
        normalized.includes('no pull request') ||
        normalized.includes('no pull requests') ||
        normalized.includes('could not resolve to a pull request')
      ) {
        return { status: 'unavailable', reason: 'no_current_pull_request', detail };
      }
      return { status: 'unavailable', reason: 'gh_command_failed', detail };
    }
  }

  private async git(args: string[], options: CommandRunnerOptions, operation: string): Promise<CommandResult> {
    try {
      return await this.commandRunner('git', args, options);
    } catch (error) {
      throw new GitWorkspaceAdapterError('COMMAND_FAILED', `Failed to ${operation}.`, commandErrorDetail(error));
    }
  }

  private assertAbsolutePath(value: string, label: string): void {
    if (!path.isAbsolute(value)) {
      throw new GitWorkspaceAdapterError('ABSOLUTE_PATH_REQUIRED', `${label} must be an absolute path.`, value);
    }
  }
}
