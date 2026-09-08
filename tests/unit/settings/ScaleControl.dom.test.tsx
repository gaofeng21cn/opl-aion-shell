import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    t: (key: string, options?: { defaultValue?: string }) =>
      ({
        'settings.uiOptimization.preferences.scaleDecreaseAria': 'Decrease interface scale',
        'settings.uiOptimization.preferences.scaleIncreaseAria': 'Increase interface scale',
        'settings.uiOptimization.preferences.recommendedValue': 'Recommended value',
        'settings.uiOptimization.preferences.restoreRecommended': 'Restore recommended value',
      })[key] ??
      options?.defaultValue ??
      key,
  }),
}));

describe('ScaleControl', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('names the icon controls and makes the recommended value explicit', async () => {
    render(<ScaleControl />);

    expect(screen.getByText(/Recommended value:\s*100%/)).toBeInTheDocument();
    const decrease = screen.getByRole('button', { name: 'Decrease interface scale' });
    const increase = screen.getByRole('button', { name: 'Increase interface scale' });
    const restore = screen.getByRole('button', { name: 'Restore recommended value' });

    expect(decrease).toHaveTextContent('-');
    expect(increase).toHaveTextContent('+');
    fireEvent.click(decrease);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
    fireEvent.click(increase);
    await waitFor(() => expect(increase).not.toBeDisabled());
    fireEvent.click(restore);
    await waitFor(() => expect(restore).not.toBeDisabled());

    expect(themeMocks.setFontScale).toHaveBeenNthCalledWith(1, 1.05);
    expect(themeMocks.setFontScale).toHaveBeenNthCalledWith(2, 1.15);
    expect(themeMocks.setFontScale).toHaveBeenNthCalledWith(3, 1);
  });
  it('shows pending and failed saves and keeps retry available', async () => {
    let rejectSave!: (error: Error) => void;
    themeMocks.setFontScale.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectSave = reject;
        })
    );
    render(<ScaleControl />);
    expect(screen.getByTestId('preferences-scale-preview')).toHaveTextContent('Interface size preview');
    const increase = screen.getByRole('button', { name: 'Increase interface scale' });
    fireEvent.click(increase);
    expect(increase).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Saving…');
    await act(async () => rejectSave(new Error('offline')));
    expect(screen.getByRole('status')).toHaveTextContent('Could not save.');
    expect(increase).not.toBeDisabled();
    themeMocks.setFontScale.mockResolvedValueOnce(undefined);
    fireEvent.click(increase);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
  });
});
