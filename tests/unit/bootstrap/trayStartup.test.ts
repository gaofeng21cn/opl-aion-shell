/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { initializeTrayForDesktopMode } from '@/process/startup/runtime/trayStartup';

describe('initializeTrayForDesktopMode', () => {
  it('creates the tray by default while preserving the saved close-to-tray behavior', async () => {
    const setCloseToTrayEnabled = vi.fn();
    const createOrUpdateTray = vi.fn();
    const destroyTray = vi.fn();

    await initializeTrayForDesktopMode({
      isE2ETestMode: false,
      readCloseToTray: async () => false,
      setCloseToTrayEnabled,
      createOrUpdateTray,
      destroyTray,
    });

    expect(setCloseToTrayEnabled).toHaveBeenCalledWith(false);
    expect(createOrUpdateTray).toHaveBeenCalledTimes(1);
    expect(destroyTray).not.toHaveBeenCalled();
  });

  it('keeps E2E mode tray-free', async () => {
    const setCloseToTrayEnabled = vi.fn();
    const createOrUpdateTray = vi.fn();
    const destroyTray = vi.fn();

    await initializeTrayForDesktopMode({
      isE2ETestMode: true,
      readCloseToTray: async () => true,
      setCloseToTrayEnabled,
      createOrUpdateTray,
      destroyTray,
    });

    expect(setCloseToTrayEnabled).toHaveBeenCalledWith(false);
    expect(destroyTray).toHaveBeenCalledTimes(1);
    expect(createOrUpdateTray).not.toHaveBeenCalled();
  });
});
