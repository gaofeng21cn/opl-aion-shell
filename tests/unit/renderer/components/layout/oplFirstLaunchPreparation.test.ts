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

describe('oplFirstLaunchPreparation', () => {
  beforeEach(() => {
    resetOplFirstLaunchPreparationStateForTests();
    mockRunOplCommand.mockReset();
    mockConfigGet.mockReset();
    mockConfigSet.mockReset();
  });

  it('does not run OPL install when the environment was already prepared', async () => {
    mockConfigGet.mockResolvedValue(123);

    await expect(startOplFirstLaunchEnvironmentPreparation()).resolves.toEqual({ status: 'already-prepared' });

    expect(mockRunOplCommand).not.toHaveBeenCalled();
    expect(mockConfigSet).not.toHaveBeenCalled();
  });

  it('reuses one in-flight OPL install across concurrent callers', async () => {
    const deferredRun = createDeferredOplCommandResult();
    mockConfigGet.mockResolvedValue(undefined);
    mockRunOplCommand.mockReturnValue(deferredRun.promise);

    const firstPreparation = startOplFirstLaunchEnvironmentPreparation();
    const secondPreparation = startOplFirstLaunchEnvironmentPreparation();

    expect(firstPreparation).toBe(secondPreparation);
    await Promise.resolve();
    expect(mockRunOplCommand).toHaveBeenCalledTimes(1);
    expect(mockRunOplCommand).toHaveBeenCalledWith({ args: ['install', '--skip-gui-open'] });

    deferredRun.resolve({ exitCode: 0, stdout: '', stderr: '' });

    await expect(firstPreparation).resolves.toEqual({ status: 'prepared' });
    await expect(secondPreparation).resolves.toEqual({ status: 'prepared' });
    expect(mockConfigSet).toHaveBeenCalledTimes(1);
    expect(mockConfigSet).toHaveBeenCalledWith('opl.firstLaunchInstallPreparedAt', expect.any(Number));
  });

  it('allows only one loading message owner while preparation is in flight', async () => {
    const deferredRun = createDeferredOplCommandResult();
    mockConfigGet.mockResolvedValue(undefined);
    mockRunOplCommand.mockReturnValue(deferredRun.promise);

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
