import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { filterOplOrdinaryMcpServers, getOplOrdinaryCapabilitySelectorPolicy } from '@/common/config/oplProductProfile';
import type { AvailableAgent } from '@/renderer/pages/guid/types';
import GuidPage from '@/renderer/pages/guid/GuidPage';

const mocks = vi.hoisted(() => ({
  i18nLanguage: { value: 'zh-CN' },
  translate: (key: string, options?: Record<string, unknown>) =>
    String(
      options?.defaultValue ??
        ({
          'guid.home.question': '今天要推进什么？',
          'guid.home.capabilityQuestion': `要让 ${String(options?.capability ?? '')} 推进什么？`,
          'guid.home.startersLabel': '选择一个能力开始',
          'guid.context.addContext': 'Add context',
          'guid.context.attachDirectory': 'Attach folder',
          'guid.context.workingDirectory': 'Working directory',
          'guid.context.skills': 'Skills',
          'guid.context.connections': 'Apps & connections',
        }[key] ||
          key)
    ),
  locationState: { value: null as Record<string, unknown> | null },
  locationKey: { value: 'guid-test' },
  navigate: vi.fn(),
  setSelectedAgentKey: vi.fn(),
  setCodexModelSelection: vi.fn(),
  mentionSelectionEnabled: { value: null as boolean | null },
  setMentionSelectorVisible: vi.fn(),
  setInput: vi.fn(),
  setFiles: vi.fn(),
  setDir: vi.fn(),
  setLoading: vi.fn(),
  onPaste: vi.fn(),
  onDrop: vi.fn(),
  ensureBackendMcpCatalog: vi.fn(),
  appState: {
    value: {
      schema_version: 'opl_app_state.v1',
      core: {
        codex: {
          installed: true,
          model_access_ready: true,
          version_status: 'compatible',
          health_status: 'ready',
        },
      },
      paths: {
        workspace_root: {
          selected_path: '/Users/example/OPL Workspace',
          exists: true,
          writable: true,
          health_status: 'ready',
        },
      },
      agent_packages: {
        status_index: {
          packages: Object.fromEntries(
            ['mas', 'mag', 'rca', 'obf'].map((packageId) => [
              packageId,
              {
                package_id: packageId,
                operational_ready: true,
                launch_allowed: true,
                launch_blocked_reason: null,
                allowed_when_blocked: ['status', 'doctor', 'repair'],
              },
            ])
          ),
        },
      },
    } as Record<string, unknown>,
  },
  appStateLoad: vi.fn().mockResolvedValue({}),
  appStateLoading: { value: false },
  appStateError: { value: null as string | null },
  appStateProvenance: { value: 'live' as 'none' | 'derived_bootstrap' | 'live' },
  guidInput: {
    input: '',
    files: [] as string[],
    dir: '',
  },
  sendMessageHandler: vi.fn(),
  sendDisabled: { value: true },
  slashExecuteBuiltin: { value: undefined as ((name: string) => void) | undefined },
  slashCommands: { value: [] as Array<{ name: string }> },
  useGuidSend: vi.fn(() => ({
    handleSend: vi.fn().mockResolvedValue(undefined),
    sendMessageHandler: mocks.sendMessageHandler,
    isButtonDisabled: mocks.sendDisabled.value,
  })),
  isPresetAgent: { value: true },
  isMobileLayout: { value: false },
  isElectronDesktop: { value: false },
}));

const selectedAssistant: Assistant = {
  id: 'mas',
  source: 'builtin',
  name: 'Med Auto Science',
  name_i18n: {
    'zh-CN': 'Med Auto Science',
    'en-US': 'Med Auto Science',
  },
  description: 'Advance research tasks.',
  description_i18n: {
    'zh-CN': '推进科研任务、论文写作、审稿回复、投稿材料和研究进度管理。',
    'en-US': 'Advance research tasks.',
  },
  avatar: 'MAS',
  enabled: true,
  sort_order: 1,
  preset_agent_type: 'codex',
  enabled_skills: [],
  custom_skill_names: [],
  disabled_builtin_skills: [],
  context_i18n: {},
  prompts: [],
  prompts_i18n: {},
  models: [],
};

const configuredMcpServers = () => [
  {
    id: 'unknown-mcp',
    name: 'Unknown MCP',
    enabled: true,
    transport: { type: 'stdio' as const, command: 'echo' },
    created_at: 1,
    updated_at: 1,
    original_json: '{}',
  },
  {
    id: 'aionui-image-generation',
    name: 'AionUI Image Generation',
    enabled: true,
    builtin: true,
    transport: { type: 'stdio' as const, command: 'echo' },
    created_at: 1,
    updated_at: 1,
    original_json: '{}',
  },
];

const shortcutAssistants: Assistant[] = [
  selectedAssistant,
  {
    ...selectedAssistant,
    id: 'mag',
    name: 'Med Auto Grant',
    name_i18n: { 'zh-CN': 'Med Auto Grant', 'en-US': 'Med Auto Grant' },
    avatar: 'MAG',
  },
  {
    ...selectedAssistant,
    id: 'rca',
    name: 'RedCube AI',
    name_i18n: { 'zh-CN': 'RedCube AI', 'en-US': 'RedCube AI' },
    avatar: 'RCA',
  },
  {
    ...selectedAssistant,
    id: 'obf',
    name: 'OPL Book Forge',
    name_i18n: { 'zh-CN': 'OPL Book Forge', 'en-US': 'OPL Book Forge' },
    avatar: 'OBF',
  },
  {
    ...selectedAssistant,
    id: 'oma',
    name: 'OPL Meta Agent',
    name_i18n: { 'zh-CN': 'OPL Meta Agent', 'en-US': 'OPL Meta Agent' },
    avatar: 'OMA',
  },
];

