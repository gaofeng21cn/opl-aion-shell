import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OverviewSettings from '@/renderer/pages/settings/sections/OverviewSettings';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  modelAccessReady: true,
  issueQueue: [] as Array<Record<string, unknown>>,
  gatewayConnectionMode: 'account' as 'none' | 'manual_key' | 'account',
  gatewayStatus: 'connected',
  gatewayError: null as string | null,
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  oplRecord: (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  oplRecordList: (value: unknown) =>
    Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)) : [],
  oplString: (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null),
  useOplAppState: () => {
    const gatewayConnected = mocks.gatewayConnectionMode === 'account';
    return {
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
            temporal_provider: 'ready',
            runtime_source_carrier_health: '5/5',
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
    expect(screen.getByTestId('settings-overview-gateway-metrics')).toHaveTextContent('AvailabilityConnected');
    expect(screen.getByTestId('settings-overview-technical-codex')).toHaveTextContent('0.142.4 · Connected');
    expect(screen.getByTestId('settings-overview-technical-background')).toHaveTextContent('ready');
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
