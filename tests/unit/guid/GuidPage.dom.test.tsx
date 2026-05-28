import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import type { AvailableAgent } from '@/renderer/pages/guid/types';
import GuidPage from '@/renderer/pages/guid/GuidPage';

const mocks = vi.hoisted(() => ({
  setSelectedAgentKey: vi.fn(),
  setMentionSelectorVisible: vi.fn(),
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
      listAvailableSkills: { invoke: vi.fn().mockResolvedValue([]) },
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
    i18n: { language: 'zh-CN' },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ key: 'guid-test', pathname: '/guid', search: '', hash: '', state: null }),
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
      current_model_label: 'gpt-5.5xhigh',
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
    setInput: vi.fn(),
    files: [],
    setFiles: vi.fn(),
    dir: '',
    setDir: vi.fn(),
    loading: false,
    setLoading: vi.fn(),
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
  default: ({ mentionSelectorBadge, placeholder }: { mentionSelectorBadge: React.ReactNode; placeholder: string }) => (
    <div data-testid='guid-input-card'>
      {mentionSelectorBadge}
      <div data-testid='guid-placeholder'>{placeholder}</div>
    </div>
  ),
}));

vi.mock('@/renderer/pages/guid/components/AssistantSelectionArea', () => ({
  default: () => <div data-testid='assistant-selection-area' />,
}));

vi.mock('@/renderer/pages/guid/components/QuickActionButtons', () => ({
  default: () => <div data-testid='quick-actions' />,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/FeedbackReportModal', () => ({
  default: () => null,
}));

describe('GuidPage selected purpose assistant surface', () => {
  beforeEach(() => {
    mocks.useGuidSend.mockClear();
  });

  it('keeps the default hero and shows the selected built-in assistant as a compact @ tag', async () => {
    render(<GuidPage />);

    expect(screen.getByText('@MAS')).toBeInTheDocument();
    expect(screen.getByTestId('guid-placeholder')).toHaveTextContent('MAS');
    expect(screen.getByText('conversation.welcome.title')).toBeInTheDocument();
    expect(screen.queryByText('Med Auto Science')).not.toBeInTheDocument();
    expect(screen.queryByText(/Default Codex CLI/)).not.toBeInTheDocument();
    expect(screen.queryByText('gpt-5.5xhigh')).not.toBeInTheDocument();
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

  it('keeps upstream builtin-auto skills disabled on the OPL home path by default', async () => {
    render(<GuidPage />);

    await screen.findByText('@MAS');

    await waitFor(() =>
      expect(mocks.useGuidSend).toHaveBeenLastCalledWith(
        expect.objectContaining({
          guidDisabledBuiltinSkills: ['aionui-skills'],
        })
      )
    );
  });
});
