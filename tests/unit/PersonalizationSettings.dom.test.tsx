import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockConfigGet = vi.fn();
const mockConfigSet = vi.fn();
const mockRunOplCommand = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      options ? `${key}:${Object.values(options).join('|')}` : key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    shell: {
      runOplCommand: { invoke: (...args: unknown[]) => mockRunOplCommand(...args) },
    },
    application: {
      appVersions: { invoke: vi.fn().mockResolvedValue({ oplVersion: '26.4.25', guiVersion: '1.9.21' }) },
    },
    autoUpdate: {
      check: { invoke: vi.fn().mockResolvedValue({ success: true }) },
      download: { invoke: vi.fn().mockResolvedValue({ success: true }) },
    },
    dialog: {
      showOpen: { invoke: vi.fn() },
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

vi.mock('@/renderer/components/settings/SettingsModal/contents/DisplayModalContent', () => ({
  default: () => <div data-testid='display-settings-content' />,
}));

vi.mock('@/renderer/pages/settings/PetSettings', () => ({
  PetSettingsContent: () => <div data-testid='pet-settings-content' />,
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='settings-wrapper'>{children}</div>,
}));

vi.mock('@/renderer/assets/logos/opl-modules/mas.svg', () => ({ default: 'mas.svg' }));
vi.mock('@/renderer/assets/logos/opl-modules/mds.svg', () => ({ default: 'mds.svg' }));
vi.mock('@/renderer/assets/logos/opl-modules/mag.svg', () => ({ default: 'mag.svg' }));
vi.mock('@/renderer/assets/logos/opl-modules/rca.svg', () => ({ default: 'rca.svg' }));
vi.mock('@/renderer/assets/logos/tools/coding/codex.svg', () => ({ default: 'codex.svg' }));
vi.mock('@/renderer/assets/logos/brand/hermes.svg', () => ({ default: 'hermes.svg' }));
vi.mock('@/renderer/assets/logos/brand/app.png', () => ({ default: 'app.png' }));

import AppearanceSettings from '@/renderer/pages/settings/sections/AppearanceSettings';
import RuntimeSettings from '@/renderer/pages/settings/sections/RuntimeSettings';

describe('AppearanceSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigGet.mockResolvedValue('One Person Lab');
    mockConfigSet.mockResolvedValue(undefined);
  });

  it('keeps brand, display, and desktop pet controls on the appearance page', async () => {
    render(<AppearanceSettings />);

    expect(await screen.findByDisplayValue('One Person Lab')).toBeInTheDocument();
    expect(screen.getByTestId('opl-appearance-theme-settings')).toBeInTheDocument();
    expect(screen.getByTestId('display-settings-content')).toBeInTheDocument();
    expect(screen.getByTestId('pet-settings-content')).toBeInTheDocument();
  });
});

describe('RuntimeSettings Codex session addendum', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'opl.interactionLayer') return 'codex';
      if (key === 'opl.codexSessionAddendum') return 'existing session addendum';
      return null;
    });
    mockConfigSet.mockResolvedValue(undefined);
    mockRunOplCommand.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ system_initialize: { core_engines: {}, domain_modules: { modules: [] } } }),
      stderr: '',
    });
  });

  it('loads the OPL App Codex session addendum from app config and previews the effective context', async () => {
    render(<RuntimeSettings />);

    const textarea = (await screen.findByTestId('opl-codex-session-addendum-input')) as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toBe('existing session addendum');
    });
    expect(screen.getByTestId('effective-codex-context-preview')).toHaveTextContent('OPL App Session Addendum');
    expect(screen.getByTestId('effective-codex-context-preview')).toHaveTextContent('existing session addendum');
  });

  it('saves the OPL App Codex session addendum without touching AGENTS files', async () => {
    render(<RuntimeSettings />);

    const textarea = (await screen.findByTestId('opl-codex-session-addendum-input')) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '  new session addendum  ' } });
    fireEvent.click(screen.getByText('settings.runtimePage.actions.saveSessionAddendum'));

    await waitFor(() => {
      expect(mockConfigSet).toHaveBeenCalledWith('opl.codexSessionAddendum', 'new session addendum');
    });
    expect(JSON.stringify(mockConfigSet.mock.calls)).not.toContain('AGENTS.md');
  });

  it('saves Hermes as the preferred OPL interaction layer from the runtime page', async () => {
    render(<RuntimeSettings />);

    fireEvent.click(await screen.findByText('settings.runtimePage.interactionHermes'));

    await waitFor(() => {
      expect(mockConfigSet).toHaveBeenCalledWith('opl.interactionLayer', 'hermes');
      expect(mockConfigSet).toHaveBeenCalledWith('guid.lastSelectedAgent', 'hermes');
    });
  });
});
