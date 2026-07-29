/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { shouldQuitAfterAllWindowsClosed } from '@/process/startup/runtime/windowAllClosed';

describe('shouldQuitAfterAllWindowsClosed', () => {
  it('keeps startup alive while a temporary provisioning window closes', () => {
    expect(
      shouldQuitAfterAllWindowsClosed({
        appReadyDone: false,
        closeToTrayEnabled: false,
        isWebUIMode: false,
        platform: 'win32',
      })
    ).toBe(false);
  });

  it('quits a ready Windows desktop after its final window closes', () => {
    expect(
      shouldQuitAfterAllWindowsClosed({
        appReadyDone: true,
        closeToTrayEnabled: false,
        isWebUIMode: false,
        platform: 'win32',
      })
    ).toBe(true);
  });

  it.each([
    { closeToTrayEnabled: true, isWebUIMode: false, platform: 'win32' as const },
    { closeToTrayEnabled: false, isWebUIMode: true, platform: 'win32' as const },
    { closeToTrayEnabled: false, isWebUIMode: false, platform: 'darwin' as const },
  ])('preserves the existing non-quit policy for %o', (policy) => {
    expect(
      shouldQuitAfterAllWindowsClosed({
        appReadyDone: true,
        ...policy,
      })
    ).toBe(false);
  });
});
