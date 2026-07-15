/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type {
  GitCommitStagedResult,
  GitManagedWorktreeResult,
  GitPushCurrentBranchResult,
  GitWorkspaceInspection,
} from '@/common/types/platform/gitWorkspace';
import {
  CommandExecutionError,
  GitWorkspaceAdapter,
  GitWorkspaceAdapterError,
  execFileCommand,
  initGitWorkspaceBridge,
  type CommandRunner,
  type GitWorkspaceBridgeApi,
  type GitWorkspacePort,
} from '@/process/services/git-workspace';

const temporaryRoots: string[] = [];

type RepositoryFixture = {
  root: string;
  repository: string;
  worktreeRoot: string;
};

function git(repository: string, ...args: string[]): string {
  return execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' });
}

function createRepository(): RepositoryFixture {
  const root = mkdtempSync(path.join(tmpdir(), 'aion-git-workspace-'));
  temporaryRoots.push(root);
  const repository = path.join(root, 'repository');
  mkdirSync(repository);
  git(repository, 'init', '-b', 'main');
  git(repository, 'config', 'user.name', 'Aion Test');
  git(repository, 'config', 'user.email', 'aion-test@example.invalid');
  writeFileSync(path.join(repository, 'tracked.txt'), 'base\n');
  git(repository, 'add', 'tracked.txt');
  git(repository, 'commit', '-m', 'initial');
  return { root, repository, worktreeRoot: path.join(root, 'codex', 'worktrees') };
}

const runnerWithoutGh: CommandRunner = (command, args, options) => {
  if (command === 'gh') {
    return Promise.reject(new CommandExecutionError('gh', null, '', 'ENOENT', 'spawn gh ENOENT'));
  }
  return execFileCommand(command, args, options);
};

function createAdapter(
  fixture: RepositoryFixture,
  commandRunner: CommandRunner = runnerWithoutGh
): GitWorkspaceAdapter {
  return new GitWorkspaceAdapter({ commandRunner, worktreeRoot: fixture.worktreeRoot });
}

function withStaleWorktreeMetadata(targetPath: string): CommandRunner {
  const canonicalTarget = realpathSync(targetPath);
  return async (command, args, options) => {
    const result = await runnerWithoutGh(command, args, options);
    if (command !== 'git' || !args.includes('worktree') || !args.includes('list')) return result;

    const stdout = result.stdout
      .split('\0\0')
      .map((record) => {
        const reportedPath = record.split('\0', 1)[0]?.slice('worktree '.length);
        if (!reportedPath || !existsSync(reportedPath) || realpathSync(reportedPath) !== canonicalTarget) return record;
        return record
          .split('\0')
          .filter((field) => field && field !== 'detached' && !field.startsWith('branch '))
          .map((field) => (field.startsWith('HEAD ') ? `HEAD ${'f'.repeat(40)}` : field))
          .concat('branch refs/heads/stale-metadata')
          .join('\0');
      })
      .join('\0\0');
    return { ...result, stdout };
  };
}

async function expectAdapterError(promise: Promise<unknown>, code: GitWorkspaceAdapterError['code']): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(GitWorkspaceAdapterError);
    expect((error as GitWorkspaceAdapterError).code).toBe(code);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  while (temporaryRoots.length) rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
});

