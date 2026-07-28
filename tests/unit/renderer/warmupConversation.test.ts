import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getWarmupConversationStatus,
  resetWarmupConversationStateForTests,
  warmupConversation,
} from '@/renderer/pages/conversation/utils/warmupConversation';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import type { EnsureConversationRuntimeResponse } from '@/common/types/platform/acpTypes';

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
  const snapshot: EnsureConversationRuntimeResponse = {
    recovered: true,
    config_options: [
      {
        id: 'model',
        category: 'model',
        option_type: 'select',
        current_value: 'gpt-5.6-sol',
        options: [{ value: 'gpt-5.6-sol', label: '5.6 Sol' }],
      },
      {
        id: 'mode',
        category: 'mode',
        option_type: 'select',
        current_value: 'agent',
        options: [{ value: 'agent', label: 'Agent' }],
      },
    ],
    runtime: {
      state: 'idle',
      can_send_message: true,
      has_task: false,
      is_processing: false,
      pending_confirmations: 0,
      turn_id: null,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetWarmupConversationStateForTests();
  });

  it('coalesces concurrent warmups for the same conversation', async () => {
    let resolveWarmup: ((value: EnsureConversationRuntimeResponse) => void) | undefined;
    ensureRuntimeInvokeMock.mockReturnValue(
      new Promise<EnsureConversationRuntimeResponse>((resolve) => {
        resolveWarmup = resolve;
      })
    );

    const first = warmupConversation('conv-1');
    const second = warmupConversation('conv-1');

    expect(ensureRuntimeInvokeMock).toHaveBeenCalledTimes(1);
    expect(ensureRuntimeInvokeMock).toHaveBeenCalledWith({ conversation_id: 'conv-1' });

    resolveWarmup?.(snapshot);
    await expect(Promise.all([first, second])).resolves.toEqual([snapshot, snapshot]);
  });

  it('retries after a failed warmup', async () => {
    ensureRuntimeInvokeMock.mockRejectedValueOnce(new Error('runtime ensure failed')).mockResolvedValueOnce(snapshot);

    await expect(warmupConversation('conv-1')).rejects.toThrow('runtime ensure failed');
    await expect(warmupConversation('conv-1')).resolves.toEqual(snapshot);

    expect(ensureRuntimeInvokeMock).toHaveBeenCalledTimes(2);
  });

  it('re-probes completed warmups instead of reusing a stale snapshot', async () => {
    const updatedSnapshot = {
      ...snapshot,
      config_options: snapshot.config_options.map((option) =>
        option.id === 'mode' ? { ...option, current_value: 'full-access' } : option
      ),
    };
    ensureRuntimeInvokeMock.mockResolvedValueOnce(snapshot).mockResolvedValueOnce(updatedSnapshot);

    await expect(warmupConversation('conv-1')).resolves.toEqual(snapshot);
    await expect(warmupConversation('conv-1')).resolves.toEqual(updatedSnapshot);

    expect(ensureRuntimeInvokeMock).toHaveBeenCalledTimes(2);
  });

  it('does not turn a missing runtime ensure route into ready state', async () => {
    const error = new BackendHttpError({
      method: 'POST',
      path: '/api/conversations/conv-1/runtime/ensure',
      status: 404,
      body: { success: false, error: 'Route not found', code: 'NOT_FOUND' },
    });
    ensureRuntimeInvokeMock.mockRejectedValueOnce(error).mockResolvedValueOnce(snapshot);

    await expect(warmupConversation('conv-1')).rejects.toBe(error);
    await expect(warmupConversation('conv-2')).resolves.toEqual(snapshot);

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
    ensureRuntimeInvokeMock.mockResolvedValue(snapshot);
    await expect(warmupConversation('conv-1')).resolves.toEqual(snapshot);
    resetWarmupConversationStateForTests();
    await expect(warmupConversation('conv-2')).resolves.toEqual(snapshot);

    expect(ensureRuntimeInvokeMock).toHaveBeenCalledTimes(2);
  });
});
