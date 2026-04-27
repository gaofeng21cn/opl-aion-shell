import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockConfigGet = vi.fn();
const mockConfigSet = vi.fn();
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    application: {
      getPath: { invoke: vi.fn().mockResolvedValue('/Users/test') },
    },
    fs: {
      readFile: { invoke: (...args: unknown[]) => mockReadFile(...args) },
      writeFile: { invoke: (...args: unknown[]) => mockWriteFile(...args) },
    },
  },
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: (...args: unknown[]) => mockConfigGet(...args),
    set: (...args: unknown[]) => mockConfigSet(...args),
  },
}));

vi.mock('@/renderer/hooks/system/useOplBrandName', () => ({
  OPL_DEFAULT_BRAND_NAME: 'One Person Lab',
  normalizeOplBrandName: (value: unknown) =>
    typeof value === 'string' && value.trim() ? value.trim() : 'One Person Lab',
  dispatchOplBrandNameChanged: vi.fn(),
}));

vi.mock('@/renderer/pages/settings/OplAppearanceThemeSettings', () => ({
  default: () => <div data-testid='opl-appearance-theme-settings' />,
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='settings-wrapper'>{children}</div>,
}));

import PersonalizationSettings from '@/renderer/pages/settings/PersonalizationSettings';

describe('PersonalizationSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'opl.brandName') return 'One Person Lab';
      if (key === 'opl.interactionLayer') return 'codex';
      return null;
    });
    mockConfigSet.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue('existing instructions');
    mockWriteFile.mockResolvedValue(true);
  });

  it('shows the active interaction-layer instruction file', async () => {
    render(<PersonalizationSettings />);

    expect(await screen.findByText('/Users/test/.codex/AGENTS.md')).toBeInTheDocument();
    expect(screen.getByTestId('opl-appearance-theme-settings')).toBeInTheDocument();
  });

  it('saves Hermes as the preferred OPL interaction layer', async () => {
    render(<PersonalizationSettings />);

    fireEvent.click(await screen.findByText('settings.personalizationPage.interactionHermes'));

    await waitFor(() => {
      expect(mockConfigSet).toHaveBeenCalledWith('opl.interactionLayer', 'hermes');
      expect(mockConfigSet).toHaveBeenCalledWith('guid.lastSelectedAgent', 'hermes');
    });
    expect(await screen.findByText('/Users/test/.hermes/SOUL.md')).toBeInTheDocument();
  });
});
