import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAppStateInvoke = vi.hoisted(() => vi.fn());

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      getAppState: { invoke: getAppStateInvoke },
    },
  },
}));

import { resetOplAppStateLoadsForTest, useOplAppState } from '@/renderer/hooks/system/useOplAppState';

const CACHE_KEY = 'opl.appState.fast.v1';

function gatewayProjection(overrides: Record<string, unknown> = {}) {
  return {
    surface_kind: 'opl_gateway_account_read_model.v1',
    status: 'connected',
    connection_mode: 'account',
    account_card_visible: true,
    account: {
      display_name: 'Feng Gao',
      email: 'feng@example.com',
      status: 'active',
      balance: { amount: 19.25, currency: 'USD' },
    },
    usage: {
      today_tokens: 12,
      total_tokens: 34,
      today_actual_cost: 0.1,
      total_actual_cost: 0.2,
      currency: 'USD',
      day_timezone: 'Asia/Shanghai',
    },
    managed_key: { name: 'OPL-APP-TEST', status: 'active', ownership: 'opl_app' },
    installation: { device_label: 'Mac', short_id: 'abcd' },
    available_groups: [{ group_id: 'codex', label: 'Codex' }],
    freshness: {
      observed_at: '2026-07-13T12:00:00.000Z',
      stale_after: '2026-07-13T12:15:00.000Z',
      stale: false,
      last_error_code: null,
    },
    capabilities: { account_login_supported: true, manual_key_supported: true },
    actions: {
      complete_setup: 'gateway_account_complete_setup',
      refresh: 'gateway_account_refresh',
      repair: 'gateway_account_repair',
      use_for_model_access: 'gateway_account_use_for_model_access',
      disconnect: 'gateway_account_disconnect',
    },
    ...overrides,
  };
}

function appStateWithGateway(gateway: Record<string, unknown>) {
  return {
    settings_control_center: {
      app_settings_read_model: {
        opl_gateway_account: gateway,
      },
    },
  };
}

function readGateway(appState: Record<string, unknown>) {
  const settings = appState.settings_control_center as Record<string, unknown>;
  const readModel = settings.app_settings_read_model as Record<string, unknown>;
  return readModel.opl_gateway_account as Record<string, unknown>;
}

function seedCachedGateway() {
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      payload: { app_state: appStateWithGateway(gatewayProjection()) },
      loadedAt: '20:00:00',
    })
  );
}

describe('useOplAppState Gateway account bootstrap cache', () => {
  beforeEach(() => {
    localStorage.clear();
    getAppStateInvoke.mockReset();
    resetOplAppStateLoadsForTest();
  });

  it('renders the cached connected account before the background refresh resolves', () => {
    seedCachedGateway();
    getAppStateInvoke.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useOplAppState('fast'));
    const gateway = readGateway(result.current.appState);

    expect(gateway.connection_mode).toBe('account');
    expect((gateway.account as Record<string, unknown>).email).toBe('feng@example.com');
    expect(result.current.loading).toBe(false);
  });

  it('keeps the account state unresolved when an older cache has no Gateway projection', () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        payload: { app_state: { core: { status: 'ready' } } },
        loadedAt: '20:00:00',
      })
    );
    getAppStateInvoke.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useOplAppState('fast'));

    expect(result.current.appState.core).toEqual({ status: 'ready' });
    expect(result.current.loading).toBe(true);
  });

  it('keeps the cached account visible when the background refresh fails', async () => {
    seedCachedGateway();
    getAppStateInvoke.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useOplAppState('fast'));

    await waitFor(() => expect(result.current.error).toBe('offline'));
    expect(readGateway(result.current.appState).connection_mode).toBe('account');
  });

  it('replaces the cached account only after a live read confirms disconnection', async () => {
    seedCachedGateway();
    const disconnected = gatewayProjection({
      status: 'not_connected',
      connection_mode: 'none',
      account_card_visible: false,
      account: null,
      usage: null,
      managed_key: null,
      installation: null,
    });
    getAppStateInvoke.mockResolvedValue({
      ok: true,
      parsed: { app_state: appStateWithGateway(disconnected) },
    });

    const { result } = renderHook(() => useOplAppState('fast'));

    expect(readGateway(result.current.appState).connection_mode).toBe('account');
    await waitFor(() => expect(readGateway(result.current.appState).connection_mode).toBe('none'));

    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as {
      payload?: { app_state?: Record<string, unknown> };
    };
    expect(readGateway(cached.payload?.app_state ?? {}).connection_mode).toBe('none');
  });
});
