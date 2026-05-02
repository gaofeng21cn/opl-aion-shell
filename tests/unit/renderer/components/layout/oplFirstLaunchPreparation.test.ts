import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunOplCommand = vi.hoisted(() => vi.fn());
const mockConfigureOplCodex = vi.hoisted(() => vi.fn());
const mockReadOplFirstRunLog = vi.hoisted(() => vi.fn());
const mockAppendOplFirstRunLog = vi.hoisted(() => vi.fn());
const mockConfigGet = vi.hoisted(() => vi.fn());
const mockConfigSet = vi.hoisted(() => vi.fn());

vi.mock('@/common', () => ({
  ipcBridge: {
    shell: {
      runOplCommand: {
        invoke: mockRunOplCommand,
      },
      configureOplCodex: {
        invoke: mockConfigureOplCodex,
      },
      readOplFirstRunLog: {
        invoke: mockReadOplFirstRunLog,
      },
      appendOplFirstRunLog: {
        invoke: mockAppendOplFirstRunLog,
      },
    },
  },
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: mockConfigGet,
    set: mockConfigSet,
  },
}));

import {
  claimOplFirstLaunchPreparationMessage,
  releaseOplFirstLaunchPreparationMessage,
  resetOplFirstLaunchPreparationStateForTests,
  configureOplCodexForFirstLaunch,
  startOplFirstLaunchEnvironmentPreparation,
} from '@/renderer/components/layout/oplFirstLaunchPreparation';

type OplCommandResult = { exitCode: number; stdout: string; stderr: string };
const readyInitializeResult: OplCommandResult = {
  exitCode: 0,
  stdout: JSON.stringify({
    system_initialize: {
      setup_flow: {
        ready_to_launch: true,
        blocking_items: [],
      },
    },
  }),
  stderr: '',
};
const missingRecommendedSkillsInitializeResult: OplCommandResult = {
  exitCode: 0,
  stdout: JSON.stringify({
    system_initialize: {
      setup_flow: {
        ready_to_launch: true,
        blocking_items: [],
      },
      recommended_skills: {
        summary: {
          missing: 2,
        },
      },
    },
  }),
  stderr: '',
};
const setupNeededInitializeResult: OplCommandResult = {
  exitCode: 0,
  stdout: JSON.stringify({
    system_initialize: {
      setup_flow: {
        ready_to_launch: false,
        blocking_items: ['domain_modules'],
      },
      recommended_next_action: {
        label: 'Install domain modules',
      },
    },
  }),
  stderr: '',
};
const codexConfigNeededInitializeResult: OplCommandResult = {
  exitCode: 0,
  stdout: JSON.stringify({
    system_initialize: {
      setup_flow: {
        ready_to_launch: false,
        blocking_items: ['codex_config', 'domain_modules'],
      },
      codex_default_profile: {
        model_provider: 'gflab',
        model: 'gpt-5.5',
        model_reasoning_effort: 'xhigh',
        base_url: 'https://gflabtoken.cn/v1',
      },
      recommended_next_action: {
        label: 'Configure Codex API key',
      },
    },
  }),
  stderr: '',
};

const createDeferredOplCommandResult = (): {
  promise: Promise<OplCommandResult>;
  resolve: (result: OplCommandResult) => void;
} => {
  let resolveResult: ((result: OplCommandResult) => void) | undefined;
  const promise = new Promise<OplCommandResult>((resolve) => {
    resolveResult = resolve;
  });
  return {
    promise,
    resolve: (result) => {
      if (!resolveResult) {
        throw new Error('Deferred OPL command promise was not initialized');
      }
      resolveResult(result);
    },
  };
};

const waitForOplCommandCalls = async (count: number) => {
  for (let attempt = 0; attempt < 20 && mockRunOplCommand.mock.calls.length < count; attempt += 1) {
    await Promise.resolve();
  }
  expect(mockRunOplCommand).toHaveBeenCalledTimes(count);
};

