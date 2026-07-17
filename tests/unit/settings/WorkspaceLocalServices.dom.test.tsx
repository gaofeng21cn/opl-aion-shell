import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WorkspaceSettings from '@/renderer/pages/settings/sections/WorkspaceSettings';
import LocalServicesSettings from '@/renderer/pages/settings/sections/LocalServicesSettings';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  openFolder: vi.fn(),
  load: vi.fn(),
  showOpen: vi.fn().mockResolvedValue(['/Users/example/New Workspace']),
  executeAction: vi.fn().mockResolvedValue({ ok: true, parsed: { ok: true } }),
  systemInfo: vi.fn(),
  updateSystemInfo: vi.fn(),
  setLogDirectory: vi.fn(),
  isDesktop: true,
  workspaceRootPath: '/Users/example/OPL Workspace',
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
    application: {
      systemInfo: { invoke: mocks.systemInfo },
      updateSystemInfo: { invoke: mocks.updateSystemInfo },
      setLogDirectory: { invoke: mocks.setLogDirectory },
    },
    shell: {
      openFolderWith: { invoke: mocks.openFolder },
    },
  },
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => mocks.isDesktop,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/SystemModalContent/OplPersonalizationSettings', () => ({
  default: () => <div data-testid='settings-personalization-instructions'>Personalization controls</div>,
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
        workspace_root_path: mocks.workspaceRootPath,
        workspace_root: {
          selected_path: mocks.workspaceRootPath,
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
        'settings.workspacePage.description': 'Review default local paths and Codex instructions.',
        'settings.workspacePage.status.ready': 'Available',
        'settings.workspacePage.status.writable': 'Work directory writable',
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
        'settings.workspacePage.root.dockerMount': 'Docker /projects',
        'settings.workspacePage.cards.permission': 'App can access it',
        'settings.workspacePage.cards.lastCheck': 'Last check',
        'settings.workspacePage.technical.title': 'Technical paths',
        'settings.oplEnvironmentPage.updates.diagnostics.title': 'Diagnostics',
        'settings.workspacePage.technical.description': 'Support-only paths.',
        'settings.workspacePage.modulesRoot.title': 'OPL modules directory',
        'settings.workspacePage.modulesRoot.description': 'Modules root detail.',
        'settings.workspacePage.modulesRoot.current': `Modules root: ${options?.path}`,
        'settings.workspacePage.modulesRoot.missing': 'No modules root.',
        'settings.workspacePage.logs.title': 'Logs directory',
        'settings.workspacePage.logs.description': 'Logs detail.',
        'settings.workspacePage.logs.webuiDescription': 'Docker data and logs use /data.',
        'settings.workspacePage.logs.current': `Logs: ${options?.path}`,
        'settings.workspacePage.logs.missing': 'No logs root.',
        'settings.workspacePage.logs.loading': 'Loading logs.',
        'settings.workspacePage.logs.unavailable': 'Logs unavailable.',
        'settings.workspacePage.logs.dockerMount': 'Docker /data',
        'settings.workspacePage.logs.saved': 'Logs saved.',
        'settings.workspacePage.logs.saveFailed': 'Logs save failed.',
        'settings.workspacePage.frameworkLogs.title': 'OPL Framework logs',
        'settings.workspacePage.frameworkLogs.current': `Framework logs: ${options?.path}`,
        'settings.workspacePage.frameworkLogs.missing': 'No Framework logs.',
        'settings.workspacePage.modules.title': 'Module paths',
        'settings.workspacePage.modules.description': `${options?.ready} / ${options?.total} ready in technical paths.`,
        'settings.workspacePage.modules.empty': 'No module paths.',
        'settings.workspacePage.actions.openWorkspace': 'Open Workspace',
        'settings.workspacePage.actions.openLogs': 'Open logs',
        'settings.workspacePage.actions.changeWorkspace': 'Change workspace',
        'settings.workspacePage.actions.changeLogs': 'Change logs directory',
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
        'settings.personalization.title': 'Codex instructions',
        'settings.personalization.description': 'Persistent and new-conversation instructions.',
      };
      return labels[key] ?? options?.defaultValue ?? key;
    },
  }),
}));

