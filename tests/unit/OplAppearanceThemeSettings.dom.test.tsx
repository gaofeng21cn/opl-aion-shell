import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockConfigGet = vi.fn();
const mockConfigSet = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: (...args: unknown[]) => mockConfigGet(...args),
    set: (...args: unknown[]) => mockConfigSet(...args),
  },
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock('@/renderer/utils/theme/themeCssSync', () => ({
  resolveCssByActiveTheme: (themeId: string) => `css:${themeId || 'default-theme'}`,
}));

import OplAppearanceThemeSettings from '@/renderer/pages/settings/OplAppearanceThemeSettings';

describe('OplAppearanceThemeSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigGet.mockImplementation((key: string) => {
      if (key === 'css.activeThemeId') return Promise.resolve('opl-codex-shell');
      return Promise.resolve(undefined);
    });
    mockConfigSet.mockResolvedValue(undefined);
  });

  it('exposes only Codex App Style and AionUI Default choices', async () => {
    render(<OplAppearanceThemeSettings />);

    expect(await screen.findByText('settings.oplAppearance.codexStyle')).toBeInTheDocument();
    expect(screen.getByText('settings.oplAppearance.aionDefault')).toBeInTheDocument();
    expect(screen.queryByText('Misaka Mikoto Theme')).not.toBeInTheDocument();
    expect(screen.queryByText('settings.cssTheme.addManually')).not.toBeInTheDocument();
  });

  it('applies the AionUI Default theme through the same storage contract', async () => {
    render(<OplAppearanceThemeSettings />);

    fireEvent.click(await screen.findByText('settings.oplAppearance.aionDefault'));

    await waitFor(() => {
      expect(mockConfigSet).toHaveBeenCalledWith('customCss', 'css:default-theme');
      expect(mockConfigSet).toHaveBeenCalledWith('css.activeThemeId', 'default-theme');
    });
  });
});
