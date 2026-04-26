import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/config/storage';

export type OplFirstLaunchPreparationResult =
  | { status: 'already-prepared' }
  | { status: 'prepared' }
  | { status: 'setup-needed'; message?: string }
  | { status: 'failed'; message?: string };

type OplFirstLaunchPreparationState = {
  promise: Promise<OplFirstLaunchPreparationResult>;
  messageOwner: symbol | null;
};

const PREPARED_AT_CONFIG_KEY = 'opl.firstLaunchInstallPreparedAt';
const INSTALL_ARGS = ['install', '--skip-gui-open'];
const INITIALIZE_ARGS = ['system', 'initialize'];

type OplSystemInitializePayload = {
  system_initialize?: {
    setup_flow?: {
      ready_to_launch?: boolean;
      blocking_items?: string[];
    };
    recommended_next_action?: {
      label?: string;
    };
  };
};

let preparationState: OplFirstLaunchPreparationState | null = null;

const getFailureMessage = (result: { stdout: string; stderr: string }): string | undefined =>
  result.stderr || result.stdout || undefined;

const parseInitializePayload = (stdout: string): OplSystemInitializePayload['system_initialize'] | null => {
  try {
    const payload = JSON.parse(stdout) as OplSystemInitializePayload;
    return payload.system_initialize ?? null;
  } catch {
    return null;
  }
};

const readInitializeState = async (): Promise<OplFirstLaunchPreparationResult> => {
  const initializeResult = await ipcBridge.shell.runOplCommand.invoke({ args: [...INITIALIZE_ARGS] });
  if (initializeResult.exitCode !== 0) {
    return { status: 'failed', message: getFailureMessage(initializeResult) };
  }

  const initialize = parseInitializePayload(initializeResult.stdout);
  if (initialize?.setup_flow?.ready_to_launch) {
    await ConfigStorage.set(PREPARED_AT_CONFIG_KEY, Date.now());
    return { status: 'prepared' };
  }

  const blockingItems = initialize?.setup_flow?.blocking_items ?? [];
  const actionLabel = initialize?.recommended_next_action?.label;
  return {
    status: 'setup-needed',
    message: actionLabel || (blockingItems.length ? blockingItems.join(', ') : undefined),
  };
};

const runOplFirstLaunchEnvironmentPreparation = async (): Promise<OplFirstLaunchPreparationResult> => {
  try {
    const preparedAt = await ConfigStorage.get(PREPARED_AT_CONFIG_KEY);
    if (preparedAt) {
      const state = await readInitializeState();
      return state.status === 'prepared' ? { status: 'already-prepared' } : state;
    }

    const result = await ipcBridge.shell.runOplCommand.invoke({ args: [...INSTALL_ARGS] });
    if (result.exitCode === 0) {
      return readInitializeState();
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
