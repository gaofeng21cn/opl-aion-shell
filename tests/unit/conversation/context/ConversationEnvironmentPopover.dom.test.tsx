import type { TChatConversation } from '@/common/config/storage';
import ConversationEnvironmentPopover from '@/renderer/pages/conversation/components/ChatLayout/ConversationEnvironmentPopover';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const snapshotApi = vi.hoisted(() => ({
  getInfo: vi.fn(),
  compare: vi.fn(),
}));
const workspaceEvents = vi.hoisted(() => ({ toggle: vi.fn() }));
const previewContext = vi.hoisted(() => ({ openPreview: vi.fn() }));
const handoffApi = vi.hoisted(() => ({
  getOverview: vi.fn(),
  execute: vi.fn(),
  inspect: vi.fn(),
  ensureManagedWorktree: vi.fn(),
  updateConversation: vi.fn(),
}));
const messageApi = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      ...actual.Message,
      success: messageApi.success,
      error: messageApi.error,
    },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    fileSnapshot: {
      getInfo: { invoke: snapshotApi.getInfo },
      compare: { invoke: snapshotApi.compare },
    },
    threadCoordination: {
      getOverview: { invoke: handoffApi.getOverview },
      execute: { invoke: handoffApi.execute },
    },
    gitWorkspace: {
      inspect: { invoke: handoffApi.inspect },
      ensureManagedWorktree: { invoke: handoffApi.ensureManagedWorktree },
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
        'conversation.environment.projectionUpdateFailed': 'Projection update failed',
        'conversation.environment.localWorkspaceUnavailable': 'Local workspace unavailable',
        'conversation.environment.worktreeUnavailable': 'Worktree needs coordination',
        'conversation.environment.worktreeCreateFailed': 'Worktree creation failed',
        'conversation.environment.branch': 'Branch',
        'conversation.environment.changes': 'Changes',
        'conversation.environment.subtasks': 'Subtasks',
        'conversation.environment.sources': 'Sources',
        'conversation.environment.taskReferences': 'Task references',
        'conversation.environment.artifacts': 'Artifacts',
        'conversation.environment.evidence': 'Evidence',
        'conversation.environment.receipts': 'Receipts',
        'conversation.environment.openFiles': 'Open files',
        'conversation.environment.filesOpen': 'Files open',
        'conversation.environment.moreRefs': `${options?.count ?? 0} more`,
        'conversation.sidePanel.browserAddress': 'Web address',
        'conversation.sidePanel.openBrowser': 'Open address',
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
  protocolMethod: 'thread/settings/update',
  auditId: 'audit-1',
  errorCode: null,
  message: 'Accepted',
  advisories: [],
};

describe('ConversationEnvironmentPopover', () => {
  beforeEach(() => {
    snapshotApi.getInfo.mockReset().mockResolvedValue({ mode: 'git-repo', branch: 'feature/advanced-surfaces' });
    snapshotApi.compare.mockReset().mockResolvedValue({
      staged: [{ file_path: '/projects/demo/a.ts', relativePath: 'a.ts', operation: 'modify' }],
      unstaged: [
        { file_path: '/projects/demo/b.ts', relativePath: 'b.ts', operation: 'create' },
        { file_path: '/projects/demo/c.ts', relativePath: 'c.ts', operation: 'delete' },
      ],
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
    handoffApi.inspect.mockReset().mockResolvedValue({
      root: '/projects/demo',
      head: '1111111111111111111111111111111111111111',
      currentBranch: 'main',
    });
    handoffApi.ensureManagedWorktree.mockReset().mockResolvedValue({
      status: 'created',
      repositoryRoot: '/projects/demo',
      targetPath: '/Users/test/.codex/worktrees/demo-task',
      startRef: 'main',
      startCommit: '1111111111111111111111111111111111111111',
    });
    handoffApi.updateConversation.mockReset().mockResolvedValue(true);
    messageApi.success.mockReset();
    messageApi.error.mockReset();
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

    fireEvent.click(screen.getByRole('button', { name: 'Environment' }));

    const popover = await screen.findByTestId('conversation-environment-popover');
    await waitFor(() => expect(within(popover).getByText('feature/advanced-surfaces')).toBeInTheDocument());
    expect(within(popover).getByText('/projects/demo')).toBeInTheDocument();
    expect(within(popover).getByText('Local')).toBeInTheDocument();
    expect(within(popover).getByText('Changes').parentElement).toHaveTextContent('3');
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

  it('shows a factual no-workspace state without requesting snapshot data or inventing task details', async () => {
    render(<ConversationEnvironmentPopover conversation={{ ...conversation, extra: {} } as TChatConversation} />);

    fireEvent.click(screen.getByRole('button', { name: 'Environment' }));

    const popover = await screen.findByTestId('conversation-environment-popover');
    expect(within(popover).getByText('No active workspace')).toBeInTheDocument();
    expect(within(popover).getByText('Local')).toBeInTheDocument();
    expect(within(popover).queryByText('Branch')).not.toBeInTheDocument();
    expect(within(popover).queryByText('Changes')).not.toBeInTheDocument();
    expect(within(popover).queryByText('Task references')).not.toBeInTheDocument();
    expect(within(popover).queryByRole('button', { name: 'Open files' })).not.toBeInTheDocument();
    expect(snapshotApi.getInfo).not.toHaveBeenCalled();
    expect(snapshotApi.compare).not.toHaveBeenCalled();
  });

  it('hides branch and change rows when live snapshot reads fail', async () => {
    snapshotApi.getInfo.mockRejectedValue(new Error('snapshot unavailable'));
    snapshotApi.compare.mockRejectedValue(new Error('compare unavailable'));

    render(<ConversationEnvironmentPopover conversation={conversation} />);
    fireEvent.click(screen.getByRole('button', { name: 'Environment' }));

    const popover = await screen.findByTestId('conversation-environment-popover');
    await waitFor(() => expect(snapshotApi.compare).toHaveBeenCalledTimes(1));
    expect(within(popover).queryByText('Branch')).not.toBeInTheDocument();
    expect(within(popover).queryByText('Changes')).not.toBeInTheDocument();
    expect(within(popover).queryByText('Unavailable')).not.toBeInTheDocument();
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
    expect(handoffApi.inspect).toHaveBeenCalledWith({ cwd: '/projects/demo' });
    expect(handoffApi.ensureManagedWorktree).toHaveBeenCalledWith({
      repositoryPath: '/projects/demo',
      taskId: 'thread-1',
      startRef: 'main',
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
            startRef: 'main',
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
