import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getWarmupConversationStatus,
  resetWarmupConversationStateForTests,
  warmupConversation,
} from '@/renderer/pages/conversation/utils/warmupConversation';
import { BackendHttpError } from '@/common/adapter/httpBridge';

const { warmupInvokeMock } = vi.hoisted(() => ({
  warmupInvokeMock: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      warmup: {
        invoke: warmupInvokeMock,
      },
    },
  },
}));

describe('warmupConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWarmupConversationStateForTests();
  });

  it('coalesces concurrent warmups for the same conversation', async () => {
    let resolveWarmup: (() => void) | undefined;
    warmupInvokeMock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveWarmup = resolve;
      })
    );

    const first = warmupConversation('conv-1');
    const second = warmupConversation('conv-1');

    expect(warmupInvokeMock).toHaveBeenCalledTimes(1);
    expect(warmupInvokeMock).toHaveBeenCalledWith({ conversation_id: 'conv-1' });

    resolveWarmup?.();
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
  });

  it('retries after a failed warmup', async () => {
    warmupInvokeMock.mockRejectedValueOnce(new Error('warmup failed')).mockResolvedValueOnce(undefined);

    await expect(warmupConversation('conv-1')).rejects.toThrow('warmup failed');
    await expect(warmupConversation('conv-1')).resolves.toBeUndefined();

    expect(warmupInvokeMock).toHaveBeenCalledTimes(2);
  });

  it('skips repeated warmup after a conversation is already ready', async () => {
    warmupInvokeMock.mockResolvedValue(undefined);

    await expect(warmupConversation('conv-1')).resolves.toBeUndefined();
    await expect(warmupConversation('conv-1')).resolves.toBeUndefined();

    expect(warmupInvokeMock).toHaveBeenCalledTimes(1);
  });

  it('treats a missing warmup route as an unsupported optional capability', async () => {
    warmupInvokeMock.mockRejectedValueOnce(
      new BackendHttpError({
        method: 'POST',
        path: '/api/conversations/conv-1/warmup',
        status: 404,
        body: { success: false, error: 'Route not found', code: 'NOT_FOUND' },
      })
    );

    await expect(warmupConversation('conv-1')).resolves.toBeUndefined();
    await expect(warmupConversation('conv-2')).resolves.toBeUndefined();

    expect(warmupInvokeMock).toHaveBeenCalledTimes(1);
    expect(getWarmupConversationStatus('conv-1')).toEqual({ phase: 'ready', attempt: 1 });
    expect(getWarmupConversationStatus('conv-2')).toEqual({ phase: 'ready', attempt: 0 });
  });

  it('does not hide conversation-level 404 responses', async () => {
    const error = new BackendHttpError({
      method: 'POST',
      path: '/api/conversations/missing/warmup',
      status: 404,
      body: { success: false, error: 'Conversation not found', code: 'NOT_FOUND' },
    });
    warmupInvokeMock.mockRejectedValue(error);

    await expect(warmupConversation('missing')).rejects.toBe(error);

    expect(getWarmupConversationStatus('missing')).toMatchObject({ phase: 'error', attempt: 1 });
  });

  it('does not hide server failures', async () => {
    const error = new BackendHttpError({
      method: 'POST',
      path: '/api/conversations/conv-1/warmup',
      status: 500,
      body: { success: false, error: 'Runtime unavailable', code: 'INTERNAL_ERROR' },
    });
    warmupInvokeMock.mockRejectedValue(error);

    await expect(warmupConversation('conv-1')).rejects.toBe(error);
  });

  it('re-probes route support after test state is reset', async () => {
    warmupInvokeMock.mockRejectedValueOnce(
      new BackendHttpError({
        method: 'POST',
        path: '/api/conversations/conv-1/warmup',
        status: 404,
        body: 'Route not found',
      })
    );

    await expect(warmupConversation('conv-1')).resolves.toBeUndefined();
    resetWarmupConversationStateForTests();
    warmupInvokeMock.mockResolvedValueOnce(undefined);
    await expect(warmupConversation('conv-2')).resolves.toBeUndefined();

    expect(warmupInvokeMock).toHaveBeenCalledTimes(2);
  });
});
