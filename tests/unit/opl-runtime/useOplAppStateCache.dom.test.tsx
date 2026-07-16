import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAppStateInvoke = vi.hoisted(() => vi.fn());

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      getAppState: { invoke: getAppStateInvoke },
    },
  },
}));

import {
  cacheFastOplAppState,
  loadOplAppStateFromBridge,
  OPL_APP_STATE_PERSISTED_CACHE_MAX_BYTES,
  resetOplAppStateLoadsForTest,
  useOplAppState,
} from '@/renderer/hooks/system/useOplAppState';

const CACHE_KEY = 'opl.appState.fast.v1';
const GATEWAY_CACHE_KEY = 'opl.gatewayAccount.projection.v1';

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
    GATEWAY_CACHE_KEY,
    JSON.stringify({
      projection: gatewayProjection(),
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

  it('does not load automatically when the caller opts out', () => {
    renderHook(() => useOplAppState('fast', { autoLoad: false }));

    expect(getAppStateInvoke).not.toHaveBeenCalled();
  });

  it('waits for a shared request before issuing the required fresh read', async () => {
    let resolveShared!: (value: { ok: true; parsed: { app_state: { version: string } } }) => void;
    const sharedRequest = new Promise<{ ok: true; parsed: { app_state: { version: string } } }>((resolve) => {
      resolveShared = resolve;
    });
    getAppStateInvoke
      .mockReturnValueOnce(sharedRequest)
      .mockResolvedValueOnce({ ok: true, parsed: { app_state: { version: 'fresh' } } });

    const sharedLoad = loadOplAppStateFromBridge('fast');
    const freshLoad = loadOplAppStateFromBridge('fast', { forceFresh: true });

    expect(getAppStateInvoke).toHaveBeenCalledTimes(1);

    resolveShared({ ok: true, parsed: { app_state: { version: 'shared' } } });
    await expect(sharedLoad).resolves.toEqual({ app_state: { version: 'shared' } });
    await expect(freshLoad).resolves.toEqual({ app_state: { version: 'fresh' } });
    expect(getAppStateInvoke).toHaveBeenCalledTimes(2);
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

  it('migrates a legacy full-state Gateway projection into the dedicated cache', () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        payload: { app_state: appStateWithGateway(gatewayProjection()) },
        loadedAt: '20:00:00',
      })
    );
    getAppStateInvoke.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useOplAppState('fast'));

    expect(readGateway(result.current.appState).connection_mode).toBe('account');
    const migrated = JSON.parse(localStorage.getItem(GATEWAY_CACHE_KEY) ?? '{}') as {
      projection?: Record<string, unknown>;
    };
    expect(migrated.projection?.connection_mode).toBe('account');
  });

  it('reuses the account cached by a prior page visit while the next refresh is pending', async () => {
    getAppStateInvoke.mockResolvedValue({
      ok: true,
      parsed: { app_state: appStateWithGateway(gatewayProjection()) },
    });

    const firstVisit = renderHook(() => useOplAppState('fast'));
    await waitFor(() => expect(readGateway(firstVisit.result.current.appState).connection_mode).toBe('account'));
    firstVisit.unmount();

    resetOplAppStateLoadsForTest();
    getAppStateInvoke.mockReset();
    getAppStateInvoke.mockReturnValue(new Promise(() => {}));

    const secondVisit = renderHook(() => useOplAppState('fast'));
    const cachedGateway = readGateway(secondVisit.result.current.appState);

    expect(cachedGateway.connection_mode).toBe('account');
    expect((cachedGateway.account as Record<string, unknown>).email).toBe('feng@example.com');
    expect(secondVisit.result.current.loading).toBe(false);
  });

  it('shares the completed fast payload without reloading when another page mounts', async () => {
    getAppStateInvoke.mockResolvedValue({
      ok: true,
      parsed: {
        app_state: {
          core: { codex: { installed: true } },
          ...appStateWithGateway(gatewayProjection()),
        },
      },
    });

    const firstPage = renderHook(() => useOplAppState('fast'));
    await waitFor(() => expect(firstPage.result.current.appState.core).toEqual({ codex: { installed: true } }));
    firstPage.unmount();

    const secondPage = renderHook(() => useOplAppState('fast'));
    expect(secondPage.result.current.appState.core).toEqual({ codex: { installed: true } });
    expect(secondPage.result.current.loading).toBe(false);
    expect(getAppStateInvoke).toHaveBeenCalledTimes(1);
  });

  it('hydrates a shared fast memory payload that does not yet include the Gateway projection', async () => {
    getAppStateInvoke
      .mockResolvedValueOnce({
        ok: true,
        parsed: { app_state: { core: { codex: { installed: true } } } },
      })
      .mockResolvedValueOnce({
        ok: true,
        parsed: {
          app_state: {
            core: { codex: { installed: true } },
            ...appStateWithGateway(gatewayProjection()),
          },
        },
      });

    const overviewVisit = renderHook(() => useOplAppState('fast'));
    await waitFor(() => expect(overviewVisit.result.current.appState.core).toEqual({ codex: { installed: true } }));
    overviewVisit.unmount();

    const gatewayVisit = renderHook(() => useOplAppState('fast'));
    await waitFor(() => expect(readGateway(gatewayVisit.result.current.appState).connection_mode).toBe('account'));

    expect(gatewayVisit.result.current.loading).toBe(false);
    expect(getAppStateInvoke).toHaveBeenCalledTimes(2);
  });

  it('persists only the bounded startup projection while keeping the full payload in memory', async () => {
    const privateWorkItems = Array.from({ length: 2_000 }, (_, index) => ({ index, body: 'x'.repeat(512) }));
    getAppStateInvoke.mockResolvedValue({
      ok: true,
      parsed: {
        app_state: {
          schema_version: 'opl_app_state.v1',
          core: { codex: { installed: true, model_access_ready: true } },
          work_items: privateWorkItems,
        },
      },
    });

    const { result } = renderHook(() => useOplAppState('fast'));
    await waitFor(() => expect(result.current.appState.work_items).toBe(privateWorkItems));

    const persisted = localStorage.getItem(CACHE_KEY) ?? '';
    expect(new TextEncoder().encode(persisted).byteLength).toBeLessThanOrEqual(OPL_APP_STATE_PERSISTED_CACHE_MAX_BYTES);
    expect(persisted).not.toContain('work_items');
  });

  it('updates an already-mounted consumer when another page persists the connected account', async () => {
    const disconnected = gatewayProjection({
      status: 'not_connected',
      connection_mode: 'none',
      account_card_visible: false,
      account: null,
      usage: null,
      managed_key: null,
      installation: null,
    });
    localStorage.setItem(GATEWAY_CACHE_KEY, JSON.stringify({ projection: disconnected, loadedAt: '20:00:00' }));
    getAppStateInvoke.mockReturnValue(new Promise(() => {}));

    const mountedConsumer = renderHook(() => useOplAppState('fast'));
    expect(readGateway(mountedConsumer.result.current.appState).connection_mode).toBe('none');

    act(() => {
      cacheFastOplAppState({ app_state: appStateWithGateway(gatewayProjection()) }, '20:01:00');
    });

    await waitFor(() => expect(readGateway(mountedConsumer.result.current.appState).connection_mode).toBe('account'));
    expect((readGateway(mountedConsumer.result.current.appState).account as Record<string, unknown>).email).toBe(
      'feng@example.com'
    );
  });

  it('renders an older narrow cache while keeping hydration pending without a Gateway projection', () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        payload: { app_state: { core: { codex: { installed: true, version_status: 'compatible' } } } },
        loadedAt: '20:00:00',
      })
    );
    getAppStateInvoke.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useOplAppState('fast'));

    expect(result.current.appState.core).toEqual({ codex: { installed: true, version_status: 'compatible' } });
    expect(result.current.loading).toBe(true);
  });

  it('retries one failed automatic hydration and then stops without a request loop', async () => {
    getAppStateInvoke.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useOplAppState('fast'));

    await waitFor(() => expect(getAppStateInvoke).toHaveBeenCalledTimes(2), { timeout: 1_000 });
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(getAppStateInvoke).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBe('offline');
    expect(result.current.loading).toBe(false);
  });

  it('keeps the cached account visible when the background refresh fails', async () => {
    seedCachedGateway();
    getAppStateInvoke.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useOplAppState('fast'));

    await waitFor(() => expect(result.current.error).toBe('offline'));
    expect(readGateway(result.current.appState).connection_mode).toBe('account');
  });

  it('keeps the dedicated account projection when a live payload omits the Gateway field', async () => {
    seedCachedGateway();
    getAppStateInvoke.mockResolvedValue({
      ok: true,
      parsed: { app_state: { core: { status: 'ready' } } },
    });

    const { result } = renderHook(() => useOplAppState('fast'));

    await waitFor(() => expect(result.current.appState.core).toEqual({ status: 'ready' }));
    expect(readGateway(result.current.appState).connection_mode).toBe('account');
    expect((readGateway(result.current.appState).account as Record<string, unknown>).email).toBe('feng@example.com');
  });

  it('keeps the last account projection when an explicit full refresh omits the Gateway field', async () => {
    seedCachedGateway();
    getAppStateInvoke.mockResolvedValue({
      ok: true,
      parsed: { app_state: { runtime: { profile: 'full' } } },
    });

    const { result } = renderHook(() => useOplAppState('fast'));

    await waitFor(() => expect(result.current.appState.runtime).toEqual({ profile: 'full' }));
    await act(async () => {
      await result.current.load('full', { showRefreshing: true });
    });
    expect(readGateway(result.current.appState).connection_mode).toBe('account');
    expect((readGateway(result.current.appState).account as Record<string, unknown>).email).toBe('feng@example.com');
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

    const cached = JSON.parse(localStorage.getItem(GATEWAY_CACHE_KEY) ?? '{}') as {
      projection?: Record<string, unknown>;
    };
    expect(cached.projection?.connection_mode).toBe('none');
    const fullStateCache = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as {
      payload?: { app_state?: Record<string, unknown> };
    };
    const readModel = (
      fullStateCache.payload?.app_state?.settings_control_center as Record<string, unknown> | undefined
    )?.app_settings_read_model as Record<string, unknown> | undefined;
    expect(readModel?.opl_gateway_account).toBeUndefined();
  });
});
