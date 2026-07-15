/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Theme, ThemeAppearanceMode } from '@/common/theme/types';
import { configService } from '@/common/config/configService';
import { ipcBridge } from '@/common';
import { normalizeThemeAppearanceMode, resolveActiveTheme } from '@/common/theme/resolveTheme';
import { LIGHT_THEME_ID } from '@/common/theme/constants';
import { BUILTIN_THEMES } from '@renderer/theme/builtinThemes';
import { getSystemPrefersDark } from './systemAppearance';

const TOKENS_STYLE_ID = 'theme-tokens';
const DECORATION_STYLE_ID = 'theme-decoration';

/** Apply a resolved theme to a document. Used by every app-chrome surface. */
export function applyTheme(theme: Theme, root: Document = document): void {
  root.documentElement.setAttribute('data-theme', theme.appearance);
  root.body?.setAttribute('arco-theme', theme.appearance);
  root.getElementById(TOKENS_STYLE_ID)?.remove();
  root.getElementById(DECORATION_STYLE_ID)?.remove();
}

function resolveConfiguredTheme(activeId?: string, appearanceMode?: ThemeAppearanceMode): Theme {
  void activeId;
  const resolvedAppearanceMode = normalizeThemeAppearanceMode(
    appearanceMode ?? configService.get('theme.appearanceMode')
  );
  return resolveActiveTheme(LIGHT_THEME_ID, BUILTIN_THEMES, resolvedAppearanceMode, getSystemPrefersDark());
}

async function publishTheme(resolved: Theme): Promise<void> {
  applyTheme(resolved);
  await ipcBridge.theme.setActive.invoke(resolved);
}

/** Legacy compatibility entry: the product exposes one governed visual baseline. */
export async function setActiveTheme(_activeId: string): Promise<void> {
  await configService.set('theme.activeId', LIGHT_THEME_ID);
  await publishTheme(resolveConfiguredTheme(LIGHT_THEME_ID));
}

/** Set System/Light/Dark while preserving the governed product baseline. */
export async function setThemeAppearanceMode(appearanceMode: ThemeAppearanceMode): Promise<void> {
  await configService.set('theme.appearanceMode', appearanceMode);
  await publishTheme(resolveConfiguredTheme(undefined, appearanceMode));
}

/** Re-resolve the current preset and mode after the OS appearance changes. */
export async function reapplyConfiguredTheme(): Promise<void> {
  await publishTheme(resolveConfiguredTheme());
}
