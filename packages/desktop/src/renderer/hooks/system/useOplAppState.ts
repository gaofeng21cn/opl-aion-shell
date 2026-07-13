/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IOplRuntimeCommandResult } from '@/common/adapter/ipcBridge';
import type { OplAppStatePayload, OplAppStateProfile, OplAppStateRecord } from '@/common/types/opl/appState';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const APP_STATE_FAST_CACHE_KEY = 'opl.appState.fast.v1';
const inflightAppStateLoads = new Map<OplAppStateProfile, Promise<OplAppStatePayload | null>>();

export function resetOplAppStateLoadsForTest(): void {
  inflightAppStateLoads.clear();
}

export type OplAppStateCache = {
  payload: OplAppStatePayload;
  loadedAt: string | null;
};

export type UseOplAppStateResult = {
  appState: OplAppStateRecord;
  payload: OplAppStatePayload | null;
  loadedAt: string | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  load: (profile?: OplAppStateProfile, options?: OplAppStateLoadOptions) => Promise<OplAppStatePayload | null>;
};

export type OplAppStateLoadOptions = {
  showRefreshing?: boolean;
  background?: boolean;
};

export function isOplRecord(value: unknown): value is OplAppStateRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function oplRecord(value: unknown): OplAppStateRecord {
  return isOplRecord(value) ? value : {};
}

export function oplRecordList(value: unknown): OplAppStateRecord[] {
  return Array.isArray(value) ? value.filter(isOplRecord) : [];
}

export function oplString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function oplNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function getAppState(payload: OplAppStatePayload | null | undefined): OplAppStateRecord {
  return oplRecord(payload?.app_state ?? payload);
}

const GATEWAY_ACCOUNT_CACHE_TOP_LEVEL_FIELDS = [
  'surface_kind',
  'connection_mode',
  'status',
  'account_card_visible',
  'account',
  'usage',
  'managed_key',
  'installation',
  'available_groups',
  'freshness',
  'capabilities',
  'actions',
] as const;

const GATEWAY_ACCOUNT_CACHE_NESTED_FIELDS = {
  account: ['display_name', 'email', 'status', 'balance'],
  balance: ['amount', 'currency'],
  usage: ['today_tokens', 'total_tokens', 'today_actual_cost', 'total_actual_cost', 'currency', 'day_timezone'],
  managed_key: ['name', 'status', 'ownership'],
  installation: ['device_label', 'short_id'],
  available_group: ['group_id', 'label'],
  freshness: ['observed_at', 'stale_after', 'stale', 'last_error_code'],
  capabilities: ['account_login_supported', 'manual_key_supported'],
  actions: ['complete_setup', 'refresh', 'repair', 'use_for_model_access', 'disconnect'],
} as const;

function pickCacheFields(value: unknown, fields: readonly string[]): OplAppStateRecord | null {
  if (value === null) return null;
  if (!isOplRecord(value)) return null;
  return Object.fromEntries(fields.filter((field) => field in value).map((field) => [field, value[field]]));
}

function sanitizeGatewayAccountForCache(value: unknown): OplAppStateRecord | null {
  const gatewayAccount = pickCacheFields(value, GATEWAY_ACCOUNT_CACHE_TOP_LEVEL_FIELDS);
  if (gatewayAccount?.surface_kind !== 'opl_gateway_account_read_model.v1') return null;

  const account = pickCacheFields(gatewayAccount.account, GATEWAY_ACCOUNT_CACHE_NESTED_FIELDS.account);
  if (account && 'balance' in account) {
    account.balance = pickCacheFields(account.balance, GATEWAY_ACCOUNT_CACHE_NESTED_FIELDS.balance);
  }
  gatewayAccount.account = account;
  gatewayAccount.usage = pickCacheFields(gatewayAccount.usage, GATEWAY_ACCOUNT_CACHE_NESTED_FIELDS.usage);
  gatewayAccount.managed_key = pickCacheFields(
    gatewayAccount.managed_key,
    GATEWAY_ACCOUNT_CACHE_NESTED_FIELDS.managed_key
  );
  gatewayAccount.installation = pickCacheFields(
    gatewayAccount.installation,
    GATEWAY_ACCOUNT_CACHE_NESTED_FIELDS.installation
  );
  gatewayAccount.available_groups = oplRecordList(gatewayAccount.available_groups).map(
    (group) => pickCacheFields(group, GATEWAY_ACCOUNT_CACHE_NESTED_FIELDS.available_group) ?? {}
  );
  gatewayAccount.freshness = pickCacheFields(gatewayAccount.freshness, GATEWAY_ACCOUNT_CACHE_NESTED_FIELDS.freshness);
  gatewayAccount.capabilities = pickCacheFields(
    gatewayAccount.capabilities,
    GATEWAY_ACCOUNT_CACHE_NESTED_FIELDS.capabilities
  );
  gatewayAccount.actions = pickCacheFields(gatewayAccount.actions, GATEWAY_ACCOUNT_CACHE_NESTED_FIELDS.actions);
  return gatewayAccount;
}

