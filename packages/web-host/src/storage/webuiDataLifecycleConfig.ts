import path from 'node:path';

import type { WebuiDataLifecycleHostConfig, WebuiDataLifecycleManagedRoot } from '../types.js';

type DefaultWebuiDataLifecycleConfigInput = {
  dataDir: string;
  projectsDir?: string;
  logDir: string;
  recoveryRoot: string;
};

/** Keep lifecycle recovery outside App data unless the deployment supplies an explicit owner root. */
export function resolveWebuiDataLifecycleRecoveryRoot(dataDir: string, override?: string): string {
  if (override?.trim()) return path.resolve(override);
  const resolvedDataDir = path.resolve(dataDir);
  return path.join(path.dirname(resolvedDataDir), `${path.basename(resolvedDataDir)}-recovery`);
}

function isSameOrInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/** Build the narrow carrier-owned cleanup surface; ordinary App and project data are never included. */
export function buildDefaultWebuiDataLifecycleConfig(
  input: DefaultWebuiDataLifecycleConfigInput
): WebuiDataLifecycleHostConfig {
  const dataDir = path.resolve(input.dataDir);
  const logDir = path.resolve(input.logDir);
  const managedRoots: WebuiDataLifecycleManagedRoot[] = [
    { id: 'webui_cache', kind: 'cache', path: path.join(dataDir, 'cache') },
    { id: 'webui_temporary', kind: 'temporary', path: path.join(dataDir, 'temp') },
  ];
  const rotatedLogs = path.join(logDir, 'rotated');
  if (isSameOrInside(dataDir, rotatedLogs) && !managedRoots.some((root) => isSameOrInside(root.path, rotatedLogs))) {
    managedRoots.push({ id: 'webui_rotated_logs', kind: 'rotated_log', path: rotatedLogs });
  }
  return {
    dataDir,
    projectsDir: input.projectsDir,
    recoveryRoot: input.recoveryRoot,
    managedRoots,
  };
}
