/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

const platformMocks = vi.hoisted(() => ({
  buildProvider: vi.fn(() => ({
    provider: vi.fn(),
    invoke: vi.fn(),
  })),
  buildEmitter: vi.fn(() => ({
    emit: vi.fn(),
    on: vi.fn(),
  })),
}));

vi.mock('@office-ai/platform', () => ({
  bridge: platformMocks,
  storage: {
    buildStorage: () => ({
      getSync: () => undefined,
      setSync: () => {},
      get: () => Promise.resolve(undefined),
      set: () => Promise.resolve(),
    }),
  },
}));

describe('OPL runtime IPC channel contract', () => {
  it('uses the App-owned managed update bridge channel names', async () => {
    vi.resetModules();
    platformMocks.buildProvider.mockClear();

    await import('@/common/adapter/ipcBridge');

    const channels = platformMocks.buildProvider.mock.calls.map(([channel]) => channel);
    expect(channels).toEqual(
      expect.arrayContaining([
        'opl-runtime.get-managed-update-status',
        'opl-runtime.get-managed-update-check',
        'opl-runtime.get-managed-update-plan',
        'opl-runtime.run-managed-update-apply',
        'opl-runtime.run-managed-update-repair',
        'opl-runtime.run-managed-update-rollback',
      ])
    );
    expect(channels).not.toEqual(expect.arrayContaining(['opl-runtime.update-status', 'opl-runtime.update-apply']));
  });

  it('declares local data lifecycle channels for Storage inventory, receipts, and dry-run execution', async () => {
    vi.resetModules();
    platformMocks.buildProvider.mockClear();

    await import('@/common/adapter/ipcBridge');

    const channels = platformMocks.buildProvider.mock.calls.map(([channel]) => channel);
    expect(channels).toEqual(
      expect.arrayContaining([
        'local-data-lifecycle.get-inventory',
        'local-data-lifecycle.archive-conversations',
        'local-data-lifecycle.restore-conversation-proof',
        'local-data-lifecycle.delete-conversation-artifacts',
        'local-data-lifecycle.plan-runtime-prune',
        'local-data-lifecycle.execute-runtime-prune',
        'local-data-lifecycle.plan-log-rotation',
        'local-data-lifecycle.execute-log-rotation',
        'local-data-lifecycle.plan-updater-cache-cleanup',
        'local-data-lifecycle.execute-updater-cache-cleanup',
      ])
    );
    expect(channels).not.toEqual(expect.arrayContaining(['local-data-lifecycle.delete-silently']));
  });
});