const selectedAgentInfo: AvailableAgent = {
  id: 'mas',
  custom_agent_id: 'mas',
  agent_type: 'codex',
  backend: 'codex',
  name: '科研',
  is_preset: true,
  avatar: 'MAS',
};

const buildCodexModelInfo = () => ({
  current_model_id: 'gpt-5.5',
  current_model_label: 'GPT-5.5（超高）',
  available_models: [{ id: 'gpt-5.5', label: 'GPT-5.5（超高）' }],
});

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      listBuiltinAutoSkills: {
        invoke: vi.fn().mockResolvedValue([{ name: 'aionui-skills', description: 'Upstream AionUI auto skill' }]),
      },
      listAvailableSkills: {
        invoke: vi.fn().mockResolvedValue([
          { name: 'mas', description: 'MAS skill' },
          { name: 'mag', description: 'MAG skill' },
          { name: 'rca', description: 'RCA skill' },
          { name: 'officecli-docx', description: 'Word documents' },
          { name: 'aionui-skills', description: 'Upstream AionUI helper' },
          { name: 'cron', description: 'AionUI cron skill' },
        ]),
      },
    },
    dialog: {
      showOpen: { invoke: vi.fn().mockResolvedValue([]) },
    },
    assistants: {
      update: { invoke: vi.fn().mockResolvedValue(undefined) },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mocks.translate,
    i18n: { language: mocks.i18nLanguage.value },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => ({
    key: mocks.locationKey.value,
    pathname: '/guid',
    search: '',
    hash: '',
    state: mocks.locationState.value,
  }),
}));

vi.mock('swr', () => ({
  mutate: vi.fn(),
  default: () => ({ data: [] }),
}));

vi.mock('@/renderer/hooks/chat/useInputFocusRing', () => ({
  useInputFocusRing: () => ({
    activeBorderColor: '#111',
    inactiveBorderColor: '#ddd',
    activeShadow: 'none',
  }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: mocks.isMobileLayout.value }),
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  useOplAppState: () => ({
    appState: mocks.appState.value,
    loading: mocks.appStateLoading.value,
    error: mocks.appStateError.value,
    provenance: mocks.appStateProvenance.value,
    load: mocks.appStateLoad,
  }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  openExternalUrl: vi.fn().mockResolvedValue(undefined),
  resolveExtensionAssetUrl: (value?: string) => value,
  isElectronDesktop: () => mocks.isElectronDesktop.value,
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  getModelDisplayLabel: ({
    selectedLabel,
    defaultModelLabel,
    fallbackLabel,
  }: {
    selectedLabel?: string;
    defaultModelLabel?: string;
    fallbackLabel?: string;
  }) => selectedLabel || defaultModelLabel || fallbackLabel || '',
  resolveAgentLogo: () => null,
}));

