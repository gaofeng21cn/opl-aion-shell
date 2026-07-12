import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import OverviewSettings from '@/renderer/pages/settings/sections/OverviewSettings';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  workspaceRoot: '/Users/example/OPL Workspace' as string | null,
  workspaceExists: true as boolean | null,
  workspaceWritable: true as boolean | null,
  workspaceHealthStatus: 'ready' as string | null,
  permissionMode: 'full-access',
  modelAccessReady: true,
  temporalStatus: 'ready',
  moduleSourceMode: 'sibling_workspace',
  moduleStatus: 'dirty',
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  oplRecord: (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  oplRecordList: (value: unknown) =>
    Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)) : [],
  oplString: (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null),
  useOplAppState: () => ({
    appState: {
      core: {
        codex: {
          permission_mode: mocks.permissionMode,
          status: 'ready',
          version: '0.142.4',
          model_access_ready: mocks.modelAccessReady,
        },
        executor: { permission_mode: mocks.permissionMode },
      },
      provider: {
        temporal: { health_status: mocks.temporalStatus },
      },
      paths: {
        workspace_root_path: mocks.workspaceRoot,
        workspace_root: {
          selected_path: mocks.workspaceRoot,
          exists: mocks.workspaceExists,
          writable: mocks.workspaceWritable,
          health_status: mocks.workspaceHealthStatus,
        },
      },
      modules: {
        summary: {
          default_modules_count: 4,
          healthy_default_modules_count: 3,
        },
        source: { mode: mocks.moduleSourceMode },
        items: [{ module_id: 'medautoscience', status: mocks.moduleStatus, git: { dirty: true } }],
      },
    },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string | number>) => {
      const labels: Record<string, string> = {
        'settings.overviewPage.title': 'Overview',
        'settings.overviewPage.description':
          'Confirm whether this computer is usable, what needs attention, and where to go next.',
        'settings.overviewPage.overall.title': 'This computer',
        'settings.overviewPage.overall.readyDescription': 'Primary local capabilities are available.',
        'settings.overviewPage.overall.attentionDescription': 'Some settings need attention.',
        'settings.overviewPage.attention.title': 'Needs attention',
        'settings.overviewPage.attention.description': 'Only blocking items are shown.',
        'settings.overviewPage.attention.workspaceTitle': 'Choose a work directory',
        'settings.overviewPage.attention.capabilitiesTitle': 'Check capability packages',
        'settings.overviewPage.shortcuts.title': 'Common settings',
        'settings.overviewPage.shortcuts.description': 'Three common destinations.',
        'settings.overviewPage.workspace.title': 'Workspace',
        'settings.overviewPage.workspace.currentPath': `Current path: ${options?.path}`,
        'settings.overviewPage.workspace.notConfigured': 'No workspace root has been selected yet.',
        'settings.overviewPage.workspace.open': 'Open Workspace',
        'settings.overviewPage.workspace.changeOrVerify': 'Change or Verify',
        'settings.overviewPage.workspace.openPermissions': 'View Permission Status',
        'settings.overviewPage.workspace.permissionLabel': 'File permissions',
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
        'settings.oplEnvironmentPage.healthSummary.values.count': `${options?.count} item(s)`,
        'settings.oplEnvironmentPage.modulesReadyCount': `${options?.ready} / ${options?.total} ready`,
        'agentMode.full-access': 'Full Access',
      };
      return labels[key] ?? options?.defaultValue ?? key;
    },
  }),
}));

describe('OverviewSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceRoot = '/Users/example/OPL Workspace';
    mocks.workspaceExists = true;
    mocks.workspaceWritable = true;
    mocks.workspaceHealthStatus = 'ready';
    mocks.permissionMode = 'full-access';
    mocks.modelAccessReady = true;
    mocks.temporalStatus = 'ready';
    mocks.moduleSourceMode = 'sibling_workspace';
    mocks.moduleStatus = 'dirty';
  });

  it('shows one quiet status summary without duplicating Settings navigation', () => {
    mocks.workspaceRoot = '/Users/example/OPL Workspace';
    render(<OverviewSettings withWrapper={false} />);

    expect(screen.getByTestId('settings-page-overview')).toBeInTheDocument();
    expect(screen.getByTestId('settings-overview-primary')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-overview-technical-details')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-overview-status')).toHaveTextContent('Ready');
    expect(screen.queryByTestId('settings-overview-primary-action')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-overview-summary-grid')).toHaveClass('md:grid-cols-2');
    expect(screen.getByTestId('settings-overview-card-model-access')).toBeInTheDocument();
    expect(screen.getByTestId('settings-overview-card-workspace')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-overview-card-background')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-overview-card-capabilities')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-overview-card-updates')).not.toBeInTheDocument();
    expect(screen.queryByText('Common settings')).not.toBeInTheDocument();
  });

  it('keeps raw status details behind an explicit read-only diagnostics action', async () => {
    render(<OverviewSettings withWrapper={false} />);

    expect(screen.queryByTestId('settings-overview-technical-details')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('settings-overview-diagnostics-action'));

    expect(await screen.findByTestId('settings-overview-technical-details')).toHaveTextContent(
      '/Users/example/OPL Workspace'
    );
  });

  it('shows only the highest-priority next action when the workspace is missing', () => {
    mocks.workspaceRoot = null;
    mocks.workspaceExists = false;
    mocks.workspaceWritable = false;
    mocks.workspaceHealthStatus = 'missing';
    mocks.moduleSourceMode = 'managed';
    render(<OverviewSettings withWrapper={false} />);

    expect(screen.getByTestId('settings-overview-status')).toHaveTextContent('2 item(s)');
    expect(screen.getByTestId('settings-overview-attention-list').children).toHaveLength(2);
    fireEvent.click(screen.getByText('Change or Verify'));
    expect(mocks.navigate).toHaveBeenCalledWith('/settings/workspace');
    expect(screen.getByTestId('settings-overview-exception')).toBeInTheDocument();
    expect(screen.getAllByTestId('settings-overview-primary-action')).toHaveLength(1);
  });

  it('counts a capability-pack issue and routes its next action to Maintenance', () => {
    mocks.moduleSourceMode = 'managed';
    render(<OverviewSettings withWrapper={false} />);

    expect(screen.getByTestId('settings-overview-status')).toHaveTextContent('1 item(s)');
    fireEvent.click(screen.getByText('Open Maintenance'));
    expect(mocks.navigate).toHaveBeenCalledWith('/settings/environment?section=packages');
  });

  it('includes model access and background services in the issue queue without inventing duplicate actions', () => {
    mocks.modelAccessReady = false;
    mocks.temporalStatus = 'attention_required';
    mocks.moduleSourceMode = 'sibling_workspace';
    mocks.moduleStatus = 'ready';
    render(<OverviewSettings withWrapper={false} />);

    expect(screen.getByTestId('settings-overview-status')).toHaveTextContent('2 item(s)');
    fireEvent.click(screen.getByTestId('settings-overview-primary-action'));
    expect(mocks.navigate).toHaveBeenCalledWith('/settings/access');
    expect(screen.getAllByTestId('settings-overview-primary-action')).toHaveLength(1);
  });
});
