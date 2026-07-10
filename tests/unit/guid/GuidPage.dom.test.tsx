import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import type { AvailableAgent } from '@/renderer/pages/guid/types';
import GuidPage from '@/renderer/pages/guid/GuidPage';

const mocks = vi.hoisted(() => ({
  i18nLanguage: { value: 'zh-CN' },
  translate: (key: string, options?: Record<string, unknown>) =>
    String(
      options?.defaultValue ??
        ({
          'guid.inspector.title': '上下文',
          'guid.inspector.open': '打开上下文',
          'guid.inspector.files': '文件',
          'guid.inspector.capabilities': '能力',
          'guid.inspector.runtime': '运行',
          'guid.inspector.memory': '记忆',
          'guid.inspector.automations': '自动化',
          'guid.inspector.settings': '设置',
        }[key] ||
          key)
    ),
  locationState: { value: null as Record<string, unknown> | null },
  navigate: vi.fn(),
  setSelectedAgentKey: vi.fn(),
  setMentionSelectorVisible: vi.fn(),
  setInput: vi.fn(),
  setFiles: vi.fn(),
  setDir: vi.fn(),
  setLoading: vi.fn(),
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
          health_status: 'ready',
        },
      },
    } as Record<string, unknown>,
  },
  guidInput: {
    input: '',
    files: [] as string[],
    dir: '',
  },
  sendMessageHandler: vi.fn(),
  sendDisabled: { value: true },
  slashExecuteBuiltin: { value: undefined as ((name: string) => void) | undefined },
  useGuidSend: vi.fn(() => ({
    handleSend: vi.fn().mockResolvedValue(undefined),
    sendMessageHandler: mocks.sendMessageHandler,
    isButtonDisabled: mocks.sendDisabled.value,
  })),
  isPresetAgent: { value: true },
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
    key: 'guid-test',
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

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  useOplAppState: () => ({ appState: mocks.appState.value }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  openExternalUrl: vi.fn().mockResolvedValue(undefined),
  resolveExtensionAssetUrl: (value?: string) => value,
  isElectronDesktop: () => false,
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
    assistants: [selectedAssistant],
    customAgents: [],
    selectedMode: 'default',
    setSelectedMode: vi.fn(),
    selectedAcpModel: null,
    setSelectedAcpModel: vi.fn(),
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
    onPaste: vi.fn(),
    dragHandlers: {},
  }),
}));

vi.mock('@/renderer/pages/guid/hooks/useGuidMention', () => ({
  useGuidMention: () => ({
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
    selectedAgentLabel: mocks.isPresetAgent.value ? 'MAS' : 'Codex',
    mentionMenuSelectedKey: mocks.isPresetAgent.value ? 'custom:mas' : 'codex',
  }),
}));

vi.mock('@/renderer/pages/guid/hooks/useGuidSend', () => ({
  useGuidSend: mocks.useGuidSend,
}));

vi.mock('@/renderer/hooks/chat/useSlashCommandController', () => ({
  useSlashCommandController: (options: { onExecuteBuiltin?: (name: string) => void }) => {
    mocks.slashExecuteBuiltin.value = options.onExecuteBuiltin;
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
    mentionSelectorBadge,
    placeholder,
    actionRow,
    workspaceAccessDisabled,
  }: {
    mentionSelectorBadge: React.ReactNode;
    placeholder: string;
    actionRow: React.ReactNode;
    workspaceAccessDisabled?: boolean;
  }) => (
    <div data-testid='guid-input-card'>
      {mentionSelectorBadge}
      <div data-testid='guid-placeholder'>{placeholder}</div>
      {actionRow}
      {workspaceAccessDisabled ? <div data-testid='opl-guid-workspace-access-disabled' /> : null}
    </div>
  ),
}));

vi.mock('@/renderer/pages/guid/components/AssistantSelectionArea', () => ({
  default: () => <div data-testid='assistant-selection-area' />,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/FeedbackReportModal', () => ({
  default: () => null,
}));

