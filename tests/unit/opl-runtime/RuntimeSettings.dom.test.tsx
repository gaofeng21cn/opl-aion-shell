import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RuntimePage from '@/renderer/pages/runtime';
import RuntimeSettings from '@/renderer/pages/settings/sections/RuntimeSettings';
import {
  executeManagedUpdateRead,
  resetManagedUpdateMaintenanceForTest,
} from '@/renderer/services/managedUpdateMaintenance';

const bridgeMocks = vi.hoisted(() => ({
  getAppStateInvoke: vi.fn(),
  getDrilldownInvoke: vi.fn(),
  executeActionInvoke: vi.fn(),
  getUpdateStatusInvoke: vi.fn(),
  runUpdateCheckInvoke: vi.fn(),
  getUpdatePlanInvoke: vi.fn(),
  applyUpdateComponentInvoke: vi.fn(),
  repairUpdateInvoke: vi.fn(),
  rollbackUpdateComponentInvoke: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      getAppState: { invoke: bridgeMocks.getAppStateInvoke },
      getInitialize: { invoke: vi.fn() },
      runInstallPrep: { invoke: vi.fn() },
      getDrilldown: { invoke: bridgeMocks.getDrilldownInvoke },
      executeAction: { invoke: bridgeMocks.executeActionInvoke },
      getUpdateStatus: { invoke: bridgeMocks.getUpdateStatusInvoke },
      runUpdateCheck: { invoke: bridgeMocks.runUpdateCheckInvoke },
      getUpdatePlan: { invoke: bridgeMocks.getUpdatePlanInvoke },
      applyUpdateComponent: { invoke: bridgeMocks.applyUpdateComponentInvoke },
      repairUpdate: { invoke: bridgeMocks.repairUpdateInvoke },
      rollbackUpdateComponent: { invoke: bridgeMocks.rollbackUpdateComponentInvoke },
    },
    shell: {
      openFolderWith: { invoke: vi.fn() },
    },
  },
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

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

const appStateResult = {
  surface: 'app_state_fast',
  command: 'opl app state --profile fast --json',
  stdout: '{}',
  parsed: {
    app_state: {
      schema_version: 'opl_app_state.v1',
      surface_kind: 'opl_app_state',
      operator: { status: 'ready', summary: 'ready' },
      core: {
        codex: {
          parsed_version: '0.125.0',
          default_model: 'gpt-5.5',
          default_reasoning_effort: 'xhigh',
        },
      },
      provider: {
        temporal: { status: 'attention_needed', health_status: 'attention_needed' },
      },
      paths: {
        family_workspace_root: {
          selected_path: '/Users/example/workspace',
        },
      },
      modules: {
        summary: { default_modules_count: 4, healthy_default_modules_count: 4 },
        source: {
          mode: 'sibling_workspace',
          modules_root: '/Users/example/workspace',
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
            version: 'bookforge-1.0.0',
            install_origin: 'managed_root',
            path: '/Users/example/workspace/modules/bookforge',
          },
          {
            module_id: 'mas',
            display_name: 'med-autoscience',
            status: 'ready',
          },
          {
            module_id: 'oma',
            display_name: 'opl-meta-agent',
            status: 'ready',
          },
          {
            module_id: 'opl-flow',
            display_name: 'opl-flow',
            status: 'ready',
          },
        ],
      },
      actions: [],
    },
  },
};

