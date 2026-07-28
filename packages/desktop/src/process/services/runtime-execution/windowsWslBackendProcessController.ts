import type { ChildProcess } from 'node:child_process';
import type { BackendProcessController } from '@aionui/web-host';

import type { WindowsWslProcessHandle } from './windowsWslRuntimeExecution';
import { type WindowsWslRuntimeExecution } from './windowsWslRuntimeExecution';

export const OPL_WSL_BACKEND_BINARY = '/opt/opl/carrier/current/aioncore';
export const OPL_WSL_DATA_DIR = '/home/opl/.local/share/one-person-lab';
export const OPL_WSL_CACHE_DIR = '/home/opl/.cache/one-person-lab';
export const OPL_WSL_WORK_DIR = '/home/opl/.local/state/one-person-lab/work';
export const OPL_WSL_LOG_DIR = '/home/opl/.local/state/one-person-lab/logs';

const GUEST_PATH_BY_OPTION = new Map([
  ['--data-dir', OPL_WSL_DATA_DIR],
  ['--log-dir', OPL_WSL_LOG_DIR],
  ['--work-dir', OPL_WSL_WORK_DIR],
]);

export function buildWindowsWslBackendArgs(args: string[]): string[] {
  const guestArgs: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--parent-pid') {
      index += 1;
      continue;
    }
    const guestPath = GUEST_PATH_BY_OPTION.get(arg);
    if (guestPath) {
      guestArgs.push(arg, guestPath);
      index += 1;
      continue;
    }
    guestArgs.push(arg);
  }
  return guestArgs;
}

export function createWindowsWslBackendProcessController(
  runtime: WindowsWslRuntimeExecution
): BackendProcessController {
  const handles = new WeakMap<ChildProcess, WindowsWslProcessHandle>();

  return {
    spawn(_binaryPath, args) {
      const handle = runtime.spawn({
        program: 'aioncore',
        args: buildWindowsWslBackendArgs(args),
      });
      handles.set(handle.child, handle);
      return handle.child;
    },
    async terminate(childProcess, signal) {
      const handle = handles.get(childProcess);
      if (!handle) throw new Error('The WSL AionCore operation is not owned by this App process.');
      await handle.terminate(signal === 'SIGKILL' ? 0 : 5000);
    },
    async validateRecoveryCompatibility() {
      await runtime.inspect();
    },
  };
}
