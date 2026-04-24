#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function hasFlag(flags, ...candidates) {
  return candidates.some((flag) => flags.has(flag));
}

export function resolveLaunchExtensionsPath(projectRoot, flags, options = {}) {
  const allowLegacyExtensionsFlag = options.allowLegacyExtensionsFlag ?? false;
  const useExamples = allowLegacyExtensionsFlag
    ? hasFlag(flags, '--examples', '--extensions')
    : hasFlag(flags, '--examples');
  const useOpl = hasFlag(flags, '--opl');

  if (useExamples && useOpl) {
    throw new Error('Choose either --examples or --opl, not both.');
  }

  if (useOpl) {
    return path.join(projectRoot, 'examples', 'opl-acp-adapter-extension');
  }

  if (useExamples) {
    return path.join(projectRoot, 'examples');
  }

  return null;
}

export function resolveOplWorkspaceRoot(projectRoot) {
  const envOverride = process.env.OPL_ACP_WORKSPACE_ROOT;
  if (envOverride) {
    return fs.existsSync(path.join(envOverride, 'src', 'cli.ts')) ? envOverride : null;
  }

  const candidates = [
    path.resolve(projectRoot, '../../one-person-lab'),
    path.resolve(projectRoot, '../one-person-lab'),
    path.resolve(projectRoot, 'one-person-lab'),
    '/Users/gaofeng/workspace/one-person-lab',
  ];

  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'src', 'cli.ts'))) ?? null;
}

export function buildLaunchEnv(projectRoot, flags, options = {}) {
  const env = {
    ...process.env,
  };
  const extensionsPath = resolveLaunchExtensionsPath(projectRoot, flags, options);

  if (extensionsPath) {
    env.AIONUI_EXTENSIONS_PATH = extensionsPath;
  } else {
    delete env.AIONUI_EXTENSIONS_PATH;
  }

  if (hasFlag(flags, '--opl')) {
    const oplWorkspaceRoot = resolveOplWorkspaceRoot(projectRoot);
    if (!oplWorkspaceRoot) {
      throw new Error('Failed to resolve one-person-lab workspace root for the OPL GUI shell bridge (Codex-default runtime).');
    }

    env.OPL_ACP_BRIDGE_CMD = env.OPL_ACP_BRIDGE_CMD || process.execPath;
    env.OPL_ACP_BRIDGE_ENTRY = env.OPL_ACP_BRIDGE_ENTRY || path.join(oplWorkspaceRoot, 'src', 'cli.ts');
  }

  return env;
}
