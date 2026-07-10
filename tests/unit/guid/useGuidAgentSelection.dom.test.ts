import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuidAgentSelection } from '@/renderer/pages/guid/hooks/useGuidAgentSelection';

const { configGetMock, configSetMock, detectedAgents } = vi.hoisted(() => ({
  configGetMock: vi.fn(),
  configSetMock: vi.fn(),
  detectedAgents: [
    {
      id: 'codex',
      agent_type: 'acp',
      backend: 'codex',
      name: 'Codex',
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
  ],
}));

vi.mock('swr', () => ({
  default: () => ({ data: detectedAgents }),
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: configGetMock,
    set: configSetMock,
  },
}));

vi.mock('@/renderer/pages/guid/hooks/useCustomAgentsLoader', () => ({
  useCustomAgentsLoader: () => ({
    assistants: [],
    customAgents: [],
    customAgentAvatarMap: new Map(),
    refreshCustomAgents: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/guid/hooks/usePresetAssistantResolver', () => ({
  usePresetAssistantResolver: () => ({
    resolvePresetRulesAndSkills: vi.fn(),
    resolvePresetContext: vi.fn(),
    resolvePresetAgentType: vi.fn(),
    resolveEnabledSkills: vi.fn(),
    resolveDisabledBuiltinSkills: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/guid/hooks/useAgentAvailability', () => ({
  useAgentAvailability: () => ({
    isMainAgentAvailable: vi.fn().mockReturnValue(true),
    getEffectiveAgentType: vi.fn().mockReturnValue({
      agent_type: 'codex',
      isFallback: false,
      originalType: 'codex',
      isAvailable: true,
    }),
  }),
}));

describe('useGuidAgentSelection Codex model preference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configGetMock.mockImplementation((key: string) => {
      if (key === 'acp.config') {
        return { codex: { preferredModelId: 'gpt-5.6-codex' } };
      }
      return undefined;
    });
    configSetMock.mockResolvedValue(undefined);
  });

  it('returns to Auto and clears a stale Codex preferred model', async () => {
    const { result } = renderHook(() =>
      useGuidAgentSelection({
        modelList: [],
        isGoogleAuth: false,
        localeKey: 'zh-CN',
      })
    );

    await waitFor(() => {
      expect(configGetMock).toHaveBeenCalledWith('acp.config');
      expect(configSetMock).toHaveBeenCalledWith('acp.config', { codex: {} });
    });
    expect(result.current.selectedAcpModel).toBeNull();
  });
});
