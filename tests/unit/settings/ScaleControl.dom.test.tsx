import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ScaleControl from '@/renderer/components/settings/ScaleControl';

const themeMocks = vi.hoisted(() => ({
  setFontScale: vi.fn(),
}));

vi.mock('@renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({
    fontScale: 1.1,
    setFontScale: themeMocks.setFontScale,
    theme: 'light',
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'settings.uiOptimization.preferences.scaleDecreaseAria': 'Decrease interface scale',
        'settings.uiOptimization.preferences.scaleIncreaseAria': 'Increase interface scale',
        'settings.uiOptimization.preferences.recommendedValue': 'Recommended value',
        'settings.uiOptimization.preferences.restoreRecommended': 'Restore recommended value',
      })[key] ?? key,
  }),
}));

describe('ScaleControl', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('names the icon controls and makes the recommended value explicit', () => {
    render(<ScaleControl />);

    expect(screen.getByText(/Recommended value:\s*100%/)).toBeInTheDocument();
    const decrease = screen.getByRole('button', { name: 'Decrease interface scale' });
    const increase = screen.getByRole('button', { name: 'Increase interface scale' });
    const restore = screen.getByRole('button', { name: 'Restore recommended value' });

    expect(decrease).toHaveTextContent('-');
    expect(increase).toHaveTextContent('+');
    fireEvent.click(decrease);
    fireEvent.click(increase);
    fireEvent.click(restore);

    expect(themeMocks.setFontScale).toHaveBeenNthCalledWith(1, 1.05);
    expect(themeMocks.setFontScale).toHaveBeenNthCalledWith(2, 1.15);
    expect(themeMocks.setFontScale).toHaveBeenNthCalledWith(3, 1);
  });
});
