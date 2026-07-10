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

  it('forwards assistant identity on conversation creation', async () => {
    const { conversation } = await import('@/common/adapter/ipcBridge');

    await conversation.create.invoke({
      type: 'acp',
      name: 'Assistant conversation',
      model: {} as never,
      assistant: { id: 'assistant-codex', locale: 'zh-CN' },
      extra: { workspace: '/tmp/project' },
    });

    expect(httpBridgeMocks.calls.at(-1)).toEqual({
      method: 'POST',
      path: '/api/conversations',
      body: {
        type: undefined,
        name: 'Assistant conversation',
        assistant: { id: 'assistant-codex', locale: 'zh-CN' },
        extra: { workspace: '/tmp/project' },
      },
    });
  });

  it('uses dedicated Channel assistant settings endpoints with canonical identity only', async () => {
    const { channel } = await import('@/common/adapter/ipcBridge');

    await channel.getPlatformSettings.invoke({ platform: 'telegram' });
    await channel.setAssistantSetting.invoke({
      platform: 'telegram',
      assistant: { assistant_id: 'assistant-codex' },
    });

    expect(httpBridgeMocks.calls.slice(-2)).toEqual([
      { method: 'GET', path: '/api/channel/settings/telegram', body: undefined },
      {
        method: 'PUT',
        path: '/api/channel/settings/telegram/assistant',
        body: { assistant_id: 'assistant-codex' },
      },
    ]);
  });

  it('maps Cron schedules and assistant config to the strict write DTO', async () => {
    const { cron } = await import('@/common/adapter/ipcBridge');

    await cron.addJob.invoke({
      name: 'One shot',
      schedule: { kind: 'at', atMs: 1234, description: 'once' },
      prompt: 'run',
      conversation_id: 'conversation-1',
      created_by: 'user',
      agent_config: {
        name: 'Codex',
        assistant_id: 'assistant-codex',
        mode: 'full-access',
      },
    });
    await cron.updateJob.invoke({
      job_id: 'cron-1',
      updates: {
        schedule: { kind: 'every', everyMs: 60000, description: 'minute' },
        metadata: {
          agent_config: {
            name: 'Codex',
            assistant_id: 'assistant-codex',
          },
        },
      },
    });

    expect(httpBridgeMocks.calls.slice(-2)).toEqual([
      {
        method: 'POST',
        path: '/api/cron/jobs',
        body: expect.objectContaining({
          schedule: { kind: 'at', at_ms: 1234, description: 'once' },
          agent_config: {
            name: 'Codex',
            assistant_id: 'assistant-codex',
            mode: 'full-access',
          },
        }),
      },
      {
        method: 'PUT',
        path: '/api/cron/jobs/cron-1',
        body: expect.objectContaining({
          schedule: { kind: 'every', every_ms: 60000, description: 'minute' },
          agent_config: { name: 'Codex', assistant_id: 'assistant-codex' },
        }),
      },
    ]);
  });

  it('subscribes to the AionCore Team WebSocket event names', async () => {
    await import('@/common/adapter/ipcBridge');

    expect(httpBridgeMocks.wsMappedEmitter).toHaveBeenCalledWith('team.agentStatusChanged', expect.any(Function));
    expect(httpBridgeMocks.wsMappedEmitter).toHaveBeenCalledWith('team.agentSpawned', expect.any(Function));
    expect(httpBridgeMocks.wsEmitter).toHaveBeenCalledWith('team.agentRemoved');
    expect(httpBridgeMocks.wsMappedEmitter).toHaveBeenCalledWith('team.agentRenamed', expect.any(Function));
    expect(httpBridgeMocks.wsEmitter).toHaveBeenCalledWith('team.listChanged');
    expect(httpBridgeMocks.wsEmitter).toHaveBeenCalledWith('team.teammateMessage');
  });
});
