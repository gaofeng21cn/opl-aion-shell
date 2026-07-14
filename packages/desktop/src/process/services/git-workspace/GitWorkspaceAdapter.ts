/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash, randomUUID } from 'node:crypto';
import type { Stats } from 'node:fs';
import { lstat, mkdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type {
  GitCommitStagedRequest,
  GitCommitStagedResult,
  GitManagedWorktreeCleanupRequest,
  GitManagedWorktreeCleanupResult,
  GitManagedWorktreeRequest,
  GitManagedWorktreeRestoreRequest,
  GitManagedWorktreeRestoreResult,
  GitManagedWorktreeResult,
  GitPullRequestContext,
  GitPushCurrentBranchRequest,
  GitPushCurrentBranchResult,
  GitSourceChangeSummary,
  GitWorkspaceInspectRequest,
  GitWorkspaceInspection,
  GitWorktreeSnapshotReceipt,
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

type RestoredWorktree = {
  createdBranch: boolean;
  worktree: GitWorktreeSummary;
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

  async cleanupManagedWorktree(request: GitManagedWorktreeCleanupRequest): Promise<GitManagedWorktreeCleanupResult> {
    const taskId = this.normalizeTaskId(request.taskId);
    const repositoryRoot = await this.resolveRepository(request.repositoryPath);
    await this.assertManagedWorktreePath(repositoryRoot, taskId, request.worktreePath);

    const worktree = await this.findWorktreeByPath(await this.readWorktrees(repositoryRoot), request.worktreePath);
    if (!worktree || !(await this.pathExists(request.worktreePath))) {
      throw new GitWorkspaceAdapterError(
        'MANAGED_WORKTREE_REQUIRED',
        'Cleanup is only available for an existing deterministic managed worktree.',
        request.worktreePath
      );
    }

    const liveWorktree = await this.readLiveWorktree(worktree);
    const snapshot = await this.createWorktreeSnapshot(repositoryRoot, taskId, liveWorktree, request.worktreePath);
    try {
      await this.git(
        ['-C', repositoryRoot, 'worktree', 'remove', '--force', request.worktreePath],
        { timeoutMs: MUTATION_COMMAND_TIMEOUT_MS },
        'remove managed worktree'
      );
      const [registered, targetExists] = await Promise.all([
        this.findWorktreeByPath(await this.readWorktrees(repositoryRoot), request.worktreePath),
        this.pathExists(request.worktreePath),
      ]);
      if (registered || targetExists) {
        throw new GitWorkspaceAdapterError(
          'WORKTREE_CLEANUP_FAILED',
          'Git did not completely remove the managed worktree.',
          request.worktreePath
        );
      }
    } catch (error) {
      try {
        await this.restoreSnapshotAfterCleanupFailure(repositoryRoot, snapshot);
      } catch (rollbackError) {
        throw new GitWorkspaceAdapterError(
          'WORKTREE_ROLLBACK_FAILED',
          'Managed worktree cleanup failed and the original state could not be restored.',
          `${commandErrorDetail(error) ?? String(error)}; rollback: ${commandErrorDetail(rollbackError) ?? String(rollbackError)}`
        );
      }
      throw new GitWorkspaceAdapterError(
        'WORKTREE_CLEANUP_FAILED',
        'Managed worktree cleanup failed; the original worktree state was restored.',
        commandErrorDetail(error)
      );
    }

    return {
      status: 'removed',
      repositoryRoot,
      worktreePath: request.worktreePath,
      snapshot,
    };
  }

  async restoreManagedWorktree(request: GitManagedWorktreeRestoreRequest): Promise<GitManagedWorktreeRestoreResult> {
    const repositoryRoot = await this.resolveRepository(request.repositoryPath);
    await this.validateSnapshotReceipt(repositoryRoot, request.snapshot);

    const restored = await this.restoreSnapshotAtPath(repositoryRoot, request.snapshot);
    return {
      status: 'restored',
      repositoryRoot,
      worktree: restored.worktree,
      snapshot: request.snapshot,
    };
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

  private async assertManagedWorktreePath(repositoryRoot: string, taskId: string, worktreePath: string): Promise<void> {
    this.assertAbsolutePath(worktreePath, 'Managed worktree path');
    const expectedPath = this.deriveManagedWorktreePath(repositoryRoot, taskId);
    if (!(await this.pathsReferToSameLocation(expectedPath, worktreePath))) {
      throw new GitWorkspaceAdapterError(
        'MANAGED_WORKTREE_REQUIRED',
        'The requested path is not the deterministic managed worktree for this task.',
        `expected=${expectedPath}; actual=${worktreePath}`
      );
    }
  }

  private async createWorktreeSnapshot(
    repositoryRoot: string,
    taskId: string,
    worktree: GitWorktreeSummary,
    receiptPath: string
  ): Promise<GitWorktreeSnapshotReceipt> {
    const [source, ignoredCount] = await Promise.all([
      this.readSourceSnapshot(worktree.path, false),
      this.readIgnoredFileCount(worktree.path),
    ]);
    if (source.summary.unmerged) {
      throw new GitWorkspaceAdapterError(
        'WORKTREE_SNAPSHOT_CONFLICT',
        'A worktree with unmerged paths cannot be snapshotted for cleanup.'
      );
    }

    const snapshotId = randomUUID();
    const createdAt = new Date().toISOString();
    const snapshotRef = `refs/opl/worktree-snapshots/${this.managedWorktreeIdentity(repositoryRoot, taskId)}/${snapshotId}`;
    const hasChanges =
      source.summary.staged || source.summary.unstaged || source.summary.untrackedCount > 0 || ignoredCount > 0;
    let snapshotObject = worktree.head;
    let snapshotKind: GitWorktreeSnapshotReceipt['snapshotKind'] = 'head';
    const receipt = (): GitWorktreeSnapshotReceipt => ({
      schema: 'opl_worktree_snapshot_receipt.v1',
      snapshotId,
      createdAt,
      repositoryRoot,
      taskId,
      worktreePath: receiptPath,
      head: worktree.head,
      branch: worktree.branch,
      branchRef: worktree.branchRef,
      detached: worktree.detached,
      staged: source.summary.staged,
      trackedUnstaged: source.summary.unstaged,
      untrackedCount: source.summary.untrackedCount,
      ignoredCount,
      snapshotKind,
      snapshotRef,
      snapshotObject,
    });

    if (hasChanges) {
      const previousStash = await this.readOptionalCommitRef(repositoryRoot, 'refs/stash');
      const message = `opl-worktree-snapshot:${snapshotId}`;
      try {
        await this.git(
          ['-C', worktree.path, 'stash', 'push', '--all', '--message', message],
          { timeoutMs: MUTATION_COMMAND_TIMEOUT_MS },
          'snapshot managed worktree'
        );
      } catch (error) {
        throw new GitWorkspaceAdapterError(
          'WORKTREE_SNAPSHOT_FAILED',
          'Git could not create a complete managed worktree snapshot.',
          commandErrorDetail(error)
        );
      }

      snapshotObject = await this.findStashObject(worktree.path, message);
      snapshotKind = 'stash';
      let safeToDetachStash = false;
      let originalStateRestored = false;
      try {
        await this.persistSnapshotReceiptRef(repositoryRoot, receipt());
        safeToDetachStash = true;
        const [residual, residualIgnoredCount] = await Promise.all([
          this.readSourceSnapshot(worktree.path, false),
          this.readIgnoredFileCount(worktree.path),
        ]);
        if (
          residual.summary.staged ||
          residual.summary.unstaged ||
          residual.summary.unmerged ||
          residual.summary.untrackedCount > 0 ||
          residualIgnoredCount > 0
        ) {
          await this.applySnapshotObject(worktree.path, snapshotObject);
          await this.verifySnapshotChanges(worktree.path, worktree, source.summary, ignoredCount);
          originalStateRestored = true;
          throw new GitWorkspaceAdapterError(
            'WORKTREE_SNAPSHOT_FAILED',
            'Git did not capture every required worktree change; the original state was restored.'
          );
        }
      } catch (error) {
        if (!originalStateRestored) {
          try {
            await this.applySnapshotObject(worktree.path, snapshotObject);
            await this.verifySnapshotChanges(worktree.path, worktree, source.summary, ignoredCount);
            safeToDetachStash = true;
          } catch (rollbackError) {
            throw new GitWorkspaceAdapterError(
              'WORKTREE_ROLLBACK_FAILED',
              'Snapshot persistence failed and the original worktree state could not be restored.',
              `${commandErrorDetail(error) ?? String(error)}; rollback: ${commandErrorDetail(rollbackError) ?? String(rollbackError)}`
            );
          }
        }
        throw new GitWorkspaceAdapterError(
          'WORKTREE_SNAPSHOT_FAILED',
          'Snapshot persistence failed; the original worktree state was restored.',
          commandErrorDetail(error)
        );
      } finally {
        if (safeToDetachStash) {
          await this.restorePreviousStashRef(repositoryRoot, previousStash, snapshotObject);
        }
      }
    } else {
      try {
        await this.persistSnapshotReceiptRef(repositoryRoot, receipt());
      } catch (error) {
        throw new GitWorkspaceAdapterError(
          'WORKTREE_SNAPSHOT_FAILED',
          'Git could not persist the clean managed worktree snapshot.',
          commandErrorDetail(error)
        );
      }
    }

    return receipt();
  }

  private async findStashObject(worktreePath: string, message: string): Promise<string> {
    const result = await this.git(
      ['-C', worktreePath, 'stash', 'list', '--format=%H%x00%gs', '-z'],
      {},
      'locate managed worktree snapshot'
    );
    const fields = splitNul(result.stdout);
    for (let index = 0; index + 1 < fields.length; index += 2) {
      const object = fields[index];
      const subject = fields[index + 1];
      if (subject.includes(message) && /^[0-9a-f]{40,64}$/i.test(object)) return object;
    }
    const top = await this.readOptionalCommitRef(worktreePath, 'refs/stash');
    if (top) {
      const body = await this.git(['-C', worktreePath, 'log', '-1', '--format=%B', top], {}, 'inspect snapshot stash');
      if (body.stdout.includes(message)) return top;
    }
    throw new GitWorkspaceAdapterError(
      'WORKTREE_ROLLBACK_FAILED',
      'Git cleaned the managed worktree but did not report the matching snapshot object.'
    );
  }

  private async restorePreviousStashRef(
    repositoryRoot: string,
    previousStash: string | null,
    snapshotObject: string
  ): Promise<void> {
    const args = previousStash
      ? ['-C', repositoryRoot, 'update-ref', 'refs/stash', previousStash, snapshotObject]
      : ['-C', repositoryRoot, 'update-ref', '-d', 'refs/stash', snapshotObject];
    try {
      await this.commandRunner('git', args, { timeoutMs: MUTATION_COMMAND_TIMEOUT_MS });
    } catch {
      // A concurrent stash owns refs/stash now. The dedicated snapshot ref is already durable.
    }
  }

  private async persistSnapshotReceiptRef(repositoryRoot: string, snapshot: GitWorktreeSnapshotReceipt): Promise<void> {
    const timestamp = Math.floor(Date.parse(snapshot.createdAt) / 1000);
    const tagPayload = [
      `object ${snapshot.snapshotObject}`,
      'type commit',
      `tag opl-worktree-snapshot-${snapshot.snapshotId}`,
      `tagger One Person Lab <opl-worktree-snapshot@local.invalid> ${timestamp} +0000`,
      '',
      JSON.stringify(snapshot),
      '',
    ].join('\n');
    const tag = await this.git(
      ['-C', repositoryRoot, 'mktag'],
      { input: tagPayload, timeoutMs: MUTATION_COMMAND_TIMEOUT_MS },
      'write managed worktree snapshot receipt'
    );
    const tagObject = tag.stdout.trim();
    if (!/^[0-9a-f]{40,64}$/i.test(tagObject)) {
      throw new GitWorkspaceAdapterError(
        'WORKTREE_SNAPSHOT_FAILED',
        'Git returned an invalid snapshot receipt object.'
      );
    }

    await this.git(
      ['-C', repositoryRoot, 'update-ref', snapshot.snapshotRef, tagObject, ''],
      { timeoutMs: MUTATION_COMMAND_TIMEOUT_MS },
      'persist managed worktree snapshot receipt'
    );
    const [persistedTag, persistedSnapshot, persistedObject] = await Promise.all([
      this.readOptionalObjectId(repositoryRoot, snapshot.snapshotRef),
      this.readPersistedSnapshotReceipt(repositoryRoot, snapshot.snapshotRef),
      this.readOptionalCommitRef(repositoryRoot, snapshot.snapshotRef),
    ]);
    if (
      persistedTag !== tagObject ||
      !persistedSnapshot ||
      !this.snapshotReceiptsEqual(persistedSnapshot, snapshot) ||
      persistedObject !== snapshot.snapshotObject
    ) {
      throw new GitWorkspaceAdapterError(
        'WORKTREE_SNAPSHOT_FAILED',
        'The durable Git snapshot receipt did not match the captured worktree state.'
      );
    }
  }

  private async readPersistedSnapshotReceipt(
    repositoryRoot: string,
    snapshotRef: string
  ): Promise<GitWorktreeSnapshotReceipt | null> {
    try {
      const tag = await this.git(
        ['-C', repositoryRoot, 'cat-file', 'tag', snapshotRef],
        {},
        'read managed worktree snapshot receipt'
      );
      const messageOffset = tag.stdout.indexOf('\n\n');
      if (messageOffset < 0) return null;
      const parsed: unknown = JSON.parse(tag.stdout.slice(messageOffset + 2).trim());
      return parsed && typeof parsed === 'object' ? (parsed as GitWorktreeSnapshotReceipt) : null;
    } catch {
      return null;
    }
  }

  private snapshotReceiptsEqual(left: GitWorktreeSnapshotReceipt, right: GitWorktreeSnapshotReceipt): boolean {
    return (
      left.schema === right.schema &&
      left.snapshotId === right.snapshotId &&
      left.createdAt === right.createdAt &&
      left.repositoryRoot === right.repositoryRoot &&
      left.taskId === right.taskId &&
      left.worktreePath === right.worktreePath &&
      left.head === right.head &&
      left.branch === right.branch &&
      left.branchRef === right.branchRef &&
      left.detached === right.detached &&
      left.staged === right.staged &&
      left.trackedUnstaged === right.trackedUnstaged &&
      left.untrackedCount === right.untrackedCount &&
      left.ignoredCount === right.ignoredCount &&
      left.snapshotKind === right.snapshotKind &&
      left.snapshotRef === right.snapshotRef &&
      left.snapshotObject === right.snapshotObject
    );
  }

  private async validateSnapshotReceipt(repositoryRoot: string, snapshot: GitWorktreeSnapshotReceipt): Promise<void> {
    const invalid = (detail: string): never => {
      throw new GitWorkspaceAdapterError(
        'INVALID_SNAPSHOT_RECEIPT',
        'The worktree snapshot receipt is invalid.',
        detail
      );
    };
    if (snapshot.schema !== 'opl_worktree_snapshot_receipt.v1') invalid('schema');
    if (!snapshot.snapshotId || snapshot.snapshotId !== snapshot.snapshotId.trim()) invalid('snapshotId');
    if (!snapshot.taskId || snapshot.taskId !== snapshot.taskId.trim()) invalid('taskId');
    if (!path.isAbsolute(snapshot.repositoryRoot) || !path.isAbsolute(snapshot.worktreePath)) invalid('path');
    if (!(await this.pathsReferToSameLocation(repositoryRoot, snapshot.repositoryRoot))) invalid('repositoryRoot');
    await this.assertManagedWorktreePath(repositoryRoot, snapshot.taskId, snapshot.worktreePath);
    if (!/^[0-9a-f]{40,64}$/i.test(snapshot.head) || !/^[0-9a-f]{40,64}$/i.test(snapshot.snapshotObject)) {
      invalid('commit');
    }
    if (Number.isNaN(Date.parse(snapshot.createdAt))) invalid('createdAt');
    if (!Number.isInteger(snapshot.untrackedCount) || snapshot.untrackedCount < 0) invalid('untrackedCount');
    if (!Number.isInteger(snapshot.ignoredCount) || snapshot.ignoredCount < 0) invalid('ignoredCount');
    if (snapshot.branch === null) {
      if (!snapshot.detached || snapshot.branchRef !== null) invalid('detached');
    } else if (snapshot.detached || snapshot.branchRef !== `refs/heads/${snapshot.branch}`) {
      invalid('branch');
    }

    const expectedPrefix = `refs/opl/worktree-snapshots/${this.managedWorktreeIdentity(repositoryRoot, snapshot.taskId)}/`;
    if (snapshot.snapshotRef !== `${expectedPrefix}${snapshot.snapshotId}`) invalid('snapshotRef');
    const [persistedReceipt, persistedObject] = await Promise.all([
      this.readPersistedSnapshotReceipt(repositoryRoot, snapshot.snapshotRef),
      this.readOptionalCommitRef(repositoryRoot, snapshot.snapshotRef),
    ]);
    if (!persistedReceipt || !this.snapshotReceiptsEqual(persistedReceipt, snapshot)) invalid('persisted receipt');
    if (persistedObject !== snapshot.snapshotObject) invalid('snapshotObject');

    const hasChanges =
      snapshot.staged || snapshot.trackedUnstaged || snapshot.untrackedCount > 0 || snapshot.ignoredCount > 0;
    if (snapshot.snapshotKind === 'head') {
      if (hasChanges || snapshot.snapshotObject !== snapshot.head) invalid('clean snapshot');
      return;
    }
    if (snapshot.snapshotKind !== 'stash' || !hasChanges) invalid('stash snapshot');
    const firstParent = await this.readRequiredCommit(repositoryRoot, `${snapshot.snapshotObject}^1`);
    if (firstParent !== snapshot.head) invalid('stash parent');
    await this.readRequiredCommit(repositoryRoot, `${snapshot.snapshotObject}^2`);
    if (snapshot.untrackedCount > 0 || snapshot.ignoredCount > 0) {
      await this.readRequiredCommit(repositoryRoot, `${snapshot.snapshotObject}^3`);
    }
  }

  private async restoreSnapshotAtPath(
    repositoryRoot: string,
    snapshot: GitWorktreeSnapshotReceipt
  ): Promise<RestoredWorktree> {
    const [registered, targetExists] = await Promise.all([
      this.findWorktreeByPath(await this.readWorktrees(repositoryRoot), snapshot.worktreePath),
      this.pathExists(snapshot.worktreePath),
    ]);
    if (registered || targetExists) {
      throw new GitWorkspaceAdapterError(
        'WORKTREE_RESTORE_CONFLICT',
        'The snapshot path is already occupied and cannot be restored automatically.',
        snapshot.worktreePath
      );
    }

    let restored: RestoredWorktree | null = null;
    try {
      restored = await this.createWorktreeFromSnapshot(repositoryRoot, snapshot);
      await this.applySnapshotReceipt(snapshot);
      const worktree = await this.verifySnapshotReceiptState(snapshot);
      return { ...restored, worktree };
    } catch (error) {
      if (restored) {
        try {
          await this.rollbackRestoredWorktree(
            repositoryRoot,
            snapshot.worktreePath,
            snapshot.branch,
            restored.createdBranch
          );
        } catch (rollbackError) {
          throw new GitWorkspaceAdapterError(
            'WORKTREE_ROLLBACK_FAILED',
            'Worktree restore failed and its partial checkout could not be removed.',
            `${commandErrorDetail(error) ?? String(error)}; rollback: ${commandErrorDetail(rollbackError) ?? String(rollbackError)}`
          );
        }
      }
      if (error instanceof GitWorkspaceAdapterError && error.code === 'WORKTREE_RESTORE_CONFLICT') throw error;
      throw new GitWorkspaceAdapterError(
        'WORKTREE_RESTORE_CONFLICT',
        'The worktree snapshot could not be restored without conflicts.',
        commandErrorDetail(error)
      );
    }
  }

  private async createWorktreeFromSnapshot(
    repositoryRoot: string,
    snapshot: GitWorktreeSnapshotReceipt
  ): Promise<RestoredWorktree> {
    let createdBranch = false;
    const args = ['-C', repositoryRoot, 'worktree', 'add'];
    if (snapshot.branch) {
      const occupied = (await this.readWorktrees(repositoryRoot)).find(
        (worktree) => worktree.branchRef === snapshot.branchRef
      );
      if (occupied) {
        throw new GitWorkspaceAdapterError(
          'WORKTREE_RESTORE_CONFLICT',
          `Branch "${snapshot.branch}" is already used by another worktree.`,
          occupied.path
        );
      }
      const branchHead = await this.readOptionalCommitRef(repositoryRoot, snapshot.branchRef!);
      if (branchHead && branchHead !== snapshot.head) {
        throw new GitWorkspaceAdapterError(
          'WORKTREE_RESTORE_CONFLICT',
          `Branch "${snapshot.branch}" moved after the snapshot was created.`,
          `expected=${snapshot.head}; actual=${branchHead}`
        );
      }
      if (branchHead) args.push(snapshot.worktreePath, snapshot.branch);
      else {
        await this.validateBranchForRestore(snapshot.branch);
        args.push('-b', snapshot.branch, snapshot.worktreePath, snapshot.head);
        createdBranch = true;
      }
    } else {
      args.push('--detach', snapshot.worktreePath, snapshot.head);
    }

    let added = false;
    try {
      await this.git(args, { timeoutMs: MUTATION_COMMAND_TIMEOUT_MS }, 'restore managed worktree checkout');
      added = true;
      const worktree = await this.findWorktreeByPath(await this.readWorktrees(repositoryRoot), snapshot.worktreePath);
      if (!worktree) {
        throw new GitWorkspaceAdapterError(
          'WORKTREE_RESTORE_CONFLICT',
          'Git did not report the restored managed worktree.'
        );
      }
      return { createdBranch, worktree: await this.readLiveWorktree(worktree) };
    } catch (error) {
      if (added) {
        try {
          await this.rollbackRestoredWorktree(repositoryRoot, snapshot.worktreePath, snapshot.branch, createdBranch);
        } catch (rollbackError) {
          throw new GitWorkspaceAdapterError(
            'WORKTREE_ROLLBACK_FAILED',
            'Git created a partial restored worktree that could not be rolled back.',
            `${commandErrorDetail(error) ?? String(error)}; rollback: ${commandErrorDetail(rollbackError) ?? String(rollbackError)}`
          );
        }
      }
      throw error;
    }
  }

  private async validateBranchForRestore(branch: string): Promise<void> {
    try {
      await this.commandRunner('git', ['check-ref-format', '--branch', branch]);
    } catch {
      throw new GitWorkspaceAdapterError(
        'INVALID_SNAPSHOT_RECEIPT',
        'The snapshot branch name is no longer valid.',
        branch
      );
    }
  }

  private async applySnapshotReceipt(snapshot: GitWorktreeSnapshotReceipt): Promise<void> {
    if (snapshot.snapshotKind === 'stash') {
      await this.applySnapshotObject(snapshot.worktreePath, snapshot.snapshotObject);
    }
  }

  private async applySnapshotObject(worktreePath: string, snapshotObject: string): Promise<void> {
    await this.git(
      ['-C', worktreePath, 'stash', 'apply', '--index', snapshotObject],
      { timeoutMs: MUTATION_COMMAND_TIMEOUT_MS },
      'apply managed worktree snapshot'
    );
  }

  private async verifySnapshotReceiptState(snapshot: GitWorktreeSnapshotReceipt): Promise<GitWorktreeSummary> {
    const worktree = await this.findWorktreeByPath(
      await this.readWorktrees(snapshot.repositoryRoot),
      snapshot.worktreePath
    );
    if (!worktree) {
      throw new GitWorkspaceAdapterError(
        'WORKTREE_RESTORE_CONFLICT',
        'The restored worktree registration disappeared.'
      );
    }
    const liveWorktree = await this.readLiveWorktree(worktree);
    await this.verifySnapshotChanges(
      snapshot.worktreePath,
      liveWorktree,
      {
        staged: snapshot.staged,
        unstaged: snapshot.trackedUnstaged,
        unmerged: false,
        untrackedCount: snapshot.untrackedCount,
      },
      snapshot.ignoredCount
    );
    if (
      liveWorktree.head !== snapshot.head ||
      liveWorktree.branch !== snapshot.branch ||
      liveWorktree.detached !== snapshot.detached
    ) {
      throw new GitWorkspaceAdapterError(
        'WORKTREE_RESTORE_CONFLICT',
        'The restored worktree HEAD or branch does not match the snapshot receipt.'
      );
    }
    return { ...liveWorktree, path: snapshot.worktreePath };
  }

  private async verifySnapshotChanges(
    worktreePath: string,
    worktree: GitWorktreeSummary,
    expected: GitSourceChangeSummary,
    expectedIgnoredCount: number
  ): Promise<void> {
    const [snapshot, actualIgnoredCount] = await Promise.all([
      this.readSourceSnapshot(worktreePath, false),
      this.readIgnoredFileCount(worktreePath),
    ]);
    const actual = snapshot.summary;
    if (
      worktree.head !== (await this.readHead(worktreePath)) ||
      actual.staged !== expected.staged ||
      actual.unstaged !== expected.unstaged ||
      actual.unmerged !== expected.unmerged ||
      actual.untrackedCount !== expected.untrackedCount ||
      actualIgnoredCount !== expectedIgnoredCount
    ) {
      throw new GitWorkspaceAdapterError(
        'WORKTREE_RESTORE_CONFLICT',
        'The restored index or working tree does not match the snapshot receipt.'
      );
    }
  }

  private async restoreSnapshotAfterCleanupFailure(
    repositoryRoot: string,
    snapshot: GitWorktreeSnapshotReceipt
  ): Promise<void> {
    const [registered, targetExists] = await Promise.all([
      this.findWorktreeByPath(await this.readWorktrees(repositoryRoot), snapshot.worktreePath),
      this.pathExists(snapshot.worktreePath),
    ]);
    if (!registered && !targetExists) {
      await this.restoreSnapshotAtPath(repositoryRoot, snapshot);
      return;
    }
    if (!registered || !targetExists) {
      throw new GitWorkspaceAdapterError(
        'WORKTREE_ROLLBACK_FAILED',
        'Git left a partial managed worktree that cannot be restored automatically.',
        snapshot.worktreePath
      );
    }

    const liveWorktree = await this.readLiveWorktree(registered);
    if (
      liveWorktree.head !== snapshot.head ||
      liveWorktree.branch !== snapshot.branch ||
      liveWorktree.detached !== snapshot.detached
    ) {
      throw new GitWorkspaceAdapterError(
        'WORKTREE_ROLLBACK_FAILED',
        'The surviving managed worktree no longer matches the snapshot checkout.'
      );
    }
    await this.applySnapshotReceipt(snapshot);
    await this.verifySnapshotReceiptState(snapshot);
  }

  private async rollbackRestoredWorktree(
    repositoryRoot: string,
    worktreePath: string,
    branch: string | null,
    createdBranch: boolean
  ): Promise<void> {
    await this.git(
      ['-C', repositoryRoot, 'worktree', 'remove', '--force', worktreePath],
      { timeoutMs: MUTATION_COMMAND_TIMEOUT_MS },
      'roll back restored worktree'
    );
    if (createdBranch && branch) {
      await this.git(
        ['-C', repositoryRoot, 'branch', '-D', branch],
        { timeoutMs: MUTATION_COMMAND_TIMEOUT_MS },
        'roll back restored worktree branch'
      );
    }
  }

  private async readOptionalCommitRef(repositoryRoot: string, ref: string): Promise<string | null> {
    const result = await this.git(
      ['-C', repositoryRoot, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`],
      { allowExitCodes: [1] },
      'read Git ref'
    );
    if (result.exitCode === 1) return null;
    const commit = result.stdout.trim();
    if (!/^[0-9a-f]{40,64}$/i.test(commit)) {
      throw new GitWorkspaceAdapterError('INVALID_COMMAND_OUTPUT', 'Git returned an invalid commit object.');
    }
    return commit;
  }

  private async readOptionalObjectId(repositoryRoot: string, ref: string): Promise<string | null> {
    const result = await this.git(
      ['-C', repositoryRoot, 'rev-parse', '--verify', '--quiet', ref],
      { allowExitCodes: [1] },
      'read Git object'
    );
    if (result.exitCode === 1) return null;
    const objectId = result.stdout.trim();
    if (!/^[0-9a-f]{40,64}$/i.test(objectId)) {
      throw new GitWorkspaceAdapterError('INVALID_COMMAND_OUTPUT', 'Git returned an invalid object id.');
    }
    return objectId;
  }

  private async readRequiredCommit(repositoryRoot: string, ref: string): Promise<string> {
    const commit = await this.readOptionalCommitRef(repositoryRoot, ref);
    if (!commit) {
      throw new GitWorkspaceAdapterError(
        'INVALID_SNAPSHOT_RECEIPT',
        'The snapshot ref does not contain the required Git object.',
        ref
      );
    }
    return commit;
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

  private async readIgnoredFileCount(repositoryRoot: string): Promise<number> {
    const ignored = await this.git(
      ['-C', repositoryRoot, 'ls-files', '--others', '--ignored', '--exclude-standard', '-z'],
      {},
      'read ignored files'
    );
    return splitNul(ignored.stdout).length;
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
