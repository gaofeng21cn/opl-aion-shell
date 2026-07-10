import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import CssThemeSettings from '@/renderer/pages/settings/AppearanceSettings/CssThemeSettings';

const themeMocks = vi.hoisted(() => ({
  selectTheme: vi.fn(),
  getThemes: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    extensions: {
      getThemes: { invoke: themeMocks.getThemes },
    },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: vi.fn(() => []),
    set: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('@/common/utils', () => ({ uuid: () => 'test-theme-id' }));

vi.mock('@renderer/hooks/context/ThemeContext.tsx', () => ({
  useThemeContext: () => ({
    theme: 'light',
    activeTheme: null,
    activeId: 'builtin-light',
    selectTheme: themeMocks.selectTheme,
  }),
}));

vi.mock('@renderer/utils/platform.ts', () => ({
  resolveExtensionAssetUrl: (value: string | undefined) => value,
}));

vi.mock('@/renderer/pages/settings/AppearanceSettings/CssThemeModal.tsx', () => ({
  default: () => null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) => options?.name ?? key,
  }),
}));

describe('CssThemeSettings', () => {
  it('renders theme choices as flat swatches without nested theme cards', async () => {
    const view = render(<CssThemeSettings />);

    await waitFor(() => expect(screen.getAllByTestId('css-theme-option').length).toBeGreaterThanOrEqual(3));
    expect(screen.getByTestId('css-theme-option-list')).toHaveAttribute('data-layout', 'flat-swatch-list');
    expect(view.container.querySelector('.rounded-12px')).toBeNull();
    for (const option of screen.getAllByTestId('css-theme-option')) {
      expect(option).toHaveAttribute('data-theme-option-surface', 'swatch');
      expect(option).toHaveAttribute('aria-pressed');
    }
  });
});
