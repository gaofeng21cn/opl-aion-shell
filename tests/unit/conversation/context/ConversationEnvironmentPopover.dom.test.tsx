import type { TChatConversation } from '@/common/config/storage';
import ConversationEnvironmentPopover from '@/renderer/pages/conversation/components/ChatLayout/ConversationEnvironmentPopover';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const gitWorkspaceApi = vi.hoisted(() => ({
  inspect: vi.fn(),
}));
const workspaceEvents = vi.hoisted(() => ({ toggle: vi.fn() }));
const previewContext = vi.hoisted(() => ({ openPreview: vi.fn() }));
const handoffApi = vi.hoisted(() => ({
  getOverview: vi.fn(),
  execute: vi.fn(),
  ensureManagedWorktree: vi.fn(),
  cleanupManagedWorktree: vi.fn(),
  restoreManagedWorktree: vi.fn(),
  updateConversation: vi.fn(),
}));
const messageApi = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const modalApi = vi.hoisted(() => ({ confirm: vi.fn() }));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      ...actual.Message,
      success: messageApi.success,
      error: messageApi.error,
    },
    Modal: {
      ...actual.Modal,
      confirm: modalApi.confirm,
    },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    gitWorkspace: {
      inspect: { invoke: gitWorkspaceApi.inspect },
      ensureManagedWorktree: { invoke: handoffApi.ensureManagedWorktree },
      cleanupManagedWorktree: { invoke: handoffApi.cleanupManagedWorktree },
      restoreManagedWorktree: { invoke: handoffApi.restoreManagedWorktree },
    },
    threadCoordination: {
      getOverview: { invoke: handoffApi.getOverview },
      execute: { invoke: handoffApi.execute },
    },
    conversation: {
      update: { invoke: handoffApi.updateConversation },
    },
  },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: { emit: vi.fn() },
}));

vi.mock('@/renderer/utils/workspace/workspaceEvents', () => ({
  WORKSPACE_STATE_EVENT: 'aionui-workspace-state',
  dispatchWorkspaceToggleEvent: workspaceEvents.toggle,
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout/WorkspaceOpenButton', () => ({
  default: () => <button type='button'>Open terminal</button>,
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => previewContext,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      ({
        'conversation.environment.title': 'Environment',
        'conversation.environment.workspace': 'Workspace',
        'conversation.environment.noWorkspace': 'No active workspace',
        'conversation.environment.root': 'Repository root',
        'conversation.environment.location': 'Location',
        'conversation.environment.local': 'Local',
        'conversation.environment.worktree': 'Worktree',
        'conversation.environment.remote': 'Remote',
        'conversation.environment.taskLocation': 'Task location',
        'conversation.environment.handoffChecking': 'Checking task availability...',
        'conversation.environment.handoffUnavailable': 'Task handoff unavailable',
        'conversation.environment.handoffRunning': 'Finish the running turn first',
        'conversation.environment.handoffSuccess': 'Task location updated',
        'conversation.environment.handoffFailed': 'Could not update task location',
        'conversation.environment.projectionUpdateFailed':
          'The local conversation could not be updated, so the task location was rolled back. Retry the location change.',
        'conversation.environment.handoffInconsistent':
          'Task location is inconsistent with this conversation. Retry the location change to resynchronize.',
        'conversation.environment.localWorkspaceUnavailable': 'Local workspace unavailable',
        'conversation.environment.worktreeUnavailable': 'Worktree needs coordination',
        'conversation.environment.worktreeCreateFailed': 'Worktree creation failed',
        'conversation.environment.worktreeCleanupAction': 'Create restore point and remove',
        'conversation.environment.worktreeCleanupConfirmTitle': 'Remove managed Worktree?',
        'conversation.environment.worktreeCleanupConfirm': 'Save the restore point before removal.',
        'conversation.environment.worktreeCleanupSuccess': 'Restore point created and Worktree removed',
        'conversation.environment.worktreeCleanupFailed': 'Worktree cleanup failed',
        'conversation.environment.worktreeRestoreAction': 'Restore Worktree',
        'conversation.environment.worktreeRestoreConfirmTitle': 'Restore managed Worktree?',
        'conversation.environment.worktreeRestoreConfirm': 'Restore the saved Worktree state.',
        'conversation.environment.worktreeRestoreSuccess': 'Worktree restored',
        'conversation.environment.worktreeRestoreFailed': 'Worktree restore failed',
        'conversation.environment.git': 'Git',
        'conversation.environment.branch': 'Branch',
        'conversation.environment.changes': 'Changes',
        'conversation.environment.clean': 'Clean',
        'conversation.environment.dirty': 'Dirty',
        'conversation.environment.staged': 'Staged',
        'conversation.environment.pullRequest': 'Pull request',
        'conversation.environment.draft': 'Draft',
        'conversation.environment.subtasks': 'Subtasks',
        'conversation.environment.sources': 'Sources',
        'conversation.environment.taskReferences': 'Task references',
        'conversation.environment.artifacts': 'Artifacts',
        'conversation.environment.evidence': 'Evidence',
        'conversation.environment.receipts': 'Receipts',
        'conversation.environment.openFiles': 'Open files',
        'conversation.environment.filesOpen': 'Files open',
        'conversation.environment.moreRefs': `${options?.count ?? 0} more`,
        'conversation.environment.unavailable': 'Unavailable',
        'conversation.sidePanel.browserAddress': 'Web address',
        'conversation.sidePanel.openBrowser': 'Open address',
        'common.cancel': 'Cancel',
      })[key] ?? key,
  }),
}));

