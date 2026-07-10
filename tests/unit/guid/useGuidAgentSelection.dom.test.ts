import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuidAgentSelection } from '@/renderer/pages/guid/hooks/useGuidAgentSelection';

const { configGetMock, configSetMock, catalogAssistants, managedAgents } = vi.hoisted(() => ({
  configGetMock: vi.fn(),
  configSetMock: vi.fn(),
  catalogAssistants: [
    {
      id: 'generated-codex',
      source: 'generated',
      name: 'Codex',
      name_i18n: {},
      description_i18n: {},
      enabled: true,
      sort_order: 0,
      agent_id: 'codex-managed',
      agent: { type: 'acp', source: 'builtin', acp_backend: 'codex' },
      agent_status: 'online',
      enabled_skills: [],
      custom_skill_names: [],
      disabled_builtin_skills: [],
      context_i18n: {},
      prompts: [],
      prompts_i18n: {},
      models: [],
    },
  ],
  managedAgents: [
    {
      id: 'codex-managed',
      agent_type: 'acp',
      agent_source: 'builtin',
      backend: 'codex',
      name: 'Managed Codex',
      available_models: {
        current_model_id: 'gpt-5.4',
        current_model_label: 'GPT-5.4',
        available_models: [
          { id: 'gpt-5.5', label: 'GPT-5.5' },
          { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
        ],
      },
    },
  ],
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
    catalogAssistants,
    customAgentAvatarMap: new Map(),
  }),
}));

vi.mock('@/renderer/hooks/agent/useManagedAgents', () => ({
  useManagedAgentRuntimeCatalog: () => managedAgents,
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

  it('builds business candidates from assistants while using managed rows only for runtime metadata', () => {
    const { result } = renderHook(() =>
      useGuidAgentSelection({
        modelList: [],
        isGoogleAuth: false,
        localeKey: 'zh-CN',
      })
    );

    expect(result.current.availableAgents?.[0]).toMatchObject({
      id: 'codex-managed',
      assistant_id: 'generated-codex',
      managed_agent_id: 'codex-managed',
      backend: 'codex',
      name: 'Codex',
    });
    expect(result.current.availableAgents?.map((agent) => agent.assistant_id)).toEqual(
      expect.arrayContaining(['med-autoscience', 'med-autogrant', 'redcube-ai', 'opl-bookforge'])
    );
    expect(result.current.availableAgents?.some((agent) => agent.name === 'Managed Codex')).toBe(false);
    expect(result.current.currentAcpCachedModelInfo?.available_models.map((model) => model.id)).toEqual(
      expect.arrayContaining(['gpt-5.5', 'gpt-5.6-sol'])
    );
  });
});
