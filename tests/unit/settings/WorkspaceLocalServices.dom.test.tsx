import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import WorkspaceSettings from '@/renderer/pages/settings/sections/WorkspaceSettings';
import LocalServicesSettings from '@/renderer/pages/settings/sections/LocalServicesSettings';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  openFolder: vi.fn(),
  load: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
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
        executor: { permission_mode: 'full-access' },
      },
      provider: {
        temporal: {
          status: 'attention_needed',
          address: '127.0.0.1:7233',
        },
      },
      paths: {
        workspace_root_path: '/Users/example/OPL Workspace',
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
        'settings.workspacePage.status.ready': 'Workspace selected',
        'settings.workspacePage.status.needsAction': 'Workspace needs setup',
        'settings.workspacePage.root.title': 'Work directory',
        'settings.workspacePage.root.current': `Work root: ${options?.path}`,
        'settings.workspacePage.root.missing': 'No work root.',
        'settings.workspacePage.cards.permission': 'Permission mode',
        'settings.workspacePage.cards.modules': 'Capability modules',
        'settings.workspacePage.cards.lastCheck': 'Last check',
        'settings.workspacePage.modulesRoot.title': 'OPL modules directory',
        'settings.workspacePage.modulesRoot.description': 'Modules root detail.',
        'settings.workspacePage.modulesRoot.current': `Modules root: ${options?.path}`,
        'settings.workspacePage.modulesRoot.missing': 'No modules root.',
        'settings.workspacePage.logs.title': 'Logs directory',
        'settings.workspacePage.logs.description': 'Logs detail.',
        'settings.workspacePage.logs.current': `Logs: ${options?.path}`,
        'settings.workspacePage.logs.missing': 'No logs root.',
        'settings.workspacePage.modules.title': 'Module paths',
        'settings.workspacePage.modules.description': 'Module path detail.',
        'settings.workspacePage.modules.empty': 'No module paths.',
        'settings.workspacePage.maintenance.title': 'Need to repair or update something?',
        'settings.workspacePage.maintenance.description': 'Use Maintenance.',
        'settings.workspacePage.actions.openWorkspace': 'Open Workspace',
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
        'settings.oplEnvironmentPage.status.attention_required': 'Needs attention',
        'settings.oplEnvironmentPage.status.dirty': 'dirty',
        'settings.oplEnvironmentPage.moduleVersion.pathSources.familyWorkspaceRoot': `From ${options?.root}`,
        'settings.oplEnvironmentPage.moduleVersion.pathSources.siblingWorkspace': 'Sibling workspace',
        'agentMode.full-access': 'Full Access',
      };
      return labels[key] ?? options?.defaultValue ?? key;
    },
  }),
}));

describe('WorkspaceSettings and LocalServicesSettings', () => {
  it('renders workspace paths as a normal Settings page and opens the workspace folder', () => {
    render(<WorkspaceSettings withWrapper={false} />);

    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Work root: /Users/example/OPL Workspace')).toBeInTheDocument();
    expect(screen.getByText('Modules root: /Users/example/workspace/modules')).toBeInTheDocument();
    expect(screen.getByText('Logs: /Users/example/Library/Logs/One Person Lab')).toBeInTheDocument();
    expect(screen.getAllByText('1 / 2 ready').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('Open Workspace'));
    expect(mocks.openFolder).toHaveBeenCalledWith({
      folder_path: '/Users/example/OPL Workspace',
      tool: 'explorer',
    });
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
