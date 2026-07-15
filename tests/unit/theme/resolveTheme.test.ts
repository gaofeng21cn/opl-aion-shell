import { describe, it, expect } from 'vitest';
import { resolveActiveTheme, resolveThemeAppearance } from '@/common/theme/resolveTheme';
import { LIGHT_THEME_ID, DARK_THEME_ID, CODEX_THEME_ID } from '@/common/theme/constants';
import { BUILTIN_THEMES } from '@/renderer/theme/builtinThemes';
import type { Theme } from '@/common/theme/types';

const mk = (id: string, appearance: 'light' | 'dark' = 'light'): Theme => ({
  id,
  name: id,
  appearance,
  builtin: true,
  created_at: 0,
  updated_at: 0,
});
const light = mk(LIGHT_THEME_ID);
const dark = mk(DARK_THEME_ID, 'dark');
const userTheme: Theme = {
  id: 'u1',
  name: 'Mine',
  appearance: 'dark',
  css: 'body{}',
  builtin: false,
  created_at: 1,
  updated_at: 1,
};
const themes = [light, dark, userTheme];

describe('resolveActiveTheme', () => {
  it('exposes only the governed App visual baseline as a builtin preset', () => {
    expect(BUILTIN_THEMES.map((theme) => theme.id)).toEqual([LIGHT_THEME_ID]);
    expect(LIGHT_THEME_ID).toBe('default-theme');
  });
  it('returns a theme by id', () => {
    expect(resolveActiveTheme(DARK_THEME_ID, themes).id).toBe(DARK_THEME_ID);
  });
  it('returns a user theme by id', () => {
    expect(resolveActiveTheme('u1', themes).id).toBe('u1');
  });
  it('falls back to Light when id is unknown', () => {
    expect(resolveActiveTheme('nope', themes).id).toBe(LIGHT_THEME_ID);
  });
  it('falls back to Light when id is empty', () => {
    expect(resolveActiveTheme('', themes).id).toBe(LIGHT_THEME_ID);
  });
  it('falls back to first theme when no Light present', () => {
    expect(resolveActiveTheme('nope', [dark, userTheme]).id).toBe(DARK_THEME_ID);
  });
  it('applies dark appearance without replacing the selected preset', () => {
    const resolved = resolveActiveTheme('u1', themes, 'dark');
    expect(resolved.id).toBe('u1');
    expect(resolved.appearance).toBe('dark');
  });
  it('falls back from a legacy Codex preset while System follows a dark OS', () => {
    const resolved = resolveActiveTheme(CODEX_THEME_ID, [...BUILTIN_THEMES, userTheme], 'system', true);
    expect(resolved.id).toBe(LIGHT_THEME_ID);
    expect(resolved.appearance).toBe('dark');
  });
  it('defaults System to light when the OS preference is unavailable', () => {
    expect(resolveThemeAppearance('system')).toBe('light');
  });
  it('ignores the OS preference for an explicit appearance mode', () => {
    expect(resolveActiveTheme('u1', themes, 'light', true).appearance).toBe('light');
  });
  it('falls back to the default preset while retaining the requested appearance', () => {
    const resolved = resolveActiveTheme('missing', [light, userTheme], 'dark');
    expect(resolved.id).toBe(LIGHT_THEME_ID);
    expect(resolved.appearance).toBe('dark');
  });
});
