import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import { useConversationActions } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationActions';
import { useTitleRename } from '@/renderer/pages/conversation/hooks/useTitleRename';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  createWithConversation: vi.fn(),
  remove: vi.fn(),
  reset: vi.fn(),
  emit: vi.fn(),
  modalConfirm: vi.fn(),
  messageError: vi.fn(),
  messageSuccess: vi.fn(),
  threadRead: vi.fn(),
  threadUpdateSettings: vi.fn(),
  threadRename: vi.fn(),
  threadArchive: vi.fn(),
  threadUnarchive: vi.fn(),
  threadDelete: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      get: { invoke: mocks.get },
      update: { invoke: mocks.update },
      createWithConversation: { invoke: mocks.createWithConversation },
      remove: { invoke: mocks.remove },
      reset: { invoke: mocks.reset },
    },
    codexThreads: {
      read: { invoke: mocks.threadRead },
      updateSettings: { invoke: mocks.threadUpdateSettings },
      rename: { invoke: mocks.threadRename },
      archive: { invoke: mocks.threadArchive },
      unarchive: { invoke: mocks.threadUnarchive },
      delete: { invoke: mocks.threadDelete },
    },
  },
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  refreshConversationCache: vi.fn(),
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: { emit: mocks.emit },
}));

vi.mock('@arco-design/web-react', () => ({
  Message: { success: mocks.messageSuccess, error: mocks.messageError, warning: vi.fn() },
  Modal: { confirm: mocks.modalConfirm },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useParams: () => ({ id: 'conv-1' }),
}));

const target = {
  id: 'conv-1',
  name: 'Conversation',
  type: 'codex',
  created_at: 1,
  modified_at: 1,
  extra: {},
} as unknown as TChatConversation;

const renderActions = () =>
  renderHook(() =>
    useConversationActions({
      batchMode: false,
      conversations: [target],
      selectedConversationIds: new Set(),
      setSelectedConversationIds: vi.fn(),
      toggleSelectedConversation: vi.fn(),
      markAsRead: vi.fn(),
    })
  );

