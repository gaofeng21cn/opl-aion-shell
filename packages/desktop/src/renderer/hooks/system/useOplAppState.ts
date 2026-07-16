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
const GATEWAY_ACCOUNT_CACHE_KEY = 'opl.gatewayAccount.projection.v1';
const APP_STATE_CACHE_UPDATED_EVENT = 'opl:app-state-cache-updated';
export const OPL_APP_STATE_PERSISTED_CACHE_MAX_BYTES = 262_144;
const AUTOMATIC_APP_STATE_MAX_ATTEMPTS = 2;
const AUTOMATIC_APP_STATE_RETRY_DELAY_MS = 250;
const inflightAppStateLoads = new Map<OplAppStateProfile, Promise<OplAppStatePayload | null>>();
let startupMaintenanceRefreshInFlight: Promise<void> | null = null;
let startupMaintenanceRefreshUnsubscribe: (() => void) | null = null;

export type OplAppStateCache = {
  payload: OplAppStatePayload;
  loadedAt: string | null;
};

const memoryAppStateCaches = new Map<OplAppStateProfile, OplAppStateCache>();
const automaticAppStateLoadsStarted = new Set<OplAppStateProfile>();

export function resetOplAppStateLoadsForTest(): void {
  startupMaintenanceRefreshUnsubscribe?.();
  startupMaintenanceRefreshUnsubscribe = null;
  startupMaintenanceRefreshInFlight = null;
  inflightAppStateLoads.clear();
  memoryAppStateCaches.clear();
  automaticAppStateLoadsStarted.clear();
}

function refreshFastStateAfterStartupMaintenance(): void {
  if (startupMaintenanceRefreshInFlight) return;
  startupMaintenanceRefreshInFlight = loadOplAppStateFromBridge('fast', { forceFresh: true })
    .then((payload) => {
      if (!payload) return;
      const nextPayload = mergeCachedGatewayAccount(payload);
      cacheFastOplAppState(nextPayload, new Date().toLocaleTimeString());
    })
    .catch(() => {
      // Overview's bounded recovery loop remains the fallback when this best-effort refresh fails.
    })
    .finally(() => {
      startupMaintenanceRefreshInFlight = null;
    });
}

function ensureStartupMaintenanceRefreshSubscription(): void {
  if (startupMaintenanceRefreshUnsubscribe || typeof window === 'undefined') return;
  startupMaintenanceRefreshUnsubscribe = ipcBridge.oplRuntime.startupMaintenanceCompleted.on(() => {
    refreshFastStateAfterStartupMaintenance();
  });
}

type OplGatewayAccountCache = {
  projection: OplAppStateRecord;
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
  forceFresh?: boolean;
};

