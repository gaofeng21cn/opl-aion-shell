import { execFileSync } from 'node:child_process';

const MIN_RECOVERY_VERSION = [0, 1, 44] as const;
const RECOVERY_OPTION = '--recover-corrupted-database';

type ProbeRunner = (binaryPath: string, args: readonly string[]) => string;

function runProbe(binaryPath: string, args: readonly string[]): string {
  return execFileSync(binaryPath, [...args], { encoding: 'utf-8', timeout: 15_000 });
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
