/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Theme, ThemeAppearance, ThemeAppearanceMode } from './types';
import { LIGHT_THEME_ID } from './constants';

export function normalizeThemeAppearanceMode(
  value: unknown,
  fallback: ThemeAppearanceMode = 'system'
): ThemeAppearanceMode {
  return value === 'system' || value === 'light' || value === 'dark' ? value : fallback;
}

export function resolveThemeAppearance(mode: ThemeAppearanceMode, prefersDark?: boolean): ThemeAppearance {
  return mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
}

/**
 * Pure: caller supplies the full preset list (builtins + user). Falls back to the
 * default preset, then first. Appearance is applied independently when a mode is supplied.
 */
export function resolveActiveTheme(
  activeId: string,
  themes: Theme[],
  appearanceMode?: ThemeAppearanceMode,
  prefersDark?: boolean
): Theme {
  const preset =
    themes.find((theme) => theme.id === activeId) ?? themes.find((theme) => theme.id === LIGHT_THEME_ID) ?? themes[0];
  if (!appearanceMode) return preset;
  const appearance = resolveThemeAppearance(appearanceMode, prefersDark);
  return preset.appearance === appearance ? preset : { ...preset, appearance };
}
