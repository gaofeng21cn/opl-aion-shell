import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CodexThreadDetail } from '@/common/types/codex/appServerThreads';
import { useCanonicalCodexSettings } from '@/renderer/hooks/agent/useCanonicalCodexSettings';

const { configureInvokeMock, readInvokeMock } = vi.hoisted(() => ({
  configureInvokeMock: vi.fn(),
  readInvokeMock: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    codexThreads: {
      configure: { invoke: configureInvokeMock },
      read: { invoke: readInvokeMock },
    },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: vi.fn(() => undefined),
  },
}));

vi.mock('@/renderer/pages/guid/hooks/agentSelectionUtils', () => ({
  savePreferredCodexSelection: vi.fn(async () => {}),
}));

function detail(permissionMode: 'read-only' | 'default' | 'full-access'): CodexThreadDetail {
  return {
    thread: {
      id: 'thread-1',
      title: 'Canonical task',
      summary: '',
      status: 'idle',
      projectId: '',
      workspace: '/workspace/project',
      host: 'local-host',
      owner: null,
      goal: null,
      parentThreadId: null,
      ancestorThreadIds: [],
      activeTurnId: null,
      archived: false,
      updatedAt: '2026-07-30T00:00:00.000Z',
    },
    history: [],
    settings: {
      model: 'gpt-5.6-sol',
      effort: 'high',
      permissionMode,
    },
    models: [],
  };
}

describe('useCanonicalCodexSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readInvokeMock.mockResolvedValue(detail('default'));
  });

  it('returns and projects the permission mode confirmed by canonical readback', async () => {
    configureInvokeMock.mockResolvedValue(detail('read-only'));
    const { result } = renderHook(() =>
      useCanonicalCodexSettings({
        conversationId: 'conversation-1',
        threadId: 'thread-1',
      })
    );

    await waitFor(() => expect(result.current?.permissionMode).toBe('default'));

    let confirmedMode: string | undefined;
    await act(async () => {
      confirmedMode = await result.current?.selectPermissionMode('plan');
    });

    expect(configureInvokeMock).toHaveBeenCalledWith({
      threadId: 'thread-1',
      permissionMode: 'read-only',
    });
    expect(confirmedMode).toBe('read-only');
    expect(result.current?.permissionMode).toBe('read-only');
  });
});
