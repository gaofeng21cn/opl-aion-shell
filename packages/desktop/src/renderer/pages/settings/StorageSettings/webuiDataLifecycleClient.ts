const CAPABILITY_ID = 'carrier_host.storage.webui_data_volume.lifecycle' as const;
const PLAN_ACTION_ID = 'settings_plan_webui_data_volume_cleanup' as const;
const EXECUTE_ACTION_ID = 'settings_execute_webui_data_volume_cleanup' as const;
const RESTORE_ACTION_ID = 'settings_restore_webui_data_volume_cleanup' as const;

const ENDPOINTS = {
  capability: '/api/opl-storage/webui-data-volume/capability',
  plan: '/api/opl-storage/webui-data-volume/plan',
  execute: '/api/opl-storage/webui-data-volume/execute',
  restore: '/api/opl-storage/webui-data-volume/restore',
} as const;

type JsonRecord = Record<string, unknown>;

export class WebuiDataLifecycleClientError extends Error {
  constructor(
    readonly code: string,
    readonly receiptRef: string | null
  ) {
    super(code);
  }
}

export type WebuiDataLifecycleCapability = {
  capability_id: typeof CAPABILITY_ID;
  endpoint_status: 'available';
  endpoint_availability: 'host_owner_injected';
  plan_action_id: typeof PLAN_ACTION_ID;
  execute_action_id: typeof EXECUTE_ACTION_ID;
  restore_action_id: typeof RESTORE_ACTION_ID;
};

export type WebuiDataLifecyclePlan = {
  plan_id: string;
  plan_hash: string;
  exact_confirmation: string;
  estimated_reclaimable_bytes: number;
  candidate_count: number;
  restore_supported: true;
  observed_at: string;
  expires_at: string;
};

export type WebuiDataLifecycleReadback = {
  status: 'ready';
  terminal: true;
  observed_at: string;
  bytes: number | null;
  reclaimable_bytes: number | null;
  receipt_ref: string;
  restore_status: 'available' | 'restored';
};

export type WebuiDataLifecycleReceipt = {
  receipt_id: string;
  action_id: typeof EXECUTE_ACTION_ID;
  status: 'completed';
  plan_id: string;
  plan_hash: string;
  receipt_ref: string;
  restore_action_ref: typeof RESTORE_ACTION_ID;
  archive_ref: string;
  archive_manifest_ref: string;
  archive_sha256: string;
  archived_bytes: number;
  deleted_bytes: number;
  readback: WebuiDataLifecycleReadback;
};

export type WebuiDataLifecycleRestoreReceipt = {
  action_id: typeof RESTORE_ACTION_ID;
  status: 'completed';
  receipt_ref: string;
  restore_receipt_ref: string;
  restored_bytes: number;
  readback: WebuiDataLifecycleReadback;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isOpaqueString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 4096;
}

