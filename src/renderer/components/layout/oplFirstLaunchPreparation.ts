import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/config/storage';

export type OplFirstLaunchPreparationResult =
  | { status: 'already-prepared' }
  | { status: 'prepared' }
  | { status: 'failed'; message?: string };

type OplFirstLaunchPreparationState = {
  promise: Promise<OplFirstLaunchPreparationResult>;
  messageOwner: symbol | null;
};

const PREPARED_AT_CONFIG_KEY = 'opl.firstLaunchInstallPreparedAt';
const INSTALL_ARGS = ['install', '--skip-gui-open'];

let preparationState: OplFirstLaunchPreparationState | null = null;

const getFailureMessage = (result: { stdout: string; stderr: string }): string | undefined =>
  result.stderr || result.stdout || undefined;

const runOplFirstLaunchEnvironmentPreparation = async (): Promise<OplFirstLaunchPreparationResult> => {
  try {
    const preparedAt = await ConfigStorage.get(PREPARED_AT_CONFIG_KEY);
    if (preparedAt) {
      return { status: 'already-prepared' };
    }

    const result = await ipcBridge.shell.runOplCommand.invoke({ args: [...INSTALL_ARGS] });
    if (result.exitCode === 0) {
      await ConfigStorage.set(PREPARED_AT_CONFIG_KEY, Date.now());
      return { status: 'prepared' };
    }

    return { status: 'failed', message: getFailureMessage(result) };
  } catch (error) {
    return {
      status: 'failed',
      message: error instanceof Error ? error.message : undefined,
    };
  }
};

export const startOplFirstLaunchEnvironmentPreparation = (): Promise<OplFirstLaunchPreparationResult> => {
  if (preparationState) {
    return preparationState.promise;
  }

  const promise = runOplFirstLaunchEnvironmentPreparation().finally(() => {
    preparationState = null;
  });
  preparationState = { promise, messageOwner: null };
  return promise;
};

export const claimOplFirstLaunchPreparationMessage = (owner: symbol): boolean => {
  if (!preparationState || preparationState.messageOwner) {
    return false;
  }

  preparationState.messageOwner = owner;
  return true;
};

export const releaseOplFirstLaunchPreparationMessage = (owner: symbol): void => {
  if (preparationState?.messageOwner === owner) {
    preparationState.messageOwner = null;
  }
};

export const resetOplFirstLaunchPreparationStateForTests = (): void => {
  preparationState = null;
};
