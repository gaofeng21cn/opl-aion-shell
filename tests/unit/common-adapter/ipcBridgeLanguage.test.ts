/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const httpBridgeMocks = vi.hoisted(() => {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const provider =
    (method: string) =>
    <Data, Params = undefined>(path: string, mapBody?: (params: Params) => unknown) => ({
      provider: vi.fn(),
      invoke: vi.fn(async (params?: Params) => {
        calls.push({ method, path, body: mapBody ? mapBody(params as Params) : params });
        return undefined as Data;
      }),
    });
  const emitter = () => ({ on: vi.fn(() => vi.fn()), emit: vi.fn() });

  return {
    calls,
    httpDelete: vi.fn(provider('DELETE')),
    httpGet: vi.fn(provider('GET')),
    httpPatch: vi.fn(provider('PATCH')),
    httpPost: vi.fn(provider('POST')),
    httpPut: vi.fn(provider('PUT')),
    httpRequest: vi.fn(),
    stubProvider: vi.fn((_name: string, defaultValue: unknown) => ({
      provider: vi.fn(),
      invoke: vi.fn(async () => defaultValue),
    })),
    withResponseMap: vi.fn(
      (
        inner: { provider: unknown; invoke: (params?: unknown) => Promise<unknown> },
        map: (raw: unknown) => unknown
      ) => ({
        provider: inner.provider,
        invoke: vi.fn(async (params?: unknown) => map(await inner.invoke(params))),
      })
    ),
    wsEmitter: vi.fn(emitter),
    wsMappedEmitter: vi.fn(emitter),
    stubEmitter: vi.fn(emitter),
  };
});

const platformMocks = vi.hoisted(() => {
  const invokes = new Map<string, ReturnType<typeof vi.fn>>();
  const buildProvider = vi.fn((channel: string) => {
    const invoke = vi.fn(async () => ({
      transport: 'opl-runtime-provider.v1',
      status: 'fulfilled',
      value: undefined,
    }));
    invokes.set(channel, invoke);
    return { provider: vi.fn(), invoke };
  });

  return {
    invokes,
    bridge: {
      buildProvider,
      buildEmitter: vi.fn(() => ({ on: vi.fn(() => vi.fn()), emit: vi.fn() })),
    },
  };
});

vi.mock('@/common/adapter/httpBridge', () => httpBridgeMocks);
vi.mock('@office-ai/platform', () => ({ bridge: platformMocks.bridge }));

describe('language bridge routing', () => {
  beforeEach(() => {
    httpBridgeMocks.calls.length = 0;
    vi.clearAllMocks();
  });

  it('uses backend PATCH in WebUI mode', async () => {
    delete (window as Window & { electronAPI?: unknown }).electronAPI;
    const { systemSettings } = await import('@/common/adapter/ipcBridge');

    await systemSettings.changeLanguage.invoke({ language: 'zh-CN' });

    expect(httpBridgeMocks.calls).toContainEqual({
      method: 'PATCH',
      path: '/api/settings',
      body: { language: 'zh-CN' },
    });
    expect(platformMocks.invokes.get('system-settings:change-language')).not.toHaveBeenCalled();
  });

  it('uses the native provider in Electron mode', async () => {
    (window as Window & { electronAPI?: unknown }).electronAPI = {};
    const { systemSettings } = await import('@/common/adapter/ipcBridge');

    await systemSettings.changeLanguage.invoke({ language: 'en-US' });

    expect(platformMocks.invokes.get('system-settings:change-language')).toHaveBeenCalledWith({
      language: 'en-US',
    });
    expect(httpBridgeMocks.calls).not.toContainEqual(
      expect.objectContaining({ method: 'PATCH', path: '/api/settings' })
    );
  });
});
