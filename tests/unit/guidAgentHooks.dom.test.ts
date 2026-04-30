/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import React from 'react';

// Hoist mocks for ipcBridge and ConfigStorage
const bridgeMocks = vi.hoisted(() => ({
  readAssistantRule: vi.fn(),
  readAssistantSkill: vi.fn(),
  readBuiltinRule: vi.fn(),
  readBuiltinSkill: vi.fn(),
}));

vi.mock('../../src/common', () => ({
  ipcBridge: {
    fs: {
      readAssistantRule: { invoke: bridgeMocks.readAssistantRule },
      readAssistantSkill: { invoke: bridgeMocks.readAssistantSkill },
      readBuiltinRule: { invoke: bridgeMocks.readBuiltinRule },
      readBuiltinSkill: { invoke: bridgeMocks.readBuiltinSkill },
    },
  },
}));

vi.mock('../../src/common/config/storage', () => ({
  ConfigStorage: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('../../src/common/config/presets/assistantPresets', () => ({
  ASSISTANT_PRESETS: [
    {
      id: 'test-preset',
      avatar: '🧪',
      presetAgentType: 'gemini',
      ruleFiles: { 'en-US': 'test-preset.md' },
      skillFiles: { 'en-US': 'test-preset-skill.md' },
      nameI18n: { 'en-US': 'Test Preset' },
      descriptionI18n: { 'en-US': 'A test preset' },
    },
  ],
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'guid.oplQuickEntries.researchLabel': '科研',
        'guid.oplQuickEntries.researchPrompt': '@MAS 帮我推进一个医学研究任务：',
        'guid.oplQuickEntries.pptLabel': 'PPT',
        'guid.oplQuickEntries.pptPrompt': '@RCA 帮我推进一个汇报或幻灯片任务：',
        'guid.oplQuickEntries.grantLabel': '基金',
        'guid.oplQuickEntries.grantPrompt': '@MAG 帮我推进一个基金申请任务：',
      })[key] ?? key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Message: {
    useMessage: () => [{ warning: vi.fn() }, null],
  },
}));

vi.mock('@/renderer/hooks/assistant', () => ({
  useAssistantList: () => ({
    assistants: [],
    activeAssistantId: null,
    setActiveAssistantId: vi.fn(),
    activeAssistant: undefined,
    isExtensionAssistant: false,
    loadAssistants: vi.fn(),
  }),
  useDetectedAgents: () => ({
    availableBackends: [],
    refreshAgentDetection: vi.fn(),
  }),
  useAssistantEditor: () => ({
    editVisible: false,
    setEditVisible: vi.fn(),
    isCreating: false,
    editName: '',
    setEditName: vi.fn(),
    editDescription: '',
    setEditDescription: vi.fn(),
    editAvatar: '',
    setEditAvatar: vi.fn(),
    editAgent: '',
    setEditAgent: vi.fn(),
    editContext: '',
    setEditContext: vi.fn(),
    promptViewMode: 'write',
    setPromptViewMode: vi.fn(),
    availableSkills: [],
    selectedSkills: [],
    setSelectedSkills: vi.fn(),
    pendingSkills: [],
    customSkills: [],
    setCustomSkills: vi.fn(),
    setDeletePendingSkillName: vi.fn(),
    setDeleteCustomSkillName: vi.fn(),
    setSkillsModalVisible: vi.fn(),
    builtinAutoSkills: [],
    disabledBuiltinSkills: [],
    setDisabledBuiltinSkills: vi.fn(),
    handleSave: vi.fn(),
    handleDeleteClick: vi.fn(),
    deleteConfirmVisible: false,
    setDeleteConfirmVisible: vi.fn(),
    handleDeleteConfirm: vi.fn(),
    skillsModalVisible: false,
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
    handleAddFoundSkills: vi.fn(),
    showAddPathModal: false,
    setCustomPathName: vi.fn(),
    setCustomPathValue: vi.fn(),
    handleAddCustomPath: vi.fn(),
    customPathName: '',
    customPathValue: '',
  }),
}));

vi.mock('../../src/renderer/pages/settings/AssistantSettings/assistantUtils', () => ({
  resolveAvatarImageSrc: () => undefined,
}));

vi.mock('../../src/renderer/pages/settings/AssistantSettings/AssistantEditDrawer', () => ({
  default: () => null,
}));

vi.mock('../../src/renderer/pages/settings/AssistantSettings/DeleteAssistantModal', () => ({
  default: () => null,
}));

vi.mock('../../src/renderer/pages/settings/AssistantSettings/AddSkillsModal', () => ({
  default: () => null,
}));

vi.mock('../../src/renderer/pages/settings/AssistantSettings/SkillConfirmModals', () => ({
  default: () => null,
}));

vi.mock('../../src/renderer/pages/settings/AssistantSettings/AddCustomPathModal', () => ({
  default: () => null,
}));

import { useAgentAvailability } from '../../src/renderer/pages/guid/hooks/useAgentAvailability';
import { usePresetAssistantResolver } from '../../src/renderer/pages/guid/hooks/usePresetAssistantResolver';
import AssistantSelectionArea from '../../src/renderer/pages/guid/components/AssistantSelectionArea';
import type { AcpBackendConfig, AvailableAgent } from '../../src/renderer/pages/guid/types';
import type { IProvider } from '../../src/common/config/storage';

// ---------------------------------------------------------------------------
// useAgentAvailability
// ---------------------------------------------------------------------------

describe('useAgentAvailability', () => {
  const defaultAvailableAgents: AvailableAgent[] = [
    { backend: 'claude', name: 'Claude' },
    { backend: 'qwen', name: 'Qwen' },
  ];

  const defaultModelList: IProvider[] = [
    { id: '1', platform: 'openai', name: 'gpt-4', baseUrl: '', apiKey: 'k' } as IProvider,
  ];

  const stubResolvePresetAgentType = (info: { backend: string; customAgentId?: string } | undefined) =>
    info?.customAgentId ? 'codex' : (info?.backend ?? 'codex');

  // -- isMainAgentAvailable ---------------------------------------------------

  it('isMainAgentAvailable returns true when agent type exists in availableAgents', () => {
    const { result } = renderHook(() =>
      useAgentAvailability({
        modelList: [],
        isGoogleAuth: false,
        availableAgents: defaultAvailableAgents,
        resolvePresetAgentType: stubResolvePresetAgentType,
      })
    );

    expect(result.current.isMainAgentAvailable('claude')).toBe(true);
    expect(result.current.isMainAgentAvailable('qwen')).toBe(true);
  });

  it('isMainAgentAvailable returns false for unavailable agent', () => {
    const { result } = renderHook(() =>
      useAgentAvailability({
        modelList: [],
        isGoogleAuth: false,
        availableAgents: defaultAvailableAgents,
        resolvePresetAgentType: stubResolvePresetAgentType,
      })
    );

    expect(result.current.isMainAgentAvailable('codex')).toBe(false);
  });

  it('isMainAgentAvailable maps legacy gemini to Codex availability', () => {
    const { result } = renderHook(() =>
      useAgentAvailability({
        modelList: [],
        isGoogleAuth: false,
        availableAgents: [{ backend: 'codex', name: 'Codex' }],
        resolvePresetAgentType: stubResolvePresetAgentType,
      })
    );

    expect(result.current.isMainAgentAvailable('gemini')).toBe(true);
  });

  it('isMainAgentAvailable no longer treats model providers as Gemini availability', () => {
    const { result } = renderHook(() =>
      useAgentAvailability({
        modelList: defaultModelList,
        isGoogleAuth: false,
        availableAgents: [],
        resolvePresetAgentType: stubResolvePresetAgentType,
      })
    );

    expect(result.current.isMainAgentAvailable('gemini')).toBe(false);
  });

  it('isMainAgentAvailable returns false for gemini when no auth and no models', () => {
    const { result } = renderHook(() =>
      useAgentAvailability({
        modelList: [],
        isGoogleAuth: false,
        availableAgents: [],
        resolvePresetAgentType: stubResolvePresetAgentType,
      })
    );

    expect(result.current.isMainAgentAvailable('gemini')).toBe(false);
  });

  // -- getEffectiveAgentType ---------------------------------------------------

  it('getEffectiveAgentType returns resolved agent type with availability info', () => {
    const { result } = renderHook(() =>
      useAgentAvailability({
        modelList: [],
        isGoogleAuth: false,
        availableAgents: defaultAvailableAgents,
        resolvePresetAgentType: stubResolvePresetAgentType,
      })
    );

    const info = result.current.getEffectiveAgentType({ backend: 'claude' });
    expect(info.agentType).toBe('claude');
    expect(info.originalType).toBe('claude');
    expect(info.isAvailable).toBe(true);
    expect(info.isFallback).toBe(false);
  });

  it('getEffectiveAgentType marks unavailable agent correctly', () => {
    const { result } = renderHook(() =>
      useAgentAvailability({
        modelList: [],
        isGoogleAuth: false,
        availableAgents: [],
        resolvePresetAgentType: stubResolvePresetAgentType,
      })
    );

    const info = result.current.getEffectiveAgentType({ backend: 'codex' });
    expect(info.agentType).toBe('codex');
    expect(info.isAvailable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// usePresetAssistantResolver
// ---------------------------------------------------------------------------

describe('usePresetAssistantResolver', () => {
  const customAgents: AcpBackendConfig[] = [
    {
      id: 'agent-alpha',
      name: 'Alpha',
      isPreset: false,
      enabled: true,
      presetAgentType: 'claude',
      enabledSkills: ['code-review', 'testing'],
    } as AcpBackendConfig,
    {
      id: 'agent-beta',
      name: 'Beta',
      isPreset: true,
      enabled: true,
      presetAgentType: 'qwen',
    } as AcpBackendConfig,
  ];

  beforeEach(() => {
    bridgeMocks.readAssistantRule.mockResolvedValue('');
    bridgeMocks.readAssistantSkill.mockResolvedValue('');
    bridgeMocks.readBuiltinRule.mockResolvedValue('');
    bridgeMocks.readBuiltinSkill.mockResolvedValue('');
  });

  // -- resolvePresetAgentType -------------------------------------------------

  it('resolvePresetAgentType returns backend directly for non-custom agents', () => {
    const { result } = renderHook(() => usePresetAssistantResolver({ customAgents, localeKey: 'en-US' }));

    expect(result.current.resolvePresetAgentType({ backend: 'claude' })).toBe('claude');
    expect(result.current.resolvePresetAgentType({ backend: 'gemini' })).toBe('gemini');
  });

  it('resolvePresetAgentType resolves preset agent to its presetAgentType', () => {
    const { result } = renderHook(() => usePresetAssistantResolver({ customAgents, localeKey: 'en-US' }));

    expect(result.current.resolvePresetAgentType({ backend: 'claude', customAgentId: 'agent-alpha' })).toBe('claude');

    expect(result.current.resolvePresetAgentType({ backend: 'qwen', customAgentId: 'agent-beta' })).toBe('qwen');
  });

  it('resolvePresetAgentType defaults to codex for unknown preset agent', () => {
    const { result } = renderHook(() => usePresetAssistantResolver({ customAgents, localeKey: 'en-US' }));

    expect(result.current.resolvePresetAgentType({ backend: 'claude', customAgentId: 'unknown-id' })).toBe('codex');
  });

  it('resolvePresetAgentType returns codex when agentInfo is undefined', () => {
    const { result } = renderHook(() => usePresetAssistantResolver({ customAgents, localeKey: 'en-US' }));

    expect(result.current.resolvePresetAgentType(undefined)).toBe('codex');
  });

  // -- resolveEnabledSkills ---------------------------------------------------

  it('resolveEnabledSkills returns skills list for custom agent', () => {
    const { result } = renderHook(() => usePresetAssistantResolver({ customAgents, localeKey: 'en-US' }));

    expect(result.current.resolveEnabledSkills({ backend: 'claude', customAgentId: 'agent-alpha' })).toEqual([
      'code-review',
      'testing',
    ]);
  });

  it('resolveEnabledSkills returns undefined for non-custom backend', () => {
    const { result } = renderHook(() => usePresetAssistantResolver({ customAgents, localeKey: 'en-US' }));

    expect(result.current.resolveEnabledSkills({ backend: 'claude' })).toBeUndefined();
  });

  it('resolveEnabledSkills returns undefined when agentInfo is undefined', () => {
    const { result } = renderHook(() => usePresetAssistantResolver({ customAgents, localeKey: 'en-US' }));

    expect(result.current.resolveEnabledSkills(undefined)).toBeUndefined();
  });

  it('resolveEnabledSkills returns undefined for custom agent without skills', () => {
    const { result } = renderHook(() => usePresetAssistantResolver({ customAgents, localeKey: 'en-US' }));

    // agent-beta has no enabledSkills defined
    expect(result.current.resolveEnabledSkills({ backend: 'qwen', customAgentId: 'agent-beta' })).toBeUndefined();
  });

  // -- resolvePresetRulesAndSkills --------------------------------------------

  it('resolvePresetRulesAndSkills returns context as rules for non-custom backend', async () => {
    const { result } = renderHook(() => usePresetAssistantResolver({ customAgents, localeKey: 'en-US' }));

    const resolved = await result.current.resolvePresetRulesAndSkills({
      backend: 'claude',
      context: 'You are a helpful assistant',
    });

    expect(resolved.rules).toBe('You are a helpful assistant');
    expect(resolved.skills).toBeUndefined();
  });

  it('resolvePresetRulesAndSkills reads rules and skills for custom agent', async () => {
    bridgeMocks.readAssistantRule.mockResolvedValue('Custom rule content');
    bridgeMocks.readAssistantSkill.mockResolvedValue('Custom skill content');

    const { result } = renderHook(() => usePresetAssistantResolver({ customAgents, localeKey: 'en-US' }));

    const resolved = await result.current.resolvePresetRulesAndSkills({
      backend: 'claude',
      customAgentId: 'agent-alpha',
      context: 'fallback context',
    });

    expect(resolved.rules).toBe('Custom rule content');
    expect(resolved.skills).toBe('Custom skill content');
  });

  it('resolvePresetRulesAndSkills returns empty object when agentInfo is undefined', async () => {
    const { result } = renderHook(() => usePresetAssistantResolver({ customAgents, localeKey: 'en-US' }));

    const resolved = await result.current.resolvePresetRulesAndSkills(undefined);
    expect(resolved).toEqual({});
  });
});

describe('AssistantSelectionArea OPL quick entries', () => {
  const renderArea = (overrides?: {
    customAgents?: AcpBackendConfig[];
    onSetInput?: (value: string) => void;
    onFocusInput?: () => void;
  }) =>
    render(
      React.createElement(AssistantSelectionArea, {
        isPresetAgent: false,
        selectedAgentInfo: undefined,
        customAgents: overrides?.customAgents ?? [],
        localeKey: 'zh-CN',
        currentEffectiveAgentInfo: {
          agentType: 'codex',
          originalType: 'codex',
          isAvailable: true,
          isFallback: false,
        },
        onSelectAssistant: vi.fn(),
        onSetInput: overrides?.onSetInput ?? vi.fn(),
        onFocusInput: overrides?.onFocusInput ?? vi.fn(),
      })
    );

  it('renders Research, PPT, and Grant quick entries before preset assistants load', () => {
    renderArea({ customAgents: [] });

    expect(screen.getByTestId('opl-module-pill-mas')).toHaveTextContent('科研');
    expect(screen.getByTestId('opl-module-pill-rca')).toHaveTextContent('PPT');
    expect(screen.getByTestId('opl-module-pill-mag')).toHaveTextContent('基金');
  });

  it('fills the matching module prompt when a quick entry is clicked', () => {
    const onSetInput = vi.fn();
    const onFocusInput = vi.fn();
    renderArea({ onSetInput, onFocusInput });

    fireEvent.click(screen.getByTestId('opl-module-pill-rca'));

    expect(onSetInput).toHaveBeenCalledWith('@RCA 帮我推进一个汇报或幻灯片任务：');
    expect(onFocusInput).toHaveBeenCalledOnce();
  });
});
