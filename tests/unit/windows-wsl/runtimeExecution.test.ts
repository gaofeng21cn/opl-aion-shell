import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { WindowsWslRuntimeExecution } from '@/process/services/runtime-execution/windowsWslRuntimeExecution';

class FakeProcess extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
}

function asChildProcess(process: FakeProcess): ChildProcessWithoutNullStreams {
  return process as unknown as ChildProcessWithoutNullStreams;
}

describe('Windows WSL runtime execution', () => {
  it('finalizes an exact owner token once before releasing the handle', async () => {
    const runtimeChild = new FakeProcess();
    const controlChild = new FakeProcess();
    const spawnProcess = vi.fn((command: string, args: string[]) => {
      if (args.includes('/opt/opl/bootstrap/opl-runtime-control')) {
        queueMicrotask(() => controlChild.emit('close', 0));
        return asChildProcess(controlChild);
      }
      expect(command).toBe('wsl.exe');
      return asChildProcess(runtimeChild);
    });
    const runtime = new WindowsWslRuntimeExecution({
      platform: 'win32',
      resourcesPath: 'C:\\OPL\\resources',
      userDataPath: 'C:\\OPL\\user-data',
      provisioner: {} as never,
      spawnProcess: spawnProcess as never,
    });

    const handle = runtime.spawn({
      program: 'opl-cli',
      args: ['app', 'state', '--profile', 'fast', '--json'],
      operationToken: 'app-close-reconcile-test',
    });
    await handle.finalize();
    await handle.finalize();
    await handle.terminate();

    expect(handle.operationToken).toBe('app-close-reconcile-test');
    expect(spawnProcess).toHaveBeenNthCalledWith(
      2,
      'wsl.exe',
      expect.arrayContaining([
        '--distribution',
        'OPL-Linux',
        '--user',
        'opl',
        '--exec',
        '/opt/opl/bootstrap/opl-runtime-control',
        '--operation-token',
        'app-close-reconcile-test',
      ]),
      expect.objectContaining({
        shell: false,
        windowsHide: true,
      })
    );
    await runtime.terminateAll();
    expect(spawnProcess).toHaveBeenCalledTimes(2);
  });

  it('projects workspace paths through the owned provisioner after readiness', async () => {
    const provisioner = {
      ensureReady: vi.fn().mockResolvedValue({}),
      projectHostPath: vi.fn().mockResolvedValue('/mnt/d/研究/RCT'),
    };
    const runtime = new WindowsWslRuntimeExecution({
      platform: 'win32',
      resourcesPath: 'C:\\OPL\\resources',
      userDataPath: 'C:\\OPL\\user-data',
      provisioner: provisioner as never,
      spawnProcess: vi.fn() as never,
    });

    await expect(runtime.projectWorkspacePath('D:\\研究\\RCT')).resolves.toBe('/mnt/d/研究/RCT');
    expect(provisioner.ensureReady).toHaveBeenCalledOnce();
    expect(provisioner.projectHostPath).toHaveBeenCalledWith('D:\\研究\\RCT');
  });
});
