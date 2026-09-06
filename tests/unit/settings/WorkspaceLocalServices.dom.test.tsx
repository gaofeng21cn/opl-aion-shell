import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  modalConfirm: vi.fn((config: { onOk?: () => unknown }) => config.onOk?.()),
  messageSuccess: vi.fn(),
  messageError: vi.fn(),
  isDesktop: true,
  workspaceRootPath: '/Users/example/OPL Workspace',
  freshWorkspaceRootPath: '/Users/example/New Workspace',
  workspaceActionId: 'workspace_root_set' as string | null,
  workspaceVerifyActionId: 'settings_verify_workspace' as string | null,
  workspaceVerifyRef: 'app_state.actions#settings_verify_workspace' as string | null,
  workspaceConfirmationRequired: false,
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

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      ...actual.Message,
      useMessage: () => [
        {
          success: mocks.messageSuccess,
          error: mocks.messageError,
        },
        null,
      ],
    },
    Modal: {
      ...actual.Modal,
      confirm: mocks.modalConfirm,
    },
  };
});

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => mocks.isDesktop,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/SystemModalContent/OplPersonalizationSettings', () => ({
  default: () => (
    <div data-testid='settings-personalization-instructions'>
      <section id='system-agents'>System instructions</section>
      <section id='opl-app-context'>App context</section>
    </div>
  ),
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='settings-page-wrapper'>{children}</div>,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  getAppState: (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const record = value as Record<string, unknown>;
    const appState = record.app_state;
    return appState && typeof appState === 'object' && !Array.isArray(appState) ? appState : record;
  },
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
      settings_control_center: {
        configuration_catalog: {
          items: [
            {
              configuration_id: 'workspace_root',
              current_value: mocks.workspaceRootPath,
              action_id: mocks.workspaceActionId,
              payload_fields: ['path'],
              confirmation_required: mocks.workspaceConfirmationRequired,
              verify_action_id: mocks.workspaceVerifyActionId,
              verify_ref: mocks.workspaceVerifyRef,
            },
          ],
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
        'common.cancel': 'Cancel',
        'settings.workspacePage.title': 'Workspace',
        'settings.workspacePage.description': 'Review default local paths and Codex instructions.',
        'settings.uiOptimization.navigation.destinations.workingDirectory': 'Working Directory',
        'settings.uiOptimization.navigation.destinations.instructionsContext': 'Instructions & Context',
        'settings.uiOptimization.navigation.destinations.logsDiagnostics': 'Logs & Diagnostics',
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
        'settings.workspacePage.root.webuiManaged': `Container work directory: ${options?.path}. Host mount is managed by Docker or Compose.`,
        'settings.workspacePage.root.webuiReadOnly': `WebUI work directory: ${options?.path}. Configure it when starting WebUI.`,
        'settings.workspacePage.root.webuiManagedTag': 'WebUI start configuration',
        'settings.workspacePage.root.unavailable': 'WebUI did not report a work directory.',
        'settings.workspacePage.root.missing': 'No work root.',
        'settings.workspacePage.root.dockerMount': 'Docker /projects',
        'settings.workspacePage.root.changeConfirmTitle': 'Change work directory?',
        'settings.workspacePage.root.changeConfirmContent': `Use ${options?.path} after verification.`,
        'settings.workspacePage.root.changeNotVerified': 'Work directory change not verified.',
        'settings.oplEnvironmentPage.messages.workspaceRootSaved': 'Workspace root saved',
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
        'settings.workspacePage.logs.webuiDescription':
          'WebUI logs are read-only and configured when the service starts.',
        'settings.workspacePage.logs.dockerDescription': 'Docker logs are deployment managed and read-only.',
        'settings.workspacePage.logs.webuiManagedTag': 'WebUI start configuration',
        'settings.workspacePage.logs.current': `Logs: ${options?.path}`,
        'settings.workspacePage.logs.missing': 'No logs root.',
        'settings.workspacePage.logs.loading': 'Loading logs.',
        'settings.workspacePage.logs.unavailable': 'Logs unavailable.',
        'settings.workspacePage.logs.dockerMount': 'Docker /data/logs',
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
        'settings.personalization.pageTitle': 'Instructions & Context',
        'settings.personalization.pageDescription': 'Manage instructions and context used by new conversations.',
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
    mocks.freshWorkspaceRootPath = '/Users/example/New Workspace';
    mocks.workspaceActionId = 'workspace_root_set';
    mocks.workspaceVerifyActionId = 'settings_verify_workspace';
    mocks.workspaceVerifyRef = 'app_state.actions#settings_verify_workspace';
    mocks.workspaceConfirmationRequired = false;
    mocks.executeAction.mockReset();
    mocks.executeAction.mockResolvedValue({ ok: true, parsed: { ok: true } });
    mocks.load.mockReset();
    mocks.load.mockImplementation(() =>
      Promise.resolve({
        app_state: {
          settings_control_center: {
            configuration_catalog: {
              items: [
                {
                  configuration_id: 'workspace_root',
                  current_value: mocks.freshWorkspaceRootPath,
                  action_id: mocks.workspaceActionId,
                  payload_fields: ['path'],
                  confirmation_required: mocks.workspaceConfirmationRequired,
                  verify_action_id: mocks.workspaceVerifyActionId,
                  verify_ref: mocks.workspaceVerifyRef,
                },
              ],
            },
          },
        },
      })
    );
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
      })
    );
    mocks.showOpen.mockResolvedValue(['/Users/example/New Workspace']);
  });

  it('keeps the default workspace page focused and exposes logs and instructions as separate surfaces', async () => {
    const view = render(<WorkspaceSettings withWrapper={false} />);

    expect(screen.getByText('Working Directory')).toBeInTheDocument();
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
    expect(screen.getByTestId('opl-workspace-settings-root').parentElement).toHaveClass('opl-settings-list');
    expect(screen.queryByTestId('settings-workspace-log-directory')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-workspace-personalization')).not.toBeInTheDocument();
    for (const anchor of ['current-workspace', 'permissions', 'artifacts']) {
      expect(document.getElementById(anchor)).not.toBeNull();
    }
    expect(document.getElementById('logs')).toBeNull();
    expect(document.getElementById('personalization')).toBeNull();
    expect(screen.queryByTestId('settings-workspace-technical-details')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-workspace-diagnostics-action')).toHaveTextContent('Diagnostics');
    expect(screen.queryByText('Modules root: /Users/example/workspace/modules')).not.toBeInTheDocument();
    expect(screen.queryByText('Framework logs: /Users/example/Library/Logs/One Person Lab')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Open Workspace'));
    expect(mocks.openFolder).toHaveBeenCalledWith({
      folder_path: '/Users/example/OPL Workspace',
      tool: 'explorer',
    });

    view.rerender(<WorkspaceSettings withWrapper={false} surface='logs' />);
    const logsPath = await screen.findByText('Logs: /Users/example/Library/Logs/One Person Lab App');
    expect(logsPath).toHaveClass('opl-settings-path');
    expect(logsPath).not.toHaveClass('break-all');
    expect(document.getElementById('logs')).not.toBeNull();
    expect(screen.queryByTestId('opl-workspace-settings-root')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByText('Open logs')[0]);
    expect(mocks.openFolder).toHaveBeenCalledWith({
      folder_path: '/Users/example/Library/Logs/One Person Lab App',
      tool: 'explorer',
    });

    view.rerender(<WorkspaceSettings withWrapper={false} surface='instructions' />);
    expect(screen.getByText('Instructions & Context')).toBeInTheDocument();
    expect(screen.getByTestId('settings-workspace-personalization')).toBeInTheDocument();
    expect(screen.getByTestId('settings-personalization-instructions')).toBeInTheDocument();
    expect(document.getElementById('personalization')).not.toBeNull();
    expect(document.getElementById('system-agents')).not.toBeNull();
    expect(document.getElementById('opl-app-context')).not.toBeNull();
    expect(screen.queryByTestId('settings-workspace-log-directory')).not.toBeInTheDocument();
  });

  it('routes the always-available lightweight diagnostics action to Maintenance diagnostics', () => {
    render(<WorkspaceSettings withWrapper={false} />);

    const diagnosticsAction = screen.getByTestId('settings-workspace-diagnostics-action');
    expect(diagnosticsAction).toHaveClass('arco-btn-text', 'arco-btn-size-small');
    fireEvent.click(diagnosticsAction);

    expect(window.location.hash).toBe('#/settings/environment?section=diagnostics');
    expect(mocks.executeAction).not.toHaveBeenCalled();
  });

  it('executes the projected workspace action and verifier before reporting an exact fresh readback', async () => {
    render(<WorkspaceSettings withWrapper={false} />);

    fireEvent.click(screen.getByTestId('settings-workspace-primary-action'));

    await waitFor(() =>
      expect(mocks.executeAction).toHaveBeenNthCalledWith(1, {
        actionId: 'workspace_root_set',
        dryRun: false,
        payloadRefsOnlyJson: { path: '/Users/example/New Workspace' },
      })
    );
    expect(mocks.executeAction).toHaveBeenNthCalledWith(2, {
      actionId: 'settings_verify_workspace',
      dryRun: false,
      payloadRefsOnlyJson: { workspace_path: '/Users/example/New Workspace' },
    });
    expect(mocks.load).toHaveBeenCalledWith('fast', { showRefreshing: true, forceFresh: true });
    expect(mocks.modalConfirm).not.toHaveBeenCalled();
    expect(mocks.messageSuccess).toHaveBeenCalledWith('Workspace root saved');
  });

  it('honors projected workspace confirmation before executing the mutation', async () => {
    mocks.workspaceConfirmationRequired = true;
    render(<WorkspaceSettings withWrapper={false} />);

    fireEvent.click(screen.getByTestId('settings-workspace-primary-action'));

    await waitFor(() => expect(mocks.modalConfirm).toHaveBeenCalledTimes(1));
    expect(mocks.modalConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Change work directory?',
        content: 'Use /Users/example/New Workspace after verification.',
      })
    );
    await waitFor(() => expect(mocks.executeAction).toHaveBeenCalledTimes(2));
  });

  it('does not report a workspace change as saved when fresh readback remains stale', async () => {
    mocks.freshWorkspaceRootPath = '/Users/example/OPL Workspace';
    render(<WorkspaceSettings withWrapper={false} />);

    fireEvent.click(screen.getByTestId('settings-workspace-primary-action'));

    await waitFor(() => expect(mocks.messageError).toHaveBeenCalledWith('Work directory change not verified.'));
    expect(mocks.messageSuccess).not.toHaveBeenCalled();
  });

  it('disables workspace mutation when the Framework projection has no verification route', () => {
    mocks.workspaceVerifyActionId = null;
    mocks.workspaceVerifyRef = null;

    render(<WorkspaceSettings withWrapper={false} />);

    expect(screen.getByTestId('settings-workspace-primary-action')).toBeDisabled();
  });

  it('updates the desktop App log directory through one local typed action', async () => {
    mocks.showOpen.mockResolvedValueOnce(['/Users/example/OPL Logs']);

    render(<WorkspaceSettings withWrapper={false} surface='logs' />);

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

    render(<WorkspaceSettings withWrapper={false} surface='logs' />);

    await screen.findByText('Logs: /Users/example/Library/Logs/One Person Lab App');
    fireEvent.click(screen.getByTestId('settings-workspace-log-directory-action'));

    await waitFor(() => expect(mocks.setLogDirectory).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Logs: /Users/example/Library/Logs/One Person Lab App')).toBeInTheDocument();
    expect(screen.queryByText('Logs: /Users/example/Broken Logs')).not.toBeInTheDocument();
    expect(mocks.executeAction).not.toHaveBeenCalled();
  });

  it('keeps Docker /projects and /data read-only without pretending to rewire host mounts', async () => {
    mocks.isDesktop = false;
    mocks.workspaceRootPath = '/projects';
    mocks.systemInfo.mockResolvedValue({
      cacheDir: '/data/config',
      workDir: '/data',
      logDir: '/data/logs',
      platform: 'linux',
      arch: 'x64',
    });

    const view = render(<WorkspaceSettings withWrapper={false} />);

    expect(
      await screen.findByText('Container work directory: /projects. Host mount is managed by Docker or Compose.')
    ).toBeInTheDocument();
    expect(screen.getByText('Docker /projects')).toBeInTheDocument();
    expect(screen.queryByText('Logs: /data/logs')).not.toBeInTheDocument();
    view.rerender(<WorkspaceSettings withWrapper={false} surface='logs' />);
    expect(await screen.findByText('Logs: /data/logs')).toBeInTheDocument();
    expect(screen.getByText('Docker /data/logs')).toBeInTheDocument();
    expect(screen.getByText('Docker logs are deployment managed and read-only.')).toBeInTheDocument();
    expect(screen.queryByText('Open Workspace')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-workspace-primary-action')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-workspace-log-directory-action')).not.toBeInTheDocument();
    expect(mocks.showOpen).not.toHaveBeenCalled();
    expect(mocks.openFolder).not.toHaveBeenCalled();
    expect(mocks.setLogDirectory).not.toHaveBeenCalled();
    expect(mocks.executeAction).not.toHaveBeenCalled();
    expect(mocks.systemInfo).toHaveBeenCalledTimes(2);
  });

  it('keeps standalone WebUI paths read-only without relabeling them as Docker mounts', async () => {
    mocks.isDesktop = false;
    mocks.workspaceRootPath = '/Users/example/standalone-projects';
    mocks.systemInfo.mockResolvedValue({
      cacheDir: '/Users/example/.aionui-web/cache',
      workDir: '/Users/example/.aionui-web',
      logDir: '/Users/example/.aionui-web/logs',
      platform: 'darwin',
      arch: 'arm64',
    });

    const view = render(<WorkspaceSettings withWrapper={false} />);

    expect(
      screen.getByText('WebUI work directory: /Users/example/standalone-projects. Configure it when starting WebUI.')
    ).toBeInTheDocument();
    expect(screen.getByText('WebUI start configuration')).toBeInTheDocument();
    expect(screen.queryByText('Docker /projects')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-workspace-primary-action')).not.toBeInTheDocument();

    view.rerender(<WorkspaceSettings withWrapper={false} surface='logs' />);

    expect(await screen.findByText('Logs: /Users/example/.aionui-web/logs')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('settings-workspace-log-directory')).getByText(
        'WebUI logs are read-only and configured when the service starts.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('WebUI start configuration')).toBeInTheDocument();
    expect(screen.queryByText('Docker /data/logs')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-workspace-log-directory-action')).not.toBeInTheDocument();
    expect(mocks.showOpen).not.toHaveBeenCalled();
    expect(mocks.openFolder).not.toHaveBeenCalled();
    expect(mocks.setLogDirectory).not.toHaveBeenCalled();
    expect(mocks.executeAction).not.toHaveBeenCalled();
    expect(mocks.systemInfo).toHaveBeenCalledTimes(2);
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

    expect(window.location.hash).toBe('#/settings/environment?section=services');
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
    expect(mocks.navigate).toHaveBeenCalledWith('/settings/environment?section=services');
  });

  it('renders local service refresh as an accessible icon-only action', () => {
    render(<LocalServicesSettings withWrapper={false} />);

    const refreshButton = screen.getByRole('button', { name: 'Refresh' });
    expect(refreshButton).toHaveTextContent('');
    expect(refreshButton.querySelector('[data-opl-icon="refreshSmall"]')).toHaveAttribute(
      'data-opl-icon-source',
      'deepseek-harness'
    );

    fireEvent.click(refreshButton);
    expect(mocks.load).toHaveBeenCalledWith('fast', { showRefreshing: true });
  });
});
