import { WindowsWslRuntimeExecution } from './windowsWslRuntimeExecution';
import type { WindowsWslProvisioningProgress } from '../windows-wsl/provisioner';

let windowsRuntime: WindowsWslRuntimeExecution | null = null;

export function initializeWindowsWslRuntime(options: {
  platform?: NodeJS.Platform;
  resourcesPath: string;
  userDataPath: string;
  onProgress?: (progress: WindowsWslProvisioningProgress) => void;
}): WindowsWslRuntimeExecution | null {
  const platform = options.platform ?? process.platform;
  if (platform !== 'win32') {
    windowsRuntime = null;
    return null;
  }
  windowsRuntime = new WindowsWslRuntimeExecution({ ...options, platform });
  return windowsRuntime;
}

export function getWindowsWslRuntime(): WindowsWslRuntimeExecution | null {
  return windowsRuntime;
}

export function requireWindowsWslRuntime(): WindowsWslRuntimeExecution {
  if (!windowsRuntime) throw new Error('Windows WSL runtime was not initialized.');
  return windowsRuntime;
}

export type { WindowsWslProcessHandle, WindowsWslProgram, WindowsWslSpawnRequest } from './windowsWslRuntimeExecution';
export { WindowsWslRuntimeExecution } from './windowsWslRuntimeExecution';