const managedUpdateStatusResult = {
  surface: 'update_status',
  command: 'opl update status --json',
  stdout: '{}',
  parsed: {
    managed_update: {
      operation: 'status',
      operation_mode: 'read_only_projection',
      update_channel: 'stable',
      idempotency_lock: { status: 'free' },
      components: [
        {
          component_id: 'app_binary',
          display_group: 'App binary',
          state: 'current',
          conditions: [{ type: 'Available', status: 'True', reason: 'Current', message: 'App bundle is current' }],
          receipt: { last_receipt_ref: 'receipt://app-binary/current' },
          needs_restart: false,
        },
        {
          component_id: 'runtime_toolchain',
          display_group: 'Runtime/toolchain',
          state: 'update_available',
          safe_to_apply: true,
          conditions: [
            {
              type: 'ReadyToApply',
              status: 'True',
              reason: 'Verified',
              message: 'Runtime update is verified',
            },
          ],
          receipt: {
            last_receipt_ref: 'receipt://runtime_toolchain/latest',
            rollback_ref: 'rollback://runtime_toolchain/previous',
            repair_action: 'runtime_toolchain_repair_only',
          },
          needs_restart: true,
          reload_guidance: 'Restart the app after apply.',
        },
        {
          component_id: 'agent_package_channel',
          display_group: 'Agent packages',
          state: 'failed_with_repair',
          conditions: [
            {
              type: 'PostApplySync',
              status: 'False',
              reason: 'SyncFailed',
              message: 'Skill sync needs repair',
            },
          ],
          receipt: {
            last_receipt_ref: 'receipt://agent_package_channel/failed-sync',
            repair_action: 'agent_package_reconcile_and_skill_sync_only',
          },
          needs_reload: true,
          reload_guidance: 'Reload Codex plugin cache after repair.',
        },
        {
          component_id: 'capability_exposure',
          display_group: 'Capability exposure',
          state: 'needs_reload',
          safe_to_apply: true,
          rollback_allowed: true,
          conditions: [
            {
              type: 'Visible',
              status: 'Unknown',
              reason: 'CacheStale',
              message: 'Capability exposure cache is stale',
            },
          ],
          receipt: { last_receipt_ref: 'receipt://capability_exposure/cache' },
          needs_reload: true,
          reload_guidance: 'Reload the app to refresh visible capabilities.',
        },
      ],
      repair_actions: [
        {
          component_id: 'agent_package_channel',
          receipt_ref: 'receipt://agent_package_channel/failed-sync',
          action_ref: 'repair://agent_package_channel/sync',
        },
      ],
      reload_guidance: 'Restart or reload only when a component reports it.',
    },
  },
};

const managedUpdateAutoApplyPlanResult = {
  surface: 'update_plan',
  command: 'opl update plan --json',
  stdout: '{}',
  parsed: {
    managed_update: {
      operation: 'plan',
      idempotency_lock: { status: 'released' },
      execution: { status: 'completed' },
      reload_guidance: 'Reload visible OPL capabilities after background maintenance.',
      components: [
        {
          component_id: 'runtime_toolchain',
          state: 'update_available',
          safe_to_apply: true,
          needs_restart: true,
          reload_guidance: 'Restart the app before the new runtime is visible.',
        },
        {
          component_id: 'agent_package_channel',
          state: 'update_available',
          safe_to_apply: true,
          reload_guidance: 'Reload Codex plugin cache after agent package sync.',
        },
        {
          component_id: 'capability_exposure',
          state: 'staged',
          safe_to_apply: true,
          needs_reload: true,
          reload_guidance: 'Reload the app to refresh visible capabilities.',
        },
      ],
    },
  },
};

