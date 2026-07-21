import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getWarmupConversationStatus,
  resetWarmupConversationStateForTests,
  warmupConversation,
} from '@/renderer/pages/conversation/utils/warmupConversation';
import { BackendHttpError } from '@/common/adapter/httpBridge';

const { ensureRuntimeInvokeMock } = vi.hoisted(() => ({
  ensureRuntimeInvokeMock: vi.fn(),
}));

vi.mock('@/common/adapter/httpBridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/common/adapter/httpBridge')>();
  return {
    ...actual,
    httpPost: vi.fn(() => ({ invoke: ensureRuntimeInvokeMock })),
  };
});

describe('warmupConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWarmupConversationStateForTests();
  });

  it('coalesces concurrent warmups for the same conversation', async () => {
    let resolveWarmup: (() => void) | undefined;
    ensureRuntimeInvokeMock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveWarmup = resolve;
      })
    );

    const first = warmupConversation('conv-1');
    const second = warmupConversation('conv-1');

    expect(ensureRuntimeInvokeMock).toHaveBeenCalledTimes(1);
    expect(ensureRuntimeInvokeMock).toHaveBeenCalledWith({ conversation_id: 'conv-1' });

    resolveWarmup?.();
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
  });

  it('retries after a failed warmup', async () => {
    ensureRuntimeInvokeMock.mockRejectedValueOnce(new Error('runtime ensure failed')).mockResolvedValueOnce(undefined);

    await expect(warmupConversation('conv-1')).rejects.toThrow('runtime ensure failed');
    await expect(warmupConversation('conv-1')).resolves.toBeUndefined();

    expect(ensureRuntimeInvokeMock).toHaveBeenCalledTimes(2);
  });

  it('skips repeated warmup after a conversation is already ready', async () => {
    ensureRuntimeInvokeMock.mockResolvedValue(undefined);

    await expect(warmupConversation('conv-1')).resolves.toBeUndefined();
    await expect(warmupConversation('conv-1')).resolves.toBeUndefined();

    expect(ensureRuntimeInvokeMock).toHaveBeenCalledTimes(1);
  });

  it('does not turn a missing runtime ensure route into ready state', async () => {
    const error = new BackendHttpError({
      method: 'POST',
      path: '/api/conversations/conv-1/runtime/ensure',
      status: 404,
      body: { success: false, error: 'Route not found', code: 'NOT_FOUND' },
    });
    ensureRuntimeInvokeMock.mockRejectedValueOnce(error).mockResolvedValueOnce(undefined);

    await expect(warmupConversation('conv-1')).rejects.toBe(error);
    await expect(warmupConversation('conv-2')).resolves.toBeUndefined();

    expect(ensureRuntimeInvokeMock).toHaveBeenCalledTimes(2);
    expect(getWarmupConversationStatus('conv-1')).toMatchObject({ phase: 'error', attempt: 1 });
    expect(getWarmupConversationStatus('conv-2')).toEqual({ phase: 'ready', attempt: 1 });
  });

  it('does not hide server failures', async () => {
    const error = new BackendHttpError({
      method: 'POST',
      path: '/api/conversations/conv-1/runtime/ensure',
      status: 500,
      body: { success: false, error: 'Runtime unavailable', code: 'INTERNAL_ERROR' },
    });
    ensureRuntimeInvokeMock.mockRejectedValue(error);

    await expect(warmupConversation('conv-1')).rejects.toBe(error);
  });

  it('re-probes runtime readiness after test state is reset', async () => {
    ensureRuntimeInvokeMock.mockResolvedValue(undefined);
    await expect(warmupConversation('conv-1')).resolves.toBeUndefined();
    resetWarmupConversationStateForTests();
    await expect(warmupConversation('conv-2')).resolves.toBeUndefined();

    expect(ensureRuntimeInvokeMock).toHaveBeenCalledTimes(2);
  });
});
