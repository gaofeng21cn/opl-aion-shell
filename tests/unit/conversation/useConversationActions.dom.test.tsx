import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import { useConversationActions } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationActions';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  update: vi.fn(),
  messageError: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      update: { invoke: mocks.update },
      remove: { invoke: vi.fn() },
      reset: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  refreshConversationCache: vi.fn(),
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: { emit: vi.fn() },
}));

vi.mock('@arco-design/web-react', () => ({
  Message: { success: vi.fn(), error: mocks.messageError, warning: vi.fn() },
  Modal: { confirm: vi.fn() },
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
});
