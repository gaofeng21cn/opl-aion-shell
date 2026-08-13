/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { BrowserWindow, dialog } from 'electron';
import { ipcBridge } from '@/common';
import { getWindowsWslRuntime } from '@/process/services/runtime-execution';

function assertWorkspacePathProjection(hostPath: string, runtimePath: string): void {
  if (!hostPath || !(path.isAbsolute(hostPath) || path.win32.isAbsolute(hostPath))) {
    throw new Error('The selected workspace host path must be absolute.');
  }
  if (!runtimePath || !path.posix.isAbsolute(runtimePath)) {
    throw new Error('The selected workspace runtime path must be absolute.');
  }
}

export function initDialogBridge(): void {
  ipcBridge.dialog.showOpen.provider((options) => {
    // Get the focused window or the first available window as parent
    // This ensures the dialog appears in front on Windows and has proper modal behavior
    const parentWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const dialogOptions = {
      defaultPath: options?.defaultPath,
      properties: options?.properties,
    };

    const showDialogPromise = parentWindow
      ? dialog.showOpenDialog(parentWindow, dialogOptions)
      : dialog.showOpenDialog(dialogOptions);

    return showDialogPromise.then((res) => {
      return res.filePaths;
    });
  });

  ipcBridge.dialog.showWorkspace.provider(async (options) => {
    const parentWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const dialogOptions = {
      defaultPath: options?.defaultPath,
      properties: options?.properties ?? ['openDirectory', 'createDirectory'],
    };
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);
    const hostPath = result.filePaths[0];
    if (!hostPath) return undefined;

    const runtime = getWindowsWslRuntime();
    if (process.platform === 'win32' && !runtime) {
      throw new Error('The OPL Linux runtime is not initialized; workspace selection is unavailable.');
    }
    const runtimePath = runtime ? await runtime.projectWorkspacePath(hostPath) : hostPath;
    assertWorkspacePathProjection(hostPath, runtimePath);
    return { host_path: hostPath, runtime_path: runtimePath };
  });
}
