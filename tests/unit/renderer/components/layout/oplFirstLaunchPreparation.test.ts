import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunOplCommand = vi.hoisted(() => vi.fn());
const mockConfigGet = vi.hoisted(() => vi.fn());
const mockConfigSet = vi.hoisted(() => vi.fn());

vi.mock('@/common', () => ({
  ipcBridge: {
    shell: {
      runOplCommand: {
        invoke: mockRunOplCommand,
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
    mockConfigGet.mockReset();
    mockConfigSet.mockReset();
  });

  it('does not run OPL install when the environment was already prepared', async () => {
    mockConfigGet.mockResolvedValue(123);
    mockRunOplCommand.mockResolvedValue(readyInitializeResult);

    await expect(startOplFirstLaunchEnvironmentPreparation()).resolves.toEqual({ status: 'already-prepared' });

    expect(mockRunOplCommand).toHaveBeenCalledOnce();
    expect(mockRunOplCommand).toHaveBeenCalledWith({ args: ['system', 'initialize'] });
    expect(mockConfigSet).toHaveBeenCalledWith('opl.firstLaunchInstallPreparedAt', expect.any(Number));
  });

  it('skips OPL install when command-line setup already made the environment launchable', async () => {
    mockConfigGet.mockResolvedValue(undefined);
    mockRunOplCommand.mockResolvedValue(readyInitializeResult);

    await expect(startOplFirstLaunchEnvironmentPreparation()).resolves.toEqual({ status: 'already-prepared' });

    expect(mockRunOplCommand).toHaveBeenCalledOnce();
    expect(mockRunOplCommand).toHaveBeenCalledWith({ args: ['system', 'initialize'] });
    expect(mockConfigSet).toHaveBeenCalledWith('opl.firstLaunchInstallPreparedAt', expect.any(Number));
  });

  it('runs OPL install to sync missing recommended skills without blocking launch', async () => {
    mockRunOplCommand
      .mockResolvedValueOnce(missingRecommendedSkillsInitializeResult)
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce(readyInitializeResult);

    await expect(startOplFirstLaunchEnvironmentPreparation()).resolves.toEqual({ status: 'prepared' });

    expect(mockRunOplCommand).toHaveBeenCalledTimes(3);
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(1, { args: ['system', 'initialize'] });
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(2, { args: ['install', '--skip-gui-open'] });
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(3, { args: ['system', 'initialize'] });
    expect(mockConfigSet).toHaveBeenCalledWith('opl.firstLaunchInstallPreparedAt', expect.any(Number));
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
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(1, { args: ['system', 'initialize'] });
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(2, { args: ['install', '--skip-gui-open'] });

    deferredRun.resolve({ exitCode: 0, stdout: '', stderr: '' });

    await expect(firstPreparation).resolves.toEqual({ status: 'prepared' });
    await expect(secondPreparation).resolves.toEqual({ status: 'prepared' });
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(3, { args: ['system', 'initialize'] });
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
    await expect(preparation).resolves.toEqual({ status: 'prepared' });
  });

  it('returns command failure details without marking the environment prepared', async () => {
    mockConfigGet.mockResolvedValue(undefined);
    mockRunOplCommand.mockResolvedValue({ exitCode: 1, stdout: 'stdout details', stderr: 'stderr details' });

    await expect(startOplFirstLaunchEnvironmentPreparation()).resolves.toEqual({
      status: 'failed',
      message: 'stderr details',
    });

    expect(mockConfigSet).not.toHaveBeenCalled();
  });
});
