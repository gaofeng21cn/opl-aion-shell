import { afterEach, describe, expect, it, vi } from 'vitest';

const bridgeMocks = vi.hoisted(() => {
  const handlers = new Map<string, (request: unknown) => unknown>();
  const provider = (name: string) =>
    vi.fn((handler: (request: unknown) => unknown) => {
      handlers.set(name, handler);
    });
  return {
    handlers,
    appWhenReady: vi.fn(async () => undefined),
    createProductionAdapter: vi.fn(),
    providers: {
      list: provider('list'),
      read: provider('read'),
      start: provider('start'),
      resume: provider('resume'),
      fork: provider('fork'),
      rename: provider('rename'),
      updateSettings: provider('updateSettings'),
      configure: provider('configure'),
      assignProjectAffinity: provider('assignProjectAffinity'),
      archive: provider('archive'),
      unarchive: provider('unarchive'),
      delete: provider('delete'),
      startReview: provider('startReview'),
      startTurn: provider('startTurn'),
      interruptTurn: provider('interruptTurn'),
      respondApproval: provider('respondApproval'),
      pendingApprovals: provider('pendingApprovals'),
      responseStream: { emit: vi.fn() },
      turnCompleted: { emit: vi.fn() },
    },
  };
});

vi.mock('electron', () => ({
  app: {
    whenReady: bridgeMocks.appWhenReady,
    getPath: vi.fn(() => '/app/user-data'),
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    codexThreads: Object.fromEntries(
      Object.entries(bridgeMocks.providers).map(([name, provider]) => [name, { provider }])
    ),
  },
}));

vi.mock('@/process/services/codexAppServer/adapter', () => ({
  createProductionCodexAppServerAdapter: bridgeMocks.createProductionAdapter,
}));

import { disposeCodexAppServerBridge, initCodexAppServerBridge } from '@/process/bridge/codexAppServerBridge';

describe('codexAppServerBridge', () => {
  afterEach(async () => {
    await disposeCodexAppServerBridge();
    bridgeMocks.handlers.clear();
    bridgeMocks.createProductionAdapter.mockReset();
  });

  it('starts the App Server adapter without activating the Framework channel-provider Host', async () => {
    const adapter = {
      listThreads: vi.fn(async () => ({ schema: 'opl_codex_thread_directory.v1', threads: [] })),
      setEventSink: vi.fn(),
      dispose: vi.fn(),
    };
    initCodexAppServerBridge(adapter as never);

    const list = bridgeMocks.handlers.get('list');
    expect(list).toBeTypeOf('function');
    await expect(list?.({ includeArchived: false })).resolves.toMatchObject({
      schema: 'opl_codex_thread_directory.v1',
      threads: [],
    });
    await disposeCodexAppServerBridge();
    expect(bridgeMocks.createProductionAdapter).not.toHaveBeenCalled();
    expect(adapter.dispose).toHaveBeenCalledOnce();
  });

  it('routes explicit affinity assignment to the adapter', async () => {
    const assigned = { id: 'thread-1', projectId: '/projects/selected', workspace: '/runtime/cwd' };
    const adapter = {
      assignProjectAffinity: vi.fn(async () => assigned),
      setEventSink: vi.fn(),
      dispose: vi.fn(),
    };
    bridgeMocks.createProductionAdapter.mockReturnValue(adapter);
    initCodexAppServerBridge(adapter as never);

    const assign = bridgeMocks.handlers.get('assignProjectAffinity');
    await expect(assign?.({ threadId: 'thread-1', projectId: '/projects/selected' })).resolves.toBe(assigned);
    expect(adapter.assignProjectAffinity).toHaveBeenCalledWith('thread-1', '/projects/selected');
  });

  it('disposes the active App Server adapter', async () => {
    const adapter = {
      setEventSink: vi.fn(),
      dispose: vi.fn(),
    };
    initCodexAppServerBridge(adapter as never);

    await disposeCodexAppServerBridge();
    expect(adapter.dispose).toHaveBeenCalledOnce();
  });
});