describe('oplFirstLaunchPreparation', () => {
  beforeEach(() => {
    resetOplFirstLaunchPreparationStateForTests();
    mockRunOplCommand.mockReset();
    mockConfigureOplCodex.mockReset();
    mockReadOplFirstRunLog.mockReset();
    mockAppendOplFirstRunLog.mockReset();
    mockConfigGet.mockReset();
    mockConfigSet.mockReset();
    mockReadOplFirstRunLog.mockResolvedValue({
      path: '/Users/test/Library/Logs/One Person Lab/first-run.jsonl',
      entries: [],
      latest: null,
    });
    mockAppendOplFirstRunLog.mockResolvedValue(undefined);
    mockConfigureOplCodex.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ codex_config: { status: 'completed' } }),
      stderr: '',
    });
  });

  it('does not run blocking initialize or install when the environment was already prepared', async () => {
    mockConfigGet.mockResolvedValue(123);
    mockRunOplCommand.mockResolvedValue(readyInitializeResult);

    await expect(startOplFirstLaunchEnvironmentPreparation()).resolves.toMatchObject({
      status: 'already-prepared',
      readyToLaunch: true,
      firstRunLog: { path: '/Users/test/Library/Logs/One Person Lab/first-run.jsonl' },
    });

    expect(mockRunOplCommand).not.toHaveBeenCalled();
    expect(mockConfigSet).not.toHaveBeenCalled();
    expect(mockReadOplFirstRunLog).toHaveBeenCalledOnce();
  });

  it('skips OPL install when command-line setup already made the environment launchable', async () => {
    mockConfigGet.mockResolvedValue(undefined);
    mockRunOplCommand.mockResolvedValue(readyInitializeResult);

    await expect(startOplFirstLaunchEnvironmentPreparation()).resolves.toMatchObject({
      status: 'already-prepared',
      readyToLaunch: true,
    });

    expect(mockRunOplCommand).toHaveBeenCalledOnce();
    expect(mockRunOplCommand).toHaveBeenCalledWith({ args: ['system', 'initialize', '--json'] });
    expect(mockConfigSet).toHaveBeenCalledWith('opl.firstLaunchInstallPreparedAt', expect.any(Number));
  });

  it('starts module reconcile in the background when the App version changes after first launch preparation', async () => {
    const deferredReconcile = createDeferredOplCommandResult();
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'opl.firstLaunchInstallPreparedAt') return 123;
      if (key === 'opl.lastModuleReconcileAppVersion') return '26.4.29';
      return undefined;
    });
    mockRunOplCommand.mockReturnValueOnce(deferredReconcile.promise);

    await expect(startOplFirstLaunchEnvironmentPreparation({ appVersion: '26.4.30' })).resolves.toMatchObject({
      status: 'already-prepared',
      readyToLaunch: true,
    });

    await waitForOplCommandCalls(1);
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(1, { args: ['system', 'reconcile-modules'] });

    deferredReconcile.resolve({ exitCode: 0, stdout: '', stderr: '' });
    await deferredReconcile.promise;
    await Promise.resolve();
    expect(mockConfigSet).toHaveBeenCalledWith('opl.lastModuleReconcileAppVersion', '26.4.30');
  });

  it('does not rerun module reconcile for the same App version', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'opl.firstLaunchInstallPreparedAt') return 123;
      if (key === 'opl.lastModuleReconcileAppVersion') return '26.4.30';
      return undefined;
    });
    mockRunOplCommand.mockResolvedValue(readyInitializeResult);

    await expect(startOplFirstLaunchEnvironmentPreparation({ appVersion: '26.4.30' })).resolves.toMatchObject({
      status: 'already-prepared',
      readyToLaunch: true,
    });

    expect(mockRunOplCommand).not.toHaveBeenCalled();
    expect(mockConfigSet).not.toHaveBeenCalled();
  });

  it('runs OPL install to sync missing recommended skills without blocking launch', async () => {
    mockRunOplCommand
      .mockResolvedValueOnce(missingRecommendedSkillsInitializeResult)
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce(readyInitializeResult);

    await expect(startOplFirstLaunchEnvironmentPreparation()).resolves.toMatchObject({
      status: 'prepared',
      readyToLaunch: true,
      blockers: [],
    });

    expect(mockRunOplCommand).toHaveBeenCalledTimes(3);
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(1, { args: ['system', 'initialize', '--json'] });
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(2, { args: ['install', '--skip-gui-open'] });
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(3, { args: ['system', 'initialize', '--json'] });
    expect(mockConfigSet).toHaveBeenCalledWith('opl.firstLaunchInstallPreparedAt', expect.any(Number));
    expect(mockAppendOplFirstRunLog).toHaveBeenCalledWith({
      eventType: 'gui_preparation_completed',
      payload: expect.objectContaining({ status: 'prepared' }),
    });
  });

  it('returns Codex configuration state without running install when API key is missing', async () => {
    mockConfigGet.mockResolvedValue(undefined);
    mockRunOplCommand.mockResolvedValue(codexConfigNeededInitializeResult);

    await expect(startOplFirstLaunchEnvironmentPreparation()).resolves.toMatchObject({
      status: 'codex-config-needed',
      readyToLaunch: false,
      blockers: ['codex_config', 'domain_modules'],
      codexDefaultProfile: {
        model_provider: 'gflab',
        model: 'gpt-5.5',
        model_reasoning_effort: 'xhigh',
        base_url: 'https://gflabtoken.cn/v1',
      },
    });

    expect(mockRunOplCommand).toHaveBeenCalledOnce();
    expect(mockRunOplCommand).toHaveBeenCalledWith({ args: ['system', 'initialize', '--json'] });
    expect(mockConfigureOplCodex).not.toHaveBeenCalled();
    expect(mockConfigSet).not.toHaveBeenCalled();
  });

  it('configures Codex through the secure IPC path before continuing first-run install', async () => {
    mockConfigGet.mockResolvedValue(undefined);
    mockRunOplCommand
      .mockResolvedValueOnce(setupNeededInitializeResult)
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce(readyInitializeResult);

    await expect(configureOplCodexForFirstLaunch('secret-api-key')).resolves.toMatchObject({
      status: 'prepared',
      readyToLaunch: true,
    });

    expect(mockConfigureOplCodex).toHaveBeenCalledWith({ apiKey: 'secret-api-key' });
    expect(JSON.stringify(mockRunOplCommand.mock.calls)).not.toContain('secret-api-key');
    expect(JSON.stringify(mockAppendOplFirstRunLog.mock.calls)).not.toContain('secret-api-key');
  });

  it('keeps Codex configuration blocking after install even when reconciling for an App version', async () => {
    mockConfigGet.mockResolvedValue(undefined);
    mockRunOplCommand
      .mockResolvedValueOnce(setupNeededInitializeResult)
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce(codexConfigNeededInitializeResult);

    await expect(startOplFirstLaunchEnvironmentPreparation({ appVersion: '26.5.1' })).resolves.toMatchObject({
      status: 'codex-config-needed',
      readyToLaunch: false,
      blockers: ['codex_config', 'domain_modules'],
    });

    expect(mockConfigSet).not.toHaveBeenCalledWith('opl.firstLaunchInstallPreparedAt', expect.any(Number));
    expect(mockAppendOplFirstRunLog).not.toHaveBeenCalledWith({
      eventType: 'gui_preparation_completed',
      payload: expect.anything(),
    });
  });

  it('reuses one in-flight OPL install across concurrent callers', async () => {
    const deferredRun = createDeferredOplCommandResult();
    mockConfigGet.mockResolvedValue(undefined);
    mockRunOplCommand
      .mockResolvedValueOnce(setupNeededInitializeResult)
      .mockReturnValueOnce(deferredRun.promise)
      .mockResolvedValueOnce(readyInitializeResult);

    const firstPreparation = startOplFirstLaunchEnvironmentPreparation();
    const secondPreparation = startOplFirstLaunchEnvironmentPreparation();

    expect(firstPreparation).toBe(secondPreparation);
    await waitForOplCommandCalls(2);
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(1, { args: ['system', 'initialize', '--json'] });
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(2, { args: ['install', '--skip-gui-open'] });

    deferredRun.resolve({ exitCode: 0, stdout: '', stderr: '' });

    await expect(firstPreparation).resolves.toMatchObject({ status: 'prepared' });
    await expect(secondPreparation).resolves.toMatchObject({ status: 'prepared' });
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(3, { args: ['system', 'initialize', '--json'] });
    expect(mockConfigSet).toHaveBeenCalledTimes(1);
    expect(mockConfigSet).toHaveBeenCalledWith('opl.firstLaunchInstallPreparedAt', expect.any(Number));
  });

  it('allows only one loading message owner while preparation is in flight', async () => {
    const deferredRun = createDeferredOplCommandResult();
    mockConfigGet.mockResolvedValue(undefined);
    mockRunOplCommand
      .mockResolvedValueOnce(setupNeededInitializeResult)
      .mockReturnValueOnce(deferredRun.promise)
      .mockResolvedValueOnce(readyInitializeResult);

    const preparation = startOplFirstLaunchEnvironmentPreparation();
    const firstOwner = Symbol('first');
    const secondOwner = Symbol('second');

    expect(claimOplFirstLaunchPreparationMessage(firstOwner)).toBe(true);
    expect(claimOplFirstLaunchPreparationMessage(secondOwner)).toBe(false);

    releaseOplFirstLaunchPreparationMessage(firstOwner);
    expect(claimOplFirstLaunchPreparationMessage(secondOwner)).toBe(true);

    deferredRun.resolve({ exitCode: 0, stdout: '', stderr: '' });
    await expect(preparation).resolves.toMatchObject({ status: 'prepared' });
  });

  it('returns command failure details without marking the environment prepared', async () => {
    mockConfigGet.mockResolvedValue(undefined);
    mockRunOplCommand.mockResolvedValue({ exitCode: 1, stdout: 'stdout details', stderr: 'stderr details' });

    await expect(startOplFirstLaunchEnvironmentPreparation()).resolves.toMatchObject({
      status: 'failed',
      message: 'stderr details',
    });

    expect(mockConfigSet).not.toHaveBeenCalled();
  });

  it('keeps structured first-run log failures from blocking preparation', async () => {
    mockReadOplFirstRunLog.mockRejectedValue(new Error('log unavailable'));
    mockAppendOplFirstRunLog.mockRejectedValue(new Error('log unavailable'));
    mockConfigGet.mockResolvedValue(undefined);
    mockRunOplCommand.mockResolvedValue(readyInitializeResult);

    await expect(startOplFirstLaunchEnvironmentPreparation()).resolves.toMatchObject({
      status: 'already-prepared',
      readyToLaunch: true,
    });

    expect(mockRunOplCommand).toHaveBeenCalledWith({ args: ['system', 'initialize', '--json'] });
  });
});
