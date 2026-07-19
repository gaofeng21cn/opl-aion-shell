import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  autoUpdateGetStatusSnapshotInvoke: vi.fn(),
  autoUpdateStatusOn: vi.fn(),
}));

const messageMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));

type TemporalFixture = {
  status: string;
  health_status: string;
  ready?: boolean;
  details?: {
    address?: string;
    address_source?: string;
    namespace?: string;
    task_queue?: string;
    scheduler_status?: string;
    scheduler?: {
      status?: string;
      ready?: boolean;
      observed_at?: string;
      schedule_status?: string;
      health_status?: string;
      error?: string | null;
      last_error?: string | null;
    };
    worker_readiness?: {
      blockers?: string[];
      lifecycle_status?: string;
      service_ready?: boolean;
      server_reachable?: boolean;
      worker_mutation_guard?: {
        mutation_guard_status?: string;
      };
      worker_ready?: boolean;
      error?: string | null;
      last_error?: string | null;
      temporal_service_lifecycle?: {
        service_status?: string;
        supervisor?: {
          installed?: boolean;
          loaded?: boolean;
          supported?: boolean;
          applicable?: boolean;
          required?: boolean;
          ready?: boolean | null;
          configuration_current?: boolean;
          status?: string;
          observed_at?: string;
          error?: string | null;
        };
      };
    };
  };
};

type TemporalActionFixture = {
  action_id: string;
  label: string;
};

const defaultTemporalState: TemporalFixture = {
  status: 'ready',
  health_status: 'ready',
  ready: true,
  details: {
    address: '127.0.0.1:7233',
    address_source: 'managed_service_supervisor',
    namespace: 'default',
    task_queue: 'opl-stage-attempts',
    scheduler: {
      status: 'ready',
      ready: true,
      observed_at: '2026-07-17T08:00:00Z',
    },
    worker_readiness: {
      lifecycle_status: 'ready',
      service_ready: true,
      server_reachable: true,
      worker_ready: true,
      temporal_service_lifecycle: {
        supervisor: {
          installed: true,
          loaded: true,
          supported: true,
          applicable: true,
          required: true,
          ready: true,
          configuration_current: true,
          status: 'loaded_running',
          observed_at: '2026-07-17T08:00:00Z',
          error: null,
        },
      },
    },
  },
};

const appState = {
  schema_version: 'opl_app_state.v1',
  meta: {
    profile: 'fast',
    generated_at: '2026-07-17T08:00:00Z',
  },
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
    temporal: structuredClone(defaultTemporalState),
  },
  actions: [] as TemporalActionFixture[],
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

function exposeTemporalActions(...actionIds: string[]) {
  appState.actions = actionIds.map((actionId) => ({
    action_id: actionId,
    label: actionId,
  }));
}

function setTemporalState(temporal: TemporalFixture) {
  const normalized = structuredClone(temporal);
  const workerReadiness = normalized.details?.worker_readiness;
  if (workerReadiness?.service_ready === true && !workerReadiness.temporal_service_lifecycle?.supervisor) {
    workerReadiness.temporal_service_lifecycle = {
      ...workerReadiness.temporal_service_lifecycle,
      service_status: 'running',
      supervisor: structuredClone(
        defaultTemporalState.details?.worker_readiness?.temporal_service_lifecycle?.supervisor ?? {}
      ),
    };
  }
  appState.provider.temporal = normalized;
}

