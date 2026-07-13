import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ThreadCoordinationOverview } from '@/common/types/codex/threadCoordination';
import ThreadCoordinationSection from '@/renderer/pages/conversation/GroupedHistory/ThreadCoordination';

const mocks = vi.hoisted(() => ({
  getConversation: vi.fn(),
  getOverview: vi.fn(),
  readThread: vi.fn(),
  execute: vi.fn(),
  autoSizes: [] as unknown[],
  translate: (key: string) => key,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: { get: { invoke: mocks.getConversation } },
    threadCoordination: {
      getOverview: { invoke: mocks.getOverview },
      readThread: { invoke: mocks.readThread },
      execute: { invoke: mocks.execute },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mocks.translate }),
}));

vi.mock('@arco-design/web-react', () => {
  const Input = Object.assign(
    ({
      value,
      onChange,
      placeholder,
      ...props
    }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> & { onChange?: (value: string) => void }) => (
      <input {...props} value={value} aria-label={placeholder} onChange={(event) => onChange?.(event.target.value)} />
    ),
    {
      TextArea: ({
        value,
        onChange,
        placeholder,
        autoSize,
        ...props
      }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
        autoSize?: unknown;
        onChange?: (value: string) => void;
      }) => {
        mocks.autoSizes.push(autoSize);
        return (
          <textarea
            {...props}
            value={value}
            aria-label={placeholder}
            onChange={(event) => onChange?.(event.target.value)}
          />
        );
      },
    }
  );
  const Select = Object.assign(
    ({
      value,
      onChange,
      children,
      ...props
    }: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> & { onChange?: (value: string) => void }) => (
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
  return {
    Alert: ({ title, content }: { title: React.ReactNode; content: React.ReactNode }) => (
      <div>
        {title}
        {content}
      </div>
    ),
    Button: ({
      children,
      onClick,
      disabled,
      loading: _loading,
      icon: _icon,
      shape: _shape,
      status: _status,
      type: _type,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & Record<string, unknown>) => (
      <button {...props} type='button' disabled={disabled} onClick={onClick}>
        {children}
      </button>
    ),
    Drawer: ({ visible, children }: React.PropsWithChildren<{ visible: boolean }>) =>
      visible ? <div>{children}</div> : null,
    Empty: ({ description }: { description: React.ReactNode }) => <div>{description}</div>,
    Input,
    Message: { success: vi.fn(), error: vi.fn() },
    Select,
    Spin: () => <div>loading</div>,
    Tag: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
    Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
  };
});

function overview(overrides: Partial<ThreadCoordinationOverview> = {}): ThreadCoordinationOverview {
  return {
    schema: 'opl_codex_thread_coordination_overview.v1',
    availability: {
      status: 'available',
      host: 'local-host',
      protocolVersion: 'v2',
      methods: [
        'thread/list',
        'thread/read',
        'thread/resume',
        'thread/fork',
        'thread/archive',
        'thread/unarchive',
        'review/start',
        'turn/start',
        'turn/steer',
      ],
      reasonCode: null,
      detail: null,
    },
    currentThreadId: 'source',
    currentProjectId: 'project-a',
    threads: [
      {
        id: 'source',
        title: 'Source thread',
        summary: 'Source summary',
        status: 'idle',
        projectId: 'project-a',
        workspace: '/workspace/a',
        host: 'local-host',
        owner: 'owner-a',
        goal: 'Source goal',
        parentThreadId: null,
        ancestorThreadIds: [],
        activeTurnId: null,
        activeWriteSet: [],
        activePermission: null,
        archived: false,
        updatedAt: '2026-07-13T01:00:00.000Z',
      },
      {
        id: 'receiver',
        title: 'Receiver thread',
        summary: 'Receiver summary',
        status: 'idle',
        projectId: 'project-a',
        workspace: '/workspace/a',
        host: 'local-host',
        owner: 'owner-b',
        goal: 'Receiver goal',
        parentThreadId: null,
        ancestorThreadIds: [],
        activeTurnId: null,
        activeWriteSet: [],
        activePermission: null,
        archived: false,
        updatedAt: '2026-07-13T01:00:00.000Z',
      },
    ],
    audit: [],
    ...overrides,
  };
}

function renderSection() {
  return render(
    <MemoryRouter initialEntries={['/conversation/aion-conversation']}>
      <Routes>
        <Route
          path='/conversation/:id'
          element={<ThreadCoordinationSection collapsed={false} tooltipEnabled={false} />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('ThreadCoordinationSection', () => {
  beforeEach(() => {
    mocks.autoSizes.length = 0;
    mocks.execute.mockReset();
    mocks.getConversation.mockResolvedValue({
      id: 'aion-conversation',
      type: 'acp',
      extra: { backend: 'codex', acp_session_id: 'source' },
    });
    mocks.getOverview.mockResolvedValue(overview());
    mocks.readThread.mockResolvedValue({ ok: true, detail: { thread: overview().threads[0], history: [] } });
    mocks.execute.mockResolvedValue({
      ok: true,
      outcome: 'accepted',
      action: 'deliver',
      targetThreadId: 'receiver',
      forkedThreadId: null,
      reviewThreadId: null,
      protocolMethod: 'turn/start',
      auditId: 'audit',
      errorCode: null,
      message: 'Accepted',
      advisories: [],
    });
    vi.stubGlobal('crypto', { randomUUID: () => 'delivery-id' });
  });

  it('passes a real persisted Codex session id as a hint and supports explicit sender selection', async () => {
    mocks.getOverview.mockResolvedValue(overview({ currentThreadId: null, currentProjectId: null }));
    renderSection();

    await waitFor(() =>
      expect(mocks.getOverview).toHaveBeenCalledWith({ includeArchived: true, sourceThreadIdHint: 'source' })
    );
    fireEvent.click(screen.getByTestId('thread-coordination-entry'));
    fireEvent.click(await screen.findByTestId('thread-coordination-thread-receiver'));
    fireEvent.change(screen.getByLabelText('conversation.threadCoordination.sender'), { target: { value: 'source' } });
    fireEvent.change(screen.getByLabelText('conversation.threadCoordination.reasonPlaceholder'), {
      target: { value: 'Coordinate review' },
    });
    fireEvent.change(screen.getByLabelText('conversation.threadCoordination.messagePlaceholder'), {
      target: { value: 'Read the boundary' },
    });
    fireEvent.click(screen.getByText('common.send'));

    await waitFor(() =>
      expect(mocks.execute).toHaveBeenCalledWith({
        request: expect.objectContaining({
          sourceThreadId: 'source',
          targetThreadId: 'receiver',
          permission: 'inherit',
          writeSet: [],
        }),
      })
    );
  });

  it('keeps the Sider entry closed by default and opens it from the keyboard', async () => {
    renderSection();

    const entry = await screen.findByTestId('thread-coordination-entry');
    expect(screen.queryByText('conversation.threadCoordination.threadList')).not.toBeInTheDocument();
    fireEvent.keyDown(entry, { key: 'Enter' });

    expect(await screen.findByText('conversation.threadCoordination.threadList')).toBeInTheDocument();
  });

  it('keeps the message TextArea autoSize object stable across React rerenders', async () => {
    const view = renderSection();
    fireEvent.click(await screen.findByTestId('thread-coordination-entry'));
    await screen.findByLabelText('conversation.threadCoordination.messagePlaceholder');
    view.rerender(
      <MemoryRouter initialEntries={['/conversation/aion-conversation']}>
        <Routes>
          <Route
            path='/conversation/:id'
            element={<ThreadCoordinationSection collapsed={false} tooltipEnabled={false} />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(new Set(mocks.autoSizes).size).toBe(1));
    const references = new Set(mocks.autoSizes);
    expect([...references]).toEqual([{ minRows: 3, maxRows: 6 }]);
  });

  it('archives directly without adding an OPL confirmation step', async () => {
    mocks.execute.mockResolvedValueOnce({
      ok: true,
      outcome: 'accepted',
      action: 'archive',
      targetThreadId: 'receiver',
      forkedThreadId: null,
      reviewThreadId: null,
      protocolMethod: 'thread/archive',
      auditId: 'audit-accepted',
      errorCode: null,
      message: 'Accepted',
      advisories: [],
    });
    renderSection();
    fireEvent.click(await screen.findByTestId('thread-coordination-entry'));
    fireEvent.click(await screen.findByTestId('thread-coordination-thread-receiver'));
    fireEvent.change(screen.getByLabelText('conversation.threadCoordination.reasonPlaceholder'), {
      target: { value: 'Archive completed work' },
    });
    fireEvent.click(screen.getByText('conversation.history.archive'));

    await waitFor(() => expect(mocks.execute).toHaveBeenCalledOnce());
    expect(mocks.execute.mock.calls[0][0]).toEqual({
      request: expect.objectContaining({ action: 'archive', targetThreadId: 'receiver' }),
    });
  });

  it('restores an archived Codex task through the typed lifecycle action', async () => {
    mocks.getOverview.mockResolvedValue(
      overview({
        threads: [overview().threads[0], { ...overview().threads[1], status: 'archived', archived: true }],
      })
    );
    mocks.execute.mockResolvedValueOnce({
      ok: true,
      outcome: 'accepted',
      action: 'unarchive',
      targetThreadId: 'receiver',
      forkedThreadId: null,
      reviewThreadId: null,
      protocolMethod: 'thread/unarchive',
      auditId: 'audit-restored',
      errorCode: null,
      message: 'Accepted',
      advisories: [],
    });
    renderSection();
    fireEvent.click(await screen.findByTestId('thread-coordination-entry'));
    fireEvent.click(await screen.findByTestId('thread-coordination-thread-receiver'));
    fireEvent.change(screen.getByLabelText('conversation.threadCoordination.reasonPlaceholder'), {
      target: { value: 'Restore archived work' },
    });
    fireEvent.click(screen.getByText('conversation.history.restore'));

    await waitFor(() => expect(mocks.execute).toHaveBeenCalledOnce());
    expect(mocks.execute.mock.calls[0][0]).toEqual({
      request: expect.objectContaining({ action: 'unarchive', targetThreadId: 'receiver' }),
    });
  });

  it('starts an inline uncommitted-changes review from the selected thread detail', async () => {
    mocks.execute.mockResolvedValueOnce({
      ok: true,
      outcome: 'accepted',
      action: 'review',
      targetThreadId: 'receiver',
      forkedThreadId: null,
      reviewThreadId: 'receiver',
      protocolMethod: 'review/start',
      auditId: 'audit-review',
      errorCode: null,
      message: 'Accepted',
      advisories: [],
    });
    renderSection();
    fireEvent.click(await screen.findByTestId('thread-coordination-entry'));
    fireEvent.click(await screen.findByTestId('thread-coordination-thread-receiver'));
    fireEvent.change(screen.getByLabelText('conversation.threadCoordination.reasonPlaceholder'), {
      target: { value: 'Review current changes' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'conversation.threadCoordination.reviewChanges' }));

    await waitFor(() => expect(mocks.execute).toHaveBeenCalledOnce());
    expect(mocks.execute.mock.calls[0][0]).toEqual({
      request: expect.objectContaining({
        action: 'review',
        targetThreadId: 'receiver',
        target: { type: 'uncommittedChanges' },
        delivery: 'inline',
      }),
    });
  });

  it('shows bounded audit summary, protocol, policy decisions, status, result, and timestamps', async () => {
    mocks.getOverview.mockResolvedValue(
      overview({
        audit: [
          {
            schema: 'opl_codex_thread_coordination_audit.v1',
            id: 'audit-1',
            observedAt: '2026-07-13T01:00:00.000Z',
            completedAt: '2026-07-13T01:00:01.000Z',
            actor: { kind: 'user', id: 'operator', threadId: 'source' },
            action: 'deliver',
            senderThreadId: 'source',
            receiverThreadId: 'receiver',
            senderLabel: 'Source thread',
            receiverLabel: 'Receiver thread',
            reason: 'Coordinate review',
            messageSummary: 'Inspect api_key=***',
            result: 'accepted',
            resultMessage: 'Accepted by turn/start.',
            protocolMethod: 'turn/start',
            permission: 'inherit',
            writeSet: [],
            permissionDecision: {
              requested: 'inherit',
              decision: 'not_applicable',
              reason: 'Codex policy inherited.',
            },
            writeSetDecision: {
              requestedPathCount: 0,
              decision: 'not_applicable',
              reason: 'No write set.',
              conflictingThreadId: null,
            },
            threadStatusBefore: 'idle',
            threadStatusAfter: 'running',
            idempotencyKey: 'delivery-id',
            errorCode: null,
            advisories: ['cross_project_context'],
          },
        ],
      })
    );
    renderSection();
    fireEvent.click(await screen.findByTestId('thread-coordination-entry'));

    expect((await screen.findAllByText('Source thread')).length).toBeGreaterThan(0);
    expect(screen.getByText(/Inspect api_key=\*\*\*/)).toBeInTheDocument();
    expect(screen.getAllByText(/turn\/start/).length).toBeGreaterThan(0);
    expect(screen.getByText(/not_applicable · Codex policy inherited/)).toBeInTheDocument();
    expect(screen.getByText(/advisory.cross_project_context/)).toBeInTheDocument();
    expect(screen.getByText(/idle → running/)).toBeInTheDocument();
    expect(screen.getByText(/2026-07-13T01:00:00.000Z/)).toBeInTheDocument();
  });
});