vi.mock('@/renderer/pages/guid/hooks/useGuidModelSelection', () => ({
  useGuidModelSelection: () => ({
    modelList: [],
    isGoogleAuth: false,
    formatGeminiModelLabel: (_provider: unknown, modelName?: string) => modelName ?? '',
    current_model: undefined,
    setCurrentModel: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/guid/hooks/useGuidAgentSelection', () => ({
  useGuidAgentSelection: () => ({
    selectedAgentKey: mocks.isPresetAgent.value ? 'custom:mas' : 'codex',
    setSelectedAgentKey: mocks.setSelectedAgentKey,
    defaultAgentKey: 'codex',
    selectedAgent: mocks.isPresetAgent.value ? 'custom' : 'codex',
    selectedAgentInfo: mocks.isPresetAgent.value ? selectedAgentInfo : undefined,
    is_presetAgent: mocks.isPresetAgent.value,
    availableAgents: [{ agent_type: 'codex', backend: 'codex', name: 'Codex' }],
    assistants: shortcutAssistants,
    customAgents: [],
    selectedMode: 'default',
    setSelectedMode: vi.fn(),
    selectedAcpModel: null,
    setSelectedAcpModel: vi.fn(),
    selectedReasoningEffort: 'max',
    setSelectedReasoningEffort: vi.fn(),
    setCodexModelSelection: mocks.setCodexModelSelection,
    currentAcpCachedModelInfo: mocks.isPresetAgent.value
      ? {
          current_model_id: 'gpt-5.5',
          current_model_label: 'GPT-5.5（超高）',
          available_models: [],
        }
      : buildCodexModelInfo(),
    currentEffectiveAgentInfo: {
      agent_type: 'codex',
      isFallback: false,
      originalType: 'codex',
      isAvailable: true,
    },
    getAgentKey: (agent: { backend?: string; agent_type: string }) => agent.backend || agent.agent_type,
    findAgentByKey: vi.fn(),
    resolvePresetRulesAndSkills: vi.fn().mockResolvedValue({}),
    resolvePresetContext: vi.fn().mockResolvedValue(undefined),
    resolvePresetAgentType: vi.fn().mockReturnValue('codex'),
    resolveEnabledSkills: vi.fn().mockReturnValue([]),
    resolveDisabledBuiltinSkills: vi.fn().mockReturnValue([]),
    isMainAgentAvailable: vi.fn().mockReturnValue(true),
    getEffectiveAgentType: vi.fn().mockReturnValue({
      agent_type: 'codex',
      isFallback: false,
      originalType: 'codex',
      isAvailable: true,
    }),
    refreshCustomAgents: vi.fn().mockResolvedValue(undefined),
    customAgentAvatarMap: new Map(),
  }),
}));

vi.mock('@/renderer/pages/guid/hooks/useGuidInput', () => ({
  useGuidInput: () => ({
    input: mocks.guidInput.input,
    setInput: mocks.setInput,
    files: mocks.guidInput.files,
    setFiles: mocks.setFiles,
    dir: mocks.guidInput.dir,
    setDir: mocks.setDir,
    loading: false,
    setLoading: mocks.setLoading,
    isInputFocused: false,
    isFileDragging: false,
    handleTextareaFocus: vi.fn(),
    handleTextareaBlur: vi.fn(),
    handleFilesUploaded: vi.fn(),
    handleRemoveFile: vi.fn(),
    onPaste: mocks.onPaste,
    dragHandlers: { onDrop: mocks.onDrop },
  }),
}));

vi.mock('@/renderer/pages/guid/hooks/useGuidMention', () => ({
  useGuidMention: (options: { selectionEnabled: boolean; selectedAgentLabelOverride?: string }) => {
    mocks.mentionSelectionEnabled.value = options.selectionEnabled;
    return {
      mentionQuery: null,
      setMentionQuery: vi.fn(),
      mentionOpen: false,
      setMentionOpen: vi.fn(),
      mentionSelectorVisible: mocks.isPresetAgent.value,
      setMentionSelectorVisible: mocks.setMentionSelectorVisible,
      mentionSelectorOpen: false,
      setMentionSelectorOpen: vi.fn(),
      mentionActiveIndex: 0,
      setMentionActiveIndex: vi.fn(),
      mentionOptions: [],
      filteredMentionOptions: [],
      selectMentionAgent: vi.fn(),
      mentionMenuRef: { current: null },
      mentionMatchRegex: /(?:^|\s)@([^\s@]*)$/,
      selectedAgentLabel: options.selectedAgentLabelOverride || (mocks.isPresetAgent.value ? 'MAS' : 'Codex'),
      mentionMenuSelectedKey: mocks.isPresetAgent.value ? 'custom:mas' : 'codex',
    };
  },
}));

vi.mock('@/renderer/pages/guid/hooks/useGuidSend', () => ({
  useGuidSend: mocks.useGuidSend,
}));

vi.mock('@/renderer/hooks/chat/useSlashCommandController', () => ({
  useSlashCommandController: (options: {
    commands: Array<{ name: string }>;
    onExecuteBuiltin?: (name: string) => void;
  }) => {
    mocks.slashExecuteBuiltin.value = options.onExecuteBuiltin;
    mocks.slashCommands.value = options.commands;
    return {
      query: null,
      isOpen: false,
      activeIndex: 0,
      filteredCommands: [],
      onKeyDown: vi.fn().mockReturnValue(false),
      onSelectByIndex: vi.fn().mockReturnValue(false),
      setDismissed: vi.fn(),
      setActiveIndex: vi.fn(),
    };
  },
}));

vi.mock('@/renderer/pages/guid/hooks/useTypewriterPlaceholder', () => ({
  useTypewriterPlaceholder: () => '描述任务',
}));

vi.mock('@/renderer/hooks/mcp/catalog', () => ({
  ensureBackendMcpCatalog: mocks.ensureBackendMcpCatalog,
}));

vi.mock('@/renderer/pages/guid/components/GuidInputCard', () => ({
  default: ({
    input,
    onInputChange,
    placeholder,
    actionRow,
    fileAccessEnabled,
    onPaste,
    dragHandlers,
  }: {
    input: string;
    onInputChange: (value: string) => void;
    placeholder: string;
    actionRow: React.ReactNode;
    fileAccessEnabled?: boolean;
    onPaste: React.ClipboardEventHandler;
    dragHandlers: React.HTMLAttributes<HTMLDivElement>;
  }) => (
    <div
      data-testid='guid-input-card'
      onPaste={fileAccessEnabled ? onPaste : undefined}
      onDrop={fileAccessEnabled ? dragHandlers.onDrop : undefined}
    >
      <textarea data-testid='guid-input' value={input} onChange={(event) => onInputChange(event.target.value)} />
      <div data-testid='guid-placeholder'>{placeholder}</div>
      {actionRow}
      {fileAccessEnabled === false ? <div data-testid='opl-guid-file-inputs-disabled' /> : null}
    </div>
  ),
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/FeedbackReportModal', () => ({
  default: () => null,
}));

describe('GuidPage selected purpose assistant surface', () => {
  beforeEach(() => {
    mocks.i18nLanguage.value = 'zh-CN';
    mocks.locationState.value = { selectedCapabilityId: 'mas' };
    mocks.locationKey.value = 'guid-test';
    mocks.isPresetAgent.value = false;
    mocks.isMobileLayout.value = false;
    mocks.isElectronDesktop.value = false;
    mocks.navigate.mockClear();
    mocks.setInput.mockClear();
    mocks.setFiles.mockClear();
    mocks.setDir.mockClear();
    mocks.setLoading.mockClear();
    mocks.onPaste.mockClear();
    mocks.onDrop.mockClear();
    mocks.ensureBackendMcpCatalog.mockReset();
    mocks.appState.value = {
      schema_version: 'opl_app_state.v1',
      core: {
        codex: {
          installed: true,
          model_access_ready: true,
          version_status: 'compatible',
          health_status: 'ready',
        },
      },
      paths: {
        workspace_root: {
          selected_path: '/Users/example/OPL Workspace',
          exists: true,
          writable: true,
          health_status: 'ready',
        },
      },
      agent_packages: {
        status_index: {
          packages: {
            mas: { package_id: 'mas', operational_ready: true, launch_allowed: true },
            mag: { package_id: 'mag', operational_ready: true, launch_allowed: true },
            rca: { package_id: 'rca', operational_ready: true, launch_allowed: true },
            obf: { package_id: 'obf', operational_ready: true, launch_allowed: true },
            oma: { package_id: 'oma', operational_ready: true, launch_allowed: true },
          },
        },
      },
    };
    mocks.appStateLoad.mockReset();
    mocks.appStateLoad.mockResolvedValue({});
    mocks.appStateLoading.value = false;
    mocks.appStateError.value = null;
    mocks.appStateProvenance.value = 'live';
    mocks.guidInput.input = '';
    mocks.guidInput.files = [];
    mocks.guidInput.dir = '';
    mocks.sendMessageHandler.mockClear();
    mocks.setCodexModelSelection.mockClear();
    mocks.mentionSelectionEnabled.value = null;
    mocks.sendDisabled.value = true;
    mocks.slashExecuteBuiltin.value = undefined;
    mocks.slashCommands.value = [];
    mocks.ensureBackendMcpCatalog.mockResolvedValue({ allServers: configuredMcpServers() });
    mocks.useGuidSend.mockClear();
  });

  it('shows a dynamic capability question without duplicating capability context in the composer', async () => {
    render(<GuidPage />);

    expect(screen.queryByTestId('opl-guid-context-inspector')).not.toBeInTheDocument();
    expect(screen.queryByText('@MAS')).not.toBeInTheDocument();
    expect(screen.getByTestId('home-starter-mas')).toBeInTheDocument();
    expect(screen.queryByTestId('guid-active-capability')).not.toBeInTheDocument();
    expect(screen.getByTestId('guid-placeholder')).toHaveTextContent('MAS');
    expect(screen.getByText('要让 科研 推进什么？')).toBeInTheDocument();
    expect(screen.queryByTestId('opl-home-model-status')).not.toBeInTheDocument();
    expect(screen.queryByText('模型: GPT-5.5')).not.toBeInTheDocument();
    expect(screen.getByTestId('home-starter-mas')).toHaveTextContent('guid.uiOptimization.home.shortcuts.research');
    expect(screen.queryByText('推进科研任务、论文写作、审稿回复、投稿材料和研究进度管理。')).not.toBeInTheDocument();
    expect(screen.queryByText(/Default Codex CLI/)).not.toBeInTheDocument();
    expect(screen.getByTestId('guid-model-selector')).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.useGuidSend).toHaveBeenCalledWith(
        expect.objectContaining({
          activeShortcut: expect.objectContaining({ package_id: 'mas', shortcut_id: 'research' }),
          guidEnabledSkills: ['med-autoscience'],
          is_presetAgent: false,
          selectedAgent: 'codex',
        })
      );
    });
  });

  it('keeps plain-text Agent references inert while following the explicit @ selection policy', () => {
    render(<GuidPage />);
    mocks.setSelectedAgentKey.mockClear();

    const mentionSelectionAllowed =
      getOplOrdinaryCapabilitySelectorPolicy().agent_reference_admission_policy.at_mention_agent_selection_allowed;
    const entry = screen.getByTestId('opl-guid-entry');
    expect(entry).toHaveAttribute('data-opl-at-mention-agent-selection-enabled', String(mentionSelectionAllowed));
    expect(mocks.mentionSelectionEnabled.value).toBe(mentionSelectionAllowed);

    const prompt = '@OPL Meta Agent 帮我用 RCA 做一个 PPT';
    fireEvent.change(screen.getByTestId('guid-input'), { target: { value: prompt } });

    expect(mocks.setInput).toHaveBeenCalledWith(prompt);
    expect(mocks.setSelectedAgentKey).not.toHaveBeenCalled();
  });

  it('applies the App-owned skill allowlist and MCP visibility policy on ordinary Home', async () => {
    render(<GuidPage />);

    await waitFor(() => {
      expect(mocks.useGuidSend).toHaveBeenLastCalledWith(
        expect.objectContaining({
          guidEnabledSkills: ['med-autoscience'],
          guidDisabledBuiltinSkills: ['aionui-skills', 'aionui-webui-setup', 'skill-creator', 'cron'],
          availableMcpServers: filterOplOrdinaryMcpServers(configuredMcpServers()),
          selectedMcpServerIds: [],
        })
      );
    });
  });

  it('keeps the Codex model selector visible on ordinary Home', () => {
    mocks.isPresetAgent.value = false;

    render(<GuidPage />);

    expect(screen.queryByText('@MAS')).not.toBeInTheDocument();
    expect(screen.getByTestId('guid-model-selector')).toBeInTheDocument();
  });

  it('does not turn a persisted professional preset into an active Home shortcut', async () => {
    mocks.locationState.value = null;
    mocks.isPresetAgent.value = true;
    render(<GuidPage />);

    await waitFor(() =>
      expect(mocks.useGuidSend).toHaveBeenLastCalledWith(expect.objectContaining({ activeShortcut: null }))
    );
    expect(mocks.setSelectedAgentKey).not.toHaveBeenCalled();
    expect(screen.queryByTestId('guid-active-capability')).not.toBeInTheDocument();
  });

  it('converts an explicitly preselected professional agent into a visible shortcut and restores Codex', async () => {
    mocks.locationState.value = { selectedAgentKey: 'custom:mas' };
    mocks.isPresetAgent.value = true;
    render(<GuidPage />);

    expect(mocks.setSelectedAgentKey).toHaveBeenCalledWith('codex');
    await waitFor(() =>
      expect(mocks.useGuidSend).toHaveBeenLastCalledWith(
        expect.objectContaining({ activeShortcut: expect.objectContaining({ package_id: 'mas' }) })
      )
    );
    expect(screen.getByTestId('guid-model-selector')).toBeInTheDocument();
  });

  it('wires ordinary mobile Home to the bounded action sheet and shared Codex selection state', async () => {
    mocks.isPresetAgent.value = false;
    mocks.isMobileLayout.value = true;

    render(<GuidPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Add context' }));

    expect(screen.getByTestId('mobile-action-sheet-attach-file')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-action-sheet-attach-directory')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-action-sheet-permission')).toBeInTheDocument();
    const modelEntry = screen.getByTestId('mobile-action-sheet-model');
    const reasoningEntry = screen.getByTestId('mobile-action-sheet-reasoning');
    const resetEntry = screen.getByTestId('mobile-action-sheet-reset-session-defaults');
    const sessionEntryOrder = Array.from(modelEntry.parentElement?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      .map((entry) => entry.dataset.testid)
      .filter((testId): testId is string => Boolean(testId));
    const modelEntryIndex = sessionEntryOrder.indexOf('mobile-action-sheet-model');
    expect(sessionEntryOrder.slice(modelEntryIndex, modelEntryIndex + 3)).toEqual([
      'mobile-action-sheet-model',
      'mobile-action-sheet-reasoning',
      'mobile-action-sheet-reset-session-defaults',
    ]);
    expect(screen.queryByTestId('mobile-action-sheet-auto')).not.toBeInTheDocument();
    expect(resetEntry.previousElementSibling).not.toBe(reasoningEntry);
    expect(resetEntry.previousElementSibling?.previousElementSibling).toBe(reasoningEntry);
    expect(resetEntry.querySelector('[data-icon="refresh"], .i-icon-refresh')).not.toBeNull();
    expect(screen.queryByTestId('mobile-action-sheet-workspace')).not.toBeInTheDocument();
    expect(screen.getByTestId('mobile-action-sheet-capability-agent_packages')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-action-sheet-capability-skills')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-action-sheet-capability-apps_and_connections')).toBeInTheDocument();
    expect(screen.queryByTestId('guid-model-selector')).not.toBeInTheDocument();

    await userEvent.click(modelEntry);
    const autoOption = await screen.findByTestId('mobile-action-sheet-option-__auto');
    expect(autoOption).toHaveAttribute('aria-pressed', 'true');
    expect(autoOption.parentElement?.firstElementChild).toBe(autoOption);
    await userEvent.click(autoOption);
    expect(mocks.setCodexModelSelection).toHaveBeenNthCalledWith(1, null, null);
    await waitFor(() => expect(modelEntry).toHaveFocus());

    fireEvent.click(resetEntry);
    expect(mocks.setCodexModelSelection).toHaveBeenNthCalledWith(2, null, null);
  });

  it.each(['mas', 'mag', 'rca', 'obf', 'oma'])(
    'keeps desktop model, reasoning, and permission controls for shortcut %s',
    (packageId) => {
      mocks.locationState.value = { selectedCapabilityId: packageId };
      render(<GuidPage />);

      const entry = screen.getByTestId('opl-guid-entry');
      expect(entry).toHaveAttribute('data-opl-composer-executor', 'codex');
      expect(entry).toHaveAttribute('data-opl-model-reasoning-visible', 'true');
      expect(entry).toHaveAttribute('data-opl-permission-access-visible', 'true');
      expect(entry).toHaveAttribute('data-opl-executor-selector-visible', 'false');
      expect(screen.getByTestId('guid-model-selector')).toBeInTheDocument();
      expect(screen.getByTestId('mode-selector')).toBeInTheDocument();
    }
  );

  it.each(['mas', 'mag', 'rca', 'obf', 'oma'])(
    'keeps mobile model, reasoning, and permission controls for shortcut %s',
    async (packageId) => {
      mocks.locationState.value = { selectedCapabilityId: packageId };
      mocks.isMobileLayout.value = true;
      render(<GuidPage />);
      await userEvent.click(screen.getByRole('button', { name: 'Add context' }));

      expect(screen.getByTestId('mobile-action-sheet-model')).toBeInTheDocument();
      expect(screen.getByTestId('mobile-action-sheet-reasoning')).toBeInTheDocument();
      expect(screen.getByTestId('mobile-action-sheet-permission')).toBeInTheDocument();
      expect(screen.queryByTestId('mobile-action-sheet-executor')).not.toBeInTheDocument();
    }
  );

  it('does not render the retired static inspector surface', () => {
    render(<GuidPage />);

    expect(screen.queryByTestId('opl-guid-context-inspector')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-guid-context-inspector-toggle')).not.toBeInTheDocument();
  });

  it('selects an active capability from a Home starter without exposing an agent selector', async () => {
    mocks.locationState.value = null;
    render(<GuidPage />);
    mocks.setSelectedAgentKey.mockClear();

    await userEvent.click(screen.getByTestId('home-starter-mas'));

    expect(mocks.setSelectedAgentKey).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mocks.useGuidSend).toHaveBeenLastCalledWith(
        expect.objectContaining({ activeShortcut: expect.objectContaining({ package_id: 'mas' }) })
      )
    );
    expect(screen.queryByText('@MAS')).not.toBeInTheDocument();
  });

  it('keeps the default book Home starter fully bound', async () => {
    mocks.locationState.value = null;
    render(<GuidPage />);

    await userEvent.click(screen.getByTestId('home-starter-obf'));

    await waitFor(() =>
      expect(mocks.useGuidSend).toHaveBeenLastCalledWith(
        expect.objectContaining({
          activeShortcut: expect.objectContaining({ package_id: 'obf', shortcut_id: 'book' }),
          guidEnabledSkills: ['opl-bookforge'],
        })
      )
    );
    expect(screen.getByTestId('guid-placeholder')).toHaveTextContent('OBF');
    expect(screen.getByText('要让 写书 推进什么？')).toBeInTheDocument();
  });

  it('clears the active capability without clearing the draft, attachments, or workspace', async () => {
    mocks.guidInput.input = 'Keep this draft';
    mocks.guidInput.files = ['/workspace/evidence.pdf'];
    mocks.guidInput.dir = '/workspace';
    render(<GuidPage />);
    const inputCalls = mocks.setInput.mock.calls.length;
    const fileCalls = mocks.setFiles.mock.calls.length;
    const dirCalls = mocks.setDir.mock.calls.length;
    mocks.setSelectedAgentKey.mockClear();

    await userEvent.click(screen.getByTestId('home-starter-mas'));

    expect(mocks.setSelectedAgentKey).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mocks.useGuidSend).toHaveBeenLastCalledWith(expect.objectContaining({ activeShortcut: null }))
    );
    expect(mocks.setInput).toHaveBeenCalledTimes(inputCalls);
    expect(mocks.setFiles).toHaveBeenCalledTimes(fileCalls);
    expect(mocks.setDir).toHaveBeenCalledTimes(dirCalls);
  });

  it('applies a capability selected through compatibility redirect state', () => {
    mocks.locationState.value = { selectedCapabilityId: 'mag' };

    render(<GuidPage />);

    expect(mocks.setSelectedAgentKey).not.toHaveBeenCalled();
    expect(mocks.useGuidSend).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeShortcut: expect.objectContaining({ package_id: 'mag' }) })
    );
    expect(mocks.navigate).toHaveBeenCalledWith('/guid', { replace: true, state: null });
  });

  it('uses route workspace only as the new session working directory', async () => {
    mocks.guidInput.dir = '/workspace/research';
    mocks.locationState.value = { workspace: '/workspace/research' };

    render(<GuidPage />);

    expect(mocks.setFiles).toHaveBeenCalledWith([]);
    expect(mocks.useGuidSend).toHaveBeenLastCalledWith(
      expect.objectContaining({ dir: '/workspace/research', files: [] })
    );
  });

  it('loads only App-packaged available skills on the OPL home path', async () => {
    render(<GuidPage />);

    await screen.findByTestId('home-starter-mas');

    const { ipcBridge } = await import('@/common');
    expect(ipcBridge.fs.listBuiltinAutoSkills.invoke).toHaveBeenCalled();
    expect(ipcBridge.fs.listAvailableSkills.invoke).toHaveBeenCalled();
    await waitFor(() =>
      expect(mocks.useGuidSend).toHaveBeenLastCalledWith(
        expect.objectContaining({
          guidDisabledBuiltinSkills: ['aionui-skills', 'aionui-webui-setup', 'skill-creator', 'cron'],
        })
      )
    );
  });

  it('keeps ordinary Home free of runtime activity and floating footer shortcuts', () => {
    render(<GuidPage />);

    expect(screen.queryByTestId('opl-continue-context-entry')).not.toBeInTheDocument();
    expect(screen.queryByTestId('guid-activity-center')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quick-actions')).not.toBeInTheDocument();
    expect(screen.queryByText(/running attempts/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/needs_attention/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-home-runtime-alert')).not.toBeInTheDocument();
  });

  it('keeps the persistent composer alert absent when the local runtime is not ready', () => {
    mocks.appState.value = {
      ...mocks.appState.value,
      core: {
        codex: {
          installed: true,
          model_access_ready: false,
          version_status: 'compatible',
          health_status: 'ready',
        },
      },
    };

    render(<GuidPage />);

    expect(screen.queryByTestId('opl-home-runtime-alert')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-guid-setup-notice')).not.toBeInTheDocument();
  });

  it('opens FirstRun after a fresh login confirms incomplete Core readiness', async () => {
    mocks.locationState.value = { postLoginSetupCheck: true };
    mocks.appState.value = {
      ...mocks.appState.value,
      core: {
        codex: {
          installed: true,
          model_access_ready: false,
          version_status: 'compatible',
          health_status: 'ready',
        },
      },
    };

    render(<GuidPage />);

    await waitFor(() => expect(mocks.appStateLoad).toHaveBeenCalledWith('fast', { forceFresh: true }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/first-run', { replace: true }));
  });

  it('keeps Guid and consumes the fresh-login intent when Core readiness is complete', async () => {
    mocks.locationState.value = { postLoginSetupCheck: true };

    render(<GuidPage />);

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith('/guid', {
        replace: true,
        state: null,
      })
    );
    expect(mocks.navigate).not.toHaveBeenCalledWith('/first-run', expect.anything());
  });

  it('fails open on Guid when the fresh-login readiness read fails', async () => {
    mocks.locationState.value = { postLoginSetupCheck: true };
    mocks.appState.value = {};
    mocks.appStateProvenance.value = 'none';
    mocks.appStateLoad.mockRejectedValueOnce(new Error('runtime unavailable'));

    render(<GuidPage />);

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith('/guid', {
        replace: true,
        state: null,
      })
    );
    expect(mocks.navigate).not.toHaveBeenCalledWith('/first-run', expect.anything());
  });

  it('renders one Home surface and one composer', () => {
    render(<GuidPage />);

    expect(screen.getAllByTestId('opl-guid-entry')).toHaveLength(1);
    expect(screen.getAllByTestId('guid-input-card')).toHaveLength(1);
  });

  it('keeps Home browsable but blocks send with an inline model access recovery action', async () => {
    mocks.isPresetAgent.value = false;
    mocks.guidInput.input = '继续我的任务';
    mocks.sendDisabled.value = false;
    mocks.appState.value = {
      ...mocks.appState.value,
      core: {
        codex: {
          installed: true,
          model_access_ready: false,
          version_status: 'compatible',
          health_status: 'ready',
        },
      },
    };

    render(<GuidPage />);
    await userEvent.click(screen.getByTestId('guid-send-btn'));

    expect(mocks.sendMessageHandler).not.toHaveBeenCalled();
    expect(screen.getByTestId('opl-guid-setup-notice')).toHaveTextContent(
      'common.firstRunRecovery.notice.model_access.title'
    );

    await userEvent.click(screen.getByTestId('opl-guid-setup-notice-action'));
    expect(mocks.navigate).toHaveBeenCalledWith('/first-run');
  });

  it('clears a send-blocked setup notice when a new task resets Home', async () => {
    mocks.isPresetAgent.value = false;
    mocks.guidInput.input = '保留到当前任务的草稿';
    mocks.sendDisabled.value = false;
    mocks.appState.value = {
      ...mocks.appState.value,
      core: {
        codex: {
          installed: true,
          model_access_ready: false,
          version_status: 'compatible',
          health_status: 'ready',
        },
      },
    };

    const { rerender } = render(<GuidPage />);
    await userEvent.click(screen.getByTestId('guid-send-btn'));
    expect(screen.getByTestId('opl-guid-setup-notice')).toBeInTheDocument();

    mocks.locationState.value = { resetAssistant: true };
    mocks.locationKey.value = 'new-task';
    rerender(<GuidPage />);

    expect(screen.queryByTestId('opl-guid-setup-notice')).not.toBeInTheDocument();
  });

  it('keeps explicit local files available when canonical App state has no workspace root', async () => {
    mocks.isPresetAgent.value = false;
    mocks.guidInput.input = '分析本地附件';
    mocks.guidInput.files = ['/outside/project/evidence.pdf'];
    mocks.sendDisabled.value = false;
    mocks.appState.value = {
      ...mocks.appState.value,
      paths: {
        workspace_root: {
          selected_path: null,
          exists: false,
          health_status: 'missing',
        },
      },
    };

    render(<GuidPage />);

    expect(screen.queryByTestId('opl-guid-file-access-disabled')).not.toBeInTheDocument();
    expect(screen.getByTestId('opl-guid-workspace-access-disabled')).toBeInTheDocument();
    expect(screen.queryByTestId('opl-guid-file-inputs-disabled')).not.toBeInTheDocument();
    expect(screen.getByTestId('file-upload-btn')).toBeEnabled();
    expect(mocks.slashCommands.value).toContainEqual(expect.objectContaining({ name: 'open' }));
    await userEvent.click(screen.getByTestId('guid-send-btn'));
    expect(mocks.sendMessageHandler).toHaveBeenCalledOnce();
    expect(mocks.useGuidSend).toHaveBeenLastCalledWith(
      expect.objectContaining({ files: ['/outside/project/evidence.pdf'], dir: '' })
    );
    expect(screen.queryByTestId('opl-guid-setup-notice')).not.toBeInTheDocument();
  });

  it('keeps attachments and /open available without a selected workspace', async () => {
    mocks.isPresetAgent.value = false;
    mocks.guidInput.input = '只进行文字对话';
    mocks.sendDisabled.value = false;
    mocks.appState.value = {
      ...mocks.appState.value,
      paths: { workspace_root: { selected_path: null, exists: false, health_status: 'missing' } },
    };

    const { ipcBridge } = await import('@/common');
    vi.mocked(ipcBridge.dialog.showOpen.invoke).mockClear();
    render(<GuidPage />);

    expect(screen.queryByTestId('opl-guid-file-access-disabled')).not.toBeInTheDocument();
    expect(screen.getByTestId('opl-guid-workspace-access-disabled')).toBeInTheDocument();
    expect(screen.queryByTestId('opl-guid-file-inputs-disabled')).not.toBeInTheDocument();
    expect(screen.getByTestId('file-upload-btn')).toBeEnabled();
    expect(mocks.slashCommands.value).toContainEqual(expect.objectContaining({ name: 'open' }));

    await act(async () => mocks.slashExecuteBuiltin.value?.('open'));
    await waitFor(() =>
      expect(ipcBridge.dialog.showOpen.invoke).toHaveBeenCalledWith({
        properties: ['openFile', 'multiSelections'],
      })
    );

    fireEvent.paste(screen.getByTestId('guid-input-card'));
    fireEvent.drop(screen.getByTestId('guid-input-card'));
    expect(mocks.onPaste).toHaveBeenCalledOnce();
    expect(mocks.onDrop).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByTestId('guid-send-btn'));
    expect(mocks.sendMessageHandler).toHaveBeenCalledOnce();
  });

  it('keeps send-scoped attachments when the selected workspace is cleared', async () => {
    mocks.guidInput.dir = '/workspace/research';
    mocks.guidInput.files = ['/outside/project/evidence.pdf'];
    render(<GuidPage />);
    const setFilesCallCount = mocks.setFiles.mock.calls.length;

    await userEvent.click(screen.getByTestId('guid-workspace-clear'));

    expect(mocks.setDir).toHaveBeenCalledWith('');
    expect(mocks.setFiles).toHaveBeenCalledTimes(setFilesCallCount);
    expect(mocks.useGuidSend).toHaveBeenLastCalledWith(
      expect.objectContaining({ files: ['/outside/project/evidence.pdf'] })
    );
  });

  it('opens the local file picker when workspace setup is incomplete', async () => {
    mocks.isPresetAgent.value = false;
    mocks.isElectronDesktop.value = true;
    mocks.guidInput.input = '/';
    mocks.appState.value = {
      ...mocks.appState.value,
      paths: {
        workspace_root: {
          selected_path: null,
          exists: false,
          health_status: 'missing',
        },
      },
    };

    const { ipcBridge } = await import('@/common');
    vi.mocked(ipcBridge.dialog.showOpen.invoke).mockClear();
    render(<GuidPage />);
    await waitFor(() => expect(mocks.slashExecuteBuiltin.value).toBeTypeOf('function'));
    const setInputCallCount = mocks.setInput.mock.calls.length;

    act(() => mocks.slashExecuteBuiltin.value?.('open'));

    await waitFor(() =>
      expect(ipcBridge.dialog.showOpen.invoke).toHaveBeenCalledWith({
        properties: ['openFile', 'openDirectory', 'multiSelections'],
      })
    );
    expect(mocks.setInput).toHaveBeenCalledTimes(setInputCallCount + 1);
    expect(mocks.setInput).toHaveBeenLastCalledWith('');
    expect(screen.queryByTestId('opl-guid-setup-notice')).not.toBeInTheDocument();
  });

  it('prefills a Chinese post-install Codex self-check prompt from first-run navigation state', () => {
    mocks.locationState.value = { postInstallSelfCheck: true };

    render(<GuidPage />);

    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('安装后智能自检'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('首次设置的核心阶段已经完成'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('opl app state --profile fast --json'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('App 核心可用'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('presence-only'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('用户主动卸载'));
    expect(mocks.setInput).toHaveBeenCalledWith(
      expect.stringContaining('opl packages status --package-id <id> --json')
    );
    expect(mocks.setInput).toHaveBeenCalledWith(
      expect.stringContaining('OPL Flow 缺失或被用户卸载时不得阻断 App 核心功能')
    );
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('本轮只诊断'));
    expect(mocks.navigate).toHaveBeenCalledWith('/guid', { replace: true, state: null });
  });

  it('prefills an English post-install Codex self-check prompt for English UI', () => {
    mocks.i18nLanguage.value = 'en-US';
    mocks.locationState.value = { postInstallSelfCheck: true };

    render(<GuidPage />);

    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('Post-install intelligent self-check'));
    expect(mocks.setInput).toHaveBeenCalledWith(
      expect.stringContaining('The core first-run setup stage has completed')
    );
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('opl app state --profile fast --json'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('App core usable'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('presence-only'));
    expect(mocks.setInput).toHaveBeenCalledWith(
      expect.stringContaining('Packages explicitly removed by the user are not failures')
    );
    expect(mocks.setInput).toHaveBeenCalledWith(
      expect.stringContaining('opl packages status --package-id <id> --json')
    );
    expect(mocks.setInput).toHaveBeenCalledWith(
      expect.stringContaining('Missing or user-uninstalled OPL Flow must not block App core functionality')
    );
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('This turn is diagnostic only'));
    expect(mocks.setInput).not.toHaveBeenCalledWith(expect.stringContaining('始终用中文'));
    expect(mocks.navigate).toHaveBeenCalledWith('/guid', { replace: true, state: null });
  });
});
