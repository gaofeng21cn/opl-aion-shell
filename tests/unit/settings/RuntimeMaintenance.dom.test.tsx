import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import RuntimeSettings from '@/renderer/pages/settings/sections/RuntimeSettings';
import type { ManagedUpdateMaintenanceSnapshot } from '@/renderer/services/managedUpdateMaintenance';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

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
        component_id: 'opl_app',
        display_group: 'OPL App',
        state: 'current',
      },
      {
        component_id: 'opl_base',
        display_group: 'OPL Base',
        state: 'current',
      },
      {
        component_id: 'opl_packages',
        display_group: 'OPL Packages',
        package_id: 'oma',
        state: 'current',
        projection_status: 'current',
        profile_migration_status: 'current',
      },
    ],
  },
};

const actionableUpdateStatus = {
  managed_update: {
    ...updateStatus.managed_update,
    components: updateStatus.managed_update.components.map((component) => {
      if (component.component_id === 'opl_base') {
        return { ...component, state: 'update_available', safe_to_apply: true };
      }
      if (component.component_id === 'opl_packages') {
        return {
          ...component,
          state: 'failed_with_repair',
          repair_allowed: true,
          repair_receipt_ref: 'receipt://capability-packages/repair',
        };
      }
      return component;
    }),
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

vi.mock('@/common/config/oplProductProfile', () => ({
  canonicalizeOplProfessionalAgentId: (id: string) =>
    (
      ({
        mas: 'med-autoscience',
        mag: 'med-autogrant',
        rca: 'redcube-ai',
        obf: 'opl-bookforge',
        oma: 'opl-meta-agent',
      }) as Record<string, string>
    )[id] ?? id,
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
}));

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
    maintenanceSnapshot.result = {
      stdout: '{}',
      parsed: updateStatus,
    };
    bridgeMocks.executeActionInvoke.mockResolvedValue({ ok: true, parsed: {} });
    bridgeMocks.executeManagedUpdateRead.mockResolvedValue({
      ok: true,
      stdout: '{}',
      parsed: updateStatus,
    });
    bridgeMocks.loadAppState.mockResolvedValue({ app_state: appState });
  });

  it('renders quiet status rows and explicit action surfaces while gating diagnostics in a modal', () => {
    render(<RuntimeSettings />);

    expect(screen.getByTestId('maintenance-domain-grid')).toHaveClass('md:grid-cols-2');
    expect(screen.getByTestId('opl-runtime-health-summary').closest('section')).toHaveClass(
      'opl-settings-surface--status'
    );
    expect(screen.getByTestId('opl-maintenance-hub-appUpdates')).toHaveTextContent(
      'settings.oplEnvironmentPage.maintenanceHub.items.appUpdates.title'
    );
    expect(screen.getByTestId('opl-maintenance-hub-runtimeEnvironment')).toHaveTextContent(
      'settings.oplEnvironmentPage.maintenanceHub.actions.repairRuntimeEnvironment'
    );
    expect(screen.getByTestId('opl-maintenance-hub-capabilitySurfaceSync')).toHaveTextContent(
      'settings.oplEnvironmentPage.maintenanceHub.actions.syncCapabilityPacks'
    );
    expect(screen.getByTestId('opl-maintenance-hub-localServicesRepair')).toHaveTextContent(
      'settings.oplEnvironmentPage.maintenanceHub.actions.checkBackgroundServices'
    );
    for (const key of ['appUpdates', 'runtimeEnvironment', 'capabilitySurfaceSync', 'localServicesRepair']) {
      expect(screen.getByTestId(`opl-maintenance-hub-${key}`)).toHaveClass('opl-settings-surface--action');
    }
    expect(screen.queryByTestId('opl-maintenance-hub-storageCleanup')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-maintenance-hub-repairSuggestions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('runtime-task-run-projection-v2')).not.toBeInTheDocument();
    expect(screen.queryByText('DM002 TaskRun')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-maintenance-link-outs')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-maintenance-technical-details')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('settings-maintenance-diagnostics-action'));
    const diagnostics = screen.getByTestId('settings-maintenance-technical-details');
    expect(diagnostics).toHaveClass('opl-settings-surface--diagnostic');
    expect(within(diagnostics).queryByTestId('opl-managed-update-opl_base')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('settings-maintenance-management-action'));
    expect(screen.getByTestId('settings-maintenance-management-details')).toHaveClass(
      'opl-settings-surface--configuration'
    );
    expect(screen.getByTestId('opl-managed-update-opl_base')).toBeVisible();
    expect(screen.getByTestId('opl-managed-update-opl_app')).toBeVisible();
    expect(screen.getByTestId('opl-managed-update-opl_packages')).toBeVisible();
    expect(screen.queryByTestId('opl-managed-update-codex_surface')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-managed-update-workflow_profile')).not.toBeInTheDocument();
    const packageDiagnostics = screen
      .getByTestId('opl-managed-update-opl_packages')
      .querySelector('.arco-collapse-item-header') as HTMLElement;
    fireEvent.click(packageDiagnostics);
    expect(screen.getByTestId('opl-managed-update-substatus-projection_status')).toBeVisible();
    expect(screen.getByTestId('opl-managed-update-substatus-profile_migration_status')).toBeVisible();
  });

  it('keeps one direct action on every maintenance object when attention is present', () => {
    maintenanceSnapshot.result = {
      stdout: '{}',
      parsed: actionableUpdateStatus,
    };

    render(<RuntimeSettings />);

    expect(screen.getAllByTestId(/opl-maintenance-action-/)).toHaveLength(4);
    expect(screen.getByTestId('opl-maintenance-action-runtimeEnvironment')).toHaveTextContent(
      'settings.oplEnvironmentPage.maintenanceHub.actions.repairRuntimeEnvironment'
    );
  });

  it('routes capability sync through the canonical App action instead of update check', async () => {
    render(<RuntimeSettings />);

    fireEvent.click(screen.getByTestId('opl-maintenance-action-capabilitySurfaceSync'));

    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'settings_sync_capabilities',
        dryRun: false,
      })
    );
    expect(screen.queryByTestId('opl-capability-sync-confirmation')).not.toBeInTheDocument();
    expect(bridgeMocks.executeManagedUpdateRead).not.toHaveBeenCalled();
  });

  it('keeps capability sync single-flight and reports protected local changes', async () => {
    const sync = deferred<{
      ok: boolean;
      stdout: string;
      parsed: {
        app_action_execution: {
          result: {
            managed_update: {
              components: Array<{
                component_id: string;
                state: string;
                status_detail: { manual_required_targets_count: number };
              }>;
            };
          };
        };
      };
    }>();
    bridgeMocks.executeActionInvoke.mockReturnValue(sync.promise);

    render(<RuntimeSettings />);

    const syncButton = screen.getByTestId('opl-maintenance-action-capabilitySurfaceSync');
    act(() => {
      syncButton.click();
      syncButton.click();
    });

    expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledTimes(1);
    expect(syncButton).toBeDisabled();

    await act(async () => {
      sync.resolve({
        ok: true,
        stdout: '{}',
        parsed: {
          app_action_execution: {
            result: {
              managed_update: {
                components: [
                  {
                    component_id: 'capability_packages',
                    state: 'skipped_manual_required',
                    status_detail: { manual_required_targets_count: 3 },
                  },
                ],
              },
            },
          },
        },
      });
      await sync.promise;
    });

    await waitFor(() => {
      expect(syncButton).not.toBeDisabled();
      expect(
        screen.getByText('settings.oplEnvironmentPage.updates.messages.capabilitySyncManualRequired')
      ).toBeVisible();
    });
    expect(bridgeMocks.loadAppState).toHaveBeenCalledWith('fast', { showRefreshing: true });
  });

  it('serializes maintenance mutations before React state commits and restores actions after completion', async () => {
    maintenanceSnapshot.result = {
      stdout: '{}',
      parsed: actionableUpdateStatus,
    };
    const mutation = deferred<{ ok: boolean; stdout: string; parsed: typeof actionableUpdateStatus }>();
    bridgeMocks.executeManagedUpdateMutation.mockReturnValue(mutation.promise);

    render(<RuntimeSettings />);

    fireEvent.click(screen.getByTestId('settings-maintenance-management-action'));
    fireEvent.click(screen.getByTestId('opl-managed-update-apply-opl_base'));
    const confirmButton = screen
      .getByTestId('opl-managed-update-confirmation')
      .querySelector('.arco-btn-primary') as HTMLButtonElement;
    const repairButton = screen.getByTestId('opl-managed-update-repair-opl_packages');

    act(() => {
      confirmButton.click();
      confirmButton.click();
      repairButton.click();
    });

    expect(bridgeMocks.executeManagedUpdateMutation).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('opl-managed-update-confirmation')).not.toBeInTheDocument();
    expect(screen.getByTestId('opl-managed-update-refresh')).toBeDisabled();
    expect(repairButton).toBeDisabled();
    expect(screen.getByTestId('opl-maintenance-action-runtimeEnvironment')).toBeDisabled();

    await act(async () => {
      mutation.resolve({ ok: true, stdout: '{}', parsed: actionableUpdateStatus });
      await mutation.promise;
    });

    await waitFor(() => {
      expect(screen.getByTestId('opl-managed-update-refresh')).not.toBeDisabled();
      expect(screen.getByTestId('opl-managed-update-repair-opl_packages')).not.toBeDisabled();
      expect(screen.getByTestId('opl-maintenance-action-runtimeEnvironment')).not.toBeDisabled();
    });
    expect(bridgeMocks.executeManagedUpdateMutation).toHaveBeenCalledTimes(1);
  });
});