const conversation = {
  id: 'conversation-1',
  name: 'Conversation',
  type: 'codex',
  created_at: 1,
  modified_at: 1,
  extra: { workspace: '/projects/demo' },
} as TChatConversation;

const canonicalConversation = {
  ...conversation,
  type: 'acp',
  extra: {
    backend: 'codex',
    workspace: '/projects/demo',
    canonical_thread_id: 'thread-1',
  },
} as TChatConversation;

const acceptedHandoff = {
  ok: true,
  outcome: 'accepted',
  action: 'handoff',
  targetThreadId: 'thread-1',
  forkedThreadId: null,
  reviewThreadId: null,
  turnId: null,
  protocolMethod: 'thread/settings/update',
  auditId: 'audit-1',
  errorCode: null,
  message: 'Accepted',
  advisories: [],
};

const snapshotReceipt = {
  schema: 'opl_worktree_snapshot_receipt.v1' as const,
  snapshotId: '11111111-2222-4333-8444-555555555555',
  createdAt: '2026-07-14T00:00:00.000Z',
  repositoryRoot: '/projects/demo',
  taskId: 'thread-1',
  worktreePath: '/Users/test/.codex/worktrees/demo-task',
  head: '2222222222222222222222222222222222222222',
  branch: null,
  branchRef: null,
  detached: true,
  staged: true,
  trackedUnstaged: true,
  untrackedCount: 1,
  ignoredCount: 0,
  snapshotKind: 'stash' as const,
  snapshotRef: 'refs/opl/worktree-snapshots/0123456789abcdef/11111111-2222-4333-8444-555555555555',
  snapshotObject: '3333333333333333333333333333333333333333',
};

const worktreeHandoff = {
  schema: 'opl_workspace_handoff.v1' as const,
  locality: 'worktree' as const,
  localWorkspace: '/projects/demo',
  worktreePath: '/Users/test/.codex/worktrees/demo-task',
  taskId: 'thread-1',
  startRef: 'main',
  startCommit: '1111111111111111111111111111111111111111',
  worktreeRetention: 'preserve_for_reuse_until_snapshotted_cleanup' as const,
};

const managedWorktreeConversation = {
  ...canonicalConversation,
  extra: {
    ...canonicalConversation.extra,
    workspace: worktreeHandoff.worktreePath,
    workspace_handoff: worktreeHandoff,
  },
} as TChatConversation;