describe('RuntimeSettings app state bridge usage', () => {
  beforeEach(() => {
    resetManagedUpdateMaintenanceForTest();
    vi.clearAllMocks();
    localStorage.clear();
    bridgeMocks.getAppStateInvoke.mockResolvedValue(appStateResult);
    bridgeMocks.getUpdateStatusInvoke.mockResolvedValue(managedUpdateStatusResult);
    bridgeMocks.runUpdateCheckInvoke.mockResolvedValue(managedUpdateStatusResult);
    bridgeMocks.getUpdatePlanInvoke.mockResolvedValue(managedUpdateStatusResult);
    bridgeMocks.applyUpdateComponentInvoke.mockResolvedValue({
      ...managedUpdateStatusResult,
      surface: 'update_apply',
      command: 'opl update apply --component runtime_toolchain --json',
    });
    bridgeMocks.repairUpdateInvoke.mockResolvedValue({
      ...managedUpdateStatusResult,
      surface: 'update_repair',
      command: 'opl update repair --receipt receipt://agent_package_channel/failed-sync --json',
    });
    bridgeMocks.rollbackUpdateComponentInvoke.mockResolvedValue({
      ...managedUpdateStatusResult,
      surface: 'update_rollback',
      command: 'opl update rollback --component runtime_toolchain --json',
    });
    bridgeMocks.getDrilldownInvoke.mockImplementation(({ detail }: { detail: 'summary' | 'full' }) =>
      Promise.resolve(
        detail === 'summary'
          ? {
              surface: 'runtime_summary',
              command: 'opl runtime app-operator-drilldown --json',
              stdout: JSON.stringify({
                app_operator_drilldown: {
                  surface_kind: 'opl_app_operator_drilldown_read_model',
                  availability: 'available',
                  summary: {
                    stage_attempt_count: 25,
                    current_control_state_blocked_count: 3,
                    current_control_state_running_provider_attempt_count: 2,
                    current_control_state_running_provider_attempt_domain_ids: ['medautoscience'],
                    current_control_state_running_provider_attempt_task_kinds: [
                      'paper_autonomy/repair-recheck',
                      'publication_aftercare/reviewer-refresh',
                    ],
                    current_control_state_running_provider_attempt_stage_attempt_ids: ['sat_dm002', 'sat_dm003'],
                    current_control_state_latest_running_provider_heartbeat_at: '2026-06-02T00:01:12.853Z',
                    current_control_state_running_provider_attempt_summary_policy:
                      'refs_only_liveness_projection_no_domain_ready_publication_ready_or_artifact_ready',
                  },
                  current_control_state: {
                    summary: {
                      running_provider_attempt_count: 2,
                      running_provider_attempt_domain_ids: ['medautoscience'],
                      running_provider_attempt_task_kinds: [
                        'paper_autonomy/repair-recheck',
                        'publication_aftercare/reviewer-refresh',
                      ],
                      running_provider_attempt_stage_attempt_ids: ['sat_dm002', 'sat_dm003'],
                      latest_running_provider_heartbeat_at: '2026-06-02T00:01:12.853Z',
                      running_provider_attempt_summary_policy:
                        'refs_only_liveness_projection_no_domain_ready_publication_ready_or_artifact_ready',
                    },
                    states: [
                      {
                        task_id: 'frt_dm002',
                        domain_id: 'medautoscience',
                        task_kind: 'paper_autonomy/repair-recheck',
                        running_provider_attempt: true,
                        current_stage_attempt_id: 'sat_dm002',
                        workflow_id: 'wf_dm002',
                        provider_kind: 'temporal',
                        current_attempt_state: 'running',
                        provider_run: {
                          provider_status: 'running',
                          last_heartbeat_at: '2026-06-02T00:01:12.853Z',
                        },
                      },
                      {
                        task_id: 'frt_dm003',
                        domain_id: 'medautoscience',
                        task_kind: 'publication_aftercare/reviewer-refresh',
                        running_provider_attempt: true,
                        current_stage_attempt_id: 'sat_dm003',
                        workflow_id: 'wf_dm003',
                        provider_kind: 'temporal',
                        current_attempt_state: 'checkpointed',
                        provider_run: {
                          provider_status: 'checkpointed',
                          last_heartbeat_at: '2026-06-02T00:01:10.000Z',
                        },
                      },
                    ],
                  },
                  attention_first_payload: {
                    provider_health: {
                      provider_kind: 'temporal',
                      health_status: 'ready',
                    },
                  },
                },
              }),
              parsed: undefined,
            }
          : {
              surface: 'runtime_full',
              command: 'opl runtime app-operator-drilldown --detail full --json',
              stdout: '{}',
              parsed: {
                app_operator_drilldown: { surface_kind: 'opl_app_operator_drilldown_read_model', status: 'ready' },
              },
            }
      )
    );
  });

  it('loads the fast OPL app state on initial render and fast App state on page refresh', async () => {
    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));
    expect(bridgeMocks.getDrilldownInvoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('settings.oplEnvironmentPage.actions.refresh'));

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(2));
    expect(bridgeMocks.getAppStateInvoke).toHaveBeenLastCalledWith({ profile: 'fast' });
    expect(bridgeMocks.getDrilldownInvoke).not.toHaveBeenCalled();
  });

  it('renders runtime status and module path-source values through i18n aliases', async () => {
    render(<RuntimeSettings />);

    await waitFor(() =>
      expect(
        screen.getAllByText('settings.oplEnvironmentPage.status.attention_required attention_required').length
      ).toBeGreaterThan(0)
    );
    fireEvent.click(screen.getByText('settings.oplEnvironmentPage.diagnostics.title'));
    fireEvent.click(screen.getByText('settings.oplEnvironmentPage.diagnostics.modulesTitle'));
    expect(document.body.textContent).toContain(
      'settings.oplEnvironmentPage.moduleVersion.pathSources.familyWorkspaceRoot'
    );
    expect(screen.queryByText('settings.oplEnvironmentPage.status.attention_needed')).not.toBeInTheDocument();
  });

  it('normalizes OPL plugin and module labels to one display style', async () => {
    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));

    expect(screen.getAllByText('MAS').length).toBeGreaterThan(0);
    expect(screen.getAllByText('OMA').length).toBeGreaterThan(0);
    expect(screen.getAllByText('OBF').length).toBeGreaterThan(0);
    expect(screen.getAllByText('OPL Flow').length).toBeGreaterThan(0);
    expect(screen.queryByText('med-autoscience')).not.toBeInTheDocument();
    expect(screen.queryByText('opl-meta-agent')).not.toBeInTheDocument();
    expect(screen.queryByText('opl-flow')).not.toBeInTheDocument();
  });

  it('renders the unified Updates & Maintenance plane and routes controlled component actions through opl update IPC', async () => {
    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getUpdateStatusInvoke).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId('opl-managed-updates')).toHaveTextContent('settings.oplEnvironmentPage.updates.title');
    expect(screen.getByTestId('opl-managed-update-app_binary')).toHaveTextContent('App binary');
    expect(screen.getByTestId('opl-managed-update-runtime_toolchain')).toHaveTextContent('Runtime/toolchain');
    expect(screen.getByTestId('opl-managed-update-agent_package_channel')).toHaveTextContent('Agent packages');
    expect(screen.getByTestId('opl-managed-update-capability_exposure')).toHaveTextContent('Capability exposure');
    expect(screen.getByTestId('opl-managed-update-runtime_toolchain')).toHaveTextContent(
      'settings.oplEnvironmentPage.updates.userSummaries.needsRestart'
    );
    expect(screen.getByTestId('opl-managed-update-agent_package_channel')).toHaveTextContent(
      'settings.oplEnvironmentPage.updates.userSummaries.canRepair'
    );
    expect(screen.getByTestId('opl-runtime-health-summary')).toHaveTextContent(
      'settings.oplEnvironmentPage.healthSummary.usable'
    );
    expect(screen.getByTestId('opl-managed-updates')).toHaveTextContent(
      'settings.oplEnvironmentPage.updates.nextStep settings.oplEnvironmentPage.updates.nextActions.apply'
    );
    expect(screen.getByTestId('opl-managed-update-recommended-action')).toHaveTextContent(
      'settings.oplEnvironmentPage.updates.actions.recommendedRepair'
    );
    expect(screen.getByText('settings.oplEnvironmentPage.sections.workspace')).toBeInTheDocument();
    expect(screen.getByText('settings.oplEnvironmentPage.storageData.openStorage')).toBeInTheDocument();
    expect(screen.queryByText('settings.oplEnvironmentPage.updates.actions.plan')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('settings.oplEnvironmentPage.updates.advancedActions'));
    expect(screen.getByText('settings.oplEnvironmentPage.updates.actions.plan')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('settings.oplEnvironmentPage.updates.diagnostics.componentDetails')[1]);
    expect(screen.getByTestId('opl-managed-update-runtime_toolchain')).toHaveTextContent('Runtime update is verified');
    expect(screen.getByTestId('opl-managed-update-runtime_toolchain')).toHaveTextContent(
      'receipt://runtime_toolchain/latest'
    );
    fireEvent.click(screen.getAllByText('settings.oplEnvironmentPage.updates.diagnostics.componentDetails')[2]);
    expect(screen.getByTestId('opl-managed-update-agent_package_channel')).toHaveTextContent(
      'Reload Codex plugin cache after repair.'
    );

    fireEvent.click(screen.getByTestId('opl-managed-update-refresh'));
    await waitFor(() => expect(bridgeMocks.getUpdateStatusInvoke).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByTestId('opl-managed-update-apply-runtime_toolchain'));
    await waitFor(() =>
      expect(bridgeMocks.applyUpdateComponentInvoke).toHaveBeenCalledWith({ componentId: 'runtime_toolchain' })
    );
    fireEvent.click(screen.getByTestId('opl-managed-update-repair-agent_package_channel'));
    await waitFor(() =>
      expect(bridgeMocks.repairUpdateInvoke).toHaveBeenCalledWith({
        componentId: 'agent_package_channel',
        receiptId: 'receipt://agent_package_channel/failed-sync',
      })
    );
    fireEvent.click(screen.getByTestId('opl-managed-update-rollback-runtime_toolchain'));
    await waitFor(() =>
      expect(bridgeMocks.rollbackUpdateComponentInvoke).toHaveBeenCalledWith({ componentId: 'runtime_toolchain' })
    );
  });

  it('renders user-friendly agent module maintenance from app state modules and managed update actions', async () => {
    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getUpdateStatusInvoke).toHaveBeenCalledTimes(1));

    const section = screen.getByTestId('opl-module-maintenance');
    expect(section).toHaveTextContent('settings.oplEnvironmentPage.moduleMaintenance.title');
    expect(section).toHaveTextContent('MAS');
    expect(section).toHaveTextContent('MAG');
    expect(section).toHaveTextContent('RCA');
    expect(section).toHaveTextContent('OMA');
    expect(section).not.toHaveTextContent('Med Auto Science');
    expect(section).not.toHaveTextContent('OPL Meta Agent');
    expect(section).toHaveTextContent('OBF');
    expect(section).toHaveTextContent('bookforge-1.0.0');
    expect(section).toHaveTextContent('settings.oplEnvironmentPage.moduleMaintenance.status.manualRequired');
    expect(section).toHaveTextContent('settings.oplEnvironmentPage.moduleMaintenance.manualReasons.dirtyCheckout');

    fireEvent.click(screen.getByTestId('opl-module-maintenance-check'));
    await waitFor(() => expect(bridgeMocks.runUpdateCheckInvoke).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('opl-module-maintenance-repair-agent_package_channel'));
    await waitFor(() =>
      expect(bridgeMocks.repairUpdateInvoke).toHaveBeenCalledWith({
        componentId: 'agent_package_channel',
        receiptId: 'receipt://agent_package_channel/failed-sync',
      })
    );

    fireEvent.click(screen.getByTestId('opl-module-maintenance-apply-capability_exposure'));
    await waitFor(() =>
      expect(bridgeMocks.applyUpdateComponentInvoke).toHaveBeenCalledWith({
        componentId: 'capability_exposure',
      })
    );

    fireEvent.click(screen.getByTestId('opl-module-maintenance-rollback-capability_exposure'));
    await waitFor(() =>
      expect(bridgeMocks.rollbackUpdateComponentInvoke).toHaveBeenCalledWith({
        componentId: 'capability_exposure',
      })
    );
  });

  it('does not expose component mutation buttons for dirty managed module checkouts', async () => {
    bridgeMocks.getUpdateStatusInvoke.mockResolvedValueOnce({
      ...managedUpdateStatusResult,
      parsed: {
        managed_update: {
          ...managedUpdateStatusResult.parsed.managed_update,
          components: managedUpdateStatusResult.parsed.managed_update.components.map((component) =>
            component.component_id === 'agent_package_channel'
              ? { ...component, dirty_checkout: true, safe_to_apply: true, rollback_allowed: true }
              : component
          ),
        },
      },
    });

    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getUpdateStatusInvoke).toHaveBeenCalledTimes(1));

    const component = screen.getByTestId('opl-module-maintenance-component-agent_package_channel');
    expect(component).toHaveTextContent('settings.oplEnvironmentPage.updates.userSummaries.dirtyCheckout');
    expect(screen.queryByTestId('opl-module-maintenance-apply-agent_package_channel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-module-maintenance-repair-agent_package_channel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-module-maintenance-rollback-agent_package_channel')).not.toBeInTheDocument();
  });

  it('projects background managed update maintenance timestamps and failures into Settings Runtime', async () => {
    bridgeMocks.getUpdateStatusInvoke.mockResolvedValueOnce({
      ...managedUpdateStatusResult,
      ok: false,
      error: { message: 'managed update lock is held' },
    });

    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getUpdateStatusInvoke).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('settings.oplEnvironmentPage.updates.diagnostics.title'));
    const backgroundStatus = screen.getByTestId('opl-managed-update-background-status');
    expect(backgroundStatus).toHaveTextContent('settings.oplEnvironmentPage.updates.background.lastRunAt');
    expect(backgroundStatus).toHaveTextContent('settings.oplEnvironmentPage.updates.background.nextRunAt');
    expect(backgroundStatus).toHaveTextContent('settings.oplEnvironmentPage.updates.background.lastFailure');
    expect(backgroundStatus).toHaveTextContent('managed update lock is held');

    fireEvent.click(screen.getByText('settings.oplEnvironmentPage.updates.advancedActions'));
    fireEvent.click(screen.getByText('settings.oplEnvironmentPage.updates.actions.check'));

    await waitFor(() => expect(bridgeMocks.runUpdateCheckInvoke).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('opl-managed-update-background-status')).toHaveTextContent(
        'settings.oplEnvironmentPage.updates.background.noFailure'
      )
    );
  });

  it('shows loading only on the managed update read action that is running', async () => {
    let resolveCheck: (value: typeof managedUpdateStatusResult) => void = () => {};
    bridgeMocks.runUpdateCheckInvoke.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCheck = resolve;
      })
    );

    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getUpdateStatusInvoke).toHaveBeenCalledTimes(1));

    const refreshButton = screen.getByTestId('opl-managed-update-refresh');
    fireEvent.click(screen.getByText('settings.oplEnvironmentPage.updates.advancedActions'));
    const checkButton = screen.getByText('settings.oplEnvironmentPage.updates.actions.check').closest('button');
    const planButton = screen.getByText('settings.oplEnvironmentPage.updates.actions.plan').closest('button');
    expect(checkButton).toBeTruthy();
    expect(planButton).toBeTruthy();

    fireEvent.click(checkButton!);

    await waitFor(() => expect(checkButton?.className).toContain('arco-btn-loading'));
    expect(refreshButton.className).not.toContain('arco-btn-loading');
    expect(planButton?.className).not.toContain('arco-btn-loading');

    await act(async () => {
      resolveCheck(managedUpdateStatusResult);
    });

    await waitFor(() => expect(checkButton?.className).not.toContain('arco-btn-loading'));
  });

  it('projects background managed update auto-apply action, skip reason, and reload guidance', async () => {
    bridgeMocks.getUpdatePlanInvoke.mockResolvedValueOnce(managedUpdateAutoApplyPlanResult);
    bridgeMocks.applyUpdateComponentInvoke.mockImplementation(({ componentId }: { componentId: string }) =>
      Promise.resolve({
        surface: 'update_apply',
        command: `opl update apply --component ${componentId} --json`,
        stdout: '{}',
        parsed: {
          managed_update: {
            operation: 'apply',
            idempotency_lock: { status: 'released' },
            execution: { status: 'completed' },
            reload_guidance: `Reload after applying ${componentId}.`,
          },
        },
      })
    );

    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getUpdateStatusInvoke).toHaveBeenCalledTimes(1));

    await act(async () => {
      await executeManagedUpdateRead('plan', {
        background: true,
        trigger: 'daily_background_maintenance',
      });
    });

    await waitFor(() => expect(bridgeMocks.applyUpdateComponentInvoke).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByText('settings.oplEnvironmentPage.updates.diagnostics.title'));
    const backgroundStatus = screen.getByTestId('opl-managed-update-background-status');
    expect(backgroundStatus).toHaveTextContent('settings.oplEnvironmentPage.updates.background.lastAction');
    expect(backgroundStatus).toHaveTextContent('auto_apply capability_exposure completed');
    expect(backgroundStatus).toHaveTextContent('settings.oplEnvironmentPage.updates.background.lastSkipReason');
    expect(backgroundStatus).toHaveTextContent('runtime_toolchain: restart_required');
    expect(backgroundStatus).toHaveTextContent('settings.oplEnvironmentPage.updates.background.reloadGuidance');
    expect(backgroundStatus).toHaveTextContent('Reload after applying capability_exposure.');
  });

  it('keeps the Settings Runtime refresh button idle during cached background revalidation', async () => {
    let resolveState: (value: typeof appStateResult) => void = () => {};
    bridgeMocks.getAppStateInvoke.mockReturnValue(
      new Promise((resolve) => {
        resolveState = resolve;
      })
    );
    localStorage.setItem(
      'opl.appState.fast.v1',
      JSON.stringify({
        payload: appStateResult.parsed,
        loadedAt: '09:00:00',
      })
    );

    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));
    const button = screen.getByText('settings.oplEnvironmentPage.actions.refresh').closest('button');
    expect(button?.className).not.toContain('arco-btn-loading');
    expect(button?.getAttribute('aria-busy')).not.toBe('true');

    await act(async () => {
      resolveState(appStateResult);
    });
  });

  it('deduplicates Settings Runtime refresh while the initial App state read is still pending', async () => {
    let resolveState: (value: typeof appStateResult) => void = () => {};
    bridgeMocks.getAppStateInvoke.mockReturnValue(
      new Promise((resolve) => {
        resolveState = resolve;
      })
    );

    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(1));
    const button = screen.getByText('settings.oplEnvironmentPage.actions.refresh').closest('button');
    expect(button).toBeTruthy();

    fireEvent.click(button!);

    expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(1);
    expect(button?.className).toContain('arco-btn-loading');

    await act(async () => {
      resolveState(appStateResult);
    });

    await waitFor(() => expect(button?.className).not.toContain('arco-btn-loading'));
  });

  it('keeps the Runtime page refresh button idle during cached background revalidation', async () => {
    let resolveState: (value: typeof appStateResult) => void = () => {};
    bridgeMocks.getAppStateInvoke.mockReturnValue(
      new Promise((resolve) => {
        resolveState = resolve;
      })
    );
    localStorage.setItem(
      'opl.appState.fast.v1',
      JSON.stringify({
        payload: appStateResult.parsed,
        loadedAt: '09:00:00',
      })
    );

    render(<RuntimePage />);

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));
    const button = screen.getByText('common.refresh').closest('button');
    expect(button?.className).not.toContain('arco-btn-loading');
    expect(button?.getAttribute('aria-busy')).not.toBe('true');

    await act(async () => {
      resolveState(appStateResult);
    });
  });

  it('keeps Runtime page safe actions on the App action boundary', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValue({
      ...appStateResult,
      parsed: {
        app_state: {
          ...appStateResult.parsed.app_state,
          actions: [
            {
              action_id: 'legacy-runtime-action',
              submit_via: 'opl runtime action execute',
            },
            {
              action_id: 'app-boundary-action',
              submit_via: 'opl app action execute',
              can_submit_to_safe_action_shell: true,
              dry_run_supported: true,
            },
            {
              action_id: 'payload-required-action',
              submit_via: 'opl app action execute',
              can_submit_to_safe_action_shell: true,
              route_requires_domain_or_app_payload: true,
              payload_fields: ['module_id'],
            },
          ],
        },
      },
    });

    render(<RuntimePage />);

    await waitFor(() => expect(screen.getByText('common.runtime.advancedRuntimeDetails')).toBeInTheDocument());
    fireEvent.click(screen.getByText('common.runtime.advancedRuntimeDetails'));
    await waitFor(() => expect(screen.getAllByText('app-boundary-action').length).toBeGreaterThan(0));
    expect(screen.queryByText('legacy-runtime-action')).not.toBeInTheDocument();
    expect(screen.queryByText('payload-required-action')).not.toBeInTheDocument();
  });

  it('renders Runtime page as a user-facing task status view', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValue({
      ...appStateResult,
      parsed: {
        app_state: {
          ...appStateResult.parsed.app_state,
          operator: {
            status: 'ready',
            summary: {
              runtime_status: 'ready',
              provider_status: 'ready',
              visible_action_count: 20,
              profile: 'fast',
            },
            workbench: {
              domain_lane_map: {
                lanes: [
                  {
                    domain_id: 'medautoscience',
                    lane_label: 'Med Auto Science',
                    active_task_count: 1,
                    blocked_task_count: 1,
                    tasks: [
                      {
                        task_id: 'medautoscience',
                        label: 'Med Auto Science',
                        state: 'dirty',
                        active_stage_id: 'module_runtime',
                      },
                    ],
                  },
                  {
                    domain_id: 'medautogrant',
                    lane_label: 'Med Auto Grant',
                    active_task_count: 1,
                    blocked_task_count: 1,
                    tasks: [
                      {
                        task_id: 'medautogrant',
                        label: 'Med Auto Grant',
                        state: 'dirty',
                        active_stage_id: 'module_runtime',
                      },
                    ],
                  },
                  {
                    domain_id: 'redcube',
                    lane_label: 'RedCube AI',
                    active_task_count: 1,
                    blocked_task_count: 1,
                    tasks: [
                      {
                        task_id: 'redcube',
                        label: 'RedCube AI',
                        state: 'dirty',
                        active_stage_id: 'module_runtime',
                      },
                    ],
                  },
                  {
                    domain_id: 'oplmetaagent',
                    lane_label: 'OPL Meta Agent',
                    active_task_count: 1,
                    blocked_task_count: 1,
                    tasks: [
                      {
                        task_id: 'oplmetaagent',
                        label: 'OPL Meta Agent',
                        state: 'dirty',
                        active_stage_id: 'module_runtime',
                      },
                    ],
                  },
                ],
              },
              task_drilldowns: [
                {
                  task_id: 'dm002-publication-eval',
                  domain_id: 'medautoscience',
                  domain_label: 'Med Auto Science',
                  title: 'DM002 publication evaluation',
                  state: 'running',
                  active_stage_id: 'paper_autonomy/repair-recheck',
                  active_stage_label: 'Publication repair check',
                  progress_delta_classification: 'deliverable_progress',
                  deliverable_progress_delta: { count: 1 },
                  platform_repair_delta: { count: 0 },
                  next_visible_step: 'Finish reviewer evaluation against current inputs',
                  next_owner: 'AI reviewer',
                  last_progress_at: '2026-06-02T00:01:12.853Z',
                  stage_attempt_ids: ['sat_dm002'],
                  blocker_ref_count: 0,
                },
                {
                  task_id: 'dm003-publication-gate',
                  domain_id: 'medautogrant',
                  domain_label: 'Med Auto Grant',
                  title: 'DM003 grant aftercare',
                  state: 'queued',
                  active_stage_id: 'aftercare/reviewer-refresh',
                  active_stage_label: 'Reviewer refresh',
                  progress_delta_classification: 'human_gate',
                  deliverable_progress_delta: { count: 0 },
                  platform_repair_delta: { count: 0 },
                  next_visible_step: 'Wait for owner confirmation',
                  next_owner: 'User',
                  blocker_ref_count: 1,
                },
                {
                  task_id: 'redcube',
                  domain_id: 'redcube',
                  title: 'RedCube AI',
                  state: 'dirty',
                  active_stage_id: 'module_runtime',
                  blocker_ref_count: 1,
                },
                {
                  task_id: 'oplmetaagent',
                  domain_id: 'oplmetaagent',
                  title: 'OPL Meta Agent',
                  state: 'dirty',
                  active_stage_id: 'module_runtime',
                  blocker_ref_count: 1,
                },
              ],
            },
          },
        },
      },
    });

    render(<RuntimePage />);

    await waitFor(() => expect(screen.getByText('common.runtime.taskOverview')).toBeInTheDocument());
    expect(bridgeMocks.getDrilldownInvoke).toHaveBeenCalledWith({ detail: 'summary' });
    expect(screen.getByText('common.runtime.runningTasks')).toBeInTheDocument();
    expect(screen.getByText('common.runtime.runningTaskCount 1')).toBeInTheDocument();
    expect(screen.getByText('common.runtime.activeProjectCount 2')).toBeInTheDocument();
    expect(screen.getByText('common.runtime.queuedTaskCount 1')).toBeInTheDocument();
    expect(screen.getByText('common.runtime.attentionTaskCount 1')).toBeInTheDocument();
    expect(screen.getByText('common.runtime.taskProgress')).toBeInTheDocument();
    expect(screen.getByText('DM002 publication evaluation')).toBeInTheDocument();
    expect(screen.getByText('common.runtime.currentStage Publication repair check')).toBeInTheDocument();
    expect(
      screen.getByText('common.runtime.nextStep Finish reviewer evaluation against current inputs')
    ).toBeInTheDocument();
    expect(screen.getByText('common.runtime.nextOwner AI reviewer')).toBeInTheDocument();
    expect(screen.getByText('common.runtime.inactiveTasks')).toBeInTheDocument();
    expect(screen.getByText('common.runtime.inactiveTaskSummaryText 1')).toBeInTheDocument();
    expect(screen.queryByText('DM003 grant aftercare')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('common.runtime.inactiveTasks'));
    expect(screen.getByText('DM003 grant aftercare')).toBeInTheDocument();
    expect(screen.getByText('common.runtime.nextOwner User')).toBeInTheDocument();
    const defaultViewText = document.body.textContent?.split('common.runtime.advancedRuntimeDetails')[0] ?? '';
    expect(defaultViewText).not.toMatch(/Temporal|provider|projection|投影|引用|refs|stage attempt/i);
    expect(screen.queryByText('common.runtime.maintenanceAttentionSummaryText 4')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('common.runtime.advancedRuntimeDetails'));
    await waitFor(() =>
      expect(screen.getByText('common.runtime.maintenanceAttentionSummaryText 4')).toBeInTheDocument()
    );
  });

  it('keeps explicit full-detail workbench tasks in diagnostics after full detail load', async () => {
    bridgeMocks.getDrilldownInvoke.mockImplementation(({ detail }: { detail: 'summary' | 'full' }) =>
      Promise.resolve({
        surface: detail === 'summary' ? 'runtime_summary' : 'runtime_full',
        command:
          detail === 'summary'
            ? 'opl runtime app-operator-drilldown --json'
            : 'opl runtime app-operator-drilldown --detail full --json',
        stdout: JSON.stringify({
          app_operator_drilldown: {
            surface_kind: 'opl_app_operator_drilldown_read_model',
            summary: { stage_attempt_count: 25, current_control_state_blocked_count: 3 },
            runtime_workbench:
              detail === 'full'
                ? {
                    task_drilldowns: [
                      {
                        task_id: 'full-dm002',
                        domain_id: 'medautoscience',
                        domain_label: 'MAS',
                        title: 'Full detail DM002 guarded apply',
                        state: 'checkpointed',
                        active_stage_id: 'paper_autonomy/guarded-apply',
                        stage_attempt_ids: ['sat_full_dm002'],
                        progress_delta_classification: 'deliverable_progress',
                        deliverable_progress_delta: { count: 1 },
                      },
                    ],
                  }
                : {},
            artifact_gallery_refs:
              detail === 'full'
                ? {
                    refs: [
                      {
                        ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/publication_eval/latest.json',
                      },
                      {
                        ref: 'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/controller_decisions/latest.json',
                      },
                    ],
                  }
                : { refs: [] },
          },
        }),
      })
    );

    render(<RuntimePage />);

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));
    fireEvent.click(screen.getByText('common.runtime.advancedRuntimeDetails'));
    fireEvent.click(screen.getByText('common.runtime.fullDetail'));

    await waitFor(() => expect(screen.getByText('common.runtime.fullDetailReady')).toBeInTheDocument());
    expect(screen.queryByText('Full detail DM002 guarded apply')).not.toBeInTheDocument();
    expect(
      screen.getByText('studies/002-dm-china-us-mortality-attribution/artifacts/publication_eval/latest.json')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/controller_decisions/latest.json'
      )
    ).toBeInTheDocument();
  });
});
