import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CodexAppServerAdapter,
  createProductionCodexAppServerAdapter,
  type CodexAppServerRpc,
} from '@/process/services/codexAppServer/adapter';

const processMocks = vi.hoisted(() => ({ spawn: vi.fn() }));

vi.mock('node:child_process', () => ({ spawn: processMocks.spawn }));
vi.mock('@/process/services/codexAppServer/codexCliResolver', () => ({
  resolveCodexCliPath: () => '/managed/codex',
}));

type StdioRecord = {
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
  readonly records: StdioRecord[] = [];
  readonly kill = vi.fn(() => true);

  constructor(handleRecord: (record: StdioRecord, child: FakeCodexProcess) => void) {
    super();
    let buffer = '';
    this.stdin.on('data', (chunk) => {
      buffer += String(chunk);
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) {
          const record = JSON.parse(line) as StdioRecord;
          this.records.push(record);
          handleRecord(record, this);
        }
        newline = buffer.indexOf('\n');
      }
    });
  }

  reply(id: number | string, result: unknown): void {
    this.stdout.write(`${JSON.stringify({ id, result })}\n`);
  }

  replyInFragments(id: number | string, result: unknown): void {
    const line = `${JSON.stringify({ id, result })}\n`;
    const splitAt = Math.max(1, Math.floor(line.length / 2));
    this.stdout.write(line.slice(0, splitAt));
    queueMicrotask(() => this.stdout.write(line.slice(splitAt)));
  }

  requestClient(id: number | string, method: string, params: unknown): void {
    this.stdout.write(`${JSON.stringify({ id, method, params })}\n`);
  }
}

function asChildProcess(child: FakeCodexProcess): ChildProcessWithoutNullStreams {
  return child as unknown as ChildProcessWithoutNullStreams;
}

function useProductionProcess(child: FakeCodexProcess): CodexAppServerAdapter {
  processMocks.spawn.mockReturnValue(asChildProcess(child));
  return createProductionCodexAppServerAdapter();
}

const rawThread = (id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  cwd: '/workspace/project',
  name: `Task ${id}`,
  preview: `Preview ${id}`,
  status: { type: 'idle' },
  turns: [],
  updatedAt: 1_784_105_026,
  ...overrides,
});

describe('CodexAppServerAdapter', () => {
  let rpc: CodexAppServerRpc;
  let request: ReturnType<typeof vi.fn>;
  let adapter: CodexAppServerAdapter;

  beforeEach(() => {
    processMocks.spawn.mockReset();
    request = vi.fn();
    rpc = { request, dispose: vi.fn() };
    adapter = new CodexAppServerAdapter({ rpc, host: 'local-host', pageSize: 2, maxPages: 3 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists active and archived threads through bounded app-server pagination', async () => {
    request
      .mockResolvedValueOnce({ data: [rawThread('active-1')], nextCursor: 'next' })
      .mockResolvedValueOnce({ data: [rawThread('active-2')], nextCursor: null })
      .mockResolvedValueOnce({ data: [rawThread('archived-1')], nextCursor: null });

    const result = await adapter.listThreads({ includeArchived: true, workspace: '/workspace/project' });

    expect(result).toMatchObject({
      schema: 'opl_codex_thread_directory.v1',
      host: 'local-host',
      threads: [
        { id: 'active-1', archived: false },
        { id: 'active-2', archived: false },
        { id: 'archived-1', archived: true, status: 'archived' },
      ],
    });
    expect(request).toHaveBeenNthCalledWith(
      1,
      'thread/list',
      expect.objectContaining({
        cursor: null,
        limit: 2,
        archived: false,
        cwd: '/workspace/project',
        sourceKinds: expect.arrayContaining(['cli', 'appServer', 'subAgentReview']),
      })
    );
    expect(request).toHaveBeenNthCalledWith(2, 'thread/list', expect.objectContaining({ cursor: 'next' }));
    expect(request).toHaveBeenNthCalledWith(3, 'thread/list', expect.objectContaining({ archived: true }));
  });

  it('falls back to a turn-free read for an unmaterialized thread', async () => {
    request.mockImplementation(async (method: string, params: Record<string, unknown>) => {
      if (method === 'thread/read' && params.includeTurns === true) {
        throw new Error('not materialized yet: includeTurns is unavailable before first user message');
      }
      if (method === 'thread/read') return { thread: rawThread('new-thread') };
      if (method === 'thread/goal/get') return { goal: { objective: 'Ship the task' } };
      throw new Error(`Unexpected method: ${method}`);
    });

    const result = await adapter.readThread('new-thread');

    expect(result.thread).toMatchObject({ id: 'new-thread', goal: 'Ship the task' });
    expect(request).toHaveBeenNthCalledWith(1, 'thread/read', {
      threadId: 'new-thread',
      includeTurns: true,
    });
    expect(request).toHaveBeenNthCalledWith(2, 'thread/read', {
      threadId: 'new-thread',
      includeTurns: false,
    });
  });

  it('maps the narrow user-triggered thread lifecycle to app-server methods', async () => {
    request
      .mockResolvedValueOnce({ thread: rawThread('started') })
      .mockResolvedValueOnce({ thread: rawThread('resumed') })
      .mockResolvedValueOnce({ thread: rawThread('forked', { parentThreadId: 'resumed' }) })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ thread: rawThread('resumed') })
      .mockResolvedValueOnce(undefined);

    await adapter.startThread({ workspace: '/workspace/project', model: 'gpt-5' });
    await adapter.resumeThread('resumed');
    await adapter.forkThread('resumed');
    await adapter.renameThread('resumed', 'Renamed task');
    await adapter.updateThreadWorkspace('resumed', '/workspace/next');
    await adapter.archiveThread('resumed');
    await adapter.unarchiveThread('resumed');
    await adapter.deleteThread('resumed');

    expect(request.mock.calls).toEqual([
      ['thread/start', { cwd: '/workspace/project', model: 'gpt-5' }],
      ['thread/resume', { threadId: 'resumed', excludeTurns: false }],
      ['thread/fork', { threadId: 'resumed', excludeTurns: true }],
      ['thread/name/set', { threadId: 'resumed', name: 'Renamed task' }],
      ['thread/settings/update', { threadId: 'resumed', cwd: '/workspace/next' }],
      ['thread/archive', { threadId: 'resumed' }],
      ['thread/unarchive', { threadId: 'resumed' }],
      ['thread/delete', { threadId: 'resumed' }],
    ]);
  });

  it('passes a custom review target through without rewriting its instructions', async () => {
    request.mockResolvedValueOnce({ reviewThreadId: 'review-thread', turn: { id: 'review-turn' } });
    const instructions = 'Review only the Workspace boundary.\nPreserve exact punctuation: []{}.';

    const result = await adapter.startReview({
      threadId: 'thread-current',
      target: { type: 'custom', instructions },
      delivery: 'detached',
    });

    expect(request).toHaveBeenCalledWith('review/start', {
      threadId: 'thread-current',
      target: { type: 'custom', instructions },
      delivery: 'detached',
    });
    expect(result).toEqual({ reviewThreadId: 'review-thread', turnId: 'review-turn' });
  });

  it('rejects malformed review responses instead of reporting success', async () => {
    request.mockResolvedValueOnce({ reviewThreadId: 'review-thread', turn: {} });

    await expect(
      adapter.startReview({
        threadId: 'thread-current',
        target: { type: 'uncommittedChanges' },
        delivery: 'inline',
      })
    ).rejects.toThrow(/review turn id/i);
  });
});

