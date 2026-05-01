import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/config/storage';

export type OplFirstLaunchPreparationResult =
  | ({ status: 'already-prepared' } & OplFirstLaunchResultDetails)
  | ({ status: 'prepared' } & OplFirstLaunchResultDetails)
  | ({ status: 'codex-config-needed' } & OplFirstLaunchResultDetails)
  | ({ status: 'setup-needed' } & OplFirstLaunchResultDetails)
  | ({ status: 'failed' } & OplFirstLaunchResultDetails);

export type OplFirstRunLogSnapshot = {
  path: string;
  entries: Array<Record<string, unknown>>;
  latest: Record<string, unknown> | null;
};

type OplFirstLaunchResultDetails = {
  message?: string;
  readyToLaunch?: boolean;
  blockers?: string[];
  codexDefaultProfile?: OplCodexDefaultProfile;
  firstRunLog?: OplFirstRunLogSnapshot;
};

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
const INITIALIZE_ARGS = ['system', 'initialize', '--json'];
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
    codex_default_profile?: OplCodexDefaultProfile;
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

export type OplCodexDefaultProfile = {
  model_provider?: string;
  provider_name?: string;
  model?: string;
  model_reasoning_effort?: string | null;
  base_url?: string;
  base_url_role?: string;
  model_profile_role?: string;
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

const readFirstRunLogSnapshot = async (): Promise<OplFirstRunLogSnapshot | undefined> => {
  try {
    return await ipcBridge.shell.readOplFirstRunLog.invoke();
  } catch {
    return undefined;
  }
};

const appendFirstRunLogEvent = async (eventType: string, payload: Record<string, unknown> = {}): Promise<void> => {
  try {
    await ipcBridge.shell.appendOplFirstRunLog.invoke({ eventType, payload });
  } catch {
    // First-run log visibility must not block environment preparation.
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
  const blockingItems = initialize?.setup_flow?.blocking_items ?? [];
  if (initialize?.setup_flow?.ready_to_launch) {
    if (options.installRecommendedSkills && needsRecommendedSkillInstall(initialize)) {
      return { status: 'setup-needed', readyToLaunch: true, blockers: ['recommended_skills'] };
    }

    await ConfigStorage.set(PREPARED_AT_CONFIG_KEY, Date.now());
    return { status: readyStatus, readyToLaunch: true, blockers: [] };
  }

  const actionLabel = initialize?.recommended_next_action?.label;
  if (blockingItems.includes('codex_config')) {
    return {
      status: 'codex-config-needed',
      message: actionLabel || 'Configure Codex API key',
      readyToLaunch: false,
      blockers: blockingItems,
      codexDefaultProfile: initialize?.codex_default_profile,
    };
  }

  return {
    status: 'setup-needed',
    message: actionLabel || (blockingItems.length ? blockingItems.join(', ') : undefined),
    readyToLaunch: false,
    blockers: blockingItems,
  };
};

export const configureOplCodexForFirstLaunch = async (
  apiKey: string,
  options: OplFirstLaunchPreparationOptions = {}
): Promise<OplFirstLaunchPreparationResult> => {
  await appendFirstRunLogEvent('gui_codex_configure_started', { api_key_present: Boolean(apiKey.trim()) });
  const result = await ipcBridge.shell.configureOplCodex.invoke({ apiKey });
  if (result.exitCode !== 0) {
    const message = getFailureMessage(result);
    await appendFirstRunLogEvent('gui_codex_configure_failed', { status: 'failed', message });
    return {
      status: 'failed',
      message,
      readyToLaunch: false,
      firstRunLog: await readFirstRunLogSnapshot(),
    };
  }

  await appendFirstRunLogEvent('gui_codex_configure_completed', { status: 'completed', api_key_present: true });
  return await runOplFirstLaunchEnvironmentPreparation(options);
};

const runOplFirstLaunchEnvironmentPreparation = async (
  options: OplFirstLaunchPreparationOptions = {}
): Promise<OplFirstLaunchPreparationResult> => {
  const firstRunLog = await readFirstRunLogSnapshot();
  await appendFirstRunLogEvent('gui_preparation_started');
  try {
    if (await readPreparedState()) {
      startModuleReconcileForAppVersion(options.appVersion);
      await appendFirstRunLogEvent('gui_preparation_skipped', { status: 'already-prepared' });
      return { status: 'already-prepared', readyToLaunch: true, firstRunLog };
    }

    const initialState = await readInitializeState('already-prepared', { installRecommendedSkills: true });
    if (initialState.status === 'failed') {
      await appendFirstRunLogEvent('gui_initialize_failed', { status: 'failed', message: initialState.message });
      return { ...initialState, firstRunLog };
    }

    let readyState = initialState;
    if (initialState.status === 'setup-needed') {
      const result = await ipcBridge.shell.runOplCommand.invoke({ args: [...INSTALL_ARGS] });
      if (result.exitCode !== 0) {
        const message = getFailureMessage(result);
        await appendFirstRunLogEvent('gui_install_failed', { status: 'failed', message });
        return { status: 'failed', message, readyToLaunch: false, blockers: initialState.blockers, firstRunLog };
      }

      const preparedState = await readInitializeState('prepared');
      if (preparedState.status !== 'prepared' && preparedState.status !== 'already-prepared') {
        await appendFirstRunLogEvent('gui_post_install_initialize', {
          status: preparedState.status,
          blockers: preparedState.blockers ?? [],
          message: preparedState.message,
        });
        return { ...preparedState, firstRunLog };
      }
      readyState = preparedState;
    }

    startModuleReconcileForAppVersion(options.appVersion);

    const result = options.appVersion && (readyState.status === 'prepared' || readyState.status === 'already-prepared')
      ? { status: 'prepared' as const, readyToLaunch: true, blockers: [] }
      : readyState;
    await appendFirstRunLogEvent('gui_preparation_completed', { status: result.status });
    return { ...result, firstRunLog };
  } catch (error) {
    const message = error instanceof Error ? error.message : undefined;
    await appendFirstRunLogEvent('gui_preparation_error', { status: 'failed', message });
    return {
      status: 'failed',
      message,
      readyToLaunch: false,
      firstRunLog,
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
