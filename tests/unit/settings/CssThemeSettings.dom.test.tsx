import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    get: vi.fn(() => [
      {
        id: 'custom-theme',
        name: 'Custom theme',
        appearance: 'light',
        css: '',
        builtin: false,
        created_at: 0,
        updated_at: 0,
      },
    ]),
    set: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('@/common/utils', () => ({ uuid: () => 'test-theme-id' }));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
    },
  };
});

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
  it('renders theme choices as selectable preview tiles', async () => {
    render(<CssThemeSettings />);

    await waitFor(() => expect(screen.getAllByTestId('css-theme-option').length).toBeGreaterThanOrEqual(3));
    expect(screen.getByTestId('css-theme-option-list')).toHaveAttribute('data-layout', 'theme-tile-grid');
    for (const option of screen.getAllByTestId('css-theme-option')) {
      expect(option).toHaveAttribute('data-theme-option-surface', 'tile');
      expect(option).toHaveAttribute('aria-pressed');
      expect(option).toHaveClass('min-w-0');
      expect(option.querySelector('[data-testid="css-theme-option-preview"]')).toHaveClass('h-104px');
      expect(option.querySelector('.truncate')).toBeNull();
    }

    expect(screen.getByText('settings.cssTheme.addManually')).toBeInTheDocument();
    const editButton = screen.getByLabelText('common.edit');
    expect(editButton.closest('[data-testid="css-theme-option"]')).toBeNull();

    fireEvent.click(screen.getAllByTestId('css-theme-option')[0]);
    await waitFor(() => expect(themeMocks.selectTheme).toHaveBeenCalledTimes(1));
  });
});
