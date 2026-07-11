/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Theme } from '@/common/theme/types';
import { LIGHT_THEME_ID, DARK_THEME_ID, CODEX_THEME_ID } from '@/common/theme/constants';
import { defaultThemeCover } from '@renderer/pages/settings/AppearanceSettings/themeCovers';
import oplCodexCss from '@renderer/pages/settings/AppearanceSettings/presets/opl-codex.css?raw';

const T0 = 0;

const decorative = (id: string, name: string, appearance: Theme['appearance'], css: string, cover?: string): Theme => ({
  id,
  name,
  appearance,
  css,
  cover,
  builtin: true,
  created_at: T0,
  updated_at: T0,
});

export const BUILTIN_THEMES: Theme[] = [
  {
    id: LIGHT_THEME_ID,
    name: 'Light',
    appearance: 'light',
    cover: defaultThemeCover,
    builtin: true,
    created_at: T0,
    updated_at: T0,
  },
  { id: DARK_THEME_ID, name: 'Dark', appearance: 'dark', builtin: true, created_at: T0, updated_at: T0 },
  decorative(CODEX_THEME_ID, 'Codex', 'light', oplCodexCss),
];

export const BUILTIN_THEME_IDS = new Set(BUILTIN_THEMES.map((t) => t.id));
