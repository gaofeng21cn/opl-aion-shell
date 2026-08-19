/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { initApplicationBridge } from './applicationBridge';
import { initDialogBridge } from './dialogBridge';
import { initUpdateBridge } from './updateBridge';
import { initSystemSettingsBridge } from './systemSettingsBridge';
import { initWindowControlsBridge } from './windowControlsBridge';
import { initNotificationBridge } from './notificationBridge';
import { initWebuiBridge } from './webuiBridge';
import { initOplRuntimeBridge } from './oplRuntimeBridge';
import { initThemeBridge } from './themeBridge';
import { initLocalDataLifecycleBridge } from './localDataLifecycleBridge';
import { disposeCodexAppServerBridge, initCodexAppServerBridge } from './codexAppServerBridge';
import type { CodexAppServerAdapter } from '../services/codexAppServer/adapter';
import { initGitWorkspaceBridge, type GitWorkspacePort } from '../services/git-workspace';
import { disposeRemoteCompanionBridge, initRemoteCompanionBridge } from './remoteCompanionBridge';
import { resolveActiveOplFrameworkPackageRoot } from './oplRuntimeBridge';
import { initRemoteCompanionConnectorHost } from '../services/remote-companion/remoteCompanionConnectorHost';

export type BridgeDependencies = {
  gitWorkspacePort?: GitWorkspacePort;
  codexAppServerAdapter?: CodexAppServerAdapter;
};

export function initAllBridges(deps: BridgeDependencies = {}): void {
  initDialogBridge();
  initApplicationBridge();
  initWindowControlsBridge();
  initUpdateBridge();
  initSystemSettingsBridge();
  initNotificationBridge();
  initWebuiBridge();
  initOplRuntimeBridge();
  initThemeBridge();
  initLocalDataLifecycleBridge();
  initGitWorkspaceBridge(deps.gitWorkspacePort);
  initCodexAppServerBridge(deps.codexAppServerAdapter);
  let frameworkPackageRoot: string | null = null;
  try {
    frameworkPackageRoot = resolveActiveOplFrameworkPackageRoot();
  } catch (error) {
    console.warn(
      `[AionUi:remote-companion] Framework carrier unavailable: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  initRemoteCompanionConnectorHost({ frameworkPackageRoot });
  initRemoteCompanionBridge();
}

export {
  initApplicationBridge,
  initDialogBridge,
  initNotificationBridge,
  initSystemSettingsBridge,
  initThemeBridge,
  initUpdateBridge,
  initWindowControlsBridge,
  initWebuiBridge,
  initOplRuntimeBridge,
  initLocalDataLifecycleBridge,
  initGitWorkspaceBridge,
  initCodexAppServerBridge,
  initRemoteCompanionBridge,
  disposeRemoteCompanionBridge,
  disposeCodexAppServerBridge,
};
export { registerWindowMaximizeListeners } from './windowControlsBridge';
export const disposeAllTeamSessions = (): Promise<void> => Promise.resolve();
