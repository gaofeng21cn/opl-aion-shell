import { useEffect, useMemo, useState } from 'react';
import {
  readCoreLaunchPrerequisiteState,
  type CoreLaunchPrerequisiteState,
} from '@/renderer/pages/FirstRun/initializeModel';
import { useOplAppState, type OplAppStateProvenance } from './useOplAppState';

export const POST_LOGIN_SETUP_CHECK_TIMEOUT_MS = 5_000;

type CoreLaunchPrerequisiteOptions = {
  requireLive?: boolean;
};

export type CoreLaunchPrerequisiteQueryState = CoreLaunchPrerequisiteState & {
  loading: boolean;
  error: string | null;
  provenance: OplAppStateProvenance;
};

export function useCoreLaunchPrerequisites(
  options: CoreLaunchPrerequisiteOptions = {}
): CoreLaunchPrerequisiteQueryState {
  const requireLive = options.requireLive === true;
  const appStateQuery = useOplAppState('fast', { autoLoad: !requireLive, requireLive });
  const [liveCheckPending, setLiveCheckPending] = useState(requireLive);

  useEffect(() => {
    if (!requireLive) {
      setLiveCheckPending(false);
      return;
    }
    let active = true;
    setLiveCheckPending(true);
    const timeout = window.setTimeout(() => {
      if (active) setLiveCheckPending(false);
    }, POST_LOGIN_SETUP_CHECK_TIMEOUT_MS);
    void appStateQuery
      .load('fast', { forceFresh: true })
      .catch((): null => null)
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setLiveCheckPending(false);
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [appStateQuery.load, requireLive]);

  return useMemo(
    () => ({
      ...readCoreLaunchPrerequisiteState(appStateQuery.appState),
      loading: requireLive ? liveCheckPending : appStateQuery.loading,
      error: appStateQuery.error,
      provenance: appStateQuery.provenance,
    }),
    [
      appStateQuery.appState,
      appStateQuery.error,
      appStateQuery.loading,
      appStateQuery.provenance,
      liveCheckPending,
      requireLive,
    ]
  );
}
