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
const DERIVED_BOOTSTRAP_PROVENANCE = 'derived_bootstrap' as const;
export const OPL_APP_STATE_PERSISTED_CACHE_MAX_BYTES = 262_144;
const AUTOMATIC_APP_STATE_MAX_ATTEMPTS = 2;
const AUTOMATIC_APP_STATE_RETRY_DELAY_MS = 250;
const STARTUP_MAINTENANCE_REFRESH_MAX_ATTEMPTS = 3;
const STARTUP_MAINTENANCE_REFRESH_RETRY_DELAY_MS = 1_000;
const inflightAppStateLoads = new Map<OplAppStateProfile, Promise<OplAppStatePayload | null>>();
const freshAppStateLoads = new Map<OplAppStateProfile, Promise<OplAppStatePayload | null>>();
const appStateRequestGenerations = new Map<OplAppStateProfile, number>();
let appStateRequestGenerationByPromise = new WeakMap<Promise<OplAppStatePayload | null>, number>();
let startupMaintenanceRefreshInFlight: Promise<void> | null = null;
let startupMaintenanceRefreshUnsubscribe: (() => void) | null = null;

export type OplAppStateCache = {
  payload: OplAppStatePayload;
  loadedAt: string | null;
  provenance: Exclude<OplAppStateProvenance, 'none'>;
};

export type OplAppStateProvenance = 'none' | typeof DERIVED_BOOTSTRAP_PROVENANCE | 'live';

const memoryAppStateCaches = new Map<OplAppStateProfile, OplAppStateCache>();
const automaticAppStateLoadsStarted = new Set<OplAppStateProfile>();
const EMPTY_OPL_APP_STATE = Object.freeze({}) as OplAppStateRecord;

export function resetOplAppStateLoadsForTest(): void {
  startupMaintenanceRefreshUnsubscribe?.();
  startupMaintenanceRefreshUnsubscribe = null;
  startupMaintenanceRefreshInFlight = null;
  inflightAppStateLoads.clear();
  freshAppStateLoads.clear();
  appStateRequestGenerations.clear();
  appStateRequestGenerationByPromise = new WeakMap();
  memoryAppStateCaches.clear();
  automaticAppStateLoadsStarted.clear();
}

async function waitForStartupMaintenanceRefreshRetry(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, STARTUP_MAINTENANCE_REFRESH_RETRY_DELAY_MS);
  });
}

function refreshFastStateAfterStartupMaintenance(): void {
  if (startupMaintenanceRefreshInFlight) return;
  startupMaintenanceRefreshInFlight = (async () => {
    for (let attempt = 1; attempt <= STARTUP_MAINTENANCE_REFRESH_MAX_ATTEMPTS; attempt += 1) {
      try {
        const payload = await loadOplAppStateFromBridge('fast', { forceFresh: true });
        if (payload) {
          cacheFastOplAppState(payload, new Date().toLocaleTimeString());
          return;
        }
      } catch {
        // The Framework carrier can still be settling immediately after maintenance exits.
      }
      if (attempt < STARTUP_MAINTENANCE_REFRESH_MAX_ATTEMPTS) {
        await waitForStartupMaintenanceRefreshRetry();
      }
    }
  })().finally(() => {
    startupMaintenanceRefreshInFlight = null;
  });
}

function ensureStartupMaintenanceRefreshSubscription(): void {
  if (startupMaintenanceRefreshUnsubscribe || typeof window === 'undefined') return;
  const completionEmitter = ipcBridge.oplRuntime.startupMaintenanceCompleted;
  if (!completionEmitter?.on) return;
  startupMaintenanceRefreshUnsubscribe = completionEmitter.on(() => {
    refreshFastStateAfterStartupMaintenance();
  });
}

type OplGatewayAccountCache = {
  projection: OplAppStateRecord;
  loadedAt: string | null;
  provenance: typeof DERIVED_BOOTSTRAP_PROVENANCE;
};