describe('GitWorkspaceAdapter inspection', () => {
  it('rejects paths outside a Git worktree', async () => {
    const fixture = createRepository();
    const outside = path.join(fixture.root, 'outside');
    mkdirSync(outside);

    await expectAdapterError(createAdapter(fixture).inspect({ cwd: outside }), 'NOT_GIT_REPOSITORY');
  });

  it('reports staged and unstaged dirtiness without hiding untracked files', async () => {
    const fixture = createRepository();
    writeFileSync(path.join(fixture.repository, 'tracked.txt'), 'staged\n');
    git(fixture.repository, 'add', 'tracked.txt');
    appendFileSync(path.join(fixture.repository, 'tracked.txt'), 'unstaged\n');
    writeFileSync(path.join(fixture.repository, 'scratch.txt'), 'untracked\n');

    const inspection = await createAdapter(fixture).inspect({ cwd: fixture.repository });

    expect(inspection.dirty).toBe(true);
    expect(inspection.staged).toBe(true);
    expect(inspection.currentBranch).toBe('main');
  });

  it('returns selectable branches, worktrees, and explicit gh unavailability', async () => {
    const fixture = createRepository();

    const inspection = await createAdapter(fixture).inspect({ cwd: fixture.repository });
    const main = inspection.branches.find((branch) => branch.name === 'main');

    expect(main).toMatchObject({ current: true, kind: 'local', checkedOutAt: inspection.root });
    expect(inspection.worktrees[0]).toMatchObject({ path: inspection.root, branch: 'main' });
    expect(inspection.pullRequest).toEqual({ status: 'unavailable', reason: 'gh_not_found' });
  });

  it('reads the current pull request when gh is available', async () => {
    const fixture = createRepository();
    const runnerWithPullRequest: CommandRunner = (command, args, options) => {
      if (command !== 'gh') return execFileCommand(command, args, options);
      if (args[0] === '--version') return Promise.resolve({ stdout: 'gh version 1\n', stderr: '', exitCode: 0 });
      return Promise.resolve({
        stdout: JSON.stringify({
          number: 42,
          title: 'Typed Git workspace adapter',
          url: 'https://example.invalid/pull/42',
          state: 'OPEN',
          isDraft: false,
          headRefName: 'main',
          baseRefName: 'main',
        }),
        stderr: '',
        exitCode: 0,
      });
    };

    const inspection = await createAdapter(fixture, runnerWithPullRequest).inspect({ cwd: fixture.repository });

    expect(inspection.pullRequest).toMatchObject({ status: 'available', number: 42, state: 'OPEN' });
  });

  it('surfaces command failures after repository discovery', async () => {
    const fixture = createRepository();
    const failingRunner: CommandRunner = (command, args, options) => {
      if (command === 'git' && args.includes('status')) {
        return Promise.reject(new CommandExecutionError('git', 128, 'forced status failure', null));
      }
      return runnerWithoutGh(command, args, options);
    };

    await expectAdapterError(
      createAdapter(fixture, failingRunner).inspect({ cwd: fixture.repository }),
      'COMMAND_FAILED'
    );
  });
});

