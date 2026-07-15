import { describe, it, expect, beforeEach, vi } from 'vitest';

const themeMocks = vi.hoisted(() => {
  const values = new Map<string, unknown>();
  return {
    values,
    get: vi.fn((key: string) => values.get(key)),
    set: vi.fn(async (key: string, value: unknown) => {
      values.set(key, value);
    }),
    publish: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@/common/config/configService', () => ({
  configService: { get: themeMocks.get, set: themeMocks.set },
}));

vi.mock('@/common', () => ({
  ipcBridge: { theme: { setActive: { invoke: themeMocks.publish } } },
}));

import { applyTheme, setActiveTheme, setThemeAppearanceMode } from '@/renderer/utils/theme/applyTheme';
import type { Theme } from '@/common/theme/types';

const base = { builtin: true, created_at: 0, updated_at: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  themeMocks.values.clear();
  themeMocks.values.set('theme.activeId', 'default-theme');
  themeMocks.values.set('theme.appearanceMode', 'system');
  themeMocks.values.set('theme.userThemes', []);
  document.documentElement.removeAttribute('data-theme');
  document.body.removeAttribute('arco-theme');
  document.getElementById('theme-tokens')?.remove();
  document.getElementById('theme-decoration')?.remove();
});

describe('applyTheme', () => {
  it('sets appearance attributes', () => {
    applyTheme({ ...base, id: 'dark', name: 'Dark', appearance: 'dark' } as Theme);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.body.getAttribute('arco-theme')).toBe('dark');
  });
  it('injects decoration css when present and removes when absent', () => {
    applyTheme({ ...base, id: 'hk', name: 'HK', appearance: 'light', css: 'body{color:red}' } as Theme);
    expect(document.getElementById('theme-decoration')?.textContent).toContain('color:red');
    applyTheme({ ...base, id: 'light', name: 'Light', appearance: 'light' } as Theme);
    expect(document.getElementById('theme-decoration')).toBeNull();
  });
  it('writes tokens to a :root style block when present', () => {
    applyTheme({ ...base, id: 't', name: 'T', appearance: 'light', tokens: { '--primary': '#abc' } } as Theme);
    expect(document.getElementById('theme-tokens')?.textContent).toContain('--primary: #abc');
  });
  it('changes appearance while resolving a legacy preset to the product baseline', async () => {
    themeMocks.values.set('theme.activeId', 'codex');

    await setThemeAppearanceMode('dark');

    expect(themeMocks.values.get('theme.activeId')).toBe('codex');
    expect(themeMocks.values.get('theme.appearanceMode')).toBe('dark');
    expect(themeMocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'default-theme', appearance: 'dark' })
    );
  });
  it('normalizes legacy preset selection without replacing explicit dark appearance', async () => {
    themeMocks.values.set('theme.appearanceMode', 'dark');

    await setActiveTheme('codex');

    expect(themeMocks.values.get('theme.activeId')).toBe('default-theme');
    expect(themeMocks.values.get('theme.appearanceMode')).toBe('dark');
    expect(themeMocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'default-theme', appearance: 'dark' })
    );
  });
});
