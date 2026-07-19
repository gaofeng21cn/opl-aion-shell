import { describe, expect, it, vi } from 'vitest';

import {
  executeWebuiDataLifecycle,
  planWebuiDataLifecycle,
  readWebuiDataLifecycleCapability,
  restoreWebuiDataLifecycle,
  type WebuiDataLifecycleClientError,
} from '@/renderer/pages/settings/StorageSettings/webuiDataLifecycleClient';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const capability = {
  schema: 'opl_webui_data_volume_lifecycle_capability.v1',
  capability_id: 'carrier_host.storage.webui_data_volume.lifecycle',
  endpoint_status: 'available',
  endpoint_availability: 'host_owner_injected',
  plan_action_id: 'settings_plan_webui_data_volume_cleanup',
  execute_action_id: 'settings_execute_webui_data_volume_cleanup',
  restore_action_id: 'settings_restore_webui_data_volume_cleanup',
  raw_path_transport_allowed: false,
};

const plan = {
  schema: 'opl_webui_data_volume_cleanup_plan.v1',
  action_id: 'settings_plan_webui_data_volume_cleanup',
  plan_id: 'plan-1',
  plan_hash: 'hash-1',
  exact_confirmation: 'confirmation-1',
  estimated_reclaimable_bytes: 42,
  candidate_count: 2,
  restore_supported: true,
  observed_at: '2026-07-19T01:00:00.000Z',
  expires_at: '2026-07-19T01:05:00.000Z',
};

const readback = {
  status: 'ready',
  terminal: true,
  observed_at: '2026-07-19T01:01:00.000Z',
  bytes: 0,
  reclaimable_bytes: 0,
  receipt_ref: 'receipt:opaque',
  restore_status: 'available',
};

describe('webuiDataLifecycleClient', () => {
  it('accepts only the complete exact capability and uses credentialed same-origin POST', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(capability));
    await expect(readWebuiDataLifecycleCapability(fetchImpl)).resolves.toMatchObject(capability);
    expect(fetchImpl).toHaveBeenCalledWith('/api/opl-storage/webui-data-volume/capability', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

    fetchImpl.mockResolvedValueOnce(response({ ...capability, restore_action_id: null }));
    await expect(readWebuiDataLifecycleCapability(fetchImpl)).resolves.toBeNull();
  });

  it('preserves the opaque plan confirmation and validates terminal execute/restore readback', async () => {
    const executeReceipt = {
      schema: 'opl_webui_data_volume_cleanup_receipt.v1',
      receipt_id: 'receipt-1',
      action_id: 'settings_execute_webui_data_volume_cleanup',
      status: 'completed',
      plan_id: plan.plan_id,
      plan_hash: plan.plan_hash,
      receipt_ref: readback.receipt_ref,
      restore_action_ref: 'settings_restore_webui_data_volume_cleanup',
      archive_ref: 'archive:opaque',
      archive_manifest_ref: 'manifest:opaque',
      archive_sha256: 'sha256',
      archived_bytes: 42,
      deleted_bytes: 42,
      readback,
    };
    const restoreReceipt = {
      schema: 'opl_webui_data_volume_restore_receipt.v1',
      action_id: 'settings_restore_webui_data_volume_cleanup',
      status: 'completed',
      receipt_ref: readback.receipt_ref,
      restore_receipt_ref: 'restore:opaque',
      restored_bytes: 42,
      readback: { ...readback, bytes: 42, reclaimable_bytes: 42, restore_status: 'restored' },
    };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(plan))
      .mockResolvedValueOnce(response(executeReceipt))
      .mockResolvedValueOnce(response(restoreReceipt));

    const parsedPlan = await planWebuiDataLifecycle(fetchImpl);
    await expect(executeWebuiDataLifecycle(parsedPlan, fetchImpl)).resolves.toMatchObject(executeReceipt);
    await expect(restoreWebuiDataLifecycle(readback.receipt_ref, fetchImpl)).resolves.toMatchObject(restoreReceipt);
    expect(JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body))).toEqual({
      plan_id: plan.plan_id,
      plan_hash: plan.plan_hash,
      exact_confirmation: plan.exact_confirmation,
    });
    expect(JSON.parse(String(fetchImpl.mock.calls[2]?.[1]?.body))).toEqual({ receipt_ref: readback.receipt_ref });
  });

  it('surfaces only typed host failures and rejects malformed success payloads', async () => {
    const failed = vi.fn<typeof fetch>().mockResolvedValue(
      response(
        {
          success: false,
          error: { code: 'EXECUTION_RECOVERY_REQUIRED', message: '/private/path', receipt_ref: 'receipt:opaque' },
        },
        409
      )
    );
    await expect(planWebuiDataLifecycle(failed)).rejects.toEqual(
      expect.objectContaining<WebuiDataLifecycleClientError>({
        code: 'EXECUTION_RECOVERY_REQUIRED',
        receiptRef: 'receipt:opaque',
        message: 'EXECUTION_RECOVERY_REQUIRED',
      })
    );

    const malformed = vi.fn<typeof fetch>().mockResolvedValue(response({ ...plan, exact_confirmation: null }));
    await expect(planWebuiDataLifecycle(malformed)).rejects.toThrow('INVALID_HOST_RESPONSE');
  });
});
