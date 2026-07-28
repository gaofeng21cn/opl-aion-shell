import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';

import {
  buildWindowsWslBackendArgs,
  createWindowsWslBackendProcessController,
  OPL_WSL_DATA_DIR,
  OPL_WSL_LOG_DIR,
  OPL_WSL_WORK_DIR,
} from '../../../packages/desktop/src/process/services/runtime-execution/windowsWslBackendProcessController';
import type {
  WindowsWslProcessHandle,
  WindowsWslRuntimeExecution,
} from '../../../packages/desktop/src/process/services/runtime-execution/windowsWslRuntimeExecution';

describe('Windows WSL AionCore process controller', () => {
  it('replaces host data paths and drops the meaningless Windows parent PID', () => {
    expect(
      buildWindowsWslBackendArgs([
        '--port',
        '0',
        '--data-dir',
        'C:\\Users\\test\\data',
        '--parent-pid',
        '321',
        '--log-dir',
        'C:\\Users\\test\\logs',
        '--work-dir',
        'C:\\Users\\test\\work',
        '--local',
      ])
    ).toEqual([
      '--port',
      '0',
      '--data-dir',
      OPL_WSL_DATA_DIR,
      '--log-dir',
      OPL_WSL_LOG_DIR,
      '--work-dir',
      OPL_WSL_WORK_DIR,
      '--local',
    ]);
  });

  it('spawns and terminates only through the owner-bound WSL runtime handle', async () => {
    const child = {} as ChildProcessWithoutNullStreams;
    const terminate = vi.fn(async () => {});
    const handle: WindowsWslProcessHandle = {
      child,
      operationToken: 'app-test',
      terminate,
    };
    const runtime = {
      spawn: vi.fn(() => handle),
      inspect: vi.fn(async () => ({ wsl2: true })),
    } as unknown as WindowsWslRuntimeExecution;
    const controller = createWindowsWslBackendProcessController(runtime);

    expect(controller.spawn('C:\\native\\aioncore.exe', ['--data-dir', 'C:\\native'], {} as never)).toBe(child);
    expect(runtime.spawn).toHaveBeenCalledWith({
      program: 'aioncore',
      args: ['--data-dir', OPL_WSL_DATA_DIR],
    });

    await controller.terminate(child, 'SIGTERM');
    await controller.terminate(child, 'SIGKILL');
    expect(terminate.mock.calls).toEqual([[5000], [0]]);
  });
});