describe('GuidPage selected purpose assistant surface', () => {
  beforeEach(() => {
    mocks.i18nLanguage.value = 'zh-CN';
    mocks.locationState.value = null;
    mocks.isPresetAgent.value = true;
    mocks.navigate.mockClear();
    mocks.setInput.mockClear();
    mocks.setFiles.mockClear();
    mocks.setDir.mockClear();
    mocks.setLoading.mockClear();
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
          health_status: 'ready',
        },
      },
    };
    mocks.guidInput.input = '';
    mocks.guidInput.files = [];
    mocks.guidInput.dir = '';
    mocks.sendMessageHandler.mockClear();
    mocks.sendDisabled.value = true;
    mocks.slashExecuteBuiltin.value = undefined;
    mocks.ensureBackendMcpCatalog.mockResolvedValue({
      allServers: [
        {
          id: 'unknown-mcp',
          name: 'Unknown MCP',
          enabled: true,
          transport: { type: 'stdio', command: 'echo' },
          created_at: 1,
          updated_at: 1,
          original_json: '{}',
        },
        {
          id: 'aionui-image-generation',
          name: 'AionUI Image Generation',
          enabled: true,
          builtin: true,
          transport: { type: 'stdio', command: 'echo' },
          created_at: 1,
          updated_at: 1,
          original_json: '{}',
        },
      ],
    });
    mocks.useGuidSend.mockClear();
  });

  it('keeps the default hero and shows the selected built-in assistant as a compact @ tag', async () => {
    render(<GuidPage />);

    expect(screen.getByTestId('opl-chat-first-frame')).toBeInTheDocument();
    expect(screen.queryByTestId('opl-guid-context-inspector')).not.toBeInTheDocument();
    expect(screen.getByText('@MAS')).toBeInTheDocument();
    expect(screen.getByTestId('guid-placeholder')).toHaveTextContent('MAS');
    expect(screen.getByText('conversation.welcome.title')).toBeInTheDocument();
    expect(screen.queryByTestId('opl-home-model-status')).not.toBeInTheDocument();
    expect(screen.queryByText('模型: GPT-5.5')).not.toBeInTheDocument();
    expect(screen.queryByText('Med Auto Science')).not.toBeInTheDocument();
    expect(screen.queryByText(/Default Codex CLI/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('guid-model-selector')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.useGuidSend).toHaveBeenCalledWith(
        expect.objectContaining({ guidEnabledSkills: ['med-autoscience'] })
      );
    });
  });

  it('keeps ordinary Home skills and MCP servers inside the App-owned OPL allowlist', async () => {
    render(<GuidPage />);

    await waitFor(() => {
      expect(mocks.useGuidSend).toHaveBeenLastCalledWith(
        expect.objectContaining({
          guidEnabledSkills: ['med-autoscience'],
          guidDisabledBuiltinSkills: ['aionui-skills', 'aionui-webui-setup', 'skill-creator', 'cron'],
          availableMcpServers: [],
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

  it('opens the right context inspector with App-owned context tabs on request', async () => {
    render(<GuidPage />);

    expect(screen.queryByTestId('opl-guid-context-inspector')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('opl-guid-context-inspector-toggle'));

    expect(screen.getByTestId('opl-guid-context-inspector')).toBeInTheDocument();
    expect(screen.getByTestId('opl-inspector-tab-files')).toHaveTextContent('文件');
    expect(screen.getByTestId('opl-inspector-tab-capabilities')).toHaveTextContent('能力');
    expect(screen.getByTestId('opl-inspector-tab-runtime')).toHaveTextContent('运行');
    expect(screen.getByTestId('opl-inspector-tab-memory')).toHaveTextContent('记忆');
    expect(screen.getByTestId('opl-inspector-tab-automations')).toHaveTextContent('自动化');
    expect(screen.getByTestId('opl-inspector-tab-settings')).toHaveTextContent('设置');
  });

  it('does not open an execution-agent dropdown from the selected built-in assistant badge', async () => {
    render(<GuidPage />);
    mocks.setMentionSelectorVisible.mockClear();

    await userEvent.click(screen.getByText('@MAS'));

    expect(mocks.setMentionSelectorVisible).not.toHaveBeenCalled();
    expect(screen.queryByText('Codex')).not.toBeInTheDocument();
  });

  it('lets the user clear the selected purpose and return to the default agent', async () => {
    render(<GuidPage />);

    await userEvent.click(screen.getByRole('button', { name: 'common.clear' }));

    expect(mocks.setSelectedAgentKey).toHaveBeenCalledWith('codex');
    expect(mocks.setMentionSelectorVisible).toHaveBeenCalledWith(false);
  });

  it('loads only App-packaged available skills on the OPL home path', async () => {
    render(<GuidPage />);

    await screen.findByText('@MAS');

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

  it('restricts file and project context without blocking a plain conversation', async () => {
    mocks.isPresetAgent.value = false;
    mocks.guidInput.input = '只进行文字对话';
    mocks.sendDisabled.value = false;
    mocks.appState.value = {
      ...mocks.appState.value,
      paths: {
        workspace_root: {
          selected_path: '/Users/example/OPL Workspace',
          exists: false,
          health_status: 'missing',
        },
      },
    };

    render(<GuidPage />);

    expect(screen.getByTestId('opl-guid-file-access-disabled')).toBeInTheDocument();
    expect(screen.getByTestId('opl-guid-workspace-access-disabled')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('guid-send-btn'));
    expect(mocks.sendMessageHandler).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('opl-guid-setup-notice')).not.toBeInTheDocument();
  });

  it('blocks the /open file command without clearing the draft when workspace setup is incomplete', async () => {
    mocks.isPresetAgent.value = false;
    mocks.guidInput.input = '/';
    mocks.appState.value = {
      ...mocks.appState.value,
      paths: {
        workspace_root: {
          selected_path: '/Users/example/OPL Workspace',
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

    expect(ipcBridge.dialog.showOpen.invoke).not.toHaveBeenCalled();
    expect(mocks.setInput).toHaveBeenCalledTimes(setInputCallCount);
    expect(screen.getByTestId('opl-guid-setup-notice')).toHaveTextContent(
      'common.firstRunRecovery.notice.workspace.title'
    );
  });

  it('prefills a Chinese post-install Codex self-check prompt from first-run navigation state', () => {
    mocks.locationState.value = { postInstallSelfCheck: true };

    render(<GuidPage />);

    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('安装后智能自检'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('程序化初始化已经完成'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('OPL Flow'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('用户已有工作区规则可以共存'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('MAS/MAG/RCA/OMA/OBF'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('后台维护'));
    expect(mocks.navigate).toHaveBeenCalledWith('/guid', { replace: true, state: null });
  });

  it('prefills an English post-install Codex self-check prompt for English UI', () => {
    mocks.i18nLanguage.value = 'en-US';
    mocks.locationState.value = { postInstallSelfCheck: true };

    render(<GuidPage />);

    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('Post-install intelligent self-check'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('Programmatic initialization has completed'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('OPL Flow'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('existing workspace rules'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('MAS/MAG/RCA/OMA/OBF'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('background maintenance'));
    expect(mocks.setInput).not.toHaveBeenCalledWith(expect.stringContaining('始终用中文'));
    expect(mocks.navigate).toHaveBeenCalledWith('/guid', { replace: true, state: null });
  });
});
