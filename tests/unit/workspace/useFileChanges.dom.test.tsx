/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SnapshotInfo } from '@/common/types/platform/fileSnapshot';
import { useFileChanges } from '@/renderer/pages/conversation/Workspace/hooks/useFileChanges';

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fileSnapshot: {
      init: { invoke: mocks.init },
      dispose: { invoke: mocks.dispose },
      compare: { invoke: vi.fn() },
      stageFile: { invoke: vi.fn() },
      stageAll: { invoke: vi.fn() },
      unstageFile: { invoke: vi.fn() },
      unstageAll: { invoke: vi.fn() },
      discardFile: { invoke: vi.fn() },
      resetFile: { invoke: vi.fn() },
    },
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('useFileChanges snapshot lifecycle', () => {
  beforeEach(() => {
    mocks.init.mockReset();
    mocks.dispose.mockReset();
    mocks.dispose.mockResolvedValue(undefined);
  });

  it('hands an in-flight workspace snapshot to a replacement mount before disposing it', async () => {
    const workspace = '/tmp/opl-workspace';
    const pendingInit = deferred<SnapshotInfo>();
    const snapshotInfo: SnapshotInfo = { mode: 'snapshot', branch: null };
    mocks.init.mockReturnValue(pendingInit.promise);

    const first = renderHook(() => useFileChanges({ workspace }));
    await waitFor(() => {
      expect(mocks.init).toHaveBeenCalledTimes(1);
    });

    first.unmount();
    const replacement = renderHook(() => useFileChanges({ workspace }));
    expect(mocks.init).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendingInit.resolve(snapshotInfo);
      await pendingInit.promise;
    });

    await waitFor(() => {
      expect(replacement.result.current.snapshotInfo).toEqual(snapshotInfo);
    });
    expect(mocks.dispose).not.toHaveBeenCalled();

    replacement.unmount();
    await waitFor(() => {
      expect(mocks.dispose).toHaveBeenCalledTimes(1);
    });
  });

  it('reinitializes after a failed dispose instead of reusing a stale snapshot', async () => {
    const workspace = '/tmp/opl-workspace-dispose-failure';
    const firstSnapshot: SnapshotInfo = { mode: 'snapshot', branch: 'first' };
    const replacementSnapshot: SnapshotInfo = { mode: 'snapshot', branch: 'replacement' };
    mocks.init.mockResolvedValueOnce(firstSnapshot).mockResolvedValueOnce(replacementSnapshot);
    mocks.dispose.mockRejectedValueOnce(new Error('dispose failed'));

    const first = renderHook(() => useFileChanges({ workspace }));
    await waitFor(() => {
      expect(first.result.current.snapshotInfo).toEqual(firstSnapshot);
    });

    first.unmount();
    await waitFor(() => {
      expect(mocks.dispose).toHaveBeenCalledTimes(1);
    });

    const replacement = renderHook(() => useFileChanges({ workspace }));
    await waitFor(() => {
      expect(mocks.init).toHaveBeenCalledTimes(2);
      expect(replacement.result.current.snapshotInfo).toEqual(replacementSnapshot);
    });

    replacement.unmount();
    await waitFor(() => {
      expect(mocks.dispose).toHaveBeenCalledTimes(2);
    });
  });
});
