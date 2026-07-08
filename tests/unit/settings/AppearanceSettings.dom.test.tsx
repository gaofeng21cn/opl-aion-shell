import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AppearanceModalContent from '@/renderer/components/settings/SettingsModal/contents/AppearanceModalContent';

vi.mock('@/renderer/components/base/AionScrollArea', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/SystemModalContent/PersonalPreferenceSettings', () => ({
  default: () => <div data-testid='personal-preference-settings'>Application behavior controls</div>,
}));

vi.mock('@/renderer/pages/settings/AppearanceSettings/CssThemeSettings', () => ({
  default: () => <div data-testid='css-theme-settings'>Theme card list</div>,
}));

vi.mock('@/renderer/components/settings/FontSizeStepper', () => ({
  default: ({ value }: { value: number }) => <div>Font size {value}</div>,
}));

vi.mock('@/renderer/components/settings/ScaleControl', () => ({
  default: () => <div>Scale control</div>,
}));

vi.mock('@renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({
    fontSizes: { chat: 14, markdown: 15, code: 13 },
    setFontSize: vi.fn(),
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'settings.personalPreferencesTitle': 'Preferences',
        'settings.personalPreferencesDesc': 'Manage app behavior.',
        'settings.appearancePreferencesTitle': 'Appearance',
        'settings.appearancePreferencesDesc': 'Adjust theme, font sizes, and interface scale.',
        'settings.fontSizeChat': 'Chat font size',
        'settings.fontSizeMarkdown': 'Markdown font size',
        'settings.fontSizeCode': 'Code font size',
        'settings.fontSizeStepperReset': 'Reset',
        'settings.scale': 'Scale',
        'settings.advancedThemeListTitle': 'Advanced theme list',
        'settings.advancedThemeListDesc': 'Themes stay collapsed until needed.',
      })[key] ?? key,
  }),
}));

describe('AppearanceModalContent', () => {
  it('keeps behavior controls separate and leaves the theme gallery collapsed by default', () => {
    render(<AppearanceModalContent />);

    expect(screen.getByText('Preferences')).toBeInTheDocument();
    expect(screen.getByTestId('personal-preference-settings')).toHaveTextContent('Application behavior controls');
    expect(screen.getByText('Appearance')).toBeInTheDocument();
    expect(screen.getByText('Chat font size')).toBeInTheDocument();
    expect(screen.getByText('Markdown font size')).toBeInTheDocument();
    expect(screen.getByText('Code font size')).toBeInTheDocument();
    expect(screen.getByText('Scale')).toBeInTheDocument();

    const themeDetails = screen.getByText('Advanced theme list').closest('details');
    expect(themeDetails).toBeTruthy();
    expect(themeDetails).not.toHaveAttribute('open');
    expect(screen.getByTestId('css-theme-settings')).toHaveTextContent('Theme card list');
  });
});
