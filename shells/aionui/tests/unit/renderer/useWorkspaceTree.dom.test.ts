import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const getWorkspaceInvoke = vi.hoisted(() => vi.fn());
const dispatchWorkspaceHasFilesEvent = vi.hoisted(() => vi.fn());

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      getWorkspace: {
        invoke: getWorkspaceInvoke,
      },
    },
  },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: vi.fn(),
  },
}));

vi.mock('@/renderer/utils/workspace/workspaceEvents', () => ({
  dispatchWorkspaceHasFilesEvent,
}));

import { useWorkspaceTree } from '@/renderer/pages/conversation/Workspace/hooks/useWorkspaceTree';

describe('useWorkspaceTree', () => {
  it('keeps workspace folders collapsed after initial load', async () => {
    getWorkspaceInvoke.mockResolvedValueOnce([
      {
        name: 'workspace',
        fullPath: '/workspace',
        relativePath: '',
        isDir: true,
        isFile: false,
        children: [
          {
            name: 'docs',
            fullPath: '/workspace/docs',
            relativePath: 'docs',
            isDir: true,
            isFile: false,
            children: [],
          },
        ],
      },
    ]);

    const { result } = renderHook(() =>
      useWorkspaceTree({ workspace: '/workspace', conversation_id: 'conv-1', eventPrefix: 'codex' })
    );

    await act(async () => {
      await result.current.loadWorkspace('/workspace');
    });

    await waitFor(() => expect(result.current.expandedKeys).toEqual([]));
    expect(dispatchWorkspaceHasFilesEvent).toHaveBeenCalledWith(true, 'conv-1');
  });
});
