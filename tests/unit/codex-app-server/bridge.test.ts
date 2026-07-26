import { afterEach, describe, expect, it, vi } from 'vitest';

const bridgeMocks = vi.hoisted(() => {
  const handlers = new Map<string, (request: unknown) => unknown>();
  const provider = (name: string) =>
    vi.fn((handler: (request: unknown) => unknown) => {
      handlers.set(name, handler);
    });
  return {
    handlers,
    appOn: vi.fn(),
    createProductionAdapter: vi.fn(),
    providers: {
      list: provider('list'),
      read: provider('read'),
      start: provider('start'),
      resume: provider('resume'),
      fork: provider('fork'),
      rename: provider('rename'),
      updateSettings: provider('updateSettings'),
      archive: provider('archive'),
      unarchive: provider('unarchive'),
      delete: provider('delete'),
      startReview: provider('startReview'),
    },
  };
});

vi.mock('electron', () => ({
  app: {
    on: bridgeMocks.appOn,
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
  afterEach(() => {
    disposeCodexAppServerBridge();
    bridgeMocks.handlers.clear();
    bridgeMocks.createProductionAdapter.mockReset();
  });

  it('defers the production adapter until the first IPC request', async () => {
    const adapter = {
      listThreads: vi.fn(async () => ({ schema: 'opl_codex_thread_directory.v1', threads: [] })),
      dispose: vi.fn(),
    };
    bridgeMocks.createProductionAdapter.mockReturnValue(adapter);

    initCodexAppServerBridge();

    expect(bridgeMocks.createProductionAdapter).not.toHaveBeenCalled();
    const list = bridgeMocks.handlers.get('list');
    expect(list).toBeTypeOf('function');
    await expect(list?.({ includeArchived: false })).resolves.toMatchObject({
      schema: 'opl_codex_thread_directory.v1',
      threads: [],
    });
    expect(bridgeMocks.createProductionAdapter).toHaveBeenCalledOnce();

    disposeCodexAppServerBridge();
    expect(adapter.dispose).toHaveBeenCalledOnce();
  });
});
