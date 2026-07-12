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
  applyUpdateComponentInvoke: vi.fn(),
  repairUpdateInvoke: vi.fn(),
  rollbackUpdateComponentInvoke: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      getUpdateStatus: { invoke: bridgeMocks.getUpdateStatusInvoke },
      runUpdateCheck: { invoke: bridgeMocks.runUpdateCheckInvoke },
      getUpdatePlan: { invoke: bridgeMocks.getUpdatePlanInvoke },
      applyUpdateComponent: { invoke: bridgeMocks.applyUpdateComponentInvoke },
      repairUpdate: { invoke: bridgeMocks.repairUpdateInvoke },
      rollbackUpdateComponent: { invoke: bridgeMocks.rollbackUpdateComponentInvoke },
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
        },
        {
          component_id: 'opl_base',
          state: 'update_available',
          safe_to_apply: true,
          needs_restart: true,
          integration_status: 'needs_reload',
        },
        {
          component_id: 'opl_packages',
          package_id: 'oma',
          state: 'update_available',
          safe_to_apply: true,
          projection_status: 'needs_reload',
          profile_migration_status: 'manual_required',
        },
      ],
    },
  },
};

describe('managed update background maintenance scheduler', () => {
  beforeEach(() => {
    resetManagedUpdateMaintenanceForTest();
    localStorage.clear();
    vi.clearAllMocks();
    bridgeMocks.runUpdateCheckInvoke.mockResolvedValue(managedUpdateCheckResult);
    bridgeMocks.getUpdatePlanInvoke.mockResolvedValue(managedUpdatePlanResult);
    bridgeMocks.applyUpdateComponentInvoke.mockImplementation(({ componentId }: { componentId: string }) =>
      Promise.resolve({
        surface: 'update_apply',
        command: componentId === 'opl_base' ? 'opl update apply --json' : 'opl packages update --package-id oma --json',
        stdout: '{}',
        parsed: {
          managed_update: {
            operation: 'apply',
            idempotency_lock: { status: 'released' },
            execution: { status: 'completed' },
            components: [{ component_id: componentId, state: 'needs_reload', needs_reload: true }],
          },
        },
      })
    );
  });

  it('runs a non-blocking startup check and projects durable maintenance status fields', async () => {
    const stop = startManagedUpdateMaintenanceScheduler();

    await waitFor(() => expect(bridgeMocks.runUpdateCheckInvoke).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getManagedUpdateMaintenanceSnapshot().lastRunAt).not.toBeNull());

    const snapshot = getManagedUpdateMaintenanceSnapshot();
    expect(snapshot.executionStatus).toBe('completed');
    expect(snapshot.lastTrigger).toBe('app_startup_after_core_ready');
    expect(snapshot.lastFailure).toBeNull();
    expect(snapshot.lockStatus).toBe('released');
    expect(snapshot.result?.surface).toBe('update_check');

    stop();
  });

  it('keeps background plans refresh-only and reports only the three public lifecycle ids', async () => {
    await executeManagedUpdateRead('plan', {
      background: true,
      trigger: 'daily_background_maintenance',
    });

    expect(bridgeMocks.applyUpdateComponentInvoke).not.toHaveBeenCalled();
    const snapshot = getManagedUpdateMaintenanceSnapshot();
    expect(snapshot.lastAction).toBeNull();
    expect(snapshot.lastSkipReason).toContain('opl_app: host_executor_required');
    expect(snapshot.lastSkipReason).toContain('opl_base: restart_required');
    expect(snapshot.lastSkipReason).toContain('opl_packages: refresh_only');
    expect(snapshot.lastSkipReason).not.toContain('profile_migration_status');
    expect(snapshot.reloadGuidance).toBe('Reload visible OPL capabilities after background maintenance.');
  });

  it('routes Base and explicitly targeted Packages mutations while rejecting App', async () => {
    await executeManagedUpdateMutation('apply', { componentId: 'opl_base' });
    await executeManagedUpdateMutation('apply', { componentId: 'opl_packages', packageId: 'oma' });

    expect(bridgeMocks.applyUpdateComponentInvoke).toHaveBeenNthCalledWith(1, { componentId: 'opl_base' });
    expect(bridgeMocks.applyUpdateComponentInvoke).toHaveBeenNthCalledWith(2, {
      componentId: 'opl_packages',
      packageId: 'oma',
    });

    const result = await executeManagedUpdateMutation('apply', { componentId: 'opl_app' });
    expect(result?.ok).toBe(false);
    expect(result?.error?.message).toContain('host or carrier updater');
    expect(bridgeMocks.applyUpdateComponentInvoke).toHaveBeenCalledTimes(2);
  });

  it('rejects package mutations without a package id and rejects legacy ids', async () => {
    const missingPackage = await executeManagedUpdateMutation('repair', { componentId: 'opl_packages' });
    const legacy = await executeManagedUpdateMutation('repair', { componentId: 'capability_packages' });

    expect(missingPackage?.ok).toBe(false);
    expect(legacy?.ok).toBe(false);
    expect(bridgeMocks.repairUpdateInvoke).not.toHaveBeenCalled();
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
});
