import type { IAppLogDirectoryUpdateResult } from '@/common/adapter/ipcBridge';
import type { IEnvStorageRefer } from '@/common/config/storage';

type AppDirectoryConfig = IEnvStorageRefer['aionui.dir'];

export type AppLogDirectoryDependencies = {
  getDirectories: () => { cacheDir: string; workDir: string; logDir: string };
  resolvePath: (value: string, fallback: string) => string;
  persistDirectories: (directories: AppDirectoryConfig) => Promise<void>;
  setLogRoot: (logDir: string) => void;
};

const DOCKER_DATA_ROOT = '/data' as const;
const DOCKER_LOG_DIR = '/data/logs' as const;

function directoryConfig(directories: { cacheDir: string; workDir: string }, logDir: string): AppDirectoryConfig {
  return {
    cacheDir: directories.cacheDir,
    workDir: directories.workDir,
    logDir,
    dockerDataRoot: DOCKER_DATA_ROOT,
    dockerLogDir: DOCKER_LOG_DIR,
    dockerLogVolumeSource: logDir,
  };
}

export async function applyAppLogDirectoryUpdate(
  requestedPath: string,
  dependencies: AppLogDirectoryDependencies
): Promise<IAppLogDirectoryUpdateResult> {
  const current = dependencies.getDirectories();
  const nextLogDir = dependencies.resolvePath(requestedPath, current.logDir);
  const previousConfig = directoryConfig(current, current.logDir);
  const nextConfig = directoryConfig(current, nextLogDir);

  await dependencies.persistDirectories(nextConfig);
  try {
    dependencies.setLogRoot(nextLogDir);
  } catch (error) {
    try {
      await dependencies.persistDirectories(previousConfig);
      dependencies.setLogRoot(current.logDir);
    } catch (rollbackError) {
      const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
      throw new Error(`App log directory update failed and rollback also failed: ${rollbackMessage}`);
    }
    throw error;
  }

  return {
    schema: 'opl_app_log_directory_update.v1',
    hostLogDir: nextLogDir,
    dockerVolume: {
      sourcePath: nextLogDir,
      dataRoot: DOCKER_DATA_ROOT,
      logDir: DOCKER_LOG_DIR,
    },
  };
}
