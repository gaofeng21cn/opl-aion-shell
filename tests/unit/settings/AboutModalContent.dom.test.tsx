import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import AboutModalContent from '@/renderer/components/settings/SettingsModal/contents/AboutModalContent';

const bridgeMocks = vi.hoisted(() => ({
  getAppStateInvoke: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      getAppState: { invoke: bridgeMocks.getAppStateInvoke },
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
      if (key === 'settings.runtimePage.releaseChannels.stable') return 'Stable';
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
            app_version: '26.4.27',
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
});
