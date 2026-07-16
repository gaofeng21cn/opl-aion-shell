import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OverviewSettings from '@/renderer/pages/settings/sections/OverviewSettings';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  modelAccessReady: true,
  issueQueue: [] as Array<Record<string, unknown>>,
  gatewayConnectionMode: 'account' as 'none' | 'manual_key' | 'account',
  gatewayStatus: 'connected',
  gatewayError: null as string | null,
  temporalProviderStatus: 'ready',
  temporalRuntimeStatus: 'ready',
  temporalDegradedReason: null as string | null,
  temporalAddressSource: 'configured',
  temporalWorkerStatus: 'ready',
  temporalWorkerMutationGuard: null as string | null,
  temporalServiceReady: true as boolean | null,
  temporalSupervisorSupported: true as boolean | null,
  temporalSupervisorApplicable: true as boolean | null,
  temporalSupervisorRequired: true as boolean | null,
  temporalSupervisorReady: true as boolean | null,
  temporalSupervisorInstalled: true as boolean | null,
  temporalSupervisorLoaded: true as boolean | null,
  temporalSupervisorConfigurationCurrent: true as boolean | null,
  temporalSupervisorError: null as string | null,
  temporalSupervisorStatus: 'loaded_running',
  temporalWorkerReady: true as boolean | null,
  temporalWorkerBlockers: [] as string[],
  temporalSchedulerStatus: 'ready',
  temporalSchedulerReady: true as boolean | null,
  temporalSchedulerError: null as string | null,
  temporalSchedulerObservedAt: '2026-07-17T08:00:00Z',
  capabilityHealth: '5/5',
  appStateHydrated: true,
  appStateLoading: false,
  loadAppState: vi.fn(),
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  oplRecord: (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  oplRecordList: (value: unknown) =>
    Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)) : [],
  oplString: (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null),
  useOplAppState: () => {
    const gatewayConnected = mocks.gatewayConnectionMode === 'account';
    return {
      payload: mocks.appStateHydrated ? { app_state: {} } : null,
      loading: mocks.appStateLoading,
      load: mocks.loadAppState,
      appState: {
        core: {
          codex: {
            status: 'ready',
            version: '0.142.4',
            default_model: 'gpt-5.6',
            model_access_ready: mocks.modelAccessReady,
          },
        },
        settings_control_center: {
          status_summary: {
            model_access: mocks.modelAccessReady ? 'ready' : 'attention_required',
            codex_version: '0.142.4',
            temporal_provider: mocks.temporalProviderStatus,
            runtime_source_carrier_health: mocks.capabilityHealth,
            issue_count: mocks.issueQueue.length,
          },
          issue_queue: mocks.issueQueue,
          app_settings_read_model: {
            opl_gateway_account: {
              surface_kind: 'opl_gateway_account_read_model.v1',
              status: mocks.gatewayStatus,
              connection_mode: mocks.gatewayConnectionMode,
              account_card_visible: gatewayConnected,
              account: gatewayConnected
                ? {
                    display_name: 'Gao Feng',
                    email: 'gf@example.test',
                    status: 'active',
                    balance: { amount: 42, currency: 'USD' },
                  }
                : null,
              usage: gatewayConnected
                ? {
                    today_tokens: 1_250_000,
                    total_tokens: 12_000_000,
                    today_actual_cost: 2.5,
                    total_actual_cost: 30,
                    currency: 'USD',
                    day_timezone: 'Asia/Shanghai',
                  }
                : null,
              managed_key: null,
              installation: null,
              available_groups: [],
              freshness: {
                observed_at: '2026-07-14T08:00:00+08:00',
                stale_after: null,
                stale: false,
                last_error_code: mocks.gatewayError,
              },
              capabilities: { account_login_supported: true, manual_key_supported: true },
              actions: {
                complete_setup: null,
                refresh: 'gateway_account_refresh',
                repair: null,
                use_for_model_access: null,
                disconnect: gatewayConnected ? 'gateway_account_disconnect' : null,
              },
            },
          },
        },
        provider: {
          temporal: {
            health_status: mocks.temporalProviderStatus,
            status: mocks.temporalRuntimeStatus,
            degraded_reason: mocks.temporalDegradedReason,
            details: {
              address_source: mocks.temporalAddressSource,
              worker_readiness: {
                readiness_status: mocks.temporalWorkerStatus,
                service_ready: mocks.temporalServiceReady,
                worker_ready: mocks.temporalWorkerReady,
                temporal_service_lifecycle: {
                  service_status: mocks.temporalSupervisorApplicable === false ? 'external_running' : 'running',
                  supervisor: {
                    supported: mocks.temporalSupervisorSupported,
                    applicable: mocks.temporalSupervisorApplicable,
                    required: mocks.temporalSupervisorRequired,
                    ready: mocks.temporalSupervisorReady,
                    installed: mocks.temporalSupervisorInstalled,
                    loaded: mocks.temporalSupervisorLoaded,
                    configuration_current: mocks.temporalSupervisorConfigurationCurrent,
                    error: mocks.temporalSupervisorError,
                    status: mocks.temporalSupervisorStatus,
                  },
                },
                blockers: mocks.temporalWorkerBlockers,
                worker_mutation_guard: {
                  mutation_guard_status: mocks.temporalWorkerMutationGuard,
                },
              },
              scheduler: {
                status: mocks.temporalSchedulerStatus,
                ready: mocks.temporalSchedulerReady,
                observed_at: mocks.temporalSchedulerObservedAt,
                error: mocks.temporalSchedulerError,
              },
            },
          },
        },
      },
    };
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: 'en-US' },
    t: (key: string, options?: Record<string, unknown>) => {
      const labels: Record<string, string> = {
        'common.open': 'Open',
        'common.technical_details': 'Technical details',
        'settings.overviewPage.title': 'Overview',
        'settings.overviewPage.description': 'Check Codex, usage, and anything that needs attention.',
        'settings.overviewPage.overall.title': 'This computer',
        'settings.overviewPage.overall.readyDescription': 'Codex and primary local capabilities are available.',
        'settings.overviewPage.overall.attentionDescription': 'Some settings need attention.',
        'settings.overviewPage.attention.title': 'Needs attention',
        'settings.overviewPage.attention.description': 'Only blocking items are shown.',
        'settings.overviewPage.attention.codexTitle': 'Restore Codex access',
        'settings.overviewPage.attention.capabilitiesTitle': 'Check capability packages',
        'settings.overviewPage.attention.capabilitiesDescription': 'Review the affected capability settings.',
        'settings.overviewPage.codexTitle': 'Codex CLI',
        'settings.overviewPage.codexDescription': 'Codex is the execution entry.',
        'settings.overviewPage.quickEntries.modelAccount.description': 'Check Codex and model access.',
        'settings.overviewPage.quickEntries.localServices.title': 'Local Services',
        'settings.overviewPage.quickEntries.localServices.description': 'Check background services.',
        'settings.overviewPage.actions.openRuntimeSettings': 'Open Maintenance',
        'settings.overviewPage.gateway.title': 'OPL Gateway',
        'settings.overviewPage.gateway.connectedDescription': 'Signed in for usage and billing.',
        'settings.overviewPage.gateway.manualKeyDescription': 'A manual key provides access.',
        'settings.overviewPage.gateway.notConnectedDescription': 'Optional when Codex already works.',
        'settings.overviewPage.gateway.updatedAt': `Updated ${options?.observedAt ?? ''}`,
        'settings.overviewPage.gateway.status.connected': 'Connected',
        'settings.overviewPage.gateway.status.manualKey': 'Manual key',
        'settings.overviewPage.gateway.status.notConnected': 'Not connected',
        'settings.overviewPage.gateway.status.needsAttention': 'Needs attention',
        'settings.overviewPage.gateway.metrics.availability': 'Availability',
        'settings.overviewPage.technical.description': 'Compact read-only details.',
        'settings.overviewPage.technical.codex': 'Codex',
        'settings.overviewPage.technical.gatewayFreshness': 'Gateway data',
        'settings.overviewPage.technical.backgroundService': 'Background service',
        'settings.overviewPage.technical.temporalNotConfigured': 'Temporal server and worker are not configured',
        'settings.overviewPage.technical.temporalReasons.notConfigured': 'No runtime address is configured.',
        'settings.overviewPage.technical.temporalReasons.serverUnreachable': 'The server cannot be reached.',
        'settings.overviewPage.technical.temporalReasons.supervisorNotInstalled':
          'Startup protection is not installed.',
        'settings.overviewPage.technical.temporalReasons.supervisorNotLoaded': 'Startup protection is not running.',
        'settings.overviewPage.technical.temporalReasons.supervisorConfigurationDrift':
          'Startup protection configuration drifted.',
        'settings.overviewPage.technical.temporalReasons.supervisorError': 'Startup protection reported an error.',
        'settings.overviewPage.technical.temporalReasons.supervisorUnready': 'Startup protection is not ready.',
        'settings.overviewPage.technical.temporalReasons.workerDependencyUnavailable':
          'A required worker dependency is unavailable in OPL Base.',
        'settings.overviewPage.technical.temporalReasons.workerMutationBlocked':
          'The active source cannot take over the managed worker.',
        'settings.overviewPage.technical.temporalReasons.workerSourceStale': 'The worker source is stale.',
        'settings.overviewPage.technical.temporalReasons.duplicateWorker': 'Another worker is already running.',
        'settings.overviewPage.technical.temporalReasons.workerExited': 'The worker process exited.',
        'settings.overviewPage.technical.temporalReasons.workerNotReady': 'The worker is not ready.',
        'settings.overviewPage.technical.temporalReasons.schedulerNotInstalled': 'The schedule is not installed.',
        'settings.overviewPage.technical.temporalReasons.schedulerPaused': 'The schedule is paused.',
        'settings.overviewPage.technical.temporalReasons.schedulerError': 'The scheduler reported an error.',
        'settings.overviewPage.technical.temporalReasons.schedulerNotReady': 'The scheduler is not ready.',
        'settings.overviewPage.technical.temporalReasons.attention': 'This component requires maintenance.',
        'settings.overviewPage.technical.temporalReasons.unknown': 'Run a fresh maintenance check.',
        'settings.overviewPage.technical.capabilities': 'Capability packages',
        'settings.accessPage.statusLabels.connected': 'Connected',
        'settings.accessPage.statusLabels.needsAttention': 'Needs attention',
        'settings.accessPage.statusLabels.unknown': 'Unknown',
        'settings.accessPage.cards.codexCli.title': 'Codex CLI',
        'settings.accessPage.cards.codexCli.version': `Version ${options?.version ?? ''}`,
        'settings.accessPage.cards.codexCli.model': `Model ${options?.model ?? ''}`,
        'settings.accessPage.cards.model.fallback': 'Model not reported',
        'settings.accessPage.cards.account.title': 'Model access',
        'settings.accessPage.cards.account.existingCodexConfigured': 'Existing Codex access',
        'settings.accessPage.cards.account.missing': 'Missing model access',
        'settings.accessPage.gatewayAccount.unknownAccount': 'Unknown account',
        'settings.accessPage.gatewayAccount.unknownObservedAt': 'Not reported',
        'settings.accessPage.gatewayAccount.metrics.todayTokens': 'Tokens today',
        'settings.accessPage.gatewayAccount.metrics.todayCost': 'Cost today',
        'settings.accessPage.gatewayAccount.metrics.balance': 'Balance',
        'settings.oplEnvironmentPage.healthSummary.values.canUse': 'Ready',
        'settings.oplEnvironmentPage.healthSummary.values.count': `${options?.count ?? 0} item(s)`,
        'settings.oplEnvironmentPage.modulesReadyCount': `${options?.ready ?? 0} / ${options?.total ?? 0} ready`,
        'settings.oplEnvironmentPage.status.unknown': 'Unknown',
        'settings.oplEnvironmentPage.status.ready': 'Ready',
        'settings.oplEnvironmentPage.status.attention_required': 'Needs attention',
        'settings.oplEnvironmentPage.temporal.server.title': 'Temporal server',
        'settings.oplEnvironmentPage.temporal.worker.title': 'OPL worker',
        'settings.oplEnvironmentPage.temporal.scheduler.title': 'OPL scheduler',
        'settings.oplEnvironmentPage.temporal.values.ready': 'Ready',
        'settings.oplEnvironmentPage.temporal.values.notConfigured': 'Not configured',
        'settings.oplEnvironmentPage.temporal.values.needsAttention': 'Needs attention',
        'settings.oplEnvironmentPage.temporal.values.needsCheck': 'Check required',
        'settings.oplEnvironmentPage.temporal.values.notInstalled': 'Not installed',
        'settings.oplEnvironmentPage.temporal.values.paused': 'Paused',
        'settings.oplEnvironmentPage.temporal.values.restartRequired': 'Restart required',
        'settings.overviewPage.technical.temporalNeedsAttention':
          'The Temporal server, worker, or scheduler still needs attention.',
      };
      if (key === 'settings.overviewPage.overall.attentionCount') return `${options?.count ?? 0} item(s)`;
      return labels[key] ?? String(options?.defaultValue ?? key);
    },
  }),
}));

