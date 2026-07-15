import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CodexAppServerAdapter, type CodexAppServerRpc } from '@/process/services/codexAppServer/adapter';

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
    request = vi.fn();
    rpc = { request, dispose: vi.fn() };
    adapter = new CodexAppServerAdapter({ rpc, host: 'local-host', pageSize: 2, maxPages: 3 });
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
