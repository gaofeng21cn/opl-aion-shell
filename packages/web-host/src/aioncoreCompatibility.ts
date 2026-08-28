import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

const MIN_RECOVERY_VERSION = [0, 1, 44] as const;
const RECOVERY_OPTION = '--recover-corrupted-database';

type ProbeRunner = (binaryPath: string, args: readonly string[]) => string;

type ProjectBindingRepairRunner = (binaryPath: string, args: readonly string[]) => string;

export type ManagedWorkspaceProjectBindingRepairResult = {
  status: 'database_absent' | 'schema_not_ready' | 'repaired';
  repairedBindings: number;
};

type ManagedResourcesManifest = {
  node?: {
    root?: unknown;
    executable?: unknown;
  };
};

const AIONCORE_DATABASE_NAME = 'aionui-backend.db';
const PROJECT_BINDING_REPAIR_TIMEOUT_MS = 15_000;

const STALE_PROJECT_BINDING_REPAIR_SCRIPT = String.raw`
const { DatabaseSync } = require('node:sqlite');

const [databasePath] = process.argv.slice(1);
const database = new DatabaseSync(databasePath);

function hasColumns(tableName, requiredColumns) {
  const rows = database.prepare('PRAGMA table_info(' + tableName + ')').all();
  const columns = new Set(rows.map((row) => row.name));
  return requiredColumns.every((column) => columns.has(column));
}

try {
  database.exec('PRAGMA busy_timeout = 5000');
  const schemaReady =
    hasColumns('conversations', ['user_id', 'project_id', 'folder_id', 'extra']) &&
    hasColumns('projects', ['project_id', 'user_id']);

  if (!schemaReady) {
    process.stdout.write(JSON.stringify({ status: 'schema_not_ready', repairedBindings: 0 }));
  } else {
    database.exec('BEGIN IMMEDIATE');
    try {
      // Invocation is already limited to managed WebUI. The owner-scoped
      // Project row, not legacy extra.workspace metadata, decides validity.
      const result = database
        .prepare([
          'UPDATE conversations AS c',
          'SET project_id = NULL, folder_id = NULL',
          'WHERE c.project_id IS NOT NULL',
          "  AND trim(c.project_id) <> ''",
          '  AND NOT EXISTS (',
          '    SELECT 1',
          '    FROM projects p',
          '    WHERE p.project_id = c.project_id',
          '      AND p.user_id = c.user_id',
          '  )',
        ].join('\n'))
        .run();
      database.exec('COMMIT');
      process.stdout.write(JSON.stringify({ status: 'repaired', repairedBindings: Number(result.changes) }));
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
} finally {
  database.close();
}
`;

function runProbe(binaryPath: string, args: readonly string[]): string {
  return execFileSync(binaryPath, [...args], { encoding: 'utf-8', timeout: 15_000 });
}

function runProjectBindingRepair(binaryPath: string, args: readonly string[]): string {
  return execFileSync(binaryPath, [...args], {
    encoding: 'utf-8',
    timeout: PROJECT_BINDING_REPAIR_TIMEOUT_MS,
  });
}

