import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AboutModalContent from '@/renderer/components/settings/SettingsModal/contents/AboutModalContent';

const bridgeMocks = vi.hoisted(() => ({
  getAppStateInvoke: vi.fn(),
  getStatusSnapshotInvoke: vi.fn(),
  autoUpdateCheckInvoke: vi.fn(),
  autoUpdateStatusOn: vi.fn(),
  isElectron: true,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      getAppState: { invoke: bridgeMocks.getAppStateInvoke },
    },
    autoUpdate: {
      getStatusSnapshot: { invoke: bridgeMocks.getStatusSnapshotInvoke },
      check: { invoke: bridgeMocks.autoUpdateCheckInvoke },
      status: { on: bridgeMocks.autoUpdateStatusOn },
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
        'settings.aboutUpdateNotChecked': 'Update not checked',
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
  isElectronDesktop: () => bridgeMocks.isElectron,
  openExternalUrl: vi.fn(() => Promise.resolve()),
}));

const currentUpdateResult = {
  success: true,
  data: {
    checked: true,
  },
};

const cacheFastState = (release: Record<string, unknown>) => {
  localStorage.setItem(
    'opl.appState.fast.v1',
    JSON.stringify({
      payload: { app_state: { update_channel: release.channel ?? 'stable', release } },
      loadedAt: '12:00:00',
    })
  );
};

describe('AboutModalContent OPL release metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeMocks.isElectron = true;
    localStorage.clear();
    cacheFastState({
      version: '26.4.27',
      channel: 'stable',
      repo: 'gaofeng21cn/one-person-lab-app',
      opl_framework_version: '0.1.0',
      opl_framework_revision: 'abc123def456',
    });
    bridgeMocks.getStatusSnapshotInvoke.mockResolvedValue({ status: 'not-available' });
    bridgeMocks.autoUpdateCheckInvoke.mockResolvedValue(currentUpdateResult);
    bridgeMocks.autoUpdateStatusOn.mockReturnValue(() => undefined);
  });

  const renderAbout = () => render(<AboutModalContent />);

  const openTechnicalDetails = () => {
    fireEvent.click(screen.getByText('Diagnostics'));
  };

  it('keeps the main page focused on app version, update state, and three distinct actions', async () => {
    renderAbout();

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
    expect(bridgeMocks.getAppStateInvoke).not.toHaveBeenCalled();
    expect(bridgeMocks.autoUpdateCheckInvoke).not.toHaveBeenCalled();
    expect(bridgeMocks.getStatusSnapshotInvoke).toHaveBeenCalledTimes(1);
  });

  it('shows shell, framework revision, and release repo only after technical details open', async () => {
    renderAbout();
    openTechnicalDetails();

    expect(await screen.findByText('Framework revision abc123def456')).toBeInTheDocument();
    expect(screen.queryByText('Framework revision 0.1.0')).not.toBeInTheDocument();
    expect(screen.getByText('Release page: gaofeng21cn/one-person-lab-app')).toBeInTheDocument();
  });

  it('does not fall back to the legacy framework version when revision is missing', async () => {
    localStorage.clear();
    cacheFastState({
      app_version: '26.4.27',
      channel: 'stable',
      opl_framework_version: '0.1.0',
    });

    renderAbout();
    openTechnicalDetails();

    expect(await screen.findByText('Framework revision -')).toBeInTheDocument();
    expect(screen.queryByText('Framework revision 0.1.0')).not.toBeInTheDocument();
  });

  it('rechecks on demand and reports an available release from the update service', async () => {
    bridgeMocks.autoUpdateCheckInvoke.mockResolvedValueOnce({
      success: true,
      data: { checked: true, updateInfo: { version: '26.6.27' } },
    });

    renderAbout();
    expect(await screen.findByText('You are up to date')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('about-check-updates'));

    expect(await screen.findByText('Version 26.6.27 available')).toBeInTheDocument();
    expect(bridgeMocks.autoUpdateCheckInvoke).toHaveBeenCalledTimes(1);
    expect(bridgeMocks.autoUpdateCheckInvoke).toHaveBeenLastCalledWith({ channel: 'stable' });
  });

  it('maps the framework preview channel to the nightly updater channel', async () => {
    localStorage.clear();
    cacheFastState({ channel: 'preview' });

    renderAbout();
    await screen.findByText('You are up to date');
    fireEvent.click(screen.getByTestId('about-check-updates'));

    await waitFor(() => expect(bridgeMocks.autoUpdateCheckInvoke).toHaveBeenCalledWith({ channel: 'nightly' }));
  });

  it('updates from the shared main-process status event without running another check', async () => {
    let statusListener: ((status: { status: string; version?: string }) => void) | undefined;
    bridgeMocks.autoUpdateStatusOn.mockImplementationOnce((listener) => {
      statusListener = listener;
      return () => undefined;
    });
    renderAbout();

    expect(await screen.findByText('You are up to date')).toBeInTheDocument();
    statusListener?.({ status: 'available', version: '26.6.27' });
    expect(await screen.findByText('Version 26.6.27 available')).toBeInTheDocument();
    expect(bridgeMocks.autoUpdateCheckInvoke).not.toHaveBeenCalled();
  });

  it('keeps a newer status event when the initial snapshot resolves later', async () => {
    let resolveSnapshot!: (status: { status: 'not-available' }) => void;
    const snapshot = new Promise<{ status: 'not-available' }>((resolve) => {
      resolveSnapshot = resolve;
    });
    let statusListener: ((status: { status: 'available'; version: string }) => void) | undefined;
    bridgeMocks.getStatusSnapshotInvoke.mockReturnValueOnce(snapshot);
    bridgeMocks.autoUpdateStatusOn.mockImplementationOnce((listener) => {
      statusListener = listener;
      return () => undefined;
    });

    renderAbout();
    await act(async () => {
      statusListener?.({ status: 'available', version: '26.7.18' });
    });
    expect(await screen.findByText('Version 26.7.18 available')).toBeInTheDocument();

    await act(async () => {
      resolveSnapshot({ status: 'not-available' });
      await snapshot;
    });

    expect(screen.getByText('Version 26.7.18 available')).toBeInTheDocument();
    expect(screen.queryByText('You are up to date')).not.toBeInTheDocument();
  });

  it('unsubscribes from updater events when the page unmounts', () => {
    const unsubscribe = vi.fn();
    bridgeMocks.autoUpdateStatusOn.mockReturnValueOnce(unsubscribe);

    const { unmount } = renderAbout();
    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('does not touch desktop updater IPC in WebUI', async () => {
    bridgeMocks.isElectron = false;

    renderAbout();

    expect(await screen.findByText('Update not checked')).toBeInTheDocument();
    expect(bridgeMocks.autoUpdateStatusOn).not.toHaveBeenCalled();
    expect(bridgeMocks.getStatusSnapshotInvoke).not.toHaveBeenCalled();
    expect(bridgeMocks.autoUpdateCheckInvoke).not.toHaveBeenCalled();
  });

  it('shows an unknown update state when the update service fails', async () => {
    bridgeMocks.getStatusSnapshotInvoke.mockResolvedValueOnce({ status: 'error', error: 'offline' });

    renderAbout();

    expect(await screen.findByText('Update status unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/^Version .* available$/)).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-about-exception')).toBeInTheDocument();
  });
});