function freshAppStatePayload() {
  const freshAppState = structuredClone(appState);
  freshAppState.meta.generated_at = new Date(Date.now() + 1_000).toISOString();
  return { app_state: freshAppState };
}

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
  restartRequired: false,
  lastReconciledCarrierCheckpoint: null,
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
    autoUpdate: {
      getStatusSnapshot: { invoke: bridgeMocks.autoUpdateGetStatusSnapshotInvoke },
      status: { on: bridgeMocks.autoUpdateStatusOn },
    },
  },
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      ...actual.Message,
      useMessage: () => [messageMocks, null],
    },
  };
});

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
      const labels: Record<string, string> = {
        'settings.oplEnvironmentPage.temporal.actions.checkScheduler': '检查调度器',
        'settings.oplEnvironmentPage.temporal.actions.checkServer': '检查 Server',
        'settings.oplEnvironmentPage.temporal.actions.restartServer': '重启 Server',
        'settings.oplEnvironmentPage.temporal.actions.checkWorker': '检查 Worker',
        'settings.oplEnvironmentPage.temporal.actions.configureAndStartServer': '配置并启动 Server',
        'settings.oplEnvironmentPage.temporal.actions.installScheduler': '安装调度器',
        'settings.oplEnvironmentPage.temporal.actions.restartWorker': '重启 Worker',
        'settings.oplEnvironmentPage.temporal.actions.startWorker': '启动 Worker',
        'settings.oplEnvironmentPage.temporal.actions.triggerScheduler': '立即运行 scheduler',
        'settings.oplEnvironmentPage.temporal.server.supervisorConfigurationDrift': '启动保护：配置需要修复',
        'settings.oplEnvironmentPage.temporal.server.supervisorNotApplicable': '启动保护：由当前部署方式负责',
        'settings.oplEnvironmentPage.temporal.messages.actionComplete': '维护已完成',
        'settings.oplEnvironmentPage.temporal.outcomes.blocked': '已拦截',
        'settings.oplEnvironmentPage.temporal.outcomes.checked': '检查完成',
        'settings.oplEnvironmentPage.temporal.outcomes.completed': '执行完成',
        'settings.oplEnvironmentPage.temporal.outcomes.failed': '执行失败',
        'settings.oplEnvironmentPage.temporal.outcomes.needsAttention': '需要处理',
        'settings.oplEnvironmentPage.temporal.blockers.unknown': '详情见技术信息',
        'settings.oplEnvironmentPage.temporal.addressSources.managed': 'OPL 托管的本机服务',
        'settings.oplEnvironmentPage.temporal.values.needsCheck': '需要检查',
        'settings.oplEnvironmentPage.temporal.values.needsAttention': '需要处理',
        'settings.oplEnvironmentPage.temporal.values.notChecked': '尚未检查',
        'settings.oplEnvironmentPage.temporal.values.notConfigured': '未配置',
        'settings.oplEnvironmentPage.temporal.values.notInstalled': '未安装',
        'settings.oplEnvironmentPage.temporal.values.reachable': '可连接',
        'settings.oplEnvironmentPage.temporal.values.ready': '运行正常',
        'settings.oplEnvironmentPage.temporal.values.restartRequired': '需要重启',
        'settings.oplEnvironmentPage.temporal.worker.developerGuardBlocked':
          '当前 OPL CLI 指向开发源码，已阻止它接管共享的托管 Worker。',
        'settings.oplEnvironmentPage.temporal.worker.developerGuardNextSteps':
          '请切回托管运行来源，或明确启用已授权的开发仓库维护。',
        'settings.oplEnvironmentPage.temporal.worker.manageSources': '管理运行来源',
      };
      if (labels[key]) return labels[key];
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
    bridgeMocks.autoUpdateGetStatusSnapshotInvoke.mockReset();
    bridgeMocks.autoUpdateStatusOn.mockReset();
    messageMocks.error.mockReset();
    messageMocks.success.mockReset();
    messageMocks.warning.mockReset();
    setTemporalState(structuredClone(defaultTemporalState));
    appState.actions = [];
    maintenanceSnapshot.result = {
      stdout: '{}',
      parsed: updateStatus,
    };
    maintenanceSnapshot.lastAction = null;
    maintenanceSnapshot.lastSkipReason = null;
    maintenanceSnapshot.reloadGuidance = null;
    maintenanceSnapshot.restartRequired = false;
    bridgeMocks.executeActionInvoke.mockResolvedValue({ ok: true, parsed: {} });
    bridgeMocks.executeManagedUpdateRead.mockResolvedValue({
      ok: true,
      stdout: '{}',
      parsed: updateStatus,
    });
    bridgeMocks.loadAppState.mockImplementation(async () => freshAppStatePayload());
    bridgeMocks.autoUpdateGetStatusSnapshotInvoke.mockResolvedValue({ status: 'not-available' });
    bridgeMocks.autoUpdateStatusOn.mockReturnValue(() => undefined);
  });

  it('does not probe update status, check, or plan when the page mounts without a startup snapshot', () => {
    maintenanceSnapshot.result = null;

    render(<RuntimeSettings />);

    expect(bridgeMocks.executeManagedUpdateRead).not.toHaveBeenCalled();
  });

  it('uses the same main-process updater snapshot semantics as About without checking on mount', async () => {
    bridgeMocks.autoUpdateGetStatusSnapshotInvoke.mockResolvedValueOnce({
      status: 'available',
      version: '26.7.18',
    });

    render(<RuntimeSettings />);

    const appUpdateItem = await screen.findByTestId('opl-maintenance-hub-appUpdates');
    await waitFor(() => {
      expect(appUpdateItem).toHaveTextContent('settings.aboutUpdateAvailable 26.7.18');
    });
    expect(bridgeMocks.autoUpdateGetStatusSnapshotInvoke).toHaveBeenCalledTimes(1);
    expect(bridgeMocks.executeManagedUpdateRead).not.toHaveBeenCalled();
  });

  it('keeps the canonical three base dependencies ordered and hides diagnostic-only bytes on the main page', async () => {
    maintenanceSnapshot.result = {
      stdout: '{}',
      parsed: {
        managed_update: {
          operation: 'status',
          components: [
            {
              component_id: 'opl_base',
              state: 'current',
              current: {
                dependency_catalog: {
                  lifecycle_owner: 'opl_base',
                  dependencies: [
                    {
                      dependency_id: 'officecli',
                      installed: true,
                      version: '1.0.0',
                      currentness: 'current',
                      ownership: 'opl_managed',
                      update_mode: 'silent_managed',
                      binary_path: '/private/managed/bin/officecli',
                    },
                    {
                      dependency_id: 'temporal-system-cli',
                      installed: true,
                      version: '1.4.0',
                      currentness: 'current',
                      ownership: 'global_path',
                      update_mode: 'detect_only_guidance',
                      binary_path: '/opt/homebrew/bin/temporal',
                      guidance: 'Update with the original package manager.',
                    },
                    {
                      dependency_id: 'codex-cli',
                      installed: true,
                      version: '0.144.3',
                      currentness: 'current',
                      ownership: 'opl_managed',
                      update_mode: 'silent_managed',
                      binary_path: '/private/managed/bin/codex',
                    },
                    {
                      dependency_id: 'mineru',
                      installed: true,
                      version: '2.0.0',
                      currentness: 'current',
                      ownership: 'opl_managed',
                      update_mode: 'silent_managed',
                      binary_path: '/private/managed/bin/mineru',
                    },
                    {
                      dependency_id: 'temporal-runtime',
                      installed: true,
                      version: '1.11.0',
                      currentness: 'current',
                      ownership: 'opl_managed_runtime_generation',
                      update_mode: 'silent_managed',
                      binary_path: '/private/managed/bin/temporal-runtime',
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    };

    render(<RuntimeSettings />);

    const summary = await screen.findByTestId('settings-maintenance-base-dependency-summary');
    expect(
      within(summary)
        .getAllByTestId(/^opl-base-dependency-summary-/)
        .map((row) => row.dataset.testid)
    ).toEqual([
      'opl-base-dependency-summary-codex-cli',
      'opl-base-dependency-summary-temporal-runtime',
      'opl-base-dependency-summary-temporal-system-cli',
    ]);
    expect(summary).not.toHaveTextContent('/private/managed/bin');
    expect(summary).not.toHaveTextContent('opl_managed_runtime_generation');
    expect(summary).not.toHaveTextContent('Update with the original package manager.');
    expect(summary).not.toHaveTextContent('officecli');
    expect(summary).not.toHaveTextContent('mineru');
  });

  it.each([
    'managed',
    'managed_local_service_state',
    'managed_service_supervisor',
    'packaged_local_default',
    ' PACKAGED_LOCAL_DEFAULT ',
  ])('labels %s as an OPL-managed Temporal address source', (addressSource) => {
    const temporal = structuredClone(defaultTemporalState);
    if (temporal.details) temporal.details.address_source = addressSource;
    setTemporalState(temporal);

    render(<RuntimeSettings />);

    expect(screen.getByTestId('settings-maintenance-temporal-server')).toHaveTextContent('OPL 托管的本机服务');
  });

  it('shows the real server restart action when the managed Temporal service is healthy', async () => {
    exposeTemporalActions('provider_service_status', 'provider_service_start', 'provider_service_restart');
    bridgeMocks.executeActionInvoke.mockResolvedValueOnce({
      ok: true,
      parsed: { app_action_execution: { result: { restart_status: 'restarted' } } },
    });

    render(<RuntimeSettings />);

    expect(screen.queryByTestId('settings-maintenance-temporal-action-provider_service_start')).not.toBeInTheDocument();
    const restartButton = screen.getByTestId('settings-maintenance-temporal-action-provider_service_restart');
    expect(restartButton).toBeEnabled();
    expect(restartButton).toHaveTextContent('重启 Server');
    fireEvent.click(restartButton);

    await waitFor(() => expect(messageMocks.success).toHaveBeenCalledWith('维护已完成'));
    expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
      actionId: 'provider_service_restart',
      dryRun: false,
    });
    expect(bridgeMocks.loadAppState).toHaveBeenCalledTimes(1);
  });

  it('rejects restart success when the action reports restart_unready even if fast state is ready', async () => {
    exposeTemporalActions('provider_service_status', 'provider_service_restart');
    bridgeMocks.executeActionInvoke.mockResolvedValueOnce({
      ok: true,
      parsed: {
        app_action_execution: {
          result: {
            family_runtime_service: {
              action: 'restart',
              restart_status: 'restart_unready',
              ready: false,
            },
          },
        },
      },
    });

    render(<RuntimeSettings />);
    fireEvent.click(screen.getByTestId('settings-maintenance-temporal-action-provider_service_restart'));

    await waitFor(() => expect(messageMocks.error).toHaveBeenCalled());
    expect(messageMocks.success).not.toHaveBeenCalled();
    expect(bridgeMocks.loadAppState).not.toHaveBeenCalled();
  });

  it('fails closed when a ready provider omits explicit service readiness', () => {
    setTemporalState({
      status: 'ready',
      health_status: 'ready',
      ready: true,
      details: {
        address: '127.0.0.1:7233',
        address_source: 'managed',
        namespace: 'default',
        task_queue: 'opl-stage-attempts',
        scheduler: {
          status: 'ready',
          ready: true,
        },
        worker_readiness: {
          lifecycle_status: 'ready',
          server_reachable: true,
          worker_ready: true,
        },
      },
    });
    exposeTemporalActions(
      'provider_service_status',
      'provider_service_start',
      'provider_worker_status',
      'provider_worker_restart',
      'provider_scheduler_status'
    );

    render(<RuntimeSettings />);

    const serverRow = screen.getByTestId('settings-maintenance-temporal-server');
    expect(within(serverRow).getByText('尚未检查')).toBeVisible();
    expect(within(serverRow).queryByText('可连接')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-maintenance-temporal-action-provider_service_start')).toBeEnabled();
  });

  it('does not let provider readiness override an explicitly unready worker', () => {
    setTemporalState({
      status: 'ready',
      health_status: 'ready',
      ready: true,
      details: {
        address: '127.0.0.1:7233',
        address_source: 'managed',
        namespace: 'default',
        task_queue: 'opl-stage-attempts',
        worker_readiness: {
          lifecycle_status: 'worker_not_ready',
          service_ready: true,
          server_reachable: true,
          worker_ready: false,
        },
      },
    });
    exposeTemporalActions(
      'provider_service_status',
      'provider_worker_status',
      'provider_worker_start',
      'provider_worker_restart'
    );

    render(<RuntimeSettings />);

    expect(within(screen.getByTestId('settings-maintenance-temporal-server')).getByText('可连接')).toBeVisible();
    const workerRow = screen.getByTestId('settings-maintenance-temporal-worker');
    expect(within(workerRow).queryByText('运行正常')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-maintenance-temporal-action-provider_worker_start')).toBeEnabled();
    expect(
      screen.queryByTestId('settings-maintenance-temporal-action-provider_worker_restart')
    ).not.toBeInTheDocument();
  });

  it('requires the macOS local service supervisor before reporting Temporal ready', () => {
    setTemporalState({
      status: 'attention_needed',
      health_status: 'attention_needed',
      details: {
        address: '127.0.0.1:7233',
        address_source: 'managed_local_service_state',
        namespace: 'default',
        task_queue: 'opl-stage-attempts',
        scheduler: { status: 'ready', ready: true },
        worker_readiness: {
          lifecycle_status: 'ready',
          service_ready: true,
          server_reachable: true,
          worker_ready: true,
          temporal_service_lifecycle: {
            service_status: 'running',
            supervisor: {
              installed: true,
              loaded: true,
              supported: true,
              applicable: true,
              required: true,
              ready: false,
              configuration_current: false,
              status: 'configuration_drift',
              error: 'temporal_service_supervisor_configuration_drift',
            },
          },
        },
      },
    });
    exposeTemporalActions('provider_service_status', 'provider_service_start');

    render(<RuntimeSettings />);

    expect(screen.getByTestId('settings-maintenance-temporal-status')).toHaveTextContent('需要处理');
    expect(screen.getByTestId('settings-maintenance-temporal-server')).toHaveTextContent('启动保护：配置需要修复');
    expect(screen.getByTestId('settings-maintenance-temporal-action-provider_service_start')).toBeEnabled();
  });

  it('does not require a LaunchAgent for an explicit external Temporal deployment', () => {
    setTemporalState({
      status: 'ready',
      health_status: 'ready',
      ready: true,
      details: {
        address: 'temporal.example.test:7233',
        address_source: 'environment',
        namespace: 'default',
        task_queue: 'opl-stage-attempts',
        scheduler: { status: 'ready', ready: true },
        worker_readiness: {
          lifecycle_status: 'ready',
          service_ready: true,
          server_reachable: true,
          worker_ready: true,
          temporal_service_lifecycle: {
            service_status: 'external_running',
            supervisor: {
              installed: false,
              loaded: false,
              supported: true,
              applicable: false,
              required: false,
              ready: false,
              configuration_current: false,
              status: 'not_applicable',
              error: null,
            },
          },
        },
      },
    });
    exposeTemporalActions('provider_service_status');

    render(<RuntimeSettings />);

    expect(screen.getByTestId('settings-maintenance-temporal-status')).toHaveTextContent('运行正常');
    expect(screen.getByTestId('settings-maintenance-temporal-server')).toHaveTextContent(
      '启动保护：由当前部署方式负责'
    );
    expect(screen.getByTestId('settings-maintenance-temporal-server')).toHaveTextContent('可连接');
  });

  it('fails closed when a ready provider omits explicit worker readiness', () => {
    setTemporalState({
      status: 'ready',
      health_status: 'ready',
      ready: true,
      details: {
        address: '127.0.0.1:7233',
        address_source: 'managed',
        namespace: 'default',
        task_queue: 'opl-stage-attempts',
        worker_readiness: {
          lifecycle_status: 'not_checked',
          service_ready: true,
          server_reachable: true,
        },
      },
    });
    exposeTemporalActions('provider_worker_status', 'provider_worker_start', 'provider_worker_restart');

    render(<RuntimeSettings />);

    const workerRow = screen.getByTestId('settings-maintenance-temporal-worker');
    expect(within(workerRow).queryByText('运行正常')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-maintenance-temporal-action-provider_worker_start')).toBeEnabled();
    expect(
      screen.queryByTestId('settings-maintenance-temporal-action-provider_worker_restart')
    ).not.toBeInTheDocument();
  });

  it('labels the landed-but-unconfigured provider consistently and offers server setup', () => {
    setTemporalState({
      status: 'provider_code_landed_unconfigured',
      health_status: 'attention_needed',
      details: {
        address_source: 'not_configured',
        worker_readiness: {
          lifecycle_status: 'not_configured',
          worker_ready: false,
        },
      },
    });
    exposeTemporalActions('provider_service_status', 'provider_service_start');

    render(<RuntimeSettings />);

    expect(screen.getByTestId('settings-maintenance-temporal-status')).toHaveTextContent('未配置');
    expect(screen.getByTestId('settings-maintenance-temporal-action-provider_service_start')).toBeEnabled();
    expect(screen.getByTestId('settings-maintenance-temporal')).not.toHaveTextContent(
      'provider_code_landed_unconfigured'
    );
  });

  it('prioritizes a concrete worker failure over an aggregate unconfigured provider status', () => {
    setTemporalState({
      status: 'provider_code_landed_unconfigured',
      health_status: 'attention_needed',
      details: {
        address: '127.0.0.1:7233',
        address_source: 'managed_service_supervisor',
        scheduler: { status: 'ready', ready: true },
        worker_readiness: {
          lifecycle_status: 'worker_source_stale',
          service_ready: true,
          server_reachable: true,
          worker_ready: false,
        },
      },
    });

    render(<RuntimeSettings />);

    expect(screen.getByTestId('settings-maintenance-temporal-status')).toHaveTextContent('需要处理');
    expect(screen.getByTestId('settings-maintenance-temporal-status')).not.toHaveTextContent('未配置');
    expect(screen.getByTestId('settings-maintenance-temporal-server')).toHaveTextContent('可连接');
    expect(screen.getByTestId('settings-maintenance-temporal-worker')).toHaveTextContent('需要重启');
  });

  it('localizes ordinary Temporal status and blocker codes without exposing raw implementation identifiers', () => {
    setTemporalState({
      status: 'managed_local_service_state',
      health_status: 'managed_local_service_state',
      details: {
        address: '127.0.0.1:7233',
        address_source: 'managed',
        namespace: 'default',
        task_queue: 'opl-stage-attempts',
        scheduler_status: 'opaque_scheduler_state',
        worker_readiness: {
          blockers: ['opaque_worker_blocker'],
          lifecycle_status: 'opaque_worker_state',
          service_ready: true,
          server_reachable: true,
          worker_ready: false,
        },
      },
    });
    exposeTemporalActions(
      'provider_service_status',
      'provider_worker_status',
      'provider_worker_start',
      'provider_scheduler_status'
    );

    render(<RuntimeSettings />);

    const panel = screen.getByTestId('settings-maintenance-temporal');
    expect(panel).toHaveTextContent('需要检查');
    expect(panel).toHaveTextContent('详情见技术信息');
    expect(panel.textContent).not.toMatch(
      /\bready\b|managed_local_service_state|opaque_scheduler_state|opaque_worker_state|opaque_worker_blocker|provider_(service|worker|scheduler)_/i
    );
  });

  it('checks an unknown scheduler before offering installation and localizes the resulting evidence', async () => {
    setTemporalState({
      status: 'ready',
      health_status: 'ready',
      ready: true,
      details: {
        address: '127.0.0.1:7233',
        address_source: 'managed',
        namespace: 'default',
        task_queue: 'opl-stage-attempts',
        worker_readiness: {
          lifecycle_status: 'ready',
          service_ready: true,
          server_reachable: true,
          worker_ready: true,
          temporal_service_lifecycle: {
            supervisor: {
              installed: true,
              loaded: true,
              ready: true,
              configuration_current: true,
              status: 'loaded_running',
              observed_at: '2026-07-17T08:00:00Z',
              error: null,
            },
          },
        },
      },
    });
    exposeTemporalActions('provider_scheduler_status', 'provider_scheduler_install');
    bridgeMocks.executeActionInvoke.mockResolvedValueOnce({
      ok: true,
      parsed: {
        app_action_execution: {
          result: {
            schedule_status: 'not_installed',
          },
        },
      },
    });

    render(<RuntimeSettings />);

    expect(screen.getByTestId('settings-maintenance-temporal-action-provider_scheduler_status')).toBeEnabled();
    expect(
      screen.queryByTestId('settings-maintenance-temporal-action-provider_scheduler_install')
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('settings-maintenance-temporal-action-provider_scheduler_status'));

    const installButton = await screen.findByTestId('settings-maintenance-temporal-action-provider_scheduler_install');
    expect(installButton).toBeEnabled();
    const evidence = screen.getByTestId('settings-maintenance-temporal-readback');
    expect(evidence).toHaveTextContent('检查调度器');
    expect(evidence).toHaveTextContent('需要处理');
    expect(evidence.textContent).toMatch(/\d{1,2}:\d{2}/);
    expect(evidence).not.toHaveTextContent('provider_scheduler_status');
    expect(evidence).not.toHaveTextContent('not_installed');
  });

  it('keeps a failed scheduler out of aggregate ready and the keyboard action success path', async () => {
    const user = userEvent.setup();
    setTemporalState({
      status: 'ready',
      health_status: 'ready',
      ready: true,
      details: {
        address: '127.0.0.1:7233',
        address_source: 'managed',
        namespace: 'default',
        task_queue: 'opl-stage-attempts',
        scheduler: {
          status: 'error',
          ready: false,
          observed_at: '2026-07-17T08:00:00Z',
        },
        worker_readiness: {
          lifecycle_status: 'ready',
          service_ready: true,
          server_reachable: true,
          worker_ready: true,
          temporal_service_lifecycle: {
            service_status: 'running',
            supervisor: structuredClone(
              defaultTemporalState.details?.worker_readiness?.temporal_service_lifecycle?.supervisor ?? {}
            ),
          },
        },
      },
    });
    exposeTemporalActions('provider_scheduler_status');
    bridgeMocks.executeActionInvoke.mockResolvedValueOnce({
      ok: true,
      parsed: {
        app_action_execution: {
          result: {
            status: 'failed',
          },
        },
      },
    });

    render(<RuntimeSettings />);

    expect(screen.getByTestId('settings-maintenance-temporal-status')).not.toHaveTextContent('运行正常');
    expect(screen.getByTestId('settings-maintenance-exception')).toBeInTheDocument();
    const action = screen.getByTestId('settings-maintenance-temporal-action-provider_scheduler_status');
    action.focus();
    await user.keyboard('{Enter}');

    const evidence = await screen.findByTestId('settings-maintenance-temporal-readback');
    expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
      actionId: 'provider_scheduler_status',
      dryRun: false,
    });
    expect(messageMocks.success).not.toHaveBeenCalled();
    expect(messageMocks.error).toHaveBeenCalledTimes(1);
    expect(evidence).toHaveTextContent('失败');
  });

  it('renders localized action evidence instead of action ids and raw outcomes', async () => {
    setTemporalState({
      status: 'ready',
      health_status: 'ready',
      ready: true,
      details: {
        address: '127.0.0.1:7233',
        address_source: 'managed',
        namespace: 'default',
        task_queue: 'opl-stage-attempts',
        scheduler_status: 'ready',
        worker_readiness: {
          lifecycle_status: 'ready',
          service_ready: true,
          server_reachable: true,
          worker_ready: true,
          temporal_service_lifecycle: {
            service_status: 'running',
            supervisor: structuredClone(
              defaultTemporalState.details?.worker_readiness?.temporal_service_lifecycle?.supervisor ?? {}
            ),
          },
        },
      },
    });
    exposeTemporalActions('provider_service_status');
    bridgeMocks.executeActionInvoke.mockResolvedValueOnce({
      ok: true,
      parsed: {
        app_action_execution: {
          result: {
            service_status: 'running',
          },
        },
      },
    });

    render(<RuntimeSettings />);
    fireEvent.click(screen.getByTestId('settings-maintenance-temporal-action-provider_service_status'));

    const evidence = await screen.findByTestId('settings-maintenance-temporal-readback');
    expect(evidence).toHaveTextContent('检查 Server');
    expect(evidence).toHaveTextContent('检查完成');
    expect(evidence.textContent).toMatch(/\d{1,2}:\d{2}/);
    expect(evidence).not.toHaveTextContent('provider_service_status');
    expect(evidence).not.toHaveTextContent('running');
  });

  it.each(['stale', 'guidance_only'])('fails closed when a Temporal action returns %s', async (status) => {
    exposeTemporalActions('provider_service_status');
    bridgeMocks.executeActionInvoke.mockResolvedValueOnce({
      ok: true,
      parsed: {
        app_action_execution: {
          result: { status },
        },
      },
    });

    render(<RuntimeSettings />);
    fireEvent.click(screen.getByTestId('settings-maintenance-temporal-action-provider_service_status'));

    const evidence = await screen.findByTestId('settings-maintenance-temporal-readback');
    expect(messageMocks.success).not.toHaveBeenCalled();
    expect(messageMocks.error).toHaveBeenCalledTimes(1);
    expect(bridgeMocks.loadAppState).not.toHaveBeenCalled();
    expect(evidence).toHaveTextContent('执行失败');
  });

  it('runs an available scheduler immediately and performs one fresh readback', async () => {
    exposeTemporalActions('provider_scheduler_trigger');
    bridgeMocks.executeActionInvoke.mockResolvedValueOnce({
      ok: true,
      parsed: {
        app_action_execution: {
          result: { status: 'triggered' },
        },
      },
    });

    render(<RuntimeSettings />);
    const triggerButton = screen.getByTestId('settings-maintenance-temporal-action-provider_scheduler_trigger');
    expect(triggerButton).toBeEnabled();
    fireEvent.click(triggerButton);

    await waitFor(() => expect(messageMocks.success).toHaveBeenCalledWith('维护已完成'));
    expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
      actionId: 'provider_scheduler_trigger',
      dryRun: false,
    });
    expect(bridgeMocks.loadAppState).toHaveBeenCalledTimes(1);
    expect(bridgeMocks.loadAppState).toHaveBeenCalledWith('fast', {
      showRefreshing: true,
      forceFresh: true,
    });
  });

  it('fails closed when scheduler trigger readback no longer has all Temporal components ready', async () => {
    exposeTemporalActions('provider_scheduler_trigger');
    bridgeMocks.executeActionInvoke.mockResolvedValueOnce({
      ok: true,
      parsed: {
        app_action_execution: {
          result: { status: 'triggered' },
        },
      },
    });
    const degradedAppState = freshAppStatePayload().app_state;
    const temporal = degradedAppState.provider.temporal as TemporalFixture;
    if (temporal.details?.worker_readiness) {
      temporal.details.worker_readiness.worker_ready = false;
      temporal.details.worker_readiness.lifecycle_status = 'worker_not_ready';
    }
    bridgeMocks.loadAppState.mockResolvedValueOnce({ app_state: degradedAppState });

    render(<RuntimeSettings />);
    fireEvent.click(screen.getByTestId('settings-maintenance-temporal-action-provider_scheduler_trigger'));

    await waitFor(() => expect(messageMocks.error).toHaveBeenCalledTimes(1));
    expect(messageMocks.success).not.toHaveBeenCalled();
    expect(bridgeMocks.loadAppState).toHaveBeenCalledTimes(1);
  });

  it('uses exactly one fresh state readback after starting a Temporal server', async () => {
    setTemporalState({
      status: 'provider_code_landed_unconfigured',
      health_status: 'attention_needed',
      details: {
        address_source: 'not_configured',
        worker_readiness: {
          lifecycle_status: 'not_configured',
          server_reachable: false,
          worker_ready: false,
        },
      },
    });
    exposeTemporalActions('provider_service_status', 'provider_service_start');
    const readyAppState = freshAppStatePayload().app_state;
    readyAppState.provider.temporal = {
      status: 'ready',
      health_status: 'ready',
      ready: true,
      details: {
        address: '127.0.0.1:7233',
        address_source: 'managed_service_supervisor',
        namespace: 'default',
        task_queue: 'opl-stage-attempts',
        scheduler: {
          status: 'ready',
          ready: true,
          observed_at: '2026-07-17T08:00:00Z',
        },
        worker_readiness: {
          lifecycle_status: 'ready',
          service_ready: true,
          server_reachable: true,
          worker_ready: true,
          temporal_service_lifecycle: {
            service_status: 'running',
            supervisor: {
              installed: true,
              loaded: true,
              supported: true,
              applicable: true,
              required: true,
              ready: true,
              configuration_current: true,
              status: 'loaded_running',
              observed_at: '2026-07-17T08:00:00Z',
              error: null,
            },
          },
        },
      },
    };
    bridgeMocks.executeActionInvoke.mockResolvedValueOnce({
      ok: true,
      parsed: {
        app_action_execution: {
          result: {
            start_status: 'started',
            status: {
              address: '127.0.0.1:7233',
              server_reachable: false,
            },
          },
        },
      },
    });
    bridgeMocks.loadAppState.mockResolvedValueOnce({ app_state: readyAppState });

    render(<RuntimeSettings />);
    fireEvent.click(screen.getByTestId('settings-maintenance-temporal-action-provider_service_start'));

    await waitFor(() => expect(messageMocks.success).toHaveBeenCalledWith('维护已完成'));
    expect(messageMocks.error).not.toHaveBeenCalled();
    expect(bridgeMocks.loadAppState).toHaveBeenCalledTimes(1);
    expect(bridgeMocks.loadAppState).toHaveBeenCalledWith('fast', {
      showRefreshing: true,
      forceFresh: true,
    });
  });

  it.each(['supervisor', 'worker', 'scheduler'] as const)(
    'fails closed when fresh state is ready but the %s still reports an error',
    async (component) => {
      exposeTemporalActions('provider_service_status');
      bridgeMocks.executeActionInvoke.mockResolvedValueOnce({
        ok: true,
        parsed: { app_action_execution: { result: { service_status: 'running' } } },
      });
      const freshState = freshAppStatePayload().app_state;
      const temporal = freshState.provider.temporal as TemporalFixture;
      const workerReadiness = temporal.details?.worker_readiness;
      if (component === 'supervisor' && workerReadiness?.temporal_service_lifecycle?.supervisor) {
        workerReadiness.temporal_service_lifecycle.supervisor.error = 'fixture supervisor error';
      } else if (component === 'worker' && workerReadiness) {
        workerReadiness.error = 'fixture worker error';
      } else if (component === 'scheduler' && temporal.details?.scheduler) {
        temporal.details.scheduler.error = 'fixture scheduler error';
      }
      bridgeMocks.loadAppState.mockResolvedValueOnce({ app_state: freshState });

      render(<RuntimeSettings />);
      fireEvent.click(screen.getByTestId('settings-maintenance-temporal-action-provider_service_status'));

      await waitFor(() => expect(messageMocks.error).toHaveBeenCalledTimes(1));
      expect(messageMocks.success).not.toHaveBeenCalled();
      expect(screen.getByTestId('settings-maintenance-temporal-readback')).toHaveTextContent('执行失败');
    }
  );

  it('uses the fresh payload generated_at for action evidence instead of the action start time', async () => {
    exposeTemporalActions('provider_service_status');
    bridgeMocks.executeActionInvoke.mockResolvedValueOnce({
      ok: true,
      parsed: { app_action_execution: { result: { service_status: 'running' } } },
    });
    const freshState = freshAppStatePayload().app_state;
    const generatedAt = new Date(Date.now() + 10_000).toISOString();
    freshState.meta.generated_at = generatedAt;
    bridgeMocks.loadAppState.mockResolvedValueOnce({ app_state: freshState });

    render(<RuntimeSettings />);
    fireEvent.click(screen.getByTestId('settings-maintenance-temporal-action-provider_service_status'));

    const evidence = await screen.findByTestId('settings-maintenance-temporal-readback');
    expect(evidence).toHaveTextContent(new Date(generatedAt).toLocaleTimeString());
  });

  it('fails closed after one fresh readback when a Temporal start postcondition is not ready', async () => {
    setTemporalState({
      status: 'provider_code_landed_unconfigured',
      health_status: 'attention_needed',
      details: {
        address_source: 'not_configured',
        worker_readiness: {
          lifecycle_status: 'not_configured',
          service_ready: false,
          server_reachable: false,
          worker_ready: false,
        },
      },
    });
    exposeTemporalActions('provider_service_start');
    bridgeMocks.executeActionInvoke.mockResolvedValueOnce({
      ok: true,
      parsed: {
        app_action_execution: {
          result: { start_status: 'started' },
        },
      },
    });

    render(<RuntimeSettings />);
    fireEvent.click(screen.getByTestId('settings-maintenance-temporal-action-provider_service_start'));

    await waitFor(() => expect(messageMocks.error).toHaveBeenCalledTimes(1));
    expect(messageMocks.success).not.toHaveBeenCalled();
    expect(bridgeMocks.loadAppState).toHaveBeenCalledTimes(1);
    expect(bridgeMocks.loadAppState).toHaveBeenCalledWith('fast', {
      showRefreshing: true,
      forceFresh: true,
    });
  });

  it('rejects a force-fresh readback whose generated_at predates the action', async () => {
    exposeTemporalActions('provider_service_status');
    bridgeMocks.executeActionInvoke.mockResolvedValueOnce({
      ok: true,
      parsed: {
        app_action_execution: {
          result: { service_status: 'running' },
        },
      },
    });
    const staleAppState = structuredClone(appState);
    staleAppState.meta.generated_at = '2000-01-01T00:00:00.000Z';
    bridgeMocks.loadAppState.mockResolvedValueOnce({ app_state: staleAppState });

    render(<RuntimeSettings />);
    fireEvent.click(screen.getByTestId('settings-maintenance-temporal-action-provider_service_status'));

    await waitFor(() => expect(messageMocks.error).toHaveBeenCalledTimes(1));
    expect(messageMocks.success).not.toHaveBeenCalled();
    expect(bridgeMocks.loadAppState).toHaveBeenCalledTimes(1);
  });

  it('keeps blocked worker mutations out of the success path and shows localized evidence', async () => {
    setTemporalState({
      status: 'attention_needed',
      health_status: 'attention_needed',
      details: {
        address: '127.0.0.1:7233',
        address_source: 'managed',
        namespace: 'default',
        task_queue: 'opl-stage-attempts',
        scheduler_status: 'ready',
        worker_readiness: {
          lifecycle_status: 'worker_not_ready',
          service_ready: true,
          server_reachable: true,
          worker_ready: false,
        },
      },
    });
    exposeTemporalActions('provider_worker_status', 'provider_worker_start');
    bridgeMocks.executeActionInvoke.mockResolvedValueOnce({
      ok: true,
      parsed: {
        app_action_execution: {
          result: {
            status: 'blocked',
            worker_mutation_guard: {
              mutation_guard_status: 'blocked_developer_checkout_shared_state',
            },
          },
        },
      },
    });

    render(<RuntimeSettings />);
    fireEvent.click(screen.getByTestId('settings-maintenance-temporal-action-provider_worker_start'));

    const evidence = await screen.findByTestId('settings-maintenance-temporal-readback');
    expect(messageMocks.success).not.toHaveBeenCalled();
    expect(messageMocks.error).toHaveBeenCalledTimes(1);
    expect(evidence).toHaveTextContent('启动 Worker');
    expect(evidence).toHaveTextContent('已拦截');
    expect(evidence).not.toHaveTextContent('provider_worker_start');
    expect(evidence).not.toHaveTextContent('blocked_developer_checkout_shared_state');
    const workerRow = screen.getByTestId('settings-maintenance-temporal-worker');
    expect(workerRow).toHaveTextContent('当前 OPL CLI 指向开发源码，已阻止它接管共享的托管 Worker。');
    expect(workerRow).toHaveTextContent('请切回托管运行来源，或明确启用已授权的开发仓库维护。');
    expect(workerRow).not.toHaveTextContent(/环境变量|OPL_ALLOW_/);

    fireEvent.click(screen.getByTestId('settings-maintenance-temporal-worker-source'));
    expect(window.location.hash).toBe('#/settings/agents?section=source');
  });

  it('disables worker start when its dependency is unavailable and reuses the OPL Base repair flow', async () => {
    setTemporalState({
      status: 'attention_needed',
      health_status: 'attention_needed',
      details: {
        address: '127.0.0.1:7233',
        address_source: 'managed_service_supervisor',
        namespace: 'default',
        task_queue: 'opl-stage-attempts',
        scheduler: { status: 'ready', ready: true },
        worker_readiness: {
          blockers: ['temporal_worker_dependency_unavailable'],
          lifecycle_status: 'worker_dependency_unavailable',
          service_ready: true,
          server_reachable: true,
          worker_ready: false,
        },
      },
    });
    exposeTemporalActions('provider_worker_status', 'provider_worker_start');
    bridgeMocks.executeActionInvoke.mockResolvedValueOnce({ ok: true, parsed: { status: 'completed' } });

    render(<RuntimeSettings />);

    expect(screen.getByTestId('settings-maintenance-temporal-action-provider_worker_start')).toBeDisabled();
    fireEvent.click(screen.getByTestId('settings-maintenance-temporal-worker-repair-dependency'));
    expect(screen.getByTestId('opl-maintenance-hub-make-usable-confirmation')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('opl-maintenance-hub-make-usable-confirm'));

    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({ actionId: 'repair', dryRun: false })
    );
    expect(bridgeMocks.loadAppState).toHaveBeenCalledWith('fast', { showRefreshing: true });
  });

  it('keeps Temporal maintenance controls visible but disabled when the action catalog omits them', () => {
    setTemporalState({
      status: 'ready',
      health_status: 'ready',
      ready: true,
      details: {
        address: '127.0.0.1:7233',
        address_source: 'managed',
        namespace: 'default',
        task_queue: 'opl-stage-attempts',
        scheduler_status: 'not_installed',
        worker_readiness: {
          lifecycle_status: 'ready',
          service_ready: true,
          server_reachable: true,
          worker_ready: true,
        },
      },
    });

    render(<RuntimeSettings />);

    for (const actionId of [
      'provider_service_status',
      'provider_worker_status',
      'provider_worker_restart',
      'provider_scheduler_status',
      'provider_scheduler_install',
      'provider_scheduler_trigger',
    ]) {
      expect(screen.getByTestId(`settings-maintenance-temporal-action-${actionId}`)).toBeDisabled();
    }
  });

  it('keeps daily maintenance actions inline and gates one read-only diagnostics disclosure', () => {
    render(<RuntimeSettings />);

    expect(screen.getByTestId('settings-maintenance-daily-actions')).toBeVisible();
    expect(screen.getByTestId('settings-maintenance-primary')).toBeVisible();
    expect(screen.getByTestId('maintenance-domain-grid')).toHaveClass('opl-settings-list');
    expect(screen.getByTestId('maintenance-domain-grid')).not.toHaveClass('grid', 'md:grid-cols-2');
    expect(screen.getByTestId('maintenance-domain-grid').className).not.toMatch(/\bborder(?:-|\b)/);
    expect(screen.getByTestId('opl-runtime-health-summary').closest('section')).toHaveClass(
      'opl-settings-surface--status'
    );
    expect(screen.getByTestId('opl-maintenance-hub-appUpdates')).toHaveTextContent(
      'settings.oplEnvironmentPage.maintenanceHub.items.appUpdates.title'
    );
    expect(screen.getByTestId('opl-maintenance-hub-runtimeEnvironment')).toHaveTextContent(
      'settings.oplEnvironmentPage.maintenanceHub.actions.checkRuntimeEnvironment'
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
    const diagnosticsAction = screen.getByTestId('settings-maintenance-diagnostics-action');
    expect(diagnosticsAction).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(diagnosticsAction);
    expect(diagnosticsAction).toHaveAttribute('aria-expanded', 'true');
    const diagnostics = screen.getByTestId('settings-maintenance-technical-details');
    expect(diagnostics.closest('details')).toHaveClass('opl-settings-details', 'opl-settings-surface--diagnostic');
    expect(diagnostics.querySelector('.arco-collapse')).toBeNull();
    expect(within(diagnostics).getByText('settings.workDir')).toBeVisible();
    expect(within(diagnostics).getByText('settings.logDir')).toBeVisible();
    expect(within(diagnostics).getByText('settings.oplEnvironmentPage.diagnostics.modulesTitle')).toBeVisible();
    expect(within(diagnostics).queryByTestId('opl-managed-update-opl_base')).not.toBeInTheDocument();

    expect(screen.getByTestId('settings-maintenance-inline-updates')).toHaveClass(
      'opl-settings-surface--configuration'
    );
    expect(screen.queryByTestId('settings-maintenance-management-action')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-module-maintenance')).not.toBeInTheDocument();
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

    fireEvent.click(diagnosticsAction);
    expect(diagnosticsAction).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('settings-maintenance-technical-details')).not.toBeInTheDocument();
  });

  it('opens the diagnostics disclosure when Settings links directly to it', () => {
    window.location.hash = '#/settings/environment?section=diagnostics';

    render(<RuntimeSettings />);

    expect(screen.getByTestId('settings-maintenance-diagnostics-action')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('settings-maintenance-technical-details')).toBeInTheDocument();
  });

  it('keeps one direct action on every maintenance object when attention is present', () => {
    maintenanceSnapshot.result = {
      stdout: '{}',
      parsed: actionableUpdateStatus,
    };

    render(<RuntimeSettings />);

    expect(screen.getAllByTestId(/opl-maintenance-action-/)).toHaveLength(4);
    expect(screen.getByTestId('opl-maintenance-action-runtimeEnvironment')).toHaveTextContent(
      'settings.oplEnvironmentPage.maintenanceHub.actions.checkRuntimeEnvironment'
    );
  });

  it('projects a staged background update as requiring an App restart', () => {
    maintenanceSnapshot.lastAction = {
      kind: 'auto_apply',
      componentId: 'opl_base',
      componentIds: ['opl_base', 'opl_packages'],
      status: 'completed',
      at: '2026-07-13T00:00:00Z',
    };
    maintenanceSnapshot.restartRequired = true;

    render(<RuntimeSettings />);

    expect(screen.getByTestId('opl-managed-update-post-action-notice')).toHaveTextContent(
      'settings.oplEnvironmentPage.updates.userSummaries.needsRestart'
    );
  });

  it('does not append a reassuring no-reload message after a failed maintenance action', () => {
    maintenanceSnapshot.lastAction = {
      kind: 'repair',
      componentId: 'opl_base',
      status: 'failed',
      at: '2026-07-13T00:00:00Z',
    };

    render(<RuntimeSettings />);

    const notice = screen.getByTestId('opl-managed-update-post-action-notice');
    expect(notice).toHaveTextContent('settings.oplEnvironmentPage.updates.postAction.failed');
    expect(notice).not.toHaveTextContent('settings.oplEnvironmentPage.updates.postAction.noReloadGuidance');
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
      expect(messageMocks.warning).toHaveBeenCalledWith(
        'settings.oplEnvironmentPage.updates.messages.capabilitySyncManualRequired'
      );
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
