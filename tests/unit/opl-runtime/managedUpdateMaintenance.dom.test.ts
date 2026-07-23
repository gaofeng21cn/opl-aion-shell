/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import {
  executeManagedUpdateMutation,
  executeManagedUpdateRead,
  getManagedUpdateMaintenanceSnapshot,
  resetManagedUpdateMaintenanceForTest,
  startManagedUpdateMaintenanceScheduler,
} from '@/renderer/services/managedUpdateMaintenance';

const bridgeMocks = vi.hoisted(() => ({
  getUpdateStatusInvoke: vi.fn(),
  runUpdateCheckInvoke: vi.fn(),
  getUpdatePlanInvoke: vi.fn(),
  applyUpdatePlanInvoke: vi.fn(),
  applyUpdateComponentInvoke: vi.fn(),
  repairUpdateInvoke: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      getUpdateStatus: { invoke: bridgeMocks.getUpdateStatusInvoke },
      runUpdateCheck: { invoke: bridgeMocks.runUpdateCheckInvoke },
      getUpdatePlan: { invoke: bridgeMocks.getUpdatePlanInvoke },
      applyUpdatePlan: { invoke: bridgeMocks.applyUpdatePlanInvoke },
      applyUpdateComponent: { invoke: bridgeMocks.applyUpdateComponentInvoke },
      repairUpdate: { invoke: bridgeMocks.repairUpdateInvoke },
    },
  },
}));

const managedUpdateCheckResult = {
  surface: 'update_check',
  command: 'opl update check --json',
  stdout: '{}',
  parsed: {
    managed_update: {
      operation: 'check',
      idempotency_lock: { status: 'released' },
      execution: { status: 'completed' },
    },
  },
};

const managedUpdatePlanResult = {
  surface: 'update_plan',
  command: 'opl update plan --json',
  stdout: '{}',
  parsed: {
    managed_update: {
      operation: 'plan',
      idempotency_lock: { status: 'released' },
      execution: { status: 'completed' },
      reload_guidance: 'Reload visible OPL capabilities after background maintenance.',
      components: [
        {
          component_id: 'opl_app',
          state: 'host_executor_required',
          safe_to_apply: true,
          host_executor_required: true,
          host_update_route: 'carrier_updater',
          manual_guidance: 'Update the App from its host carrier.',
          auto_apply: {
            eligible: false,
            app_background_safe: false,
            command_ref: null,
            blocked_reasons: ['carrier_update_route_required'],
          },
        },
        {
          component_id: 'opl_base',
          state: 'update_available',
          safe_to_apply: true,
          needs_restart: true,
          integration_status: 'needs_reload',
          auto_apply: {
            eligible: true,
            app_background_safe: true,
            command_ref: 'opl update apply --json',
            blocked_reasons: [],
          },
        },
        {
          component_id: 'opl_packages',
          package_id: 'oma',
          state: 'update_available',
          safe_to_apply: true,
          projection_status: 'needs_reload',
          profile_migration_status: 'manual_required',
          auto_apply: {
            eligible: true,
            app_background_safe: true,
            command_ref: 'opl update apply --json',
            blocked_reasons: [],
          },
        },
      ],
    },
  },
};

const managedUpdateStatusResult = {
  surface: 'update_status',
  command: 'opl update status --json',
  stdout: '{}',
  parsed: {
    managed_update: {
      operation: 'status',
      idempotency_lock: { status: 'released' },
      execution: { status: 'completed' },
      components: [
        {
          component_id: 'opl_base',
          state: 'current',
          current: {
            dependency_catalog: {
              lifecycle_owner: 'opl_base',
              flow_dependencies: [
                {
                  dependency_id: 'officecli',
                  dependency_kind: 'codex_skill',
                  installed: true,
                },
              ],
              dependencies: [],
            },
          },
        },
        { component_id: 'opl_packages', state: 'current' },
      ],
    },
  },
};

