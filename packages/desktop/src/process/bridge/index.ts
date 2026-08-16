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
