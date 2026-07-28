import * as path from 'node:path';

export type HostRuntimeRoots = {
  inventoryRoots: string[];
  managedRuntimeRoot: string | null;
  pruneRoot: string;
};

export function resolveHostRuntimeRoots(options: {
  platform: NodeJS.Platform;
  shellToolchainRuntimeRoot: string;
  configuredManagedRuntimeRoot?: string;
  homeDir?: string;
}): HostRuntimeRoots {
  const shellToolchainRuntimeRoot = options.shellToolchainRuntimeRoot;

  if (options.platform === 'win32') {
    return {
      inventoryRoots: [shellToolchainRuntimeRoot],
      managedRuntimeRoot: null,
      pruneRoot: shellToolchainRuntimeRoot,
    };
  }

  const configuredManagedRuntimeRoot = options.configuredManagedRuntimeRoot?.trim();
  const managedRuntimeRoot =
    configuredManagedRuntimeRoot ||
    (options.platform === 'darwin' && options.homeDir
      ? path.join(options.homeDir, 'Library', 'Application Support', 'OPL', 'runtime')
      : null);
  if (!managedRuntimeRoot) {
    throw new Error('OPL_RUNTIME_TOOLCHAIN_ROOT is required outside the macOS desktop release.');
  }

  return {
    inventoryRoots: [...new Set([shellToolchainRuntimeRoot, managedRuntimeRoot])],
    managedRuntimeRoot,
    pruneRoot: managedRuntimeRoot,
  };
}
