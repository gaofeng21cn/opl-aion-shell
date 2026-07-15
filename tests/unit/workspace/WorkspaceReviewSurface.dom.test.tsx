/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GitWorkspaceInspection } from '@/common/types/platform/gitWorkspace';
import type { TMessage } from '@/common/chat/chatLib';
import FileChangeList from '@/renderer/pages/conversation/Workspace/components/FileChangeList';
import WorkspaceReviewSurface from '@/renderer/pages/conversation/Workspace/components/WorkspaceReviewSurface';
import { MessageListProvider } from '@/renderer/pages/conversation/Messages/hooks';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TFunction } from 'i18next';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConversation: vi.fn(),
  startReview: vi.fn(),
  inspect: vi.fn(),
  commitStaged: vi.fn(),
  pushCurrentBranch: vi.fn(),
  messageSuccess: vi.fn(),
  messageError: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: { get: { invoke: mocks.getConversation } },
    codexThreads: { startReview: { invoke: mocks.startReview } },
    gitWorkspace: {
      inspect: { invoke: mocks.inspect },
      commitStaged: { invoke: mocks.commitStaged },
      pushCurrentBranch: { invoke: mocks.pushCurrentBranch },
    },
    fileSnapshot: {
      getBaselineContent: { invoke: vi.fn() },
    },
    fs: {
      readFile: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/renderer/components/media/Diff2Html', () => ({
  default: () => <div>diff</div>,
}));

vi.mock('@/renderer/services/FileService', () => ({
  isTextFile: () => true,
}));

