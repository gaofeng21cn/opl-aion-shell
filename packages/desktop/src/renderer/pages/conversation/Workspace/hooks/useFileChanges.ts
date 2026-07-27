/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { CompareResult, FileChangeInfo, SnapshotInfo } from '@/common/types/platform/fileSnapshot';
import { useCallback, useEffect, useRef, useState } from 'react';

type UseFileChangesParams = {
  workspace: string;
};

type UseFileChangesReturn = {
  staged: FileChangeInfo[];
  unstaged: FileChangeInfo[];
  changeCount: number;
  loading: boolean;
  snapshotInfo: SnapshotInfo | null;
  refreshChanges: () => Promise<void>;
  stageFile: (file_path: string) => Promise<void>;
  stageAll: () => Promise<void>;
  unstageFile: (file_path: string) => Promise<void>;
  unstageAll: () => Promise<void>;
  discardFile: (file_path: string, operation: FileChangeInfo['operation']) => Promise<void>;
  resetFile: (file_path: string, operation: FileChangeInfo['operation']) => Promise<void>;
};

type SnapshotLease = {
  consumers: number;
  info: SnapshotInfo | null;
  queue: Promise<void>;
};

const snapshotLeases = new Map<string, SnapshotLease>();

function acquireSnapshot(workspace: string): Promise<SnapshotInfo> {
  const lease = snapshotLeases.get(workspace) ?? {
    consumers: 0,
    info: null,
    queue: Promise.resolve(),
  };
  snapshotLeases.set(workspace, lease);
  lease.consumers += 1;

  const request = lease.queue.then(async () => {
    if (lease.info) return lease.info;
    const info = await ipcBridge.fileSnapshot.init.invoke({ workspace });
    lease.info = info;
    return info;
  });
  lease.queue = request.then<void, void>(
    () => {},
    () => {}
  );
  return request;
}

function releaseSnapshot(workspace: string): void {
  const lease = snapshotLeases.get(workspace);
  if (!lease) return;
  lease.consumers = Math.max(0, lease.consumers - 1);

  lease.queue = lease.queue
    .then(async () => {
      if (lease.consumers > 0) return;
      try {
        if (lease.info) {
          await ipcBridge.fileSnapshot.dispose.invoke({ workspace });
        }
      } finally {
        lease.info = null;
        if (lease.consumers === 0 && snapshotLeases.get(workspace) === lease) {
          snapshotLeases.delete(workspace);
        }
      }
    })
    .catch(() => {});
}

export function useFileChanges({ workspace }: UseFileChangesParams): UseFileChangesReturn {
  const [result, setResult] = useState<CompareResult>({ staged: [], unstaged: [] });
  const [loading, setLoading] = useState(false);
  const [snapshotInfo, setSnapshotInfo] = useState<SnapshotInfo | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!workspace) return;

    let active = true;
    initializedRef.current = false;
    setResult({ staged: [], unstaged: [] });
    setSnapshotInfo(null);

    acquireSnapshot(workspace)
      .then((info) => {
        if (!active) return;
        setSnapshotInfo(info);
        initializedRef.current = true;
      })
      .catch((err) => {
        if (!active) return;
        console.error('[useFileChanges] Failed to init snapshot:', err);
      });

    return () => {
      active = false;
      initializedRef.current = false;
      releaseSnapshot(workspace);
    };
  }, [workspace]);

  // Silent refresh: update data without showing loading spinner (used after git operations)
  const silentRefresh = useCallback(async () => {
    if (!workspace || !initializedRef.current) return;
    try {
      const res = await ipcBridge.fileSnapshot.compare.invoke({ workspace });
      setResult(res);
    } catch (err) {
      console.error('[useFileChanges] Failed to compare:', err);
    }
  }, [workspace]);

  // Full refresh with loading indicator (used for manual refresh button)
  const refreshChanges = useCallback(async () => {
    if (!workspace || !initializedRef.current) return;
    setLoading(true);
    try {
      const res = await ipcBridge.fileSnapshot.compare.invoke({ workspace });
      setResult(res);
    } catch (err) {
      console.error('[useFileChanges] Failed to compare:', err);
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  const stageFile = useCallback(
    async (file_path: string) => {
      if (!workspace) return;
      await ipcBridge.fileSnapshot.stageFile.invoke({ workspace, file_path });
      await silentRefresh();
    },
    [workspace, silentRefresh]
  );

  const stageAll = useCallback(async () => {
    if (!workspace) return;
    await ipcBridge.fileSnapshot.stageAll.invoke({ workspace });
    await silentRefresh();
  }, [workspace, silentRefresh]);

  const unstageFile = useCallback(
    async (file_path: string) => {
      if (!workspace) return;
      await ipcBridge.fileSnapshot.unstageFile.invoke({ workspace, file_path });
      await silentRefresh();
    },
    [workspace, silentRefresh]
  );

  const unstageAll = useCallback(async () => {
    if (!workspace) return;
    await ipcBridge.fileSnapshot.unstageAll.invoke({ workspace });
    await silentRefresh();
  }, [workspace, silentRefresh]);

  const discardFile = useCallback(
    async (file_path: string, operation: FileChangeInfo['operation']) => {
      if (!workspace) return;
      await ipcBridge.fileSnapshot.discardFile.invoke({ workspace, file_path, operation });
      await silentRefresh();
    },
    [workspace, silentRefresh]
  );

  const resetFile = useCallback(
    async (file_path: string, operation: FileChangeInfo['operation']) => {
      if (!workspace) return;
      await ipcBridge.fileSnapshot.resetFile.invoke({ workspace, file_path, operation });
      await silentRefresh();
    },
    [workspace, silentRefresh]
  );

  return {
    staged: result.staged,
    unstaged: result.unstaged,
    changeCount: result.staged.length + result.unstaged.length,
    loading,
    snapshotInfo,
    refreshChanges,
    stageFile,
    stageAll,
    unstageFile,
    unstageAll,
    discardFile,
    resetFile,
  };
}
