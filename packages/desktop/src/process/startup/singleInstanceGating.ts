/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** Only the process holding Electron's single-instance lock may start aioncore. */
export function shouldRegisterBackendStartup(gotTheLock: boolean): boolean {
  return gotTheLock === true;
}
