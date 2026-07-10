import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentMetadata } from '@/renderer/utils/model/agentTypes';
import { buildCliAgentParams } from '@/renderer/pages/conversation/utils/createConversationParams';

const { configGetMock, getManagedAgentsMock } = vi.hoisted(() => ({
  configGetMock: vi.fn(),
  getManagedAgentsMock: vi.fn(),
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: configGetMock,
  },
}));

vi.mock('@/renderer/hooks/agent/useManagedAgents', () => ({
  getManagedAgents: getManagedAgentsMock,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    mode: {
      listProviders: { invoke: vi.fn() },
    },
  },
}));

const codexAgent = {
  id: 'codex',
  agent_type: 'acp',
  backend: 'codex',
  name: 'Codex',
} as AgentMetadata;

describe('createConversationParams Codex model preference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configGetMock.mockImplementation((key: string) => {
      if (key === 'acp.config') {
        return { codex: { preferredModelId: 'gpt-5.6-codex' } };
      }
      return undefined;
    });
    getManagedAgentsMock.mockResolvedValue([
      {
        ...codexAgent,
        handshake: {
          available_models: {
            current_model_id: 'gpt-5.4',
            current_model_label: 'GPT-5.4',
            available_models: [
              { id: 'gpt-5.5', label: 'GPT-5.5' },
              { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
            ],
          },
        },
      },
    ]);
  });

  it('ignores a stale Codex preferred model that is outside the App allowlist', async () => {
    const params = await buildCliAgentParams(codexAgent, '/tmp/opl-workspace');

    expect(params.extra.current_model_id).toBe('gpt-5.6-sol');
  });

  it('keeps an available allowlisted Codex preferred model', async () => {
    configGetMock.mockImplementation((key: string) => {
      if (key === 'acp.config') {
        return { codex: { preferredModelId: 'gpt-5.5' } };
      }
      return undefined;
    });

    const params = await buildCliAgentParams(codexAgent, '/tmp/opl-workspace');

    expect(params.extra.current_model_id).toBe('gpt-5.5');
  });
});
