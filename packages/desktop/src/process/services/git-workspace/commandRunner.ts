/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile } from 'node:child_process';
import type { GitWorkspaceErrorCode } from '@/common/types/platform/gitWorkspace';

const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
const MAX_COMMAND_BUFFER_BYTES = 64 * 1024 * 1024;

export const MUTATION_COMMAND_TIMEOUT_MS = 120_000;

export type CommandRunnerOptions = {
  cwd?: string;
  input?: string;
  timeoutMs?: number;
  allowExitCodes?: number[];
};

export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type CommandRunner = (command: string, args: string[], options?: CommandRunnerOptions) => Promise<CommandResult>;

export class CommandExecutionError extends Error {
  readonly command: string;
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly systemCode: string | null;

  constructor(command: string, exitCode: number | null, stderr: string, systemCode: string | null, message?: string) {
    super(message ?? `${command} failed`);
    this.name = 'CommandExecutionError';
    this.command = command;
    this.exitCode = exitCode;
    this.stderr = stderr;
    this.systemCode = systemCode;
  }
}

export const execFileCommand: CommandRunner = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      command,
      args,
      {
        cwd: options.cwd,
        encoding: 'utf8',
        env: {
          ...process.env,
          GH_PROMPT_DISABLED: '1',
          GIT_TERMINAL_PROMPT: '0',
        },
        maxBuffer: MAX_COMMAND_BUFFER_BYTES,
        timeout: options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ stdout, stderr, exitCode: 0 });
          return;
        }

        const exitCode = typeof error.code === 'number' ? error.code : null;
        if (exitCode !== null && options.allowExitCodes?.includes(exitCode)) {
          resolve({ stdout, stderr, exitCode });
          return;
        }

        reject(
          new CommandExecutionError(
            command,
            exitCode,
            stderr,
            typeof error.code === 'string' ? error.code : null,
            error.message
          )
        );
      }
    );

    if (options.input !== undefined) {
      child.stdin?.on('error', () => {});
      child.stdin?.end(options.input);
    }
  });

export class GitWorkspaceAdapterError extends Error {
  readonly code: GitWorkspaceErrorCode;
  readonly detail?: string;

  constructor(code: GitWorkspaceErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'GitWorkspaceAdapterError';
    this.code = code;
    this.detail = detail;
  }
}

function conciseDetail(value: string): string | undefined {
  const normalized = value.trim().replaceAll(/\s+/g, ' ');
  if (!normalized) return undefined;
  return normalized.slice(0, 500);
}

export function commandErrorDetail(error: unknown): string | undefined {
  if (error instanceof CommandExecutionError) {
    return conciseDetail(error.stderr) ?? conciseDetail(error.message);
  }
  return conciseDetail(error instanceof Error ? error.message : String(error));
}
