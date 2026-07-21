import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAcpInitialMessage } from '@/renderer/pages/conversation/platforms/acp/useAcpInitialMessage';
import { resetWarmupConversationStateForTests } from '@/renderer/pages/conversation/utils/warmupConversation';
import { mergeFailedSendDraft } from '@/renderer/hooks/chat/useSendBoxDraft';

const mocks = vi.hoisted(() => ({
  ensureRuntimeInvoke: vi.fn(),
  sendMessageInvoke: vi.fn(),
  addOrUpdateMessage: vi.fn(),
  checkAndUpdateTitle: vi.fn(),
  setAiProcessing: vi.fn(),
  restoreFailedSend: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      sendMessage: {
        invoke: mocks.sendMessageInvoke,
      },
    },
  },
}));

vi.mock('@/common/adapter/httpBridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/common/adapter/httpBridge')>();
  return {
    ...actual,
    httpPost: vi.fn(() => ({ invoke: mocks.ensureRuntimeInvoke })),
  };
});

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
    resetWarmupConversationStateForTests();
    sessionStorage.clear();
    mocks.ensureRuntimeInvoke.mockResolvedValue(undefined);
    mocks.sendMessageInvoke.mockResolvedValue({ msg_id: 'msg-1' });
  });

  it('waits for ACP warmup before sending the GUID initial message', async () => {
    let resolveWarmup: () => void = () => {};
    mocks.ensureRuntimeInvoke.mockReturnValue(
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
        resetState: vi.fn(),
        checkAndUpdateTitle: mocks.checkAndUpdateTitle,
        addOrUpdateMessage: mocks.addOrUpdateMessage,
        restoreFailedSend: mocks.restoreFailedSend,
      })
    );

    await waitFor(() => expect(mocks.ensureRuntimeInvoke).toHaveBeenCalledWith({ conversation_id: 'conv-1' }));
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

  it('restores the GUID initial prompt and attachments when the first send fails', async () => {
    mocks.sendMessageInvoke.mockRejectedValue(new Error('initial send rejected'));
    sessionStorage.setItem(
      'acp_initial_message_conv-1',
      JSON.stringify({ input: 'hello from guid', files: ['/tmp/failed.pdf'] })
    );

    renderHook(() =>
      useAcpInitialMessage({
        conversation_id: 'conv-1',
        backend: 'codex',
        workspacePath: '/workspace',
        setAiProcessing: mocks.setAiProcessing,
        resetState: vi.fn(),
        checkAndUpdateTitle: mocks.checkAndUpdateTitle,
        addOrUpdateMessage: mocks.addOrUpdateMessage,
        restoreFailedSend: mocks.restoreFailedSend,
      })
    );

    await waitFor(() => expect(mocks.restoreFailedSend).toHaveBeenCalledWith('hello from guid', ['/tmp/failed.pdf']));
    expect(sessionStorage.getItem('acp_initial_message_conv-1')).toBeNull();
  });

  it('merges a failed snapshot ahead of new input and deduplicates attachments by path', () => {
    const merged = mergeFailedSendDraft(
      {
        _type: 'acp' as const,
        content: 'typed while waiting',
        atPath: [{ path: '/tmp/already-selected.pdf', name: 'already-selected.pdf', isFile: true }],
        uploadFile: ['/tmp/new.pdf', '/tmp/failed.pdf'],
      },
      'failed prompt',
      ['/tmp/failed.pdf', '/tmp/already-selected.pdf']
    );

    expect(merged.content).toBe('failed prompt\n\ntyped while waiting');
    expect(merged.atPath).toHaveLength(1);
    expect(merged.uploadFile).toEqual(['/tmp/failed.pdf', '/tmp/new.pdf']);
  });
});
