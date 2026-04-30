import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

type AsarCommand = {
  readonly label: string;
  readonly cmd: string;
  readonly args: string[];
};

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function buildAsarCommands(asarPath: string): AsarCommand[] {
  const commands: AsarCommand[] = [];
  const localBinName = process.platform === 'win32' ? 'asar.cmd' : 'asar';
  const localAsar = path.resolve(__dirname, '../../../node_modules/.bin', localBinName);

  if (fs.existsSync(localAsar)) {
    commands.push({ label: 'local asar', cmd: localAsar, args: ['list', asarPath] });
  }

  if (process.platform === 'win32') {
    commands.push({ label: 'bunx', cmd: 'bunx.cmd', args: ['asar', 'list', asarPath] });
    commands.push({ label: 'npx', cmd: 'npx.cmd', args: ['--yes', 'asar', 'list', asarPath] });
  } else {
    commands.push({ label: 'bunx', cmd: 'bunx', args: ['asar', 'list', asarPath] });
    commands.push({ label: 'npx', cmd: 'npx', args: ['--yes', 'asar', 'list', asarPath] });
  }

  return commands;
}

function formatExecFailure(error: unknown): string {
  const err = error as {
    readonly message?: string;
    readonly status?: number;
    readonly stderr?: Buffer | string;
  };
  const stderr = Buffer.isBuffer(err.stderr) ? err.stderr.toString('utf8') : err.stderr;
  const parts = [err.message, err.status === undefined ? null : `status=${err.status}`, stderr?.trim()]
    .filter(Boolean)
    .join('; ');

  return parts || 'unknown error';
}

export function getAsarEntries(asarPath: string): Set<string> {
  const failures: string[] = [];

  for (const candidate of buildAsarCommands(asarPath)) {
    try {
      const output = execFileSync(candidate.cmd, candidate.args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        maxBuffer: 20 * 1024 * 1024,
      });

      if (!output.trim()) {
        failures.push(`${candidate.label}: empty output`);
        continue;
      }

      return new Set(
        output
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => toPosixPath(line).replace(/^\//, ''))
      );
    } catch (error) {
      failures.push(`${candidate.label}: ${formatExecFailure(error)}`);
    }
  }

  throw new Error(`Failed to list app.asar entries. Tried ${failures.join(' | ')}`);
}
