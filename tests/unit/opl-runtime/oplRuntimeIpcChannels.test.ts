/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

const platformMocks = vi.hoisted(() => ({
  buildProvider: vi.fn((_channel: string) => ({
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
        'opl-runtime.run-managed-update-plan-apply',
        'opl-runtime.run-managed-update-apply',
        'opl-runtime.run-managed-update-repair',
        'opl-runtime.run-managed-update-rollback',
      ])
    );
    expect(channels).not.toEqual(expect.arrayContaining(['opl-runtime.update-status', 'opl-runtime.update-apply']));
  });

  it('exposes one item-scoped lazy detail-view channel', async () => {
    vi.resetModules();
    platformMocks.buildProvider.mockClear();

    await import('@/common/adapter/ipcBridge');

    const channels = platformMocks.buildProvider.mock.calls.map(([channel]) => channel);
    expect(channels).toContain('opl-runtime.read-domain-detail-view');
    expect(channels).not.toEqual(
      expect.arrayContaining(['opl-runtime.read-domain-artifact', 'opl-runtime.read-domain-path'])
    );
  });

  it('exposes one runtime-provider Gateway secret channel without parallel mutation channels', async () => {
    vi.resetModules();
    platformMocks.buildProvider.mockClear();

    await import('@/common/adapter/ipcBridge');

    const channels = platformMocks.buildProvider.mock.calls.map(([channel]) => channel);
    expect(channels).toContain('opl-runtime.login-gateway-account');
    expect(channels).not.toEqual(
      expect.arrayContaining([
        'opl-runtime.complete-gateway-account-setup',
        'opl-runtime.refresh-gateway-account',
        'opl-runtime.repair-gateway-account',
        'opl-runtime.disconnect-gateway-account',
      ])
    );
  });

  it('routes WebUI Gateway login through the existing OPL runtime HTTP proxy', async () => {
    vi.resetModules();
    platformMocks.buildProvider.mockClear();
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {});
    const password = 'webui-gateway-secret';
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true, stateRefreshRequired: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchSpy);
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    try {
      const { oplRuntime } = await import('@/common/adapter/ipcBridge');
      await oplRuntime.loginGatewayAccount.invoke({ email: 'user@example.com', password });

      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(fetchSpy.mock.calls[0][0]).toBe('/api/opl-runtime/gateway-account-login');
      expect(fetchSpy.mock.calls[0][1]).toMatchObject({
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com', password }),
      });
      expect(debugSpy.mock.calls.flat().join('\n')).not.toContain(password);
    } finally {
      debugSpy.mockRestore();
      vi.unstubAllGlobals();
    }
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
        'local-data-lifecycle.restore-conversation-archive',
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

  it('keeps OPL runtime calls on desktop IPC when the Electron preload exists but aioncore has no port', async () => {
    vi.resetModules();
    const electronInvoke = vi.fn().mockResolvedValue({ ok: true });
    platformMocks.buildProvider.mockImplementation((channel: string) => ({
      provider: vi.fn(),
      invoke: channel === 'opl-runtime.get-initialize' ? electronInvoke : vi.fn(),
    }));
    vi.stubGlobal('window', { electronAPI: {}, __backendPort: 0 });
    vi.stubGlobal('document', {});
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchSpy);

    const { oplRuntime } = await import('@/common/adapter/ipcBridge');
    await oplRuntime.getInitialize.invoke();

    expect(electronInvoke).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