export type UseOplAppStateOptions = {
  autoLoad?: boolean;
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

const CORE_CODEX_CACHE_FIELDS = [
  'installed',
  'version',
  'parsed_version',
  'minimum_version',
  'version_status',
  'latest_version',
  'latest_version_status',
  'update_available',
  'health_status',
  'model_access_ready',
  'model_access_status',
  'model_access_source',
  'api_key_present',
  'codex_login_present',
  'opl_gateway_configured',
] as const;

const WORKSPACE_ROOT_CACHE_FIELDS = [
  'selected_path',
  'exists',
  'writable',
  'health_status',
  'status',
  'source',
] as const;

const WORKSPACE_CACHE_FIELDS = [
  'selected_path',
  'path',
  'exists',
  'writable',
  'health_status',
  'status',
  'ready',
] as const;

const RELEASE_CACHE_FIELDS = [
  'version',
  'tag',
  'repo',
  'release_repo',
  'channel',
  'release_channel',
  'opl_framework_revision',
  'framework_revision',
  'opl_framework_commit',
  'framework_commit',
  'opl_framework_date',
  'framework_date',
] as const;

const STATUS_SUMMARY_CACHE_FIELDS = [
  'model_access',
  'codex_version',
  'runtime_source_carrier_health',
  'temporal_provider',
  'release_channel',
  'issue_count',
] as const;

const ISSUE_QUEUE_CACHE_FIELDS = [
  'issue_id',
  'status_code',
  'label',
  'user_message',
  'severity',
  'source_ref',
  'recommended_action_id',
  'route',
  'owner_surface',
] as const;

const CODEX_MODEL_POLICY_CACHE_FIELDS = [
  'source_ref',
  'model',
  'reasoning_effort',
  'model_provider',
  'provider_name',
  'provider_base_url',
  'profile_source',
  'api_key_present',
  'opl_gateway_configured',
  'model_access_ready',
  'model_access_source',
  'access_status',
  'repair_action_id',
  'shell_must_not_rewrite_policy',
] as const;

const WORKSPACE_ROOT_READ_MODEL_CACHE_FIELDS = [
  'source_ref',
  'selected_path',
  'source',
  'exists',
  'writable',
  'health_status',
  'verify_action_id',
  'verify_route',
] as const;

const FAMILY_WORKSPACE_ROOT_READ_MODEL_CACHE_FIELDS = ['source_ref', 'selected_path', 'source', 'role'] as const;

const RUNTIME_SOURCE_CARRIERS_CACHE_FIELDS = [
  'source_ref',
  'source_mode',
  'runtime_sources_root',
  'default_carriers_count',
  'healthy_default_carriers_count',
  'health',
  'sync_action_id',
  'apply_action_id',
] as const;

const WORKSPACE_SERVICE_REF_CACHE_FIELDS = ['id', 'title', 'status', 'ref', 'owner', 'next_action'] as const;

const LOCAL_SERVICES_CACHE_FIELDS = [
  'source_ref',
  'temporal_provider',
  'temporal_health_status',
  'temporal_status',
  'selected_provider',
] as const;

const LOCAL_ENVIRONMENT_CACHE_FIELDS = [
  'source_ref',
  'state_dir',
  'runtime_sources_root',
  'logs_dir',
  'update_channel_file',
  'developer_supervisor_config_file',
  'release_channel',
  'app_update_action_id',
  'runtime_roots_cleanup_action_id',
  'runtime_substrate_rollback_action_id',
  'temporal_provider',
] as const;

function pickCacheFields(value: unknown, fields: readonly string[]): OplAppStateRecord | null {
  if (value === null) return null;
  if (!isOplRecord(value)) return null;
  return Object.fromEntries(fields.filter((field) => field in value).map((field) => [field, value[field]]));
}

function pickScalarCacheFields(value: unknown, fields: readonly string[]): OplAppStateRecord | null {
  if (!isOplRecord(value)) return null;
  const entries = fields.flatMap((field) => {
    const fieldValue = value[field];
    if (
      fieldValue === null ||
      typeof fieldValue === 'string' ||
      typeof fieldValue === 'boolean' ||
      (typeof fieldValue === 'number' && Number.isFinite(fieldValue))
    ) {
      return [[field, fieldValue] as const];
    }
    return [];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : null;
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

function sanitizeWorkspaceServicesForCache(value: unknown): OplAppStateRecord | null {
  if (!isOplRecord(value)) return null;
  const workspaceRoot = pickScalarCacheFields(value.workspace_root, WORKSPACE_ROOT_READ_MODEL_CACHE_FIELDS);
  const familyWorkspaceRoot = pickScalarCacheFields(
    value.family_workspace_root,
    FAMILY_WORKSPACE_ROOT_READ_MODEL_CACHE_FIELDS
  );
  const runtimeSourceCarriers = pickScalarCacheFields(
    value.runtime_source_carriers,
    RUNTIME_SOURCE_CARRIERS_CACHE_FIELDS
  );
  const runtimeSourceCarrierValue = oplRecord(value.runtime_source_carriers);
  if (runtimeSourceCarriers) {
    for (const field of ['capability_health_refs', 'connector_readiness_refs', 'workflow_refs'] as const) {
      runtimeSourceCarriers[field] = oplRecordList(runtimeSourceCarrierValue[field])
        .slice(0, 50)
        .map((item) => pickScalarCacheFields(item, WORKSPACE_SERVICE_REF_CACHE_FIELDS) ?? {});
    }
  }
  const localServices = pickScalarCacheFields(value.local_services, LOCAL_SERVICES_CACHE_FIELDS);
  const serviceActionIds = oplRecord(value.local_services).service_action_ids;
  if (localServices && Array.isArray(serviceActionIds)) {
    localServices.service_action_ids = serviceActionIds
      .filter((item): item is string => typeof item === 'string')
      .slice(0, 50);
  }
  const entries = [
    ['workspace_root', workspaceRoot],
    ['family_workspace_root', familyWorkspaceRoot],
    ['runtime_source_carriers', runtimeSourceCarriers],
    ['local_services', localServices],
  ].filter((entry): entry is [string, OplAppStateRecord] => Boolean(entry[1]));
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function sanitizeAppStateForCache(appState: OplAppStateRecord): OplAppStateRecord {
  const sanitized: OplAppStateRecord = {};
  const topLevel = pickScalarCacheFields(appState, ['schema_version', 'surface_kind', 'update_channel']);
  if (topLevel) Object.assign(sanitized, topLevel);

  const codex = pickScalarCacheFields(oplRecord(appState.core).codex, CORE_CODEX_CACHE_FIELDS);
  if (codex) sanitized.core = { codex };

  const paths = oplRecord(appState.paths);
  const workspaceRoot = pickScalarCacheFields(paths.workspace_root, WORKSPACE_ROOT_CACHE_FIELDS);
  const safePaths = pickScalarCacheFields(paths, ['workspace_root_path', 'family_workspace_root']) ?? {};
  if (workspaceRoot) safePaths.workspace_root = workspaceRoot;
  if (Object.keys(safePaths).length > 0) sanitized.paths = safePaths;

  const workspace = pickScalarCacheFields(appState.workspace, WORKSPACE_CACHE_FIELDS);
  if (workspace) sanitized.workspace = workspace;

  const release = pickScalarCacheFields(appState.release, RELEASE_CACHE_FIELDS);
  if (release) sanitized.release = release;

  const settingsControlCenter = oplRecord(appState.settings_control_center);
  const appSettingsReadModel = oplRecord(settingsControlCenter.app_settings_read_model);
  const gatewayAccount = sanitizeGatewayAccountForCache(appSettingsReadModel.opl_gateway_account);
  const codexModelPolicy = pickScalarCacheFields(
    appSettingsReadModel.codex_model_policy,
    CODEX_MODEL_POLICY_CACHE_FIELDS
  );
  const workspaceServices = sanitizeWorkspaceServicesForCache(appSettingsReadModel.workspace_services);
  const localEnvironment = pickScalarCacheFields(
    appSettingsReadModel.local_environment,
    LOCAL_ENVIRONMENT_CACHE_FIELDS
  );
  const statusSummary = pickScalarCacheFields(settingsControlCenter.status_summary, STATUS_SUMMARY_CACHE_FIELDS);
  const issueQueue = oplRecordList(settingsControlCenter.issue_queue)
    .slice(0, 50)
    .map((issue) => pickScalarCacheFields(issue, ISSUE_QUEUE_CACHE_FIELDS) ?? {});
  const readModelCandidates = {
    opl_gateway_account: gatewayAccount,
    codex_model_policy: codexModelPolicy,
    workspace_services: workspaceServices,
    local_environment: localEnvironment,
  };
  const sanitizedReadModel = Object.fromEntries(
    Object.entries(readModelCandidates).filter((entry): entry is [string, OplAppStateRecord] => Boolean(entry[1]))
  );
  if (statusSummary || issueQueue.length > 0 || Object.keys(sanitizedReadModel).length > 0) {
    const sanitizedSettingsControlCenter: OplAppStateRecord = {};
    if (statusSummary) sanitizedSettingsControlCenter.status_summary = statusSummary;
    if (issueQueue.length > 0) sanitizedSettingsControlCenter.issue_queue = issueQueue;
    if (Object.keys(sanitizedReadModel).length > 0) {
      sanitizedSettingsControlCenter.app_settings_read_model = sanitizedReadModel;
    }
    sanitized.settings_control_center = sanitizedSettingsControlCenter;
  }
  return sanitized;
}

export function sanitizeOplAppStatePayloadForCache(payload: OplAppStatePayload): OplAppStatePayload {
  if (isOplRecord(payload.app_state)) {
    const wrapper = pickScalarCacheFields(payload, ['version']) ?? {};
    return { ...wrapper, app_state: sanitizeAppStateForCache(payload.app_state) };
  }
  return sanitizeAppStateForCache(payload) as OplAppStatePayload;
}

function gatewayAccountProjectionFromPayload(payload: OplAppStatePayload | null | undefined): OplAppStateRecord | null {
  const settingsControlCenter = oplRecord(getAppState(payload).settings_control_center);
  const appSettingsReadModel = oplRecord(settingsControlCenter.app_settings_read_model);
  return sanitizeGatewayAccountForCache(appSettingsReadModel.opl_gateway_account);
}

function withGatewayAccountProjection(payload: OplAppStatePayload, projection: OplAppStateRecord): OplAppStatePayload {
  const appState = getAppState(payload);
  const settingsControlCenter = oplRecord(appState.settings_control_center);
  const appSettingsReadModel = oplRecord(settingsControlCenter.app_settings_read_model);
  const nextAppState = {
    ...appState,
    settings_control_center: {
      ...settingsControlCenter,
      app_settings_read_model: {
        ...appSettingsReadModel,
        opl_gateway_account: projection,
      },
    },
  };
  return isOplRecord(payload.app_state)
    ? { ...payload, app_state: nextAppState }
    : (nextAppState as OplAppStatePayload);
}

function withoutGatewayAccountProjection(payload: OplAppStatePayload): OplAppStatePayload {
  const appState = getAppState(payload);
  const settingsControlCenter = oplRecord(appState.settings_control_center);
  const appSettingsReadModel = oplRecord(settingsControlCenter.app_settings_read_model);
  if (!('opl_gateway_account' in appSettingsReadModel)) return payload;
  const { opl_gateway_account: _gatewayAccount, ...readModelWithoutGatewayAccount } = appSettingsReadModel;
  const { settings_control_center: _settingsControlCenter, ...appStateWithoutSettings } = appState;
  const nextAppState =
    Object.keys(readModelWithoutGatewayAccount).length === 0
      ? appStateWithoutSettings
      : {
          ...appState,
          settings_control_center: {
            ...settingsControlCenter,
            app_settings_read_model: readModelWithoutGatewayAccount,
          },
        };
  return isOplRecord(payload.app_state)
    ? { ...payload, app_state: nextAppState }
    : (nextAppState as OplAppStatePayload);
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

export function loadOplAppStateFromBridge(
  profile: OplAppStateProfile,
  options: Pick<OplAppStateLoadOptions, 'forceFresh'> = {}
): Promise<OplAppStatePayload | null> {
  const inflight = inflightAppStateLoads.get(profile);
  if (inflight) {
    if (!options.forceFresh) return inflight;
    return inflight
      .catch((): null => null)
      .then(() => {
        if (inflightAppStateLoads.get(profile) === inflight) {
          inflightAppStateLoads.delete(profile);
        }
        return loadOplAppStateFromBridge(profile, { forceFresh: true });
      });
  }

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

function readCachedGatewayAccount(): OplGatewayAccountCache | null {
  try {
    const raw = localStorage.getItem(GATEWAY_ACCOUNT_CACHE_KEY);
    if (!raw) return null;
    const parsed = oplRecord(JSON.parse(raw) as unknown);
    const projection = sanitizeGatewayAccountForCache(parsed.projection);
    if (!projection) return null;
    return {
      projection,
      loadedAt: oplString(parsed.loadedAt),
    };
  } catch {
    return null;
  }
}

function cacheGatewayAccountProjection(projection: OplAppStateRecord, loadedAt: string | null): void {
  try {
    localStorage.setItem(GATEWAY_ACCOUNT_CACHE_KEY, JSON.stringify({ projection, loadedAt }));
  } catch {
    // The Framework-owned projection remains authoritative when renderer persistence is unavailable.
  }
}

function cacheInMemory(profile: OplAppStateProfile, payload: OplAppStatePayload, loadedAt: string | null): void {
  memoryAppStateCaches.set(profile, { payload, loadedAt });
}

function mergeGatewayIntoFastMemory(projection: OplAppStateRecord, loadedAt: string | null): void {
  const current = memoryAppStateCaches.get('fast');
  if (!current) return;
  memoryAppStateCaches.set('fast', {
    payload: withGatewayAccountProjection(current.payload, projection),
    loadedAt: current.loadedAt ?? loadedAt,
  });
}

function notifyOplAppStateCacheUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(APP_STATE_CACHE_UPDATED_EVENT));
}

function readLegacyFastStateCache(): OplAppStateCache | null {
  try {
    const raw = localStorage.getItem(APP_STATE_FAST_CACHE_KEY);
    if (!raw) return null;
    const parsed = oplRecord(JSON.parse(raw) as unknown);
    const payload = sanitizeOplAppStatePayloadForCache(oplRecord(parsed.payload) as OplAppStatePayload);
    if (Object.keys(getAppState(payload)).length === 0) return null;
    return { payload, loadedAt: oplString(parsed.loadedAt) };
  } catch {
    return null;
  }
}

function readCachedFastState(): OplAppStateCache | null {
  const appStateCache = readLegacyFastStateCache();
  const gatewayCache = readCachedGatewayAccount();
  const legacyGatewayProjection = gatewayAccountProjectionFromPayload(appStateCache?.payload);
  const gatewayProjection = gatewayCache?.projection ?? legacyGatewayProjection;
  if (!appStateCache && !gatewayProjection) return null;

  if (!gatewayCache && legacyGatewayProjection) {
    cacheGatewayAccountProjection(legacyGatewayProjection, appStateCache?.loadedAt ?? null);
  }

  const basePayload = appStateCache?.payload ?? ({ app_state: {} } as OplAppStatePayload);
  return {
    payload: gatewayProjection ? withGatewayAccountProjection(basePayload, gatewayProjection) : basePayload,
    loadedAt: gatewayCache?.loadedAt ?? appStateCache?.loadedAt ?? null,
  };
}

function hasGatewayAccountProjection(payload: OplAppStatePayload | null | undefined): boolean {
  return gatewayAccountProjectionFromPayload(payload) !== null;
}

function hasHydratedMemoryAppStateCache(profile: OplAppStateProfile): boolean {
  const cached = memoryAppStateCaches.get(profile);
  return Boolean(cached && (profile !== 'fast' || hasGatewayAccountProjection(cached.payload)));
}

function mergeCachedGatewayAccount(payload: OplAppStatePayload): OplAppStatePayload {
  if (gatewayAccountProjectionFromPayload(payload)) return payload;
  const cachedGateway = readCachedGatewayAccount();
  return cachedGateway ? withGatewayAccountProjection(payload, cachedGateway.projection) : payload;
}

export function cacheFastOplAppState(payload: OplAppStatePayload, loadedAt: string): void {
  cacheInMemory('fast', payload, loadedAt);
  const sanitizedPayload = sanitizeOplAppStatePayloadForCache(payload);
  const gatewayProjection = gatewayAccountProjectionFromPayload(sanitizedPayload);
  if (gatewayProjection) cacheGatewayAccountProjection(gatewayProjection, loadedAt);
  try {
    const serialized = JSON.stringify({ payload: withoutGatewayAccountProjection(sanitizedPayload), loadedAt });
    if (new TextEncoder().encode(serialized).byteLength <= OPL_APP_STATE_PERSISTED_CACHE_MAX_BYTES) {
      localStorage.setItem(APP_STATE_FAST_CACHE_KEY, serialized);
    } else {
      localStorage.removeItem(APP_STATE_FAST_CACHE_KEY);
    }
  } catch {
    // The CLI-backed App state remains authoritative when localStorage is unavailable.
  }
  notifyOplAppStateCacheUpdated();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useOplAppState(
  initialProfile: OplAppStateProfile = 'fast',
  options: UseOplAppStateOptions = {}
): UseOplAppStateResult {
  const autoLoad = options.autoLoad !== false;
  const cached = useMemo(
    () => memoryAppStateCaches.get(initialProfile) ?? (initialProfile === 'fast' ? readCachedFastState() : null),
    [initialProfile]
  );
  const [payload, setPayload] = useState<OplAppStatePayload | null>(cached?.payload ?? null);
  const [loadedAt, setLoadedAt] = useState<string | null>(cached?.loadedAt ?? null);
  const [loading, setLoading] = useState(!cached || !hasGatewayAccountProjection(cached.payload));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    ensureStartupMaintenanceRefreshSubscription();
  }, []);

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
        const loadedPayload = await loadOplAppStateFromBridge(profile, { forceFresh: options.forceFresh });
        if (requestSeq.current !== requestId) return null;
        if (!loadedPayload) {
          throw new Error('Invalid OPL App state payload');
        }
        const nextPayload = mergeCachedGatewayAccount(loadedPayload);
        const nextLoadedAt = new Date().toLocaleTimeString();
        setPayload(nextPayload);
        setLoadedAt(nextLoadedAt);
        if (profile === 'fast') {
          cacheFastOplAppState(nextPayload, nextLoadedAt);
        } else {
          cacheInMemory(profile, nextPayload, nextLoadedAt);
          const gatewayProjection = gatewayAccountProjectionFromPayload(nextPayload);
          if (gatewayProjection) {
            cacheGatewayAccountProjection(gatewayProjection, nextLoadedAt);
            mergeGatewayIntoFastMemory(gatewayProjection, nextLoadedAt);
          }
          notifyOplAppStateCacheUpdated();
        }
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
    if (!autoLoad) return;
    if (hasHydratedMemoryAppStateCache(initialProfile)) return;
    const requestAlreadyRunning = inflightAppStateLoads.has(initialProfile);
    if (automaticAppStateLoadsStarted.has(initialProfile) && !requestAlreadyRunning) return;
    automaticAppStateLoadsStarted.add(initialProfile);
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const runAutomaticLoad = async (attempt: number): Promise<void> => {
      const loadedPayload = await load(initialProfile, { background: Boolean(cached) });
      if (loadedPayload && (initialProfile !== 'fast' || hasGatewayAccountProjection(loadedPayload))) return;
      automaticAppStateLoadsStarted.delete(initialProfile);
      if (!active) return;
      if (attempt >= AUTOMATIC_APP_STATE_MAX_ATTEMPTS) return;
      retryTimer = setTimeout(() => {
        if (!active || hasHydratedMemoryAppStateCache(initialProfile) || inflightAppStateLoads.has(initialProfile)) {
          return;
        }
        automaticAppStateLoadsStarted.add(initialProfile);
        void runAutomaticLoad(attempt + 1);
      }, AUTOMATIC_APP_STATE_RETRY_DELAY_MS);
    };
    void runAutomaticLoad(1);
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [autoLoad, cached, initialProfile, load]);

  useEffect(() => {
    if (initialProfile !== 'fast' || typeof window === 'undefined') return undefined;
    const handleCacheUpdate = () => {
      const liveCached = memoryAppStateCaches.get('fast');
      const nextCached = liveCached ?? readCachedFastState();
      if (!nextCached) return;
      setPayload(nextCached.payload);
      setLoadedAt(nextCached.loadedAt);
      setLoading(!hasGatewayAccountProjection(nextCached.payload));
    };
    window.addEventListener(APP_STATE_CACHE_UPDATED_EVENT, handleCacheUpdate);
    return () => window.removeEventListener(APP_STATE_CACHE_UPDATED_EVENT, handleCacheUpdate);
  }, [initialProfile]);

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
