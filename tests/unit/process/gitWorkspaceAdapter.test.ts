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
  rmSync,
  symlinkSync,
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
  it('creates a deterministic detached worktree and reuses it for the same task', async () => {
    const fixture = createRepository();
    const adapter = createAdapter(fixture);
    const request = { repositoryPath: fixture.repository, taskId: 'task-123', startRef: 'main' };

    const created = await adapter.ensureManagedWorktree(request);
    const reused = await adapter.ensureManagedWorktree(request);

    expect(created.status).toBe('created');
    expect(created.worktree?.detached).toBe(true);
    expect(reused).toMatchObject({ status: 'reused', targetPath: created.targetPath });
  });

  it('copies staged and unstaged tracked changes while leaving untracked files behind', async () => {
    const fixture = createRepository();
    writeFileSync(path.join(fixture.repository, 'tracked.txt'), 'staged\n');
    git(fixture.repository, 'add', 'tracked.txt');
    appendFileSync(path.join(fixture.repository, 'tracked.txt'), 'unstaged\n');
    writeFileSync(path.join(fixture.repository, 'scratch.txt'), 'untracked\n');

    const result = await createAdapter(fixture).ensureManagedWorktree({
      repositoryPath: fixture.repository,
      taskId: 'dirty-copy',
      startRef: 'main',
    });

    expect(result.status).toBe('created');
    expect(readFileSync(path.join(result.targetPath, 'tracked.txt'), 'utf8')).toBe('staged\nunstaged\n');
    expect(git(result.targetPath, 'diff', '--cached', '--name-only').trim()).toBe('tracked.txt');
    expect(git(result.targetPath, 'diff', '--name-only').trim()).toBe('tracked.txt');
    expect(existsSync(path.join(result.targetPath, 'scratch.txt'))).toBe(false);
  });

  it('copies only included ignored files and the ignored AGENTS override', async () => {
    const fixture = createRepository();
    writeFileSync(
      path.join(fixture.repository, '.gitignore'),
      ['.env', '.secret', 'AGENTS.override.md', 'ignored-link'].join('\n') + '\n'
    );
    writeFileSync(path.join(fixture.repository, '.worktreeinclude'), ['.env', 'ignored-link'].join('\n') + '\n');
    git(fixture.repository, 'add', '.gitignore', '.worktreeinclude');
    git(fixture.repository, 'commit', '-m', 'add worktree setup policy');
    writeFileSync(path.join(fixture.repository, '.env'), 'included=true\n');
    writeFileSync(path.join(fixture.repository, '.secret'), 'excluded=true\n');
    writeFileSync(path.join(fixture.repository, 'AGENTS.override.md'), 'local instructions\n');
    symlinkSync('.env', path.join(fixture.repository, 'ignored-link'));

    const result = await createAdapter(fixture).ensureManagedWorktree({
      repositoryPath: fixture.repository,
      taskId: 'ignored-copy',
      startRef: 'main',
    });

    expect(existsSync(path.join(result.targetPath, '.env'))).toBe(true);
    expect(existsSync(path.join(result.targetPath, '.secret'))).toBe(false);
    expect(existsSync(path.join(result.targetPath, 'AGENTS.override.md'))).toBe(true);
    expect(existsSync(path.join(result.targetPath, 'ignored-link'))).toBe(false);
    expect(result.handoff).toMatchObject({
      status: 'applied',
      ignoredFiles: {
        copied: ['.env', 'AGENTS.override.md'],
        skippedSymlinks: ['ignored-link'],
      },
    });
  });

  it('returns unsupported when dirty changes are based on a different commit', async () => {
    const fixture = createRepository();
    git(fixture.repository, 'branch', 'older');
    writeFileSync(path.join(fixture.repository, 'tracked.txt'), 'second commit\n');
    git(fixture.repository, 'add', 'tracked.txt');
    git(fixture.repository, 'commit', '-m', 'second');
    appendFileSync(path.join(fixture.repository, 'tracked.txt'), 'local change\n');

    const result = await createAdapter(fixture).ensureManagedWorktree({
      repositoryPath: fixture.repository,
      taskId: 'unsupported-copy',
      startRef: 'older',
    });

    expect(result).toMatchObject({
      status: 'unsupported',
      worktree: null,
      handoff: { status: 'unsupported', reason: 'selected_ref_differs_from_local_head' },
    });
    expect(existsSync(result.targetPath)).toBe(false);
  });

  it('returns unsupported instead of creating a worktree when dirty changes cannot be represented as a patch', async () => {
    const fixture = createRepository();
    appendFileSync(path.join(fixture.repository, 'tracked.txt'), 'local change\n');
    const emptyPatchRunner: CommandRunner = (command, args, options) => {
      if (command === 'git' && args.includes('--binary')) {
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
      }
      return runnerWithoutGh(command, args, options);
    };

    const result = await createAdapter(fixture, emptyPatchRunner).ensureManagedWorktree({
      repositoryPath: fixture.repository,
      taskId: 'unpatchable-copy',
      startRef: 'main',
    });

    expect(result).toMatchObject({
      status: 'unsupported',
      handoff: { status: 'unsupported', reason: 'unpatchable_tracked_changes' },
    });
    expect(existsSync(result.targetPath)).toBe(false);
  });

  it('removes a newly created worktree when applying local changes fails', async () => {
    const fixture = createRepository();
    appendFileSync(path.join(fixture.repository, 'tracked.txt'), 'local change\n');
    const failingApplyRunner: CommandRunner = (command, args, options) => {
      if (command === 'git' && args.includes('apply')) {
        return Promise.reject(new CommandExecutionError('git', 1, 'forced apply failure', null));
      }
      return runnerWithoutGh(command, args, options);
    };

    await expectAdapterError(
      createAdapter(fixture, failingApplyRunner).ensureManagedWorktree({
        repositoryPath: fixture.repository,
        taskId: 'failed-apply',
        startRef: 'main',
      }),
      'COMMAND_FAILED'
    );
    expect(git(fixture.repository, 'worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(1);
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