function sanitizeAppStateForCache(appState: OplAppStateRecord): OplAppStateRecord {
  const settingsControlCenter = oplRecord(appState.settings_control_center);
  const appSettingsReadModel = oplRecord(settingsControlCenter.app_settings_read_model);
  if (!('opl_gateway_account' in appSettingsReadModel)) return appState;
  const gatewayAccount = sanitizeGatewayAccountForCache(appSettingsReadModel.opl_gateway_account);
  const { opl_gateway_account: _rawGatewayAccount, ...readModelWithoutGatewayAccount } = appSettingsReadModel;
  const safeReadModel = gatewayAccount
    ? { ...readModelWithoutGatewayAccount, opl_gateway_account: gatewayAccount }
    : readModelWithoutGatewayAccount;
  return {
    ...appState,
    settings_control_center: {
      ...settingsControlCenter,
      app_settings_read_model: safeReadModel,
    },
  };
}

export function sanitizeOplAppStatePayloadForCache(payload: OplAppStatePayload): OplAppStatePayload {
  if (isOplRecord(payload.app_state)) {
    return { ...payload, app_state: sanitizeAppStateForCache(payload.app_state) };
  }
  return sanitizeAppStateForCache(payload) as OplAppStatePayload;
}

function payloadFromBridgeResult(result: IOplRuntimeCommandResult | null | undefined): OplAppStatePayload | null {
  if (result?.ok === false) {
    throw new Error(result.error?.message || 'OPL App state command failed');
  }
  if (!isOplRecord(result?.parsed)) return null;
  const parsed = result.parsed;
  const payload = isOplRecord(parsed.app_state) ? { app_state: parsed.app_state } : parsed;
  return payload as OplAppStatePayload;
}

export function loadOplAppStateFromBridge(profile: OplAppStateProfile): Promise<OplAppStatePayload | null> {
  const inflight = inflightAppStateLoads.get(profile);
  if (inflight) return inflight;

  const request = ipcBridge.oplRuntime.getAppState.invoke({ profile }).then(payloadFromBridgeResult);
  inflightAppStateLoads.set(profile, request);
  void request.then(
    () => {
      if (inflightAppStateLoads.get(profile) === request) {
        inflightAppStateLoads.delete(profile);
      }
    },
    () => {
      if (inflightAppStateLoads.get(profile) === request) {
        inflightAppStateLoads.delete(profile);
      }
    }
  );
  return request;
}

function readCachedFastState(): OplAppStateCache | null {
  try {
    const raw = localStorage.getItem(APP_STATE_FAST_CACHE_KEY);
    if (!raw) return null;
    const parsed = oplRecord(JSON.parse(raw) as unknown);
    const payload = sanitizeOplAppStatePayloadForCache(oplRecord(parsed.payload) as OplAppStatePayload);
    if (Object.keys(getAppState(payload)).length === 0) return null;
    return {
      payload,
      loadedAt: oplString(parsed.loadedAt),
    };
  } catch {
    return null;
  }
}

function hasGatewayAccountProjection(payload: OplAppStatePayload | null | undefined): boolean {
  const settingsControlCenter = oplRecord(getAppState(payload).settings_control_center);
  const appSettingsReadModel = oplRecord(settingsControlCenter.app_settings_read_model);
  return sanitizeGatewayAccountForCache(appSettingsReadModel.opl_gateway_account) !== null;
}

export function cacheFastOplAppState(payload: OplAppStatePayload, loadedAt: string): void {
  try {
    localStorage.setItem(
      APP_STATE_FAST_CACHE_KEY,
      JSON.stringify({ payload: sanitizeOplAppStatePayloadForCache(payload), loadedAt })
    );
  } catch {
    // The CLI-backed App state remains authoritative when localStorage is unavailable.
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useOplAppState(initialProfile: OplAppStateProfile = 'fast'): UseOplAppStateResult {
  const cached = useMemo(() => (initialProfile === 'fast' ? readCachedFastState() : null), [initialProfile]);
  const [payload, setPayload] = useState<OplAppStatePayload | null>(cached?.payload ?? null);
  const [loadedAt, setLoadedAt] = useState<string | null>(cached?.loadedAt ?? null);
  const [loading, setLoading] = useState(!cached || !hasGatewayAccountProjection(cached.payload));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const initialHadCachedState = useRef(Boolean(cached));

  const load = useCallback(
    async (
      profile: OplAppStateProfile = initialProfile,
      options: OplAppStateLoadOptions = {}
    ): Promise<OplAppStatePayload | null> => {
      requestSeq.current += 1;
      const requestId = requestSeq.current;
      if (options.showRefreshing) {
        setRefreshing(true);
      } else if (!options.background) {
        setLoading(true);
      }
      setError(null);
      try {
        const nextPayload = await loadOplAppStateFromBridge(profile);
        if (requestSeq.current !== requestId) return null;
        if (!nextPayload) {
          throw new Error('Invalid OPL App state payload');
        }
        const nextLoadedAt = new Date().toLocaleTimeString();
        setPayload(nextPayload);
        setLoadedAt(nextLoadedAt);
        if (profile === 'fast') cacheFastOplAppState(nextPayload, nextLoadedAt);
        return nextPayload;
      } catch (caughtError) {
        if (requestSeq.current === requestId) setError(errorMessage(caughtError));
        return null;
      } finally {
        if (requestSeq.current === requestId) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [initialProfile]
  );

  useEffect(() => {
    void load(initialProfile, { background: initialHadCachedState.current });
  }, [initialProfile, load]);

  return {
    appState: getAppState(payload),
    payload,
    loadedAt,
    loading,
    refreshing,
    error,
    load,
  };
}
