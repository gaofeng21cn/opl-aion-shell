import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockRunOplCommand = vi.fn();
const mockAutoUpdateCheck = vi.fn();
const mockAutoUpdateDownload = vi.fn();
const mockAutoUpdateQuitAndInstall = vi.fn();
const mockConfigGet = vi.fn();
const mockConfigSet = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      options ? `${key}:${Object.values(options).join('|')}` : key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/settings/opl' }),
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
      check: { invoke: (...args: unknown[]) => mockAutoUpdateCheck(...args) },
      download: { invoke: (...args: unknown[]) => mockAutoUpdateDownload(...args) },
      quitAndInstall: { invoke: (...args: unknown[]) => mockAutoUpdateQuitAndInstall(...args) },
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

vi.mock('@/renderer/components/settings/SettingsModal/contents/SystemModalContent', () => ({
  default: () => <div data-testid='system-modal-content' />,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/AboutModalContent', () => ({
  default: () => <div data-testid='about-modal-content' />,
}));

vi.mock('@/renderer/pages/settings/OplAppearanceThemeSettings', () => ({
  default: () => <div data-testid='opl-appearance-theme-settings' />,
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='settings-wrapper'>{children}</div>,
}));

vi.mock('@/renderer/hooks/system/useOplBrandName', () => ({
  OPL_DEFAULT_BRAND_NAME: 'One Person Lab',
  normalizeOplBrandName: (value: unknown) =>
    typeof value === 'string' && value.trim() ? value.trim() : 'One Person Lab',
  dispatchOplBrandNameChanged: vi.fn(),
}));

vi.mock('@/renderer/assets/logos/opl-modules/mas.svg', () => ({ default: 'mas.svg' }));
vi.mock('@/renderer/assets/logos/opl-modules/mds.svg', () => ({ default: 'mds.svg' }));
vi.mock('@/renderer/assets/logos/opl-modules/mag.svg', () => ({ default: 'mag.svg' }));
vi.mock('@/renderer/assets/logos/opl-modules/rca.svg', () => ({ default: 'rca.svg' }));
vi.mock('@/renderer/assets/logos/tools/coding/codex.svg', () => ({ default: 'codex.svg' }));
vi.mock('@/renderer/assets/logos/brand/hermes.svg', () => ({ default: 'hermes.svg' }));
vi.mock('@/renderer/assets/logos/brand/app.png', () => ({ default: 'app.png' }));

import SystemSettings, { resolveEngineAction } from '@/renderer/pages/settings/SystemSettings';

describe('SystemSettings OPL environment section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    mockConfigGet.mockResolvedValue('One Person Lab');
    mockConfigSet.mockResolvedValue(undefined);
    mockAutoUpdateCheck.mockResolvedValue({ success: true });
    mockAutoUpdateDownload.mockResolvedValue({ success: true });
    mockAutoUpdateQuitAndInstall.mockResolvedValue(undefined);
    mockRunOplCommand.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ system_initialize: { core_engines: {}, domain_modules: { modules: [] } } }),
      stderr: '',
    });
  });

  it('keeps personalization controls out of the environment page', async () => {
    render(<SystemSettings />);

    expect(await screen.findByText('settings.oplEnvironmentPage.title')).toBeInTheDocument();
    expect(screen.getByText('settings.oplEnvironmentPage.maintenanceTitle')).toBeInTheDocument();
    expect(screen.queryByTestId('opl-appearance-theme-settings')).not.toBeInTheDocument();
  });

  it('separates Codex diagnostics and Hermes update summary from version rows', async () => {
    mockRunOplCommand.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({
        system_initialize: {
          core_engines: {
            codex: {
              installed: true,
              version: 'codex-cli 0.125.0',
              parsed_version: '0.125.0',
              minimum_version: '0.125.0',
              version_status: 'compatible',
              binary_path: '/opt/homebrew/bin/codex',
              binary_source: 'path',
              candidates: [
                {
                  path: '/opt/homebrew/bin/codex',
                  selected: true,
                  parsed_version: '0.125.0',
                  version_status: 'compatible',
                },
                {
                  path: '/Applications/One Person Lab.app/Contents/Resources/codex',
                  selected: false,
                  parsed_version: '0.121.0',
                  version_status: 'outdated',
                },
              ],
              health_status: 'ready',
              issues: [],
              diagnostics: ['codex_cli_path_version_conflict_nonblocking'],
            },
            hermes: {
              installed: true,
              version: 'hermes-agent 0.9.0',
              update_available: true,
              update_summary: 'Hermes 0.10.0 is available\nRun hermes update',
              health_status: 'ready',
            },
          },
          domain_modules: { modules: [] },
        },
      }),
      stderr: '',
    });

    render(<SystemSettings />);

    expect(
      await screen.findByText(/settings\.oplEnvironmentPage\.selectedBinary:\/opt\/homebrew\/bin\/codex/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/settings\.oplEnvironmentPage\.diagnostics\.issues\.codexCliPathVersionConflict/)
    ).toBeInTheDocument();
    expect(screen.getByText(/\/Applications\/One Person Lab\.app\/Contents\/Resources\/codex/)).toBeInTheDocument();
    expect(
      screen.getByText('settings.oplEnvironmentPage.updateSummary:Hermes 0.10.0 is available')
    ).toBeInTheDocument();
    expect(
      screen.getByText('settings.oplEnvironmentPage.latestVersion:settings.oplEnvironmentPage.items.hermes.latest:')
    ).toBeInTheDocument();
    expect(screen.queryByText('attention_needed')).not.toBeInTheDocument();
  });

  it('runs OPL system update before downloading an app update without installing it', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    mockAutoUpdateCheck.mockResolvedValue({
      success: true,
      data: { updateInfo: { version: '1.9.22' } },
    });
    mockAutoUpdateDownload.mockResolvedValue({ success: true });

    render(<SystemSettings />);

    const updateButton = await screen.findByText('settings.oplEnvironmentPage.actions.oneClickUpdate');
    fireEvent.click(updateButton);

    await waitFor(() => {
      expect(mockRunOplCommand).toHaveBeenCalledWith({ args: ['system', 'update'] });
    });
    await waitFor(() => {
      expect(mockAutoUpdateCheck).toHaveBeenCalledWith({ includePrerelease: false });
      expect(mockAutoUpdateDownload).toHaveBeenCalledTimes(1);
    });
    expect(mockAutoUpdateQuitAndInstall).not.toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'aionui-open-update-modal',
        detail: { status: 'downloaded' },
      })
    );
    dispatchSpy.mockRestore();
  });
});

describe('SystemSettings OPL engine action policy', () => {
  it('does not offer Codex updates when the installed version is compatible', () => {
    expect(resolveEngineAction({ installed: true, version_status: 'compatible' }, 'codex')).toBeNull();
  });

  it('offers Codex updates only when the CLI version needs attention', () => {
    expect(resolveEngineAction({ installed: true, version_status: 'outdated' }, 'codex')).toBe('update');
    expect(resolveEngineAction({ installed: true, version_status: 'unknown' }, 'codex')).toBe('update');
  });

  it('offers Hermes updates only when Hermes reports an available update', () => {
    expect(resolveEngineAction({ installed: true, update_available: false }, 'hermes')).toBeNull();
    expect(resolveEngineAction({ installed: true, update_available: true }, 'hermes')).toBe('update');
  });
});
