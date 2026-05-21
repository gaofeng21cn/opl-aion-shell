/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks (vi.hoisted so factories can reference them) ---

const {
  openFileProvider,
  showItemInFolderProvider,
  openExternalProvider,
  checkToolInstalledProvider,
  openFolderWithProvider,
  runOplCommandProvider,
  configureOplCodexProvider,
  readOplFirstRunLogProvider,
  appendOplFirstRunLogProvider,
  getOplFullRuntimeStatusProvider,
  prepareCommandLineToolsProvider,
  shellMock,
  execMock,
  execFileMock,
  spawnMock,
  fsMock,
} = vi.hoisted(() => ({
  openFileProvider: { fn: undefined as ((...args: any[]) => any) | undefined },
  showItemInFolderProvider: { fn: undefined as ((...args: any[]) => any) | undefined },
  openExternalProvider: { fn: undefined as ((...args: any[]) => any) | undefined },
  checkToolInstalledProvider: { fn: undefined as ((...args: any[]) => any) | undefined },
  openFolderWithProvider: { fn: undefined as ((...args: any[]) => any) | undefined },
  runOplCommandProvider: { fn: undefined as ((...args: any[]) => any) | undefined },
  configureOplCodexProvider: { fn: undefined as ((...args: any[]) => any) | undefined },
  readOplFirstRunLogProvider: { fn: undefined as ((...args: any[]) => any) | undefined },
  appendOplFirstRunLogProvider: { fn: undefined as ((...args: any[]) => any) | undefined },
  getOplFullRuntimeStatusProvider: { fn: undefined as ((...args: any[]) => any) | undefined },
  prepareCommandLineToolsProvider: { fn: undefined as ((...args: any[]) => any) | undefined },
  shellMock: {
    openPath: vi.fn().mockResolvedValue(''),
    showItemInFolder: vi.fn(),
    openExternal: vi.fn().mockResolvedValue(undefined),
  },
  execMock: vi.fn(),
  execFileMock: vi.fn(),
  spawnMock: vi.fn().mockReturnValue({
    on: vi.fn(),
    unref: vi.fn(),
  }),
  fsMock: {
    existsSync: vi.fn(),
    readFile: vi.fn(),
    mkdir: vi.fn(),
    appendFile: vi.fn(),
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    shell: {
      openFile: {
        provider: vi.fn((fn: (...args: any[]) => any) => {
          openFileProvider.fn = fn;
        }),
      },
      showItemInFolder: {
        provider: vi.fn((fn: (...args: any[]) => any) => {
          showItemInFolderProvider.fn = fn;
        }),
      },
      openExternal: {
        provider: vi.fn((fn: (...args: any[]) => any) => {
          openExternalProvider.fn = fn;
        }),
      },
      checkToolInstalled: {
        provider: vi.fn((fn: (...args: any[]) => any) => {
          checkToolInstalledProvider.fn = fn;
        }),
      },
      openFolderWith: {
        provider: vi.fn((fn: (...args: any[]) => any) => {
          openFolderWithProvider.fn = fn;
        }),
      },
      runOplCommand: {
        provider: vi.fn((fn: (...args: any[]) => any) => {
          runOplCommandProvider.fn = fn;
        }),
      },
      configureOplCodex: {
        provider: vi.fn((fn: (...args: any[]) => any) => {
          configureOplCodexProvider.fn = fn;
        }),
      },
      readOplFirstRunLog: {
        provider: vi.fn((fn: (...args: any[]) => any) => {
          readOplFirstRunLogProvider.fn = fn;
        }),
      },
      appendOplFirstRunLog: {
        provider: vi.fn((fn: (...args: any[]) => any) => {
          appendOplFirstRunLogProvider.fn = fn;
        }),
      },
      getOplFullRuntimeStatus: {
        provider: vi.fn((fn: (...args: any[]) => any) => {
          getOplFullRuntimeStatusProvider.fn = fn;
        }),
      },
      prepareCommandLineTools: {
        provider: vi.fn((fn: (...args: any[]) => any) => {
          prepareCommandLineToolsProvider.fn = fn;
        }),
      },
    },
  },
}));

vi.mock('electron', () => ({
  shell: shellMock,
}));

vi.mock('child_process', () => ({
  exec: execMock,
  execFile: execFileMock,
  spawn: spawnMock,
}));

vi.mock('fs', () => ({
  existsSync: fsMock.existsSync,
  promises: {
    readFile: fsMock.readFile,
    mkdir: fsMock.mkdir,
    appendFile: fsMock.appendFile,
  },
  default: {
    existsSync: fsMock.existsSync,
  },
}));

// --- Tests ---

let initShellBridge: typeof import('../../src/process/bridge/shellBridge').initShellBridge;

const flushPromises = async (rounds = 3): Promise<void> => {
  for (let index = 0; index < rounds; index += 1) {
    await Promise.resolve();
  }
};

const expectOplCliSelector = (command: string): void => {
  expect(command).toContain('OPL_APP_MANAGED_CLI=');
  expect(command).toContain('if command -v opl >/dev/null 2>&1; then OPL_APP_CLI=opl');
  expect(command).toContain('elif [ -x "$OPL_APP_MANAGED_CLI" ]; then OPL_APP_CLI="$OPL_APP_MANAGED_CLI"');
};

const expectOplCommandArgs = (command: string, args: string[]): void => {
  expectOplCliSelector(command);
  expect(command).toContain(`"$OPL_APP_CLI" ${args.join(' ')}`);
};

const expectOplJsonCommandArgs = (command: string, args: string[]): void => {
  expectOplCliSelector(command);
  expect(command).toContain(`OPL_OUTPUT=json "$OPL_APP_CLI" ${args.join(' ')}`);
};

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  openFileProvider.fn = undefined;
  showItemInFolderProvider.fn = undefined;
  openExternalProvider.fn = undefined;
  checkToolInstalledProvider.fn = undefined;
  openFolderWithProvider.fn = undefined;
  runOplCommandProvider.fn = undefined;
  configureOplCodexProvider.fn = undefined;
  readOplFirstRunLogProvider.fn = undefined;
  appendOplFirstRunLogProvider.fn = undefined;
  getOplFullRuntimeStatusProvider.fn = undefined;
  prepareCommandLineToolsProvider.fn = undefined;

  // Default mocks
  Object.defineProperty(process, 'platform', { value: 'win32' });
  delete process.env.OPL_FULL_RUNTIME_HOME;

  const mod = await import('../../src/process/bridge/shellBridge');
  initShellBridge = mod.initShellBridge;
});

