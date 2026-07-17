/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { AutoUpdateStatus } from '@/common/update/updateTypes';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { useCallback, useEffect, useRef, useState } from 'react';

export type UseDesktopAutoUpdateStatusResult = {
  supported: boolean;
  status: AutoUpdateStatus | null;
  setStatus: (status: AutoUpdateStatus | null) => void;
};

/** Reads the main-process updater store without initiating an update check. */
export function useDesktopAutoUpdateStatus(): UseDesktopAutoUpdateStatusResult {
  const supported = isElectronDesktop();
  const [status, setStatusState] = useState<AutoUpdateStatus | null>(null);
  const revisionRef = useRef(0);
  const setStatus = useCallback((nextStatus: AutoUpdateStatus | null) => {
    revisionRef.current += 1;
    setStatusState(nextStatus);
  }, []);

  useEffect(() => {
    if (!supported) {
      setStatusState(null);
      return;
    }

    let active = true;
    const initialRevision = revisionRef.current;
    const unsubscribe = ipcBridge.autoUpdate.status.on((nextStatus) => {
      if (active) setStatus(nextStatus);
    });
    void ipcBridge.autoUpdate.getStatusSnapshot.invoke().then(
      (snapshot) => {
        if (active && revisionRef.current === initialRevision) setStatusState(snapshot);
      },
      () => {
        if (active && revisionRef.current === initialRevision) setStatusState({ status: 'error' });
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [setStatus, supported]);

  return { supported, status, setStatus };
}
