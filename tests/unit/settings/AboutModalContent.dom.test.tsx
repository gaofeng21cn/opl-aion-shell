import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import AboutModalContent from '@/renderer/components/settings/SettingsModal/contents/AboutModalContent';

const bridgeMocks = vi.hoisted(() => ({
  getAppStateInvoke: vi.fn(),
  updateCheckInvoke: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      getAppState: { invoke: bridgeMocks.getAppStateInvoke },
    },
    update: {
      check: { invoke: bridgeMocks.updateCheckInvoke },
    },
  },
}));

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      const labels: Record<string, string> = {
        'settings.appName': 'One Person Lab App',
        'settings.appDescription': 'OPL desktop app',
        'settings.helpDocumentation': 'Help documentation',
        'settings.releasePage': 'Release page',
        'settings.feedback': 'Feedback',
        'settings.checkForUpdates': 'Check for updates',
        'settings.aboutAppVersion': 'App version',
        'settings.aboutReleaseChannel': 'Release channel',
        'settings.aboutVersionTitle': 'Version and channel',
        'settings.aboutVersionDesc': 'Installed build and channel.',
        'settings.aboutSupportTitle': 'Help and feedback',
        'settings.aboutSupportDesc': 'Documentation, releases, and feedback.',
        'settings.aboutUpdateChecking': 'Checking for updates',
        'settings.aboutUpdateCurrent': 'You are up to date',
        'settings.aboutUpdateUnknown': 'Update status unavailable',
        'settings.runtimePage.releaseChannels.stable': 'Stable',
        'common.technical_details': 'Technical details',
        'settings.oplEnvironmentPage.updates.diagnostics.title': 'Diagnostics',
      };
      if (key === 'settings.aboutVersionBadge') {
        return `App ${options?.version} · ${options?.channel}`;
      }
      if (key === 'settings.aboutUpdateAvailable') return `Version ${options?.version} available`;
      if (key === 'settings.aboutShellVersion') return `GUI shell ${options?.version}`;
      if (key === 'settings.aboutFrameworkRevision') return `Framework revision ${options?.revision}`;
      if (key === 'settings.aboutReleaseRepo') return `Release repository ${options?.repo}`;
      return labels[key] ?? key;
    },
  }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
  openExternalUrl: vi.fn(() => Promise.resolve()),
}));

const currentUpdateResult = {
  success: true,
  data: {
    currentVersion: '26.5.27',
    updateAvailable: false,
    channel: 'stable',
    latest: {
      version: '26.5.27',
      tagName: 'v26.5.27',
      htmlUrl: 'https://github.com/gaofeng21cn/one-person-lab-app/releases/tag/v26.5.27',
      prerelease: false,
      draft: false,
      assets: [],
    },
  },
};

