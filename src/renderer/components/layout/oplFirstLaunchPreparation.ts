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

type OplModuleReconcileState = {
  appVersion: string;
  promise: Promise<void>;
};

const PREPARED_AT_CONFIG_KEY = 'opl.firstLaunchInstallPreparedAt';
const MODULE_RECONCILED_APP_VERSION_CONFIG_KEY = 'opl.lastModuleReconcileAppVersion';
const INSTALL_ARGS = ['install', '--skip-gui-open'];
const INITIALIZE_ARGS = ['system', 'initialize'];
const RECONCILE_MODULES_ARGS = ['system', 'reconcile-modules'];

type OplFirstLaunchPreparationOptions = {
  appVersion?: string;
};

type OplSystemInitializePayload = {
  system_initialize?: {
    setup_flow?: {
      ready_to_launch?: boolean;
      blocking_items?: string[];
    };
    recommended_skills?: {
      summary?: {
        missing?: number;
      };
    };
    recommended_next_action?: {
      label?: string;
    };
  };
};

let preparationState: OplFirstLaunchPreparationState | null = null;
let moduleReconcileState: OplModuleReconcileState | null = null;

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

const needsRecommendedSkillInstall = (initialize: OplSystemInitializePayload['system_initialize'] | null): boolean =>
  (initialize?.recommended_skills?.summary?.missing ?? 0) > 0;

const readPreparedState = async (): Promise<boolean> => {
  const preparedAt = await ConfigStorage.get(PREPARED_AT_CONFIG_KEY);
  return Boolean(preparedAt);
};

const reconcileModulesForAppVersion = async (appVersion?: string): Promise<OplFirstLaunchPreparationResult | null> => {
  if (!appVersion) return null;

  const reconciledVersion = await ConfigStorage.get(MODULE_RECONCILED_APP_VERSION_CONFIG_KEY);
  if (reconciledVersion === appVersion) return null;

  const result = await ipcBridge.shell.runOplCommand.invoke({ args: [...RECONCILE_MODULES_ARGS] });
  if (result.exitCode !== 0) {
    return { status: 'failed', message: getFailureMessage(result) };
  }

  await ConfigStorage.set(MODULE_RECONCILED_APP_VERSION_CONFIG_KEY, appVersion);
  return null;
};

const startModuleReconcileForAppVersion = (appVersion?: string): void => {
  const normalizedVersion = appVersion?.trim();
  if (!normalizedVersion) return;
  if (moduleReconcileState?.appVersion === normalizedVersion) return;

  const promise = reconcileModulesForAppVersion(normalizedVersion)
    .then((result) => {
      if (result?.status === 'failed') {
        console.warn('[OPL] Module reconcile failed after App version change:', result.message);
      }
    })
    .catch((error) => {
      console.warn('[OPL] Module reconcile failed after App version change:', error);
    })
    .finally(() => {
      if (moduleReconcileState?.appVersion === normalizedVersion) {
        moduleReconcileState = null;
      }
    });
  moduleReconcileState = { appVersion: normalizedVersion, promise };
};

const readInitializeState = async (
  readyStatus: Extract<OplFirstLaunchPreparationResult['status'], 'already-prepared' | 'prepared'> = 'prepared',
  options: { installRecommendedSkills?: boolean } = {}
): Promise<OplFirstLaunchPreparationResult> => {
  const initializeResult = await ipcBridge.shell.runOplCommand.invoke({ args: [...INITIALIZE_ARGS] });
  if (initializeResult.exitCode !== 0) {
    return { status: 'failed', message: getFailureMessage(initializeResult) };
  }

  const initialize = parseInitializePayload(initializeResult.stdout);
  if (initialize?.setup_flow?.ready_to_launch) {
    if (options.installRecommendedSkills && needsRecommendedSkillInstall(initialize)) {
      return { status: 'setup-needed' };
    }

    await ConfigStorage.set(PREPARED_AT_CONFIG_KEY, Date.now());
    return { status: readyStatus };
  }

  const blockingItems = initialize?.setup_flow?.blocking_items ?? [];
  const actionLabel = initialize?.recommended_next_action?.label;
  return {
    status: 'setup-needed',
    message: actionLabel || (blockingItems.length ? blockingItems.join(', ') : undefined),
  };
};

const runOplFirstLaunchEnvironmentPreparation = async (
  options: OplFirstLaunchPreparationOptions = {}
): Promise<OplFirstLaunchPreparationResult> => {
  try {
    if (await readPreparedState()) {
      startModuleReconcileForAppVersion(options.appVersion);
      return { status: 'already-prepared' };
    }

    const initialState = await readInitializeState('already-prepared', { installRecommendedSkills: true });
    if (initialState.status === 'failed') {
      return initialState;
    }

    let readyState = initialState;
    if (initialState.status === 'setup-needed') {
      const result = await ipcBridge.shell.runOplCommand.invoke({ args: [...INSTALL_ARGS] });
      if (result.exitCode !== 0) {
        return { status: 'failed', message: getFailureMessage(result) };
      }

      const preparedState = await readInitializeState('prepared');
      if (preparedState.status === 'failed' || preparedState.status === 'setup-needed') {
        return preparedState;
      }
      readyState = preparedState;
    }

    startModuleReconcileForAppVersion(options.appVersion);

    return options.appVersion ? { status: 'prepared' } : readyState;
  } catch (error) {
    return {
      status: 'failed',
      message: error instanceof Error ? error.message : undefined,
    };
  }
};

export const startOplFirstLaunchEnvironmentPreparation = (
  options: OplFirstLaunchPreparationOptions = {}
): Promise<OplFirstLaunchPreparationResult> => {
  if (preparationState) {
    return preparationState.promise;
  }

  const promise = runOplFirstLaunchEnvironmentPreparation(options).finally(() => {
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
  moduleReconcileState = null;
};
