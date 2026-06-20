import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import AboutModalContent from '@/renderer/components/settings/SettingsModal/contents/AboutModalContent';

const bridgeMocks = vi.hoisted(() => ({
  getAppStateInvoke: vi.fn(),
}));

const managedUpdateMocks = vi.hoisted(() => ({
  executeManagedUpdateRead: vi.fn(),
  snapshot: {
    running: false,
    result: null as null | {
      parsed?: unknown;
    },
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      getAppState: { invoke: bridgeMocks.getAppStateInvoke },
    },
  },
}));

vi.mock('@/renderer/services/managedUpdateMaintenance', () => ({
  executeManagedUpdateRead: managedUpdateMocks.executeManagedUpdateRead,
  useManagedUpdateMaintenance: () => managedUpdateMocks.snapshot,
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
      if (key === 'settings.runtimePage.releaseChannels.stable') return 'Stable';
      if (key === 'settings.oplEnvironmentPage.updates.components.app_binary') return 'App binary';
      if (key === 'settings.oplEnvironmentPage.updates.components.runtime_toolchain') return 'Runtime/toolchain';
      if (key === 'settings.oplEnvironmentPage.updates.components.agent_package_channel') return 'Agent packages';
      if (key === 'settings.oplEnvironmentPage.updates.components.capability_exposure') return 'Capability exposure';
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
    managedUpdateMocks.snapshot.running = false;
    managedUpdateMocks.snapshot.result = {
      parsed: {
        managed_update: {
          components: [
            { component_id: 'app_binary', state: 'current', current_version: '26.5.27' },
            { component_id: 'runtime_toolchain', state: 'current', current_version: 'toolchain-1' },
            { component_id: 'agent_package_channel', state: 'current', current_version: 'packages-1' },
            { component_id: 'capability_exposure', state: 'needs_reload', current_version: 'capabilities-1' },
          ],
        },
      },
    };
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

  it('keeps Nightly as a proper noun inside a complete settings label', async () => {
    renderWithFreshSWR();

    expect(await screen.findByText('接收 Nightly 更新')).toBeInTheDocument();
    expect(screen.queryByText('Nightly')).not.toBeInTheDocument();
  });

  it('shows the App-owned managed update summary in About without reading runtime files', async () => {
    renderWithFreshSWR();

    expect(await screen.findByTestId('about-managed-update-summary')).toHaveTextContent('App binary');
    expect(screen.getByTestId('about-managed-update-summary')).toHaveTextContent('Runtime/toolchain');
    expect(screen.getByTestId('about-managed-update-summary')).toHaveTextContent('Agent packages');
    expect(screen.getByTestId('about-managed-update-summary')).toHaveTextContent('Capability exposure');
    expect(screen.getByTestId('about-managed-update-summary')).toHaveTextContent('Needs reload');
    expect(screen.getByTestId('about-managed-update-summary')).not.toHaveTextContent('Unknown');
  });

  it('refreshes managed update status when no maintenance projection has been read yet', async () => {
    managedUpdateMocks.snapshot.result = null;

    renderWithFreshSWR();

    await waitFor(() =>
      expect(managedUpdateMocks.executeManagedUpdateRead).toHaveBeenCalledWith('status', {
        trigger: 'manual_refresh_status',
        background: true,
      })
    );
  });

  it('does not label an older release.version as the latest stable version', async () => {
    renderWithFreshSWR();

    await screen.findByText('应用版本 26.5.27');

    expect(screen.queryByText('GitHub 最新稳定版 26.4.27')).not.toBeInTheDocument();
  });

  it('shows latest stable only when the release projection is newer than the packaged App version', async () => {
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

    expect(await screen.findByText('GitHub 最新稳定版 26.6.20')).toBeInTheDocument();
  });
});