describe('GitWorkspaceAdapter managed worktrees', () => {
  it('reuses the same task when the live HEAD and detached state still match', async () => {
    const fixture = createRepository();
    const adapter = createAdapter(fixture);
    const request = { repositoryPath: fixture.repository, taskId: 'task-123', startRef: 'main' };

    const created = await adapter.ensureManagedWorktree(request);
    const reused = await adapter.ensureManagedWorktree(request);
    const actualHead = git(created.targetPath, 'rev-parse', 'HEAD').trim();

    expect(created.status).toBe('created');
    expect(created.worktree?.detached).toBe(true);
    expect(reused).toMatchObject({
      status: 'reused',
      targetPath: created.targetPath,
      startCommit: actualHead,
      worktree: {
        head: actualHead,
        branch: null,
        branchRef: null,
        detached: true,
      },
    });
  });

  it('rejects reuse when the requested start commit no longer matches the task worktree HEAD', async () => {
    const fixture = createRepository();
    const adapter = createAdapter(fixture);
    const request = { repositoryPath: fixture.repository, taskId: 'commit-conflict', startRef: 'main' };
    const created = await adapter.ensureManagedWorktree(request);

    appendFileSync(path.join(created.targetPath, 'tracked.txt'), 'task commit\n');
    git(created.targetPath, 'add', 'tracked.txt');
    git(created.targetPath, 'commit', '-m', 'advance task worktree');
    const taskHead = git(created.targetPath, 'rev-parse', 'HEAD').trim();

    await expectAdapterError(adapter.ensureManagedWorktree(request), 'TARGET_EXISTS');
    expect(git(created.targetPath, 'rev-parse', 'HEAD').trim()).toBe(taskHead);
  });

  it('rejects reuse when a branch is requested for an existing detached task worktree', async () => {
    const fixture = createRepository();
    const adapter = createAdapter(fixture);
    const request = { repositoryPath: fixture.repository, taskId: 'detached-conflict', startRef: 'main' };
    const created = await adapter.ensureManagedWorktree(request);

    await expectAdapterError(
      adapter.ensureManagedWorktree({ ...request, newBranch: 'feature/detached-conflict' }),
      'TARGET_EXISTS'
    );
    expect(git(created.targetPath, 'rev-parse', 'HEAD').trim()).toBe(created.startCommit);
  });

  it('rejects reuse when detached mode is requested for an existing branch task worktree', async () => {
    const fixture = createRepository();
    const adapter = createAdapter(fixture);
    const request = {
      repositoryPath: fixture.repository,
      taskId: 'branch-conflict',
      startRef: 'main',
      newBranch: 'feature/branch-conflict',
    };
    const created = await adapter.ensureManagedWorktree(request);

    await expectAdapterError(adapter.ensureManagedWorktree({ ...request, newBranch: undefined }), 'TARGET_EXISTS');
    expect(git(created.targetPath, 'branch', '--show-current').trim()).toBe(request.newBranch);
  });

  it('rejects reuse when the requested branch differs from the task worktree branch', async () => {
    const fixture = createRepository();
    const adapter = createAdapter(fixture);
    const request = {
      repositoryPath: fixture.repository,
      taskId: 'branch-name-conflict',
      startRef: 'main',
      newBranch: 'feature/original-task',
    };
    const created = await adapter.ensureManagedWorktree(request);

    await expectAdapterError(
      adapter.ensureManagedWorktree({ ...request, newBranch: 'feature/different-task' }),
      'TARGET_EXISTS'
    );
    expect(git(created.targetPath, 'branch', '--show-current').trim()).toBe(request.newBranch);
  });

  it('returns reused metadata from the live worktree instead of the registration snapshot', async () => {
    const fixture = createRepository();
    const request = {
      repositoryPath: fixture.repository,
      taskId: 'live-metadata',
      startRef: 'main',
      newBranch: 'feature/live-metadata',
    };
    const created = await createAdapter(fixture).ensureManagedWorktree(request);
    const actualHead = git(created.targetPath, 'rev-parse', 'HEAD').trim();

    const reused = await createAdapter(fixture, withStaleWorktreeMetadata(created.targetPath)).ensureManagedWorktree(
      request
    );

    expect(reused).toMatchObject({
      status: 'reused',
      startCommit: actualHead,
      worktree: {
        head: actualHead,
        branch: request.newBranch,
        branchRef: `refs/heads/${request.newBranch}`,
        detached: false,
      },
    });
  });

  it('creates from the selected ref without copying local tracked, untracked, or ignored state', async () => {
    const fixture = createRepository();
    writeFileSync(path.join(fixture.repository, '.gitignore'), '.env\nAGENTS.override.md\n');
    git(fixture.repository, 'add', '.gitignore');
    git(fixture.repository, 'commit', '-m', 'add ignored setup files');
    writeFileSync(path.join(fixture.repository, 'tracked.txt'), 'staged\n');
    git(fixture.repository, 'add', 'tracked.txt');
    appendFileSync(path.join(fixture.repository, 'tracked.txt'), 'unstaged\n');
    writeFileSync(path.join(fixture.repository, 'scratch.txt'), 'untracked\n');
    writeFileSync(path.join(fixture.repository, '.env'), 'local-only=true\n');
    writeFileSync(path.join(fixture.repository, 'AGENTS.override.md'), 'local instructions\n');

    const result = await createAdapter(fixture).ensureManagedWorktree({
      repositoryPath: fixture.repository,
      taskId: 'clean-start',
      startRef: 'main',
    });

    expect(result.status).toBe('created');
    expect(readFileSync(path.join(result.targetPath, 'tracked.txt'), 'utf8')).toBe('base\n');
    expect(git(result.targetPath, 'status', '--short').trim()).toBe('');
    expect(existsSync(path.join(result.targetPath, 'scratch.txt'))).toBe(false);
    expect(existsSync(path.join(result.targetPath, '.env'))).toBe(false);
    expect(existsSync(path.join(result.targetPath, 'AGENTS.override.md'))).toBe(false);
    expect(git(fixture.repository, 'status', '--short')).toContain('tracked.txt');
  });

  it('reuses an existing task worktree without moving later source changes into it', async () => {
    const fixture = createRepository();
    const adapter = createAdapter(fixture);
    const request = { repositoryPath: fixture.repository, taskId: 'stable-reuse', startRef: 'main' };
    const created = await adapter.ensureManagedWorktree(request);
    appendFileSync(path.join(fixture.repository, 'tracked.txt'), 'local change\n');
    writeFileSync(path.join(fixture.repository, 'scratch.txt'), 'untracked\n');

    const reused = await adapter.ensureManagedWorktree(request);

    expect(reused).toMatchObject({ status: 'reused', targetPath: created.targetPath });
    expect(readFileSync(path.join(reused.targetPath, 'tracked.txt'), 'utf8')).toBe('base\n');
    expect(git(reused.targetPath, 'status', '--short').trim()).toBe('');
    expect(git(fixture.repository, 'status', '--short')).toContain('scratch.txt');
  });

  it('rejects an existing primitive target', async () => {
    const fixture = createRepository();
    const targetPath = path.join(fixture.root, 'occupied-target');
    mkdirSync(targetPath);

    await expectAdapterError(
      createAdapter(fixture).createWorktreePrimitive({
        repositoryPath: fixture.repository,
        targetPath,
        startRef: 'main',
      }),
      'TARGET_EXISTS'
    );
  });

  it('rejects a new branch name already occupied by another worktree', async () => {
    const fixture = createRepository();
    const occupiedPath = path.join(fixture.root, 'occupied-worktree');
    git(fixture.repository, 'branch', 'feature/occupied');
    git(fixture.repository, 'worktree', 'add', occupiedPath, 'feature/occupied');

    await expectAdapterError(
      createAdapter(fixture).createWorktreePrimitive({
        repositoryPath: fixture.repository,
        targetPath: path.join(fixture.root, 'new-worktree'),
        startRef: 'main',
        newBranch: 'feature/occupied',
      }),
      'BRANCH_OCCUPIED'
    );
  });
});