describe('managed update background maintenance scheduler', () => {
  beforeEach(() => {
    resetManagedUpdateMaintenanceForTest();
    localStorage.clear();
    vi.clearAllMocks();
    bridgeMocks.getUpdateStatusInvoke.mockResolvedValue(managedUpdateStatusResult);
    bridgeMocks.runUpdateCheckInvoke.mockResolvedValue(managedUpdateCheckResult);
    bridgeMocks.getUpdatePlanInvoke.mockResolvedValue(managedUpdatePlanResult);
    bridgeMocks.applyUpdatePlanInvoke.mockResolvedValue({
      surface: 'update_apply',
      command: 'opl update apply --json',
      stdout: '{}',
      parsed: {
        managed_update: {
          operation: 'apply',
          idempotency_lock: { status: 'released' },
          execution: { status: 'completed' },
          reload_guidance: 'Restart OPL App to activate the staged runtime update.',
          components: [
            { component_id: 'opl_base', state: 'staged', needs_restart: true },
            { component_id: 'opl_packages', state: 'current', receipt_ref: 'receipt-packages-1' },
          ],
        },
      },
    });
    bridgeMocks.applyUpdateComponentInvoke.mockResolvedValue({
      surface: 'update_apply',
      command: 'opl update apply --json',
      stdout: '{}',
      parsed: {
        managed_update: {
          operation: 'apply',
          idempotency_lock: { status: 'released' },
          execution: { status: 'completed' },
          components: [{ component_id: 'opl_base', state: 'needs_reload', needs_reload: true }],
        },
      },
    });
  });

  it('restores only scheduler hints from localStorage and starts lifecycle state as idle', async () => {
    localStorage.setItem(
      'opl.managedUpdateMaintenance.v1',
      JSON.stringify({
        lastRunAt: '2026-07-22T01:00:00.000Z',
        nextRunAt: '2026-07-23T01:00:00.000Z',
        lastReconciledCarrierCheckpoint: '26.5.27:2.1.5',
        lastTrigger: 'component_action',
        executionStatus: 'completed',
        lastFailure: 'stale failure',
        lastAction: {
          kind: 'apply',
          componentId: 'opl_base',
          status: 'completed',
          at: '2026-07-22T01:00:00.000Z',
          receiptRef: 'receipt://stale',
        },
        lastSkipReason: 'stale skip',
        reloadGuidance: 'stale reload guidance',
        restartRequired: true,
        lockStatus: 'released',
      })
    );
    vi.resetModules();

    const reloaded = await import('@/renderer/services/managedUpdateMaintenance');
    expect(reloaded.getManagedUpdateMaintenanceSnapshot()).toMatchObject({
      executionStatus: 'idle',
      lastRunAt: '2026-07-22T01:00:00.000Z',
      nextRunAt: '2026-07-23T01:00:00.000Z',
      lastReconciledCarrierCheckpoint: '26.5.27:2.1.5',
      lastTrigger: null,
      lastFailure: null,
      lastAction: null,
      lastSkipReason: null,
      reloadGuidance: null,
      restartRequired: false,
      lockStatus: null,
      result: null,
    });
    reloaded.resetManagedUpdateMaintenanceForTest();
  });

  it('publishes status before startup check, plan, and one Framework-owned apply', async () => {
    const stop = startManagedUpdateMaintenanceScheduler();

    await waitFor(() => expect(bridgeMocks.runUpdateCheckInvoke).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(bridgeMocks.getUpdatePlanInvoke).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(bridgeMocks.applyUpdatePlanInvoke).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(bridgeMocks.getUpdateStatusInvoke).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getManagedUpdateMaintenanceSnapshot().lastRunAt).not.toBeNull());

    const snapshot = getManagedUpdateMaintenanceSnapshot();
    expect(snapshot.executionStatus).toBe('completed');
    expect(snapshot.lastTrigger).toBe('app_carrier_changed');
    expect(snapshot.lastFailure).toBeNull();
    expect(snapshot.lockStatus).toBe('released');
    expect(snapshot.result?.surface).toBe('update_status');
    expect(snapshot.result?.parsed).toEqual(
      expect.objectContaining({
        managed_update: expect.objectContaining({
          components: expect.arrayContaining([
            expect.objectContaining({
              component_id: 'opl_base',
              current: expect.objectContaining({
                dependency_catalog: expect.objectContaining({
                  flow_dependencies: expect.arrayContaining([expect.objectContaining({ dependency_id: 'officecli' })]),
                }),
              }),
            }),
          ]),
        }),
      })
    );
    expect(snapshot.lastAction?.componentIds).toEqual(['opl_base', 'opl_packages']);
    expect(snapshot.lastSkipReason).toContain('opl_app: host_executor_required');
    expect(snapshot.restartRequired).toBe(true);
    expect(snapshot.lastReconciledCarrierCheckpoint).toBe('26.5.27:2.1.5');
    expect(bridgeMocks.getUpdateStatusInvoke.mock.invocationCallOrder[0]).toBeLessThan(
      bridgeMocks.runUpdateCheckInvoke.mock.invocationCallOrder[0]
    );
    expect(bridgeMocks.runUpdateCheckInvoke.mock.invocationCallOrder[0]).toBeLessThan(
      bridgeMocks.getUpdatePlanInvoke.mock.invocationCallOrder[0]
    );
    expect(bridgeMocks.getUpdatePlanInvoke.mock.invocationCallOrder[0]).toBeLessThan(
      bridgeMocks.applyUpdatePlanInvoke.mock.invocationCallOrder[0]
    );
    expect(bridgeMocks.applyUpdatePlanInvoke.mock.invocationCallOrder[0]).toBeLessThan(
      bridgeMocks.getUpdateStatusInvoke.mock.invocationCallOrder[1]
    );

    stop();
  });

  it('makes the typed status projection available while the network check is still running', async () => {
    let resolveCheck: ((value: typeof managedUpdateCheckResult) => void) | undefined;
    bridgeMocks.runUpdateCheckInvoke.mockReturnValueOnce(
      new Promise<typeof managedUpdateCheckResult>((resolve) => {
        resolveCheck = resolve;
      })
    );

    const stop = startManagedUpdateMaintenanceScheduler();

    await waitFor(() => expect(getManagedUpdateMaintenanceSnapshot().result?.surface).toBe('update_status'));
    expect(bridgeMocks.runUpdateCheckInvoke).toHaveBeenCalledOnce();
    expect(bridgeMocks.getUpdatePlanInvoke).not.toHaveBeenCalled();

    resolveCheck?.(managedUpdateCheckResult);
    await waitFor(() => expect(getManagedUpdateMaintenanceSnapshot().running).toBe(false));
    stop();
  });

  it('continues Framework reconciliation when the projection prefetch rejects', async () => {
    bridgeMocks.getUpdateStatusInvoke.mockRejectedValueOnce(new Error('Status prefetch unavailable'));

    const stop = startManagedUpdateMaintenanceScheduler();

    await waitFor(() => expect(bridgeMocks.runUpdateCheckInvoke).toHaveBeenCalledOnce());
    await waitFor(() => expect(getManagedUpdateMaintenanceSnapshot().running).toBe(false));
    expect(getManagedUpdateMaintenanceSnapshot().lastFailure).toBeNull();
    stop();
  });

  it('projects Framework attention and restart state without inventing a Packages refresh-only rule', async () => {
    await executeManagedUpdateRead('plan', {
      background: true,
      trigger: 'daily_background_maintenance',
    });

    expect(bridgeMocks.applyUpdateComponentInvoke).not.toHaveBeenCalled();
    const snapshot = getManagedUpdateMaintenanceSnapshot();
    expect(snapshot.lastAction).toBeNull();
    expect(snapshot.lastSkipReason).toContain('opl_app: host_executor_required');
    expect(snapshot.lastSkipReason).not.toContain('opl_packages: refresh_only');
    expect(snapshot.lastSkipReason).not.toContain('profile_migration_status');
    expect(snapshot.reloadGuidance).toBe('Reload visible OPL capabilities after background maintenance.');
    expect(snapshot.restartRequired).toBe(true);
  });

  it('clears historical action and failure receipts after a successful authoritative read', async () => {
    bridgeMocks.repairUpdateInvoke.mockResolvedValueOnce({
      ok: false,
      surface: 'update_repair',
      command: 'opl update repair --json',
      stdout: '',
      parsed: null,
      error: { message: 'Historical repair failure' },
    });

    await executeManagedUpdateMutation('repair', { componentId: 'opl_base' });
    expect(getManagedUpdateMaintenanceSnapshot()).toMatchObject({
      lastFailure: 'Historical repair failure',
      lastAction: expect.objectContaining({ status: 'failed' }),
    });

    await executeManagedUpdateRead('status', { trigger: 'manual_refresh_status' });

    expect(getManagedUpdateMaintenanceSnapshot()).toMatchObject({
      lastFailure: null,
      lastAction: null,
      result: managedUpdateStatusResult,
    });
  });

  it('routes only Base mutations and rejects Packages, App, and legacy ids', async () => {
    await executeManagedUpdateMutation('apply', { componentId: 'opl_base' });

    expect(bridgeMocks.applyUpdateComponentInvoke).toHaveBeenCalledWith({ componentId: 'opl_base' });
    expect(bridgeMocks.getUpdateStatusInvoke).toHaveBeenCalledOnce();
    expect(getManagedUpdateMaintenanceSnapshot()).toMatchObject({
      executionStatus: 'completed',
      lastAction: expect.objectContaining({ componentId: 'opl_base', status: 'completed' }),
      result: managedUpdateStatusResult,
    });

    const persisted = JSON.parse(localStorage.getItem('opl.managedUpdateMaintenance.v1') ?? '{}') as Record<
      string,
      unknown
    >;
    for (const lifecycleOutcome of [
      'executionStatus',
      'lastAction',
      'lastFailure',
      'lastSkipReason',
      'reloadGuidance',
      'restartRequired',
      'lockStatus',
      'result',
    ]) {
      expect(persisted).not.toHaveProperty(lifecycleOutcome);
    }

    const packageResult = await executeManagedUpdateMutation('repair', { componentId: 'opl_packages' });
    const appResult = await executeManagedUpdateMutation('apply', { componentId: 'opl_app' });
    const legacy = await executeManagedUpdateMutation('repair', { componentId: 'capability_packages' });

    expect(packageResult?.ok).toBe(false);
    expect(packageResult?.error?.message).toMatch(/Framework projected action.*opl app action execute/);
    expect(appResult?.ok).toBe(false);
    expect(appResult?.error?.message).toContain('host or carrier updater');
    expect(legacy?.ok).toBe(false);
    expect(bridgeMocks.repairUpdateInvoke).not.toHaveBeenCalled();
    expect(bridgeMocks.applyUpdateComponentInvoke).toHaveBeenCalledTimes(1);
  });

  it('does not report a manual mutation as completed when terminal status readback fails', async () => {
    bridgeMocks.getUpdateStatusInvoke.mockResolvedValueOnce({
      ok: false,
      surface: 'update_status',
      command: 'opl update status --json',
      stdout: '',
      parsed: null,
      error: { message: 'Framework status readback unavailable' },
    });

    const result = await executeManagedUpdateMutation('apply', { componentId: 'opl_base' });

    expect(result?.ok).toBe(false);
    expect(getManagedUpdateMaintenanceSnapshot()).toMatchObject({
      executionStatus: 'failed',
      lastAction: null,
      lastFailure: 'Framework status readback unavailable',
    });
  });

  it('does not turn package profile migration diagnostics into a separate maintenance target', async () => {
    bridgeMocks.getUpdatePlanInvoke.mockResolvedValueOnce({
      ...managedUpdatePlanResult,
      parsed: {
        managed_update: {
          operation: 'plan',
          execution: { status: 'completed' },
          components: [
            {
              component_id: 'opl_packages',
              state: 'current',
              profile_migration_status: 'manual_required',
            },
          ],
        },
      },
    });

    await executeManagedUpdateRead('plan', {
      background: true,
      trigger: 'daily_background_maintenance',
    });

    expect(getManagedUpdateMaintenanceSnapshot().lastSkipReason).toBeNull();
    expect(bridgeMocks.applyUpdateComponentInvoke).not.toHaveBeenCalled();
  });

  it('does not apply when Framework declares no background-eligible component', async () => {
    bridgeMocks.getUpdatePlanInvoke.mockResolvedValueOnce({
      ...managedUpdatePlanResult,
      parsed: {
        managed_update: {
          operation: 'plan',
          execution: { status: 'completed' },
          components: [
            {
              component_id: 'opl_packages',
              state: 'update_available',
              auto_apply: {
                eligible: false,
                app_background_safe: false,
                command_ref: null,
                blocked_reasons: ['developer_checkout_visible'],
              },
            },
          ],
        },
      },
    });

    const stop = startManagedUpdateMaintenanceScheduler();
    await waitFor(() => expect(bridgeMocks.getUpdatePlanInvoke).toHaveBeenCalledOnce());
    await waitFor(() => expect(getManagedUpdateMaintenanceSnapshot().running).toBe(false));

    expect(bridgeMocks.applyUpdatePlanInvoke).not.toHaveBeenCalled();
    expect(getManagedUpdateMaintenanceSnapshot().lastSkipReason).toBe('opl_packages: developer_checkout_visible');
    stop();
  });

  it('keeps the carrier checkpoint pending when planning fails so the next startup retries', async () => {
    bridgeMocks.getUpdatePlanInvoke.mockResolvedValueOnce({
      ok: false,
      surface: 'update_plan',
      command: 'opl update plan --json',
      stdout: '',
      parsed: null,
      error: { message: 'Framework plan unavailable' },
    });

    const stop = startManagedUpdateMaintenanceScheduler();
    await waitFor(() => expect(getManagedUpdateMaintenanceSnapshot().running).toBe(false));

    const snapshot = getManagedUpdateMaintenanceSnapshot();
    expect(snapshot.executionStatus).toBe('failed');
    expect(snapshot.lastFailure).toBe('Framework plan unavailable');
    expect(snapshot.lastReconciledCarrierCheckpoint).toBeNull();
    expect(bridgeMocks.applyUpdatePlanInvoke).not.toHaveBeenCalled();
    stop();
  });

  it('keeps the carrier checkpoint pending when terminal status readback fails after apply', async () => {
    bridgeMocks.getUpdateStatusInvoke.mockResolvedValueOnce(managedUpdateStatusResult).mockResolvedValueOnce({
      ok: false,
      surface: 'update_status',
      command: 'opl update status --json',
      stdout: '',
      parsed: null,
      error: { message: 'Framework status readback unavailable' },
    });

    const stop = startManagedUpdateMaintenanceScheduler();
    await waitFor(() => expect(bridgeMocks.applyUpdatePlanInvoke).toHaveBeenCalledOnce());
    await waitFor(() => expect(bridgeMocks.getUpdateStatusInvoke).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getManagedUpdateMaintenanceSnapshot().running).toBe(false));

    const snapshot = getManagedUpdateMaintenanceSnapshot();
    expect(snapshot.executionStatus).toBe('failed');
    expect(snapshot.lastAction).toBeNull();
    expect(snapshot.lastFailure).toBe('Framework status readback unavailable');
    expect(snapshot.lastReconciledCarrierCheckpoint).toBeNull();
    stop();
  });

  it('does not commit the carrier checkpoint when Framework reports a failed apply payload', async () => {
    bridgeMocks.applyUpdatePlanInvoke.mockResolvedValueOnce({
      surface: 'update_apply',
      command: 'opl update apply --json',
      stdout: '{}',
      parsed: {
        managed_update: {
          operation: 'apply',
          execution: { status: 'failed' },
          summary: { message: 'Package activation failed verification' },
        },
      },
    });

    const stop = startManagedUpdateMaintenanceScheduler();
    await waitFor(() => expect(getManagedUpdateMaintenanceSnapshot().running).toBe(false));

    const snapshot = getManagedUpdateMaintenanceSnapshot();
    expect(snapshot.executionStatus).toBe('failed');
    expect(snapshot.lastAction?.status).toBe('failed');
    expect(snapshot.lastFailure).toBe('Package activation failed verification');
    expect(snapshot.lastReconciledCarrierCheckpoint).toBeNull();
    stop();
  });
});
