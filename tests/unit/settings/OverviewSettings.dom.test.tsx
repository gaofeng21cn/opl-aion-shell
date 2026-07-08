import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import OverviewSettings from '@/renderer/pages/settings/sections/OverviewSettings';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  openFolder: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    shell: {
      openFolderWith: { invoke: mocks.openFolder },
    },
  },
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  oplRecord: (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  oplRecordList: (value: unknown) =>
    Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)) : [],
  oplString: (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null),
  useOplAppState: () => ({
    appState: {
      core: {
        codex: { permission_mode: 'full-access' },
        executor: { permission_mode: 'full-access' },
      },
      paths: {
        workspace_root_path: '/Users/example/OPL Workspace',
      },
      modules: {
        summary: {
          default_modules_count: 4,
          healthy_default_modules_count: 3,
        },
        source: { mode: 'sibling_workspace' },
        items: [{ module_id: 'medautoscience', status: 'dirty', git: { dirty: true } }],
      },
    },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      const labels: Record<string, string> = {
        'settings.overviewPage.title': 'Overview',
        'settings.overviewPage.description':
          'Confirm whether this computer is usable, what needs attention, and where to go next.',
        'settings.overviewPage.workspace.title': 'Workspace',
        'settings.overviewPage.workspace.currentPath': `Current path: ${options?.path}`,
        'settings.overviewPage.workspace.notConfigured': 'No workspace root has been selected yet.',
        'settings.overviewPage.workspace.open': 'Open Workspace',
        'settings.overviewPage.workspace.changeOrVerify': 'Change or Verify',
        'settings.overviewPage.workspace.openPermissions': 'View Permission Status',
        'settings.overviewPage.workspace.permissionStatus': `Permission: ${options?.mode}`,
        'settings.overviewPage.workspace.status.ready': 'Workspace selected',
        'settings.overviewPage.workspace.status.needsAction': 'Workspace needs setup',
        'settings.overviewPage.quickEntries.modelAccount.title': 'Model Access',
        'settings.overviewPage.quickEntries.modelAccount.description':
          'Confirm whether OPL Gateway and Codex CLI are usable.',
        'settings.overviewPage.quickEntries.localServices.title': 'Local Services',
        'settings.overviewPage.quickEntries.localServices.description':
          'Check Codex, background services, and capability pack health.',
        'settings.overviewPage.quickEntries.capabilities.title': 'Capabilities',
        'settings.overviewPage.quickEntries.capabilities.description':
          'Open MAS, MAG, RCA, OMA, plus skills and tools.',
        'settings.overviewPage.quickEntries.resources.title': 'Resources & Connections',
        'settings.overviewPage.quickEntries.resources.description':
          'Manage Server WebUI, OPL Workspace, cloud, and external environments.',
        'settings.overviewPage.quickEntries.remote.title': 'Web / Remote Access',
        'settings.overviewPage.quickEntries.remote.description':
          'View the browser access port, account, and password for this computer.',
        'settings.overviewPage.quickEntries.maintenance.title': 'Maintenance',
        'settings.overviewPage.quickEntries.maintenance.description':
          'Check, update, and repair local services and capability packs.',
        'settings.overviewPage.quickEntries.storage.title': 'Storage',
        'settings.overviewPage.quickEntries.storage.description':
          'Review local data usage, archive, and cleanup entry points.',
        'settings.overviewPage.quickEntries.preferences.title': 'Preferences',
        'settings.overviewPage.quickEntries.preferences.description':
          'Adjust interface behavior, display, and theme appearance.',
        'settings.overviewPage.maintenanceTitle': 'Maintenance details',
        'settings.overviewPage.maintenanceDescription': 'Runtime health and maintenance actions.',
        'settings.overviewPage.actions.openRuntimeStatus': 'Open Runtime Status',
        'settings.overviewPage.actions.openRuntimeSettings': 'Open Maintenance',
        'settings.overviewPage.actions.openLocalServices': 'Open Local Services',
        'settings.overviewPage.actions.openFoundryAgents': 'Open Capabilities',
        'settings.overviewPage.developerSource.title': 'Developer source needs manual handling',
        'settings.overviewPage.developerSource.impact': 'Automatic package updates will skip developer checkouts.',
        'settings.overviewPage.developerSource.dirtyImpact': 'Automatic package updates will skip dirty checkouts.',
        'settings.overviewPage.developerSource.nextStep': 'Handle the checkout, then refresh.',
        'settings.oplEnvironmentPage.healthSummary.values.canUse': 'Ready',
        'settings.oplEnvironmentPage.healthSummary.values.canUseWithAttention': 'Usable with attention',
        'settings.oplEnvironmentPage.modulesReadyCount': `${options?.ready} / ${options?.total} ready`,
        'agentMode.full-access': 'Full Access',
      };
      return labels[key] ?? options?.defaultValue ?? key;
    },
  }),
}));

describe('OverviewSettings', () => {
  it('exposes App Control Center task entries without adding legacy top-level settings concepts', () => {
    render(<OverviewSettings withWrapper={false} />);

    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText(/Current path: \/Users\/example\/OPL Workspace/)).toBeInTheDocument();
    expect(screen.getByText('Model Access')).toBeInTheDocument();
    expect(screen.getByText('Local Services')).toBeInTheDocument();
    expect(screen.getByText('Capabilities')).toBeInTheDocument();
    expect(screen.getByText('Resources & Connections')).toBeInTheDocument();
    expect(screen.getByText('Web / Remote Access')).toBeInTheDocument();
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
    expect(screen.getByText('Storage')).toBeInTheDocument();
    expect(screen.getByText('Preferences')).toBeInTheDocument();
    expect(screen.getByTestId('settings-overview-status')).toHaveTextContent('Usable with attention');
    expect(screen.getByTestId('settings-overview-developer-source-alert')).toHaveTextContent(
      'Developer source needs manual handling'
    );
    expect(screen.getByTestId('settings-overview-developer-source-alert')).toHaveTextContent(
      'Automatic package updates will skip dirty checkouts.'
    );
    expect(screen.getByText('3 / 4 ready')).toBeInTheDocument();
    expect(screen.queryByText('About')).not.toBeInTheDocument();
    expect(screen.queryByText('Advanced')).not.toBeInTheDocument();
  });

  it('routes task entries to existing Settings route ids and section anchors', () => {
    render(<OverviewSettings withWrapper={false} />);

    fireEvent.click(screen.getByText('Change or Verify'));
    expect(mocks.navigate).toHaveBeenCalledWith('/settings/workspace');

    const remoteEntry = screen.getByText('Web / Remote Access').closest('.arco-card');
    expect(remoteEntry).not.toBeNull();
    fireEvent.click(within(remoteEntry as HTMLElement).getByText('Open'));
    expect(mocks.navigate).toHaveBeenCalledWith('/settings/access#web-remote');

    const storageEntry = screen.getByText('Storage').closest('.arco-card');
    expect(storageEntry).not.toBeNull();
    fireEvent.click(within(storageEntry as HTMLElement).getByText('Open'));
    expect(mocks.navigate).toHaveBeenCalledWith('/settings/storage');

    fireEvent.click(screen.getByText('Open Workspace'));
    expect(mocks.openFolder).toHaveBeenCalledWith({
      folder_path: '/Users/example/OPL Workspace',
      tool: 'explorer',
    });
  });
});
