import type { TChatConversation } from '@/common/config/storage';
import ConversationEnvironmentPopover from '@/renderer/pages/conversation/components/ChatLayout/ConversationEnvironmentPopover';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const gitWorkspaceApi = vi.hoisted(() => ({ inspect: vi.fn() }));
const workspaceEvents = vi.hoisted(() => ({ toggle: vi.fn() }));
const previewContext = vi.hoisted(() => ({ openPreview: vi.fn() }));

vi.mock('@/common', () => ({
  ipcBridge: {
    gitWorkspace: {
      inspect: { invoke: gitWorkspaceApi.inspect },
    },
  },
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
        'conversation.environment.remote': 'Remote',
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

const liveInspection = {
  cwd: '/projects/demo',
  root: '/projects',
  head: '1111111111111111111111111111111111111111',
  currentBranch: 'feature/advanced-surfaces',
  dirty: true,
  staged: true,
  branches: [],
  worktrees: [],
  pullRequest: {
    status: 'available' as const,
    number: 42,
    title: 'Environment Git summary',
    url: 'https://github.com/example/repo/pull/42',
    state: 'OPEN',
    isDraft: false,
    headRefName: 'feature/advanced-surfaces',
    baseRefName: 'main',
  },
};

async function openEnvironment(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: 'Environment' }));
  return screen.findByTestId('conversation-environment-popover');
}

describe('ConversationEnvironmentPopover', () => {
  beforeEach(() => {
    gitWorkspaceApi.inspect.mockReset().mockResolvedValue(liveInspection);
    workspaceEvents.toggle.mockReset();
    previewContext.openPreview.mockReset();
  });

  it('renders the recorded workspace and live Git context without mutation controls', async () => {
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
    const popover = await openEnvironment();

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
    expect(within(popover).queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(within(popover).queryByRole('button', { name: /working directory/i })).not.toBeInTheDocument();

    fireEvent.click(within(popover).getByRole('button', { name: 'Open files' }));
    expect(workspaceEvents.toggle).toHaveBeenCalledTimes(1);
    expect(within(popover).getByRole('button', { name: 'Open terminal' })).toBeInTheDocument();
  });

  it('shows a factual no-workspace state without requesting Git inspection or inventing task details', async () => {
    render(<ConversationEnvironmentPopover conversation={{ ...conversation, extra: {} } as TChatConversation} />);
    const popover = await openEnvironment();

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
    const popover = await openEnvironment();

    await waitFor(() => expect(gitWorkspaceApi.inspect).toHaveBeenCalledTimes(1));
    expect(within(popover).getByText('Git').parentElement).toHaveTextContent('Unavailable');
    expect(within(popover).queryByText('Repository root')).not.toBeInTheDocument();
    expect(within(popover).queryByText('Branch')).not.toBeInTheDocument();
    expect(within(popover).queryByText('Changes')).not.toBeInTheDocument();
    expect(within(popover).queryByText('Pull request')).not.toBeInTheDocument();
  });

  it('shows unavailable PR context when gh cannot provide a trustworthy read', async () => {
    gitWorkspaceApi.inspect.mockResolvedValue({
      ...liveInspection,
      currentBranch: 'feature/no-gh',
      dirty: false,
      staged: false,
      pullRequest: { status: 'unavailable', reason: 'gh_not_found' },
    });
    render(<ConversationEnvironmentPopover conversation={conversation} />);
    const popover = await openEnvironment();

    await waitFor(() => expect(within(popover).getByText('feature/no-gh')).toBeInTheDocument());
    expect(within(popover).getByText('Changes').parentElement).toHaveTextContent('Clean');
    expect(within(popover).getByText('Pull request').parentElement).toHaveTextContent('Unavailable');
  });

  it('hides PR context when the inspected branch has no current pull request', async () => {
    gitWorkspaceApi.inspect.mockResolvedValue({
      ...liveInspection,
      currentBranch: 'feature/no-pr',
      dirty: false,
      staged: false,
      pullRequest: { status: 'unavailable', reason: 'no_current_pull_request' },
    });
    render(<ConversationEnvironmentPopover conversation={conversation} />);
    const popover = await openEnvironment();

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
    const popover = await openEnvironment();

    expect(within(popover).getByText('Remote')).toBeInTheDocument();
    expect(within(popover).getByText('Git').parentElement).toHaveTextContent('Unavailable');
    expect(within(popover).queryByText('Repository root')).not.toBeInTheDocument();
    expect(gitWorkspaceApi.inspect).not.toHaveBeenCalled();
  });

  it('opens an http browser preview from Environment without restoring the legacy Browser tab', async () => {
    render(<ConversationEnvironmentPopover conversation={conversation} />);
    const popover = await openEnvironment();
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
    const popover = await openEnvironment();
    const input = within(popover).getByRole('textbox', { name: 'Web address' });
    fireEvent.change(input, { target: { value: 'http://' } });
    fireEvent.click(within(popover).getByRole('button', { name: 'Open address' }));

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(previewContext.openPreview).not.toHaveBeenCalled();
  });
});
