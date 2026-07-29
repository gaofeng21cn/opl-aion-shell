/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export function shouldQuitAfterAllWindowsClosed(input: {
  appReadyDone: boolean;
  closeToTrayEnabled: boolean;
  isWebUIMode: boolean;
  platform: NodeJS.Platform;
}): boolean {
  if (!input.appReadyDone) return false;
  if (input.closeToTrayEnabled) return false;
  return !input.isWebUIMode && input.platform !== 'darwin';
}
