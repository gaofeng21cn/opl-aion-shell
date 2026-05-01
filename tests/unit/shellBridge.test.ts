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
}));

// --- Tests ---

let initShellBridge: typeof import('../../src/process/bridge/shellBridge').initShellBridge;

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

  // Default mocks
  Object.defineProperty(process, 'platform', { value: 'win32' });

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
        ['-lc', expect.stringContaining("OPL_OUTPUT=json 'opl' 'system' 'initialize' '--json'")],
        expect.objectContaining({ timeout: 120_000, maxBuffer: 20 * 1024 * 1024 }),
        expect.any(Function)
      );
    });

    it('allows the packages manifest command for environment management', async () => {
      execFileMock.mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
        callback(null, { stdout: '{"packages_manifest":{}}', stderr: '' });
      });

      const result = await runOplCommandProvider.fn!({ args: ['packages', 'manifest'] });

      expect(result.exitCode).toBe(0);
      expect(execFileMock).toHaveBeenCalledWith(
        '/bin/zsh',
        ['-lc', expect.stringContaining("'opl' 'packages' 'manifest'")],
        expect.objectContaining({ timeout: 120_000 }),
        expect.any(Function)
      );
    });

    it('allows the runtime snapshot command as a read-only OPL status surface', async () => {
      execFileMock.mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
        callback(null, { stdout: '{"runtime_tray_snapshot":{}}', stderr: '' });
      });

      const result = await runOplCommandProvider.fn!({ args: ['runtime', 'snapshot', '--json'] });

      expect(result.exitCode).toBe(0);
      expect(execFileMock).toHaveBeenCalledWith(
        '/bin/zsh',
        ['-lc', expect.stringContaining("OPL_OUTPUT=json 'opl' 'runtime' 'snapshot' '--json'")],
        expect.objectContaining({ timeout: 120_000 }),
        expect.any(Function)
      );
    });

    it('allows the system update command for one-click environment maintenance', async () => {
      execFileMock.mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
        callback(null, { stdout: '{"updated":true}', stderr: '' });
      });

      const result = await runOplCommandProvider.fn!({ args: ['system', 'update'] });

      expect(result.exitCode).toBe(0);
      expect(execFileMock).toHaveBeenCalledWith(
        '/bin/zsh',
        ['-lc', expect.stringContaining("OPL_OUTPUT=json 'opl' 'system' 'update'")],
        expect.objectContaining({ timeout: 30 * 60_000 }),
        expect.any(Function)
      );
    });

    it('allows the system reconcile-modules command for App-version module coordination', async () => {
      execFileMock.mockImplementationOnce((_file: string, _args: string[], _options: unknown, callback: Function) => {
        callback(null, { stdout: '{"system_action":{"status":"completed"}}', stderr: '' });
      });

      const result = await runOplCommandProvider.fn!({ args: ['system', 'reconcile-modules'] });

      expect(result.exitCode).toBe(0);
      expect(execFileMock).toHaveBeenCalledWith(
        '/bin/zsh',
        ['-lc', expect.stringContaining("OPL_OUTPUT=json 'opl' 'system' 'reconcile-modules'")],
        expect.objectContaining({ timeout: 30 * 60_000 }),
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
      stdoutData?.('{"codex_config":{"status":"completed"}}');
      exitHandler?.(0);
      const result = await promise;

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('completed');
      expect(stdin.write).toHaveBeenCalledWith('secret-api-key\n');
      expect(stdin.end).toHaveBeenCalled();
      expect(spawnMock).toHaveBeenCalledWith(
        '/bin/zsh',
        ['-lc', expect.stringContaining("'opl' 'system' 'configure-codex' '--api-key-stdin'")],
        expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'] })
      );
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
      expect(bootstrappedOplCommand).toContain("OPL_OUTPUT=json 'opl' 'system' 'initialize' '--json'");
    });

    it('shares one bootstrap across concurrent missing-opl commands', async () => {
      const missingOpl = Object.assign(new Error('opl not found'), { code: 127, stdout: '', stderr: '' });
      let directCommandCalls = 0;
      let bootstrapCalls = 0;

      execFileMock.mockImplementation((_file: string, args: string[], _options: unknown, callback: Function) => {
        const command = args[1];
        if (command.includes('OPL_BOOTSTRAP_SCRIPT=')) {
          bootstrapCalls += 1;
          callback(null, { stdout: 'bootstrap ok', stderr: '' });
          return;
        }
        if (command.includes('command -v opl >/dev/null')) {
          directCommandCalls += 1;
          if (directCommandCalls <= 2) {
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
