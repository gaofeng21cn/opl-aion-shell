import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import WorkspaceSettings from '@/renderer/pages/settings/sections/WorkspaceSettings';
import LocalServicesSettings from '@/renderer/pages/settings/sections/LocalServicesSettings';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  openFolder: vi.fn(),
  load: vi.fn(),
  showOpen: vi.fn().mockResolvedValue(['/Users/example/New Workspace']),
  executeAction: vi.fn().mockResolvedValue({ ok: true, parsed: { ok: true } }),
  workspaceExists: true as boolean | null,
  workspaceWritable: true as boolean | null,
  workspaceHealthStatus: 'ready' as string | null,
  executorPermissionMode: 'full-access',
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    dialog: {
      showOpen: { invoke: mocks.showOpen },
    },
    oplRuntime: {
      executeAction: { invoke: mocks.executeAction },
    },
    shell: {
      openFolderWith: { invoke: mocks.openFolder },
    },
  },
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='settings-page-wrapper'>{children}</div>,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  oplRecord: (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  oplRecordList: (value: unknown) =>
    Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) : [],
  oplString: (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null),
  useOplAppState: () => ({
    appState: {
      core: {
        codex: { status: 'ready', version: '0.125.0', permission_mode: 'full-access' },
        executor: { permission_mode: mocks.executorPermissionMode },
      },
      provider: {
        temporal: {
          status: 'attention_needed',
          address: '127.0.0.1:7233',
        },
      },
      paths: {
        workspace_root_path: '/Users/example/OPL Workspace',
        workspace_root: {
          selected_path: '/Users/example/OPL Workspace',
          exists: mocks.workspaceExists,
          writable: mocks.workspaceWritable,
          health_status: mocks.workspaceHealthStatus,
        },
        logs_dir: '/Users/example/Library/Logs/One Person Lab',
        family_workspace_root: {
          selected_path: '/Users/example/workspace',
        },
      },
      modules: {
        source: {
          mode: 'sibling_workspace',
          modules_root: '/Users/example/workspace/modules',
        },
        items: [
          {
            module_id: 'medautoscience',
            display_name: 'Med Auto Science',
            status: 'dirty',
            path: '/Users/example/workspace/med-autoscience',
            git: { dirty: true },
          },
          {
            module_id: 'oplbookforge',
            display_name: 'BookForge',
            status: 'ready',
            path: '/Users/example/workspace/modules/bookforge',
          },
        ],
      },
    },
    loadedAt: '10:30:00',
    refreshing: false,
    load: mocks.load,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string | number>) => {
      const labels: Record<string, string> = {
        'common.open': 'Open',
        'common.refresh': 'Refresh',
        'settings.workspacePage.title': 'Workspace',
        'settings.workspacePage.description': 'Review local paths.',
        'settings.workspacePage.status.ready': 'Available',
        'settings.workspacePage.status.needsAction': 'Needs setup',
        'settings.workspacePage.permission.title': 'Writes are allowed',
        'settings.workspacePage.permission.ready': 'Permission ready',
        'settings.workspacePage.permission.needsAction': 'Permission needs attention',
        'settings.workspacePage.permission.unknown': 'Not reported',
        'settings.workspacePage.output.title': 'Folder exists',
        'settings.workspacePage.nextStep.title': 'Recommended next step',
        'settings.workspacePage.nextStep.ready': 'Ready to work.',
        'settings.workspacePage.nextStep.missingWorkspace': 'Choose workspace.',
        'settings.workspacePage.nextStep.repairPermission': 'Repair permission.',
        'settings.workspacePage.root.title': 'Work directory',
        'settings.workspacePage.root.current': `Work root: ${options?.path}`,
        'settings.workspacePage.root.missing': 'No work root.',
        'settings.workspacePage.cards.permission': 'App can access it',
        'settings.workspacePage.cards.lastCheck': 'Last check',
        'settings.workspacePage.technical.title': 'Technical paths',
        'settings.workspacePage.technical.description': 'Support-only paths.',
        'settings.workspacePage.modulesRoot.title': 'OPL modules directory',
        'settings.workspacePage.modulesRoot.description': 'Modules root detail.',
        'settings.workspacePage.modulesRoot.current': `Modules root: ${options?.path}`,
        'settings.workspacePage.modulesRoot.missing': 'No modules root.',
        'settings.workspacePage.logs.title': 'Logs directory',
        'settings.workspacePage.logs.description': 'Logs detail.',
        'settings.workspacePage.logs.current': `Logs: ${options?.path}`,
        'settings.workspacePage.logs.missing': 'No logs root.',
        'settings.workspacePage.modules.title': 'Module paths',
        'settings.workspacePage.modules.description': `${options?.ready} / ${options?.total} ready in technical paths.`,
        'settings.workspacePage.modules.empty': 'No module paths.',
        'settings.workspacePage.actions.openWorkspace': 'Open Workspace',
        'settings.workspacePage.actions.openLogs': 'Open logs',
        'settings.workspacePage.actions.changeWorkspace': 'Change workspace',
        'settings.workspacePage.actions.title': 'Directory actions',
        'settings.workspacePage.actions.readyDescription': 'Open or change the current directory.',
        'settings.workspacePage.actions.attentionDescription': 'Choose a writable directory.',
        'settings.workspacePage.actions.recheck': 'Recheck',
        'settings.workspacePage.actions.openMaintenance': 'Open Maintenance',
        'settings.localServicesPage.title': 'Local Services',
        'settings.localServicesPage.description': 'Check local service health.',
        'settings.localServicesPage.cards.codex.title': 'Codex CLI',
        'settings.localServicesPage.cards.codex.description': 'Runs local sessions.',
        'settings.localServicesPage.cards.background.title': 'Background service',
        'settings.localServicesPage.cards.background.description': 'Keeps tasks running.',
        'settings.localServicesPage.cards.background.address': `Background service address: ${options?.address}`,
        'settings.localServicesPage.cards.modules.title': 'Capability packs',
        'settings.localServicesPage.cards.modules.description': 'OPL modules.',
        'settings.localServicesPage.modules.title': 'Capability pack health',
        'settings.localServicesPage.modules.description': 'Health detail.',
        'settings.localServicesPage.modules.normal': 'No manual action reported.',
        'settings.localServicesPage.modules.manualAttention': 'Manual handling is needed.',
        'settings.localServicesPage.modules.manualTag': 'Manual',
        'settings.localServicesPage.modules.empty': 'No modules.',
        'settings.localServicesPage.maintenance.title': 'Need to act on a service?',
        'settings.localServicesPage.maintenance.description': 'Use Maintenance for actions.',
        'settings.localServicesPage.actions.openMaintenance': 'Open Maintenance',
        'settings.oplEnvironmentPage.modulesReadyCount': `${options?.ready} / ${options?.total} ready`,
        'settings.oplEnvironmentPage.healthSummary.values.none': 'None',
        'settings.oplEnvironmentPage.healthSummary.values.count': `${options?.count} item(s)`,
        'settings.oplEnvironmentPage.status.ready': 'Ready',
        'settings.oplEnvironmentPage.status.unknown': 'Unknown',
        'settings.oplEnvironmentPage.status.attention_required': 'Needs attention',
        'settings.oplEnvironmentPage.status.dirty': 'dirty',
        'settings.oplEnvironmentPage.moduleVersion.pathSources.familyWorkspaceRoot': `From ${options?.root}`,
        'settings.oplEnvironmentPage.moduleVersion.pathSources.siblingWorkspace': 'Sibling workspace',
      };
      return labels[key] ?? options?.defaultValue ?? key;
    },
  }),
}));

