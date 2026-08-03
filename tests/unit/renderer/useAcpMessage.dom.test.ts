/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureCanonicalReplayCursor,
  readCanonicalStreamReplay,
  resetCanonicalReplayForTests,
  useAcpMessage,
} from '@/renderer/pages/conversation/platforms/acp/useAcpMessage';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { resetWarmupConversationStateForTests } from '@/renderer/pages/conversation/utils/warmupConversation';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TChatConversation } from '@/common/config/storage';
import type { CodexThreadDescriptor } from '@/common/types/codex/appServerThreads';

const {
  addOrUpdateMessageMock,
  ensureRuntimeInvokeMock,
  getSlashCommandsInvokeMock,
  responseStreamOnMock,
  responseStreamHandlerRef,
  canonicalStreamHandlers,
  canonicalActiveHandlers,
} = vi.hoisted(() => ({
  addOrUpdateMessageMock: vi.fn(),
  ensureRuntimeInvokeMock: vi.fn(),
  getSlashCommandsInvokeMock: vi.fn(),
  responseStreamOnMock: vi.fn(),
  responseStreamHandlerRef: {
    current: undefined as ((message: IResponseMessage) => void) | undefined,
  },
  canonicalStreamHandlers: [] as Array<(message: IResponseMessage) => void>,
  canonicalActiveHandlers: new Set<(message: IResponseMessage) => void>(),
}));

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  useAddOrUpdateMessage: () => addOrUpdateMessageMock,
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      responseStream: {
        on: responseStreamOnMock.mockImplementation((handler: (message: IResponseMessage) => void) => {
          responseStreamHandlerRef.current = handler;
          return vi.fn();
        }),
      },
    },
    codexThreads: {
      responseStream: {
        on: vi.fn((handler: (message: IResponseMessage) => void) => {
          canonicalStreamHandlers.push(handler);
          canonicalActiveHandlers.add(handler);
          return vi.fn(() => canonicalActiveHandlers.delete(handler));
        }),
      },
    },
    conversation: {
      getSlashCommands: {
        invoke: getSlashCommandsInvokeMock,
      },
    },
  },
}));

