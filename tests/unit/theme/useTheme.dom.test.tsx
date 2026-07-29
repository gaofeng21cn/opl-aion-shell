import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const themeMocks = vi.hoisted(() => {
  const values = new Map<string, unknown>([
    ['theme.activeId', 'default-theme'],
    ['theme.appearanceMode', 'system'],
    ['theme.userThemes', []],
  ]);
  return {
    values,
    get: vi.fn((key: string) => values.get(key)),
    set: vi.fn(async (key: string, value: unknown) => {
      values.set(key, value);
    }),
    whenReady: vi.fn().mockResolvedValue(undefined),
    relay: vi.fn(() => new Promise(() => {})),
    onChanged: vi.fn(() => vi.fn()),
    stopSystemWatcher: vi.fn(),
  };
});

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: themeMocks.get,
    set: themeMocks.set,
    whenReady: themeMocks.whenReady,
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    theme: {
      setActive: { invoke: themeMocks.relay },
      changed: { on: themeMocks.onChanged },
    },
  },
}));

vi.mock('@/renderer/utils/theme/systemThemeWatcher', () => ({
  startSystemThemeWatcher: () => themeMocks.stopSystemWatcher,
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => false,
}));

import useTheme from '@/renderer/hooks/system/useTheme';

function ThemeModeRadios() {
  const [, , , appearanceMode, setAppearanceMode] = useTheme();
  return (
    <div role='radiogroup' aria-label='Appearance'>
      <button
        type='button'
        role='radio'
        aria-checked={appearanceMode === 'system'}
        onClick={() => void setAppearanceMode('system')}
      >
        System
      </button>
      <button
        type='button'
        role='radio'
        aria-checked={appearanceMode === 'dark'}
        onClick={() => void setAppearanceMode('dark')}
      >
        Dark
      </button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  themeMocks.values.set('theme.activeId', 'default-theme');
  themeMocks.values.set('theme.appearanceMode', 'system');
  themeMocks.values.set('theme.userThemes', []);
});

describe('useTheme in WebUI', () => {
  it('persists and updates radio state without waiting for the Electron relay', async () => {
    render(<ThemeModeRadios />);

    const system = await screen.findByRole('radio', { name: 'System' });
    const dark = screen.getByRole('radio', { name: 'Dark' });
    await waitFor(() => expect(system).toHaveAttribute('aria-checked', 'true'));

    fireEvent.click(dark);

    await waitFor(() => {
      expect(themeMocks.values.get('theme.appearanceMode')).toBe('dark');
      expect(dark).toHaveAttribute('aria-checked', 'true');
      expect(system).toHaveAttribute('aria-checked', 'false');
    });
  });
});
