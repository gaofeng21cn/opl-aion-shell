/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { migrateThemeConfig } from '@/common/theme/migrateThemeConfig';
import { CODEX_THEME_ID, LIGHT_THEME_ID, SYSTEM_THEME_ID } from '@/common/theme/constants';

describe('migrateThemeConfig', () => {
  it('keeps old css.activeThemeId default-theme as the App-facing Light theme id', () => {
    const out = migrateThemeConfig({
      theme: 'light',
      'css.activeThemeId': 'default-theme',
      'css.themes': [],
      customCss: '',
    });
    expect(out['theme.activeId']).toBe(LIGHT_THEME_ID);
    expect(out['theme.appearanceMode']).toBe('light');
  });
  it('maps the old OPL Codex theme to the App default because Codex is not default-enabled', () => {
    const out = migrateThemeConfig({
      theme: 'light',
      'css.activeThemeId': 'codex',
      'css.themes': [],
      customCss: '',
    });
    expect(out['theme.activeId']).toBe(LIGHT_THEME_ID);
  });
  it('migrates a legacy custom preset selection to the governed product baseline', () => {
    const out = migrateThemeConfig({
      theme: 'light',
      'css.activeThemeId': 'hello-kitty',
      'css.themes': [],
      customCss: '',
    });
    expect(out['theme.activeId']).toBe(LIGHT_THEME_ID);
  });
  it('moves the old dark toggle to appearance without changing the preset', () => {
    const out = migrateThemeConfig({ theme: 'dark', 'css.activeThemeId': '', 'css.themes': [], customCss: '' });
    expect(out['theme.activeId']).toBe(LIGHT_THEME_ID);
    expect(out['theme.appearanceMode']).toBe('dark');
  });
  it('moves a system sentinel out of the preset id', () => {
    const out = migrateThemeConfig({ 'theme.activeId': SYSTEM_THEME_ID, 'theme.userThemes': [] });
    expect(out['theme.activeId']).toBe(LIGHT_THEME_ID);
    expect(out['theme.appearanceMode']).toBe('system');
  });
  it('migrates a selected Codex preset to the governed product baseline', () => {
    const out = migrateThemeConfig({ 'theme.activeId': CODEX_THEME_ID, 'theme.userThemes': [] });
    expect(out['theme.activeId']).toBe(LIGHT_THEME_ID);
    expect(out['theme.appearanceMode']).toBe('light');
  });
  it('preserves custom theme data while migrating its active selection to the product baseline', () => {
    const out = migrateThemeConfig({
      'theme.activeId': 'mine',
      'theme.appearanceMode': 'sepia',
      'theme.userThemes': [
        {
          id: 'mine',
          name: 'Mine',
          appearance: 'dark',
          builtin: false,
          created_at: 1,
          updated_at: 1,
        },
      ],
    });
    expect(out['theme.activeId']).toBe(LIGHT_THEME_ID);
    expect(out['theme.appearanceMode']).toBe('dark');
    expect(out['theme.userThemes']).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'mine' })]));
  });
  it('wraps old user themes verbatim as css-only', () => {
    const out = migrateThemeConfig({
      theme: 'dark',
      'css.activeThemeId': '',
      customCss: '',
      'css.themes': [{ id: 'u1', name: 'Mine', css: 'body{color:red}', created_at: 5, updated_at: 6 }],
    });
    const u = out['theme.userThemes'].find((t) => t.id === 'u1')!;
    expect(u.css).toBe('body{color:red}');
    expect(u.tokens).toBeUndefined();
    expect(u.appearance).toBe('dark');
    expect(u.builtin).toBe(false);
  });
});