function isStorageBytes(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function isReadback(value: unknown): value is WebuiDataLifecycleReadback {
  return (
    isRecord(value) &&
    value.status === 'ready' &&
    value.terminal === true &&
    isOpaqueString(value.observed_at) &&
    isStorageBytes(value.bytes) &&
    isStorageBytes(value.reclaimable_bytes) &&
    isOpaqueString(value.receipt_ref) &&
    (value.restore_status === 'available' || value.restore_status === 'restored')
  );
}

function lifecycleError(value: unknown): WebuiDataLifecycleClientError {
  if (!isRecord(value) || !isRecord(value.error) || !isOpaqueString(value.error.code)) {
    return new WebuiDataLifecycleClientError('HOST_ACTION_FAILED', null);
  }
  return new WebuiDataLifecycleClientError(
    value.error.code,
    isOpaqueString(value.error.receipt_ref) ? value.error.receipt_ref : null
  );
}

async function postJson(path: string, body: JsonRecord, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch((): null => null);
  if (!response.ok) throw lifecycleError(payload);
  return payload;
}

export async function readWebuiDataLifecycleCapability(
  fetchImpl: typeof fetch = fetch
): Promise<WebuiDataLifecycleCapability | null> {
  const value = await postJson(ENDPOINTS.capability, {}, fetchImpl);
  if (
    !isRecord(value) ||
    value.capability_id !== CAPABILITY_ID ||
    value.endpoint_status !== 'available' ||
    value.endpoint_availability !== 'host_owner_injected' ||
    value.plan_action_id !== PLAN_ACTION_ID ||
    value.execute_action_id !== EXECUTE_ACTION_ID ||
    value.restore_action_id !== RESTORE_ACTION_ID ||
    value.raw_path_transport_allowed !== false
  ) {
    return null;
  }
  return value as WebuiDataLifecycleCapability;
}

export async function planWebuiDataLifecycle(fetchImpl: typeof fetch = fetch): Promise<WebuiDataLifecyclePlan> {
  const value = await postJson(ENDPOINTS.plan, {}, fetchImpl);
  if (
    !isRecord(value) ||
    value.action_id !== PLAN_ACTION_ID ||
    !isOpaqueString(value.plan_id) ||
    !isOpaqueString(value.plan_hash) ||
    !isOpaqueString(value.exact_confirmation) ||
    !isStorageBytes(value.estimated_reclaimable_bytes) ||
    value.estimated_reclaimable_bytes === null ||
    typeof value.candidate_count !== 'number' ||
    !Number.isInteger(value.candidate_count) ||
    value.candidate_count < 0 ||
    value.restore_supported !== true ||
    !isOpaqueString(value.observed_at) ||
    !isOpaqueString(value.expires_at)
  ) {
    throw new Error('INVALID_HOST_RESPONSE');
  }
  return value as unknown as WebuiDataLifecyclePlan;
}

export async function executeWebuiDataLifecycle(
  plan: WebuiDataLifecyclePlan,
  fetchImpl: typeof fetch = fetch
): Promise<WebuiDataLifecycleReceipt> {
  const value = await postJson(
    ENDPOINTS.execute,
    {
      plan_id: plan.plan_id,
      plan_hash: plan.plan_hash,
      exact_confirmation: plan.exact_confirmation,
    },
    fetchImpl
  );
  if (
    !isRecord(value) ||
    value.action_id !== EXECUTE_ACTION_ID ||
    value.status !== 'completed' ||
    value.plan_id !== plan.plan_id ||
    value.plan_hash !== plan.plan_hash ||
    !isOpaqueString(value.receipt_id) ||
    !isOpaqueString(value.receipt_ref) ||
    value.restore_action_ref !== RESTORE_ACTION_ID ||
    !isOpaqueString(value.archive_ref) ||
    !isOpaqueString(value.archive_manifest_ref) ||
    !isOpaqueString(value.archive_sha256) ||
    !isStorageBytes(value.archived_bytes) ||
    value.archived_bytes === null ||
    !isStorageBytes(value.deleted_bytes) ||
    value.deleted_bytes === null ||
    !isReadback(value.readback)
  ) {
    throw new Error('INVALID_HOST_RESPONSE');
  }
  return value as unknown as WebuiDataLifecycleReceipt;
}

export async function restoreWebuiDataLifecycle(
  receiptRef: string,
  fetchImpl: typeof fetch = fetch
): Promise<WebuiDataLifecycleRestoreReceipt> {
  const value = await postJson(ENDPOINTS.restore, { receipt_ref: receiptRef }, fetchImpl);
  if (
    !isRecord(value) ||
    value.action_id !== RESTORE_ACTION_ID ||
    value.status !== 'completed' ||
    value.receipt_ref !== receiptRef ||
    !isOpaqueString(value.restore_receipt_ref) ||
    !isStorageBytes(value.restored_bytes) ||
    value.restored_bytes === null ||
    !isReadback(value.readback)
  ) {
    throw new Error('INVALID_HOST_RESPONSE');
  }
  return value as unknown as WebuiDataLifecycleRestoreReceipt;
}

export const __webuiDataLifecycleClientTest = {
  CAPABILITY_ID,
  ENDPOINTS,
  EXECUTE_ACTION_ID,
  PLAN_ACTION_ID,
  RESTORE_ACTION_ID,
};
