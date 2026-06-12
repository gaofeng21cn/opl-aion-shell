/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import {
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

const managedUpdateAutoApplyPlanResult = {
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
          component_id: 'app_binary',
          state: 'update_available',
          safe_to_apply: true,
          needs_restart: true,
          reload_guidance: 'Install the app update from the standard updater.',
        },
        {
          component_id: 'runtime_toolchain',
          state: 'update_available',
          safe_to_apply: true,
          needs_restart: true,
          reload_guidance: 'Restart the app before the new runtime is visible.',
        },
        {
          component_id: 'agent_package_channel',
          state: 'update_available',
          safe_to_apply: true,
          reload_guidance: 'Reload Codex plugin cache after agent package sync.',
        },
        {
          component_id: 'capability_exposure',
          state: 'staged',
          safe_to_apply: true,
          needs_reload: true,
          reload_guidance: 'Reload the app to refresh visible capabilities.',
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
    bridgeMocks.getUpdatePlanInvoke.mockResolvedValue(managedUpdateAutoApplyPlanResult);
    bridgeMocks.applyUpdateComponentInvoke.mockImplementation(({ componentId }: { componentId: string }) =>
      Promise.resolve({
        surface: 'update_apply',
        command: `opl update apply --component ${componentId} --json`,
        stdout: '{}',
        parsed: {
          managed_update: {
            operation: 'apply',
            idempotency_lock: { status: 'released' },
            execution: { status: 'completed' },
            components: [{ component_id: componentId, state: 'needs_reload', needs_reload: true }],
            reload_guidance: `Reload after applying ${componentId}.`,
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
    expect(snapshot.lastRunAt).toEqual(expect.any(String));
    expect(snapshot.nextRunAt).toEqual(expect.any(String));
    expect(snapshot.lastFailure).toBeNull();
    expect(snapshot.lockStatus).toBe('released');
    expect(snapshot.result?.surface).toBe('update_check');

    stop();
  });

  it('auto-applies clean managed agent and capability components from background plans', async () => {
    await executeManagedUpdateRead('plan', {
      background: true,
      trigger: 'daily_background_maintenance',
    });

    await waitFor(() =>
      expect(bridgeMocks.applyUpdateComponentInvoke).toHaveBeenCalledWith({
        componentId: 'agent_package_channel',
      })
    );
    expect(bridgeMocks.applyUpdateComponentInvoke).toHaveBeenCalledWith({
      componentId: 'capability_exposure',
    });
    expect(bridgeMocks.applyUpdateComponentInvoke).not.toHaveBeenCalledWith({
      componentId: 'app_binary',
    });
    expect(bridgeMocks.applyUpdateComponentInvoke).not.toHaveBeenCalledWith({
      componentId: 'runtime_toolchain',
    });

    const snapshot = getManagedUpdateMaintenanceSnapshot();
    expect(snapshot.executionStatus).toBe('completed');
    expect(snapshot.lastAction).toEqual({
      kind: 'auto_apply',
      componentId: 'capability_exposure',
      status: 'completed',
      at: expect.any(String),
    });
    expect(snapshot.lastSkipReason).toContain('app_binary: restart_required');
    expect(snapshot.lastSkipReason).toContain('runtime_toolchain: restart_required');
    expect(snapshot.reloadGuidance).toBe('Reload after applying capability_exposure.');
    expect(snapshot.result?.surface).toBe('update_apply');
  });

  it('does not auto-apply managed agent components that are already current', async () => {
    bridgeMocks.getUpdatePlanInvoke.mockResolvedValueOnce({
      surface: 'update_plan',
      command: 'opl update plan --json',
      stdout: '{}',
      parsed: {
        managed_update: {
          operation: 'plan',
          idempotency_lock: { status: 'released' },
          execution: { status: 'completed' },
          components: [
            {
              component_id: 'agent_package_channel',
              state: 'current',
              safe_to_apply: false,
            },
            {
              component_id: 'capability_exposure',
              state: 'current',
              safe_to_apply: false,
            },
          ],
        },
      },
    });

    await executeManagedUpdateRead('plan', {
      background: true,
      trigger: 'daily_background_maintenance',
    });

    expect(bridgeMocks.applyUpdateComponentInvoke).not.toHaveBeenCalled();
    const snapshot = getManagedUpdateMaintenanceSnapshot();
    expect(snapshot.lastAction).toBeNull();
    expect(snapshot.lastSkipReason).toBeNull();
    expect(snapshot.result?.surface).toBe('update_plan');
  });
});
