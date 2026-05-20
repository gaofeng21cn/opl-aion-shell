import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunOplCommand = vi.hoisted(() => vi.fn());
const mockConfigureOplCodex = vi.hoisted(() => vi.fn());
const mockReadOplFirstRunLog = vi.hoisted(() => vi.fn());
const mockAppendOplFirstRunLog = vi.hoisted(() => vi.fn());
const mockGetOplFullRuntimeStatus = vi.hoisted(() => vi.fn());
const mockPrepareCommandLineTools = vi.hoisted(() => vi.fn());
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
      getOplFullRuntimeStatus: {
        invoke: mockGetOplFullRuntimeStatus,
      },
      prepareCommandLineTools: {
        invoke: mockPrepareCommandLineTools,
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
        progress: {
          ready_required_count: 4,
          total_required_count: 4,
        },
      },
      recommended_skills: {
        summary: {
          total: 7,
          ready: 7,
          missing: 0,
        },
      },
    },
  }),
  stderr: '',
};
const legacyReadyInitializeResult: OplCommandResult = {
  exitCode: 0,
  stdout: JSON.stringify({
    system_initialize: {
      setup_flow: {
        ready_to_launch: true,
        blocking_items: [],
        progress: {
          ready_required_count: 4,
          total_required_count: 4,
        },
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
        progress: {
          ready_required_count: 3,
          total_required_count: 4,
        },
      },
      recommended_skills: {
        summary: {
          total: 7,
          ready: 5,
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
        progress: {
          ready_required_count: 2,
          total_required_count: 4,
        },
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
        progress: {
          ready_required_count: 1,
          total_required_count: 4,
        },
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
const codexCliMissingAfterConfigInitializeResult: OplCommandResult = {
  exitCode: 0,
  stdout: JSON.stringify({
    system_initialize: {
      setup_flow: {
        ready_to_launch: false,
        blocking_items: ['codex', 'domain_modules', 'family_runtime_provider'],
        progress: {
          ready_required_count: 1,
          total_required_count: 4,
        },
      },
      recommended_next_action: {
        label: 'Install Codex',
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

const waitForOplCommandCalls = async (count: number, attempt = 0): Promise<void> => {
  if (attempt >= 20 || mockRunOplCommand.mock.calls.length >= count) {
    expect(mockRunOplCommand).toHaveBeenCalledTimes(count);
    return;
  }
  await Promise.resolve();
  await waitForOplCommandCalls(count, attempt + 1);
};

const waitForMockCall = async (
  calls: unknown[][],
  predicate: (call: unknown[]) => boolean,
  failureMessage: string,
  attempt = 0
): Promise<void> => {
  if (calls.some(predicate)) return;
  if (attempt >= 20) {
    throw new Error(failureMessage);
  }
  await Promise.resolve();
  await waitForMockCall(calls, predicate, failureMessage, attempt + 1);
};

const waitForConfigSetCall = async (key: string, value: unknown): Promise<void> =>
  waitForMockCall(
    mockConfigSet.mock.calls,
    (call) => call[0] === key && call[1] === value,
    `Timed out waiting for ConfigStorage.set(${key})`
  );

const waitForFirstRunLogEvent = async (eventType: string): Promise<void> =>
  waitForMockCall(
    mockAppendOplFirstRunLog.mock.calls,
    (call) => {
      const event = call[0] as { eventType?: unknown } | undefined;
      return event?.eventType === eventType;
    },
    `Timed out waiting for first-run event ${eventType}`
  );

describe('oplFirstLaunchPreparation', () => {
  beforeEach(() => {
    resetOplFirstLaunchPreparationStateForTests();
    delete process.env.OPL_FULL_RUNTIME_HOME;
    mockRunOplCommand.mockReset();
    mockConfigureOplCodex.mockReset();
    mockReadOplFirstRunLog.mockReset();
    mockAppendOplFirstRunLog.mockReset();
    mockGetOplFullRuntimeStatus.mockReset();
    mockPrepareCommandLineTools.mockReset();
    mockConfigGet.mockReset();
    mockConfigSet.mockReset();
    mockReadOplFirstRunLog.mockResolvedValue({
      path: '/Users/test/Library/Logs/One Person Lab/first-run.jsonl',
      entries: [],
      latest: null,
    });
    mockAppendOplFirstRunLog.mockResolvedValue(undefined);
    mockGetOplFullRuntimeStatus.mockResolvedValue({ active: false, runtimeHome: null });
    mockPrepareCommandLineTools.mockResolvedValue({ status: 'unsupported' });
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
      progress: {
        currentStep: 4,
        totalSteps: 4,
        step: 'complete',
      },
    });

    expect(mockRunOplCommand).not.toHaveBeenCalled();
    expect(mockConfigSet).not.toHaveBeenCalled();
    expect(mockReadOplFirstRunLog).toHaveBeenCalledOnce();
  });

  it('starts managed install in the background when initialize is already launchable', async () => {
    mockConfigGet.mockResolvedValue(undefined);
    mockRunOplCommand
      .mockResolvedValueOnce(readyInitializeResult)
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce(readyInitializeResult)
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });

    await expect(startOplFirstLaunchEnvironmentPreparation()).resolves.toMatchObject({
      status: 'prepared',
      readyToLaunch: true,
      blockers: ['recommended_skills'],
      progress: {
        currentStep: 4,
        totalSteps: 4,
        step: 'complete',
      },
    });

    await waitForOplCommandCalls(2);
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(1, { args: ['system', 'initialize', '--json'] });
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(2, { args: ['install', '--skip-gui-open'] });
    expect(mockConfigSet).toHaveBeenCalledWith('opl.firstLaunchInstallPreparedAt', expect.any(Number));
  });

  it('does not wait for startup maintenance before completing first launch for a new App version', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'opl.lastModuleReconcileAppVersion') return undefined;
      return undefined;
    });
    mockRunOplCommand
      .mockResolvedValueOnce(readyInitializeResult)
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce(readyInitializeResult)
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });

    await expect(startOplFirstLaunchEnvironmentPreparation({ appVersion: '26.5.4' })).resolves.toMatchObject({
      status: 'prepared',
      readyToLaunch: true,
      blockers: ['recommended_skills'],
    });

    await waitForOplCommandCalls(3);
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(1, { args: ['system', 'initialize', '--json'] });
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(2, { args: ['install', '--skip-gui-open'] });
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(3, { args: ['system', 'startup-maintenance'] });
    expect(mockConfigSet).toHaveBeenCalledWith('opl.lastModuleReconcileAppVersion', '26.5.4');
    expect(mockConfigSet).toHaveBeenCalledWith('opl.firstLaunchInstallPreparedAt', expect.any(Number));
  });

  it('does not run git-backed startup maintenance on a Full runtime first launch', async () => {
    process.env.OPL_FULL_RUNTIME_HOME = '/tmp/opl-full-runtime/current';
    mockConfigGet.mockResolvedValue(undefined);
    mockRunOplCommand
      .mockResolvedValueOnce(readyInitializeResult)
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });

    await expect(startOplFirstLaunchEnvironmentPreparation({ appVersion: '26.5.18' })).resolves.toMatchObject({
      status: 'prepared',
      readyToLaunch: true,
      blockers: ['recommended_skills'],
    });

    await waitForOplCommandCalls(2);
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(1, { args: ['system', 'initialize', '--json'] });
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(2, {
      args: ['skill', 'companion', 'apply', '--mode', 'managed', '--superpowers', 'keep'],
    });
    expect(mockRunOplCommand).not.toHaveBeenCalledWith({ args: ['install', '--skip-gui-open'] });
    expect(mockRunOplCommand).not.toHaveBeenCalledWith({ args: ['system', 'startup-maintenance'] });
    await waitForConfigSetCall('opl.lastModuleReconcileAppVersion', '26.5.18');
    await waitForFirstRunLogEvent('gui_deferred_maintenance_completed');
    expect(mockConfigSet).toHaveBeenCalledWith('opl.lastModuleReconcileAppVersion', '26.5.18');
    expect(mockConfigSet).toHaveBeenCalledWith('opl.firstLaunchInstallPreparedAt', expect.any(Number));
    expect(mockAppendOplFirstRunLog).toHaveBeenCalledWith({
      eventType: 'gui_deferred_maintenance_completed',
      payload: expect.objectContaining({
        reason: 'full_runtime_bundled_modules',
        packaged_skill_sync_status: 'synced',
      }),
    });
  });

  it('uses the main-process Full runtime status when renderer env is empty', async () => {
    mockGetOplFullRuntimeStatus.mockResolvedValue({
      active: true,
      runtimeHome: '/Users/test/Library/Application Support/OPL/runtime/current',
    });
    mockConfigGet.mockResolvedValue(undefined);
    mockRunOplCommand
      .mockResolvedValueOnce(readyInitializeResult)
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });

    await expect(startOplFirstLaunchEnvironmentPreparation({ appVersion: '26.5.18' })).resolves.toMatchObject({
      status: 'prepared',
      readyToLaunch: true,
      blockers: ['recommended_skills'],
    });

    await waitForOplCommandCalls(2);
    expect(process.env.OPL_FULL_RUNTIME_HOME).toBeUndefined();
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(1, { args: ['system', 'initialize', '--json'] });
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(2, {
      args: ['skill', 'companion', 'apply', '--mode', 'managed', '--superpowers', 'keep'],
    });
    expect(mockRunOplCommand).not.toHaveBeenCalledWith({ args: ['install', '--skip-gui-open'] });
    expect(mockRunOplCommand).not.toHaveBeenCalledWith({ args: ['system', 'startup-maintenance'] });
    await waitForConfigSetCall('opl.lastModuleReconcileAppVersion', '26.5.18');
    await waitForFirstRunLogEvent('gui_deferred_maintenance_completed');
    expect(mockConfigSet).toHaveBeenCalledWith('opl.lastModuleReconcileAppVersion', '26.5.18');
    expect(mockAppendOplFirstRunLog).toHaveBeenCalledWith({
      eventType: 'gui_deferred_maintenance_started',
      payload: expect.objectContaining({ full_runtime: true }),
    });
    expect(mockAppendOplFirstRunLog).toHaveBeenCalledWith({
      eventType: 'gui_deferred_maintenance_completed',
      payload: expect.objectContaining({
        reason: 'full_runtime_bundled_modules',
        packaged_skill_sync_status: 'synced',
      }),
    });
  });

  it('requests Command Line Tools in the background without blocking a Full runtime first launch', async () => {
    process.env.OPL_FULL_RUNTIME_HOME = '/tmp/opl-full-runtime/current';
    mockConfigGet.mockResolvedValue(undefined);
    mockPrepareCommandLineTools.mockResolvedValue({
      status: 'installer_requested',
      message: 'The macOS Command Line Tools installer has been opened.',
    });
    mockRunOplCommand
      .mockResolvedValueOnce(readyInitializeResult)
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });

    await expect(startOplFirstLaunchEnvironmentPreparation({ appVersion: '26.5.18' })).resolves.toMatchObject({
      status: 'prepared',
      readyToLaunch: true,
      blockers: ['recommended_skills'],
    });

    await waitForOplCommandCalls(2);
    expect(mockPrepareCommandLineTools).toHaveBeenCalledOnce();
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(2, {
      args: ['skill', 'companion', 'apply', '--mode', 'managed', '--superpowers', 'keep'],
    });
    expect(mockRunOplCommand).not.toHaveBeenCalledWith({ args: ['install', '--skip-gui-open'] });
    expect(mockRunOplCommand).not.toHaveBeenCalledWith({ args: ['system', 'startup-maintenance'] });
    expect(mockConfigSet).toHaveBeenCalledWith('opl.commandLineToolsPreparationPromptedAt', expect.any(Number));
    expect(mockAppendOplFirstRunLog).toHaveBeenCalledWith({
      eventType: 'gui_deferred_command_line_tools_completed',
      payload: expect.objectContaining({ status: 'installer_requested' }),
    });
    await waitForFirstRunLogEvent('gui_deferred_maintenance_completed');
    expect(mockAppendOplFirstRunLog).toHaveBeenCalledWith({
      eventType: 'gui_deferred_maintenance_completed',
      payload: expect.objectContaining({
        reason: 'full_runtime_bundled_modules',
        command_line_tools_status: 'installer_requested',
        packaged_skill_sync_status: 'synced',
      }),
    });
    expect(mockConfigSet).toHaveBeenCalledWith('opl.firstLaunchInstallPreparedAt', expect.any(Number));
  });

  it('does not mark deferred standard setup as failed when it is waiting for Command Line Tools', async () => {
    mockConfigGet.mockResolvedValue(undefined);
    mockPrepareCommandLineTools.mockResolvedValue({
      status: 'installer_requested',
      message: 'The macOS Command Line Tools installer has been opened.',
    });
    mockRunOplCommand.mockResolvedValueOnce(readyInitializeResult).mockResolvedValueOnce({
      exitCode: 69,
      stdout: '',
      stderr: 'The macOS Command Line Tools installer has been opened.',
    });

    await expect(startOplFirstLaunchEnvironmentPreparation({ appVersion: '26.5.18' })).resolves.toMatchObject({
      status: 'prepared',
      readyToLaunch: true,
      blockers: ['recommended_skills'],
    });

    await waitForOplCommandCalls(2);
    expect(mockAppendOplFirstRunLog).toHaveBeenCalledWith({
      eventType: 'gui_deferred_install_waiting_for_command_line_tools',
      payload: expect.objectContaining({
        status: 'waiting_for_user',
        command_line_tools_status: 'installer_requested',
      }),
    });
    expect(mockAppendOplFirstRunLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'gui_deferred_install_failed' })
    );
    expect(mockConfigSet).toHaveBeenCalledWith('opl.firstLaunchInstallPreparedAt', expect.any(Number));
  });

  it('lets a standard first launch continue when module setup has opened the Command Line Tools installer', async () => {
    mockConfigGet.mockResolvedValue(undefined);
    mockPrepareCommandLineTools.mockResolvedValue({
      status: 'installer_requested',
      message: 'The macOS Command Line Tools installer has been opened.',
    });
    mockRunOplCommand.mockResolvedValueOnce(setupNeededInitializeResult).mockResolvedValueOnce({
      exitCode: 69,
      stdout: '',
      stderr: 'The macOS Command Line Tools installer has been opened.',
    });

    await expect(startOplFirstLaunchEnvironmentPreparation({ appVersion: '26.5.19' })).resolves.toMatchObject({
      status: 'prepared',
      readyToLaunch: true,
      blockers: ['domain_modules'],
    });

    await waitForOplCommandCalls(2);
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(2, { args: ['install', '--skip-gui-open'] });
    expect(mockPrepareCommandLineTools).toHaveBeenCalledOnce();
    expect(mockAppendOplFirstRunLog).toHaveBeenCalledWith({
      eventType: 'gui_deferred_install_waiting_for_command_line_tools',
      payload: expect.objectContaining({
        status: 'waiting_for_user',
        command_line_tools_status: 'installer_requested',
      }),
    });
    expect(mockAppendOplFirstRunLog).toHaveBeenCalledWith({
      eventType: 'gui_preparation_completed_with_deferred_attention',
      payload: expect.objectContaining({
        status: 'prepared',
        blockers: ['domain_modules'],
      }),
    });
    expect(mockConfigSet).toHaveBeenCalledWith('opl.firstLaunchInstallPreparedAt', expect.any(Number));
  });

  it('keeps standard first launch usable when core install fails after Codex is configured', async () => {
    mockConfigGet.mockResolvedValue(undefined);
    mockPrepareCommandLineTools.mockResolvedValue({
      status: 'installer_requested',
      message: 'The macOS Command Line Tools installer has been opened.',
    });
    mockRunOplCommand.mockResolvedValueOnce(codexCliMissingAfterConfigInitializeResult).mockResolvedValueOnce({
      exitCode: 2,
      stdout: '',
      stderr: 'npm error command sh -c npm run build',
    });

    await expect(configureOplCodexForFirstLaunch('secret-api-key', { appVersion: '26.5.19' })).resolves.toMatchObject({
      status: 'prepared',
      readyToLaunch: true,
      blockers: ['codex', 'domain_modules', 'family_runtime_provider'],
      progress: {
        currentStep: 4,
        totalSteps: 4,
        step: 'complete',
      },
    });

    expect(mockConfigureOplCodex).toHaveBeenCalledWith({ apiKey: 'secret-api-key' });
    await waitForOplCommandCalls(2);
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(2, { args: ['install', '--skip-modules', '--skip-gui-open'] });
    expect(mockAppendOplFirstRunLog).toHaveBeenCalledWith({
      eventType: 'gui_core_install_deferred_after_failure',
      payload: expect.objectContaining({
        status: 'deferred',
        message: 'npm error command sh -c npm run build',
      }),
    });
    expect(mockAppendOplFirstRunLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'gui_install_failed' })
    );
    expect(mockConfigSet).toHaveBeenCalledWith('opl.firstLaunchInstallPreparedAt', expect.any(Number));
  });

  it('keeps Full runtime first launch prepared without running git-backed bundled materialization', async () => {
    process.env.OPL_FULL_RUNTIME_HOME = '/tmp/opl-full-runtime/current';
    mockConfigGet.mockResolvedValue(undefined);
    mockRunOplCommand
      .mockResolvedValueOnce(readyInitializeResult)
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });

    await expect(startOplFirstLaunchEnvironmentPreparation({ appVersion: '26.5.18' })).resolves.toMatchObject({
      status: 'prepared',
      readyToLaunch: true,
      blockers: ['recommended_skills'],
    });

    await waitForOplCommandCalls(2);
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(2, {
      args: ['skill', 'companion', 'apply', '--mode', 'managed', '--superpowers', 'keep'],
    });
    expect(mockRunOplCommand).not.toHaveBeenCalledWith({ args: ['install', '--skip-gui-open'] });
    expect(mockRunOplCommand).not.toHaveBeenCalledWith({ args: ['system', 'startup-maintenance'] });
    await waitForConfigSetCall('opl.lastModuleReconcileAppVersion', '26.5.18');
    await waitForFirstRunLogEvent('gui_deferred_maintenance_completed');
    expect(mockConfigSet).toHaveBeenCalledWith('opl.lastModuleReconcileAppVersion', '26.5.18');
    expect(mockConfigSet).toHaveBeenCalledWith('opl.firstLaunchInstallPreparedAt', expect.any(Number));
    expect(mockAppendOplFirstRunLog).toHaveBeenCalledWith({
      eventType: 'gui_deferred_maintenance_completed',
      payload: expect.objectContaining({
        reason: 'full_runtime_bundled_modules',
        packaged_skill_sync_status: 'synced',
      }),
    });
    expect(mockAppendOplFirstRunLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'gui_deferred_install_failed' })
    );
  });

  it('keeps App launch prepared when background startup maintenance fails', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'opl.lastModuleReconcileAppVersion') return undefined;
      return undefined;
    });
    mockRunOplCommand
      .mockResolvedValueOnce(readyInitializeResult)
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 1, stdout: 'reconcile stdout', stderr: 'reconcile failed' });

    await expect(startOplFirstLaunchEnvironmentPreparation({ appVersion: '26.5.4' })).resolves.toMatchObject({
      status: 'prepared',
      readyToLaunch: true,
      blockers: ['recommended_skills'],
    });

    await waitForOplCommandCalls(3);
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(3, { args: ['system', 'startup-maintenance'] });
    expect(mockConfigSet).not.toHaveBeenCalledWith('opl.lastModuleReconcileAppVersion', '26.5.4');
    expect(mockConfigSet).toHaveBeenCalledWith('opl.firstLaunchInstallPreparedAt', expect.any(Number));
  });

  it('starts managed install when initialize is launchable but lacks the recommended skill report', async () => {
    mockConfigGet.mockResolvedValue(undefined);
    mockRunOplCommand
      .mockResolvedValueOnce(legacyReadyInitializeResult)
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce(readyInitializeResult)
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });

    await expect(startOplFirstLaunchEnvironmentPreparation()).resolves.toMatchObject({
      status: 'prepared',
      readyToLaunch: true,
      blockers: ['recommended_skills'],
    });

    await waitForOplCommandCalls(2);
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(1, { args: ['system', 'initialize', '--json'] });
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(2, { args: ['install', '--skip-gui-open'] });
    expect(mockConfigSet).toHaveBeenCalledWith('opl.firstLaunchInstallPreparedAt', expect.any(Number));
  });

  it('starts startup maintenance in the background when the App version changes after first launch preparation', async () => {
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
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(1, { args: ['system', 'startup-maintenance'] });

    deferredReconcile.resolve({ exitCode: 0, stdout: '', stderr: '' });
    await deferredReconcile.promise;
    await Promise.resolve();
    expect(mockConfigSet).toHaveBeenCalledWith('opl.lastModuleReconcileAppVersion', '26.4.30');
  });

  it('does not rerun startup maintenance for the same App version', async () => {
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
      .mockResolvedValueOnce(readyInitializeResult)
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });

    await expect(startOplFirstLaunchEnvironmentPreparation()).resolves.toMatchObject({
      status: 'prepared',
      readyToLaunch: true,
      blockers: ['recommended_skills'],
      progress: {
        currentStep: 4,
        totalSteps: 4,
        step: 'complete',
      },
    });

    await waitForOplCommandCalls(2);
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(1, { args: ['system', 'initialize', '--json'] });
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(2, { args: ['install', '--skip-gui-open'] });
    expect(mockConfigSet).toHaveBeenCalledWith('opl.firstLaunchInstallPreparedAt', expect.any(Number));
    expect(mockAppendOplFirstRunLog).toHaveBeenCalledWith({
      eventType: 'gui_preparation_completed_with_deferred_attention',
      payload: expect.objectContaining({ status: 'prepared' }),
    });
  });

  it('keeps optional recommended skills as attention after required first-run checks pass', async () => {
    mockRunOplCommand
      .mockResolvedValueOnce(missingRecommendedSkillsInitializeResult)
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce(missingRecommendedSkillsInitializeResult)
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });

    await expect(startOplFirstLaunchEnvironmentPreparation()).resolves.toMatchObject({
      status: 'prepared',
      readyToLaunch: true,
      blockers: ['recommended_skills'],
      progress: {
        currentStep: 4,
        totalSteps: 4,
        step: 'complete',
      },
    });

    await waitForOplCommandCalls(2);
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(2, { args: ['install', '--skip-gui-open'] });
    expect(mockConfigSet).toHaveBeenCalledWith('opl.firstLaunchInstallPreparedAt', expect.any(Number));
    expect(mockAppendOplFirstRunLog).toHaveBeenCalledWith({
      eventType: 'gui_preparation_completed_with_deferred_attention',
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
      progress: {
        currentStep: 2,
        totalSteps: 4,
        step: 'configureCodex',
      },
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
      .mockResolvedValueOnce(readyInitializeResult)
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });

    await expect(configureOplCodexForFirstLaunch('secret-api-key')).resolves.toMatchObject({
      status: 'prepared',
      readyToLaunch: true,
      progress: {
        currentStep: 4,
        totalSteps: 4,
        step: 'complete',
      },
    });

    expect(mockConfigureOplCodex).toHaveBeenCalledWith({ apiKey: 'secret-api-key' });
    await waitForOplCommandCalls(2);
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(2, { args: ['install', '--skip-gui-open'] });
    expect(JSON.stringify(mockRunOplCommand.mock.calls)).not.toContain('secret-api-key');
    expect(JSON.stringify(mockAppendOplFirstRunLog.mock.calls)).not.toContain('secret-api-key');
  });

  it('uses core install and defers git-backed setup when standard first launch is waiting for Command Line Tools', async () => {
    mockConfigGet.mockResolvedValue(undefined);
    mockPrepareCommandLineTools.mockResolvedValue({
      status: 'installer_requested',
      message: 'The macOS Command Line Tools installer has been opened.',
    });
    mockRunOplCommand
      .mockResolvedValueOnce(codexCliMissingAfterConfigInitializeResult)
      .mockResolvedValueOnce({ exitCode: 0, stdout: '{"install":{"selected_modules":[]}}', stderr: '' })
      .mockResolvedValueOnce(setupNeededInitializeResult)
      .mockResolvedValueOnce({
        exitCode: 69,
        stdout: '',
        stderr: 'The macOS Command Line Tools installer has been opened.',
      });

    await expect(configureOplCodexForFirstLaunch('secret-api-key', { appVersion: '26.5.18' })).resolves.toMatchObject({
      status: 'prepared',
      readyToLaunch: true,
      blockers: ['domain_modules'],
    });

    expect(mockConfigureOplCodex).toHaveBeenCalledWith({ apiKey: 'secret-api-key' });
    await waitForOplCommandCalls(4);
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(1, { args: ['system', 'initialize', '--json'] });
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(2, { args: ['install', '--skip-modules', '--skip-gui-open'] });
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(3, { args: ['system', 'initialize', '--json'] });
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(4, { args: ['install', '--skip-gui-open'] });
    expect(mockAppendOplFirstRunLog).toHaveBeenCalledWith({
      eventType: 'gui_deferred_install_waiting_for_command_line_tools',
      payload: expect.objectContaining({ status: 'waiting_for_user' }),
    });
    expect(mockAppendOplFirstRunLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'gui_install_failed' })
    );
    expect(mockConfigSet).toHaveBeenCalledWith('opl.firstLaunchInstallPreparedAt', expect.any(Number));
  });

  it('keeps Codex configuration blocking when initialize still reports it before install', async () => {
    mockConfigGet.mockResolvedValue(undefined);
    mockRunOplCommand.mockResolvedValueOnce(codexConfigNeededInitializeResult);

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
    expect(mockRunOplCommand).toHaveBeenCalledOnce();
  });

  it('reuses one in-flight OPL install across concurrent callers', async () => {
    const deferredRun = createDeferredOplCommandResult();
    mockConfigGet.mockResolvedValue(undefined);
    mockRunOplCommand.mockResolvedValueOnce(setupNeededInitializeResult).mockReturnValueOnce(deferredRun.promise);

    const firstPreparation = startOplFirstLaunchEnvironmentPreparation();
    const secondPreparation = startOplFirstLaunchEnvironmentPreparation();

    expect(firstPreparation).toBe(secondPreparation);
    await waitForOplCommandCalls(2);
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(1, { args: ['system', 'initialize', '--json'] });
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(2, { args: ['install', '--skip-gui-open'] });

    deferredRun.resolve({ exitCode: 0, stdout: '', stderr: '' });

    await expect(firstPreparation).resolves.toMatchObject({ status: 'prepared' });
    await expect(secondPreparation).resolves.toMatchObject({ status: 'prepared' });
    expect(mockConfigSet).toHaveBeenCalledTimes(1);
    expect(mockConfigSet).toHaveBeenCalledWith('opl.firstLaunchInstallPreparedAt', expect.any(Number));
  });

  it('reports checking progress and does not wait for deferred install', async () => {
    const deferredRun = createDeferredOplCommandResult();
    const onProgress = vi.fn();
    mockConfigGet.mockResolvedValue(undefined);
    mockRunOplCommand.mockResolvedValueOnce(setupNeededInitializeResult).mockReturnValueOnce(deferredRun.promise);

    const preparation = startOplFirstLaunchEnvironmentPreparation({ onProgress });
    await waitForOplCommandCalls(2);

    deferredRun.resolve({ exitCode: 0, stdout: '', stderr: '' });
    await expect(preparation).resolves.toMatchObject({ status: 'prepared' });
    expect(onProgress).toHaveBeenNthCalledWith(1, {
      currentStep: 1,
      totalSteps: 4,
      step: 'checkingEnvironment',
    });
    expect(onProgress).toHaveBeenCalledTimes(1);
  });

  it('returns command failure details without marking the environment prepared', async () => {
    mockConfigGet.mockResolvedValue(undefined);
    mockRunOplCommand.mockResolvedValue({ exitCode: 1, stdout: 'stdout details', stderr: 'stderr details' });

    await expect(startOplFirstLaunchEnvironmentPreparation()).resolves.toMatchObject({
      status: 'failed',
      message: 'stderr details',
      progress: {
        currentStep: 1,
        totalSteps: 4,
        step: 'checkingEnvironment',
      },
    });

    expect(mockConfigSet).not.toHaveBeenCalled();
  });

  it('keeps structured first-run log failures from blocking preparation', async () => {
    mockReadOplFirstRunLog.mockRejectedValue(new Error('log unavailable'));
    mockAppendOplFirstRunLog.mockRejectedValue(new Error('log unavailable'));
    mockConfigGet.mockResolvedValue(undefined);
    mockRunOplCommand
      .mockResolvedValueOnce(readyInitializeResult)
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce(readyInitializeResult)
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });

    await expect(startOplFirstLaunchEnvironmentPreparation()).resolves.toMatchObject({
      status: 'prepared',
      readyToLaunch: true,
    });

    expect(mockRunOplCommand).toHaveBeenNthCalledWith(1, { args: ['system', 'initialize', '--json'] });
    expect(mockRunOplCommand).toHaveBeenNthCalledWith(2, { args: ['install', '--skip-gui-open'] });
    await waitForOplCommandCalls(2);
  });
});
