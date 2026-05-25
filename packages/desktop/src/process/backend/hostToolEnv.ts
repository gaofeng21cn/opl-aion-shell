import fs from 'fs';
import os from 'os';
import path from 'path';

type BuildOplHostToolEnvInput = {
  baseEnv?: NodeJS.ProcessEnv;
  runtimeEnv?: NodeJS.ProcessEnv | null;
  extraPathEntries?: string[];
};

function normalizePathEntries(entries: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of entries) {
    if (!entry) continue;
    for (const part of entry.split(path.delimiter)) {
      const trimmed = part.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      normalized.push(trimmed);
    }
  }
  return normalized;
}

function getCommonHostToolPaths(homeDir: string): string[] {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
    const localAppData = process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    return [
      path.join(appData, 'npm'),
      process.env.NVM_HOME || path.join(appData, 'nvm'),
      process.env.NVM_SYMLINK || path.join(programFiles, 'nodejs'),
      path.join(homeDir, '.volta', 'bin'),
      path.join(localAppData, 'pnpm'),
      path.join(homeDir, '.bun', 'bin'),
      path.join(homeDir, '.local', 'bin'),
    ];
  }

  return [
    path.join(homeDir, '.npm-global', 'bin'),
    ...resolveNvmNodeBins(homeDir),
    path.join(homeDir, '.volta', 'bin'),
    path.join(homeDir, '.fnm', 'aliases', 'default', 'bin'),
    path.join(homeDir, '.bun', 'bin'),
    path.join(homeDir, '.local', 'bin'),
    path.join(homeDir, '.cargo', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ];
}

function resolveNvmNodeBins(homeDir: string): string[] {
  const nvmNodeVersionsDir = path.join(homeDir, '.nvm', 'versions', 'node');
  try {
    return fs
      .readdirSync(nvmNodeVersionsDir)
      .map((version) => path.join(nvmNodeVersionsDir, version, 'bin'))
      .filter((entry) => fs.existsSync(entry))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function buildOplHostToolEnv(input: BuildOplHostToolEnvInput = {}): NodeJS.ProcessEnv {
  const baseEnv = input.baseEnv ?? process.env;
  const runtimeEnv = input.runtimeEnv ?? null;
  const homeDir = baseEnv.HOME || os.homedir();
  const basePathEntries = new Set(normalizePathEntries([baseEnv.PATH]));
  const extraPathEntries = input.extraPathEntries?.filter((entry) => !basePathEntries.has(entry));
  const pathEntries = normalizePathEntries([
    runtimeEnv?.PATH,
    ...(extraPathEntries ?? []),
    ...getCommonHostToolPaths(homeDir),
    baseEnv.PATH,
  ]);

  const mergedEnv = Object.assign({}, baseEnv, runtimeEnv || {});
  return {
    ...mergedEnv,
    PATH: pathEntries.join(path.delimiter),
  };
}
