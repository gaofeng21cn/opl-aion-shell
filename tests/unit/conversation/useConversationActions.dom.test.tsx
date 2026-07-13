import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import { useConversationActions } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationActions';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  update: vi.fn(),
  createWithConversation: vi.fn(),
  reset: vi.fn(),
  emit: vi.fn(),
  modalConfirm: vi.fn(),
  messageError: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      update: { invoke: mocks.update },
      createWithConversation: { invoke: mocks.createWithConversation },
      remove: { invoke: vi.fn() },
      reset: { invoke: mocks.reset },
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
  Message: { success: vi.fn(), error: mocks.messageError, warning: vi.fn() },
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
      selectedConversationIds: new Set(),
      setSelectedConversationIds: vi.fn(),
      toggleSelectedConversation: vi.fn(),
      markAsRead: vi.fn(),
    })
  );

describe('conversation archive actions', () => {
  beforeEach(() => {
    mocks.navigate.mockClear();
    mocks.update.mockReset();
    mocks.createWithConversation.mockReset();
    mocks.reset.mockReset();
    mocks.emit.mockClear();
    mocks.modalConfirm.mockClear();
    mocks.messageError.mockClear();
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
    mocks.createWithConversation.mockResolvedValue(undefined);
    const markAsRead = vi.fn();
    const { result } = renderHook(() =>
      useConversationActions({
        batchMode: false,
        selectedConversationIds: new Set(),
        setSelectedConversationIds: vi.fn(),
        toggleSelectedConversation: vi.fn(),
        markAsRead,
      })
    );
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

    act(() => result.current.handleConversationClick(canonicalStub));

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/conversation/thread-1'));
    expect(mocks.createWithConversation).toHaveBeenCalledWith({
      conversation: expect.objectContaining({
        id: 'thread-1',
        extra: expect.objectContaining({ canonical_thread_stub: false }),
      }),
    });
    expect(markAsRead).toHaveBeenCalledWith('thread-1');
  });
});
