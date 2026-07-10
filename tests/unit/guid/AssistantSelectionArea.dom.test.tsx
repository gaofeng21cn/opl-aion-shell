import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import type { AvailableAgent } from '@/renderer/pages/guid/types';
import AssistantSelectionArea, {
  resolveAssistantCardColumnCount,
} from '@/renderer/pages/guid/components/AssistantSelectionArea';

const assistant = (input: Partial<Assistant> & Pick<Assistant, 'id' | 'name'>): Assistant => ({
  source: 'builtin',
  name_i18n: {},
  description_i18n: {},
  enabled: true,
  sort_order: 100,
  preset_agent_type: 'codex',
  enabled_skills: [],
  custom_skill_names: [],
  disabled_builtin_skills: [],
  context_i18n: {},
  prompts: [],
  prompts_i18n: {},
  models: [],
  ...input,
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => String(options?.defaultValue ?? key),
    i18n: { language: 'zh-CN' },
  }),
}));

vi.mock('@/renderer/hooks/assistant', () => ({
  useAssistantList: () => ({
    activeAssistantId: null,
    setActiveAssistantId: vi.fn(),
    activeAssistant: null,
    isExtensionAssistant: false,
    loadAssistants: vi.fn(),
  }),
  useAssistantEditor: () => ({
    skillsModalVisible: false,
    customSkills: [],
    selectedSkills: [],
    pendingSkills: [],
    availableSkills: [],
    setPendingSkills: vi.fn(),
    setCustomSkills: vi.fn(),
    setSelectedSkills: vi.fn(),
    editAvatar: '',
    editVisible: false,
    setEditVisible: vi.fn(),
    isCreating: false,
    editName: '',
    setEditName: vi.fn(),
    editDescription: '',
    setEditDescription: vi.fn(),
    setEditAvatar: vi.fn(),
    editAgent: '',
    setEditAgent: vi.fn(),
    editContext: '',
    setEditContext: vi.fn(),
    promptViewMode: 'zh-CN',
    setPromptViewMode: vi.fn(),
    builtinAutoSkills: [],
    disabledBuiltinSkills: [],
    setDisabledBuiltinSkills: vi.fn(),
    handleSave: vi.fn(),
    handleDeleteClick: vi.fn(),
    deleteConfirmVisible: false,
    setDeleteConfirmVisible: vi.fn(),
    handleDeleteConfirm: vi.fn(),
    setDeletePendingSkillName: vi.fn(),
    setDeleteCustomSkillName: vi.fn(),
    setSkillsModalVisible: vi.fn(),
    deletePendingSkillName: '',
    deleteCustomSkillName: '',
    handleEdit: vi.fn(),
  }),
  useAssistantSkills: () => ({
    setSearchExternalQuery: vi.fn(),
    externalSources: [],
    activeSourceTab: '',
    setActiveSourceTab: vi.fn(),
    activeSource: undefined,
    filteredExternalSkills: [],
    externalSkillsLoading: false,
    searchExternalQuery: '',
    refreshing: false,
    handleRefreshExternal: vi.fn(),
    setShowAddPathModal: vi.fn(),
    showAddPathModal: false,
    setCustomPathName: vi.fn(),
    setCustomPathValue: vi.fn(),
    customPathName: '',
    customPathValue: '',
    handleAddCustomPath: vi.fn(),
    handleAddFoundSkills: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/settings/AssistantSettings/AssistantEditDrawer', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/settings/AssistantSettings/DeleteAssistantModal', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/settings/AssistantSettings/AddSkillsModal', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/settings/AssistantSettings/SkillConfirmModals', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/settings/AssistantSettings/AddCustomPathModal', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/settings/AssistantSettings/assistantUtils', () => ({
  resolveAvatarImageSrc: () => null,
}));

const assistants: Assistant[] = [
  assistant({
    id: 'mas',
    name: 'Research',
    name_i18n: { 'zh-CN': '科研', 'en-US': 'Research' },
    description_i18n: { 'zh-CN': '推进科研任务', 'en-US': 'Advance research tasks' },
    avatar: 'MAS',
    enabled_skills: ['mas'],
    prompts: ['整理当前课题'],
    prompts_i18n: { 'zh-CN': ['整理当前课题'] },
  }),
  assistant({
    id: 'mag',
    name: 'Grants',
    name_i18n: { 'zh-CN': '基金', 'en-US': 'Grants' },
    description_i18n: { 'zh-CN': '推进基金申请', 'en-US': 'Advance grant applications' },
    avatar: 'MAG',
    enabled_skills: ['mag'],
  }),
  assistant({
    id: 'rca',
    name: 'PPT',
    name_i18n: { 'zh-CN': 'PPT', 'en-US': 'PPT' },
    description_i18n: { 'zh-CN': '推进汇报材料', 'en-US': 'Advance presentation materials' },
    avatar: 'RCA',
    enabled_skills: ['rca'],
  }),
];

describe('AssistantSelectionArea', () => {
  it('maps narrow widths to fewer OPL assistant card columns', () => {
    expect(resolveAssistantCardColumnCount(800)).toBe(4);
    expect(resolveAssistantCardColumnCount(680)).toBe(3);
    expect(resolveAssistantCardColumnCount(520)).toBe(2);
    expect(resolveAssistantCardColumnCount(390)).toBe(1);
  });

  it('keeps purpose cards visible after selecting a built-in assistant', () => {
    const selectedAgentInfo: AvailableAgent = {
      id: 'mas',
      custom_agent_id: 'mas',
      agent_type: 'codex',
      backend: 'codex',
      name: '科研',
      is_preset: true,
      avatar: 'MAS',
    };

    render(
      <AssistantSelectionArea
        is_presetAgent={true}
        selectedAgentKey='custom:mas'
        selectedAgentInfo={selectedAgentInfo}
        assistants={assistants}
        localeKey='zh-CN'
        currentEffectiveAgentInfo={{
          agent_type: 'codex',
          isFallback: false,
          originalType: 'codex',
          isAvailable: true,
        }}
        onSelectAssistant={vi.fn()}
        onSetInput={vi.fn()}
        onFocusInput={vi.fn()}
      />
    );

    expect(screen.getByTestId('preset-pill-mas')).toBeInTheDocument();
    expect(screen.getByTestId('preset-pill-mag')).toBeInTheDocument();
    expect(screen.getByTestId('preset-pill-rca')).toBeInTheDocument();
    expect(screen.getByTestId('preset-pill-mas').className).toContain('assistantCardSelected');
    expect(screen.getByText('整理当前课题')).toBeInTheDocument();
  });
});
