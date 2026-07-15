/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import { reapplyConfiguredTheme } from './applyTheme';
import { watchSystemPrefersDark } from './systemAppearance';

/**
 * While System appearance is selected, re-resolve the current preset whenever the
 * OS appearance changes and broadcast the effective theme to all windows.
 */
export function startSystemThemeWatcher(): () => void {
  return watchSystemPrefersDark(() => {
    if (configService.get('theme.appearanceMode') !== 'system') return;
    void reapplyConfiguredTheme().catch((e) => console.error('re-apply system theme failed', e));
  });
}
