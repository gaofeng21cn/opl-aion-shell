/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import { ipcBridge } from '@/common';
import { normalizeThemeAppearanceMode, resolveActiveTheme } from '@/common/theme/resolveTheme';
import { applyTheme, setActiveTheme, setThemeAppearanceMode } from '@/renderer/utils/theme/applyTheme';
import { getSystemPrefersDark } from '@/renderer/utils/theme/systemAppearance';
import { startSystemThemeWatcher } from '@/renderer/utils/theme/systemThemeWatcher';
import { BUILTIN_THEMES } from '@renderer/theme/builtinThemes';
import { LIGHT_THEME_ID } from '@/common/theme/constants';
import type { Theme, ThemeAppearanceMode } from '@/common/theme/types';
import { useCallback, useEffect, useState } from 'react';

const APPEARANCE_CACHE_KEY = '__aionui_theme';

function getPersistedActiveId(): string {
  return (configService.get('theme.activeId') as string) || LIGHT_THEME_ID;
}

function getPersistedAppearanceMode(): ThemeAppearanceMode {
  return normalizeThemeAppearanceMode(configService.get('theme.appearanceMode'));
}

async function initActiveTheme(): Promise<Theme> {
  try {
    await configService.whenReady();
    const activeId = getPersistedActiveId();
    const appearanceMode = getPersistedAppearanceMode();
    const userThemes = (configService.get('theme.userThemes') as Theme[]) ?? [];
    const resolved = resolveActiveTheme(
      activeId,
      [...BUILTIN_THEMES, ...userThemes],
      appearanceMode,
      getSystemPrefersDark()
    );
    applyTheme(resolved);
    try {
      localStorage.setItem(APPEARANCE_CACHE_KEY, resolved.appearance);
    } catch {
      /* noop */
    }
    // Seed the main-process relay so other surfaces (markdown shadow DOM, pet windows) can pull it.
    void ipcBridge.theme.setActive.invoke(resolved).catch(() => {});
    return resolved;
  } catch (e) {
    console.error('init theme failed', e);
    const fallback = resolveActiveTheme(LIGHT_THEME_ID, BUILTIN_THEMES, 'light');
    applyTheme(fallback);
    return fallback;
  }
}

let initialPromise: Promise<Theme> | null = null;
if (typeof window !== 'undefined') initialPromise = initActiveTheme();

/**
 * Returns the effective theme, legacy preset selector, preset id, appearance mode,
 * and appearance selector.
 */
const useTheme = (): [
  Theme | null,
  (activeId: string) => Promise<void>,
  string | null,
  ThemeAppearanceMode,
  (mode: ThemeAppearanceMode) => Promise<void>,
] => {
  const [active, setActive] = useState<Theme | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [appearanceMode, setAppearanceModeState] = useState<ThemeAppearanceMode>('system');

  useEffect(() => {
    let mounted = true;
    initialPromise
      ?.then((t) => {
        if (mounted) {
          setActive(t);
          setActiveId(getPersistedActiveId());
          setAppearanceModeState(getPersistedAppearanceMode());
        }
      })
      .catch((e) => console.error('init theme failed', e));
    const off = ipcBridge.theme.changed.on((t: Theme) => {
      applyTheme(t);
      if (mounted) {
        setActive(t);
        // Best-effort: config was persisted before the broadcast, fall back to the resolved id.
        setActiveId((configService.get('theme.activeId') as string) || t.id);
        setAppearanceModeState((current) =>
          normalizeThemeAppearanceMode(configService.get('theme.appearanceMode'), current)
        );
      }
      try {
        localStorage.setItem(APPEARANCE_CACHE_KEY, t.appearance);
      } catch {
        /* noop */
      }
    });
    const offSystemWatch = startSystemThemeWatcher();
    return () => {
      mounted = false;
      off?.();
      offSystemWatch();
    };
  }, []);

  const select = useCallback(async (activeId: string) => {
    await setActiveTheme(activeId);
    setActiveId(LIGHT_THEME_ID);
  }, []);

  const selectAppearanceMode = useCallback(async (mode: ThemeAppearanceMode) => {
    await setThemeAppearanceMode(mode);
    setAppearanceModeState(mode);
  }, []);

  return [active, select, activeId, appearanceMode, selectAppearanceMode];
};

export default useTheme;
