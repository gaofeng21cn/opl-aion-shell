import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
      if (key === 'settings.appName') return 'One Person Lab App';
      if (key === 'settings.appDescription') return 'OPL desktop app';
      if (key === 'settings.aboutVersionBadge') return `应用版本 ${options?.version}`;
      if (key === 'settings.aboutShellVersion') return `界面版本 ${options?.version}`;
      if (key === 'settings.aboutFrameworkRevision') return `OPL 框架 ${options?.revision}`;
      if (key === 'settings.aboutLatestStableVersion') return `GitHub 最新稳定版 ${options?.version}`;
      if (key === 'settings.checkForUpdates') return '检查更新';
      if (key === 'settings.includeNightlyUpdates') return '接收 Nightly 更新';
      if (key === 'settings.aboutMaintenanceMoved') return '更新与维护已移到维护页';
      if (key === 'settings.runtimePage.releaseChannels.stable') return 'Stable';
      if (key === 'settings.oplEnvironmentPage.updates.components.app_binary') return 'Installation carrier';
      if (key === 'settings.oplEnvironmentPage.updates.components.runtime_toolchain') return 'OPL Runtime Fabric';
      if (key === 'settings.oplEnvironmentPage.updates.components.agent_package_channel') return 'OPL capability packages';
      if (key === 'settings.oplEnvironmentPage.updates.components.capability_exposure') return 'Codex Surface';
      if (key === 'settings.oplEnvironmentPage.status.current') return 'Current';
      if (key === 'settings.oplEnvironmentPage.status.needs_reload') return 'Needs reload';
      if (key === 'settings.oplEnvironmentPage.status.update_available') return 'Update available';
      if (key === 'settings.oplEnvironmentPage.status.unknown') return 'Unknown';
      return key;
    },
  }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
  openExternalUrl: vi.fn(() => Promise.resolve()),
}));

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
            opl_framework_version: '0.1.0',
            opl_framework_revision: 'abc123def456',
          },
        },
      },
    });
    bridgeMocks.updateCheckInvoke.mockResolvedValue({
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
    });
  });

  const renderWithFreshSWR = () =>
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <AboutModalContent />
      </SWRConfig>
    );

  it('renders framework revision instead of the legacy framework version', async () => {
    renderWithFreshSWR();

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));

    expect(await screen.findByText('OPL 框架 abc123def456')).toBeInTheDocument();
    expect(screen.queryByText('OPL 框架 0.1.0')).not.toBeInTheDocument();
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

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));

    expect(await screen.findByText('OPL 框架 -')).toBeInTheDocument();
    expect(screen.queryByText('OPL 框架 0.1.0')).not.toBeInTheDocument();
  });

  it('keeps About focused on version and project links instead of maintenance controls', async () => {
    renderWithFreshSWR();

    expect(await screen.findByText('更新与维护已移到维护页')).toBeInTheDocument();
    expect(screen.queryByText('检查更新')).not.toBeInTheDocument();
    expect(screen.queryByText('接收 Nightly 更新')).not.toBeInTheDocument();
    expect(screen.queryByTestId('about-managed-update-summary')).not.toBeInTheDocument();
  });

  it('does not label an older release.version as the latest stable version', async () => {
    renderWithFreshSWR();

    await screen.findByText('应用版本 26.5.27');

    expect(screen.queryByText('GitHub 最新稳定版 26.4.27')).not.toBeInTheDocument();
  });

  it('does not label release projection versions as GitHub latest stable', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValueOnce({
      surface: 'app_state_fast',
      command: 'opl app state --profile fast --json',
      stdout: '{}',
      parsed: {
        app_state: {
          release: {
            version: '26.6.20',
            channel: 'stable',
            opl_framework_revision: 'abc123def456',
          },
        },
      },
    });

    renderWithFreshSWR();

    await screen.findByText('OPL 框架 abc123def456');

    expect(screen.queryByText('GitHub 最新稳定版 26.6.20')).not.toBeInTheDocument();
  });

  it('shows latest stable only from the GitHub update check result', async () => {
    bridgeMocks.updateCheckInvoke.mockResolvedValueOnce({
      success: true,
      data: {
        currentVersion: '26.5.27',
        updateAvailable: true,
        channel: 'stable',
        latest: {
          version: '26.6.27',
          tagName: 'v26.6.27',
          htmlUrl: 'https://github.com/gaofeng21cn/one-person-lab-app/releases/tag/v26.6.27',
          prerelease: false,
          draft: false,
          assets: [],
        },
      },
    });

    renderWithFreshSWR();

    expect(await screen.findByText('GitHub 最新稳定版 26.6.27')).toBeInTheDocument();
    expect(bridgeMocks.updateCheckInvoke).toHaveBeenCalledWith({ channel: 'stable' });
  });
});
