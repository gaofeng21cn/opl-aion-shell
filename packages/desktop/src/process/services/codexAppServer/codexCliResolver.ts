/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { OplCodexRuntimeError, resolveOplCodexRuntimeIdentityFromEnv } from '../../backend/oplCodexRuntimeIdentity';

type ResolverOptions = {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  platform?: NodeJS.Platform;
  isExecutable?: (candidate: string) => boolean;
};

function executable(candidate: string): boolean {
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

export function resolveCodexCliPath(options: ResolverOptions = {}): string {
  const env = options.env ?? process.env;
  const identity = resolveOplCodexRuntimeIdentityFromEnv(env);
  if (identity) {
    return identity.path;
  }

  const homeDir = options.homeDir ?? os.homedir();
  const platform = options.platform ?? process.platform;
  const isExecutable = options.isExecutable ?? executable;
  const executableName = platform === 'win32' ? 'codex.exe' : 'codex';
  const explicit = [env.OPL_CODEX_BIN, env.CODEX_CLI_PATH, env.CODEX_BIN]
    .map((entry) => entry?.trim())
    .filter((entry): entry is string => Boolean(entry));
  const codexHome = env.CODEX_HOME?.trim() || path.join(homeDir, '.codex');
  const oplManagedRuntime =
    platform === 'darwin'
      ? [path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime', 'current', 'bin', executableName)]
      : [];
  const managed = [
    path.join(codexHome, 'packages', 'standalone', 'current', executableName),
    ...oplManagedRuntime,
    path.join(homeDir, '.local', 'bin', executableName),
  ];
  const fromPath = (env.PATH ?? '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.join(entry, executableName));
  const candidates = [...new Set([...explicit, ...managed, ...fromPath])];
  const resolved = candidates.find(isExecutable);
  if (!resolved) {
    const code = explicit.length > 0 ? 'USER_AGENT_COMMAND_NOT_FOUND' : 'USER_AGENT_NOT_INSTALLED';
    throw new OplCodexRuntimeError(
      code,
      'Codex CLI executable was not found in OPL_CODEX_BIN, CODEX_HOME, OPL runtime, or PATH.'
    );
  }
  return resolved;
}
