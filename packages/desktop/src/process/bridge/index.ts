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
import { disposeThreadCoordinationBridge, initThreadCoordinationBridge } from './threadCoordinationBridge';
import type { CodexThreadCoordinationPort } from '../services/threadCoordination';
import { initGitWorkspaceBridge, type GitWorkspacePort } from '../services/git-workspace';

export type BridgeDependencies = {
  gitWorkspacePort?: GitWorkspacePort;
  threadCoordinationPort?: CodexThreadCoordinationPort;
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
  initThreadCoordinationBridge(deps.threadCoordinationPort);
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
  initThreadCoordinationBridge,
  disposeThreadCoordinationBridge,
};
export { registerWindowMaximizeListeners } from './windowControlsBridge';
export const disposeAllTeamSessions = (): Promise<void> => Promise.resolve();
