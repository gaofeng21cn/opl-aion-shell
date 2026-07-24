import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuidAgentSelection } from '@/renderer/pages/guid/hooks/useGuidAgentSelection';
import { useGuidMention } from '@/renderer/pages/guid/hooks/useGuidMention';
import type { AvailableAgent } from '@/renderer/pages/guid/types';

const {
  configGetMock,
  configSetMock,
  configSubscribeMock,
  configSubscribers,
  configStore,
  catalogAssistants,
  managedAgents,
} = vi.hoisted(() => ({
  configGetMock: vi.fn(),
  configSetMock: vi.fn(),
  configSubscribeMock: vi.fn(),
  configSubscribers: new Set<(value: unknown) => void>(),
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
    {
      id: 'future-runtime-assistant',
      source: 'builtin',
      name: 'Future Runtime Assistant',
      name_i18n: {},
      description_i18n: {},
      enabled: true,
      sort_order: 1,
      agent_id: 'claude-managed',
      agent: { type: 'acp', source: 'builtin', acp_backend: 'claude' },
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
    subscribe: configSubscribeMock,
  },
}));

vi.mock('@/renderer/pages/guid/hooks/useCustomAgentsLoader', () => ({
  useCustomAgentsLoader: () => ({
    assistants: catalogAssistants,
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
    configSubscribers.clear();
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
      if (key === 'acp.config') {
        configStore.acp = value;
        configSubscribers.forEach((subscriber) => subscriber(value));
      }
      return Promise.resolve();
    });
    configSubscribeMock.mockImplementation((_key: string, callback: (value: unknown) => void) => {
      configSubscribers.add(callback);
      return () => configSubscribers.delete(callback);
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

  it('updates the mounted Home selection when Settings changes the Codex reasoning preference', async () => {
    configStore.acp = {
      codex: {
        preferredMode: 'native',
        preferredModelId: 'gpt-5.6-sol',
        preferredReasoningEffort: 'max',
      },
    };
    const { result } = renderHook(() =>
      useGuidAgentSelection({
        modelList: [],
        isGoogleAuth: false,
        localeKey: 'zh-CN',
      })
    );

    await waitFor(() => {
      expect(result.current.selectedAcpModel).toBe('gpt-5.6-sol');
      expect(result.current.selectedReasoningEffort).toBe('max');
    });

    await act(async () => {
      await configSetMock('acp.config', {
        codex: {
          preferredMode: 'native',
          preferredModelId: 'gpt-5.6-sol',
          preferredReasoningEffort: 'xhigh',
        },
      });
    });

    await waitFor(() => {
      expect(result.current.selectedAcpModel).toBe('gpt-5.6-sol');
      expect(result.current.selectedReasoningEffort).toBe('xhigh');
    });
  });

  it('builds executor candidates only from backend assistants and uses managed rows for runtime metadata', () => {
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
    expect(result.current.availableAgents?.map((agent) => agent.assistant_id)).toEqual([
      'generated-codex',
      'future-runtime-assistant',
    ]);
    expect(result.current.availableAgents?.some((agent) => agent.assistant_id === 'mas')).toBe(false);
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

  it('honors an explicitly preselected backend assistant route', async () => {
    const { result } = renderHook(() =>
      useGuidAgentSelection({
        modelList: [],
        isGoogleAuth: false,
        localeKey: 'zh-CN',
        preselectAgentKey: 'custom:future-runtime-assistant',
      })
    );

    await waitFor(() => expect(result.current.selectedAgentKey).toBe('custom:future-runtime-assistant'));
    expect(result.current.is_presetAgent).toBe(true);
    expect(configSetMock).toHaveBeenCalledWith('guid.lastSelectedAgent', 'custom:future-runtime-assistant');
  });
});

describe('useGuidMention Agent admission', () => {
  it('selects an explicit Agent mention as the single session owner', () => {
    const setSelectedAgentKey = vi.fn();
    const setInput = vi.fn((update: (value: string) => string) => update('Draft @oma'));
    const availableAgents: AvailableAgent[] = [
      {
        id: 'oma',
        custom_agent_id: 'oma',
        agent_type: 'codex',
        backend: 'codex',
        name: 'OPL Meta Agent',
        is_preset: true,
      },
    ];
    const { result } = renderHook(() =>
      useGuidMention({
        selectionEnabled: true,
        availableAgents,
        customAgentAvatarMap: new Map(),
        selectedAgentKey: 'codex',
        setSelectedAgentKey,
        setInput: setInput as React.Dispatch<React.SetStateAction<string>>,
        selectedAgentInfo: undefined,
      })
    );

    act(() => result.current.selectMentionAgent('custom:oma'));

    expect(setSelectedAgentKey).toHaveBeenCalledWith('custom:oma');
    expect(setInput).toHaveBeenCalledOnce();
    expect(setInput.mock.results[0]?.value).toBe('Draft');
  });

  it('does not expose or select Agent mentions when the App policy disables mention routing', () => {
    const setSelectedAgentKey = vi.fn();
    const setInput = vi.fn();
    const availableAgents: AvailableAgent[] = [
      {
        id: 'oma',
        custom_agent_id: 'oma',
        agent_type: 'codex',
        backend: 'codex',
        name: 'OPL Meta Agent',
        is_preset: true,
      },
    ];
    const { result } = renderHook(() =>
      useGuidMention({
        selectionEnabled: false,
        availableAgents,
        customAgentAvatarMap: new Map(),
        selectedAgentKey: 'codex',
        setSelectedAgentKey,
        setInput,
        selectedAgentInfo: undefined,
      })
    );

    expect(result.current.mentionOptions).toEqual([]);
    act(() => result.current.selectMentionAgent('custom:oma'));
    expect(setSelectedAgentKey).not.toHaveBeenCalled();
    expect(setInput).not.toHaveBeenCalled();
  });
});