describe('OverviewSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.modelAccessReady = true;
    mocks.issueQueue = [];
    mocks.gatewayConnectionMode = 'account';
    mocks.gatewayStatus = 'connected';
    mocks.gatewayError = null;
    mocks.temporalProviderStatus = 'ready';
    mocks.temporalRuntimeStatus = 'ready';
    mocks.temporalDegradedReason = null;
    mocks.temporalAddressSource = 'configured';
    mocks.temporalWorkerStatus = 'ready';
    mocks.temporalWorkerMutationGuard = null;
    mocks.temporalServiceReady = true;
    mocks.temporalSupervisorSupported = true;
    mocks.temporalSupervisorApplicable = true;
    mocks.temporalSupervisorRequired = true;
    mocks.temporalSupervisorReady = true;
    mocks.temporalSupervisorInstalled = true;
    mocks.temporalSupervisorLoaded = true;
    mocks.temporalSupervisorConfigurationCurrent = true;
    mocks.temporalSupervisorError = null;
    mocks.temporalSupervisorStatus = 'loaded_running';
    mocks.temporalWorkerReady = true;
    mocks.temporalWorkerBlockers = [];
    mocks.temporalSchedulerStatus = 'ready';
    mocks.temporalSchedulerReady = true;
    mocks.temporalSchedulerError = null;
    mocks.temporalSchedulerObservedAt = '2026-07-17T08:00:00Z';
    mocks.capabilityHealth = '5/5';
    mocks.appStateHydrated = true;
    mocks.appStateLoading = false;
    mocks.loadAppState.mockReset().mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes a stale Temporal projection until the shared fast state becomes ready', async () => {
    vi.useFakeTimers();
    mocks.temporalWorkerStatus = 'worker_source_stale';
    mocks.temporalWorkerReady = false;
    mocks.appStateHydrated = false;
    mocks.appStateLoading = true;
    const view = render(<OverviewSettings withWrapper={false} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(mocks.loadAppState).not.toHaveBeenCalled();

    mocks.appStateHydrated = true;
    mocks.appStateLoading = false;
    view.rerender(<OverviewSettings withWrapper={false} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.loadAppState).toHaveBeenCalledTimes(1);
    expect(mocks.loadAppState).toHaveBeenCalledWith('fast', { background: true, forceFresh: true });

    mocks.temporalWorkerStatus = 'ready';
    mocks.temporalWorkerReady = true;
    view.rerender(<OverviewSettings withWrapper={false} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(mocks.loadAppState).toHaveBeenCalledTimes(1);
  });

  it('does not poll when the first hydrated Temporal projection is ready', async () => {
    vi.useFakeTimers();
    render(<OverviewSettings withWrapper={false} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(mocks.loadAppState).not.toHaveBeenCalled();
  });

  it('stops refreshing a persistently stale projection after the attempt budget', async () => {
    vi.useFakeTimers();
    mocks.temporalSchedulerStatus = 'not_installed';
    mocks.temporalSchedulerReady = false;
    render(<OverviewSettings withWrapper={false} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100_000);
    });
    expect(mocks.loadAppState).toHaveBeenCalledTimes(30);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(mocks.loadAppState).toHaveBeenCalledTimes(30);
  });

  it('honors the recovery deadline when a fresh read is slow', async () => {
    vi.useFakeTimers();
    mocks.temporalSchedulerStatus = 'not_installed';
    mocks.temporalSchedulerReady = false;
    mocks.loadAppState.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(null), 20_000)));
    render(<OverviewSettings withWrapper={false} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });

    expect(mocks.loadAppState).toHaveBeenCalledTimes(4);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(mocks.loadAppState).toHaveBeenCalledTimes(4);
  });

  it('clears the pending recovery refresh when Overview unmounts', async () => {
    vi.useFakeTimers();
    mocks.temporalWorkerStatus = 'worker_source_stale';
    mocks.temporalWorkerReady = false;
    mocks.loadAppState.mockReturnValue(new Promise(() => {}));
    const view = render(<OverviewSettings withWrapper={false} />);

    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(mocks.loadAppState).toHaveBeenCalledTimes(1);
  });

  it('starts a bounded recovery loop when a previously ready projection becomes stale', async () => {
    vi.useFakeTimers();
    const view = render(<OverviewSettings withWrapper={false} />);
    expect(mocks.loadAppState).not.toHaveBeenCalled();

    mocks.temporalWorkerStatus = 'worker_not_ready';
    mocks.temporalWorkerReady = false;
    view.rerender(<OverviewSettings withWrapper={false} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mocks.loadAppState).toHaveBeenCalledTimes(1);
  });

  it('shows compact Gateway usage and the direct technical readback needed for an overview', () => {
    render(<OverviewSettings withWrapper={false} />);

    expect(screen.getByTestId('settings-overview-icon')).toBeInTheDocument();
    expect(screen.getByTestId('settings-overview-status')).toHaveTextContent('Ready');
    expect(screen.getByTestId('settings-overview-card-codex')).toHaveTextContent('Codex CLI');
    expect(screen.getByTestId('settings-overview-card-gateway')).toHaveTextContent('OPL Gateway');
    expect(screen.getByTestId('settings-overview-gateway-account')).toHaveTextContent('Gao Feng');
    expect(screen.getByTestId('settings-overview-gateway-metrics')).toHaveTextContent('1.25M');
    expect(screen.getByTestId('settings-overview-gateway-metrics')).toHaveTextContent('2.5 USD');
    expect(screen.getByTestId('settings-overview-gateway-metrics')).toHaveTextContent('42 USD');
    expect(screen.getByTestId('settings-overview-gateway-metrics')).toHaveTextContent('Availability: Connected');
    expect(screen.getByTestId('settings-overview-summary-grid')).toHaveClass('opl-settings-list');
    expect(screen.getByTestId('settings-overview-summary-grid')).not.toHaveClass('grid', 'md:grid-cols-2');
    expect(screen.getByTestId('settings-overview-technical-codex')).toHaveTextContent('0.142.4 · Connected');
    expect(screen.getByTestId('settings-overview-temporal-server')).toHaveTextContent('Temporal serverReady');
    expect(screen.getByTestId('settings-overview-temporal-worker')).toHaveTextContent('OPL workerReady');
    expect(screen.getByTestId('settings-overview-temporal-scheduler')).toHaveTextContent('OPL schedulerReady');
    expect(screen.getByTestId('settings-overview-technical-capabilities')).toHaveTextContent('5/5');
    expect(screen.queryByTestId('settings-overview-diagnostics-action')).not.toBeInTheDocument();
  });

  it('does not treat an informational Framework issue as an actionable exception', () => {
    mocks.issueQueue = [
      {
        issue_id: 'developer_profile_active',
        severity: 'info',
        recommended_action_id: 'settings_repair_model_access',
      },
    ];
    render(<OverviewSettings withWrapper={false} />);

    expect(screen.getByTestId('settings-overview-status')).toHaveTextContent('Ready');
    expect(screen.queryByTestId('settings-overview-exception')).not.toBeInTheDocument();
  });

  it('localizes capability health tokens instead of exposing internal status values', () => {
    mocks.capabilityHealth = 'attention_needed';

    render(<OverviewSettings withWrapper={false} />);

    const capabilities = screen.getByTestId('settings-overview-technical-capabilities');
    expect(capabilities).toHaveTextContent('Needs attention');
    expect(capabilities).not.toHaveTextContent('attention_needed');
  });

  it('keeps a disconnected optional Gateway quiet when Codex access works', () => {
    mocks.gatewayConnectionMode = 'none';
    mocks.gatewayStatus = 'not_connected';
    render(<OverviewSettings withWrapper={false} />);

    expect(screen.getByTestId('settings-overview-status')).toHaveTextContent('Ready');
    expect(screen.getByTestId('settings-overview-card-gateway')).toHaveTextContent('Not connected');
    expect(screen.queryByTestId('settings-overview-gateway-account')).not.toBeInTheDocument();
  });

  it('routes an actionable capability issue to Maintenance', () => {
    mocks.issueQueue = [
      {
        issue_id: 'runtime_source_carrier_attention_required',
        severity: 'warning',
        recommended_action_id: 'settings_sync_capabilities',
      },
    ];
    render(<OverviewSettings withWrapper={false} />);

    expect(screen.getByTestId('settings-overview-status')).toHaveTextContent('1 item(s)');
    fireEvent.click(screen.getByTestId('settings-overview-primary-action'));
    expect(mocks.navigate).toHaveBeenCalledWith('/settings/capabilities');
  });

  it('explains an unconfigured Temporal server and worker without exposing the raw status code', () => {
    mocks.temporalProviderStatus = 'attention_needed';
    mocks.temporalRuntimeStatus = 'provider_code_landed_unconfigured';
    mocks.temporalDegradedReason = 'temporal_runtime_not_configured';
    mocks.temporalAddressSource = 'not_configured';
    mocks.temporalWorkerStatus = 'not_configured';
    mocks.temporalServiceReady = false;
    mocks.temporalWorkerReady = false;
    mocks.issueQueue = [
      {
        issue_id: 'provider_failed_with_repair',
        severity: 'error',
        recommended_action_id: 'settings_sync_capabilities',
      },
    ];

    render(<OverviewSettings withWrapper={false} />);

    const server = screen.getByTestId('settings-overview-temporal-server');
    const worker = screen.getByTestId('settings-overview-temporal-worker');
    expect(server).toHaveTextContent('Temporal serverNot configured');
    expect(server).toHaveTextContent('No runtime address is configured.');
    expect(worker).toHaveTextContent('OPL workerNot configured');
    expect(worker).toHaveTextContent('No runtime address is configured.');
    expect(server).not.toHaveTextContent('attention_needed');
    expect(worker).not.toHaveTextContent('attention_needed');
    fireEvent.click(screen.getByTestId('settings-overview-temporal-maintenance'));
    expect(mocks.navigate).toHaveBeenCalledWith('/settings/environment?section=services');
  });

  it('treats an unreachable configured Temporal server as attention instead of not configured', () => {
    mocks.temporalProviderStatus = 'provider_code_landed_unconfigured';
    mocks.temporalRuntimeStatus = 'provider_code_landed_unconfigured';
    mocks.temporalDegradedReason = 'temporal_server_unreachable';
    mocks.temporalAddressSource = 'environment';
    mocks.temporalServiceReady = false;
    mocks.temporalWorkerStatus = 'server_unreachable';
    mocks.temporalWorkerReady = false;
    mocks.temporalSchedulerStatus = 'error';
    mocks.temporalSchedulerReady = false;

    render(<OverviewSettings withWrapper={false} />);

    const server = screen.getByTestId('settings-overview-temporal-server');
    expect(server).toHaveTextContent('Temporal serverNeeds attention');
    expect(server).toHaveTextContent('The server cannot be reached.');
    expect(server).not.toHaveTextContent('Not configured');
    expect(screen.getByTestId('settings-overview-status')).toHaveTextContent('1 item(s)');
    fireEvent.click(screen.getByTestId('settings-overview-primary-action'));
    expect(mocks.navigate).toHaveBeenCalledWith('/settings/environment?section=services');
  });

  it('treats a required but unready macOS service supervisor as a server maintenance issue', () => {
    mocks.temporalServiceReady = true;
    mocks.temporalSupervisorReady = false;
    mocks.temporalSupervisorStatus = 'configuration_drift';

    render(<OverviewSettings withWrapper={false} />);

    expect(screen.getByTestId('settings-overview-status')).toHaveTextContent('1 item(s)');
    expect(screen.getByTestId('settings-overview-temporal-server')).toHaveTextContent(
      'Startup protection configuration drifted.'
    );
  });

  it('does not require a local supervisor for an explicit external Temporal service', () => {
    mocks.temporalAddressSource = 'environment';
    mocks.temporalSupervisorApplicable = false;
    mocks.temporalSupervisorRequired = false;
    mocks.temporalSupervisorReady = false;
    mocks.temporalSupervisorStatus = 'not_applicable';

    render(<OverviewSettings withWrapper={false} />);

    expect(screen.getByTestId('settings-overview-status')).toHaveTextContent('Ready');
    expect(screen.getByTestId('settings-overview-temporal-server')).toHaveTextContent('Temporal serverReady');
  });

  it('fails closed when a configured Temporal server omits explicit readiness', () => {
    mocks.temporalProviderStatus = 'provider_code_landed_unconfigured';
    mocks.temporalRuntimeStatus = 'provider_code_landed_unconfigured';
    mocks.temporalAddressSource = 'managed_local_service_state';
    mocks.temporalServiceReady = null;

    render(<OverviewSettings withWrapper={false} />);

    const server = screen.getByTestId('settings-overview-temporal-server');
    expect(server).toHaveTextContent('Temporal serverCheck required');
    expect(server).not.toHaveTextContent('Ready');
    expect(server).not.toHaveTextContent('Not configured');
  });

  it('keeps a ready Temporal server separate when the worker source is stale', () => {
    mocks.temporalProviderStatus = 'provider_code_landed_unconfigured';
    mocks.temporalRuntimeStatus = 'provider_code_landed_unconfigured';
    mocks.temporalDegradedReason = 'worker_source_stale';
    mocks.temporalServiceReady = true;
    mocks.temporalWorkerStatus = 'worker_source_stale';
    mocks.temporalWorkerReady = false;

    render(<OverviewSettings withWrapper={false} />);

    const server = screen.getByTestId('settings-overview-temporal-server');
    const worker = screen.getByTestId('settings-overview-temporal-worker');
    expect(server).toHaveTextContent('Temporal serverReady');
    expect(worker).toHaveTextContent('OPL workerRestart required');
    expect(worker).toHaveTextContent('The worker source is stale.');
    expect(server).not.toHaveTextContent('attention_needed');
    expect(worker).not.toHaveTextContent('worker_source_stale');
  });

  it('keeps a ready Temporal server separate when worker maintenance is blocked', () => {
    mocks.temporalProviderStatus = 'attention_needed';
    mocks.temporalRuntimeStatus = 'attention_needed';
    mocks.temporalServiceReady = true;
    mocks.temporalWorkerStatus = 'worker_not_ready';
    mocks.temporalWorkerReady = false;
    mocks.temporalWorkerMutationGuard = 'blocked_developer_checkout_shared_state';

    render(<OverviewSettings withWrapper={false} />);

    const server = screen.getByTestId('settings-overview-temporal-server');
    const worker = screen.getByTestId('settings-overview-temporal-worker');
    expect(server).toHaveTextContent('Temporal serverReady');
    expect(worker).toHaveTextContent('OPL workerNeeds attention');
    expect(worker).toHaveTextContent('The active source cannot take over the managed worker.');
    expect(worker).not.toHaveTextContent('blocked_developer_checkout_shared_state');
  });

  it('explains a missing worker dependency without exposing the blocker token', () => {
    mocks.temporalProviderStatus = 'attention_needed';
    mocks.temporalRuntimeStatus = 'attention_needed';
    mocks.temporalServiceReady = true;
    mocks.temporalWorkerStatus = 'worker_not_ready';
    mocks.temporalWorkerReady = false;
    mocks.temporalWorkerBlockers = ['temporal_worker_dependency_unavailable'];

    render(<OverviewSettings withWrapper={false} />);

    const worker = screen.getByTestId('settings-overview-temporal-worker');
    expect(worker).toHaveTextContent('A required worker dependency is unavailable in OPL Base.');
    expect(worker).not.toHaveTextContent('temporal_worker_dependency_unavailable');
  });

  it('fails closed when worker readiness is missing even if the provider reports ready', () => {
    mocks.temporalProviderStatus = 'ready';
    mocks.temporalRuntimeStatus = 'ready';
    mocks.temporalServiceReady = true;
    mocks.temporalWorkerStatus = 'ready';
    mocks.temporalWorkerReady = null;

    render(<OverviewSettings withWrapper={false} />);

    expect(screen.getByTestId('settings-overview-status')).toHaveTextContent('1 item(s)');
    expect(screen.getByTestId('settings-overview-temporal-worker')).toHaveTextContent('Check required');
    expect(screen.getByTestId('settings-overview-temporal-worker')).not.toHaveTextContent('Ready');
  });

  it('makes an explicit scheduler failure actionable without relying on the issue queue', async () => {
    const user = userEvent.setup();
    mocks.temporalProviderStatus = 'ready';
    mocks.temporalRuntimeStatus = 'ready';
    mocks.temporalSchedulerStatus = 'error';
    mocks.temporalSchedulerReady = false;

    render(<OverviewSettings withWrapper={false} />);

    expect(screen.getByTestId('settings-overview-status')).toHaveTextContent('1 item(s)');
    expect(screen.getByTestId('settings-overview-temporal-scheduler')).toHaveTextContent(
      'Needs attention · The scheduler reported an error.'
    );
    const action = screen.getByTestId('settings-overview-primary-action');
    action.focus();
    await user.keyboard('{Enter}');
    expect(mocks.navigate).toHaveBeenCalledWith('/settings/environment?section=services');
  });

  it('prioritizes Codex access when access and background services both fail', () => {
    mocks.modelAccessReady = false;
    mocks.issueQueue = [
      {
        issue_id: 'model_access_manual_required',
        severity: 'warning',
        recommended_action_id: 'settings_configure_webui_api_key',
      },
      {
        issue_id: 'provider_failed_with_repair',
        severity: 'error',
        recommended_action_id: 'settings_sync_capabilities',
      },
    ];
    render(<OverviewSettings withWrapper={false} />);

    expect(screen.getByTestId('settings-overview-status')).toHaveTextContent('2 item(s)');
    fireEvent.click(screen.getByTestId('settings-overview-primary-action'));
    expect(mocks.navigate).toHaveBeenCalledWith('/settings/gateway');
    expect(screen.getAllByTestId('settings-overview-primary-action')).toHaveLength(1);
  });

  it('opens Gateway management from the Gateway summary card', () => {
    render(<OverviewSettings withWrapper={false} />);

    fireEvent.click(within(screen.getByTestId('settings-overview-card-gateway')).getByRole('button', { name: 'Open' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/settings/gateway');
  });
});
