import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CodexAppServerAdapter,
  createProductionCodexAppServerAdapter,
  type CodexAppServerRpc,
} from '@/process/services/codexAppServer/adapter';
import { FileChannelBindingStore, type ChannelBindingStore } from '@/process/services/codexAppServer/channelBindings';
import type { WindowsWslRuntimeExecution } from '@/process/services/runtime-execution';

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
  return createProductionCodexAppServerAdapter({ platform: 'linux' });
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

const resumedThread = (thread: Record<string, unknown>): Record<string, unknown> => ({
  thread,
  model: 'gpt-5.6-sol',
  reasoningEffort: 'high',
  approvalPolicy: 'on-request',
  sandbox: { type: 'workspaceWrite' },
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
      complete: true,
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
        useStateDbOnly: true,
        cwd: '/workspace/project',
      })
    );
    expect(request.mock.calls[0]?.[1]).not.toHaveProperty('sourceKinds');
    expect(request).toHaveBeenNthCalledWith(2, 'thread/list', expect.objectContaining({ cursor: 'next' }));
    expect(request).toHaveBeenNthCalledWith(3, 'thread/list', expect.objectContaining({ archived: true }));
    for (const [method, params] of request.mock.calls) {
      if (method !== 'thread/list') continue;
      expect(params).toMatchObject({ useStateDbOnly: true });
      expect(params).not.toHaveProperty('sourceKinds');
    }
  });

  it('returns the bounded recent directory instead of clearing history when more pages remain', async () => {
    adapter = new CodexAppServerAdapter({ rpc, host: 'local-host', pageSize: 1, maxPages: 2 });
    request
      .mockResolvedValueOnce({ data: [rawThread('recent-1')], nextCursor: 'page-2' })
      .mockResolvedValueOnce({ data: [rawThread('recent-2')], nextCursor: 'page-3' });

    const result = await adapter.listThreads({ includeArchived: false });

    expect(result).toMatchObject({
      complete: false,
      threads: [{ id: 'recent-1' }, { id: 'recent-2' }],
    });
  });

  it('exposes the bounded channel callback over one canonical thread and turn', async () => {
    let notificationHandler: ((method: string, params: unknown) => void) | undefined;
    rpc = {
      request,
      onNotification: (handler) => {
        notificationHandler = handler;
        return vi.fn();
      },
      dispose: vi.fn(),
    };
    const bindingStore = {
      getOrCreate: vi.fn(async (identity, create) => ({
        binding: { ...identity, ...(await create()) },
        created: true,
      })),
      assertKnownThread: vi.fn(async () => undefined),
    } satisfies ChannelBindingStore;
    adapter = new CodexAppServerAdapter({
      rpc,
      host: 'local-host',
      channelWorkspace: '/workspace/channel',
      channelBindingStore: bindingStore,
    });
    request.mockImplementation(async (method: string) => {
      if (method === 'thread/start') return { thread: rawThread('channel-thread', { cwd: '/workspace/channel' }) };
      if (method === 'thread/read') return { thread: rawThread('channel-thread', { cwd: '/workspace/channel' }) };
      if (method === 'thread/resume') return resumedThread(rawThread('channel-thread', { cwd: '/workspace/channel' }));
      if (method === 'thread/goal/get') return { goal: null };
      if (method === 'model/list') return { data: [] };
      if (method === 'turn/start') return { turn: { id: 'turn-1' } };
      throw new Error(`Unexpected method: ${method}`);
    });

    const callback = adapter.createChannelTurnCallback();
    expect(Object.keys(callback).toSorted()).toEqual(['resumeThread', 'startThread', 'startTurn', 'subscribeTurn']);
    const thread = await callback.startThread({
      provider_id: 'opl-channel-weixin',
      account_id: 'account-1',
      channel_session_id: 'session-1',
    });
    expect(thread).toEqual({
      canonical_thread_host: 'local-host',
      canonical_thread_id: 'channel-thread',
    });
    expect(bindingStore.getOrCreate).toHaveBeenCalledOnce();

    await callback.resumeThread(thread);
    const turn = await callback.startTurn({ ...thread, text: 'Hello from WeChat' });
    const onTerminal = vi.fn();
    callback.subscribeTurn(turn, { onTerminal });
    notificationHandler?.('item/agentMessage/delta', {
      threadId: 'channel-thread',
      turnId: 'turn-1',
      itemId: 'message-1',
      delta: 'Hello back',
    });
    notificationHandler?.('turn/completed', {
      threadId: 'channel-thread',
      turnId: 'turn-1',
      turn: { id: 'turn-1', status: 'completed' },
    });

    expect(onTerminal).toHaveBeenCalledWith({
      canonical_thread_host: 'local-host',
      canonical_thread_id: 'channel-thread',
      canonical_turn_id: 'turn-1',
      status: 'completed',
      response_text: 'Hello back',
    });
    await expect(callback.resumeThread({ ...thread, canonical_thread_host: 'other-host' })).rejects.toThrow(
      /different Codex app-server host/
    );
    await expect(
      callback.startTurn({ ...thread, canonical_thread_host: 'other-host', text: 'blocked' })
    ).rejects.toThrow(/different Codex app-server host/);
  });

  it('recovers an exact persisted channel binding before starting another thread', async () => {
    const binding = {
      provider_id: 'opl-channel-weixin',
      account_id: 'account-1',
      channel_session_id: 'session-1',
      canonical_thread_host: 'local-host',
      canonical_thread_id: 'existing-thread',
    };
    const bindingStore = {
      getOrCreate: vi.fn(async () => ({ binding, created: false })),
      assertKnownThread: vi.fn(async () => undefined),
    } satisfies ChannelBindingStore;
    adapter = new CodexAppServerAdapter({
      rpc,
      host: 'local-host',
      channelWorkspace: '/workspace/channel',
      channelBindingStore: bindingStore,
    });
    request.mockImplementation(async (method: string) => {
      if (method === 'thread/read') return { thread: rawThread('existing-thread') };
      if (method === 'thread/resume') return resumedThread(rawThread('existing-thread'));
      if (method === 'thread/goal/get') return { goal: null };
      if (method === 'model/list') return { data: [] };
      throw new Error(`Unexpected method: ${method}`);
    });

    await expect(adapter.createChannelTurnCallback().startThread(binding)).resolves.toEqual({
      canonical_thread_host: 'local-host',
      canonical_thread_id: 'existing-thread',
    });
    expect(request.mock.calls.map(([method]) => method)).not.toContain('thread/start');
    expect(request.mock.calls.map(([method]) => method)).toContain('thread/resume');
    expect(bindingStore.getOrCreate).toHaveBeenCalledOnce();
  });

  it('serializes exact channel binding creation and fails closed on damaged state', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'opl-channel-bindings-'));
    const file = path.join(directory, 'bindings.json');
    const identity = {
      provider_id: 'opl-channel-weixin',
      account_id: 'account-1',
      channel_session_id: 'session-1',
    };
    try {
      const firstProcess = new FileChannelBindingStore(file);
      const create = vi.fn(async () => ({
        canonical_thread_host: 'local-host',
        canonical_thread_id: 'thread-1',
      }));
      const [first, concurrent] = await Promise.all([
        firstProcess.getOrCreate(identity, create),
        firstProcess.getOrCreate(identity, create),
      ]);
      expect(create).toHaveBeenCalledOnce();
      expect([first.created, concurrent.created].toSorted()).toEqual([false, true]);
      const restartedProcess = new FileChannelBindingStore(file);
      await expect(restartedProcess.assertKnownThread(first.binding)).resolves.toBeUndefined();
      await expect(restartedProcess.getOrCreate({ ...identity, account_id: ' account-1' }, create)).rejects.toThrow(
        /Invalid channel binding account_id/
      );
      if (process.platform !== 'win32') {
        expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
      }
      await fs.writeFile(file, '{broken', 'utf8');
      await expect(restartedProcess.assertKnownThread(first.binding)).rejects.toThrow();
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it('uses thread/list fields without hydrating every active thread', async () => {
    request.mockResolvedValueOnce({
      data: [
        rawThread('active-1', {
          status: { type: 'active' },
          turns: [{ id: 'turn-1', status: 'inProgress', items: [] }],
        }),
        rawThread('active-2', { status: { type: 'active' } }),
      ],
      nextCursor: null,
    });

    const result = await adapter.listThreads({ includeArchived: false });

    expect(result.threads).toMatchObject([
      { id: 'active-1', status: 'running', activeTurnId: 'turn-1' },
      { id: 'active-2', status: 'running', activeTurnId: null },
    ]);
    expect(request.mock.calls.map(([method]) => method)).toEqual(['thread/list']);
  });

  it('repairs an OPL-injected canonical title from the original user prompt', async () => {
    const pollutedTitle = '[Assistant Rules] OPL App 会话上下文';
    const injectedPrompt = '[Assistant Rules]\n## OPL App 会话上下文\n\nOPL routes.\n[/Assistant Rules]\n\n测试';
    request.mockImplementation(async (method: string, params: Record<string, unknown>) => {
      if (method === 'thread/list') {
        return { data: [rawThread('opl-thread', { name: pollutedTitle })], nextCursor: null };
      }
      if (method === 'thread/read') {
        const renamed = request.mock.calls.some(
          ([calledMethod, calledParams]) =>
            calledMethod === 'thread/name/set' && (calledParams as Record<string, unknown>).threadId === 'opl-thread'
        );
        return {
          thread: rawThread('opl-thread', {
            name: renamed ? '测试' : pollutedTitle,
            turns: [
              {
                id: 'turn-1',
                status: 'completed',
                items: [{ id: 'message-1', type: 'userMessage', content: [{ type: 'text', text: injectedPrompt }] }],
              },
            ],
          }),
        };
      }
      if (method === 'thread/name/set') return undefined;
      throw new Error(`Unexpected method: ${method} ${JSON.stringify(params)}`);
    });

    const result = await adapter.listThreads({ includeArchived: false });

    expect(request).toHaveBeenCalledWith('thread/name/set', { threadId: 'opl-thread', name: '测试' });
    expect(result.threads[0]?.title).toBe('测试');
  });

  it('recognizes the localized English session heading before the title reaches the OPL App sentence', async () => {
    const pollutedTitle = '[Assistant Rules] About this conversation';
    const injectedPrompt =
      '[Assistant Rules]\n## About this conversation\n\nThis conversation was started from One Person Lab App.\n[/Assistant Rules]\n\nFix history';
    request.mockImplementation(async (method: string) => {
      if (method === 'thread/list') {
        return { data: [rawThread('english-opl-thread', { name: pollutedTitle })], nextCursor: null };
      }
      if (method === 'thread/read') {
        const renamed = request.mock.calls.some(([calledMethod]) => calledMethod === 'thread/name/set');
        return {
          thread: rawThread('english-opl-thread', {
            name: renamed ? 'Fix history' : pollutedTitle,
            turns: [
              {
                id: 'turn-1',
                status: 'completed',
                items: [{ id: 'message-1', type: 'userMessage', content: [{ type: 'text', text: injectedPrompt }] }],
              },
            ],
          }),
        };
      }
      if (method === 'thread/name/set') return undefined;
      throw new Error(`Unexpected method: ${method}`);
    });

    const result = await adapter.listThreads({ includeArchived: false });

    expect(request).toHaveBeenCalledWith('thread/name/set', {
      threadId: 'english-opl-thread',
      name: 'Fix history',
    });
    expect(result.threads[0]?.title).toBe('Fix history');
  });

  it('projects only explicit project ids and keeps recorded cwd independent', async () => {
    const managedProjectlessWorkspace = '/Users/example/Documents/Codex/2026-07-28/temporary-task';
    request.mockResolvedValueOnce({
      data: [
        rawThread('normal-cwd', {
          cwd: '/workspace/runtime-only',
          gitInfo: { originUrl: 'https://example.com/shared.git' },
        }),
        rawThread('bound', {
          cwd: '/workspace/runtime-scratch',
          projectId: '/projects/selected',
          gitInfo: { originUrl: 'https://example.com/shared.git' },
        }),
        rawThread('projectless', {
          cwd: undefined,
          gitInfo: { originUrl: 'https://example.com/shared.git' },
        }),
        rawThread('managed-projectless', {
          cwd: managedProjectlessWorkspace,
          gitInfo: { originUrl: 'https://example.com/shared.git' },
        }),
      ],
      nextCursor: null,
    });

    const result = await adapter.listThreads({ includeArchived: false });

    expect(result.threads).toMatchObject([
      { id: 'normal-cwd', projectId: '', workspace: '/workspace/runtime-only' },
      { id: 'bound', projectId: '/projects/selected', workspace: '/workspace/runtime-scratch' },
      { id: 'projectless', projectId: '', workspace: '' },
      { id: 'managed-projectless', projectId: '', workspace: managedProjectlessWorkspace },
    ]);
  });

  it('assigns explicit project affinity once without changing the recorded cwd', async () => {
    const runtimeWorkspace = '/Users/example/Documents/Codex/2026-07-28/temporary-task';
    request.mockImplementation(async (method: string) => {
      if (method === 'thread/read') {
        return { thread: rawThread('projectless', { cwd: runtimeWorkspace }) };
      }
      if (method === 'thread/goal/get') return { goal: null };
      throw new Error(`Unexpected method: ${method}`);
    });

    const assigned = await adapter.assignProjectAffinity('projectless', '/projects/selected');
    const readback = await adapter.readThread('projectless');

    expect(assigned).toMatchObject({
      id: 'projectless',
      projectId: '/projects/selected',
      workspace: runtimeWorkspace,
    });
    expect(readback.thread).toMatchObject({
      id: 'projectless',
      projectId: '/projects/selected',
      workspace: runtimeWorkspace,
    });
    expect(request.mock.calls.map(([method]) => method)).not.toContain('thread/settings/update');
  });

  it('rejects project affinity reassignment', async () => {
    request.mockResolvedValue({ thread: rawThread('bound', { projectId: '/projects/original' }) });

    await expect(adapter.assignProjectAffinity('bound', '/projects/replacement')).rejects.toThrow(
      'already has explicit project affinity'
    );
  });

  it('rejects malformed canonical cwd instead of treating it as projectless', async () => {
    request.mockResolvedValueOnce({
      data: [rawThread('malformed-cwd', { cwd: 42 })],
      nextCursor: null,
    });

    await expect(adapter.listThreads({ includeArchived: false })).rejects.toThrow(
      'Invalid Codex app-server thread cwd.'
    );
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

  it('rejects a malformed cwd returned by canonical thread read', async () => {
    request.mockResolvedValueOnce({ thread: rawThread('malformed-read-cwd', { cwd: { path: '/workspace' } }) });

    await expect(adapter.readThread('malformed-read-cwd')).rejects.toThrow('Invalid Codex app-server thread cwd.');
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
    await adapter.updateThreadSettings('resumed', '/workspace/next');
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

  it('continues a canonical thread through turn/start with OPL model, effort, permission, and files', async () => {
    request.mockImplementation(async (method: string) => {
      if (method === 'thread/resume') return resumedThread(rawThread('thread-1'));
      if (method === 'thread/read') return { thread: rawThread('thread-1') };
      if (method === 'thread/goal/get') return { goal: null };
      if (method === 'turn/start') return { turn: { id: 'turn-1' } };
      throw new Error(`Unexpected method: ${method}`);
    });

    const result = await adapter.startTurn({
      threadId: 'thread-1',
      conversationId: 'conversation-1',
      msgId: 'message-1',
      input: 'Continue the task',
      files: ['/workspace/project/report.pdf'],
      model: 'gpt-5.6-sol',
      effort: 'high',
      permissionMode: 'read-only',
    });

    expect(result).toEqual({ msgId: 'message-1', turnId: 'turn-1' });
    expect(request).toHaveBeenCalledWith(
      'turn/start',
      expect.objectContaining({
        threadId: 'thread-1',
        clientUserMessageId: 'message-1',
        model: 'gpt-5.6-sol',
        effort: 'high',
        approvalPolicy: 'on-request',
        sandboxPolicy: { type: 'readOnly', networkAccess: true },
        input: [
          { type: 'text', text: 'Continue the task', text_elements: [] },
          { type: 'mention', name: 'report.pdf', path: '/workspace/project/report.pdf' },
        ],
      })
    );
  });

  it('reserves the canonical thread before async resume and rejects a concurrent second turn', async () => {
    let releaseResume: (() => void) | undefined;
    const resumeGate = new Promise<void>((resolve) => {
      releaseResume = resolve;
    });
    request.mockImplementation(async (method: string) => {
      if (method === 'thread/resume') {
        await resumeGate;
        return resumedThread(rawThread('thread-1'));
      }
      if (method === 'thread/read') return { thread: rawThread('thread-1') };
      if (method === 'thread/goal/get') return { goal: null };
      if (method === 'turn/start') return { turn: { id: 'turn-1' } };
      throw new Error(`Unexpected method: ${method}`);
    });
    const turn = {
      threadId: 'thread-1',
      conversationId: 'conversation-1',
      msgId: 'message-1',
      input: 'First',
    };

    const firstTurn = adapter.startTurn(turn);
    await expect(adapter.startTurn({ ...turn, msgId: 'message-2', input: 'Second' })).rejects.toThrow(
      'already has an active turn'
    );
    releaseResume?.();
    await firstTurn;
    expect(request.mock.calls.filter(([method]) => method === 'turn/start')).toHaveLength(1);
  });

  it('keeps the turn reservation while a background read hydrates the same thread', async () => {
    let releaseTurn: (() => void) | undefined;
    const turnGate = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });
    request.mockImplementation(async (method: string) => {
      if (method === 'thread/resume') return resumedThread(rawThread('thread-1'));
      if (method === 'model/list') return { data: [] };
      if (method === 'thread/goal/get') return { goal: null };
      if (method === 'turn/start') {
        await turnGate;
        return { turn: { id: 'turn-1' } };
      }
      throw new Error(`Unexpected method: ${method}`);
    });
    const turn = {
      threadId: 'thread-1',
      conversationId: 'conversation-1',
      msgId: 'message-1',
      input: 'First',
    };

    const firstTurn = adapter.startTurn(turn);
    await vi.waitFor(() => expect(request.mock.calls.some(([method]) => method === 'turn/start')).toBe(true));
    await adapter.readThread('thread-1', 'conversation-1');
    await expect(adapter.startTurn({ ...turn, msgId: 'message-2', input: 'Second' })).rejects.toThrow(
      'already has an active turn'
    );

    releaseTurn?.();
    await firstTurn;
    expect(request.mock.calls.filter(([method]) => method === 'turn/start')).toHaveLength(1);
  });

  it('restores history and live routing from thread/read after an adapter restart', async () => {
    request.mockImplementation(async (method: string) => {
      if (method === 'thread/resume') {
        return resumedThread(
          rawThread('thread-1', {
            status: { type: 'active' },
            turns: [
              {
                id: 'turn-1',
                status: 'inProgress',
                startedAt: 1_784_105_000,
                items: [
                  { id: 'user-1', type: 'userMessage', content: [{ type: 'text', text: 'Continue' }] },
                  { id: 'assistant-1', type: 'agentMessage', text: 'Working' },
                  {
                    id: 'command-1',
                    type: 'commandExecution',
                    command: 'bun test',
                    status: 'completed',
                    aggregatedOutput: 'ok',
                    exitCode: 0,
                  },
                ],
              },
            ],
          })
        );
      }
      if (method === 'thread/read') {
        return {
          thread: rawThread('thread-1', {
            status: { type: 'active' },
            turns: [
              {
                id: 'turn-1',
                status: 'inProgress',
                startedAt: 1_784_105_000,
                items: [
                  { id: 'user-1', type: 'userMessage', content: [{ type: 'text', text: 'Continue' }] },
                  { id: 'assistant-1', type: 'agentMessage', text: 'Working' },
                  {
                    id: 'command-1',
                    type: 'commandExecution',
                    command: 'bun test',
                    status: 'completed',
                    aggregatedOutput: 'ok',
                    exitCode: 0,
                  },
                ],
              },
            ],
          }),
        };
      }
      if (method === 'thread/goal/get') return { goal: null };
      if (method === 'turn/interrupt') return undefined;
      throw new Error(`Unexpected method: ${method}`);
    });

    const detail = await adapter.readThread('thread-1', 'conversation-1');
    expect(detail.thread.activeTurnId).toBe('turn-1');
    expect(detail.history).toMatchObject([
      { id: 'user-1', role: 'user', kind: 'text', text: 'Continue' },
      { id: 'assistant-1', role: 'assistant', kind: 'text', text: 'Working' },
      { id: 'command-1', role: 'tool', kind: 'tool', text: 'bun test' },
    ]);
    await adapter.interruptTurn({
      threadId: 'thread-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
    });
    expect(request).toHaveBeenCalledWith('turn/interrupt', { threadId: 'thread-1', turnId: 'turn-1' });
  });

  it('configures model, reasoning, and permissions and returns canonical readback', async () => {
    let resumeCount = 0;
    request.mockImplementation(async (method: string) => {
      if (method === 'thread/settings/update') return undefined;
      if (method === 'thread/resume') {
        resumeCount += 1;
        return resumeCount === 1
          ? resumedThread(rawThread('thread-1'))
          : {
              thread: rawThread('thread-1'),
              model: 'gpt-5.6-terra',
              reasoningEffort: 'medium',
              approvalPolicy: 'never',
              sandbox: { type: 'dangerFullAccess' },
            };
      }
      if (method === 'model/list') return { data: [] };
      if (method === 'thread/goal/get') return { goal: null };
      throw new Error(`Unexpected method: ${method}`);
    });

    await adapter.readThread('thread-1', 'conversation-1');
    const detail = await adapter.configureThread({
      threadId: 'thread-1',
      model: 'gpt-5.6-terra',
      effort: 'medium',
      permissionMode: 'full-access',
    });

    expect(request).toHaveBeenCalledWith('thread/settings/update', {
      threadId: 'thread-1',
      model: 'gpt-5.6-terra',
      effort: 'medium',
      approvalPolicy: 'never',
      sandboxPolicy: { type: 'dangerFullAccess' },
    });
    expect(detail.settings).toEqual({
      model: 'gpt-5.6-terra',
      effort: 'medium',
      permissionMode: 'full-access',
    });
  });

  it('projects app-server approvals and returns the selected decision to the pending request', async () => {
    let serverRequestHandler: ((requestId: number | string, method: string, params: unknown) => boolean) | undefined;
    const respond = vi.fn();
    rpc = {
      request,
      onServerRequest: (handler) => {
        serverRequestHandler = handler;
        return vi.fn();
      },
      respond,
      dispose: vi.fn(),
    };
    adapter = new CodexAppServerAdapter({ rpc, host: 'local-host' });
    const response = vi.fn();
    adapter.setEventSink({ response, turnCompleted: vi.fn() });
    request.mockImplementation(async (method: string) => {
      if (method === 'thread/resume') return resumedThread(rawThread('thread-1'));
      if (method === 'model/list') return { data: [] };
      if (method === 'thread/goal/get') return { goal: null };
      throw new Error(`Unexpected method: ${method}`);
    });
    await adapter.readThread('thread-1', 'conversation-1');

    const handled = serverRequestHandler?.('approval-1', 'item/commandExecution/requestApproval', {
      threadId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'command-1',
      command: 'bun test',
      reason: 'Run focused tests',
      availableDecisions: ['accept', 'decline'],
    });

    expect(handled).toBe(true);
    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'acp_permission',
        data: expect.objectContaining({
          options: [
            expect.objectContaining({ option_id: 'accept', kind: 'allow_once' }),
            expect.objectContaining({ option_id: 'decline', kind: 'reject_once' }),
          ],
          tool_call: expect.objectContaining({
            tool_call_id: 'approval-1',
            kind: 'execute',
            status: 'pending',
          }),
        }),
      })
    );
    expect(adapter.listPendingApprovals('thread-1', 'conversation-1')).toEqual([
      expect.objectContaining({
        type: 'acp_permission',
        data: expect.objectContaining({
          tool_call: expect.objectContaining({
            tool_call_id: 'approval-1',
            title: 'Run focused tests',
          }),
        }),
      }),
    ]);

    await adapter.respondApproval({ requestId: 'approval-1', decision: 'accept' });
    expect(respond).toHaveBeenCalledWith('approval-1', { decision: 'accept' });
    expect(adapter.listPendingApprovals('thread-1', 'conversation-1')).toEqual([]);
    await expect(adapter.respondApproval({ requestId: 'approval-1', decision: 'decline' })).rejects.toThrow(
      'no longer pending'
    );
  });

  it('preserves official app-server MCP form content and persistence semantics', async () => {
    let serverRequestHandler: ((requestId: number | string, method: string, params: unknown) => boolean) | undefined;
    const respond = vi.fn();
    rpc = {
      request,
      onServerRequest: (handler) => {
        serverRequestHandler = handler;
        return vi.fn();
      },
      respond,
      dispose: vi.fn(),
    };
    adapter = new CodexAppServerAdapter({ rpc, host: 'local-host' });
    const response = vi.fn();
    adapter.setEventSink({ response, turnCompleted: vi.fn() });
    request.mockImplementation(async (method: string) => {
      if (method === 'thread/resume') return resumedThread(rawThread('thread-1'));
      if (method === 'model/list') return { data: [] };
      if (method === 'thread/goal/get') return { goal: null };
      throw new Error(`Unexpected method: ${method}`);
    });
    await adapter.readThread('thread-1', 'conversation-1');

    expect(
      serverRequestHandler?.('elicitation-1', 'mcpServer/elicitation/request', {
        threadId: 'thread-1',
        turnId: 'turn-1',
        serverName: 'weather',
        mode: 'form',
        message: 'Allow the weather lookup?',
        requestedSchema: {
          type: 'object',
          properties: { city: { type: 'string', title: 'City' } },
          required: ['city'],
        },
        _meta: {
          codex_approval_kind: 'mcp_tool_call',
          persist: ['session', 'always'],
        },
      })
    ).toBe(true);
    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'acp_permission',
        data: expect.objectContaining({
          options: [
            expect.objectContaining({ option_id: 'accept' }),
            expect.objectContaining({ option_id: 'acceptForSession' }),
            expect.objectContaining({ option_id: 'acceptAlways' }),
            expect.objectContaining({ option_id: 'decline' }),
            expect.objectContaining({ option_id: 'cancel' }),
          ],
          tool_call: expect.objectContaining({
            tool_call_id: 'elicitation-1',
            title: 'MCP weather requests input',
            kind: 'fetch',
          }),
        }),
      })
    );

    await adapter.respondApproval({
      requestId: 'elicitation-1',
      decision: 'acceptForSession',
      content: { city: 'Paris' },
    });
    expect(respond).toHaveBeenCalledWith('elicitation-1', {
      action: 'accept',
      content: { city: 'Paris' },
      _meta: { persist: 'session' },
    });
  });

  it('answers request_user_input and grants only the requested permission profile', async () => {
    let serverRequestHandler: ((requestId: number | string, method: string, params: unknown) => boolean) | undefined;
    const respond = vi.fn();
    rpc = {
      request,
      onServerRequest: (handler) => {
        serverRequestHandler = handler;
        return vi.fn();
      },
      respond,
      dispose: vi.fn(),
    };
    adapter = new CodexAppServerAdapter({ rpc, host: 'local-host' });
    const response = vi.fn();
    adapter.setEventSink({ response, turnCompleted: vi.fn() });
    request.mockImplementation(async (method: string) => {
      if (method === 'thread/resume') return resumedThread(rawThread('thread-1'));
      if (method === 'model/list') return { data: [] };
      if (method === 'thread/goal/get') return { goal: null };
      throw new Error(`Unexpected method: ${method}`);
    });
    await adapter.readThread('thread-1', 'conversation-1');

    expect(
      serverRequestHandler?.('input-1', 'item/tool/requestUserInput', {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'input-item-1',
        questions: [
          {
            id: 'choice',
            header: 'Choose',
            question: 'Which route?',
            isOther: true,
            isSecret: false,
            options: [{ label: 'Adapter', description: 'Keep the owner boundary' }],
          },
        ],
      })
    ).toBe(true);
    expect(response).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tool_call: expect.objectContaining({
            raw_input: expect.objectContaining({
              codex_interaction: expect.objectContaining({
                kind: 'request_user_input',
                questions: [expect.objectContaining({ id: 'choice' })],
              }),
            }),
          }),
        }),
      })
    );
    await adapter.respondApproval({
      requestId: 'input-1',
      decision: 'accept',
      answers: { choice: { answers: ['Adapter'] } },
    });
    expect(respond).toHaveBeenCalledWith('input-1', {
      answers: { choice: { answers: ['Adapter'] } },
    });

    expect(
      serverRequestHandler?.('permissions-1', 'item/permissions/requestApproval', {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'permissions-item-1',
        cwd: '/workspace/project',
        reason: 'Read a shared input',
        permissions: {
          network: null,
          fileSystem: { read: ['/workspace/shared'], write: null },
        },
      })
    ).toBe(true);
    await adapter.respondApproval({
      requestId: 'permissions-1',
      decision: 'acceptForSession',
    });
    expect(respond).toHaveBeenCalledWith('permissions-1', {
      permissions: {
        fileSystem: { read: ['/workspace/shared'], write: null },
      },
      scope: 'session',
    });
  });

  it('projects command, MCP, file diff, and terminal turn notifications to the conversation', async () => {
    let notificationHandler: ((method: string, params: unknown) => void) | undefined;
    rpc = {
      request,
      onNotification: (handler) => {
        notificationHandler = handler;
        return vi.fn();
      },
      dispose: vi.fn(),
    };
    adapter = new CodexAppServerAdapter({ rpc, host: 'local-host' });
    const response = vi.fn();
    const turnCompleted = vi.fn();
    adapter.setEventSink({ response, turnCompleted });
    request.mockImplementation(async (method: string) => {
      if (method === 'thread/resume') return resumedThread(rawThread('thread-1'));
      if (method === 'model/list') return { data: [] };
      if (method === 'thread/goal/get') return { goal: null };
      throw new Error(`Unexpected method: ${method}`);
    });
    await adapter.readThread('thread-1', 'conversation-1');

    notificationHandler?.('item/commandExecution/outputDelta', {
      threadId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'command-1',
      delta: 'test output',
    });
    notificationHandler?.('item/mcpToolCall/progress', {
      threadId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'mcp-1',
      message: 'tool progress',
    });
    notificationHandler?.('item/fileChange/patchUpdated', {
      threadId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'file-1',
      changes: [{ path: 'src/example.ts', diff: '@@ -1 +1 @@\n-old\n+new' }],
    });
    notificationHandler?.('item/completed', {
      threadId: 'thread-1',
      turnId: 'turn-1',
      item: {
        id: 'mcp-result-1',
        type: 'mcpToolCall',
        server: 'weather',
        tool: 'forecast',
        status: 'completed',
        arguments: { city: 'Paris' },
        result: {
          content: [
            { type: 'text', text: 'Sunny' },
            { type: 'image', data: 'not-projected', mimeType: 'image/png' },
          ],
          structuredContent: { temperature: 21 },
        },
      },
    });
    notificationHandler?.('item/completed', {
      threadId: 'thread-1',
      turnId: 'turn-1',
      item: {
        id: 'collab-1',
        type: 'collabAgentToolCall',
        tool: 'spawnAgent',
        status: 'completed',
        senderThreadId: 'thread-1',
        receiverThreadIds: ['thread-child'],
        model: 'gpt-5.6-sol',
        reasoningEffort: 'high',
        agentsStates: { 'thread-child': { status: 'completed', message: 'Done' } },
      },
    });
    notificationHandler?.('item/completed', {
      threadId: 'thread-1',
      turnId: 'turn-1',
      item: {
        id: 'image-1',
        type: 'imageGeneration',
        status: 'completed',
        result: 'base64-omitted',
        savedPath: '/workspace/result.png',
      },
    });
    notificationHandler?.('turn/completed', {
      threadId: 'thread-1',
      turnId: 'turn-1',
      turn: { id: 'turn-1', status: 'completed' },
    });

    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'acp_tool_call',
        data: expect.objectContaining({
          update: expect.objectContaining({
            tool_call_id: 'command-1',
            kind: 'execute',
            rawOutput: { aggregatedOutput: 'test output' },
          }),
        }),
      })
    );
    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'acp_tool_call',
        data: expect.objectContaining({
          update: expect.objectContaining({
            tool_call_id: 'mcp-1',
            kind: 'fetch',
            rawOutput: { aggregatedOutput: 'tool progress' },
          }),
        }),
      })
    );
    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'acp_tool_call',
        data: expect.objectContaining({
          update: expect.objectContaining({
            tool_call_id: 'file-1',
            kind: 'edit',
            content: [
              {
                type: 'diff',
                path: 'src/example.ts',
                old_text: '',
                new_text: '@@ -1 +1 @@\n-old\n+new',
              },
            ],
          }),
        }),
      })
    );
    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'acp_tool_call',
        data: expect.objectContaining({
          update: expect.objectContaining({
            tool_call_id: 'mcp-result-1',
            rawInput: { city: 'Paris' },
            rawOutput: {
              aggregatedOutput: 'Sunny\n![MCP image](data:image/png;base64,not-projected)\n{\n  "temperature": 21\n}',
            },
            content: [
              {
                type: 'content',
                content: {
                  type: 'text',
                  text: 'Sunny\n![MCP image](data:image/png;base64,not-projected)\n{\n  "temperature": 21\n}',
                },
              },
            ],
          }),
        }),
      })
    );
    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'acp_tool_call',
        data: expect.objectContaining({
          update: expect.objectContaining({
            tool_call_id: 'collab-1',
            _meta: {
              codex: {
                collaboration: {
                  tool: 'spawnAgent',
                  senderThreadId: 'thread-1',
                  receiverThreadIds: ['thread-child'],
                },
              },
            },
          }),
        }),
      })
    );
    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'acp_tool_call',
        data: expect.objectContaining({
          update: expect.objectContaining({
            tool_call_id: 'image-1',
            rawOutput: { aggregatedOutput: '/workspace/result.png' },
          }),
        }),
      })
    );
    expect(response).toHaveBeenCalledWith(expect.objectContaining({ type: 'finish', turn_id: 'turn-1' }));
    expect(turnCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: 'conversation-1',
        turn_id: 'turn-1',
        state: 'ai_waiting_input',
        can_send_message: true,
      })
    );
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

  it('uses the owner-bound Linux Codex process on Windows without resolving or spawning a native CLI', async () => {
    const child = new FakeCodexProcess((record, process) => {
      if (record.method === 'initialize' && record.id !== undefined) {
        process.reply(record.id, { userAgent: 'Codex/0.144.6' });
      }
      if (record.method === 'thread/list' && record.id !== undefined) {
        process.reply(record.id, { data: [], nextCursor: null });
      }
    });
    const terminate = vi.fn(async () => {});
    const windowsRuntime = {
      spawn: vi.fn(() => ({
        child: asChildProcess(child),
        operationToken: 'codex-app-server-test',
        terminate,
      })),
    } as unknown as WindowsWslRuntimeExecution;
    const adapter = createProductionCodexAppServerAdapter({
      platform: 'win32',
      windowsRuntime,
    });

    await adapter.listThreads();
    adapter.dispose();

    expect(windowsRuntime.spawn).toHaveBeenCalledWith({
      program: 'codex-app-server',
      args: ['app-server', '--stdio'],
    });
    expect(processMocks.spawn).not.toHaveBeenCalled();
    expect(terminate).toHaveBeenCalledWith(5000);
  });
});