vi.mock('@/common/adapter/httpBridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/common/adapter/httpBridge')>();
  return {
    ...actual,
    httpPost: vi.fn(() => ({ invoke: ensureRuntimeInvokeMock })),
  };
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useAcpMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWarmupConversationStateForTests();
    responseStreamHandlerRef.current = undefined;
    canonicalStreamHandlers.length = 0;
    canonicalActiveHandlers.clear();
    resetCanonicalReplayForTests();
    sessionStorage.clear();
    ensureRuntimeInvokeMock.mockResolvedValue(undefined);
    getSlashCommandsInvokeMock.mockResolvedValue([]);
  });

  it('replays canonical events that arrived while the Session view was unmounted', async () => {
    vi.mocked(getConversationOrNull).mockResolvedValue(null);
    const first = renderHook(() => useAcpMessage('conv-1'));

    expect(canonicalStreamHandlers).toHaveLength(2);
    canonicalStreamHandlers[0]({
      type: 'text',
      data: 'already covered by the snapshot',
      msg_id: 'message-0',
      turn_id: 'turn-1',
      conversation_id: 'conv-1',
    });
    const cursor = captureCanonicalReplayCursor('conv-1');
    first.unmount();
    expect(canonicalActiveHandlers.size).toBe(1);

    [...canonicalActiveHandlers][0]({
      type: 'text',
      data: 'completed in the background',
      msg_id: 'message-1',
      turn_id: 'turn-1',
      conversation_id: 'conv-1',
    });
    [...canonicalActiveHandlers][0]({
      type: 'finish',
      data: null,
      msg_id: 'turn-1',
      turn_id: 'turn-1',
      conversation_id: 'conv-1',
    });

    const replay = readCanonicalStreamReplay('conv-1', cursor);
    expect(replay.complete).toBe(true);
    expect(replay.messages.map((message) => message.msg_id)).not.toContain('message-0');
    expect(replay.messages.map((message) => message.type)).toEqual(['text', 'finish']);
    expect(readCanonicalStreamReplay('conv-1', replay.nextSequence).messages).toEqual([]);
  });

  it('does not apply a canonical event twice when it was already handled live during readback', async () => {
    vi.mocked(getConversationOrNull).mockResolvedValue(null);
    const { result } = renderHook(() => useAcpMessage('conv-1'));
    const cursor = captureCanonicalReplayCursor('conv-1');
    const message: IResponseMessage = {
      type: 'text',
      data: 'arrived during canonical readback',
      msg_id: 'message-1',
      turn_id: 'turn-1',
      conversation_id: 'conv-1',
    };

    act(() => {
      canonicalActiveHandlers.forEach((handler) => handler(message));
    });
    const replay = readCanonicalStreamReplay('conv-1', cursor);
    expect(replay.messages).toEqual([message]);
    expect(addOrUpdateMessageMock).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.markCanonicalSnapshotCovered(cursor);
      result.current.replayCanonicalMessages(replay.messages);
    });
    expect(addOrUpdateMessageMock).toHaveBeenCalledTimes(1);
  });

  it('completes hydration when the conversation lookup fails', async () => {
    vi.mocked(getConversationOrNull).mockRejectedValue(new TypeError('Failed to fetch'));

    const { result } = renderHook(() => useAcpMessage('conv-1'));

    await waitFor(() => {
      expect(result.current.hasHydratedRunningState).toBe(true);
    });

    expect(result.current.running).toBe(false);
    expect(result.current.aiProcessing).toBe(false);
  });

  it('preserves initial-message processing when idle hydration resolves after send starts', async () => {
    let resolveConversation: (value: null) => void = () => {};
    vi.mocked(getConversationOrNull).mockReturnValue(
      new Promise((resolve) => {
        resolveConversation = resolve;
      })
    );
    const { result } = renderHook(() => useAcpMessage('conv-1'));

    act(() => {
      result.current.setAiProcessing(true);
    });

    await waitFor(() => {
      expect(result.current.aiProcessing).toBe(true);
    });

    await act(async () => {
      resolveConversation(null);
    });

    await waitFor(() => {
      expect(result.current.hasHydratedRunningState).toBe(true);
    });
    expect(result.current.aiProcessing).toBe(true);
  });

  it('does not let stale database hydration override canonical idle state', async () => {
    const conversationDeferred = deferred<TChatConversation | null>();
    vi.mocked(getConversationOrNull).mockReturnValue(conversationDeferred.promise);
    const { result } = renderHook(() => useAcpMessage('conv-1'));

    const canonicalThread: CodexThreadDescriptor = {
      id: 'thread-1',
      title: 'Thread 1',
      summary: '',
      status: 'idle',
      projectId: 'project-1',
      workspace: '/workspace',
      host: 'local',
      owner: null,
      goal: null,
      parentThreadId: null,
      ancestorThreadIds: [],
      activeTurnId: null,
      archived: false,
      updatedAt: '2026-08-03T00:00:00.000Z',
    };

    act(() => {
      result.current.reconcileCanonicalThread(canonicalThread);
    });

    expect(result.current.running).toBe(false);
    expect(result.current.aiProcessing).toBe(false);
    expect(result.current.hasHydratedRunningState).toBe(true);

    await act(async () => {
      conversationDeferred.resolve({
        id: 'conv-1',
        runtime: {
          state: 'running',
          can_send_message: false,
          has_task: true,
          is_processing: true,
          pending_confirmations: 0,
          turn_id: 'stale-turn',
        },
      } as TChatConversation);
      await conversationDeferred.promise;
    });

    expect(result.current.running).toBe(false);
    expect(result.current.aiProcessing).toBe(false);
  });

  it('emits a synthetic thinking done update on finish when the stream never sends one', async () => {
    vi.mocked(getConversationOrNull).mockResolvedValue(null);

    const now = Date.now();
    renderHook(() => useAcpMessage('conv-1'));

    expect(responseStreamHandlerRef.current).toBeTypeOf('function');

    responseStreamHandlerRef.current?.({
      type: 'request_trace',
      data: {
        timestamp: now - 4200,
        backend: 'claude',
        model_id: 'model-1',
      },
      msg_id: 'msg-1',
      conversation_id: 'conv-1',
    });

    responseStreamHandlerRef.current?.({
      type: 'thinking',
      data: {
        content: 'alpha',
        status: 'thinking',
      },
      msg_id: 'msg-1',
      conversation_id: 'conv-1',
    });

    responseStreamHandlerRef.current?.({
      type: 'finish',
      data: null,
      msg_id: 'msg-1',
      conversation_id: 'conv-1',
    });

    expect(addOrUpdateMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'thinking',
        msg_id: 'msg-1',
        conversation_id: 'conv-1',
        content: expect.objectContaining({
          status: 'done',
          duration: expect.any(Number),
        }),
      })
    );
  });

  it('completes thinking as soon as the first non-thinking message arrives', async () => {
    vi.mocked(getConversationOrNull).mockResolvedValue(null);

    renderHook(() => useAcpMessage('conv-1'));

    responseStreamHandlerRef.current?.({
      type: 'thinking',
      data: {
        content: 'alpha',
        status: 'thinking',
      },
      msg_id: 'msg-1',
      conversation_id: 'conv-1',
      created_at: 1_000,
    });

    responseStreamHandlerRef.current?.({
      type: 'text',
      data: 'beta',
      msg_id: 'msg-1',
      conversation_id: 'conv-1',
      created_at: 4_200,
    });

    expect(addOrUpdateMessageMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'thinking',
        msg_id: 'msg-1',
        content: expect.objectContaining({
          status: 'thinking',
        }),
      })
    );
    expect(addOrUpdateMessageMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'thinking',
        msg_id: 'msg-1',
        content: expect.objectContaining({
          status: 'done',
          duration: 3200,
        }),
      })
    );
    expect(addOrUpdateMessageMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        type: 'text',
        msg_id: 'msg-1',
      })
    );
  });

  it('preserves slash-command metadata from available_commands stream updates', async () => {
    vi.mocked(getConversationOrNull).mockResolvedValue(null);

    const { result } = renderHook(() => useAcpMessage('conv-1'));

    act(() => {
      responseStreamHandlerRef.current?.({
        type: 'available_commands',
        data: {
          commands: [
            {
              name: 'review',
              description: 'Review the current diff',
              input: {
                hint: '⌘R',
              },
              _meta: {
                completion_behavior: 'neutral_tip_on_empty',
                empty_turn_tip_code: 'acp.empty_turn.choose_command',
                empty_turn_tip_params: {
                  command_count: 1,
                },
              },
            },
          ],
        },
        msg_id: 'cmd-1',
        conversation_id: 'conv-1',
      });
    });

    await waitFor(() => {
      expect(result.current.slashCommands).toEqual([
        {
          name: 'review',
          description: 'Review the current diff',
          hint: '⌘R',
          kind: 'template',
          source: 'acp',
          selectionBehavior: 'insert',
          completionBehavior: 'neutral_tip_on_empty',
          emptyTurnTipCode: 'acp.empty_turn.choose_command',
          emptyTurnTipParams: {
            command_count: 1,
          },
        },
      ]);
    });
  });
  it('deduplicates slash command fetches while a request is in flight', async () => {
    vi.mocked(getConversationOrNull).mockResolvedValue(null);
    const slashCommandsDeferred = deferred<
      Array<{
        command: string;
        description: string;
      }>
    >();
    getSlashCommandsInvokeMock.mockReturnValue(slashCommandsDeferred.promise);

    const { result } = renderHook(() => useAcpMessage('conv-1'));

    await waitFor(() => {
      expect(getSlashCommandsInvokeMock).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.fetchSlashCommands();
    });

    await waitFor(() => {
      expect(getSlashCommandsInvokeMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      slashCommandsDeferred.resolve([
        {
          command: 'review',
          description: 'Review the current diff',
        },
      ]);
      await slashCommandsDeferred.promise;
    });

    await waitFor(() => {
      expect(result.current.slashCommands).toEqual([
        {
          name: 'review',
          description: 'Review the current diff',
          kind: 'template',
          source: 'acp',
          selectionBehavior: 'insert',
        },
      ]);
    });
  });
});
