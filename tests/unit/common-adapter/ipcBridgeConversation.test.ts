/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type HttpCall = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
};

const httpBridgeMocks = vi.hoisted(() => {
  const calls: HttpCall[] = [];
  const provider =
    (method: HttpCall['method']) =>
    <Data, Params = undefined>(path: string | ((params: Params) => string), mapBody?: (params: Params) => unknown) => ({
      provider: vi.fn(),
      invoke: vi.fn(async (params?: Params) => {
        calls.push({
          method,
          path: typeof path === 'function' ? path(params as Params) : path,
          body: mapBody && params !== undefined ? mapBody(params as Params) : undefined,
        });
        return true as Data;
      }),
    });

  return {
    calls,
    httpGet: provider('GET'),
    httpPost: provider('POST'),
    httpPut: provider('PUT'),
    httpPatch: provider('PATCH'),
    httpDelete: provider('DELETE'),
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
    wsEmitter: vi.fn(() => ({ on: vi.fn(() => vi.fn()), emit: vi.fn() })),
    wsMappedEmitter: vi.fn(() => ({ on: vi.fn(() => vi.fn()), emit: vi.fn() })),
    stubEmitter: vi.fn(() => ({ on: vi.fn(() => vi.fn()), emit: vi.fn() })),
  };
});

vi.mock('@/common/adapter/httpBridge', () => httpBridgeMocks);

vi.mock('@office-ai/platform', () => ({
  bridge: {
    buildProvider: vi.fn(() => ({ provider: vi.fn(), invoke: vi.fn() })),
    buildEmitter: vi.fn(() => ({ on: vi.fn(() => vi.fn()), emit: vi.fn() })),
  },
}));

describe('ipcBridge conversation clone payload', () => {
  beforeEach(() => {
    httpBridgeMocks.calls.length = 0;
  });

  it('sends only the strict create fields for canonical Codex conversations', async () => {
    const { conversation } = await import('@/common/adapter/ipcBridge');

    await conversation.createWithConversation.invoke({
      conversation: {
        id: 'canonical-thread-1',
        created_at: 1700000000000,
        modified_at: 1700000001000,
        type: 'acp',
        source: 'codex-app-server',
        name: 'Canonical task',
        desc: 'derived summary',
        status: 'finished',
        runtime: { backend: 'codex' },
        model: {} as never,
        extra: {
          backend: 'codex',
          workspace: '/tmp/project',
          canonical_thread_id: 'canonical-thread-1',
        },
      } as never,
    });

    const call = httpBridgeMocks.calls.at(-1);
    expect(call).toMatchObject({
      method: 'POST',
      path: '/api/conversations/clone',
    });
    expect(call?.body).toEqual({
      conversation: {
        type: 'acp',
        name: 'Canonical task',
        extra: {
          backend: 'codex',
          workspace: '/tmp/project',
          canonical_thread_id: 'canonical-thread-1',
        },
      },
    });
    expect(call?.body).not.toHaveProperty('conversation.source');
    expect(call?.body).not.toHaveProperty('conversation.id');
    expect(call?.body).not.toHaveProperty('conversation.created_at');
    expect(call?.body).not.toHaveProperty('conversation.modified_at');
    expect(call?.body).not.toHaveProperty('conversation.status');
    expect(call?.body).not.toHaveProperty('conversation.runtime');
  });
});