describe('ConversationEnvironmentPopover', () => {
  beforeEach(() => {
    gitWorkspaceApi.inspect.mockReset().mockResolvedValue({
      cwd: '/projects/demo',
      root: '/projects',
      head: '0123456789abcdef',
      currentBranch: 'feature/advanced-surfaces',
      dirty: true,
      staged: true,
      branches: [],
      worktrees: [],
      pullRequest: {
        status: 'available',
        number: 42,
        title: 'Environment Git summary',
        url: 'https://github.com/example/repo/pull/42',
        state: 'OPEN',
        isDraft: false,
        headRefName: 'feature/advanced-surfaces',
        baseRefName: 'main',
      },
    });
    workspaceEvents.toggle.mockReset();
    previewContext.openPreview.mockReset();
    handoffApi.getOverview.mockReset().mockResolvedValue({
      schema: 'opl_codex_thread_coordination_overview.v1',
      availability: {
        status: 'available',
        host: 'local',
        protocolVersion: '0.144.3',
        methods: ['thread/list', 'thread/settings/update'],
        reasonCode: null,
        detail: null,
      },
      currentThreadId: 'thread-1',
      currentProjectId: 'project-1',
      threads: [
        {
          id: 'thread-1',
          title: 'Task',
          summary: '',
          status: 'idle',
          projectId: 'project-1',
          workspace: '/projects/demo',
          host: 'local',
          owner: 'Codex',
          goal: null,
          parentThreadId: null,
          ancestorThreadIds: [],
          activeTurnId: null,
          activeWriteSet: [],
          activePermission: null,
          archived: false,
          updatedAt: '2026-07-13T00:00:00.000Z',
        },
      ],
      audit: [],
    });
    handoffApi.execute.mockReset().mockResolvedValue(acceptedHandoff);
    handoffApi.ensureManagedWorktree.mockReset().mockResolvedValue({
      status: 'created',
      repositoryRoot: '/projects/demo',
      targetPath: '/Users/test/.codex/worktrees/demo-task',
      startRef: 'feature/advanced-surfaces',
      startCommit: '1111111111111111111111111111111111111111',
    });
    handoffApi.cleanupManagedWorktree.mockReset().mockResolvedValue({
      status: 'removed',
      repositoryRoot: '/projects/demo',
      worktreePath: '/Users/test/.codex/worktrees/demo-task',
      snapshot: snapshotReceipt,
    });
    handoffApi.restoreManagedWorktree.mockReset().mockResolvedValue({
      status: 'restored',
      repositoryRoot: '/projects/demo',
      worktree: {
        path: '/Users/test/.codex/worktrees/demo-task',
        head: snapshotReceipt.head,
        branch: null,
        branchRef: null,
        detached: true,
        bare: false,
        lockedReason: null,
        prunableReason: null,
      },
      snapshot: snapshotReceipt,
    });
    handoffApi.updateConversation.mockReset().mockResolvedValue(true);
    messageApi.success.mockReset();
    messageApi.error.mockReset();
    modalApi.confirm.mockReset();
  });

  it('reads live workspace facts and summarizes only task refs that actually exist', async () => {
    render(
      <ConversationEnvironmentPopover
        conversation={conversation}
        currentTask={
          {
            title: 'Task',
            subtasks: [{ id: 'one' }, { id: 'two' }],
            resource_source_refs: ['source://workspace'],
            artifact_or_blocker_ref: 'artifact://draft',
            evidence_cards: [{ ref: 'evidence://review' }],
            review_receipt_ref: 'receipt://review',
          } as never
        }
      />
    );

    expect(screen.queryByTestId('conversation-environment-popover')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Environment' }));

    const popover = await screen.findByTestId('conversation-environment-popover');
    await waitFor(() => expect(within(popover).getByText('feature/advanced-surfaces')).toBeInTheDocument());
    expect(gitWorkspaceApi.inspect).toHaveBeenCalledWith({ cwd: '/projects/demo' });
    expect(within(popover).getByText('/projects/demo')).toBeInTheDocument();
    expect(within(popover).getByText('/projects')).toBeInTheDocument();
    expect(within(popover).getByText('Local')).toBeInTheDocument();
    expect(within(popover).getByText('Changes').parentElement).toHaveTextContent('Dirty / Staged');
    expect(within(popover).getByText('Pull request').parentElement).toHaveTextContent(
      '#42 Environment Git summary (feature/advanced-surfaces -> main)'
    );
    expect(within(popover).getByText('Subtasks').parentElement).toHaveTextContent('2');
    expect(within(popover).getByText('source://workspace')).toBeInTheDocument();
    expect(within(popover).getByText('artifact://draft')).toBeInTheDocument();
    expect(within(popover).getByText('evidence://review')).toBeInTheDocument();
    expect(within(popover).getByText('receipt://review')).toBeInTheDocument();
    expect(within(popover).queryByText('Unavailable')).not.toBeInTheDocument();

    fireEvent.click(within(popover).getByRole('button', { name: 'Open files' }));
    expect(workspaceEvents.toggle).toHaveBeenCalledTimes(1);
    expect(within(popover).getByRole('button', { name: 'Open terminal' })).toBeInTheDocument();
  });

  it('shows a factual no-workspace state without requesting Git inspection or inventing task details', async () => {
    render(<ConversationEnvironmentPopover conversation={{ ...conversation, extra: {} } as TChatConversation} />);

    fireEvent.click(screen.getByRole('button', { name: 'Environment' }));

    const popover = await screen.findByTestId('conversation-environment-popover');
    expect(within(popover).getByText('No active workspace')).toBeInTheDocument();
    expect(within(popover).getByText('Local')).toBeInTheDocument();
    expect(within(popover).queryByText('Branch')).not.toBeInTheDocument();
    expect(within(popover).queryByText('Changes')).not.toBeInTheDocument();
    expect(within(popover).queryByText('Task references')).not.toBeInTheDocument();
    expect(within(popover).queryByRole('button', { name: 'Open files' })).not.toBeInTheDocument();
    expect(gitWorkspaceApi.inspect).not.toHaveBeenCalled();
  });

  it('shows one compact unavailable Git row when local inspection fails', async () => {
    gitWorkspaceApi.inspect.mockRejectedValue(new Error('git unavailable'));

    render(<ConversationEnvironmentPopover conversation={conversation} />);
    fireEvent.click(screen.getByRole('button', { name: 'Environment' }));

    const popover = await screen.findByTestId('conversation-environment-popover');
    await waitFor(() => expect(gitWorkspaceApi.inspect).toHaveBeenCalledTimes(1));
    expect(within(popover).getByText('Git').parentElement).toHaveTextContent('Unavailable');
    expect(within(popover).queryByText('Repository root')).not.toBeInTheDocument();
    expect(within(popover).queryByText('Branch')).not.toBeInTheDocument();
    expect(within(popover).queryByText('Changes')).not.toBeInTheDocument();
    expect(within(popover).queryByText('Pull request')).not.toBeInTheDocument();
  });

  it('shows unavailable PR context when gh cannot provide a trustworthy read', async () => {
    gitWorkspaceApi.inspect.mockResolvedValue({
      cwd: '/projects/demo',
      root: '/projects/demo',
      head: '0123456789abcdef',
      currentBranch: 'feature/no-gh',
      dirty: false,
      staged: false,
      branches: [],
      worktrees: [],
      pullRequest: { status: 'unavailable', reason: 'gh_not_found' },
    });

    render(<ConversationEnvironmentPopover conversation={conversation} />);
    fireEvent.click(screen.getByRole('button', { name: 'Environment' }));

    const popover = await screen.findByTestId('conversation-environment-popover');
    await waitFor(() => expect(within(popover).getByText('feature/no-gh')).toBeInTheDocument());
    expect(within(popover).getByText('Changes').parentElement).toHaveTextContent('Clean');
    expect(within(popover).getByText('Pull request').parentElement).toHaveTextContent('Unavailable');
  });

  it('hides PR context when the inspected branch has no current pull request', async () => {
    gitWorkspaceApi.inspect.mockResolvedValue({
      cwd: '/projects/demo',
      root: '/projects/demo',
      head: '0123456789abcdef',
      currentBranch: 'feature/no-pr',
      dirty: false,
      staged: false,
      branches: [],
      worktrees: [],
      pullRequest: { status: 'unavailable', reason: 'no_current_pull_request' },
    });

    render(<ConversationEnvironmentPopover conversation={conversation} />);
    fireEvent.click(screen.getByRole('button', { name: 'Environment' }));

    const popover = await screen.findByTestId('conversation-environment-popover');
    await waitFor(() => expect(within(popover).getByText('feature/no-pr')).toBeInTheDocument());
    expect(within(popover).queryByText('Pull request')).not.toBeInTheDocument();
    expect(within(popover).queryByText('Unavailable')).not.toBeInTheDocument();
  });

  it('does not inspect a remote workspace through the local Git bridge', async () => {
    render(
      <ConversationEnvironmentPopover
        conversation={{ ...conversation, type: 'remote', extra: { workspace: '/remote/project' } } as TChatConversation}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Environment' }));

    const popover = await screen.findByTestId('conversation-environment-popover');
    expect(within(popover).getByText('Remote')).toBeInTheDocument();
    expect(within(popover).getByText('Git').parentElement).toHaveTextContent('Unavailable');
    expect(within(popover).queryByText('Repository root')).not.toBeInTheDocument();
    expect(gitWorkspaceApi.inspect).not.toHaveBeenCalled();
  });

  it('opens an http browser preview from Environment without restoring the legacy Browser tab', async () => {
    render(<ConversationEnvironmentPopover conversation={conversation} />);
    fireEvent.click(screen.getByRole('button', { name: 'Environment' }));

    const popover = await screen.findByTestId('conversation-environment-popover');
    fireEvent.change(within(popover).getByRole('textbox', { name: 'Web address' }), {
      target: { value: 'example.com' },
    });
    fireEvent.click(within(popover).getByRole('button', { name: 'Open address' }));

    expect(previewContext.openPreview).toHaveBeenCalledWith(
      'https://example.com/',
      'url',
      { title: 'https://example.com/' },
      { replace: true }
    );
  });

  it('keeps invalid browser input local and does not open a preview', async () => {
    render(<ConversationEnvironmentPopover conversation={conversation} />);
    fireEvent.click(screen.getByRole('button', { name: 'Environment' }));

    const popover = await screen.findByTestId('conversation-environment-popover');
    const input = within(popover).getByRole('textbox', { name: 'Web address' });
    fireEvent.change(input, { target: { value: 'http://' } });
    fireEvent.click(within(popover).getByRole('button', { name: 'Open address' }));

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(previewContext.openPreview).not.toHaveBeenCalled();
  });

  it('moves an idle canonical Codex task from Local to a managed Worktree and persists the projection', async () => {
    render(<ConversationEnvironmentPopover conversation={canonicalConversation} />);
    fireEvent.click(screen.getByRole('button', { name: 'Environment' }));

    const popover = await screen.findByTestId('conversation-environment-popover');
    const worktree = within(popover).getByRole('radio', { name: 'Worktree' });
    await waitFor(() => expect(worktree).toBeEnabled());
    fireEvent.click(worktree);

    await waitFor(() => expect(handoffApi.updateConversation).toHaveBeenCalledOnce());
    expect(gitWorkspaceApi.inspect).toHaveBeenCalledWith({ cwd: '/projects/demo' });
    expect(handoffApi.ensureManagedWorktree).toHaveBeenCalledWith({
      repositoryPath: '/projects/demo',
      taskId: 'thread-1',
      startRef: 'feature/advanced-surfaces',
    });
    expect(handoffApi.execute).toHaveBeenCalledWith({
      request: expect.objectContaining({
        action: 'handoff',
        targetThreadId: 'thread-1',
        workspace: '/Users/test/.codex/worktrees/demo-task',
      }),
    });
    expect(handoffApi.updateConversation).toHaveBeenCalledWith({
      id: 'conversation-1',
      updates: {
        extra: {
          workspace: '/Users/test/.codex/worktrees/demo-task',
          workspace_handoff: {
            schema: 'opl_workspace_handoff.v1',
            locality: 'worktree',
            localWorkspace: '/projects/demo',
            worktreePath: '/Users/test/.codex/worktrees/demo-task',
            taskId: 'thread-1',
            startRef: 'feature/advanced-surfaces',
            startCommit: '1111111111111111111111111111111111111111',
            worktreeRetention: 'preserve_for_reuse_until_snapshotted_cleanup',
          },
        },
      },
      merge_extra: true,
    });
    expect(worktree).toBeChecked();
  });

  it('returns a Worktree task to its recorded Local workspace without creating another Worktree', async () => {
    render(
      <ConversationEnvironmentPopover
        conversation={
          {
            ...canonicalConversation,
            extra: {
              ...canonicalConversation.extra,
              workspace: '/Users/test/.codex/worktrees/demo-task',
              workspace_handoff: {
                schema: 'opl_workspace_handoff.v1',
                locality: 'worktree',
                localWorkspace: '/projects/demo',
                worktreePath: '/Users/test/.codex/worktrees/demo-task',
                taskId: 'thread-1',
                startRef: 'main',
                startCommit: '1111111111111111111111111111111111111111',
                worktreeRetention: 'preserve_for_reuse_until_snapshotted_cleanup',
              },
            },
          } as TChatConversation
        }
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Environment' }));

    const popover = await screen.findByTestId('conversation-environment-popover');
    const local = within(popover).getByRole('radio', { name: 'Local' });
    await waitFor(() => expect(local).toBeEnabled());
    fireEvent.click(local);

    await waitFor(() => expect(handoffApi.updateConversation).toHaveBeenCalledOnce());
    expect(handoffApi.ensureManagedWorktree).not.toHaveBeenCalled();
    expect(handoffApi.execute).toHaveBeenCalledWith({
      request: expect.objectContaining({ action: 'handoff', workspace: '/projects/demo' }),
    });
    expect(handoffApi.updateConversation.mock.calls[0][0]).toMatchObject({
      updates: {
        extra: {
          workspace: '/projects/demo',
          workspace_handoff: { locality: 'local', worktreePath: '/Users/test/.codex/worktrees/demo-task' },
        },
      },
    });
    expect(local).toBeChecked();
  });

  it('confirms cleanup, snapshots the managed Worktree, and keeps canonical cwd and projection on Local', async () => {
    render(<ConversationEnvironmentPopover conversation={managedWorktreeConversation} />);
    fireEvent.click(screen.getByRole('button', { name: 'Environment' }));

    const popover = await screen.findByTestId('conversation-environment-popover');
    const cleanupButton = within(popover).getByRole('button', { name: 'Create restore point and remove' });
    await waitFor(() => expect(cleanupButton).toBeEnabled());
    fireEvent.click(cleanupButton);

    expect(modalApi.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Remove managed Worktree?',
        okText: 'Create restore point and remove',
        cancelText: 'Cancel',
      })
    );
    expect(handoffApi.cleanupManagedWorktree).not.toHaveBeenCalled();

    const confirmation = modalApi.confirm.mock.calls[0][0] as { onOk: () => Promise<void> };
    await act(async () => confirmation.onOk());

    expect(handoffApi.execute).toHaveBeenCalledWith({
      request: expect.objectContaining({ action: 'handoff', workspace: '/projects/demo' }),
    });
    expect(handoffApi.cleanupManagedWorktree).toHaveBeenCalledWith({
      repositoryPath: '/projects/demo',
      taskId: 'thread-1',
      worktreePath: '/Users/test/.codex/worktrees/demo-task',
    });
    expect(handoffApi.updateConversation).toHaveBeenCalledTimes(2);
    expect(handoffApi.updateConversation.mock.calls[1][0]).toMatchObject({
      updates: {
        extra: {
          workspace: '/projects/demo',
          workspace_handoff: {
            locality: 'local',
            startCommit: snapshotReceipt.head,
            snapshot: snapshotReceipt,
          },
        },
      },
      merge_extra: true,
    });
    expect(await within(popover).findByRole('button', { name: 'Restore Worktree' })).toBeInTheDocument();
    expect(messageApi.success).toHaveBeenCalledWith('Restore point created and Worktree removed');
  });

  it('restores a snapshotted Worktree before moving canonical cwd and projection back to it', async () => {
    const snapshottedConversation = {
      ...canonicalConversation,
      extra: {
        ...canonicalConversation.extra,
        workspace: '/projects/demo',
        workspace_handoff: { ...worktreeHandoff, locality: 'local', snapshot: snapshotReceipt },
      },
    } as TChatConversation;
    render(<ConversationEnvironmentPopover conversation={snapshottedConversation} />);
    fireEvent.click(screen.getByRole('button', { name: 'Environment' }));

    const popover = await screen.findByTestId('conversation-environment-popover');
    const restoreButton = within(popover).getByRole('button', { name: 'Restore Worktree' });
    await waitFor(() => expect(restoreButton).toBeEnabled());
    expect(within(popover).getByRole('radio', { name: 'Worktree' })).toBeDisabled();
    fireEvent.click(restoreButton);

    expect(handoffApi.restoreManagedWorktree).not.toHaveBeenCalled();
    const confirmation = modalApi.confirm.mock.calls[0][0] as { onOk: () => Promise<void> };
    await act(async () => confirmation.onOk());

    expect(handoffApi.restoreManagedWorktree).toHaveBeenCalledWith({
      repositoryPath: '/projects/demo',
      snapshot: snapshotReceipt,
    });
    expect(handoffApi.restoreManagedWorktree.mock.invocationCallOrder[0]).toBeLessThan(
      handoffApi.execute.mock.invocationCallOrder[0]
    );
    expect(handoffApi.execute).toHaveBeenCalledWith({
      request: expect.objectContaining({
        action: 'handoff',
        workspace: '/Users/test/.codex/worktrees/demo-task',
      }),
    });
    expect(handoffApi.updateConversation).toHaveBeenCalledWith({
      id: 'conversation-1',
      updates: {
        extra: {
          workspace: '/Users/test/.codex/worktrees/demo-task',
          workspace_handoff: {
            ...worktreeHandoff,
            startRef: snapshotReceipt.head,
            startCommit: snapshotReceipt.head,
          },
        },
      },
      merge_extra: true,
    });
    expect(await within(popover).findByRole('button', { name: 'Create restore point and remove' })).toBeInTheDocument();
    expect(messageApi.success).toHaveBeenCalledWith('Worktree restored');
  });

  it('rolls canonical cwd and projection back to the Worktree when cleanup fails after snapshot rollback', async () => {
    handoffApi.cleanupManagedWorktree.mockRejectedValueOnce(new Error('remove failed after snapshot rollback'));
    render(<ConversationEnvironmentPopover conversation={managedWorktreeConversation} />);
    fireEvent.click(screen.getByRole('button', { name: 'Environment' }));

    const popover = await screen.findByTestId('conversation-environment-popover');
    const cleanupButton = within(popover).getByRole('button', { name: 'Create restore point and remove' });
    await waitFor(() => expect(cleanupButton).toBeEnabled());
    fireEvent.click(cleanupButton);
    const confirmation = modalApi.confirm.mock.calls[0][0] as { onOk: () => Promise<void> };
    await act(async () => confirmation.onOk());

    expect(handoffApi.execute).toHaveBeenCalledTimes(2);
    expect(handoffApi.execute.mock.calls[0][0].request.workspace).toBe('/projects/demo');
    expect(handoffApi.execute.mock.calls[1][0].request.workspace).toBe('/Users/test/.codex/worktrees/demo-task');
    expect(handoffApi.updateConversation).toHaveBeenCalledTimes(2);
    expect(handoffApi.updateConversation.mock.calls[1][0]).toEqual({
      id: 'conversation-1',
      updates: {
        extra: {
          workspace: '/Users/test/.codex/worktrees/demo-task',
          workspace_handoff: worktreeHandoff,
        },
      },
      merge_extra: true,
    });
    expect(handoffApi.restoreManagedWorktree).not.toHaveBeenCalled();
    expect(messageApi.error).toHaveBeenCalledWith('Worktree cleanup failed');
  });

  it('rolls the canonical cwd back when the local conversation projection cannot be saved', async () => {
    handoffApi.updateConversation.mockResolvedValueOnce(false);
    render(<ConversationEnvironmentPopover conversation={canonicalConversation} />);
    fireEvent.click(screen.getByRole('button', { name: 'Environment' }));

    const popover = await screen.findByTestId('conversation-environment-popover');
    const worktree = within(popover).getByRole('radio', { name: 'Worktree' });
    await waitFor(() => expect(worktree).toBeEnabled());
    fireEvent.click(worktree);

    await waitFor(() => expect(handoffApi.execute).toHaveBeenCalledTimes(2));
    expect(handoffApi.execute.mock.calls[0][0].request.workspace).toBe('/Users/test/.codex/worktrees/demo-task');
    expect(handoffApi.execute.mock.calls[1][0].request.workspace).toBe('/projects/demo');
    expect(handoffApi.execute.mock.invocationCallOrder[0]).toBeLessThan(
      handoffApi.updateConversation.mock.invocationCallOrder[0]
    );
    expect(handoffApi.updateConversation.mock.invocationCallOrder[0]).toBeLessThan(
      handoffApi.execute.mock.invocationCallOrder[1]
    );
    const status = within(popover).getByRole('status');
    expect(status).toHaveTextContent(
      'The local conversation could not be updated, so the task location was rolled back. Retry the location change.'
    );
    expect(within(popover).getByRole('radiogroup', { name: 'Task location' })).toHaveAccessibleDescription(
      status.textContent ?? ''
    );
    expect(messageApi.error).toHaveBeenCalledWith(
      'The local conversation could not be updated, so the task location was rolled back. Retry the location change.'
    );
    expect(within(popover).queryByRole('alert')).not.toBeInTheDocument();
    expect(worktree).toBeEnabled();
    expect(worktree).not.toBeChecked();
  });

  it('shows an accessible inconsistent state and allows retry when rollback is rejected', async () => {
    handoffApi.updateConversation.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    handoffApi.execute
      .mockResolvedValueOnce(acceptedHandoff)
      .mockResolvedValueOnce({
        ...acceptedHandoff,
        ok: false,
        outcome: 'rejected',
        errorCode: 'thread_not_writable',
        message: 'Rollback rejected',
      })
      .mockResolvedValueOnce(acceptedHandoff);
    render(<ConversationEnvironmentPopover conversation={canonicalConversation} />);
    fireEvent.click(screen.getByRole('button', { name: 'Environment' }));

    const popover = await screen.findByTestId('conversation-environment-popover');
    const worktree = within(popover).getByRole('radio', { name: 'Worktree' });
    await waitFor(() => expect(worktree).toBeEnabled());
    fireEvent.click(worktree);

    const alert = await within(popover).findByRole('alert');
    expect(alert).toHaveTextContent(
      'Task location is inconsistent with this conversation. Retry the location change to resynchronize.'
    );
    expect(messageApi.error).toHaveBeenCalledWith(
      'Task location is inconsistent with this conversation. Retry the location change to resynchronize.'
    );
    expect(within(popover).getByRole('radiogroup', { name: 'Task location' })).toHaveAttribute(
      'aria-describedby',
      alert.id
    );
    expect(worktree).toBeEnabled();
    expect(worktree).not.toBeChecked();

    fireEvent.click(worktree);

    await waitFor(() => expect(worktree).toBeChecked());
    expect(handoffApi.execute).toHaveBeenCalledTimes(3);
    expect(handoffApi.updateConversation).toHaveBeenCalledTimes(2);
    expect(within(popover).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an accessible inconsistent state when rollback throws', async () => {
    handoffApi.updateConversation.mockResolvedValueOnce(false);
    handoffApi.execute
      .mockResolvedValueOnce(acceptedHandoff)
      .mockRejectedValueOnce(new Error('rollback transport failed'));
    render(<ConversationEnvironmentPopover conversation={canonicalConversation} />);
    fireEvent.click(screen.getByRole('button', { name: 'Environment' }));

    const popover = await screen.findByTestId('conversation-environment-popover');
    const worktree = within(popover).getByRole('radio', { name: 'Worktree' });
    await waitFor(() => expect(worktree).toBeEnabled());
    fireEvent.click(worktree);

    const alert = await within(popover).findByRole('alert');
    expect(alert).toHaveTextContent(
      'Task location is inconsistent with this conversation. Retry the location change to resynchronize.'
    );
    expect(messageApi.error).toHaveBeenCalledWith(
      'Task location is inconsistent with this conversation. Retry the location change to resynchronize.'
    );
    expect(within(popover).getByRole('radiogroup', { name: 'Task location' })).toHaveAccessibleDescription(
      alert.textContent ?? ''
    );
    expect(worktree).toBeEnabled();
    expect(worktree).not.toBeChecked();
  });

  it('keeps task-location controls unavailable while the canonical turn is running', async () => {
    handoffApi.getOverview.mockResolvedValueOnce({
      ...(await handoffApi.getOverview()),
      threads: [
        {
          ...(await handoffApi.getOverview()).threads[0],
          status: 'running',
          activeTurnId: 'turn-1',
        },
      ],
    });
    render(<ConversationEnvironmentPopover conversation={canonicalConversation} />);
    fireEvent.click(screen.getByRole('button', { name: 'Environment' }));

    const popover = await screen.findByTestId('conversation-environment-popover');
    await waitFor(() =>
      expect(within(popover).getByTestId('environment-handoff-status')).toHaveTextContent(
        'Finish the running turn first'
      )
    );
    expect(within(popover).getByRole('radio', { name: 'Worktree' })).toBeDisabled();
  });
});
