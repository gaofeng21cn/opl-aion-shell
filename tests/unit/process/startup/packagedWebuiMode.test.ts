/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  hasGraphicalBrowserSession,
  presentPackagedWebui,
  resolvePackagedWebuiBrowserPolicy,
} from '@/process/startup/runtime/packagedWebuiMode';

const localPackagedInput = {
  allowRemote: false,
  env: {},
  isPackaged: true,
  noOpenFlag: false,
  openFlag: false,
  platform: 'darwin' as const,
};

describe('packaged WebUI browser policy', () => {
  it('opens the browser by default for a local interactive packaged launch', () => {
    expect(resolvePackagedWebuiBrowserPolicy(localPackagedInput)).toEqual({
      openBrowser: true,
      reason: 'default',
    });
  });

  it.each([
    [{ ...localPackagedInput, allowRemote: true }, 'remote'],
    [{ ...localPackagedInput, noOpenFlag: true, openFlag: true }, 'explicit-no-open'],
    [{ ...localPackagedInput, env: { CI: 'true' } }, 'headless'],
    [{ ...localPackagedInput, env: {}, platform: 'linux' as const }, 'headless'],
  ])('keeps %s in URL-only mode', (input, reason) => {
    expect(resolvePackagedWebuiBrowserPolicy(input)).toEqual({
      openBrowser: false,
      reason,
    });
  });

  it('recognizes an interactive Linux graphical session', () => {
    expect(hasGraphicalBrowserSession('linux', { WAYLAND_DISPLAY: 'wayland-0' })).toBe(true);
  });

  it('allows an explicit local --open in development mode', () => {
    expect(
      resolvePackagedWebuiBrowserPolicy({
        ...localPackagedInput,
        isPackaged: false,
        openFlag: true,
      })
    ).toEqual({ openBrowser: true, reason: 'explicit-open' });
  });

  it('prints the URL and opens it without creating or depending on a BrowserWindow', async () => {
    const openExternal = vi.fn(async () => undefined);
    const log = vi.fn();

    const result = await presentPackagedWebui('http://127.0.0.1:25808', localPackagedInput, {
      openExternal,
      log,
      warn: vi.fn(),
    });

    expect(result).toEqual({ opened: true, reason: 'default' });
    expect(openExternal).toHaveBeenCalledWith('http://127.0.0.1:25808');
    expect(log).toHaveBeenCalledWith('[WebUI] URL: http://127.0.0.1:25808');
  });

  it('keeps the server usable when the system browser cannot be opened', async () => {
    const warn = vi.fn();

    const result = await presentPackagedWebui('http://127.0.0.1:25808', localPackagedInput, {
      openExternal: vi.fn(async () => {
        throw new Error('no browser');
      }),
      log: vi.fn(),
      warn,
    });

    expect(result).toEqual({ opened: false, reason: 'open-failed' });
    expect(warn).toHaveBeenCalledWith('[WebUI] Could not open the system browser automatically: no browser');
  });
});
