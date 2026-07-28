import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveHostRuntimeRoots } from '@/process/services/localDataLifecycle/hostRuntimeRoots';

describe('host runtime roots', () => {
  it('keeps the managed OPL Linux runtime outside the Windows host filesystem inventory', () => {
    expect(
      resolveHostRuntimeRoots({
        platform: 'win32',
        shellToolchainRuntimeRoot: 'C:\\Users\\opl\\AppData\\Roaming\\OPL\\runtime',
        configuredManagedRuntimeRoot: 'C:\\forbidden-native-runtime',
      })
    ).toEqual({
      inventoryRoots: ['C:\\Users\\opl\\AppData\\Roaming\\OPL\\runtime'],
      managedRuntimeRoot: null,
      pruneRoot: 'C:\\Users\\opl\\AppData\\Roaming\\OPL\\runtime',
    });
  });

  it('preserves the default macOS managed runtime root', () => {
    const homeDir = path.join(path.sep, 'Users', 'opl');
    const shellRoot = path.join(homeDir, 'Library', 'Application Support', 'AionUi', 'runtime');
    const managedRoot = path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime');

    expect(
      resolveHostRuntimeRoots({
        platform: 'darwin',
        shellToolchainRuntimeRoot: shellRoot,
        homeDir,
      })
    ).toEqual({
      inventoryRoots: [shellRoot, managedRoot],
      managedRuntimeRoot: managedRoot,
      pruneRoot: managedRoot,
    });
  });

  it('uses one explicit managed runtime root on other hosts', () => {
    expect(
      resolveHostRuntimeRoots({
        platform: 'linux',
        shellToolchainRuntimeRoot: '/tmp/aionui/runtime',
        configuredManagedRuntimeRoot: ' /opt/opl/runtime ',
      })
    ).toEqual({
      inventoryRoots: ['/tmp/aionui/runtime', '/opt/opl/runtime'],
      managedRuntimeRoot: '/opt/opl/runtime',
      pruneRoot: '/opt/opl/runtime',
    });
  });

  it('fails closed on unsupported hosts without an owner-provided managed root', () => {
    expect(() =>
      resolveHostRuntimeRoots({
        platform: 'linux',
        shellToolchainRuntimeRoot: '/tmp/aionui/runtime',
      })
    ).toThrow('OPL_RUNTIME_TOOLCHAIN_ROOT is required outside the macOS desktop release.');
  });
});