describe('GitWorkspaceAdapter commit and push actions', () => {
  it('rejects blank commit messages and empty staged commits', async () => {
    const fixture = createRepository();
    const adapter = createAdapter(fixture);

    await expectAdapterError(adapter.commitStaged({ cwd: fixture.repository, message: '   ' }), 'EMPTY_COMMIT_MESSAGE');
    await expectAdapterError(
      adapter.commitStaged({ cwd: fixture.repository, message: 'test: empty staged commit' }),
      'NO_STAGED_CHANGES'
    );
  });

  it('commits only staged changes even when the working tree remains dirty', async () => {
    const fixture = createRepository();
    writeFileSync(path.join(fixture.repository, 'tracked.txt'), 'staged\n');
    git(fixture.repository, 'add', 'tracked.txt');
    appendFileSync(path.join(fixture.repository, 'tracked.txt'), 'unstaged\n');

    const result = await createAdapter(fixture).commitStaged({
      cwd: fixture.repository,
      message: 'test: commit staged changes',
    });

    expect(result.branch).toBe('main');
    expect(result.commitSha).toBe(git(fixture.repository, 'rev-parse', 'HEAD').trim());
    expect(git(fixture.repository, 'diff', '--name-only').trim()).toBe('tracked.txt');
  });

  it('reports a missing upstream before attempting to push', async () => {
    const fixture = createRepository();

    await expectAdapterError(
      createAdapter(fixture).pushCurrentBranch({ cwd: fixture.repository }),
      'UPSTREAM_UNAVAILABLE'
    );
  });

  it('reports an unavailable configured remote separately from the upstream', async () => {
    const fixture = createRepository();
    git(fixture.repository, 'update-ref', 'refs/remotes/missing/main', 'HEAD');
    git(fixture.repository, 'config', 'branch.main.remote', 'missing');
    git(fixture.repository, 'config', 'branch.main.merge', 'refs/heads/main');

    await expectAdapterError(
      createAdapter(fixture).pushCurrentBranch({ cwd: fixture.repository }),
      'REMOTE_UNAVAILABLE'
    );
  });

  it('pushes only the current branch to its configured upstream', async () => {
    const fixture = createRepository();
    const remote = path.join(fixture.root, 'remote.git');
    execFileSync('git', ['init', '--bare', remote]);
    git(fixture.repository, 'remote', 'add', 'origin', remote);
    git(fixture.repository, 'push', '--set-upstream', 'origin', 'main');
    appendFileSync(path.join(fixture.repository, 'tracked.txt'), 'pushed change\n');
    git(fixture.repository, 'add', 'tracked.txt');
    git(fixture.repository, 'commit', '-m', 'test push');

    const result = await createAdapter(fixture).pushCurrentBranch({ cwd: fixture.repository });

    expect(result).toMatchObject({ branch: 'main', remote: 'origin', upstream: 'origin/main' });
    expect(git(remote, 'rev-parse', 'refs/heads/main').trim()).toBe(
      git(fixture.repository, 'rev-parse', 'HEAD').trim()
    );
  });
});

