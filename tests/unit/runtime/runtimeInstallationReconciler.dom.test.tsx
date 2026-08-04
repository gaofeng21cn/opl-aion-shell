/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRuntimeInstallationReconciler,
  RUNTIME_RECONCILE_WINDOW_MS,
} from '@/renderer/services/runtime/runtimeInstallationReconciler';
import type { IRuntimeStatusEvent } from '@/common/adapter/ipcBridge';

const failed = (scopeId: string): IRuntimeStatusEvent => ({
  resource: 'node',
  scope: { kind: 'custom_agent', id: scopeId },
  phase: 'failed',
  failure_kind: 'bundled_resource_invalid',
  message: 'os error 1450',
});

const ready = (scopeId: string): IRuntimeStatusEvent => ({
  resource: 'node',
  scope: { kind: 'conversation', id: scopeId },
  phase: 'ready',
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('runtimeInstallationReconciler', () => {
  it('retracts the dialog and suppresses the report when node becomes ready in-window', () => {
    const close = vi.fn();
    const report = vi.fn();
    const reconciler = createRuntimeInstallationReconciler({ showDialog: () => ({ close }), report });

    reconciler.handleStatus(failed('custom-agent-1'));
    reconciler.handleStatus(ready('conversation-9'));

    vi.advanceTimersByTime(RUNTIME_RECONCILE_WINDOW_MS + 100);
    expect(close).toHaveBeenCalledTimes(1);
    expect(report).not.toHaveBeenCalled();
  });

  it('reports a persistent failure at the end of the reconciliation window', () => {
    const close = vi.fn();
    const report = vi.fn();
    const reconciler = createRuntimeInstallationReconciler({ showDialog: () => ({ close }), report });

    reconciler.handleStatus(failed('custom-agent-1'));
    vi.advanceTimersByTime(RUNTIME_RECONCILE_WINDOW_MS + 100);

    expect(report).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it('flushes a pending report during unload or unmount', () => {
    const report = vi.fn();
    const reconciler = createRuntimeInstallationReconciler({ showDialog: () => ({ close: vi.fn() }), report });

    reconciler.handleStatus(failed('custom-agent-1'));
    vi.advanceTimersByTime(5000);
    reconciler.flushPending();

    expect(report).toHaveBeenCalledTimes(1);
  });
});