describe('WorkspaceSettings and LocalServicesSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = '';
    mocks.workspaceExists = true;
    mocks.workspaceWritable = true;
    mocks.workspaceHealthStatus = 'ready';
    mocks.executorPermissionMode = 'full-access';
    mocks.isDesktop = true;
    mocks.workspaceRootPath = '/Users/example/OPL Workspace';
    mocks.systemInfo.mockResolvedValue({
      cacheDir: '/Users/example/Library/Application Support/One Person Lab/config',
      workDir: '/Users/example/Library/Application Support/One Person Lab',
      logDir: '/Users/example/Library/Logs/One Person Lab App',
      platform: 'darwin',
      arch: 'arm64',
    });
    mocks.updateSystemInfo.mockResolvedValue(undefined);
    mocks.setLogDirectory.mockImplementation(({ path }: { path: string }) =>
      Promise.resolve({
        schema: 'opl_app_log_directory_update.v1',
        hostLogDir: path,
        dockerVolume: { sourcePath: path, dataRoot: '/data', logDir: '/data/logs' },
      })
    );
    mocks.showOpen.mockResolvedValue(['/Users/example/New Workspace']);
  });

  it('renders workspace, App logs, and personalization on one Settings page', async () => {
    render(<WorkspaceSettings withWrapper={false} />);

    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByTestId('settings-page-workspace')).toBeInTheDocument();
    expect(screen.getByTestId('settings-workspace-primary')).toBeInTheDocument();
    expect(screen.getByTestId('settings-workspace-primary')).not.toHaveClass('md:grid-cols-2');
    expect(screen.getByTestId('settings-workspace-primary-action')).toHaveTextContent('Change workspace');
    expect(screen.queryByTestId('opl-workspace-settings-permission')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-workspace-exception')).not.toBeInTheDocument();
    const workspacePath = screen.getByText('Work root: /Users/example/OPL Workspace');
    expect(workspacePath).toHaveClass('opl-settings-path');
    expect(workspacePath).not.toHaveClass('break-all');
    expect(screen.queryByText('Writes are allowed')).not.toBeInTheDocument();
    expect(screen.queryByText('Permission ready')).not.toBeInTheDocument();
    expect(screen.getByText('Work directory writable')).toBeInTheDocument();
    expect(screen.queryByText('Permission: Full Access')).not.toBeInTheDocument();
    expect(screen.queryByText('Folder exists')).not.toBeInTheDocument();
    expect(screen.queryByText('App can access it')).not.toBeInTheDocument();
    expect(screen.queryByText('Ready to work.')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-workspace-log-directory')).toBeInTheDocument();
    expect(screen.getByTestId('opl-workspace-settings-root').parentElement).toBe(
      screen.getByTestId('settings-workspace-log-directory').parentElement
    );
    expect(screen.getByTestId('opl-workspace-settings-root').parentElement).toHaveClass('opl-settings-list');
    expect(screen.getByTestId('settings-workspace-personalization')).toBeInTheDocument();
    expect(screen.getByTestId('settings-personalization-instructions')).toBeInTheDocument();
    const logsPath = await screen.findByText('Logs: /Users/example/Library/Logs/One Person Lab App');
    expect(logsPath).toHaveClass('opl-settings-path');
    expect(logsPath).not.toHaveClass('break-all');
    expect(screen.queryByTestId('settings-workspace-technical-details')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-workspace-diagnostics-action')).toHaveTextContent('Diagnostics');
    expect(screen.queryByText('Modules root: /Users/example/workspace/modules')).not.toBeInTheDocument();
    expect(screen.queryByText('Framework logs: /Users/example/Library/Logs/One Person Lab')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Open Workspace'));
    expect(mocks.openFolder).toHaveBeenCalledWith({
      folder_path: '/Users/example/OPL Workspace',
      tool: 'explorer',
    });

    fireEvent.click(screen.getAllByText('Open logs')[0]);
    expect(mocks.openFolder).toHaveBeenCalledWith({
      folder_path: '/Users/example/Library/Logs/One Person Lab App',
      tool: 'explorer',
    });
  });

  it('routes the always-available lightweight diagnostics action to Maintenance diagnostics', () => {
    render(<WorkspaceSettings withWrapper={false} />);

    const diagnosticsAction = screen.getByTestId('settings-workspace-diagnostics-action');
    expect(diagnosticsAction).toHaveClass('arco-btn-text', 'arco-btn-size-small');
    fireEvent.click(diagnosticsAction);

    expect(window.location.hash).toBe('#/settings/environment?section=diagnostics');
    expect(mocks.executeAction).not.toHaveBeenCalled();
  });

  it('updates the desktop App log directory and Docker projection through one local typed action', async () => {
    mocks.showOpen.mockResolvedValueOnce(['/Users/example/OPL Logs']);

    render(<WorkspaceSettings withWrapper={false} />);

    await screen.findByText('Logs: /Users/example/Library/Logs/One Person Lab App');
    fireEvent.click(screen.getByTestId('settings-workspace-log-directory-action'));

    await waitFor(() => expect(mocks.setLogDirectory).toHaveBeenCalledWith({ path: '/Users/example/OPL Logs' }));
    expect(mocks.updateSystemInfo).not.toHaveBeenCalled();
    expect(mocks.executeAction).not.toHaveBeenCalled();
    expect(await screen.findByText('Logs: /Users/example/OPL Logs')).toBeInTheDocument();
  });

  it('keeps the existing log directory visible when the desktop update fails', async () => {
    mocks.showOpen.mockResolvedValueOnce(['/Users/example/Broken Logs']);
    mocks.setLogDirectory.mockRejectedValueOnce(new Error('write failed'));

    render(<WorkspaceSettings withWrapper={false} />);

    await screen.findByText('Logs: /Users/example/Library/Logs/One Person Lab App');
    fireEvent.click(screen.getByTestId('settings-workspace-log-directory-action'));

    await waitFor(() => expect(mocks.setLogDirectory).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Logs: /Users/example/Library/Logs/One Person Lab App')).toBeInTheDocument();
    expect(screen.queryByText('Logs: /Users/example/Broken Logs')).not.toBeInTheDocument();
    expect(mocks.executeAction).not.toHaveBeenCalled();
  });

  it('projects Docker paths read-only from /projects and /data', async () => {
    mocks.isDesktop = false;
    mocks.workspaceRootPath = '/projects';
    mocks.systemInfo.mockResolvedValue({
      cacheDir: '/data/config',
      workDir: '/data',
      logDir: '/data/logs',
      platform: 'linux',
      arch: 'x64',
    });

    render(<WorkspaceSettings withWrapper={false} />);

    expect(screen.getByText('Work root: /projects')).toBeInTheDocument();
    expect(screen.getByText('Docker /projects')).toBeInTheDocument();
    expect(await screen.findByText('Logs: /data/logs')).toBeInTheDocument();
    expect(screen.getByText('Docker /data')).toBeInTheDocument();
    expect(screen.queryByText('Open Workspace')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-workspace-primary-action')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-workspace-log-directory-action')).not.toBeInTheDocument();
  });

  it('routes a non-writable work root to Maintenance without running global repair', () => {
    mocks.workspaceWritable = false;
    mocks.workspaceHealthStatus = 'attention_needed';
    mocks.executorPermissionMode = 'full_auto';

    render(<WorkspaceSettings withWrapper={false} />);

    expect(screen.getByTestId('opl-workspace-settings-root').closest('section')).toHaveClass(
      'opl-settings-section--attention'
    );
    expect(screen.getByTestId('settings-workspace-exception')).toBeInTheDocument();
    expect(screen.getByText('Needs setup')).toBeInTheDocument();
    expect(screen.queryByText('Permission needs attention')).not.toBeInTheDocument();
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
    expect(screen.queryByText('Not reported')).not.toBeInTheDocument();
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
    expect(screen.getByText('Manual · dirty')).toBeInTheDocument();
    expect(screen.getByTestId('opl-local-services-cards')).toHaveClass('opl-settings-flat-stack');
    expect(screen.getByTestId('settings-page-local-services').querySelector('.arco-card')).toBeNull();
    expect(screen.getByTestId('opl-local-service-codex').querySelector('.i-icon-terminal')).not.toBeNull();
    expect(screen.getByTestId('opl-local-service-background').querySelector('.i-icon-server')).not.toBeNull();

    fireEvent.click(screen.getByText('Open Maintenance'));
    expect(mocks.navigate).toHaveBeenCalledWith('/settings/environment');
  });

  it('renders local service refresh as an accessible icon-only action', () => {
    render(<LocalServicesSettings withWrapper={false} />);

    const refreshButton = screen.getByRole('button', { name: 'Refresh' });
    expect(refreshButton).toHaveTextContent('');
    expect(refreshButton.querySelector('.i-icon-refresh')).not.toBeNull();

    fireEvent.click(refreshButton);
    expect(mocks.load).toHaveBeenCalledWith('fast', { showRefreshing: true });
  });
});
