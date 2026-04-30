/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Platform-agnostic application bridge handlers.
 * Safe to use in both Electron and standalone server mode.
 * Electron-only handlers (restart, devtools, zoom, CDP) remain in applicationBridge.ts.
 */
import os from 'os';
import path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { ipcBridge } from '@/common';
import { getSystemDir, ProcessEnv } from '@process/utils/initStorage';
import { copyDirectoryRecursively, getConfigPath, getDataPath, resolveCliSafePath } from '@process/utils';

const DEFAULT_OPL_VERSION = '26.4.27';

type AppPackageMetadata = {
  version?: string;
  oplGuiVersion?: string;
};

function readAppPackageMetadata(): AppPackageMetadata | null {
  try {
    const raw = fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as AppPackageMetadata) : null;
  } catch {
    return null;
  }
}

function resolveAppVersions() {
  const metadata = readAppPackageMetadata();
  const envOplVersion = process.env.OPL_RELEASE_VERSION?.trim();
  const envGuiVersion = process.env.OPL_GUI_VERSION?.trim();
  const packagedOplVersion = metadata?.oplGuiVersion ? metadata.version?.trim() : null;
  const guiVersion = envGuiVersion || metadata?.oplGuiVersion?.trim() || metadata?.version?.trim() || app.getVersion();

  return {
    oplVersion: envOplVersion || packagedOplVersion || DEFAULT_OPL_VERSION,
    guiVersion,
  };
}

export function initApplicationBridgeCore(): void {
  ipcBridge.application.systemInfo.provider(() => {
    return Promise.resolve(getSystemDir());
  });

  ipcBridge.application.appVersions.provider(() => {
    const versions = resolveAppVersions();
    return Promise.resolve({
      oplVersion: versions.oplVersion,
      guiVersion: versions.guiVersion,
      releaseRepo:
        process.env.OPL_RELEASE_REPO?.trim() || process.env.OPL_GITHUB_REPO?.trim() || 'gaofeng21cn/one-person-lab',
      releaseChannel: process.env.OPL_RELEASE_CHANNEL?.trim() || 'stable',
    });
  });

  ipcBridge.application.updateSystemInfo.provider(async ({ cacheDir, workDir }) => {
    try {
      // Normalize paths: if the user picked a real path that matches a CLI-safe
      // symlink target (e.g. macOS file picker resolves symlinks), restore the
      // symlink path to avoid storing paths with spaces.
      const safeCacheDir = resolveCliSafePath(cacheDir, getConfigPath());
      const safeWorkDir = resolveCliSafePath(workDir, getDataPath());

      const oldDir = getSystemDir();
      if (oldDir.cacheDir !== safeCacheDir) {
        await copyDirectoryRecursively(oldDir.cacheDir, safeCacheDir);
      }
      await ProcessEnv.set('opl.dir', { cacheDir: safeCacheDir, workDir: safeWorkDir });
      return { success: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, msg };
    }
  });

  ipcBridge.application.getPath.provider(({ name }) => {
    // Resolve common paths without Electron
    const home = os.homedir();
    const map: Record<string, string> = {
      home,
      desktop: path.join(home, 'Desktop'),
      downloads: path.join(home, 'Downloads'),
    };
    return Promise.resolve(map[name] ?? home);
  });
}
