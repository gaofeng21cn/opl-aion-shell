import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAppStateInvoke = vi.hoisted(() => vi.fn());
const executeActionInvoke = vi.hoisted(() => vi.fn());
const startupMaintenanceEmitter = vi.hoisted(() => ({
  callback: null as null | (() => void),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      getAppState: { invoke: getAppStateInvoke },
      executeAction: { invoke: executeActionInvoke },
      startupMaintenanceCompleted: {
        on: (callback: () => void) => {
          startupMaintenanceEmitter.callback = callback;
          return () => {
            if (startupMaintenanceEmitter.callback === callback) startupMaintenanceEmitter.callback = null;
          };
        },
      },
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

function readGatewayOrNull(appState: Record<string, unknown>): Record<string, unknown> | null {
  const settings = appState.settings_control_center;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null;
  const readModel = (settings as Record<string, unknown>).app_settings_read_model;
  if (!readModel || typeof readModel !== 'object' || Array.isArray(readModel)) return null;
  const gateway = (readModel as Record<string, unknown>).opl_gateway_account;
  return gateway && typeof gateway === 'object' && !Array.isArray(gateway)
    ? (gateway as Record<string, unknown>)
    : null;
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

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe('useOplAppState Gateway account bootstrap cache', () => {
  beforeEach(() => {
    localStorage.clear();
    getAppStateInvoke.mockReset();
    executeActionInvoke.mockReset();
    resetOplAppStateLoadsForTest();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not load automatically when the caller opts out', () => {
    renderHook(() => useOplAppState('fast', { autoLoad: false }));

    expect(getAppStateInvoke).not.toHaveBeenCalled();
  });

  it('keeps the empty App state reference stable before a payload is available', () => {
    const { result, rerender } = renderHook(() => useOplAppState('fast', { autoLoad: false }));
    const initialAppState = result.current.appState;

    rerender();

    expect(result.current.appState).toBe(initialAppState);
    expect(Object.isFrozen(result.current.appState)).toBe(true);
  });

  it('performs one shared fresh fast-state refresh when startup maintenance completes', async () => {
    seedCachedGateway();
    let resolveRefresh!: (value: unknown) => void;
    getAppStateInvoke.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      })
    );
    const { result } = renderHook(() => useOplAppState('fast', { autoLoad: false }));

    act(() => {
      startupMaintenanceEmitter.callback?.();
      startupMaintenanceEmitter.callback?.();
    });
    expect(getAppStateInvoke).toHaveBeenCalledTimes(1);
    expect(getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' });

    resolveRefresh({
      ok: true,
      parsed: {
        app_state: {
          core: { codex: { version: 'after-maintenance' } },
          ...appStateWithGateway(gatewayProjection()),
        },
      },
    });
    await waitFor(() =>
      expect((result.current.appState.core as Record<string, unknown>).codex).toEqual({
        version: 'after-maintenance',
      })
    );
  });

  it('coalesces queued force-fresh and poll callers into one fresh fast read', async () => {
    let resolveShared!: (value: { ok: true; parsed: { app_state: { version: string } } }) => void;
    const sharedRequest = new Promise<{ ok: true; parsed: { app_state: { version: string } } }>((resolve) => {
      resolveShared = resolve;
    });
    const freshRequest = deferred<{ ok: true; parsed: { app_state: { version: string } } }>();
    getAppStateInvoke.mockReturnValueOnce(sharedRequest).mockReturnValueOnce(freshRequest.promise);

    const sharedLoad = loadOplAppStateFromBridge('fast');
    const firstFreshLoad = loadOplAppStateFromBridge('fast', { forceFresh: true });
    const secondFreshLoad = loadOplAppStateFromBridge('fast', { forceFresh: true });
    const thirdFreshLoad = loadOplAppStateFromBridge('fast', { forceFresh: true });

    expect(secondFreshLoad).toBe(firstFreshLoad);
    expect(thirdFreshLoad).toBe(firstFreshLoad);
    expect(getAppStateInvoke).toHaveBeenCalledTimes(1);

    resolveShared({ ok: true, parsed: { app_state: { version: 'shared' } } });
    await expect(sharedLoad).resolves.toEqual({ app_state: { version: 'shared' } });
    expect(getAppStateInvoke).toHaveBeenCalledTimes(2);

    const pollLoad = loadOplAppStateFromBridge('fast');
    expect(pollLoad).toBe(firstFreshLoad);
    freshRequest.resolve({ ok: true, parsed: { app_state: { version: 'fresh' } } });
    await expect(Promise.all([firstFreshLoad, secondFreshLoad, thirdFreshLoad, pollLoad])).resolves.toEqual([
      { app_state: { version: 'fresh' } },
      { app_state: { version: 'fresh' } },
      { app_state: { version: 'fresh' } },
      { app_state: { version: 'fresh' } },
    ]);
    expect(getAppStateInvoke).toHaveBeenCalledTimes(2);
  });

  it('prevents an old fast response in one hook from overwriting a force-fresh response in another', async () => {
    const oldRequest = deferred<{ ok: true; parsed: { app_state: { version: string } } }>();
    const freshRequest = deferred<{ ok: true; parsed: { app_state: { version: string } } }>();
    getAppStateInvoke.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(freshRequest.promise);
    const firstHook = renderHook(() => useOplAppState('fast', { autoLoad: false }));
    const secondHook = renderHook(() => useOplAppState('fast', { autoLoad: false }));
    let oldLoad!: Promise<unknown>;
    let freshLoad!: Promise<unknown>;

    act(() => {
      oldLoad = firstHook.result.current.load('fast', { background: true });
    });
    act(() => {
      freshLoad = secondHook.result.current.load('fast', { forceFresh: true });
    });

    oldRequest.resolve({ ok: true, parsed: { app_state: { version: 'old' } } });
    await act(async () => {
      await expect(oldLoad).resolves.toBeNull();
    });
    expect(getAppStateInvoke).toHaveBeenCalledTimes(2);
    expect(firstHook.result.current.appState).toEqual({});
    const interimHook = renderHook(() => useOplAppState('fast', { autoLoad: false }));
    expect(interimHook.result.current.appState).toEqual({});
    interimHook.unmount();

    const freshPayload = { app_state: { version: 'fresh' } };
    freshRequest.resolve({ ok: true, parsed: freshPayload });
    await act(async () => {
      await expect(freshLoad).resolves.toEqual(freshPayload);
    });
    expect(secondHook.result.current.appState).toEqual(freshPayload.app_state);
    expect(firstHook.result.current.appState).toEqual(freshPayload.app_state);
    const finalHook = renderHook(() => useOplAppState('fast', { autoLoad: false }));
    expect(finalHook.result.current.appState).toEqual(freshPayload.app_state);
  });

  it('renders the cached connected account before the background refresh resolves', () => {
    seedCachedGateway();
    getAppStateInvoke.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useOplAppState('fast'));
    const gateway = readGateway(result.current.appState);

    expect(gateway.connection_mode).toBe('account');
    expect((gateway.account as Record<string, unknown>).email).toBe('feng@example.com');
    expect(gateway.actions).toEqual({
      complete_setup: null,
      refresh: null,
      repair: null,
      use_for_model_access: null,
      disconnect: null,
    });
    expect(gateway.capabilities).toEqual({ account_login_supported: false, manual_key_supported: false });
    expect(result.current.loading).toBe(false);
    expect(result.current.provenance).toBe('derived_bootstrap');
  });

  it('refreshes Gateway directly through the owner action and publishes its projection without a fast-state read', async () => {
    seedCachedGateway();
    const refreshed = gatewayProjection({
      usage: {
        today_tokens: 56,
        total_tokens: 78,
        today_actual_cost: 0.3,
        total_actual_cost: 0.4,
        currency: 'USD',
        day_timezone: 'Asia/Shanghai',
      },
      freshness: {
        observed_at: '2026-08-07T04:00:00.000Z',
        stale_after: '2026-08-07T04:15:00.000Z',
        stale: false,
        last_error_code: null,
      },
    });
    executeActionInvoke.mockResolvedValue({
      ok: true,
      parsed: {
        app_action_execution: {
          result: { gateway_account: refreshed },
        },
      },
    });
    getAppStateInvoke.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useOplAppState('fast', { autoLoad: false }));
    let actionResult!: unknown;
    await act(async () => {
      actionResult = await result.current.refreshGatewayAccount();
    });

    expect(executeActionInvoke).toHaveBeenCalledWith({ actionId: 'gateway_account_refresh', dryRun: false });
    expect(getAppStateInvoke).not.toHaveBeenCalled();
    expect(readGateway(result.current.appState).usage).toEqual(refreshed.usage);
    expect(result.current.provenance).toBe('live');
    expect(result.current.error).toBeNull();
    expect((actionResult as { parsed: { app_action_execution: { result: { gateway_account: unknown } } } }).parsed
      .app_action_execution.result.gateway_account).toEqual(refreshed);
    const persisted = JSON.parse(localStorage.getItem(GATEWAY_CACHE_KEY) ?? '{}') as {
      projection?: Record<string, unknown>;
    };
    expect(persisted.projection?.usage).toEqual(refreshed.usage);
  });

  it('keeps cached Gateway data when the owner refresh action fails', async () => {
    seedCachedGateway();
    executeActionInvoke.mockResolvedValue({
      ok: false,
      error: { message: 'Gateway offline' },
    });

    const { result } = renderHook(() => useOplAppState('fast', { autoLoad: false }));
    await act(async () => {
      await result.current.refreshGatewayAccount();
    });

    expect(readGateway(result.current.appState).account).toMatchObject({ email: 'feng@example.com' });
    expect(result.current.provenance).toBe('derived_bootstrap');
    expect(result.current.error).toBe('Gateway offline');
  });

  it('recomputes cached Gateway staleness when stale_after passes while mounted', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T12:10:00.000Z'));
    seedCachedGateway();
    getAppStateInvoke.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useOplAppState('fast'));

    expect((readGateway(result.current.appState).freshness as Record<string, unknown>).stale).toBe(false);
    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });
    expect((readGateway(result.current.appState).freshness as Record<string, unknown>).stale).toBe(true);
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
    expect(secondPage.result.current.provenance).toBe('live');
    expect(getAppStateInvoke).toHaveBeenCalledTimes(1);
  });

  it('requires a fresh read before a new consumer receives live authority', async () => {
    getAppStateInvoke.mockResolvedValueOnce({
      ok: true,
      parsed: { app_state: appStateWithGateway(gatewayProjection()) },
    });
    const firstVisit = renderHook(() => useOplAppState('fast'));
    await waitFor(() => expect(firstVisit.result.current.provenance).toBe('live'));
    firstVisit.unmount();

    let resolveFresh!: (value: unknown) => void;
    getAppStateInvoke.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFresh = resolve;
      })
    );
    const authorityConsumer = renderHook(() => useOplAppState('fast', { requireLive: true }));

    expect(authorityConsumer.result.current.provenance).toBe('derived_bootstrap');
    expect(getAppStateInvoke).toHaveBeenCalledTimes(2);

    resolveFresh({
      ok: true,
      parsed: { app_state: appStateWithGateway(gatewayProjection({ status: 'connected' })) },
    });
    await waitFor(() => expect(authorityConsumer.result.current.provenance).toBe('live'));
  });

  it('does not downgrade live authority when another consumer broadcasts the shared cache', async () => {
    getAppStateInvoke.mockResolvedValueOnce({
      ok: true,
      parsed: { app_state: appStateWithGateway(gatewayProjection({ status: 'connected' })) },
    });
    const authorityConsumer = renderHook(() => useOplAppState('fast', { autoLoad: false, requireLive: true }));

    await act(async () => {
      await authorityConsumer.result.current.load('fast', { forceFresh: true });
    });
    await waitFor(() => expect(authorityConsumer.result.current.provenance).toBe('live'));

    act(() => {
      cacheFastOplAppState({ app_state: appStateWithGateway(gatewayProjection({ status: 'connected' })) }, '20:01:00');
    });

    expect(authorityConsumer.result.current.provenance).toBe('live');
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
    expect(JSON.parse(persisted)).toMatchObject({ provenance: 'derived_bootstrap' });
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
    expect(result.current.provenance).toBe('derived_bootstrap');
  });

  it('does not splice the dedicated account cache into a live payload that omits the Gateway field', async () => {
    seedCachedGateway();
    getAppStateInvoke.mockResolvedValue({
      ok: true,
      parsed: { app_state: { core: { status: 'ready' } } },
    });

    const { result } = renderHook(() => useOplAppState('fast'));

    await waitFor(() => expect(result.current.appState.core).toEqual({ status: 'ready' }));
    expect(readGatewayOrNull(result.current.appState)).toBeNull();
    expect(result.current.provenance).toBe('live');
  });

  it('does not splice the last account projection into an explicit full refresh', async () => {
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
    expect(readGatewayOrNull(result.current.appState)).toBeNull();
    expect(result.current.provenance).toBe('live');
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
