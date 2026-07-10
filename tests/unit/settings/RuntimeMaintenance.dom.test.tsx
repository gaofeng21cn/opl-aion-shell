import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RuntimeSettings from '@/renderer/pages/settings/sections/RuntimeSettings';
import type { ManagedUpdateMaintenanceSnapshot } from '@/renderer/services/managedUpdateMaintenance';

const bridgeMocks = vi.hoisted(() => ({
  executeActionInvoke: vi.fn(),
  executeManagedUpdateRead: vi.fn(),
  executeManagedUpdateMutation: vi.fn(),
  loadAppState: vi.fn(),
}));

const appState = {
  schema_version: 'opl_app_state.v1',
  core: {
    codex: {
      status: 'ready',
      parsed_version: '0.125.0',
    },
    executor: {
      permission_mode: 'full_auto',
    },
  },
  provider: {
    temporal: { status: 'ready', health_status: 'ready' },
  },
  paths: {
    workspace_root_path: '/Users/example/workspace',
    family_workspace_root: {
      selected_path: '/Users/example/workspace',
    },
  },
  modules: {
    summary: { default_modules_count: 5, healthy_default_modules_count: 5 },
    source: {
      mode: 'sibling_workspace',
      modules_root: '/Users/example/workspace/modules',
    },
    items: [
      { module_id: 'mas', display_name: 'MAS', status: 'ready' },
      { module_id: 'mag', display_name: 'MAG', status: 'ready' },
      { module_id: 'rca', display_name: 'RCA', status: 'ready' },
      { module_id: 'obf', display_name: 'OPL Book Forge', status: 'ready' },
      { module_id: 'oma', display_name: 'OMA', status: 'ready' },
    ],
  },
  operator: {
    status: 'ready',
    workbench: {
      task_run_projection_v2: {
        projection_kind: 'task_run_projection_v2',
        schema_version: 2,
        tasks: [
          {
            task_id: 'dm002-taskrun',
            title: 'DM002 TaskRun',
            state: 'running',
            status_label: 'Advancing',
          },
        ],
      },
    },
  },
};

const updateStatus = {
  managed_update: {
    operation: 'status',
    update_channel: 'stable',
    components: [
      {
        component_id: 'installation_carrier',
        display_group: 'Installation carrier',
        state: 'current',
      },
      {
        component_id: 'runtime_substrate',
        display_group: 'OPL Runtime Fabric',
        state: 'current',
      },
      {
        component_id: 'capability_packages',
        display_group: 'OPL capability packages',
        state: 'current',
      },
      {
        component_id: 'codex_surface',
        display_group: 'Codex Surface',
        state: 'current',
      },
    ],
  },
};

const maintenanceSnapshot: ManagedUpdateMaintenanceSnapshot = {
  running: false,
  operation: null,
  busyAction: null,
  executionStatus: 'idle',
  lastTrigger: null,
  lastRunAt: '2026-07-06T00:00:00Z',
  nextRunAt: null,
  lastFailure: null,
  lastAction: null,
  lastSkipReason: null,
  reloadGuidance: null,
  lockStatus: null,
  result: {
    stdout: '{}',
    parsed: updateStatus,
  },
};

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      executeAction: { invoke: bridgeMocks.executeActionInvoke },
    },
    shell: {
      openFolderWith: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/common/config/oplProductProfile', async () => {
  const actual = await vi.importActual<typeof import('@/common/config/oplProductProfile')>(
    '@/common/config/oplProductProfile'
  );
  return {
    ...actual,
    getOplCodexSessionContext: () => 'codex session context',
    getOplDefaultHomeAssistants: () => [
      { id: 'mas', display_name: 'MAS' },
      { id: 'mag', display_name: 'MAG' },
      { id: 'rca', display_name: 'RCA' },
      { id: 'obf', display_name: 'OPL Book Forge' },
      { id: 'oma', display_name: 'OMA' },
    ],
    getOplSettingsControlPlaneActionContract: () => ({
      recommended_action_ids: {
        doctor: 'doctor',
        repair: 'repair',
      },
    }),
  };
});

vi.mock('@/renderer/hooks/system/useOplAppState', async () => {
  const actual = await vi.importActual<typeof import('@/renderer/hooks/system/useOplAppState')>(
    '@/renderer/hooks/system/useOplAppState'
  );
  return {
    ...actual,
    useOplAppState: () => ({
      appState,
      loadedAt: '10:00:00',
      refreshing: false,
      load: bridgeMocks.loadAppState,
    }),
  };
});

vi.mock('@/renderer/services/managedUpdateMaintenance', () => ({
  useManagedUpdateMaintenance: () => maintenanceSnapshot,
  executeManagedUpdateRead: bridgeMocks.executeManagedUpdateRead,
  executeManagedUpdateMutation: bridgeMocks.executeManagedUpdateMutation,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      const renderedValues = Object.values(values ?? {})
        .filter((value) => value !== undefined && value !== null && String(value).length > 0)
        .map(String)
        .join(' ');
      return renderedValues ? `${key} ${renderedValues}` : key;
    },
  }),
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='settings-page-wrapper'>{children}</div>,
}));

describe('RuntimeSettings maintenance structure', () => {
  beforeEach(() => {
    window.location.hash = '';
    bridgeMocks.executeActionInvoke.mockReset();
    bridgeMocks.executeManagedUpdateRead.mockReset();
    bridgeMocks.executeManagedUpdateMutation.mockReset();
    bridgeMocks.loadAppState.mockReset();
    bridgeMocks.executeActionInvoke.mockResolvedValue({ ok: true, parsed: {} });
    bridgeMocks.executeManagedUpdateRead.mockResolvedValue({
      ok: true,
      stdout: '{}',
      parsed: updateStatus,
    });
    bridgeMocks.loadAppState.mockResolvedValue({ app_state: appState });
  });

  it('keeps healthy rows quiet, shows state-relevant actions, and moves technical detail out of view', () => {
    render(<RuntimeSettings />);

    expect(screen.getByTestId('opl-maintenance-hub-appUpdates')).toHaveTextContent(
      'settings.oplEnvironmentPage.maintenanceHub.items.appUpdates.title'
    );
    expect(screen.getByTestId('opl-maintenance-hub-runtimeEnvironment')).not.toHaveTextContent(
      'settings.oplEnvironmentPage.maintenanceHub.actions.repairRuntimeEnvironment'
    );
    expect(screen.getByTestId('opl-maintenance-hub-capabilitySurfaceSync')).toHaveTextContent(
      'settings.oplEnvironmentPage.maintenanceHub.actions.syncCapabilityPacks'
    );
    expect(screen.getByTestId('opl-maintenance-hub-localServicesRepair')).toHaveTextContent(
      'settings.oplEnvironmentPage.maintenanceHub.actions.checkBackgroundServices'
    );
    expect(screen.queryByTestId('opl-maintenance-hub-storageCleanup')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-maintenance-hub-repairSuggestions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('runtime-task-run-projection-v2')).not.toBeInTheDocument();
    expect(screen.queryByText('DM002 TaskRun')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-maintenance-link-outs')).not.toBeInTheDocument();
    expect(screen.getByTestId('opl-maintenance-hub-make-usable')).toBeInTheDocument();
    expect(screen.getByTestId('opl-maintenance-advanced-details')).toBeInTheDocument();
  });
});
