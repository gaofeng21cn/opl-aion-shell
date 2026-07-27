/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const httpBridgeMocks = vi.hoisted(() => {
  const provider = () => ({
    provider: vi.fn(),
    invoke: vi.fn(async () => undefined),
  });
  const emitter = () => ({ on: vi.fn(() => vi.fn()), emit: vi.fn() });

  return {
    httpDelete: vi.fn(provider),
    httpGet: vi.fn(provider),
    httpPatch: vi.fn(provider),
    httpPost: vi.fn(provider),
    httpPut: vi.fn(provider),
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
      schema: 'opl_codex_thread_directory.v1',
      host: 'desktop-host',
      complete: true,
      threads: [],
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

describe('ipcBridge Codex thread directory routing', () => {
  beforeEach(() => {
    delete (window as Window & { electronAPI?: unknown }).electronAPI;
  });

  it('settles WebUI list calls with an incomplete directory without invoking the Electron provider', async () => {
    const { codexThreads } = await import('@/common/adapter/ipcBridge');

    await expect(codexThreads.list.invoke({ includeArchived: true })).resolves.toEqual({
      schema: 'opl_codex_thread_directory.v1',
      host: 'webui-local-cache',
      complete: false,
      threads: [],
    });
    expect(platformMocks.invokes.get('codex-threads.list')).not.toHaveBeenCalled();
  });

  it('keeps Desktop list calls on the production Electron provider', async () => {
    const { codexThreads } = await import('@/common/adapter/ipcBridge');
    (window as Window & { electronAPI?: unknown }).electronAPI = {};

    await expect(codexThreads.list.invoke({ includeArchived: true })).resolves.toMatchObject({
      host: 'desktop-host',
      complete: true,
    });
    expect(platformMocks.invokes.get('codex-threads.list')).toHaveBeenCalledWith({ includeArchived: true });
  });
});