describe('conversation archive actions', () => {
  beforeEach(() => {
    mocks.navigate.mockClear();
    mocks.get.mockReset();
    mocks.update.mockReset();
    mocks.createWithConversation.mockReset();
    mocks.remove.mockReset();
    mocks.reset.mockReset();
    mocks.emit.mockClear();
    mocks.modalConfirm.mockClear();
    mocks.messageError.mockClear();
    mocks.messageSuccess.mockClear();
    mocks.threadRead.mockReset();
    mocks.threadUpdateSettings.mockReset();
    mocks.threadRename.mockReset();
    mocks.threadArchive.mockReset();
    mocks.threadUnarchive.mockReset();
    mocks.threadDelete.mockReset();
  });

  it('persists archive and restore through merge_extra without deleting the conversation', async () => {
    mocks.update.mockResolvedValue(true);
    const { result } = renderActions();

    act(() => result.current.handleArchive(target));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(mocks.update).toHaveBeenLastCalledWith({
      id: 'conv-1',
      updates: {
        extra: {
          archived: true,
          archived_at: expect.any(Number),
        },
      },
      merge_extra: true,
    });
    expect(mocks.navigate).toHaveBeenCalledWith('/guid');

    act(() => result.current.handleRestore(target));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2));
    expect(mocks.update).toHaveBeenLastCalledWith({
      id: 'conv-1',
      updates: { extra: { archived: false, archived_at: undefined } },
      merge_extra: true,
    });
  });

  it('reports a failed archive update instead of pretending it succeeded', async () => {
    mocks.update.mockResolvedValue(false);
    const { result } = renderActions();

    act(() => result.current.handleArchive(target));

    await waitFor(() => expect(mocks.messageError).toHaveBeenCalledWith('conversation.history.archiveFailed'));
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('notifies the mounted transcript after resetting a conversation', async () => {
    mocks.reset.mockResolvedValue(undefined);
    const { result } = renderActions();

    act(() => result.current.handleReset('conv-1'));
    const confirmation = mocks.modalConfirm.mock.calls[0]?.[0] as { onOk: () => Promise<void> };
    await act(() => confirmation.onOk());

    expect(mocks.reset).toHaveBeenCalledWith({ id: 'conv-1' });
    expect(mocks.emit).toHaveBeenCalledWith('conversation.reset', 'conv-1');
  });

  it('materializes an App Server task projection before opening it', async () => {
    mocks.createWithConversation.mockResolvedValue({
      id: 'local-conversation-1',
    });
    const markAsRead = vi.fn();
    const canonicalStub = {
      id: 'thread-1',
      name: 'Canonical task',
      type: 'acp',
      created_at: 1,
      modified_at: 1,
      extra: {
        backend: 'codex',
        acp_session_id: 'thread-1',
        canonical_thread_id: 'thread-1',
        canonical_thread_stub: true,
      },
    } as TChatConversation;
    const { result } = renderHook(() =>
      useConversationActions({
        batchMode: false,
        conversations: [canonicalStub],
        selectedConversationIds: new Set(),
        setSelectedConversationIds: vi.fn(),
        toggleSelectedConversation: vi.fn(),
        markAsRead,
      })
    );
    act(() => result.current.handleConversationClick(canonicalStub));

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/conversation/local-conversation-1'));
    expect(mocks.createWithConversation).toHaveBeenCalledWith({
      conversation: expect.objectContaining({
        id: 'thread-1',
        extra: expect.objectContaining({ canonical_thread_stub: false }),
      }),
    });
    expect(markAsRead).toHaveBeenCalledWith('local-conversation-1');
  });

  it('opens project selection for a stale canonical workspace and materializes only after cwd readback', async () => {
    const staleWorkspace = '/workspace/removed-project';
    const selectedWorkspace = '/workspace/recovered-project';
    const canonicalStub = {
      id: 'thread-stale-workspace',
      name: 'Stale canonical task',
      type: 'acp',
      created_at: 1,
      modified_at: 1,
      extra: {
        backend: 'codex',
        workspace: staleWorkspace,
        acp_session_id: 'thread-stale-workspace',
        canonical_thread_id: 'thread-stale-workspace',
        canonical_thread_stub: true,
      },
    } as TChatConversation;
    const workspaceError = {
      name: 'BackendHttpError',
      status: 400,
      code: 'WORKSPACE_PATH_UNAVAILABLE',
      backendMessage: 'Workspace path is unavailable.',
      details: { workspace_path: staleWorkspace },
    };
    mocks.createWithConversation
      .mockRejectedValueOnce(workspaceError)
      .mockResolvedValueOnce({ id: 'local-recovered-conversation' });
    mocks.threadRead
      .mockResolvedValueOnce({ thread: { workspace: staleWorkspace, projectId: staleWorkspace } })
      .mockResolvedValueOnce({ thread: { workspace: selectedWorkspace, projectId: selectedWorkspace } });
    mocks.threadUpdateSettings.mockResolvedValue(undefined);
    mocks.get.mockResolvedValue({
      ...canonicalStub,
      id: 'local-recovered-conversation',
      extra: {
        ...canonicalStub.extra,
        workspace: selectedWorkspace,
        custom_workspace: true,
        canonical_thread_stub: false,
      },
    });
    const { result } = renderHook(() =>
      useConversationActions({
        batchMode: false,
        conversations: [canonicalStub],
        selectedConversationIds: new Set(),
        setSelectedConversationIds: vi.fn(),
        toggleSelectedConversation: vi.fn(),
        markAsRead: vi.fn(),
      })
    );

    act(() => result.current.handleConversationClick(canonicalStub));
    await waitFor(() => expect(result.current.projectAdoptionConversation).toBe(canonicalStub));
    expect(mocks.messageError).not.toHaveBeenCalled();

    await act(() => result.current.handleProjectAdoption(canonicalStub, selectedWorkspace));

    expect(mocks.threadUpdateSettings).toHaveBeenCalledWith({
      threadId: 'thread-stale-workspace',
      cwd: selectedWorkspace,
    });
    expect(mocks.threadRead).toHaveBeenCalledTimes(2);
    expect(mocks.createWithConversation).toHaveBeenLastCalledWith({
      conversation: expect.objectContaining({
        extra: expect.objectContaining({
          workspace: selectedWorkspace,
          canonical_thread_stub: false,
        }),
      }),
    });
  });

  it('routes canonical lifecycle actions with the canonical id during ACP id migration', async () => {
    const canonical = {
      id: 'conv-1',
      name: 'Canonical task',
      type: 'acp',
      created_at: 1,
      modified_at: 1,
      extra: {
        backend: 'codex',
        acp_session_id: 'legacy-thread-1',
        canonical_thread_id: 'thread-1',
      },
    } as TChatConversation;
    mocks.threadRename.mockResolvedValue(undefined);
    mocks.threadArchive.mockResolvedValue(undefined);
    mocks.threadUnarchive.mockResolvedValue(undefined);
    mocks.threadDelete.mockResolvedValue(undefined);
    mocks.update.mockResolvedValue(true);
    mocks.remove.mockResolvedValue(true);
    const { result } = renderHook(() =>
      useConversationActions({
        batchMode: false,
        conversations: [canonical],
        selectedConversationIds: new Set(),
        setSelectedConversationIds: vi.fn(),
        toggleSelectedConversation: vi.fn(),
        markAsRead: vi.fn(),
      })
    );

    act(() => result.current.handleEditStart(canonical));
    act(() => result.current.setRenameModalName('Renamed canonical task'));
    await act(() => result.current.handleRenameConfirm());
    act(() => result.current.handleArchive(canonical));
    act(() => result.current.handleRestore(canonical));

    await waitFor(() => expect(mocks.threadUnarchive).toHaveBeenCalledOnce());
    expect(mocks.threadRename).toHaveBeenCalledWith({
      threadId: 'thread-1',
      name: 'Renamed canonical task',
    });
    expect(mocks.threadArchive).toHaveBeenCalledWith({ threadId: 'thread-1' });
    expect(mocks.threadUnarchive).toHaveBeenCalledWith({ threadId: 'thread-1' });

    act(() => result.current.handleDeleteClick(canonical.id));
    const confirmation = mocks.modalConfirm.mock.calls.at(-1)?.[0] as { onOk: () => Promise<void> };
    await act(() => confirmation.onOk());
    expect(mocks.threadDelete).toHaveBeenCalledWith({ threadId: 'thread-1' });
  });

  it('adopts an explicitly projectless canonical conversation without a cached workspace', async () => {
    const projectless = {
      id: 'conv-projectless',
      name: 'Projectless task',
      type: 'acp',
      created_at: 1,
      modified_at: 1,
      extra: {
        backend: 'codex',
        canonical_thread_id: 'thread-projectless',
        custom_workspace: false,
      },
    } as TChatConversation;
    mocks.threadRead
      .mockResolvedValueOnce({ thread: { workspace: '', projectId: '' } })
      .mockResolvedValueOnce({ thread: { workspace: '/workspace/project', projectId: '/workspace/project' } });
    mocks.threadUpdateSettings.mockResolvedValue(undefined);
    mocks.update.mockResolvedValue(true);
    mocks.get.mockResolvedValue({
      ...projectless,
      extra: { ...projectless.extra, workspace: '/workspace/project', custom_workspace: true },
    });
    const { result } = renderHook(() =>
      useConversationActions({
        batchMode: false,
        conversations: [projectless],
        selectedConversationIds: new Set(),
        setSelectedConversationIds: vi.fn(),
        toggleSelectedConversation: vi.fn(),
        markAsRead: vi.fn(),
      })
    );

    act(() => result.current.handleMoveToProject(projectless));
    await act(() => result.current.handleProjectAdoptionConfirm(['/workspace/project']));

    expect(mocks.threadUpdateSettings).toHaveBeenCalledWith({
      threadId: 'thread-projectless',
      cwd: '/workspace/project',
    });
    expect(mocks.update).toHaveBeenCalledWith({
      id: 'conv-projectless',
      updates: { extra: { workspace: '/workspace/project', custom_workspace: true } },
      merge_extra: true,
    });
    expect(mocks.get).toHaveBeenCalledWith({ id: 'conv-projectless' });
    expect(mocks.messageSuccess).toHaveBeenCalledWith('conversation.history.moveToProjectSuccess');
    expect(result.current.projectAdoptionConversation).toBeNull();
  });

  it('adopts a managed Documents Codex projectless task into a selected project', async () => {
    const managedWorkspace = '/Users/example/Documents/Codex/2026-07-28/temporary-task';
    const projectless = {
      id: 'conv-managed-projectless',
      name: 'Managed projectless task',
      type: 'acp',
      created_at: 1,
      extra: {
        backend: 'codex',
        canonical_thread_id: 'thread-managed-projectless',
        workspace: managedWorkspace,
        custom_workspace: false,
      },
    } as TChatConversation;
    mocks.threadRead
      .mockResolvedValueOnce({ thread: { workspace: managedWorkspace, projectId: '' } })
      .mockResolvedValueOnce({ thread: { workspace: '/workspace/project', projectId: '/workspace/project' } });
    mocks.threadUpdateSettings.mockResolvedValue(undefined);
    mocks.update.mockResolvedValue(true);
    mocks.get.mockResolvedValue({
      ...projectless,
      extra: { ...projectless.extra, workspace: '/workspace/project', custom_workspace: true },
    });
    const { result } = renderHook(() =>
      useConversationActions({
        batchMode: false,
        conversations: [projectless],
        selectedConversationIds: new Set(),
        setSelectedConversationIds: vi.fn(),
        toggleSelectedConversation: vi.fn(),
        markAsRead: vi.fn(),
      })
    );

    expect(await result.current.handleProjectAdoption(projectless, '/workspace/project')).toBe(true);
    expect(mocks.threadUpdateSettings).toHaveBeenCalledWith({
      threadId: 'thread-managed-projectless',
      cwd: '/workspace/project',
    });
  });

  it('updates the App Server cwd before committing the local affinity projection', async () => {
    const projectless = {
      id: 'conv-order',
      name: 'Projectless task',
      type: 'acp',
      created_at: 1,
      extra: { backend: 'codex', canonical_thread_id: 'thread-order', custom_workspace: false },
    } as TChatConversation;
    mocks.threadRead
      .mockResolvedValueOnce({ thread: { workspace: '', projectId: '' } })
      .mockResolvedValueOnce({ thread: { workspace: '/workspace/project', projectId: '/workspace/project' } });
    mocks.threadUpdateSettings.mockResolvedValue(undefined);
    mocks.update.mockResolvedValue(true);
    mocks.get.mockResolvedValue({
      ...projectless,
      extra: { ...projectless.extra, workspace: '/workspace/project', custom_workspace: true },
    });
    const { result } = renderHook(() =>
      useConversationActions({
        batchMode: false,
        conversations: [projectless],
        selectedConversationIds: new Set(),
        setSelectedConversationIds: vi.fn(),
        toggleSelectedConversation: vi.fn(),
        markAsRead: vi.fn(),
      })
    );

    await act(() => result.current.handleProjectAdoption(projectless, '/workspace/project'));

    expect(mocks.threadUpdateSettings.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.update.mock.invocationCallOrder[0]
    );
    expect(mocks.threadRead).toHaveBeenCalledTimes(2);
    expect(mocks.threadRead.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.threadUpdateSettings.mock.invocationCallOrder[0]
    );
    expect(mocks.threadUpdateSettings.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.threadRead.mock.invocationCallOrder[1]
    );
    expect(mocks.threadRead.mock.invocationCallOrder[1]).toBeLessThan(mocks.update.mock.invocationCallOrder[0]);
  });

  it('keeps canonical adoption successful when the rebuildable local projection update fails', async () => {
    const projectless = {
      id: 'conv-local-projection-failure',
      name: 'Projectless task',
      type: 'acp',
      created_at: 1,
      extra: {
        backend: 'codex',
        canonical_thread_id: 'thread-local-projection-failure',
        custom_workspace: false,
      },
    } as TChatConversation;
    mocks.threadRead
      .mockResolvedValueOnce({ thread: { workspace: '', projectId: '' } })
      .mockResolvedValueOnce({ thread: { workspace: '/workspace/project', projectId: '/workspace/project' } });
    mocks.threadUpdateSettings.mockResolvedValue(undefined);
    mocks.update.mockResolvedValue(false);
    const { result } = renderHook(() =>
      useConversationActions({
        batchMode: false,
        conversations: [projectless],
        selectedConversationIds: new Set(),
        setSelectedConversationIds: vi.fn(),
        toggleSelectedConversation: vi.fn(),
        markAsRead: vi.fn(),
      })
    );

    expect(await result.current.handleProjectAdoption(projectless, '/workspace/project')).toBe(true);
    expect(mocks.messageSuccess).toHaveBeenCalledWith('conversation.history.moveToProjectSuccess');
    expect(mocks.messageError).not.toHaveBeenCalled();
    expect(mocks.emit).toHaveBeenCalledWith('chat.history.refresh');
  });

  it('keeps canonical adoption successful when a stub projection cannot be materialized', async () => {
    const projectlessStub = {
      id: 'thread-stub-projection-failure',
      name: 'Projectless stub task',
      type: 'acp',
      created_at: 1,
      extra: {
        backend: 'codex',
        canonical_thread_id: 'thread-stub-projection-failure',
        canonical_thread_stub: true,
        custom_workspace: false,
      },
    } as TChatConversation;
    mocks.threadRead
      .mockResolvedValueOnce({ thread: { workspace: '', projectId: '' } })
      .mockResolvedValueOnce({ thread: { workspace: '/workspace/project', projectId: '/workspace/project' } });
    mocks.threadUpdateSettings.mockResolvedValue(undefined);
    mocks.createWithConversation.mockRejectedValue(new Error('local projection unavailable'));
    const { result } = renderHook(() =>
      useConversationActions({
        batchMode: false,
        conversations: [projectlessStub],
        selectedConversationIds: new Set(),
        setSelectedConversationIds: vi.fn(),
        toggleSelectedConversation: vi.fn(),
        markAsRead: vi.fn(),
      })
    );

    expect(await result.current.handleProjectAdoption(projectlessStub, '/workspace/project')).toBe(true);
    expect(mocks.messageSuccess).toHaveBeenCalledWith('conversation.history.moveToProjectSuccess');
    expect(mocks.messageError).not.toHaveBeenCalled();
    expect(mocks.emit).toHaveBeenCalledWith('chat.history.refresh');
  });

  it('reads back a materialized canonical stub using the server-assigned conversation id', async () => {
    const projectlessStub = {
      id: 'thread-stub',
      name: 'Projectless stub task',
      type: 'acp',
      created_at: 1,
      extra: {
        backend: 'codex',
        canonical_thread_id: 'thread-stub',
        canonical_thread_stub: true,
        custom_workspace: false,
      },
    } as TChatConversation;
    mocks.threadRead
      .mockResolvedValueOnce({ thread: { workspace: '', projectId: '' } })
      .mockResolvedValueOnce({ thread: { workspace: '/workspace/project', projectId: '/workspace/project' } });
    mocks.threadUpdateSettings.mockResolvedValue(undefined);
    mocks.createWithConversation.mockResolvedValue({ id: 'local-stub-conversation' });
    mocks.get.mockResolvedValue({
      ...projectlessStub,
      id: 'local-stub-conversation',
      extra: {
        ...projectlessStub.extra,
        workspace: '/workspace/project',
        custom_workspace: true,
        canonical_thread_stub: false,
      },
    });
    const { result } = renderHook(() =>
      useConversationActions({
        batchMode: false,
        conversations: [projectlessStub],
        selectedConversationIds: new Set(),
        setSelectedConversationIds: vi.fn(),
        toggleSelectedConversation: vi.fn(),
        markAsRead: vi.fn(),
      })
    );

    expect(await result.current.handleProjectAdoption(projectlessStub, '/workspace/project')).toBe(true);
    expect(mocks.get).toHaveBeenCalledWith({ id: 'local-stub-conversation' });
  });

  it('keeps the conversation projectless when canonical cwd readback does not match', async () => {
    const projectless = {
      id: 'conv-mismatch',
      name: 'Projectless task',
      type: 'acp',
      created_at: 1,
      extra: { backend: 'codex', canonical_thread_id: 'thread-mismatch', custom_workspace: false },
    } as TChatConversation;
    mocks.threadRead
      .mockResolvedValueOnce({ thread: { workspace: '', projectId: '' } })
      .mockResolvedValueOnce({ thread: { workspace: '/workspace/other', projectId: '/workspace/other' } });
    mocks.threadUpdateSettings.mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useConversationActions({
        batchMode: false,
        conversations: [projectless],
        selectedConversationIds: new Set(),
        setSelectedConversationIds: vi.fn(),
        toggleSelectedConversation: vi.fn(),
        markAsRead: vi.fn(),
      })
    );

    expect(await result.current.handleProjectAdoption(projectless, '/workspace/project')).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.createWithConversation).not.toHaveBeenCalled();
    expect(mocks.messageError).toHaveBeenCalledWith('conversation.history.moveToProjectFailed');
  });

  it('requires an exact canonical cwd readback instead of path-normalized equivalence', async () => {
    const projectless = {
      id: 'conv-exact-mismatch',
      name: 'Projectless task',
      type: 'acp',
      created_at: 1,
      extra: { backend: 'codex', canonical_thread_id: 'thread-exact-mismatch', custom_workspace: false },
    } as TChatConversation;
    mocks.threadRead
      .mockResolvedValueOnce({ thread: { workspace: '', projectId: '' } })
      .mockResolvedValueOnce({ thread: { workspace: '/workspace/project/', projectId: '/workspace/project/' } });
    mocks.threadUpdateSettings.mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useConversationActions({
        batchMode: false,
        conversations: [projectless],
        selectedConversationIds: new Set(),
        setSelectedConversationIds: vi.fn(),
        toggleSelectedConversation: vi.fn(),
        markAsRead: vi.fn(),
      })
    );

    expect(await result.current.handleProjectAdoption(projectless, '/workspace/project')).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.createWithConversation).not.toHaveBeenCalled();
  });

  it('blocks reassignment after a canonical cwd is recorded', async () => {
    const staleProjectless = {
      id: 'conv-stale',
      name: 'Stale projectless projection',
      type: 'acp',
      created_at: 1,
      extra: { backend: 'codex', canonical_thread_id: 'thread-bound', custom_workspace: false },
    } as TChatConversation;
    mocks.threadRead.mockResolvedValueOnce({
      thread: { workspace: '/workspace/project-a', projectId: '/workspace/project-a' },
    });
    const { result } = renderHook(() =>
      useConversationActions({
        batchMode: false,
        conversations: [staleProjectless],
        selectedConversationIds: new Set(),
        setSelectedConversationIds: vi.fn(),
        toggleSelectedConversation: vi.fn(),
        markAsRead: vi.fn(),
      })
    );

    expect(await result.current.handleProjectAdoption(staleProjectless, '/workspace/project-b')).toBe(false);
    expect(mocks.threadUpdateSettings).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('does not change turn pwd or sandbox writable roots during adoption', async () => {
    const projectless = {
      id: 'conv-boundary',
      name: 'Projectless task',
      type: 'acp',
      created_at: 1,
      extra: { backend: 'codex', canonical_thread_id: 'thread-boundary', custom_workspace: false },
    } as TChatConversation;
    mocks.threadRead
      .mockResolvedValueOnce({ thread: { workspace: '', projectId: '' } })
      .mockResolvedValueOnce({ thread: { workspace: '/workspace/project', projectId: '/workspace/project' } });
    mocks.threadUpdateSettings.mockResolvedValue(undefined);
    mocks.update.mockResolvedValue(true);
    mocks.get.mockResolvedValue({
      ...projectless,
      extra: { ...projectless.extra, workspace: '/workspace/project', custom_workspace: true },
    });
    const { result } = renderHook(() =>
      useConversationActions({
        batchMode: false,
        conversations: [projectless],
        selectedConversationIds: new Set(),
        setSelectedConversationIds: vi.fn(),
        toggleSelectedConversation: vi.fn(),
        markAsRead: vi.fn(),
      })
    );

    await result.current.handleProjectAdoption(projectless, '/workspace/project');

    expect(mocks.threadUpdateSettings).toHaveBeenCalledWith({
      threadId: 'thread-boundary',
      cwd: '/workspace/project',
    });
    expect(JSON.stringify(mocks.threadUpdateSettings.mock.calls)).not.toMatch(/pwd|writable|sandbox/i);
  });

  it('routes the open canonical task title rename through thread/name/set', async () => {
    mocks.get.mockResolvedValue({
      id: 'conv-1',
      name: 'Canonical task',
      type: 'acp',
      created_at: 1,
      modified_at: 1,
      extra: {
        backend: 'codex',
        acp_session_id: 'thread-1',
        canonical_thread_id: 'thread-1',
      },
    } as TChatConversation);
    mocks.threadRename.mockResolvedValue(undefined);
    mocks.update.mockResolvedValue(true);
    const { result } = renderHook(() => useTitleRename({ title: 'Canonical task', conversation_id: 'conv-1' }));

    act(() => result.current.setTitleDraft('Renamed from transcript'));
    await act(() => result.current.submitTitleRename());

    expect(mocks.threadRename).toHaveBeenCalledWith({
      threadId: 'thread-1',
      name: 'Renamed from transcript',
    });
  });
});