export type UseOplAppStateResult = {
  appState: OplAppStateRecord;
  payload: OplAppStatePayload | null;
  loadedAt: string | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  provenance: OplAppStateProvenance;
  load: (profile?: OplAppStateProfile, options?: OplAppStateLoadOptions) => Promise<OplAppStatePayload | null>;
  applyGatewayAccountActionResult: (result: IOplRuntimeCommandResult | null | undefined) => OplAppStateRecord | null;
  refreshGatewayAccount: () => Promise<IOplRuntimeCommandResult | null>;
};

export type OplAppStateLoadOptions = {
  showRefreshing?: boolean;
  background?: boolean;
  forceFresh?: boolean;
};

export type UseOplAppStateOptions = {
  autoLoad?: boolean;
  requireLive?: boolean;
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
  const appState = payload?.app_state ?? payload;
  return isOplRecord(appState) ? appState : EMPTY_OPL_APP_STATE;
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

const OWNER_STORAGE_CACHE_FIELDS = [
  'status',
  'observed_at',
  'stale',
  'bytes',
  'reclaimable_bytes',
  'owner_route',
  'reason_code',
] as const;

const OWNER_STORAGE_ACTION_CACHE_FIELDS = ['kind', 'action_id', 'execution_owner'] as const;

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

function sanitizeGatewayAccountForCache(value: unknown, now = Date.now()): OplAppStateRecord | null {
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
  const freshness = pickCacheFields(gatewayAccount.freshness, GATEWAY_ACCOUNT_CACHE_NESTED_FIELDS.freshness) ?? {};
  const staleAfter = oplString(freshness.stale_after);
  const staleAfterMs = staleAfter ? Date.parse(staleAfter) : Number.NaN;
  freshness.stale = freshness.stale === true || !Number.isFinite(staleAfterMs) || now >= staleAfterMs;
  gatewayAccount.freshness = freshness;

  // Bootstrap cache is display-only. Executable authority must come from a live projection.
  gatewayAccount.capabilities = {
    account_login_supported: false,
    manual_key_supported: false,
  };
  gatewayAccount.actions = {
    complete_setup: null,
    refresh: null,
    repair: null,
    use_for_model_access: null,
    disconnect: null,
  };
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

function sanitizeOwnerStorageProjectionForCache(value: unknown): OplAppStateRecord | null {
  const projection = pickScalarCacheFields(value, OWNER_STORAGE_CACHE_FIELDS);
  if (!projection || !oplString(projection.status) || !oplString(projection.owner_route)) return null;
  const projectedAction = pickScalarCacheFields(oplRecord(value).projected_action, OWNER_STORAGE_ACTION_CACHE_FIELDS);
  if (!projectedAction || !oplString(projectedAction.kind) || !('action_id' in projectedAction)) return null;
  projection.projected_action = projectedAction;
  return projection;
}

function sanitizeStorageLifecycleForCache(value: unknown): OplAppStateRecord | null {
  const storageLifecycle = oplRecord(value);
  const agentPackageStore = sanitizeOwnerStorageProjectionForCache(storageLifecycle.agent_package_store);
  const webuiDataVolume = sanitizeOwnerStorageProjectionForCache(storageLifecycle.webui_data_volume);
  const entries = [
    ['agent_package_store', agentPackageStore],
    ['webui_data_volume', webuiDataVolume],
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

  const agentPackageStorage = sanitizeOwnerStorageProjectionForCache(
    oplRecord(appState.agent_packages).storage_inventory
  );
  if (agentPackageStorage) sanitized.agent_packages = { storage_inventory: agentPackageStorage };

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
  const storageLifecycle = sanitizeStorageLifecycleForCache(appSettingsReadModel.storage_lifecycle);
  const statusSummary = pickScalarCacheFields(settingsControlCenter.status_summary, STATUS_SUMMARY_CACHE_FIELDS);
  const issueQueue = oplRecordList(settingsControlCenter.issue_queue)
    .slice(0, 50)
    .map((issue) => pickScalarCacheFields(issue, ISSUE_QUEUE_CACHE_FIELDS) ?? {});
  const readModelCandidates = {
    opl_gateway_account: gatewayAccount,
    codex_model_policy: codexModelPolicy,
    workspace_services: workspaceServices,
    local_environment: localEnvironment,
    storage_lifecycle: storageLifecycle,
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

function gatewayAccountProjectionFromPayload(
  payload: OplAppStatePayload | null | undefined,
  now = Date.now()
): OplAppStateRecord | null {
  const settingsControlCenter = oplRecord(getAppState(payload).settings_control_center);
  const appSettingsReadModel = oplRecord(settingsControlCenter.app_settings_read_model);
  return sanitizeGatewayAccountForCache(appSettingsReadModel.opl_gateway_account, now);
}

function gatewayAccountProjectionFromActionResult(
  result: IOplRuntimeCommandResult | null | undefined
): OplAppStateRecord | null {
  if (result?.ok === false) return null;
  const execution = oplRecord(oplRecord(result?.parsed).app_action_execution);
  const projection = oplRecord(oplRecord(execution.result).gateway_account);
  return projection.surface_kind === 'opl_gateway_account_read_model.v1' ? projection : null;
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

function invokeOplAppStateBridge(profile: OplAppStateProfile): Promise<OplAppStatePayload | null> {
  return ipcBridge.oplRuntime.getAppState.invoke({ profile }).then(payloadFromBridgeResult);
}

function trackOplAppStateRequest(
  profile: OplAppStateProfile,
  request: Promise<OplAppStatePayload | null>,
  fresh: boolean,
  generation: number
): Promise<OplAppStatePayload | null> {
  inflightAppStateLoads.set(profile, request);
  if (fresh) freshAppStateLoads.set(profile, request);
  appStateRequestGenerationByPromise.set(request, generation);
  const release = (): void => {
    if (inflightAppStateLoads.get(profile) === request) inflightAppStateLoads.delete(profile);
    if (freshAppStateLoads.get(profile) === request) freshAppStateLoads.delete(profile);
  };
  void request.then(release, release);
  return request;
}

function advanceAppStateRequestGeneration(profile: OplAppStateProfile): number {
  const generation = (appStateRequestGenerations.get(profile) ?? 0) + 1;
  appStateRequestGenerations.set(profile, generation);
  return generation;
}

function invalidateOplAppStateLoads(profile: OplAppStateProfile): void {
  advanceAppStateRequestGeneration(profile);
  inflightAppStateLoads.delete(profile);
  freshAppStateLoads.delete(profile);
}

export function loadOplAppStateFromBridge(
  profile: OplAppStateProfile,
  options: Pick<OplAppStateLoadOptions, 'forceFresh'> = {}
): Promise<OplAppStatePayload | null> {
  const fresh = freshAppStateLoads.get(profile);
  if (fresh) return fresh;
  const inflight = inflightAppStateLoads.get(profile);
  if (inflight) {
    if (!options.forceFresh) return inflight;
    const generation = advanceAppStateRequestGeneration(profile);
    const queuedRequest = inflight.catch((): null => null).then(() => invokeOplAppStateBridge(profile));
    return trackOplAppStateRequest(profile, queuedRequest, true, generation);
  }

  const generation = advanceAppStateRequestGeneration(profile);
  return trackOplAppStateRequest(profile, invokeOplAppStateBridge(profile), options.forceFresh === true, generation);
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
      provenance: DERIVED_BOOTSTRAP_PROVENANCE,
    };
  } catch {
    return null;
  }
}

function cacheGatewayAccountProjection(projection: OplAppStateRecord, loadedAt: string | null): void {
  try {
    localStorage.setItem(
      GATEWAY_ACCOUNT_CACHE_KEY,
      JSON.stringify({ projection, loadedAt, provenance: DERIVED_BOOTSTRAP_PROVENANCE })
    );
  } catch {
    // The Framework-owned projection remains authoritative when renderer persistence is unavailable.
  }
}

function cacheInMemory(profile: OplAppStateProfile, payload: OplAppStatePayload, loadedAt: string | null): void {
  memoryAppStateCaches.set(profile, { payload, loadedAt, provenance: 'live' });
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
    return { payload, loadedAt: oplString(parsed.loadedAt), provenance: DERIVED_BOOTSTRAP_PROVENANCE };
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
    provenance: DERIVED_BOOTSTRAP_PROVENANCE,
  };
}

function hasGatewayAccountProjection(payload: OplAppStatePayload | null | undefined): boolean {
  return gatewayAccountProjectionFromPayload(payload) !== null;
}

function hasHydratedMemoryAppStateCache(profile: OplAppStateProfile): boolean {
  const cached = memoryAppStateCaches.get(profile);
  return Boolean(cached && (profile !== 'fast' || hasGatewayAccountProjection(cached.payload)));
}

export function cacheFastOplAppState(payload: OplAppStatePayload, loadedAt: string): void {
  cacheInMemory('fast', payload, loadedAt);
  const sanitizedPayload = sanitizeOplAppStatePayloadForCache(payload);
  const gatewayProjection = gatewayAccountProjectionFromPayload(sanitizedPayload);
  if (gatewayProjection) cacheGatewayAccountProjection(gatewayProjection, loadedAt);
  try {
    const serialized = JSON.stringify({
      payload: withoutGatewayAccountProjection(sanitizedPayload),
      loadedAt,
      provenance: DERIVED_BOOTSTRAP_PROVENANCE,
    });
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
  const requireLive = options.requireLive === true;
  const cached = useMemo(() => {
    const memoryCache = memoryAppStateCaches.get(initialProfile);
    if (memoryCache) {
      return requireLive ? { ...memoryCache, provenance: DERIVED_BOOTSTRAP_PROVENANCE } : memoryCache;
    }
    return initialProfile === 'fast' ? readCachedFastState() : null;
  }, [initialProfile, requireLive]);
  const [payload, setPayload] = useState<OplAppStatePayload | null>(cached?.payload ?? null);
  const [loadedAt, setLoadedAt] = useState<string | null>(cached?.loadedAt ?? null);
  const [provenance, setProvenance] = useState<OplAppStateProvenance>(cached?.provenance ?? 'none');
  const [loading, setLoading] = useState(!cached || !hasGatewayAccountProjection(cached.payload));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const payloadRef = useRef(payload);
  const requestSeq = useRef(0);
  const latestRequestId = useRef(0);
  const requestIds = useRef(new WeakMap<Promise<OplAppStatePayload | null>, number>());

  useEffect(() => {
    ensureStartupMaintenanceRefreshSubscription();
  }, []);

  payloadRef.current = payload;

  const applyGatewayAccountActionResult = useCallback(
    (result: IOplRuntimeCommandResult | null | undefined): OplAppStateRecord | null => {
      const projection = gatewayAccountProjectionFromActionResult(result);
      if (!projection) return null;

      invalidateOplAppStateLoads('fast');
      const nextLoadedAt = new Date().toLocaleTimeString();
      const basePayload =
        payloadRef.current ??
        memoryAppStateCaches.get('fast')?.payload ??
        readCachedFastState()?.payload ??
        ({ app_state: {} } as OplAppStatePayload);
      const nextPayload = withGatewayAccountProjection(basePayload, projection);
      cacheFastOplAppState(nextPayload, nextLoadedAt);
      payloadRef.current = nextPayload;
      setPayload(nextPayload);
      setLoadedAt(nextLoadedAt);
      setProvenance('live');
      setLoading(false);
      setError(null);
      return projection;
    },
    []
  );

  const refreshGatewayAccount = useCallback(async (): Promise<IOplRuntimeCommandResult | null> => {
    invalidateOplAppStateLoads('fast');
    setRefreshing(true);
    setError(null);
    try {
      const result = await ipcBridge.oplRuntime.executeAction.invoke({
        actionId: 'gateway_account_refresh',
        dryRun: false,
      });
      if (result?.ok === false) {
        setError(result.error?.message || result.error?.stderr || 'OPL Gateway account refresh failed');
        return result;
      }
      if (!applyGatewayAccountActionResult(result)) {
        setError('OPL Gateway account refresh returned no projection');
      }
      return result;
    } catch (caughtError) {
      setError(errorMessage(caughtError));
      return null;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyGatewayAccountActionResult]);

  const load = useCallback(
    async (
      profile: OplAppStateProfile = initialProfile,
      loadOptions: OplAppStateLoadOptions = {}
    ): Promise<OplAppStatePayload | null> => {
      const request = loadOplAppStateFromBridge(profile, { forceFresh: loadOptions.forceFresh });
      const requestGeneration = appStateRequestGenerationByPromise.get(request);
      let requestId = requestIds.current.get(request);
      if (requestId === undefined) {
        requestSeq.current += 1;
        requestId = requestSeq.current;
        requestIds.current.set(request, requestId);
      }
      latestRequestId.current = Math.max(latestRequestId.current, requestId);
      if (latestRequestId.current === requestId) {
        if (loadOptions.showRefreshing) {
          setRefreshing(true);
        } else if (!loadOptions.background) {
          setLoading(true);
        }
        setError(null);
      }
      try {
        const loadedPayload = await request;
        if (
          latestRequestId.current !== requestId ||
          requestGeneration === undefined ||
          appStateRequestGenerations.get(profile) !== requestGeneration
        ) {
          return null;
        }
        if (!loadedPayload) {
          throw new Error('Invalid OPL App state payload');
        }
        const nextLoadedAt = new Date().toLocaleTimeString();
        if (profile === 'fast') {
          cacheFastOplAppState(loadedPayload, nextLoadedAt);
        } else {
          cacheInMemory(profile, loadedPayload, nextLoadedAt);
          const gatewayProjection = gatewayAccountProjectionFromPayload(loadedPayload);
          if (gatewayProjection) {
            cacheGatewayAccountProjection(gatewayProjection, nextLoadedAt);
          }
        }
        setPayload(loadedPayload);
        setLoadedAt(nextLoadedAt);
        setProvenance('live');
        return loadedPayload;
      } catch (caughtError) {
        if (
          latestRequestId.current === requestId &&
          requestGeneration !== undefined &&
          appStateRequestGenerations.get(profile) === requestGeneration
        ) {
          setError(errorMessage(caughtError));
        }
        return null;
      } finally {
        if (latestRequestId.current === requestId) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [initialProfile]
  );

  useEffect(() => {
    if (!autoLoad) return;
    if (requireLive) {
      void load(initialProfile, { background: Boolean(cached), forceFresh: true });
      return;
    }
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
  }, [autoLoad, cached, initialProfile, load, requireLive]);

  useEffect(() => {
    if (provenance !== DERIVED_BOOTSTRAP_PROVENANCE || !payload) return undefined;
    const gatewayAccount = gatewayAccountProjectionFromPayload(payload);
    const freshness = oplRecord(gatewayAccount?.freshness);
    if (!gatewayAccount || freshness.stale === true) return undefined;
    const staleAfter = oplString(freshness.stale_after);
    const staleAfterMs = staleAfter ? Date.parse(staleAfter) : Number.NaN;
    if (!Number.isFinite(staleAfterMs)) return undefined;
    const delayMs = Math.max(0, staleAfterMs - Date.now());
    const timer = window.setTimeout(() => {
      setPayload((currentPayload) => {
        if (!currentPayload) return currentPayload;
        const expiredProjection = gatewayAccountProjectionFromPayload(currentPayload, Date.now());
        return expiredProjection ? withGatewayAccountProjection(currentPayload, expiredProjection) : currentPayload;
      });
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [payload, provenance]);

  useEffect(() => {
    if (initialProfile !== 'fast' || typeof window === 'undefined') return undefined;
    const handleCacheUpdate = () => {
      const liveCached = memoryAppStateCaches.get('fast');
      const nextCached = liveCached ?? readCachedFastState();
      if (!nextCached) return;
      setPayload(nextCached.payload);
      setLoadedAt(nextCached.loadedAt);
      setProvenance((currentProvenance) =>
        currentProvenance === 'live' ? 'live' : requireLive ? DERIVED_BOOTSTRAP_PROVENANCE : nextCached.provenance
      );
      setLoading(!hasGatewayAccountProjection(nextCached.payload));
    };
    window.addEventListener(APP_STATE_CACHE_UPDATED_EVENT, handleCacheUpdate);
    return () => window.removeEventListener(APP_STATE_CACHE_UPDATED_EVENT, handleCacheUpdate);
  }, [initialProfile, requireLive]);

  return {
    appState: getAppState(payload),
    payload,
    loadedAt,
    loading,
    refreshing,
    error,
    provenance,
    load,
    applyGatewayAccountActionResult,
    refreshGatewayAccount,
  };
}