describe('Codex app-server production stdio transport', () => {
  beforeEach(() => {
    processMocks.spawn.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes one process and handles fragmented and coalesced JSONL frames', async () => {
    const child = new FakeCodexProcess((record, process) => {
      if (record.method === 'initialize' && record.id !== undefined) {
        process.replyInFragments(record.id, { userAgent: 'Codex/0.144.3' });
      }
      if (record.method === 'thread/list' && record.id !== undefined) {
        process.stdout.write(
          `${JSON.stringify({ method: 'thread/started', params: { threadId: 'thread-1' } })}\n${JSON.stringify({
            id: record.id,
            result: { data: [], nextCursor: null },
          })}\n`
        );
      }
    });
    const adapter = useProductionProcess(child);

    const result = await adapter.listThreads();
    adapter.dispose();

    expect(processMocks.spawn).toHaveBeenCalledWith(
      '/managed/codex',
      ['app-server', '--stdio'],
      expect.objectContaining({ windowsHide: true })
    );
    expect(child.records.map((record) => record.method)).toEqual(['initialize', 'initialized', 'thread/list']);
    expect(child.records[0]).toMatchObject({
      params: {
        clientInfo: { name: 'opl-aion-shell', title: 'One Person Lab App', version: '1' },
        capabilities: { experimentalApi: true, requestAttestation: false },
      },
    });
    expect(result).toMatchObject({ schema: 'opl_codex_thread_directory.v1', threads: [] });
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it('times out a silent production request without returning partial success', async () => {
    vi.useFakeTimers();
    const child = new FakeCodexProcess((record, process) => {
      if (record.method === 'initialize' && record.id !== undefined) {
        process.reply(record.id, { userAgent: 'Codex/0.144.3' });
      }
    });
    const adapter = useProductionProcess(child);

    const pending = adapter.listThreads();
    const rejection = pending.catch((error: unknown) => error);
    await vi.waitFor(() => expect(child.records.map((record) => record.method)).toContain('thread/list'));
    await vi.advanceTimersByTimeAsync(12_000);
    const error = await rejection;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/timed out.*thread\/list/i);
    adapter.dispose();
  });

  it('rejects pending requests when the production child exits', async () => {
    const child = new FakeCodexProcess((record, process) => {
      if (record.method === 'initialize' && record.id !== undefined) {
        process.reply(record.id, { userAgent: 'Codex/0.144.3' });
      }
      if (record.method === 'thread/list') {
        queueMicrotask(() => process.emit('exit', 17, null));
      }
    });
    const adapter = useProductionProcess(child);

    await expect(adapter.listThreads()).rejects.toThrow(/exited \(code=17, signal=null\)/i);
    adapter.dispose();
  });

  it('rejects unsupported server requests without creating a pending control plane', async () => {
    const child = new FakeCodexProcess((record, process) => {
      if (record.method === 'initialize' && record.id !== undefined) {
        process.reply(record.id, { userAgent: 'Codex/0.144.3' });
      }
      if (record.method === 'thread/list' && record.id !== undefined) {
        process.requestClient('server-request-1', 'item/tool/requestUserInput', {
          threadId: 'thread-1',
          questions: [],
        });
        queueMicrotask(() => process.reply(record.id!, { data: [], nextCursor: null }));
      }
    });
    const adapter = useProductionProcess(child);

    await adapter.listThreads();
    adapter.dispose();

    expect(child.records).toContainEqual({
      id: 'server-request-1',
      error: {
        code: -32601,
        message: 'Unsupported server request: item/tool/requestUserInput',
      },
    });
  });
});
