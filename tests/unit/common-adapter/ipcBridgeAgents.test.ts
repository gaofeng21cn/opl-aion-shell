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
  const emitter = () => ({ on: vi.fn(() => vi.fn()), emit: vi.fn() });

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
    wsEmitter: vi.fn(emitter),
    wsMappedEmitter: vi.fn(emitter),
    stubEmitter: vi.fn(emitter),
  };
});

vi.mock('@/common/adapter/httpBridge', () => httpBridgeMocks);

vi.mock('@office-ai/platform', () => ({
  bridge: {
    buildProvider: vi.fn(() => ({ provider: vi.fn(), invoke: vi.fn() })),
    buildEmitter: vi.fn(() => ({ on: vi.fn(() => vi.fn()), emit: vi.fn() })),
  },
}));

describe('ipcBridge managed agents adapter', () => {
  beforeEach(() => {
    httpBridgeMocks.calls.length = 0;
  });

  it('reads the management catalog and probes health by encoded agent id', async () => {
    const { acpConversation } = await import('@/common/adapter/ipcBridge');

    await acpConversation.getManagedAgents.invoke();
    await acpConversation.checkManagedAgentHealthById.invoke({ id: 'custom/agent' });

    expect(httpBridgeMocks.calls).toEqual([
      { method: 'GET', path: '/api/agents/management', body: undefined },
      { method: 'POST', path: '/api/agents/custom%2Fagent/health-check', body: undefined },
    ]);
    expect(acpConversation).not.toHaveProperty('getAvailableAgents');
    expect(acpConversation).not.toHaveProperty('refreshCustomAgents');
    expect(acpConversation).not.toHaveProperty('checkAgentHealth');
  });
});