vi.mock('@arco-design/web-react', async () => {
  const ReactModule = await import('react');
  type RadioContextValue = {
    value: string;
    disabled: boolean;
    onChange?: (value: string) => void;
  };
  const RadioContext = ReactModule.createContext<RadioContextValue>({ value: '', disabled: false });

  const Input = Object.assign(
    ({
      value,
      onChange,
      ...props
    }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> & { onChange?: (value: string) => void }) => (
      <input {...props} value={value} onChange={(event) => onChange?.(event.target.value)} />
    ),
    {
      TextArea: ({
        value,
        onChange,
        autoSize: _autoSize,
        ...props
      }: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> & {
        autoSize?: unknown;
        onChange?: (value: string) => void;
      }) => <textarea {...props} value={value} onChange={(event) => onChange?.(event.target.value)} />,
    }
  );

  const Select = Object.assign(
    ({
      value,
      onChange,
      children,
      allowCreate: _allowCreate,
      showSearch: _showSearch,
      ...props
    }: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> & {
      allowCreate?: boolean;
      showSearch?: boolean;
      onChange?: (value: string) => void;
    }) => (
      <select {...props} value={value ?? ''} onChange={(event) => onChange?.(event.target.value)}>
        <option value='' />
        {children}
      </select>
    ),
    {
      Option: ({ value, children }: React.OptionHTMLAttributes<HTMLOptionElement>) => (
        <option value={value}>{children}</option>
      ),
    }
  );

  const Radio = Object.assign(
    ({ value, children }: React.PropsWithChildren<{ value: string }>) => {
      const context = ReactModule.useContext(RadioContext);
      return (
        <label>
          <input
            type='radio'
            value={value}
            checked={context.value === value}
            disabled={context.disabled}
            onChange={() => context.onChange?.(value)}
          />
          {children}
        </label>
      );
    },
    {
      Group: ({
        value,
        disabled = false,
        onChange,
        children,
        type: _type,
        ...props
      }: React.PropsWithChildren<{
        value: string;
        disabled?: boolean;
        onChange?: (value: string) => void;
        type?: string;
      }>) => (
        <div {...props} role='radiogroup'>
          <RadioContext.Provider value={{ value, disabled, onChange }}>{children}</RadioContext.Provider>
        </div>
      ),
    }
  );

  return {
    Alert: ({ content }: { content: React.ReactNode }) => <div role='alert'>{content}</div>,
    Button: ({
      children,
      onClick,
      disabled,
      loading: _loading,
      icon: _icon,
      shape: _shape,
      size: _size,
      type: _type,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & Record<string, unknown>) => (
      <button {...props} type='button' disabled={disabled} onClick={onClick}>
        {children}
      </button>
    ),
    Empty: ({ description }: { description: React.ReactNode }) => <div>{description}</div>,
    Input,
    Message: { success: mocks.messageSuccess, error: mocks.messageError },
    Modal: ({
      visible,
      title,
      children,
      onCancel,
    }: React.PropsWithChildren<{ visible: boolean; title: React.ReactNode; onCancel?: () => void }>) =>
      visible ? (
        <div role='dialog' aria-label={String(title)}>
          <button type='button' aria-label='modal-close' onClick={onCancel} />
          {children}
        </div>
      ) : null,
    Radio,
    Select,
    Spin: () => <div>loading</div>,
    Tag: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
    Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
  };
});

const HEAD = '0123456789abcdef0123456789abcdef01234567';
const t = ((key: string, options?: Record<string, unknown>) => {
  if (options?.sha) return `${key}:${String(options.sha)}`;
  if (options?.branch) return `${key}:${String(options.branch)}`;
  return key;
}) as TFunction;

function inspection(overrides: Partial<GitWorkspaceInspection> = {}): GitWorkspaceInspection {
  return {
    cwd: '/workspace/project',
    root: '/workspace/project',
    head: HEAD,
    currentBranch: 'feature/review',
    dirty: true,
    staged: true,
    branches: [
      {
        name: 'main',
        fullRef: 'refs/heads/main',
        head: HEAD,
        kind: 'local',
        current: false,
        upstream: 'origin/main',
        upstreamTrack: null,
        checkedOutAt: null,
      },
      {
        name: 'feature/review',
        fullRef: 'refs/heads/feature/review',
        head: HEAD,
        kind: 'local',
        current: true,
        upstream: 'origin/feature/review',
        upstreamTrack: null,
        checkedOutAt: '/workspace/project',
      },
    ],
    worktrees: [],
    pullRequest: { status: 'unavailable', reason: 'gh_not_found' },
    ...overrides,
  };
}

function renderSurface(
  overrides: Partial<React.ComponentProps<typeof WorkspaceReviewSurface>> = {},
  messages: TMessage[] = []
) {
  const onRefreshChanges = vi.fn();
  render(
    <MessageListProvider value={messages}>
      <WorkspaceReviewSurface
        t={t}
        conversationId='conversation-current'
        workspace='/workspace/project'
        stagedCount={2}
        onRefreshChanges={onRefreshChanges}
        {...overrides}
      />
    </MessageListProvider>
  );
  return { onRefreshChanges };
}

function userMessage(id: string, content: string): TMessage {
  return {
    id,
    msg_id: id,
    conversation_id: 'conversation-current',
    type: 'text',
    position: 'right',
    content: { content },
  };
}

function editMessage(id: string, filePath: string, status: 'completed' | 'failed' = 'completed'): TMessage {
  return {
    id,
    msg_id: id,
    conversation_id: 'conversation-current',
    type: 'acp_tool_call',
    position: 'left',
    content: {
      session_id: 'thread-current',
      update: {
        sessionUpdate: 'tool_call',
        tool_call_id: id,
        status,
        title: `Edit ${filePath}`,
        kind: 'edit',
        rawInput: { file_path: filePath },
        content: [{ type: 'diff', path: filePath, old_text: 'before', new_text: 'after' }],
        locations: [{ path: filePath }],
      },
    },
  };
}

async function openSurface() {
  const user = userEvent.setup();
  const trigger = screen.getByRole('button', { name: 'conversation.workspace.review.open' });
  await user.tab();
  expect(document.activeElement).toBe(trigger);
  await user.keyboard('{Enter}');
  await screen.findByRole('dialog', { name: 'conversation.workspace.review.title' });
  await screen.findByText('feature/review');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'conversation.workspace.review.startReview' })).toBeEnabled()
  );
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConversation.mockResolvedValue({
    type: 'acp',
    extra: { backend: 'codex', acp_session_id: 'thread-current' },
  });
  mocks.inspect.mockResolvedValue(inspection());
  mocks.startReview.mockResolvedValue({
    reviewThreadId: 'review-thread',
    turnId: 'review-turn',
  });
  mocks.commitStaged.mockResolvedValue({
    root: '/workspace/project',
    branch: 'feature/review',
    commitSha: HEAD,
  });
  mocks.pushCurrentBranch.mockResolvedValue({
    root: '/workspace/project',
    branch: 'feature/review',
    remote: 'origin',
    upstream: 'origin/feature/review',
  });
});