function isPathInside(candidatePath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function readManagedNodePath(aioncoreBinaryPath: string): string {
  const managedResourcesPath = path.join(path.dirname(aioncoreBinaryPath), 'managed-resources');
  const manifestPath = path.join(managedResourcesPath, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ManagedResourcesManifest;
  const nodeRoot = manifest.node?.root;
  const nodeExecutable = manifest.node?.executable;
  if (typeof nodeRoot !== 'string' || !nodeRoot || typeof nodeExecutable !== 'string' || !nodeExecutable) {
    throw new Error(`AionCore managed Node manifest is invalid: ${manifestPath}`);
  }

  const nodePath = path.resolve(managedResourcesPath, nodeRoot, nodeExecutable);
  if (!isPathInside(nodePath, managedResourcesPath) || !existsSync(nodePath)) {
    throw new Error(`AionCore managed Node executable is invalid: ${nodePath}`);
  }

  const managedResourcesRealPath = realpathSync(managedResourcesPath);
  const nodeRealPath = realpathSync(nodePath);
  if (!isPathInside(nodeRealPath, managedResourcesRealPath)) {
    throw new Error(`AionCore managed Node executable escapes managed resources: ${nodePath}`);
  }
  return nodePath;
}

export function repairStaleManagedWorkspaceProjectBindings(
  options: {
    aioncoreBinaryPath: string;
    dataDir: string;
    workspaceRoot: string;
  },
  runner: ProjectBindingRepairRunner = runProjectBindingRepair
): ManagedWorkspaceProjectBindingRepairResult {
  const workspaceRoot = path.normalize(options.workspaceRoot.trim());
  if (!path.isAbsolute(workspaceRoot) || workspaceRoot === path.parse(workspaceRoot).root) {
    throw new Error(`Managed workspace root must be an absolute non-root path: ${options.workspaceRoot}`);
  }

  const databasePath = path.join(options.dataDir, AIONCORE_DATABASE_NAME);
  if (!existsSync(databasePath)) {
    return { status: 'database_absent', repairedBindings: 0 };
  }

  const managedNodePath = readManagedNodePath(options.aioncoreBinaryPath);
  const output = runner(managedNodePath, [
    '--no-warnings',
    '--eval',
    STALE_PROJECT_BINDING_REPAIR_SCRIPT,
    databasePath,
    workspaceRoot,
  ]).trim();

  let result: unknown;
  try {
    result = JSON.parse(output);
  } catch (error) {
    throw new Error(`AionCore stale project binding repair returned invalid JSON: ${output || '<empty>'}`, {
      cause: error,
    });
  }
  const candidate = result as { status?: unknown; repairedBindings?: unknown };
  if (
    !result ||
    typeof result !== 'object' ||
    !['schema_not_ready', 'repaired'].includes(candidate.status as string) ||
    typeof candidate.repairedBindings !== 'number' ||
    !Number.isInteger(candidate.repairedBindings) ||
    candidate.repairedBindings < 0
  ) {
    throw new Error(`AionCore stale project binding repair returned an invalid result: ${output}`);
  }
  return result as ManagedWorkspaceProjectBindingRepairResult;
}

function compareStableVersions(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < 3; index += 1) {
    const delta = left[index] - right[index];
    if (delta !== 0) return delta;
  }
  return 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function assertAioncoreRecoveryCompatibility(
  binaryPath: string,
  probe: ProbeRunner = runProbe
): { version: string } {
  let versionOutput: string;
  let helpOutput: string;

  try {
    versionOutput = probe(binaryPath, ['--version']).trim();
  } catch (error) {
    throw new Error(`AionCore recovery compatibility check failed: --version probe failed: ${errorMessage(error)}`, {
      cause: error,
    });
  }

  const versionMatch = /^aioncore\s+(\d+)\.(\d+)\.(\d+)$/.exec(versionOutput);
  if (!versionMatch) {
    throw new Error(
      `AionCore recovery compatibility check failed: unrecognized --version output: ${versionOutput || '<empty>'}`
    );
  }

  const versionParts = versionMatch.slice(1).map(Number);
  const version = versionParts.join('.');
  if (compareStableVersions(versionParts, MIN_RECOVERY_VERSION) < 0) {
    throw new Error(`AionCore recovery requires AionCore >= 0.1.44, reported ${version}`);
  }

  try {
    helpOutput = probe(binaryPath, ['--help']);
  } catch (error) {
    throw new Error(`AionCore recovery compatibility check failed: --help probe failed: ${errorMessage(error)}`, {
      cause: error,
    });
  }

  if (!helpOutput.includes(RECOVERY_OPTION)) {
    throw new Error(`AionCore recovery compatibility check failed: missing required option ${RECOVERY_OPTION}`);
  }

  return { version };
}