describe('Git workspace bridge wiring', () => {
  it('registers each typed action on the existing provider bridge', async () => {
    const results = {
      inspect: {} as GitWorkspaceInspection,
      ensure: {} as GitManagedWorktreeResult,
      commit: {} as GitCommitStagedResult,
      push: {} as GitPushCurrentBranchResult,
    };
    const port: GitWorkspacePort = {
      inspect: vi.fn(async () => results.inspect),
      ensureManagedWorktree: vi.fn(async () => results.ensure),
      commitStaged: vi.fn(async () => results.commit),
      pushCurrentBranch: vi.fn(async () => results.push),
    };
    const handlers: {
      inspect?: Parameters<GitWorkspaceBridgeApi['inspect']['provider']>[0];
      ensure?: Parameters<GitWorkspaceBridgeApi['ensureManagedWorktree']['provider']>[0];
      commit?: Parameters<GitWorkspaceBridgeApi['commitStaged']['provider']>[0];
      push?: Parameters<GitWorkspaceBridgeApi['pushCurrentBranch']['provider']>[0];
    } = {};
    const api: GitWorkspaceBridgeApi = {
      inspect: { provider: (handler) => void (handlers.inspect = handler) },
      ensureManagedWorktree: { provider: (handler) => void (handlers.ensure = handler) },
      commitStaged: { provider: (handler) => void (handlers.commit = handler) },
      pushCurrentBranch: { provider: (handler) => void (handlers.push = handler) },
    };

    initGitWorkspaceBridge(port, api);

    await expect(handlers.inspect!({ cwd: '/repo' })).resolves.toBe(results.inspect);
    await expect(handlers.ensure!({ repositoryPath: '/repo', taskId: 'task', startRef: 'main' })).resolves.toBe(
      results.ensure
    );
    await expect(handlers.commit!({ cwd: '/repo', message: 'message' })).resolves.toBe(results.commit);
    await expect(handlers.push!({ cwd: '/repo' })).resolves.toBe(results.push);
  });
});
