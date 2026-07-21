import { describe, expect, it, vi } from 'vitest';
import { applyAppLogDirectoryUpdate } from '@/process/services/appLogDirectory';

const currentDirectories = {
  cacheDir: '/Users/example/Library/Application Support/One Person Lab/config',
  workDir: '/Users/example/Library/Application Support/One Person Lab',
  logDir: '/Users/example/Library/Logs/One Person Lab App',
};

describe('App log directory update', () => {
  it('persists the host path before switching the active log writer', async () => {
    const persistDirectories = vi.fn().mockResolvedValue(undefined);
    const setLogRoot = vi.fn();

    const result = await applyAppLogDirectoryUpdate('/Users/example/OPL Logs', {
      getDirectories: () => currentDirectories,
      resolvePath: (value) => value,
      persistDirectories,
      setLogRoot,
    });

    expect(persistDirectories).toHaveBeenCalledWith({
      cacheDir: currentDirectories.cacheDir,
      workDir: currentDirectories.workDir,
      logDir: '/Users/example/OPL Logs',
    });
    expect(setLogRoot).toHaveBeenCalledWith('/Users/example/OPL Logs');
    expect(result).toEqual({
      schema: 'opl_app_log_directory_update.v1',
      hostLogDir: '/Users/example/OPL Logs',
    });
  });

  it('restores the previous host directory when switching the active log writer fails', async () => {
    const persistDirectories = vi.fn().mockResolvedValue(undefined);
    const setLogRoot = vi.fn((logDir: string) => {
      if (logDir === '/Users/example/Broken Logs') throw new Error('writer rejected path');
    });

    await expect(
      applyAppLogDirectoryUpdate('/Users/example/Broken Logs', {
        getDirectories: () => currentDirectories,
        resolvePath: (value) => value,
        persistDirectories,
        setLogRoot,
      })
    ).rejects.toThrow('writer rejected path');

    expect(persistDirectories).toHaveBeenCalledTimes(2);
    expect(persistDirectories).toHaveBeenLastCalledWith({
      cacheDir: currentDirectories.cacheDir,
      workDir: currentDirectories.workDir,
      logDir: currentDirectories.logDir,
    });
    expect(setLogRoot).toHaveBeenLastCalledWith(currentDirectories.logDir);
  });
});
