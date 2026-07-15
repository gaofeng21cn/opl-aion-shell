import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuidAgentSelection } from '@/renderer/pages/guid/hooks/useGuidAgentSelection';

const { configGetMock, configSetMock, configStore, catalogAssistants, managedAgents } = vi.hoisted(() => ({
  configGetMock: vi.fn(),
  configSetMock: vi.fn(),
  configStore: {
    acp: {} as Record<string, Record<string, unknown>>,
  },
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

describe('useGuidAgentSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    catalogAssistants[0].agent_id = 'codex-managed';
    configStore.acp = {
      codex: {
        preferredMode: 'native',
        preferredModelId: 'gpt-5.6-codex',
        preferredReasoningEffort: 'high',
      },
    };
    configGetMock.mockImplementation((key: string) => {
      if (key === 'acp.config') {
        return configStore.acp;
      }
      return undefined;
    });
    configSetMock.mockImplementation((key: string, value: Record<string, Record<string, unknown>>) => {
      if (key === 'acp.config') configStore.acp = value;
      return Promise.resolve();
    });
  });

  it('preserves a stale fixed Codex model and its reasoning override as unavailable', async () => {
    const { result } = renderHook(() =>
      useGuidAgentSelection({
        modelList: [],
        isGoogleAuth: false,
        localeKey: 'zh-CN',
      })
    );

    await waitFor(() => {
      expect(configGetMock).toHaveBeenCalledWith('acp.config');
      expect(result.current.selectedAcpModel).toBe('gpt-5.6-codex');
      expect(result.current.selectedReasoningEffort).toBe('high');
    });
    expect(configSetMock).not.toHaveBeenCalled();
  });

  it('persists fixed model and reasoning atomically and clears both when Auto is restored', async () => {
    configStore.acp = { codex: { preferredMode: 'native' } };
    const { result } = renderHook(() =>
      useGuidAgentSelection({
        modelList: [],
        isGoogleAuth: false,
        localeKey: 'zh-CN',
      })
    );

    await waitFor(() => expect(result.current.currentAcpCachedModelInfo?.current_model_id).toBe('gpt-5.6-sol'));
    const setCodexModelSelection = (
      result.current as typeof result.current & {
        setCodexModelSelection?: (modelId: string | null, reasoningEffort: 'high' | null) => void;
      }
    ).setCodexModelSelection;
    expect(setCodexModelSelection).toBeTypeOf('function');

    act(() => setCodexModelSelection?.('gpt-5.6-sol', 'high'));
    await waitFor(() =>
      expect(configStore.acp).toEqual({
        codex: {
          preferredMode: 'native',
          preferredModelId: 'gpt-5.6-sol',
          preferredReasoningEffort: 'high',
        },
      })
    );
    await waitFor(() => {
      expect(result.current.selectedAcpModel).toBe('gpt-5.6-sol');
      expect(result.current.selectedReasoningEffort).toBe('high');
    });

    act(() => setCodexModelSelection?.(null, null));
    await waitFor(() => expect(configStore.acp).toEqual({ codex: { preferredMode: 'native' } }));
    await waitFor(() => {
      expect(result.current.selectedAcpModel).toBeNull();
      expect(result.current.selectedReasoningEffort).toBeNull();
    });
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
      expect.arrayContaining(['mas', 'mag', 'rca', 'oma'])
    );
    expect(result.current.availableAgents?.some((agent) => agent.assistant_id === 'obf')).toBe(false);
    expect(result.current.availableAgents?.some((agent) => agent.name === 'Managed Codex')).toBe(false);
    expect(result.current.currentAcpCachedModelInfo?.available_models.map((model) => model.id)).toEqual(
      expect.arrayContaining(['gpt-5.5', 'gpt-5.6-sol'])
    );
  });

  it('falls back to the unique backend row when a stored management id is stale', () => {
    catalogAssistants[0].agent_id = 'stale-codex-id';

    const { result } = renderHook(() =>
      useGuidAgentSelection({
        modelList: [],
        isGoogleAuth: false,
        localeKey: 'zh-CN',
      })
    );

    expect(result.current.currentAcpCachedModelInfo?.available_models.map((model) => model.id)).toEqual(
      expect.arrayContaining(['gpt-5.5', 'gpt-5.6-sol'])
    );
  });

  it('starts ordinary Home from Codex when the saved selection is a professional preset', async () => {
    configGetMock.mockImplementation((key: string) => {
      if (key === 'acp.config') return configStore.acp;
      if (key === 'guid.lastSelectedAgent') return 'custom:mas';
      return undefined;
    });

    const { result } = renderHook(() =>
      useGuidAgentSelection({
        modelList: [],
        isGoogleAuth: false,
        localeKey: 'zh-CN',
      })
    );

    await waitFor(() => expect(configGetMock).toHaveBeenCalledWith('guid.lastSelectedAgent'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.selectedAgentKey).toBe('codex');
    expect(result.current.is_presetAgent).toBe(false);
  });

  it('honors an explicitly preselected professional agent route', async () => {
    const { result } = renderHook(() =>
      useGuidAgentSelection({
        modelList: [],
        isGoogleAuth: false,
        localeKey: 'zh-CN',
        preselectAgentKey: 'custom:mas',
      })
    );

    await waitFor(() => expect(result.current.selectedAgentKey).toBe('custom:mas'));
    expect(result.current.is_presetAgent).toBe(true);
    expect(configSetMock).toHaveBeenCalledWith('guid.lastSelectedAgent', 'custom:mas');
  });
});
