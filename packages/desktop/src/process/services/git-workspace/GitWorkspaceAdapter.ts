/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';
import type { Stats } from 'node:fs';
import { lstat, mkdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type {
  GitCommitStagedRequest,
  GitCommitStagedResult,
  GitManagedWorktreeRequest,
  GitManagedWorktreeResult,
  GitPullRequestContext,
  GitPushCurrentBranchRequest,
  GitPushCurrentBranchResult,
  GitSourceChangeSummary,
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
import { parseBranches, parsePullRequest, parseWorktrees, splitNul } from './gitWorkspaceParsers';
import { copyIgnoredSetupFiles } from './ignoredFileCopier';

export type GitWorktreeCreatePrimitiveRequest = {
  repositoryPath: string;
  targetPath: string;
  startRef: string;
  newBranch?: string;
};

export type GitWorktreeCreatePrimitiveResult = {
  repositoryRoot: string;
  startCommit: string;
  worktree: GitWorktreeSummary;
};

export type GitWorkspaceAdapterOptions = {
  commandRunner?: CommandRunner;
  codexHome?: string;
  worktreeRoot?: string;
};

type SourceSnapshot = {
  summary: GitSourceChangeSummary;
  stagedPatch: string;
  unstagedPatch: string;
};

export class GitWorkspaceAdapter {
  private readonly commandRunner: CommandRunner;
  private readonly managedWorktreeRoot: string;

  constructor(options: GitWorkspaceAdapterOptions = {}) {
    this.commandRunner = options.commandRunner ?? execFileCommand;
    const codexHome = options.codexHome ?? process.env.CODEX_HOME ?? path.join(homedir(), '.codex');
    this.managedWorktreeRoot = options.worktreeRoot ?? path.join(codexHome, 'worktrees');
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

  async ensureManagedWorktree(request: GitManagedWorktreeRequest): Promise<GitManagedWorktreeResult> {
    const taskId = this.normalizeTaskId(request.taskId);
    this.assertAbsolutePath(this.managedWorktreeRoot, 'Managed worktree root');

    const repositoryRoot = await this.resolveRepository(request.repositoryPath);
    const startCommit = await this.resolveStartCommit(repositoryRoot, request.startRef);
    const targetPath = this.deriveManagedWorktreePath(repositoryRoot, taskId);
    const [source, worktrees, targetExists] = await Promise.all([
      this.readSourceSnapshot(repositoryRoot, false),
      this.readWorktrees(repositoryRoot),
      this.pathExists(targetPath),
    ]);
    const existingWorktree = await this.findWorktreeByPath(worktrees, targetPath);

    if (targetExists || existingWorktree) {
      if (!targetExists || !existingWorktree) {
        throw new GitWorkspaceAdapterError(
          'TARGET_EXISTS',
          'The managed worktree target is already occupied by an unrelated or stale path.',
          targetPath
        );
      }
      const liveWorktree = await this.readLiveWorktree(existingWorktree);
      this.assertReusableWorktree(liveWorktree, startCommit, request.newBranch);
      if (source.summary.unmerged || source.summary.staged || source.summary.unstaged) {
        return {
          status: 'unsupported',
          repositoryRoot,
          targetPath,
          startRef: request.startRef,
          startCommit,
          worktree: liveWorktree,
          handoff: {
            status: 'unsupported',
            reason: 'existing_worktree_handoff_requires_coordinator',
            detail: 'Moving new tracked changes into an existing task worktree requires coordinator handoff.',
            source: source.summary,
          },
        };
      }
      return {
        status: 'reused',
        repositoryRoot,
        targetPath,
        startRef: request.startRef,
        startCommit,
        worktree: liveWorktree,
        handoff: {
          status: 'not_run',
          reason: 'existing_task_worktree',
          source: source.summary,
        },
      };
    }

    if (source.summary.unmerged) {
      return this.unsupportedManagedResult(
        repositoryRoot,
        targetPath,
        request.startRef,
        startCommit,
        source.summary,
        'unmerged_changes',
        'Unmerged local changes cannot be copied safely.'
      );
    }

    if ((source.summary.staged || source.summary.unstaged) && (await this.readHead(repositoryRoot)) !== startCommit) {
      return this.unsupportedManagedResult(
        repositoryRoot,
        targetPath,
        request.startRef,
        startCommit,
        source.summary,
        'selected_ref_differs_from_local_head',
        'Tracked local changes can only be copied when the selected ref resolves to the local checkout HEAD.'
      );
    }

    const snapshot = await this.readSourceSnapshot(repositoryRoot, true);
    if (snapshot.summary.unmerged) {
      return this.unsupportedManagedResult(
        repositoryRoot,
        targetPath,
        request.startRef,
        startCommit,
        snapshot.summary,
        'unmerged_changes',
        'Unmerged local changes cannot be copied safely.'
      );
    }
    if (
      (snapshot.summary.staged || snapshot.summary.unstaged) &&
      (await this.readHead(repositoryRoot)) !== startCommit
    ) {
      return this.unsupportedManagedResult(
        repositoryRoot,
        targetPath,
        request.startRef,
        startCommit,
        snapshot.summary,
        'selected_ref_differs_from_local_head',
        'Tracked local changes can only be copied when the selected ref resolves to the local checkout HEAD.'
      );
    }
    if ((snapshot.summary.staged && !snapshot.stagedPatch) || (snapshot.summary.unstaged && !snapshot.unstagedPatch)) {
      return this.unsupportedManagedResult(
        repositoryRoot,
        targetPath,
        request.startRef,
        startCommit,
        snapshot.summary,
        'unpatchable_tracked_changes',
        'Git reported tracked changes but did not produce a patch that can be handed off safely.'
      );
    }
    let created: GitWorktreeSummary | null = null;
    try {
      created = await this.createWorktreeAtCommit(repositoryRoot, targetPath, startCommit, request.newBranch);
      if (snapshot.stagedPatch) {
        await this.git(
          ['-C', targetPath, 'apply', '--binary', '--index', '--whitespace=nowarn', '-'],
          { input: snapshot.stagedPatch, timeoutMs: MUTATION_COMMAND_TIMEOUT_MS },
          'apply staged changes'
        );
      }
      if (snapshot.unstagedPatch) {
        await this.git(
          ['-C', targetPath, 'apply', '--binary', '--whitespace=nowarn', '-'],
          { input: snapshot.unstagedPatch, timeoutMs: MUTATION_COMMAND_TIMEOUT_MS },
          'apply unstaged changes'
        );
      }
      const ignoredFiles = await copyIgnoredSetupFiles(repositoryRoot, targetPath, (args, options, operation) =>
        this.git(args, options, operation)
      );
      const applied = Boolean(snapshot.stagedPatch || snapshot.unstagedPatch || ignoredFiles.copied.length);
      return {
        status: 'created',
        repositoryRoot,
        targetPath,
        startRef: request.startRef,
        startCommit,
        worktree: created,
        handoff: {
          status: applied ? 'applied' : 'not_needed',
          source: snapshot.summary,
          ignoredFiles,
        },
      };
    } catch (error) {
      if (created) {
        await this.rollbackCreatedWorktree(repositoryRoot, targetPath, request.newBranch, error);
      }
      throw error;
    }
  }

  async createWorktreePrimitive(request: GitWorktreeCreatePrimitiveRequest): Promise<GitWorktreeCreatePrimitiveResult> {
    const repositoryRoot = await this.resolveRepository(request.repositoryPath);
    const startCommit = await this.resolveStartCommit(repositoryRoot, request.startRef);
    const worktree = await this.createWorktreeAtCommit(
      repositoryRoot,
      request.targetPath,
      startCommit,
      request.newBranch
    );
    return { repositoryRoot, startCommit, worktree };
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

  private unsupportedManagedResult(
    repositoryRoot: string,
    targetPath: string,
    startRef: string,
    startCommit: string,
    source: GitSourceChangeSummary,
    reason: 'selected_ref_differs_from_local_head' | 'unmerged_changes' | 'unpatchable_tracked_changes',
    detail: string
  ): GitManagedWorktreeResult {
    return {
      status: 'unsupported',
      repositoryRoot,
      targetPath,
      startRef,
      startCommit,
      worktree: null,
      handoff: { status: 'unsupported', reason, detail, source },
    };
  }

  private normalizeTaskId(value: string): string {
    const taskId = value.trim();
    if (!taskId) {
      throw new GitWorkspaceAdapterError('INVALID_TASK_ID', 'A non-empty task id is required.');
    }
    return taskId;
  }

  private managedWorktreeIdentity(repositoryRoot: string, taskId: string): string {
    return createHash('sha256').update(repositoryRoot).update('\0').update(taskId).digest('hex').slice(0, 16);
  }

  private deriveManagedWorktreePath(repositoryRoot: string, taskId: string): string {
    const repositoryName = path.basename(repositoryRoot).replaceAll(/[^a-zA-Z0-9._-]+/g, '-') || 'repository';
    const identity = this.managedWorktreeIdentity(repositoryRoot, taskId);
    return path.join(this.managedWorktreeRoot, `${repositoryName}-${identity}`);
  }

  private async createWorktreeAtCommit(
    repositoryRoot: string,
    targetPath: string,
    startCommit: string,
    newBranch?: string
  ): Promise<GitWorktreeSummary> {
    this.assertAbsolutePath(targetPath, 'Worktree target');
    if (await this.pathExists(targetPath)) {
      throw new GitWorkspaceAdapterError('TARGET_EXISTS', 'Worktree target already exists.', targetPath);
    }
    const registered = await this.findWorktreeByPath(await this.readWorktrees(repositoryRoot), targetPath);
    if (registered) {
      throw new GitWorkspaceAdapterError('TARGET_EXISTS', 'Worktree target is already registered.', targetPath);
    }
    await this.validateNewBranch(repositoryRoot, newBranch);
    await mkdir(path.dirname(targetPath), { recursive: true });

    const args = ['-C', repositoryRoot, 'worktree', 'add'];
    if (newBranch) args.push('-b', newBranch);
    else args.push('--detach');
    args.push(targetPath, startCommit);

    let added = false;
    try {
      await this.git(args, { timeoutMs: MUTATION_COMMAND_TIMEOUT_MS }, 'create worktree');
      added = true;
      const worktree = await this.findWorktreeByPath(await this.readWorktrees(repositoryRoot), targetPath);
      if (!worktree) {
        throw new GitWorkspaceAdapterError('INVALID_COMMAND_OUTPUT', 'Created worktree was not reported by Git.');
      }
      return worktree;
    } catch (error) {
      if (!added && error instanceof GitWorkspaceAdapterError && error.detail?.includes('already used by worktree')) {
        throw new GitWorkspaceAdapterError('BRANCH_OCCUPIED', 'The requested branch is already used by a worktree.');
      }
      if (added) await this.rollbackCreatedWorktree(repositoryRoot, targetPath, newBranch, error);
      throw error;
    }
  }

  private async validateNewBranch(repositoryRoot: string, newBranch?: string): Promise<void> {
    if (!newBranch) return;
    const branch = newBranch.trim();
    if (!branch || branch !== newBranch) {
      throw new GitWorkspaceAdapterError('INVALID_BRANCH_NAME', 'New branch name is invalid.');
    }
    try {
      await this.commandRunner('git', ['check-ref-format', '--branch', branch]);
    } catch {
      throw new GitWorkspaceAdapterError('INVALID_BRANCH_NAME', `New branch name "${branch}" is invalid.`);
    }

    const existing = await this.git(
      ['-C', repositoryRoot, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`],
      { allowExitCodes: [1] },
      'check new branch'
    );
    if (existing.exitCode === 0) {
      const occupied = (await this.readWorktrees(repositoryRoot)).find(
        (worktree) => worktree.branchRef === `refs/heads/${branch}`
      );
      if (occupied) {
        throw new GitWorkspaceAdapterError(
          'BRANCH_OCCUPIED',
          `Branch "${branch}" is already used by another worktree.`,
          occupied.path
        );
      }
      throw new GitWorkspaceAdapterError('BRANCH_ALREADY_EXISTS', `Branch "${branch}" already exists.`);
    }
  }

  private async rollbackCreatedWorktree(
    repositoryRoot: string,
    targetPath: string,
    newBranch: string | undefined,
    originalError: unknown
  ): Promise<void> {
    try {
      await this.git(
        ['-C', repositoryRoot, 'worktree', 'remove', '--force', targetPath],
        { timeoutMs: MUTATION_COMMAND_TIMEOUT_MS },
        'roll back worktree'
      );
      if (newBranch) {
        await this.git(
          ['-C', repositoryRoot, 'branch', '-D', newBranch],
          { timeoutMs: MUTATION_COMMAND_TIMEOUT_MS },
          'roll back worktree branch'
        );
      }
    } catch (cleanupError) {
      const original = originalError instanceof Error ? originalError.message : String(originalError);
      const cleanup = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      throw new GitWorkspaceAdapterError(
        'COMMAND_FAILED',
        'Worktree operation failed and rollback was incomplete.',
        `${original}; rollback: ${cleanup}`
      );
    }
  }

  private async findWorktreeByPath(
    worktrees: GitWorktreeSummary[],
    targetPath: string
  ): Promise<GitWorktreeSummary | undefined> {
    const matches = await Promise.all(
      worktrees.map(async (worktree) => ({
        worktree,
        matches: await this.pathsReferToSameLocation(worktree.path, targetPath),
      }))
    );
    return matches.find((candidate) => candidate.matches)?.worktree;
  }

  private async pathsReferToSameLocation(left: string, right: string): Promise<boolean> {
    if (path.resolve(left) === path.resolve(right)) return true;
    try {
      const [canonicalLeft, canonicalRight] = await Promise.all([realpath(left), realpath(right)]);
      return canonicalLeft === canonicalRight;
    } catch {
      return false;
    }
  }

  private async readLiveWorktree(worktree: GitWorktreeSummary): Promise<GitWorktreeSummary> {
    const [head, branch] = await Promise.all([this.readHead(worktree.path), this.readCurrentBranch(worktree.path)]);
    return {
      ...worktree,
      head,
      branch,
      branchRef: branch ? `refs/heads/${branch}` : null,
      detached: branch === null,
    };
  }

  private assertReusableWorktree(
    worktree: GitWorktreeSummary,
    startCommit: string,
    newBranch: string | undefined
  ): void {
    const requestedBranch = newBranch || null;
    const requestedDetached = !newBranch;
    if (
      worktree.head === startCommit &&
      worktree.branch === requestedBranch &&
      worktree.detached === requestedDetached
    ) {
      return;
    }

    const expectedState = requestedBranch ? `branch=${requestedBranch}` : 'detached=true';
    const actualState = worktree.branch ? `branch=${worktree.branch}` : `detached=${worktree.detached}`;
    throw new GitWorkspaceAdapterError(
      'TARGET_EXISTS',
      'The managed worktree target does not match the requested starting state.',
      `path=${worktree.path}; expected HEAD=${startCommit}, ${expectedState}; actual HEAD=${worktree.head}, ${actualState}`
    );
  }

  private async readSourceSnapshot(repositoryRoot: string, includePatches: boolean): Promise<SourceSnapshot> {
    const [staged, unstaged, unmerged, untracked] = await Promise.all([
      this.git(
        ['-C', repositoryRoot, 'diff', '--cached', '--quiet', '--exit-code', '--'],
        { allowExitCodes: [1] },
        'read staged changes'
      ),
      this.git(
        ['-C', repositoryRoot, 'diff', '--quiet', '--exit-code', '--'],
        { allowExitCodes: [1] },
        'read unstaged changes'
      ),
      this.git(['-C', repositoryRoot, 'diff', '--name-only', '--diff-filter=U', '-z'], {}, 'read unmerged changes'),
      this.git(['-C', repositoryRoot, 'ls-files', '--others', '--exclude-standard', '-z'], {}, 'read untracked files'),
    ]);
    const summary: GitSourceChangeSummary = {
      staged: staged.exitCode === 1,
      unstaged: unstaged.exitCode === 1,
      unmerged: unmerged.stdout.length > 0,
      untrackedCount: splitNul(untracked.stdout).length,
    };
    if (!includePatches) return { summary, stagedPatch: '', unstagedPatch: '' };

    const [stagedPatch, unstagedPatch] = await Promise.all([
      summary.staged
        ? this.git(
            [
              '-C',
              repositoryRoot,
              'diff',
              '--cached',
              '--binary',
              '--full-index',
              '--no-ext-diff',
              '--no-textconv',
              'HEAD',
              '--',
            ],
            {},
            'capture staged changes'
          )
        : Promise.resolve({ stdout: '', stderr: '', exitCode: 0 }),
      summary.unstaged
        ? this.git(
            ['-C', repositoryRoot, 'diff', '--binary', '--full-index', '--no-ext-diff', '--no-textconv', '--'],
            {},
            'capture unstaged changes'
          )
        : Promise.resolve({ stdout: '', stderr: '', exitCode: 0 }),
    ]);
    return { summary, stagedPatch: stagedPatch.stdout, unstagedPatch: unstagedPatch.stdout };
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

  private async resolveStartCommit(repositoryRoot: string, startRef: string): Promise<string> {
    const ref = startRef.trim();
    if (!ref) {
      throw new GitWorkspaceAdapterError('INVALID_START_REF', 'Starting ref must not be empty.');
    }
    try {
      const result = await this.commandRunner('git', [
        '-C',
        repositoryRoot,
        'rev-parse',
        '--verify',
        '--end-of-options',
        `${ref}^{commit}`,
      ]);
      const commit = result.stdout.trim();
      if (!/^[0-9a-f]{40,64}$/i.test(commit)) throw new Error('invalid commit id');
      return commit;
    } catch (error) {
      throw new GitWorkspaceAdapterError(
        'INVALID_START_REF',
        `Starting ref "${ref}" does not resolve to a commit.`,
        commandErrorDetail(error)
      );
    }
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

  private async pathExists(candidate: string): Promise<boolean> {
    return Boolean(await this.tryLstat(candidate));
  }

  private async tryLstat(candidate: string): Promise<Stats | null> {
    try {
      return await lstat(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new GitWorkspaceAdapterError(
        'COMMAND_FAILED',
        `Failed to inspect path "${candidate}".`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
