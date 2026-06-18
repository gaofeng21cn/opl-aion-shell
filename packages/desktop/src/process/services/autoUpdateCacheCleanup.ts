/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const UPDATE_METADATA_FILE = 'update-info.json';
const UPDATE_PACKAGE_EXTENSIONS = new Set(['.zip', '.dmg', '.exe', '.deb']);
const UPDATE_PACKAGE_NAMES = new Set(['update.zip']);

export type AutoUpdateCacheCleanupOptions = {
  cacheRoot: string;
  keepPaths?: string[];
};

export type AutoUpdateCacheCleanupPlan = {
  cacheRoot: string;
  keepPaths: string[];
  removePaths: string[];
};

export type AutoUpdateCacheCleanupResult = {
  cacheRoot: string;
  removedBytes: number;
  removedFiles: string[];
};

export type DefaultAutoUpdateCacheRootOptions = {
  appCacheDirName: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  homeDir?: string;
  platform?: NodeJS.Platform;
};

export function getDefaultAutoUpdateCacheRoot(options: DefaultAutoUpdateCacheRootOptions): string {
  const platform = options.platform ?? process.platform;
  const homeDir = options.homeDir ?? os.homedir();
  const env = options.env ?? process.env;

  if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Caches', options.appCacheDirName);
  }
  if (platform === 'win32') {
    return path.join(env.LOCALAPPDATA || env.APPDATA || path.join(homeDir, 'AppData', 'Local'), options.appCacheDirName);
  }
  return path.join(env.XDG_CACHE_HOME || path.join(homeDir, '.cache'), options.appCacheDirName);
}

function normalizeInsideRoot(root: string, candidate: string): string | null {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relativePath = path.relative(resolvedRoot, resolvedCandidate);
  if (relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))) {
    return resolvedCandidate;
  }
  return null;
}

function resolvePathInsideRoot(root: string, candidate: string, relativeBase: string): string | null {
  const candidatePath = path.isAbsolute(candidate) ? candidate : path.join(relativeBase, candidate);
  return normalizeInsideRoot(root, candidatePath);
}

function readPendingUpdatePackages(cacheRoot: string): string[] {
  const metadataPath = path.join(cacheRoot, 'pending', UPDATE_METADATA_FILE);
  try {
    const parsed = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as Record<string, unknown>;
    const pendingPackages = new Set<string>();
    if (typeof parsed.fileName === 'string') {
      const pendingPackage = resolvePathInsideRoot(cacheRoot, parsed.fileName, path.join(cacheRoot, 'pending'));
      if (pendingPackage) pendingPackages.add(pendingPackage);
    }

    for (const key of ['filePath', 'file_path', 'path']) {
      const rawPath = parsed[key];
      if (typeof rawPath !== 'string') continue;
      const pendingPackage = resolvePathInsideRoot(cacheRoot, rawPath, cacheRoot);
      if (pendingPackage) pendingPackages.add(pendingPackage);
    }

    return [...pendingPackages];
  } catch {
    return [];
  }
}

function listFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return listFiles(entryPath);
    }
    return entry.isFile() ? [entryPath] : [];
  });
}

function isUpdatePackage(filePath: string): boolean {
  return UPDATE_PACKAGE_NAMES.has(path.basename(filePath)) || UPDATE_PACKAGE_EXTENSIONS.has(path.extname(filePath));
}

export function resolveAutoUpdateCacheCleanupPlan(
  options: AutoUpdateCacheCleanupOptions
): AutoUpdateCacheCleanupPlan {
  const cacheRoot = path.resolve(options.cacheRoot);
  const protectedPaths = new Set<string>();
  protectedPaths.add(path.join(cacheRoot, 'pending', UPDATE_METADATA_FILE));

  for (const pendingPackage of readPendingUpdatePackages(cacheRoot)) {
    protectedPaths.add(pendingPackage);
  }

  for (const keepPath of options.keepPaths ?? []) {
    const insidePath = resolvePathInsideRoot(cacheRoot, keepPath, cacheRoot);
    if (insidePath) {
      protectedPaths.add(insidePath);
    }
  }

  const removePaths = listFiles(cacheRoot)
    .map((filePath) => path.resolve(filePath))
    .filter((filePath) => isUpdatePackage(filePath) && !protectedPaths.has(filePath));

  return {
    cacheRoot,
    keepPaths: [...protectedPaths],
    removePaths,
  };
}

export function cleanupAutoUpdateCache(options: AutoUpdateCacheCleanupOptions): AutoUpdateCacheCleanupResult {
  const plan = resolveAutoUpdateCacheCleanupPlan(options);
  const removedFiles: string[] = [];
  let removedBytes = 0;

  for (const filePath of plan.removePaths) {
    try {
      const stat = fs.statSync(filePath);
      fs.rmSync(filePath, { force: true });
      removedFiles.push(filePath);
      removedBytes += stat.size;
    } catch {
      // Cache cleanup must never block startup or updater installation.
    }
  }

  return {
    cacheRoot: plan.cacheRoot,
    removedBytes,
    removedFiles,
  };
}