describe('shellBridge', () => {
  describe('initShellBridge', () => {
    it('registers shell providers', () => {
      initShellBridge();
      expect(openFileProvider.fn).toBeDefined();
      expect(showItemInFolderProvider.fn).toBeDefined();
      expect(openExternalProvider.fn).toBeDefined();
      expect(checkToolInstalledProvider.fn).toBeDefined();
      expect(openFolderWithProvider.fn).toBeDefined();
      expect(runOplCommandProvider.fn).toBeDefined();
      expect(configureOplCodexProvider.fn).toBeDefined();
      expect(readOplFirstRunLogProvider.fn).toBeDefined();
      expect(appendOplFirstRunLogProvider.fn).toBeDefined();
      expect(getOplFullRuntimeStatusProvider.fn).toBeDefined();
      expect(prepareCommandLineToolsProvider.fn).toBeDefined();
    });
  });

  describe('openFile — error handling', () => {
    beforeEach(() => {
      initShellBridge();
    });

    it('calls shell.openPath with the given path', async () => {
      shellMock.openPath.mockResolvedValue('');
      await openFileProvider.fn!('/some/file.txt');
      expect(shellMock.openPath).toHaveBeenCalledWith('/some/file.txt');
    });

    it('logs warning when shell.openPath returns an error string', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      shellMock.openPath.mockResolvedValue('No application associated with this file type');
      await openFileProvider.fn!('/some/file.xyz');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to open path'));
      warnSpy.mockRestore();
    });

    it('does not throw when shell.openPath rejects', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      shellMock.openPath.mockRejectedValue(new Error('Failed to open: 没有应用程序与此操作的指定文件有关联。 (0x483)'));
      await expect(openFileProvider.fn!('/some/file.xyz')).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to open path'),
        expect.stringContaining('没有应用程序')
      );
      warnSpy.mockRestore();
    });
  });

  describe('openExternal — URL validation', () => {
    beforeEach(() => {
      initShellBridge();
    });

    it('calls shell.openExternal for valid URLs', async () => {
      await openExternalProvider.fn!('https://example.com');
      expect(shellMock.openExternal).toHaveBeenCalledWith('https://example.com');
    });

    it('rejects invalid URLs without calling shell.openExternal', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await openExternalProvider.fn!('not-a-valid-url');
      expect(shellMock.openExternal).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid URL'));
      warnSpy.mockRestore();
    });

    it('rejects empty string URLs without calling shell.openExternal', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await openExternalProvider.fn!('');
      expect(shellMock.openExternal).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('does not throw when shell.openExternal rejects (ELECTRON-HW)', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      shellMock.openExternal.mockRejectedValueOnce(new Error('Failed to open: 系统找不到指定的文件。 (0x2)'));
      await expect(openExternalProvider.fn!('https://example.com/missing')).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to open external URL'),
        expect.stringContaining('系统找不到指定的文件')
      );
      warnSpy.mockRestore();
    });
  });

  describe('checkToolInstalled', () => {
    beforeEach(() => {
      initShellBridge();
    });

    it('returns true for terminal on Windows', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      const result = await checkToolInstalledProvider.fn!({ tool: 'terminal' });
      expect(result).toBe(true);
    });

    it('returns true for terminal on macOS', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const result = await checkToolInstalledProvider.fn!({ tool: 'terminal' });
      expect(result).toBe(true);
    });

    it('returns true for terminal on Linux', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      const result = await checkToolInstalledProvider.fn!({ tool: 'terminal' });
      expect(result).toBe(true);
    });

    it('returns true for explorer', async () => {
      const result = await checkToolInstalledProvider.fn!({ tool: 'explorer' });
      expect(result).toBe(true);
    });

    it('returns false for unknown tool', async () => {
      const result = await checkToolInstalledProvider.fn!({ tool: 'unknown-tool' as any });
      expect(result).toBe(false);
    });
  });

  describe('runOplCommand', () => {
    beforeEach(() => {
      initShellBridge();
    });

    it('runs supported OPL commands through the CLI', async () => {
      execFileMock.mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
        callback(null, { stdout: '{"ok":true}', stderr: '' });
      });

      const result = await runOplCommandProvider.fn!({ args: ['system', 'initialize', '--json'] });

      expect(result).toEqual({ exitCode: 0, stdout: '{"ok":true}', stderr: '' });
      expect(execFileMock).toHaveBeenCalledWith(
        '/bin/zsh',
        ['-lc', expect.stringContaining('OPL_OUTPUT=json "$OPL_APP_CLI"')],
        expect.objectContaining({ timeout: 120_000, maxBuffer: 20 * 1024 * 1024 }),
        expect.any(Function)
      );
      expectOplJsonCommandArgs(execFileMock.mock.calls[0][1][1], ["'system'", "'initialize'", "'--json'"]);
    });

    it('allows the packages manifest command for environment management', async () => {
      execFileMock.mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
        callback(null, { stdout: '{"packages_manifest":{}}', stderr: '' });
      });

      const result = await runOplCommandProvider.fn!({ args: ['packages', 'manifest'] });

      expect(result.exitCode).toBe(0);
      expect(execFileMock).toHaveBeenCalledWith(
        '/bin/zsh',
        ['-lc', expect.stringContaining('"$OPL_APP_CLI"')],
        expect.objectContaining({ timeout: 120_000 }),
        expect.any(Function)
      );
      expectOplCommandArgs(execFileMock.mock.calls[0][1][1], ["'packages'", "'manifest'"]);
    });

    it('allows managed companion skill sync through the Full runtime without probing Command Line Tools', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      process.env.OPL_FULL_RUNTIME_HOME = '/tmp/OPL Full Runtime/current';
      execFileMock.mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
        callback(null, { stdout: '{"companion_skills":{"summary":{"synced":4}}}', stderr: '' });
      });

      const result = await runOplCommandProvider.fn!({
        args: ['skill', 'companion', 'apply', '--mode', 'managed', '--superpowers', 'keep'],
      });

      expect(result.exitCode).toBe(0);
      expect(execFileMock).toHaveBeenCalledOnce();
      const command = execFileMock.mock.calls[0][1][1];
      expectOplJsonCommandArgs(command, ["'skill'", "'companion'", "'apply'"]);
      expect(command).toContain('OPL_FULL_RUNTIME_HOME=');
      expect(command).toContain('OPL_PACKAGED_SKILLS_ROOT=');
      expect(JSON.stringify(execFileMock.mock.calls)).not.toContain('/usr/bin/xcode-select');
    });

    it('rejects unsupported skill commands', async () => {
      await expect(
        runOplCommandProvider.fn!({ args: ['skill', 'companion', 'apply', '--mode', 'managed'] })
      ).rejects.toThrow('Unsupported OPL skill action');
    });

    it('rejects the legacy runtime snapshot command from the App operator bridge', async () => {
      await expect(runOplCommandProvider.fn!({ args: ['runtime', 'snapshot', '--json'] })).rejects.toThrow(
        'Unsupported OPL runtime action'
      );
      expect(execFileMock).not.toHaveBeenCalled();
    });

    it('allows the App operator drilldown summary and full-detail read models only as JSON', async () => {
      execFileMock.mockImplementation((_file: string, _args: string[], _options: unknown, callback: Function) => {
        callback(null, { stdout: '{"app_operator_drilldown":{}}', stderr: '' });
      });

      await expect(
        runOplCommandProvider.fn!({ args: ['runtime', 'app-operator-drilldown', '--json'] })
      ).resolves.toMatchObject({ exitCode: 0 });
      await expect(
        runOplCommandProvider.fn!({
          args: ['runtime', 'app-operator-drilldown', '--json', '--detail', 'full'],
        })
      ).resolves.toMatchObject({ exitCode: 0 });

      expect(execFileMock).toHaveBeenCalledWith(
        '/bin/zsh',
        ['-lc', expect.stringContaining('OPL_OUTPUT=json "$OPL_APP_CLI"')],
        expect.objectContaining({ timeout: 120_000 }),
        expect.any(Function)
      );
      expect(execFileMock).toHaveBeenCalledWith(
        '/bin/zsh',
        ['-lc', expect.stringContaining('OPL_OUTPUT=json "$OPL_APP_CLI"')],
        expect.objectContaining({ timeout: 120_000 }),
        expect.any(Function)
      );
      expectOplJsonCommandArgs(execFileMock.mock.calls[0][1][1], ["'runtime'", "'app-operator-drilldown'", "'--json'"]);
      expectOplJsonCommandArgs(execFileMock.mock.calls[1][1][1], [
        "'runtime'",
        "'app-operator-drilldown'",
        "'--json'",
        "'--detail'",
        "'full'",
      ]);
    });

    it('rejects unsupported App operator drilldown argument shapes before invoking OPL', async () => {
      await expect(runOplCommandProvider.fn!({ args: ['runtime', 'app-operator-drilldown'] })).rejects.toThrow(
        'Unsupported OPL runtime action'
      );
      await expect(
        runOplCommandProvider.fn!({
          args: ['runtime', 'app-operator-drilldown', '--detail', 'domain-truth', '--json'],
        })
      ).rejects.toThrow('Unsupported OPL runtime action');
      await expect(
        runOplCommandProvider.fn!({
          args: ['runtime', 'app-operator-drilldown', '--detail', 'full', '--json'],
        })
      ).rejects.toThrow('Unsupported OPL runtime action');

      expect(execFileMock).not.toHaveBeenCalled();
    });

    it('allows runtime action execute for whitelisted safe action families with refs-only payloads', async () => {
      const safeActions = [
        'external_evidence_request:medautoscience:app_workbench_package_ref_consumption:record',
        'provider-scheduler:temporal:trigger',
        'legacy-cleanup:medautoscience:app-workbench-route:apply',
        'stage-production-evidence-receipt:medautoscience:analysis-campaign:record',
      ];

      execFileMock.mockImplementation((_file: string, _args: string[], _options: unknown, callback: Function) => {
        callback(null, { stdout: '{"runtime_operator_action_execution":{"dry_run":true}}', stderr: '' });
      });

      for (const actionId of safeActions) {
        const result = await runOplCommandProvider.fn!({
          args: [
            'runtime',
            'action',
            'execute',
            '--action',
            actionId,
            '--payload',
            '{"evidence_refs":["receipt:external"],"domain_receipt_ref":"domain:receipt"}',
            '--dry-run',
          ],
        });

        expect(result.exitCode).toBe(0);
      }

      const noPayloadExecute = await runOplCommandProvider.fn!({
        args: ['runtime', 'action', 'execute', '--action', 'stage-production-attempt:medautoscience:analysis-campaign'],
      });
      expect(noPayloadExecute.exitCode).toBe(0);

      expect(execFileMock).toHaveBeenCalledTimes(safeActions.length + 1);
      expect(execFileMock).toHaveBeenCalledWith(
        '/bin/zsh',
        ['-lc', expect.stringContaining('OPL_OUTPUT=json "$OPL_APP_CLI"')],
        expect.objectContaining({ timeout: 120_000 }),
        expect.any(Function)
      );
      expectOplJsonCommandArgs(execFileMock.mock.calls[0][1][1], [
        "'runtime'",
        "'action'",
        "'execute'",
        "'--action'",
        "'external_evidence_request:medautoscience:app_workbench_package_ref_consumption:record'",
      ]);
      expectOplJsonCommandArgs(execFileMock.mock.calls[1][1][1], [
        "'runtime'",
        "'action'",
        "'execute'",
        "'--action'",
        "'provider-scheduler:temporal:trigger'",
      ]);
      expectOplJsonCommandArgs(execFileMock.mock.calls[2][1][1], [
        "'runtime'",
        "'action'",
        "'execute'",
        "'--action'",
        "'legacy-cleanup:medautoscience:app-workbench-route:apply'",
      ]);
      expectOplJsonCommandArgs(execFileMock.mock.calls[3][1][1], [
        "'runtime'",
        "'action'",
        "'execute'",
        "'--action'",
        "'stage-production-evidence-receipt:medautoscience:analysis-campaign:record'",
      ]);
    });

    it('rejects runtime action execute payload bodies and unsupported options before invoking OPL', async () => {
      await expect(
        runOplCommandProvider.fn!({
          args: [
            'runtime',
            'action',
            'execute',
            '--action',
            'stage-production-attempt:medautoscience:analysis-campaign',
            '--payload',
            '{"memory_body":"secret"}',
          ],
        })
      ).rejects.toThrow('Unsupported OPL runtime action refs-only payload');
      await expect(
        runOplCommandProvider.fn!({
          args: [
            'runtime',
            'action',
            'execute',
            '--action',
            'stage-production-attempt:medautoscience:analysis-campaign',
            '--payload',
            '{"evidence_refs":[{"body":"secret"}]}',
          ],
        })
      ).rejects.toThrow('Unsupported OPL runtime action refs-only payload');
      await expect(
        runOplCommandProvider.fn!({
          args: [
            'runtime',
            'action',
            'execute',
            '--action',
            'stage-production-attempt:medautoscience:analysis-campaign',
            '--json',
          ],
        })
      ).rejects.toThrow('Unsupported OPL runtime action execute option');
      await expect(
        runOplCommandProvider.fn!({
          args: [
            'runtime',
            'action',
            'execute',
            '--action',
            'stage-production-attempt:medautoscience:analysis-campaign',
            '--approve-domain-action',
          ],
        })
      ).rejects.toThrow('Unsupported OPL runtime action execute option');
      await expect(
        runOplCommandProvider.fn!({
          args: ['runtime', 'action', 'execute', '--action', 'domain-direct:medautoscience:unsafe-apply'],
        })
      ).rejects.toThrow('Unsupported OPL runtime action id');

      expect(execFileMock).not.toHaveBeenCalled();
    });

    it('does not queue read-only status refreshes behind long maintenance commands', async () => {
      const started: string[] = [];
      const finishers: Record<string, () => void> = {};

      execFileMock.mockImplementation((_file: string, args: string[], _options: unknown, callback: Function) => {
        const command = args[1];
        started.push(command);
        finishers[command] = () => callback(null, { stdout: `{"command":${JSON.stringify(command)}}`, stderr: '' });
      });

      const maintenance = runOplCommandProvider.fn!({ args: ['install', '--skip-gui-open'] });
      const status = runOplCommandProvider.fn!({ args: ['system', 'initialize', '--json'] });

      await flushPromises();
      expect(started).toHaveLength(2);
      const installCommand = started.find((command) => command.includes("'install' '--skip-gui-open'"));
      const statusCommand = started.find((command) => command.includes("'system' 'initialize'"));
      expect(installCommand).toBeTruthy();
      expect(statusCommand).toBeTruthy();

      finishers[statusCommand!]?.();
      await expect(status).resolves.toMatchObject({ exitCode: 0 });

      finishers[installCommand!]?.();
      await expect(maintenance).resolves.toMatchObject({ exitCode: 0 });
    });

    it('continues to serialize mutating OPL CLI commands', async () => {
      const started: string[] = [];
      const finishers: Array<() => void> = [];

      execFileMock.mockImplementation((_file: string, args: string[], _options: unknown, callback: Function) => {
        const command = args[1];
        started.push(command);
        finishers.push(() => callback(null, { stdout: `{"command":${JSON.stringify(command)}}`, stderr: '' }));
      });

      const first = runOplCommandProvider.fn!({ args: ['install', '--skip-gui-open'] });
      const second = runOplCommandProvider.fn!({ args: ['system', 'update'] });

      await flushPromises();
      expect(started).toHaveLength(1);
      expect(started[0]).toContain("'install' '--skip-gui-open'");

      finishers.shift()?.();
      await expect(first).resolves.toMatchObject({ exitCode: 0 });

      await flushPromises();
      expect(started).toHaveLength(2);
      expect(started[1]).toContain("'system' 'update'");

      finishers.shift()?.();
      await expect(second).resolves.toMatchObject({ exitCode: 0 });
    });

    it('allows stage attempt human gate, resume, and repair signals through the family-runtime bridge', async () => {
      execFileMock.mockImplementation((_file: string, _args: string[], _options: unknown, callback: Function) => {
        callback(null, {
          stdout: '{"family_runtime_stage_attempt_signal":{"signal":{"signal_kind":"resume"}}}',
          stderr: '',
        });
      });

      await expect(
        runOplCommandProvider.fn!({
          args: [
            'family-runtime',
            'attempt',
            'signal',
            'sat_human_gate',
            '--kind',
            'resume',
            '--payload',
            '{"reason":"operator_resume_requested"}',
            '--source',
            'opl-aion-shell',
          ],
        })
      ).resolves.toMatchObject({ exitCode: 0 });
      await expect(
        runOplCommandProvider.fn!({
          args: [
            'family-runtime',
            'attempt',
            'signal',
            'sat_running',
            '--kind',
            'human_gate',
            '--payload',
            '{"human_gate_ref":"opl-aion-shell:human_gate:sat_running","reason":"operator_human_gate_requested"}',
            '--source',
            'opl-aion-shell',
          ],
        })
      ).resolves.toMatchObject({ exitCode: 0 });
      await expect(
        runOplCommandProvider.fn!({
          args: [
            'family-runtime',
            'attempt',
            'signal',
            'sat_dead_letter',
            '--kind',
            'user_instruction',
            '--payload',
            '{"instruction_kind":"dead_letter_repair","reason":"operator_dead_letter_repair_requested"}',
            '--source',
            'opl-aion-shell',
          ],
        })
      ).resolves.toMatchObject({ exitCode: 0 });
      expect(execFileMock).toHaveBeenCalledWith(
        '/bin/zsh',
        ['-lc', expect.stringContaining('OPL_OUTPUT=json "$OPL_APP_CLI"')],
        expect.objectContaining({ timeout: 120_000 }),
        expect.any(Function)
      );
      expectOplJsonCommandArgs(execFileMock.mock.calls[0][1][1], ["'family-runtime'", "'attempt'", "'signal'"]);
    });

    it('rejects arbitrary family-runtime commands from the shell bridge', async () => {
      await expect(runOplCommandProvider.fn!({ args: ['family-runtime', 'repair'] })).rejects.toThrow(
        'Unsupported OPL family-runtime action: repair'
      );
      await expect(
        runOplCommandProvider.fn!({
          args: ['family-runtime', 'attempt', 'start', 'sat_001'],
        })
      ).rejects.toThrow('Unsupported OPL family-runtime action: attempt start');
      await expect(
        runOplCommandProvider.fn!({
          args: [
            'family-runtime',
            'attempt',
            'signal',
            'sat_001',
            '--kind',
            'user_instruction',
            '--payload',
            '{"instruction_kind":"arbitrary_shell"}',
            '--source',
            'opl-aion-shell',
          ],
        })
      ).rejects.toThrow('Unsupported OPL family-runtime user instruction');
      await expect(
        runOplCommandProvider.fn!({
          args: [
            'family-runtime',
            'attempt',
            'signal',
            'sat_001',
            '--kind',
            'resume',
            '--payload',
            '{"reason":"operator_resume_requested","command":"family-runtime repair"}',
            '--source',
            'opl-aion-shell',
          ],
        })
      ).rejects.toThrow('Unsupported OPL family-runtime resume signal');
      await expect(
        runOplCommandProvider.fn!({
          args: [
            'family-runtime',
            'attempt',
            'signal',
            'sat_001',
            '--kind',
            'human_gate',
            '--payload',
            '{"human_gate_ref":"opl-aion-shell:human_gate:sat_other","reason":"operator_human_gate_requested"}',
            '--source',
            'opl-aion-shell',
          ],
        })
      ).rejects.toThrow('Unsupported OPL family-runtime human gate signal');
      expect(execFileMock).not.toHaveBeenCalled();
    });

    it('allows the system update command for one-click environment maintenance', async () => {
      execFileMock.mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
        callback(null, { stdout: '{"updated":true}', stderr: '' });
      });

      const result = await runOplCommandProvider.fn!({ args: ['system', 'update'] });

      expect(result.exitCode).toBe(0);
      expect(execFileMock).toHaveBeenCalledWith(
        '/bin/zsh',
        ['-lc', expect.stringContaining('OPL_OUTPUT=json "$OPL_APP_CLI"')],
        expect.objectContaining({ timeout: 30 * 60_000 }),
        expect.any(Function)
      );
      expectOplJsonCommandArgs(execFileMock.mock.calls[0][1][1], ["'system'", "'update'"]);
    });

    it('allows the developer-supervisor command for OPL Developer Mode settings', async () => {
      execFileMock.mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
        callback(null, {
          stdout: '{"system_action":{"action":"developer_supervisor","status":"completed"}}',
          stderr: '',
        });
      });

      const result = await runOplCommandProvider.fn!({
        args: ['system', 'developer-supervisor', '--enabled', 'off'],
      });

      expect(result.exitCode).toBe(0);
      expect(execFileMock).toHaveBeenCalledWith(
        '/bin/zsh',
        ['-lc', expect.stringContaining('OPL_OUTPUT=json "$OPL_APP_CLI"')],
        expect.objectContaining({ timeout: 120_000 }),
        expect.any(Function)
      );
      expectOplJsonCommandArgs(execFileMock.mock.calls[0][1][1], [
        "'system'",
        "'developer-supervisor'",
        "'--enabled'",
        "'off'",
      ]);
    });

    it('rejects unsupported developer-supervisor arguments from the shell bridge', async () => {
      await expect(
        runOplCommandProvider.fn!({
          args: ['system', 'developer-supervisor', '--enabled', 'maybe'],
        })
      ).rejects.toThrow('Unsupported OPL developer-supervisor enabled value: maybe');
    });

    it('allows the system reconcile-modules command for App-version module coordination', async () => {
      execFileMock.mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
        callback(null, { stdout: '{"system_action":{"status":"completed"}}', stderr: '' });
      });

      const result = await runOplCommandProvider.fn!({ args: ['system', 'reconcile-modules'] });

      expect(result.exitCode).toBe(0);
      expect(execFileMock).toHaveBeenCalledWith(
        '/bin/zsh',
        ['-lc', expect.stringContaining('OPL_OUTPUT=json "$OPL_APP_CLI"')],
        expect.objectContaining({ timeout: 30 * 60_000 }),
        expect.any(Function)
      );
      expectOplJsonCommandArgs(execFileMock.mock.calls[0][1][1], ["'system'", "'reconcile-modules'"]);
    });

    it('allows the system startup-maintenance command for App startup module and skill refresh', async () => {
      execFileMock.mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
        callback(null, {
          stdout: '{"system_action":{"action":"startup_maintenance","status":"completed"}}',
          stderr: '',
        });
      });

      const result = await runOplCommandProvider.fn!({ args: ['system', 'startup-maintenance'] });

      expect(result.exitCode).toBe(0);
      expect(execFileMock).toHaveBeenCalledWith(
        '/bin/zsh',
        ['-lc', expect.stringContaining('OPL_OUTPUT=json "$OPL_APP_CLI"')],
        expect.objectContaining({ timeout: 30 * 60_000 }),
        expect.any(Function)
      );
      expectOplJsonCommandArgs(execFileMock.mock.calls[0][1][1], ["'system'", "'startup-maintenance'"]);
    });

    it('reports the active Full runtime status from the main process environment', async () => {
      process.env.OPL_FULL_RUNTIME_HOME = '/tmp/OPL Full Runtime/current';

      const status = await getOplFullRuntimeStatusProvider.fn!();

      expect(status).toEqual({
        active: true,
        runtimeHome: '/tmp/OPL Full Runtime/current',
      });
    });

    it('skips git-backed startup maintenance in a Full runtime without probing Command Line Tools', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      process.env.OPL_FULL_RUNTIME_HOME = '/tmp/OPL Full Runtime/current';

      const result = await runOplCommandProvider.fn!({ args: ['system', 'startup-maintenance'] });

      expect(result).toEqual({
        exitCode: 0,
        stdout: '{"system_action":{"status":"skipped","reason":"full_runtime_managed_modules"}}',
        stderr: '',
      });
      expect(execFileMock).not.toHaveBeenCalled();
    });

    it('opens the macOS Command Line Tools installer before standard setup commands when tools are missing', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const missingTools = Object.assign(new Error('xcode-select missing'), { code: 2, stdout: '', stderr: '' });
      execFileMock
        .mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
          callback(missingTools);
        })
        .mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
          callback(null, { stdout: '', stderr: '' });
        });

      const result = await runOplCommandProvider.fn!({ args: ['install', '--skip-gui-open'] });

      expect(result.exitCode).toBe(69);
      expect(result.stderr).toContain('Command Line Tools installer has been opened');
      expect(execFileMock).toHaveBeenNthCalledWith(
        1,
        '/usr/bin/xcode-select',
        ['-p'],
        expect.objectContaining({ timeout: 10_000 }),
        expect.any(Function)
      );
      expect(execFileMock).toHaveBeenNthCalledWith(
        2,
        '/usr/bin/xcode-select',
        ['--install'],
        expect.objectContaining({ timeout: 10_000 }),
        expect.any(Function)
      );
      expect(JSON.stringify(execFileMock.mock.calls)).not.toContain("'opl' 'install'");
    });

    it('allows standard core install without Command Line Tools so Codex can be prepared first', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      execFileMock.mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
        callback(null, { stdout: '{"install":{"selected_engines":["codex"],"selected_modules":[]}}', stderr: '' });
      });

      const result = await runOplCommandProvider.fn!({ args: ['install', '--skip-modules', '--skip-gui-open'] });

      expect(result.exitCode).toBe(0);
      expect(execFileMock).toHaveBeenCalledOnce();
      const command = execFileMock.mock.calls[0][1][1];
      expect(command).toContain('$HOME/.opl/toolchain');
      expect(command).toContain('fi; done; unset _opl_node_bin; fi');
      expectOplCommandArgs(command, ["'install'", "'--skip-modules'", "'--skip-gui-open'"]);
      expect(JSON.stringify(execFileMock.mock.calls)).not.toContain('/usr/bin/xcode-select');
    });

    it('reports available Command Line Tools without opening the installer', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      execFileMock.mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
        callback(null, { stdout: '/Library/Developer/CommandLineTools\n', stderr: '' });
      });

      const result = await prepareCommandLineToolsProvider.fn!();

      expect(result).toEqual({ status: 'available' });
      expect(execFileMock).toHaveBeenCalledOnce();
      expect(execFileMock).toHaveBeenCalledWith(
        '/usr/bin/xcode-select',
        ['-p'],
        expect.objectContaining({ timeout: 10_000 }),
        expect.any(Function)
      );
    });

    it('requests the macOS Command Line Tools installer when tools are missing', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const missingTools = Object.assign(new Error('xcode-select missing'), { code: 2, stdout: '', stderr: '' });
      execFileMock
        .mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
          callback(missingTools);
        })
        .mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
          callback(null, { stdout: '', stderr: '' });
        });

      const result = await prepareCommandLineToolsProvider.fn!();

      expect(result.status).toBe('installer_requested');
      expect(result.message).toContain('Command Line Tools installer has been opened');
      expect(execFileMock).toHaveBeenNthCalledWith(
        1,
        '/usr/bin/xcode-select',
        ['-p'],
        expect.objectContaining({ timeout: 10_000 }),
        expect.any(Function)
      );
      expect(execFileMock).toHaveBeenNthCalledWith(
        2,
        '/usr/bin/xcode-select',
        ['--install'],
        expect.objectContaining({ timeout: 10_000 }),
        expect.any(Function)
      );
    });

    it('replaces raw xcode-select stderr with a user-facing installer prompt', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const xcodeSelectFailure = Object.assign(new Error('git failed'), {
        code: 3,
        stdout: '{"error":{"code":"build_command_failed"}}',
        stderr: 'xcode-select: note: No developer tools were found, requesting install',
      });
      execFileMock
        .mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
          callback(xcodeSelectFailure);
        })
        .mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
          callback(null, { stdout: '', stderr: '' });
        });

      const result = await runOplCommandProvider.fn!({ args: ['system', 'initialize', '--json'] });

      expect(result.exitCode).toBe(3);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Command Line Tools installer has been opened');
      expect(result.stderr).not.toContain('build_command_failed');
      expect(execFileMock).toHaveBeenNthCalledWith(
        2,
        '/usr/bin/xcode-select',
        ['--install'],
        expect.objectContaining({ timeout: 10_000 }),
        expect.any(Function)
      );
    });

    it('configures Codex through stdin without putting the API key in the shell command', async () => {
      let stdoutData: ((chunk: string) => void) | undefined;
      let exitHandler: ((code: number) => void) | undefined;
      const stdin = {
        write: vi.fn(),
        end: vi.fn(),
      };
      const child = {
        stdout: {
          on: vi.fn((event: string, handler: (chunk: string) => void) => {
            if (event === 'data') stdoutData = handler;
            return child.stdout;
          }),
        },
        stderr: {
          on: vi.fn(() => child.stderr),
        },
        stdin,
        on: vi.fn((event: string, handler: (code: number) => void) => {
          if (event === 'exit') exitHandler = handler;
          return child;
        }),
        kill: vi.fn(),
      };
      spawnMock.mockReturnValueOnce(child);

      const promise = configureOplCodexProvider.fn!({ apiKey: 'secret-api-key' });
      await flushPromises();
      stdoutData?.('{"codex_config":{"status":"completed"}}');
      exitHandler?.(0);
      const result = await promise;

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('completed');
      expect(stdin.write).toHaveBeenCalledWith('secret-api-key\n');
      expect(stdin.end).toHaveBeenCalled();
      expect(spawnMock).toHaveBeenCalledWith(
        '/bin/zsh',
        ['-lc', expect.stringContaining('OPL_OUTPUT=json "$OPL_APP_CLI"')],
        expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'] })
      );
      expectOplJsonCommandArgs(spawnMock.mock.calls[0][1][1], ["'system'", "'configure-codex'", "'--api-key-stdin'"]);
      expect(JSON.stringify(spawnMock.mock.calls)).not.toContain('secret-api-key');
    });

    it('bootstraps the CLI through the OPL installer when opl is missing', async () => {
      const missingOpl = Object.assign(new Error('opl not found'), { code: 127, stdout: '', stderr: '' });
      execFileMock
        .mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
          callback(missingOpl);
        })
        .mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
          callback(null, { stdout: 'bootstrap ok', stderr: '' });
        })
        .mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
          callback(null, { stdout: '{"ready":true}', stderr: '' });
        });

      const result = await runOplCommandProvider.fn!({ args: ['system', 'initialize', '--json'] });
      const bootstrapCommand = execFileMock.mock.calls[1][1][1];
      const bootstrappedOplCommand = execFileMock.mock.calls[2][1][1];

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('bootstrapped one-person-lab through the OPL installer');
      expect(result.stdout).toContain('{"ready":true}');
      expect(bootstrapCommand).toContain('raw.githubusercontent.com/gaofeng21cn/one-person-lab/main/install.sh');
      expect(bootstrapCommand).toContain('curl --http1.1 --connect-timeout 20 --max-time 120 --retry 3');
      expect(bootstrapCommand).toContain('--bootstrap-only');
      expect(bootstrapCommand).not.toContain("OPL_OUTPUT=json 'opl' 'system' 'initialize' '--json'");
      expect(bootstrappedOplCommand).toContain('OPL_OUTPUT=json "$OPL_APP_CLI"');
      expect(bootstrappedOplCommand).toContain("'system' 'initialize' '--json'");
    });

    it('adds the App-managed Node toolchain to standard OPL commands after bootstrap', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const missingOpl = Object.assign(new Error('opl not found'), { code: 127, stdout: '', stderr: '' });
      execFileMock
        .mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
          callback(missingOpl);
        })
        .mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
          callback(null, { stdout: 'bootstrap ok', stderr: '' });
        })
        .mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
          callback(null, { stdout: '{"ready":true}', stderr: '' });
        });

      await expect(runOplCommandProvider.fn!({ args: ['system', 'initialize', '--json'] })).resolves.toMatchObject({
        exitCode: 0,
      });

      const directCommand = execFileMock.mock.calls[0][1][1];
      const bootstrappedCommand = execFileMock.mock.calls[2][1][1];
      expect(directCommand).toContain('"$HOME"/.opl/toolchain/node-v*/bin');
      expect(directCommand).toContain('export PATH="$_opl_node_bin:$PATH"');
      expect(bootstrappedCommand).toContain('"$HOME"/.opl/toolchain/node-v*/bin');
      expect(bootstrappedCommand).toContain('export PATH="$_opl_node_bin:$PATH"');
      expect(bootstrappedCommand).toContain('OPL_OUTPUT=json "$OPL_APP_CLI"');
      expect(bootstrappedCommand).toContain("'system' 'initialize' '--json'");
    });

    it('falls back to the App-managed OPL checkout when npm global link is not on PATH', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const missingOpl = Object.assign(new Error('opl not found'), { code: 127, stdout: '', stderr: '' });
      execFileMock
        .mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
          callback(missingOpl);
        })
        .mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
          callback(null, { stdout: 'bootstrap ok', stderr: '' });
        })
        .mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
          callback(null, { stdout: '{"ready":true}', stderr: '' });
        });

      await expect(runOplCommandProvider.fn!({ args: ['system', 'initialize', '--json'] })).resolves.toMatchObject({
        exitCode: 0,
      });

      const bootstrapCommand = execFileMock.mock.calls[1][1][1];
      const bootstrappedCommand = execFileMock.mock.calls[2][1][1];
      expect(bootstrapCommand).toContain('OPL_INSTALL_DIR=');
      expect(bootstrapCommand).toContain('Library/Application Support/One Person Lab/opl/one-person-lab');
      expect(bootstrappedCommand).toContain('OPL_APP_MANAGED_CLI=');
      expect(bootstrappedCommand).toContain('if command -v opl >/dev/null 2>&1; then');
      expect(bootstrappedCommand).toContain('elif [ -x "$OPL_APP_MANAGED_CLI" ]; then');
      expect(bootstrappedCommand).toContain('"$OPL_APP_MANAGED_CLI"');
      expect(bootstrappedCommand).not.toContain('command -v opl >/dev/null || exit 127');
    });

    it('shares missing-opl bootstrap recovery while read-only commands run concurrently', async () => {
      const missingOpl = Object.assign(new Error('opl not found'), { code: 127, stdout: '', stderr: '' });
      let directCommandCalls = 0;
      let bootstrapCalls = 0;
      let installedAfterBootstrap = false;

      execFileMock.mockImplementation((_file: string, args: string[], _options: unknown, callback: Function) => {
        const command = args[1];
        if (command.includes('OPL_BOOTSTRAP_SCRIPT=')) {
          bootstrapCalls += 1;
          installedAfterBootstrap = true;
          callback(null, { stdout: 'bootstrap ok', stderr: '' });
          return;
        }
        if (command.includes('command -v opl >/dev/null')) {
          directCommandCalls += 1;
          if (!installedAfterBootstrap) {
            callback(missingOpl);
            return;
          }
          callback(null, { stdout: '{"ready":true}', stderr: '' });
          return;
        }
        callback(null, { stdout: '', stderr: '' });
      });

      const [first, second] = await Promise.all([
        runOplCommandProvider.fn!({ args: ['system', 'initialize', '--json'] }),
        runOplCommandProvider.fn!({ args: ['system', 'initialize', '--json'] }),
      ]);

      expect(first.exitCode).toBe(0);
      expect(second.exitCode).toBe(0);
      expect(bootstrapCalls).toBe(1);
      expect(directCommandCalls).toBe(4);
    });

    it('reads the structured first-run jsonl log for visible startup status', async () => {
      fsMock.existsSync.mockReturnValue(true);
      fsMock.readFile.mockResolvedValue(
        [
          JSON.stringify({
            event_type: 'gui_preparation_started',
            schema_version: 'opl_first_run_event.v1',
            surface_id: 'opl_first_run_log',
            payload: {},
          }),
          'not-json',
          JSON.stringify({
            event_type: 'gui_preparation_completed',
            schema_version: 'opl_first_run_event.v1',
            surface_id: 'opl_first_run_log',
            payload: { status: 'prepared' },
          }),
        ].join('\n')
      );

      const result = await readOplFirstRunLogProvider.fn!();

      expect(result.path).toContain('Library/Logs/One Person Lab/first-run.jsonl');
      expect(result.entries).toEqual([
        {
          event_type: 'gui_preparation_started',
          schema_version: 'opl_first_run_event.v1',
          surface_id: 'opl_first_run_log',
          payload: {},
        },
        {
          event_type: 'gui_preparation_completed',
          schema_version: 'opl_first_run_event.v1',
          surface_id: 'opl_first_run_log',
          payload: { status: 'prepared' },
        },
      ]);
      expect(result.latest).toEqual({
        event_type: 'gui_preparation_completed',
        schema_version: 'opl_first_run_event.v1',
        surface_id: 'opl_first_run_log',
        payload: { status: 'prepared' },
      });
    });

    it('appends structured first-run log events', async () => {
      fsMock.mkdir.mockResolvedValue(undefined);
      fsMock.appendFile.mockResolvedValue(undefined);

      await appendOplFirstRunLogProvider.fn!({
        eventType: 'gui_install_started',
        payload: { status: 'started' },
      });

      expect(fsMock.mkdir).toHaveBeenCalledWith(expect.stringContaining('Library/Logs/One Person Lab'), {
        recursive: true,
      });
      expect(fsMock.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('first-run.jsonl'),
        expect.stringContaining('"event_type":"gui_install_started"'),
        'utf8'
      );
    });
  });

  describe('openFolderWith', () => {
    beforeEach(() => {
      initShellBridge();
      execMock.mockImplementation((cmd: string, callback: (err: Error | null) => void) => {
        callback(null);
      });
    });

    it('opens folder with explorer on Windows', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      shellMock.openPath.mockResolvedValue('');

      await openFolderWithProvider.fn!({ folderPath: 'C:\\Projects', tool: 'explorer' });

      expect(shellMock.openPath).toHaveBeenCalledWith('C:\\Projects');
    });

    it('opens folder with terminal on macOS', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      await openFolderWithProvider.fn!({ folderPath: '/workspace/project', tool: 'terminal' });

      expect(spawnMock).toHaveBeenCalledWith('open', ['-a', 'Terminal', '/workspace/project'], {
        detached: true,
        stdio: 'ignore',
      });
    });

    it('handles folder path with special characters', async () => {
      const folderWithSpecialChars = "/path/with'quotes";
      shellMock.openPath.mockResolvedValue('');

      await openFolderWithProvider.fn!({ folderPath: folderWithSpecialChars, tool: 'explorer' });

      expect(shellMock.openPath).toHaveBeenCalledWith(folderWithSpecialChars);
    });

    it('uses shell:true for .cmd fallback on Windows and handles EINVAL', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      // Set Windows env vars so findVSCodeExecutable builds the right paths
      const origProgramFiles = process.env['ProgramFiles'];
      process.env['ProgramFiles'] = 'C:\\Program Files';

      // First spawn of 'code' fails with ENOENT
      let errorCallback: ((...args: unknown[]) => void) | undefined;
      const firstChild = {
        on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          if (event === 'error') errorCallback = cb;
        }),
        unref: vi.fn(),
      };

      // Fallback spawn of 'code.cmd' also emits error (EINVAL)
      let fallbackErrorCallback: ((...args: unknown[]) => void) | undefined;
      const fallbackChild = {
        on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          if (event === 'error') fallbackErrorCallback = cb;
        }),
        unref: vi.fn(),
      };

      spawnMock.mockReturnValueOnce(firstChild).mockReturnValueOnce(fallbackChild);

      // findVSCodeExecutable finds code.cmd via ProgramFiles
      fsMock.existsSync.mockImplementation((p: string) => p.endsWith('code.cmd') && p.includes('Program Files'));

      await openFolderWithProvider.fn!({ folderPath: 'C:\\Projects\\Q&M', tool: 'vscode' });

      // Trigger ENOENT on first spawn
      expect(errorCallback).toBeDefined();
      await errorCallback!(new Error('spawn code ENOENT'));

      // Fallback spawn should use shell: true for .cmd
      const fallbackCall = spawnMock.mock.calls[1];
      expect(fallbackCall).toBeDefined();
      expect(fallbackCall[0]).toContain('code.cmd');
      expect(fallbackCall[2]).toMatchObject({ shell: true });

      // Trigger EINVAL on fallback — should not throw, falls back to shell.openPath
      expect(fallbackErrorCallback).toBeDefined();
      shellMock.openPath.mockResolvedValue('');
      fallbackErrorCallback!(new Error('spawn EINVAL'));
      expect(shellMock.openPath).toHaveBeenCalledWith('C:\\Projects\\Q&M');

      // Restore env
      if (origProgramFiles === undefined) {
        delete process.env['ProgramFiles'];
      } else {
        process.env['ProgramFiles'] = origProgramFiles;
      }
    });
  });
});