describe('Workspace review surface', () => {
  it('keeps the review entry visible for an empty change list without loading review context early', () => {
    render(
      <FileChangeList
        t={t}
        conversationId='conversation-current'
        workspace='/workspace/project'
        staged={[]}
        unstaged={[]}
        loading={false}
        snapshotInfo={{ mode: 'git-repo', branch: 'feature/review' }}
        onRefresh={vi.fn()}
        onOpenDiff={vi.fn()}
        onStageFile={vi.fn()}
        onStageAll={vi.fn()}
        onUnstageFile={vi.fn()}
        onUnstageAll={vi.fn()}
        onDiscardFile={vi.fn()}
        onResetFile={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'conversation.workspace.review.open' })).toBeVisible();
    expect(mocks.getConversation).not.toHaveBeenCalled();
    expect(mocks.inspect).not.toHaveBeenCalled();
  });

  it.each([
    ['gh_not_found', 'ghNotFound'],
    ['no_current_pull_request', 'noCurrentPullRequest'],
  ] as const)('opens from the keyboard and reports %s as unavailable', async (reason, reasonKey) => {
    mocks.inspect.mockResolvedValueOnce(
      inspection({
        pullRequest: { status: 'unavailable', reason },
      })
    );
    renderSurface();
    await openSurface();

    expect(screen.getByText('conversation.workspace.review.unavailable')).toBeVisible();
    expect(screen.getByText(`conversation.workspace.review.pullRequestUnavailable.${reasonKey}`)).toBeVisible();
    expect(mocks.inspect).toHaveBeenCalledWith({ cwd: '/workspace/project' });
  });

  it('renders the pull request returned by gitWorkspace.inspect', async () => {
    mocks.inspect.mockResolvedValueOnce(
      inspection({
        pullRequest: {
          status: 'available',
          number: 42,
          title: 'Workspace review surface',
          url: 'https://example.invalid/pull/42',
          state: 'OPEN',
          isDraft: false,
          headRefName: 'feature/review',
          baseRefName: 'main',
        },
      })
    );
    renderSurface();
    await openSurface();

    expect(screen.getByText('#42 Workspace review surface')).toBeVisible();
    expect(screen.getByText('main <- feature/review')).toBeVisible();
  });

  it('shows successful file edits from the latest user turn through the existing message store', async () => {
    renderSurface({}, [
      userMessage('user-old', 'Older request'),
      editMessage('edit-old', '/workspace/project/src/old.ts'),
      userMessage('user-latest', 'Latest request'),
      editMessage('edit-current', '/workspace/project/src/current.ts'),
      editMessage('edit-failed', '/workspace/project/src/failed.ts', 'failed'),
    ]);
    await openSurface();

    expect(screen.getByText('conversation.workspace.review.lastTurnTitle')).toBeVisible();
    expect(screen.getByText('src/current.ts')).toBeVisible();
    expect(screen.queryByText('src/old.ts')).not.toBeInTheDocument();
    expect(screen.queryByText('src/failed.ts')).not.toBeInTheDocument();
  });

  it('shows an explicit empty state when the latest turn has no successful file edits', async () => {
    renderSurface({}, [
      userMessage('user-latest', 'Read the project'),
      editMessage('read-failed', 'src/nope.ts', 'failed'),
    ]);
    await openSurface();

    expect(screen.getByText('conversation.workspace.review.lastTurnEmpty')).toBeVisible();
  });

  it.each([
    {
      name: 'uncommitted changes inline',
      targetType: 'uncommittedChanges',
      delivery: 'inline',
      expectedTarget: { type: 'uncommittedChanges' },
    },
    {
      name: 'base branch detached',
      targetType: 'baseBranch',
      delivery: 'detached',
      expectedTarget: { type: 'baseBranch', branch: 'main' },
    },
    {
      name: 'commit inline',
      targetType: 'commit',
      delivery: 'inline',
      expectedTarget: { type: 'commit', sha: 'abcdef123456', title: null },
    },
    {
      name: 'custom detached',
      targetType: 'custom',
      delivery: 'detached',
      expectedTarget: { type: 'custom', instructions: 'Review only the Workspace boundary.' },
    },
  ])('starts a $name review through the Codex app-server adapter', async (testCase) => {
    renderSurface();
    const user = await openSurface();

    await user.selectOptions(screen.getByLabelText('conversation.workspace.review.targetLabel'), testCase.targetType);
    if (testCase.targetType === 'baseBranch') {
      await user.selectOptions(screen.getByLabelText('conversation.workspace.review.baseBranchPlaceholder'), 'main');
    }
    if (testCase.targetType === 'commit') {
      const input = screen.getByLabelText('conversation.workspace.review.commitPlaceholder');
      await user.clear(input);
      await user.type(input, 'abcdef123456');
    }
    if (testCase.targetType === 'custom') {
      await user.type(
        screen.getByLabelText('conversation.workspace.review.customPlaceholder'),
        'Review only the Workspace boundary.'
      );
    }
    if (testCase.delivery === 'detached') {
      await user.click(screen.getByLabelText('conversation.workspace.review.delivery.detached'));
    }
    await user.click(screen.getByRole('button', { name: 'conversation.workspace.review.startReview' }));

    await waitFor(() => expect(mocks.startReview).toHaveBeenCalledOnce());
    expect(mocks.startReview).toHaveBeenCalledWith({
      threadId: 'thread-current',
      target: testCase.expectedTarget,
      delivery: testCase.delivery,
    });
  });

  it('does not report success for a malformed review response', async () => {
    mocks.startReview.mockResolvedValueOnce({ reviewThreadId: '', turnId: '' });
    renderSurface();
    const user = await openSurface();

    await user.click(screen.getByRole('button', { name: 'conversation.workspace.review.startReview' }));

    await waitFor(() => expect(mocks.messageError).toHaveBeenCalledWith('conversation.workspace.review.reviewFailed'));
    expect(mocks.messageSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'conversation.workspace.review.title' })).toBeVisible();
  });

  it('does not report success when review/start rejects', async () => {
    mocks.startReview.mockRejectedValueOnce(new Error('Review unavailable'));
    renderSurface();
    const user = await openSurface();

    await user.click(screen.getByRole('button', { name: 'conversation.workspace.review.startReview' }));

    await waitFor(() => expect(mocks.messageError).toHaveBeenCalledWith('conversation.workspace.review.reviewFailed'));
    expect(mocks.messageSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'conversation.workspace.review.title' })).toBeVisible();
  });

  it('commits only staged changes through gitWorkspace and refreshes fileSnapshot data', async () => {
    const { onRefreshChanges } = renderSurface();
    const user = await openSurface();
    await user.type(
      screen.getByLabelText('conversation.workspace.review.commitMessagePlaceholder'),
      'feat(workspace): add review surface'
    );
    await user.click(screen.getByRole('button', { name: 'conversation.workspace.review.commitStaged' }));

    await waitFor(() => expect(mocks.commitStaged).toHaveBeenCalledOnce());
    expect(mocks.commitStaged).toHaveBeenCalledWith({
      cwd: '/workspace/project',
      message: 'feat(workspace): add review surface',
    });
    expect(onRefreshChanges).toHaveBeenCalledOnce();
  });

  it('pushes the current branch through gitWorkspace', async () => {
    renderSurface();
    const user = await openSurface();
    await user.click(screen.getByRole('button', { name: 'conversation.workspace.review.pushCurrentBranch' }));

    await waitFor(() => expect(mocks.pushCurrentBranch).toHaveBeenCalledOnce());
    expect(mocks.pushCurrentBranch).toHaveBeenCalledWith({ cwd: '/workspace/project' });
  });

  it('surfaces push failures without mutating another Git state path', async () => {
    mocks.pushCurrentBranch.mockRejectedValueOnce(new Error('Current branch has no configured upstream.'));
    renderSurface();
    const user = await openSurface();
    await user.click(screen.getByRole('button', { name: 'conversation.workspace.review.pushCurrentBranch' }));

    await waitFor(() => expect(mocks.messageError).toHaveBeenCalledWith('Current branch has no configured upstream.'));
    expect(mocks.commitStaged).not.toHaveBeenCalled();
  });

  it('fails closed when the current Codex thread cannot be resolved', async () => {
    mocks.getConversation.mockResolvedValueOnce({ type: 'acp', extra: { backend: 'codex' } });
    renderSurface();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'conversation.workspace.review.open' }));
    await screen.findByText('conversation.workspace.review.threadUnavailable');

    expect(screen.getByRole('button', { name: 'conversation.workspace.review.startReview' })).toBeDisabled();
    expect(mocks.startReview).not.toHaveBeenCalled();
  });
});
