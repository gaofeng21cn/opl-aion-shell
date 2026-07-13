import { describe, expect, it, vi } from 'vitest';
import type { ThreadCoordinationDeliveryRequest } from '@/common/types/codex/threadCoordination';
import { CodexAppServerThreadCoordinationPort } from '@/process/services/threadCoordination/codexAppServerPort';
import type { CodexAppServerJsonRpc } from '@/process/services/threadCoordination/jsonRpcClient';

type Handler = (params: unknown) => unknown | Promise<unknown>;

function rpc(handlers: Record<string, Handler>): CodexAppServerJsonRpc & { requests: Array<[string, unknown]> } {
  const requests: Array<[string, unknown]> = [];
  return {
    requests,
    request: vi.fn(async <T>(method: string, params: unknown) => {
      requests.push([method, params]);
      const handler = handlers[method];
      if (!handler) throw new Error(`Unexpected method: ${method}`);
      return (await handler(params)) as T;
    }),
    onNotification: () => () => {},
    dispose: vi.fn(),
  };
}

function rawThread(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    cwd: `/workspace/${id}`,
    status: { type: 'idle' },
    turns: [],
    updatedAt: 1_783_900_000,
    name: `Thread ${id}`,
    preview: `Summary ${id}`,
    parentThreadId: null,
    forkedFromId: null,
    agentRole: 'worker',
    gitInfo: { originUrl: `https://example.test/${id}.git` },
    ...overrides,
  };
}

function delivery(overrides: Partial<ThreadCoordinationDeliveryRequest> = {}): ThreadCoordinationDeliveryRequest {
  return {
    action: 'deliver',
    sourceThreadId: 'source',
    targetThreadId: 'target',
    actor: { kind: 'user', id: 'operator', threadId: 'source' },
    reason: 'Coordinate work',
    message: 'Inspect the boundary.',
    permission: 'inherit',
    writeSet: [],
    idempotencyKey: '019f-test',
    route: { visitedThreadIds: ['source'], hopCount: 1 },
    ...overrides,
  };
}

describe('CodexAppServerThreadCoordinationPort', () => {
  it('paginates thread/list and accepts a source hint only when the opaque id exists', async () => {
    const appServer = rpc({
      'thread/list': (params) => {
        const cursor = (params as { cursor?: string | null }).cursor;
        return cursor
          ? { data: [rawThread('second')], nextCursor: null }
          : { data: [rawThread('source')], nextCursor: 'next-page' };
      },
    });
    const port = new CodexAppServerThreadCoordinationPort({
      rpc: appServer,
      host: 'test-host',
      pageSize: 1,
    });

    const found = await port.listThreads({ sourceThreadIdHint: 'source' });
    const missing = await port.listThreads({ sourceThreadIdHint: 'invented' });

    expect(found.threads.map((thread) => thread.id)).toEqual(['source', 'second']);
    expect(found.currentThreadId).toBe('source');
    expect(found.threads[0].host).toBe('test-host');
    expect(missing.currentThreadId).toBeNull();
  });

  it('maps thread/read history and goal through typed responses', async () => {
    const appServer = rpc({
      'thread/read': () => ({
        thread: rawThread('target', {
          turns: [
            {
              id: 'turn-1',
              status: 'completed',
              startedAt: 1_783_900_000,
              items: [{ type: 'userMessage', id: 'item-1', content: [{ type: 'text', text: 'Hello' }] }],
            },
          ],
        }),
      }),
      'thread/goal/get': () => ({ goal: { objective: 'Ship the feature' } }),
    });
    const port = new CodexAppServerThreadCoordinationPort({ rpc: appServer, host: 'test-host' });

    const detail = await port.readThread('target');

    expect(detail.thread.goal).toBe('Ship the feature');
    expect(detail.history).toEqual([
      expect.objectContaining({ turnId: 'turn-1', role: 'user', text: 'Hello', status: 'completed' }),
    ]);
  });

  it('reads an unmaterialized empty thread without weakening other read failures', async () => {
    const appServer = rpc({
      'thread/read': (params) => {
        if ((params as { includeTurns: boolean }).includeTurns) {
          throw new Error(
            'thread target is not materialized yet; includeTurns is unavailable before first user message'
          );
        }
        return { thread: rawThread('target') };
      },
      'thread/goal/get': () => ({ goal: null }),
    });
    const port = new CodexAppServerThreadCoordinationPort({ rpc: appServer, host: 'test-host' });

    const detail = await port.readThread('target');

    expect(detail.thread.id).toBe('target');
    expect(detail.history).toEqual([]);
    expect(appServer.requests.filter(([method]) => method === 'thread/read')).toEqual([
      ['thread/read', { threadId: 'target', includeTurns: true }],
      ['thread/read', { threadId: 'target', includeTurns: false }],
    ]);
  });

  it('keeps unrelated thread/read failures fail closed', async () => {
    const appServer = rpc({
      'thread/read': () => {
        throw new Error('permission denied');
      },
    });
    const port = new CodexAppServerThreadCoordinationPort({ rpc: appServer, host: 'test-host' });

    await expect(port.readThread('target')).rejects.toThrow('permission denied');
    expect(appServer.requests.filter(([method]) => method === 'thread/read')).toHaveLength(1);
  });

  it('routes lifecycle and turn operations to the real app-server method shapes', async () => {
    const appServer = rpc({
      'thread/resume': () => ({ thread: rawThread('target') }),
      'thread/fork': () => ({ thread: rawThread('forked', { forkedFromId: 'target' }) }),
      'thread/archive': () => ({}),
      'turn/start': () => ({ turn: { id: 'turn-started' } }),
      'turn/steer': () => ({ turnId: 'turn-active' }),
    });
    const port = new CodexAppServerThreadCoordinationPort({ rpc: appServer, host: 'test-host' });

    await port.resumeThread('target');
    await port.forkThread('target');
    await port.archiveThread('target');
    await port.startTurn(delivery({ writeSet: ['/workspace/target/src'] }));
    await port.steerTurn(delivery({ idempotencyKey: 'steer-id' }), 'turn-active');

    expect(appServer.requests.map(([method]) => method)).toEqual([
      'thread/resume',
      'thread/fork',
      'thread/archive',
      'turn/start',
      'turn/steer',
    ]);
    expect(appServer.requests[3][1]).toMatchObject({ threadId: 'target' });
    expect(appServer.requests[3][1]).not.toHaveProperty('approvalPolicy');
    expect(appServer.requests[3][1]).not.toHaveProperty('sandboxPolicy');
    expect(appServer.requests[4][1]).toMatchObject({ threadId: 'target', expectedTurnId: 'turn-active' });
  });
});
