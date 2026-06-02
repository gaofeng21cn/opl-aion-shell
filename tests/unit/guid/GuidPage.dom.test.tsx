import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import type { AvailableAgent } from '@/renderer/pages/guid/types';
import GuidPage from '@/renderer/pages/guid/GuidPage';

const mocks = vi.hoisted(() => ({
  i18nLanguage: { value: 'zh-CN' },
  locationState: { value: null as Record<string, unknown> | null },
  navigate: vi.fn(),
  setSelectedAgentKey: vi.fn(),
  setMentionSelectorVisible: vi.fn(),
  setInput: vi.fn(),
  setFiles: vi.fn(),
  setDir: vi.fn(),
  setLoading: vi.fn(),
  useGuidSend: vi.fn(() => ({
    handleSend: vi.fn().mockResolvedValue(undefined),
    sendMessageHandler: vi.fn(),
    isButtonDisabled: true,
  })),
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

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      listBuiltinAutoSkills: {
        invoke: vi.fn().mockResolvedValue([{ name: 'aionui-skills', description: 'Upstream AionUI auto skill' }]),
      },
      listAvailableSkills: {
        invoke: vi.fn().mockResolvedValue([
          { name: 'mas', description: 'MAS skill' },
          { name: 'officecli-docx', description: 'Word documents' },
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
    t: (key: string, options?: Record<string, unknown>) => String(options?.defaultValue ?? key),
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
    selectedAgentKey: 'custom:mas',
    setSelectedAgentKey: mocks.setSelectedAgentKey,
    defaultAgentKey: 'codex',
    selectedAgent: 'custom',
    selectedAgentInfo,
    is_presetAgent: true,
    availableAgents: [{ agent_type: 'codex', backend: 'codex', name: 'Codex' }],
    assistants: [selectedAssistant],
    customAgents: [],
    selectedMode: 'default',
    setSelectedMode: vi.fn(),
    selectedAcpModel: null,
    setSelectedAcpModel: vi.fn(),
    currentAcpCachedModelInfo: {
      current_model_id: 'gpt-5.5',
      current_model_label: 'GPT-5.5（超高）',
      available_models: [],
    },
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
    input: '',
    setInput: mocks.setInput,
    files: [],
    setFiles: mocks.setFiles,
    dir: '',
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
    mentionSelectorVisible: true,
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
    selectedAgentLabel: 'MAS',
    mentionMenuSelectedKey: 'custom:mas',
  }),
}));

vi.mock('@/renderer/pages/guid/hooks/useGuidSend', () => ({
  useGuidSend: mocks.useGuidSend,
}));

vi.mock('@/renderer/pages/guid/hooks/useTypewriterPlaceholder', () => ({
  useTypewriterPlaceholder: () => '描述任务',
}));

vi.mock('@/renderer/pages/guid/components/GuidInputCard', () => ({
  default: ({
    mentionSelectorBadge,
    placeholder,
    actionRow,
  }: {
    mentionSelectorBadge: React.ReactNode;
    placeholder: string;
    actionRow: React.ReactNode;
  }) => (
    <div data-testid='guid-input-card'>
      {mentionSelectorBadge}
      <div data-testid='guid-placeholder'>{placeholder}</div>
      {actionRow}
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
    mocks.navigate.mockClear();
    mocks.setInput.mockClear();
    mocks.setFiles.mockClear();
    mocks.setDir.mockClear();
    mocks.setLoading.mockClear();
    mocks.useGuidSend.mockClear();
  });

  it('keeps the default hero and shows the selected built-in assistant as a compact @ tag', async () => {
    render(<GuidPage />);

    expect(screen.getByText('@MAS')).toBeInTheDocument();
    expect(screen.getByTestId('guid-placeholder')).toHaveTextContent('MAS');
    expect(screen.getByText('conversation.welcome.title')).toBeInTheDocument();
    expect(screen.getByTestId('opl-home-model-status')).toHaveTextContent('模型: GPT-5.5（超高）');
    expect(screen.queryByText('Med Auto Science')).not.toBeInTheDocument();
    expect(screen.queryByText(/Default Codex CLI/)).not.toBeInTheDocument();
    expect(screen.getByTestId('guid-model-selector')).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.useGuidSend).toHaveBeenCalledWith(expect.objectContaining({ guidEnabledSkills: ['mas'] }));
    });
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
    expect(ipcBridge.fs.listBuiltinAutoSkills.invoke).not.toHaveBeenCalled();
    expect(ipcBridge.fs.listAvailableSkills.invoke).toHaveBeenCalled();
    await waitFor(() =>
      expect(mocks.useGuidSend).toHaveBeenLastCalledWith(
        expect.objectContaining({
          guidDisabledBuiltinSkills: [],
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

  it('prefills a Chinese post-install Codex self-check prompt from first-run navigation state', () => {
    mocks.locationState.value = { postInstallSelfCheck: true };

    render(<GuidPage />);

    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('安装后智能自检'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('程序化初始化已经完成'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('opl-flow'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('不要覆盖用户已有的 AGENTS.md'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('MAS/MAG/RCA'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('模块自动更新'));
    expect(mocks.navigate).toHaveBeenCalledWith('/guid', { replace: true, state: null });
  });

  it('prefills an English post-install Codex self-check prompt for English UI', () => {
    mocks.i18nLanguage.value = 'en-US';
    mocks.locationState.value = { postInstallSelfCheck: true };

    render(<GuidPage />);

    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('Post-install intelligent self-check'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('Programmatic initialization has completed'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('opl-flow'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('Do not overwrite the user'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('MAS/MAG/RCA'));
    expect(mocks.setInput).toHaveBeenCalledWith(expect.stringContaining('module auto-update'));
    expect(mocks.setInput).not.toHaveBeenCalledWith(expect.stringContaining('始终用中文'));
    expect(mocks.navigate).toHaveBeenCalledWith('/guid', { replace: true, state: null });
  });
});
