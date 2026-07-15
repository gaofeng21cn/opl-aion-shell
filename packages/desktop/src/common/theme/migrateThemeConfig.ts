/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Theme, ThemeAppearanceMode } from './types';
import { DARK_THEME_ID, LIGHT_THEME_ID, SYSTEM_THEME_ID } from './constants';
import { normalizeThemeAppearanceMode } from './resolveTheme';

type OldCssTheme = {
  id: string;
  name: string;
  cover?: string;
  css: string;
  is_preset?: boolean;
  created_at: number;
  updated_at: number;
};

export type OldThemeConfig = {
  theme?: string;
  'css.activeThemeId'?: string;
  'css.themes'?: OldCssTheme[];
  customCss?: string;
  'theme.activeId'?: string;
  'theme.appearanceMode'?: unknown;
  'theme.userThemes'?: Theme[];
};

export type NewThemeConfig = {
  'theme.activeId': string;
  'theme.appearanceMode': ThemeAppearanceMode;
  'theme.userThemes': Theme[];
};

export function migrateThemeConfig(old: OldThemeConfig): NewThemeConfig {
  const existingUserThemes = Array.isArray(old['theme.userThemes']) ? old['theme.userThemes'] : null;
  const legacyAppearance = old.theme === 'dark' ? 'dark' : old.theme === 'light' ? 'light' : undefined;
  const existingActiveId = old['theme.activeId']?.trim() || '';
  const activeId = LIGHT_THEME_ID;

  const appearanceMode = normalizeThemeAppearanceMode(
    old['theme.appearanceMode'],
    existingActiveId === SYSTEM_THEME_ID
      ? 'system'
      : existingActiveId === DARK_THEME_ID
        ? 'dark'
        : (legacyAppearance ??
          existingUserThemes?.find((theme) => theme.id === existingActiveId)?.appearance ??
          (existingActiveId ? 'light' : 'system'))
  );

  const userThemes: Theme[] =
    existingUserThemes ??
    (old['css.themes'] || [])
      .filter((theme) => !theme.is_preset)
      .map((theme) => ({
        id: theme.id,
        name: theme.name,
        cover: theme.cover,
        appearance: legacyAppearance ?? 'light',
        css: theme.css,
        builtin: false,
        created_at: theme.created_at,
        updated_at: theme.updated_at,
      }));

  return {
    'theme.activeId': activeId,
    'theme.appearanceMode': appearanceMode,
    'theme.userThemes': userThemes,
  };
}
