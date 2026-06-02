/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

type TrayStartupDeps = {
  isE2ETestMode: boolean;
  readCloseToTray: () => Promise<boolean | undefined>;
  setCloseToTrayEnabled: (enabled: boolean) => void;
  createOrUpdateTray: () => void;
  destroyTray: () => void;
};

export async function initializeTrayForDesktopMode(deps: TrayStartupDeps): Promise<void> {
  if (deps.isE2ETestMode) {
    deps.setCloseToTrayEnabled(false);
    deps.destroyTray();
    return;
  }

  try {
    deps.setCloseToTrayEnabled((await deps.readCloseToTray()) ?? false);
  } catch {
    deps.setCloseToTrayEnabled(false);
  }

  deps.createOrUpdateTray();
}