describe('WorkspaceSettings and LocalServicesSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceExists = true;
    mocks.workspaceWritable = true;
    mocks.workspaceHealthStatus = 'ready';
    mocks.executorPermissionMode = 'full-access';
  });

  it('renders workspace paths as a normal Settings page and opens the workspace folder', () => {
    render(<WorkspaceSettings withWrapper={false} />);

    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByTestId('settings-page-workspace')).toBeInTheDocument();
    expect(screen.getByTestId('settings-workspace-primary')).toBeInTheDocument();
    expect(screen.getByTestId('settings-workspace-primary-action')).toHaveTextContent('Change workspace');
    expect(screen.queryByTestId('settings-workspace-exception')).not.toBeInTheDocument();
    expect(screen.getByText('Work root: /Users/example/OPL Workspace')).toBeInTheDocument();
    expect(screen.getByText('Writes are allowed')).toBeInTheDocument();
    expect(screen.getByText('Permission ready')).toBeInTheDocument();
    expect(screen.getAllByText('Available').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Permission: Full Access')).not.toBeInTheDocument();
    expect(screen.queryByText('Folder exists')).not.toBeInTheDocument();
    expect(screen.queryByText('App can access it')).not.toBeInTheDocument();
    expect(screen.queryByText('Ready to work.')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-workspace-technical-details')).not.toHaveAttribute('open');
    expect(screen.getByText('Technical paths')).toBeInTheDocument();
    expect(screen.getByText('Modules root: /Users/example/workspace/modules')).toBeInTheDocument();
    expect(screen.getByText('Logs: /Users/example/Library/Logs/One Person Lab')).toBeInTheDocument();
    expect(screen.getByText('1 / 2 ready in technical paths.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Open Workspace'));
    expect(mocks.openFolder).toHaveBeenCalledWith({
      folder_path: '/Users/example/OPL Workspace',
      tool: 'explorer',
    });

    fireEvent.click(screen.getAllByText('Open logs')[0]);
    expect(mocks.openFolder).toHaveBeenCalledWith({
      folder_path: '/Users/example/Library/Logs/One Person Lab',
      tool: 'explorer',
    });
  });

  it('routes a non-writable work root to Maintenance without running global repair', () => {
    mocks.workspaceWritable = false;
    mocks.workspaceHealthStatus = 'attention_needed';
    mocks.executorPermissionMode = 'full_auto';

    render(<WorkspaceSettings withWrapper={false} />);

    expect(screen.getByTestId('opl-workspace-settings-root')).toHaveClass('opl-settings-section--attention');
    expect(screen.getByTestId('settings-workspace-exception')).toBeInTheDocument();
    expect(screen.getByText('Needs setup')).toBeInTheDocument();
    expect(screen.getByText('Permission needs attention')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Open Maintenance'));

    expect(window.location.hash).toBe('#/settings/environment');
    expect(mocks.executeAction).not.toHaveBeenCalled();
    expect(screen.queryByText('Repair permissions')).not.toBeInTheDocument();
    expect(screen.queryByText('Permission ready')).not.toBeInTheDocument();
  });

  it('keeps unreported workspace access neutral instead of reporting ready or repairable', () => {
    mocks.workspaceExists = null;
    mocks.workspaceWritable = null;
    mocks.workspaceHealthStatus = null;
    mocks.executorPermissionMode = 'full_auto';

    render(<WorkspaceSettings withWrapper={false} />);

    expect(screen.getByTestId('opl-workspace-settings-root')).not.toHaveClass('opl-settings-section--attention');
    expect(screen.getByTestId('settings-workspace-exception')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText('Not reported')).toBeInTheDocument();
    expect(screen.getByText('Open Maintenance')).toBeInTheDocument();
    expect(screen.queryByText('Permission: full_auto')).not.toBeInTheDocument();
    expect(screen.queryByText('Permission ready')).not.toBeInTheDocument();
    expect(screen.queryByText('Repair permissions')).not.toBeInTheDocument();
  });

  it('renders local service health separately from Maintenance actions', () => {
    render(<LocalServicesSettings withWrapper={false} />);

    expect(screen.getByText('Local Services')).toBeInTheDocument();
    expect(screen.getByText('Codex CLI')).toBeInTheDocument();
    expect(screen.getByText('Background service address: 127.0.0.1:7233')).toBeInTheDocument();
    expect(screen.getByText('1 / 2 ready')).toBeInTheDocument();
    expect(screen.getByText('Manual')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Open Maintenance'));
    expect(mocks.navigate).toHaveBeenCalledWith('/settings/environment');
  });
});
