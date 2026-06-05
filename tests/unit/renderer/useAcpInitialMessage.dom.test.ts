import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAcpInitialMessage } from '@/renderer/pages/conversation/platforms/acp/useAcpInitialMessage';

const mocks = vi.hoisted(() => ({
  warmupInvoke: vi.fn(),
  sendMessageInvoke: vi.fn(),
  addOrUpdateMessage: vi.fn(),
  checkAndUpdateTitle: vi.fn(),
  setAiProcessing: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      warmup: {
        invoke: mocks.warmupInvoke,
      },
    },
    acpConversation: {
      sendMessage: {
        invoke: mocks.sendMessageInvoke,
      },
    },
  },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('useAcpInitialMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.warmupInvoke.mockResolvedValue(undefined);
    mocks.sendMessageInvoke.mockResolvedValue({ msg_id: 'msg-1' });
  });

  it('waits for ACP warmup before sending the GUID initial message', async () => {
    let resolveWarmup: () => void = () => {};
    mocks.warmupInvoke.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveWarmup = resolve;
      })
    );
    sessionStorage.setItem('acp_initial_message_conv-1', JSON.stringify({ input: 'hello from guid' }));

    renderHook(() =>
      useAcpInitialMessage({
        conversation_id: 'conv-1',
        backend: 'codex',
        workspacePath: '/workspace',
        setAiProcessing: mocks.setAiProcessing,
        checkAndUpdateTitle: mocks.checkAndUpdateTitle,
        addOrUpdateMessage: mocks.addOrUpdateMessage,
      })
    );

    await waitFor(() => expect(mocks.warmupInvoke).toHaveBeenCalledWith({ conversation_id: 'conv-1' }));
    expect(mocks.sendMessageInvoke).not.toHaveBeenCalled();

    resolveWarmup();

    await waitFor(() =>
      expect(mocks.sendMessageInvoke).toHaveBeenCalledWith({
        conversation_id: 'conv-1',
        input: 'hello from guid',
        files: [],
      })
    );
  });
});