describe('AboutModalContent OPL release metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    bridgeMocks.getAppStateInvoke.mockResolvedValue({
      surface: 'app_state_fast',
      command: 'opl app state --profile fast --json',
      stdout: '{}',
      parsed: {
        app_state: {
          release: {
            version: '26.4.27',
            channel: 'stable',
            repo: 'gaofeng21cn/one-person-lab-app',
            opl_framework_version: '0.1.0',
            opl_framework_revision: 'abc123def456',
          },
        },
      },
    });
    bridgeMocks.updateCheckInvoke.mockResolvedValue(currentUpdateResult);
  });

  const renderWithFreshSWR = () =>
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <AboutModalContent />
      </SWRConfig>
    );

  const openTechnicalDetails = () => {
    fireEvent.click(screen.getByText('Diagnostics'));
  };

  it('keeps the main page focused on app version, update state, and three distinct actions', async () => {
    renderWithFreshSWR();

    expect(await screen.findByText('App version')).toBeInTheDocument();
    expect(screen.getByText('26.5.27')).toBeInTheDocument();
    expect(screen.getByText('Release channel')).toBeInTheDocument();
    expect(screen.getByText('Stable')).toBeInTheDocument();
    expect(screen.getByTestId('settings-page-about')).toBeInTheDocument();
    expect(screen.getByTestId('settings-about-primary')).toBeInTheDocument();
    expect(screen.getByTestId('settings-about-primary')).toHaveClass('flex', 'flex-col');
    expect(screen.getByTestId('about-update-section')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-about-technical-details')).not.toBeInTheDocument();
    expect(await screen.findByText('You are up to date')).toBeInTheDocument();
    expect(screen.getByTestId('about-check-updates')).toBeInTheDocument();
    expect(screen.getByTestId('about-link-help')).toHaveTextContent('Help documentation');
    expect(screen.getByTestId('about-link-releases')).toHaveTextContent('Release page');
    expect(screen.getByTestId('about-link-feedback')).toHaveTextContent('Feedback');
    expect(screen.getByTestId('about-update-copy')).toHaveClass('min-w-0');
    expect(screen.getByTestId('about-link-help-content')).toHaveClass(
      'flex',
      'items-center',
      'justify-between',
      'w-full'
    );
    expect(screen.queryByText('settings.officialWebsite')).not.toBeInTheDocument();
    expect(screen.queryByText('settings.bugReport')).not.toBeInTheDocument();
    expect(screen.queryByText('settings.contactMe')).not.toBeInTheDocument();
    expect(screen.queryByText('GUI shell')).not.toBeInTheDocument();
    expect(screen.queryByText(/Framework revision/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('about-technical-details')).not.toBeInTheDocument();
  });

  it('shows shell, framework revision, and release repo only after technical details open', async () => {
    renderWithFreshSWR();

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));
    openTechnicalDetails();

    expect(await screen.findByText('Framework revision abc123def456')).toBeInTheDocument();
    expect(screen.queryByText('Framework revision 0.1.0')).not.toBeInTheDocument();
    expect(screen.getByText('Release page: gaofeng21cn/one-person-lab-app')).toBeInTheDocument();
  });

  it('does not fall back to the legacy framework version when revision is missing', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValueOnce({
      surface: 'app_state_fast',
      command: 'opl app state --profile fast --json',
      stdout: '{}',
      parsed: {
        app_state: {
          release: {
            app_version: '26.4.27',
            channel: 'stable',
            opl_framework_version: '0.1.0',
          },
        },
      },
    });

    renderWithFreshSWR();
    openTechnicalDetails();

    expect(await screen.findByText('Framework revision -')).toBeInTheDocument();
    expect(screen.queryByText('Framework revision 0.1.0')).not.toBeInTheDocument();
  });

  it('rechecks on demand and reports an available release from the update service', async () => {
    bridgeMocks.updateCheckInvoke.mockResolvedValueOnce(currentUpdateResult).mockResolvedValueOnce({
      ...currentUpdateResult,
      data: {
        ...currentUpdateResult.data,
        updateAvailable: true,
        latest: { ...currentUpdateResult.data.latest, version: '26.6.27', tagName: 'v26.6.27' },
      },
    });

    renderWithFreshSWR();
    expect(await screen.findByText('You are up to date')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('about-check-updates'));

    expect(await screen.findByText('Version 26.6.27 available')).toBeInTheDocument();
    expect(bridgeMocks.updateCheckInvoke).toHaveBeenCalledTimes(2);
    expect(bridgeMocks.updateCheckInvoke).toHaveBeenLastCalledWith({ channel: 'stable' });
  });

  it('does not use a release projection version as the latest available release', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValueOnce({
      surface: 'app_state_fast',
      command: 'opl app state --profile fast --json',
      stdout: '{}',
      parsed: {
        app_state: {
          release: {
            version: '99.0.0',
            channel: 'stable',
            opl_framework_revision: 'abc123def456',
          },
        },
      },
    });

    renderWithFreshSWR();

    expect(await screen.findByText('You are up to date')).toBeInTheDocument();
    expect(screen.queryByText('Version 99.0.0 available')).not.toBeInTheDocument();
  });

  it('shows an unknown update state when the update service fails', async () => {
    bridgeMocks.updateCheckInvoke.mockRejectedValueOnce(new Error('offline'));

    renderWithFreshSWR();

    expect(await screen.findByText('Update status unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/^Version .* available$/)).not.toBeInTheDocument();
  });
});
