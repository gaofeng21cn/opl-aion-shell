import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import SystemModalContent from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent';

const bridgeMocks = vi.hoisted(() => ({
  getAppStateInvoke: vi.fn(),
  openFolderInvoke: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      getAppState: { invoke: bridgeMocks.getAppStateInvoke },
    },
    shell: {
      openFolderWith: { invoke: bridgeMocks.openFolderInvoke },
    },
  },
}));

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => {
      const labels: Record<string, string> = {
        'common.open': 'Open',
        'common.technical_details': 'Technical details',
        'settings.advancedSettings': 'Advanced',
        'settings.advancedPathsDesc': 'Read-only directories used by this App.',
        'settings.advancedPathsTitle': 'Working directories',
        'settings.workDir': 'Workspace',
        'settings.logDir': 'Logs',
        'settings.workspacePage.status.ready': 'Available',
        'settings.dirNotConfigured': 'Not configured',
      };
      return labels[key] ?? options?.defaultValue ?? key;
    },
  }),
}));

describe('SystemModalContent read-only Advanced page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeMocks.getAppStateInvoke.mockResolvedValue({
      surface: 'app_state_fast',
      command: 'opl app state --profile fast --json',
      stdout: '{}',
      parsed: {
        app_state: {
          paths: {
            workspace_root: { selected_path: '/Users/example/OPL Workspace' },
            logs_dir: '/Users/example/.opl/logs',
          },
        },
      },
    });
    bridgeMocks.openFolderInvoke.mockResolvedValue(undefined);
  });

  const renderWithFreshSWR = () =>
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <SystemModalContent />
      </SWRConfig>
    );

  it('shows only read-only working directories and keeps raw paths in collapsed details', async () => {
    renderWithFreshSWR();

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));

    expect(screen.getByTestId('settings-page-advanced')).toBeInTheDocument();
    expect(screen.getByTestId('settings-advanced-primary')).toHaveAttribute('id', 'working-directories');
    expect(
      screen.getByTestId('settings-advanced-primary').querySelector('[data-layout="path-status-grid"]')
    ).toBeTruthy();
    expect(screen.getByTestId('settings-advanced-technical-details')).not.toHaveAttribute('open');
    expect(screen.getByText('Working directories')).toBeInTheDocument();
    expect(screen.getAllByText('Available')).toHaveLength(2);
    expect(document.body).not.toHaveTextContent('OPL Flow');
    expect(document.body).not.toHaveTextContent('Developer Profile');
    expect(document.body.querySelector('input')).toBeNull();

    const details = screen.getByTestId('settings-advanced-technical-details') as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event('toggle'));
    expect(screen.getByText('/Users/example/OPL Workspace')).toBeInTheDocument();
    expect(screen.getByText('/Users/example/.opl/logs')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Workspace' }));
    await waitFor(() =>
      expect(bridgeMocks.openFolderInvoke).toHaveBeenCalledWith({
        folder_path: '/Users/example/OPL Workspace',
        tool: 'explorer',
      })
    );
  });

  it('marks missing directories as attention without exposing a shell-owned repair action', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValueOnce({
      surface: 'app_state_fast',
      command: 'opl app state --profile fast --json',
      stdout: '{}',
      parsed: { app_state: { paths: {} } },
    });

    renderWithFreshSWR();

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));
    expect(screen.getByTestId('settings-advanced-exception')).toBeInTheDocument();
    expect(screen.getAllByText('Not configured').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole('button', { name: /repair|configure|change/i })).not.toBeInTheDocument();
  });
});
