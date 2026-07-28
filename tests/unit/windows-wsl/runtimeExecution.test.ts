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

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve();
  }
}

describe('Windows WSL runtime execution', () => {
  it('reconciles an exact owner token when the host WSL child closes', async () => {
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
    runtimeChild.emit('close', 0);
    await flushMicrotasks();

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
});
