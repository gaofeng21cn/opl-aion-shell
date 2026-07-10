import { useMemo } from 'react';
import {
  readCoreLaunchPrerequisiteState,
  type CoreLaunchPrerequisiteState,
} from '@/renderer/pages/FirstRun/initializeModel';
import { useOplAppState } from './useOplAppState';

export function useCoreLaunchPrerequisites(): CoreLaunchPrerequisiteState {
  const { appState } = useOplAppState('fast');
  return useMemo(() => readCoreLaunchPrerequisiteState(appState), [appState]);
}
