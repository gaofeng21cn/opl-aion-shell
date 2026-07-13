import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
  CodexAppServerJsonRpcClient,
  type CodexAppServerProcess,
} from '@/process/services/threadCoordination/jsonRpcClient';

type RequestRecord = {
  method?: string;
  id?: number | string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};

class FakeCodexProcess extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly requests: RequestRecord[] = [];
  readonly kill = vi.fn(() => true);

  constructor(respond: (request: RequestRecord, process: FakeCodexProcess) => void) {
    super();
    let buffer = '';
    this.stdin.on('data', (chunk) => {
      buffer += String(chunk);
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) {
          const request = JSON.parse(line) as RequestRecord;
          this.requests.push(request);
          respond(request, this);
        }
        newline = buffer.indexOf('\n');
      }
    });
  }

  reply(id: number | string, result: unknown): void {
    this.stdout.write(`${JSON.stringify({ id, result })}\n`);
  }

  requestClient(id: number | string, method: string, params: unknown): void {
    this.stdout.write(`${JSON.stringify({ id, method, params })}\n`);
  }
}

function asProcess(process: FakeCodexProcess): CodexAppServerProcess {
  return process as unknown as CodexAppServerProcess;
}

describe('CodexAppServerJsonRpcClient', () => {
  it('initializes one stdio process before sending typed requests and disposes it', async () => {
    const process = new FakeCodexProcess((request, child) => {
      if (request.method === 'initialize' && request.id) child.reply(request.id, { userAgent: 'Codex/0.144.1' });
      if (request.method === 'thread/list' && request.id) child.reply(request.id, { data: [], nextCursor: null });
    });
    const spawnProcess = vi.fn(() => asProcess(process));
    const client = new CodexAppServerJsonRpcClient({ executable: '/managed/codex', spawnProcess });

    const result = await client.request<{ data: unknown[] }>('thread/list', { limit: 10 });
    client.dispose();

    expect(spawnProcess).toHaveBeenCalledWith(
      '/managed/codex',
      ['app-server', '--stdio'],
      expect.objectContaining({ windowsHide: true })
    );
    expect(process.requests.map((request) => request.method)).toEqual(['initialize', 'initialized', 'thread/list']);
    expect(result.data).toEqual([]);
    expect(process.kill).toHaveBeenCalledOnce();
  });

  it('times out a silent request without treating it as success', async () => {
    const process = new FakeCodexProcess((request, child) => {
      if (request.method === 'initialize' && request.id) child.reply(request.id, { userAgent: 'Codex/0.144.1' });
    });
    const client = new CodexAppServerJsonRpcClient({
      executable: '/managed/codex',
      requestTimeoutMs: 20,
      spawnProcess: () => asProcess(process),
    });

    await expect(client.request('thread/read', { threadId: 'missing' })).rejects.toThrow(/timed out.*thread\/read/i);
    client.dispose();
  });

  it('rejects pending requests when the child process exits', async () => {
    const process = new FakeCodexProcess((request, child) => {
      if (request.method === 'initialize' && request.id) child.reply(request.id, { userAgent: 'Codex/0.144.1' });
      if (request.method === 'thread/list') queueMicrotask(() => child.emit('exit', 1, null));
    });
    const client = new CodexAppServerJsonRpcClient({
      executable: '/managed/codex',
      spawnProcess: () => asProcess(process),
    });

    await expect(client.request('thread/list', {})).rejects.toThrow(/exited/);
  });

  it('queues interactive server requests until the renderer returns a typed result', async () => {
    const process = new FakeCodexProcess((request, child) => {
      if (request.method === 'initialize' && request.id) child.reply(request.id, { userAgent: 'Codex/0.144.3' });
      if (request.method === 'thread/list' && request.id) {
        child.reply(request.id, { data: [], nextCursor: null });
        queueMicrotask(() =>
          child.requestClient(41, 'item/commandExecution/requestApproval', {
            threadId: 'thread-1',
            turnId: 'turn-1',
            itemId: 'item-1',
            command: 'git status',
          })
        );
      }
    });
    const client = new CodexAppServerJsonRpcClient({
      executable: '/managed/codex',
      spawnProcess: () => asProcess(process),
    });

    await client.request('thread/list', {});
    await vi.waitFor(() => expect(client.listPendingServerRequests()).toHaveLength(1));
    const [pending] = client.listPendingServerRequests();

    expect(pending).toMatchObject({
      requestId: 'number:41',
      method: 'item/commandExecution/requestApproval',
    });
    expect(client.resolveServerRequest(pending.requestId, { decision: 'accept' })).toBe(true);
    expect(process.requests).toContainEqual({ id: 41, result: { decision: 'accept' } });
    expect(client.listPendingServerRequests()).toEqual([]);
  });

  it('answers currentTime/read locally and rejects unknown server requests', async () => {
    const process = new FakeCodexProcess((request, child) => {
      if (request.method === 'initialize' && request.id) child.reply(request.id, { userAgent: 'Codex/0.144.3' });
      if (request.method === 'thread/list' && request.id) {
        child.reply(request.id, { data: [], nextCursor: null });
        queueMicrotask(() => {
          child.requestClient('clock', 'currentTime/read', { threadId: 'thread-1' });
          child.requestClient('unknown', 'unsupported/request', {});
        });
      }
    });
    const client = new CodexAppServerJsonRpcClient({
      executable: '/managed/codex',
      spawnProcess: () => asProcess(process),
    });

    await client.request('thread/list', {});
    await vi.waitFor(() =>
      expect(process.requests).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'clock', result: { currentTimeAt: expect.any(Number) } }),
          {
            id: 'unknown',
            error: { code: -32601, message: 'Unsupported server request: unsupported/request' },
          },
        ])
      )
    );
    expect(client.listPendingServerRequests()).toEqual([]);
  });
});
