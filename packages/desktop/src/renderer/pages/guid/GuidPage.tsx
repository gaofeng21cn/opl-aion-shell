/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import {
  filterOplOrdinaryMcpServers,
  getOplOrdinarySkillAllowlist,
  getOplOrdinaryCapabilitySelectorPolicy,
  getOplAssistantSkillProfile,
  getOplModelStatusDisplayText,
  shouldShowOplCodexModelSelector,
  shouldShowOplHomePermissionModeSelector,
} from '@/common/config/oplProductProfile';
import type { IMcpServer } from '@/common/config/storage';
import { resolveLocaleKey } from '@/common/utils';

import { useInputFocusRing } from '@/renderer/hooks/chat/useInputFocusRing';
import AssistantSelectionArea from './components/AssistantSelectionArea';
import GuidActionRow from './components/GuidActionRow';
import GuidInputCard from './components/GuidInputCard';
import GuidModelSelector from './components/GuidModelSelector';
import MentionDropdown, { MentionSelectorBadge } from './components/MentionDropdown';
import { useGuidAgentSelection } from './hooks/useGuidAgentSelection';
import { useGuidInput } from './hooks/useGuidInput';
import { useGuidMention } from './hooks/useGuidMention';
import { useGuidModelSelection } from './hooks/useGuidModelSelection';
import { useGuidSend } from './hooks/useGuidSend';
import { useTypewriterPlaceholder } from './hooks/useTypewriterPlaceholder';
import { buildAssistantScopedSkillMenuItems, mergeRequiredSkills } from './utils/assistantSkillMenu';
import { ensureBackendMcpCatalog } from '@/renderer/hooks/mcp/catalog';
import SpeechInputButton from '@/renderer/components/chat/SpeechInputButton';
import { appendSpeechTranscript } from '@/renderer/hooks/system/useSpeechInput';
import { useLiveTranscriptInsertion } from '@/renderer/hooks/system/useLiveTranscriptInsertion';
import { resolveAgentLogo } from '@/renderer/utils/model/agentLogo';
import { shouldShowOplHomeAgentTabs } from './oplGuidProfile';
import { Button, ConfigProvider } from '@arco-design/web-react';
import { Down, FolderOpen, History, Link, MemoryCard, Right, SettingTwo, Timer } from '@icon-park/react';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import styles from './index.module.css';

const EMPTY_GUID_SKILLS: string[] = [];
const DEFAULT_AUTO_SKILL_EXCLUSIONS = getOplOrdinaryCapabilitySelectorPolicy().forbidden_skill_examples;

type GuidNavigationState = {
  resetAssistant?: boolean;
  selectedAgentKey?: string;
  workspace?: string;
  postInstallSelfCheck?: boolean;
};

const POST_INSTALL_SELF_CHECK_PROMPT_DEFAULTS: Record<'zh-CN' | 'en-US', string> = {
  'zh-CN': [
    '安装后智能自检',
    '',
    '程序化初始化已经完成，现在请基于当前环境检查 One Person Lab App 的安装后工作模式是否符合预期。',
    '',
    '目标态：',
    '1. Codex CLI 可以被 App 正常调用。',
    '2. App 创建的 Codex 会话使用 session-scoped opl-flow 上下文。',
    '3. 当前 UI 语言策略正确：中文界面用中文，英文界面用英文。',
    '4. 尊重用户已有的 AGENTS.md，不覆盖、不重复追加；如与 App 管理的 opl-flow 上下文冲突，请指出冲突。',
    '5. MAS/MAG/RCA 路由、OPL Meta Agent 能力、Codex skill/plugin 在安装后可见可用。',
    '6. 模块自动更新后，Codex 插件和 skill 仍然注册并可调用。',
    '',
    '请先只读诊断：给出结论、证据、发现的问题和建议动作。不要覆盖用户已有的 AGENTS.md；如果需要修改文件或执行修复，请先说明原因、影响范围和具体命令，等我确认后再执行。',
  ].join('\n'),
  'en-US': [
    'Post-install intelligent self-check',
    '',
    'Programmatic initialization has completed. Please inspect the current environment and verify that the installed One Person Lab App working mode matches the intended target state.',
    '',
    'Target state:',
    '1. Codex CLI is callable from the App.',
    '2. App-created Codex sessions use session-scoped opl-flow context.',
    '3. The UI language policy is correct: use Chinese only when the UI is Chinese, and use English when the UI is English.',
    "4. Respect the user's existing AGENTS.md. Do not overwrite it or append duplicate rules; report conflicts with App-managed opl-flow context instead.",
    '5. MAS/MAG/RCA routing, OPL Meta Agent capability, and Codex skills/plugins are visible and usable after installation.',
    '6. After module auto-update, Codex plugins and skills remain registered and callable.',
    '',
    "Start with read-only diagnosis: report the conclusion, evidence, issues, and recommended actions. Do not overwrite the user's AGENTS.md. If a file change or repair command is needed, explain the reason, impact, and exact command first, then wait for my confirmation.",
  ].join('\n'),
};

function buildPostInstallSelfCheckPrompt(
  t: (key: string, options?: Record<string, unknown>) => string,
  localeKey: 'zh-CN' | 'en-US'
): string {
  return t('guid.postInstallSelfCheck.prompt', {
    defaultValue: POST_INSTALL_SELF_CHECK_PROMPT_DEFAULTS[localeKey],
  });
}

const GuidPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const guidContainerRef = useRef<HTMLDivElement>(null);
  const openAssistantDetailsRef = useRef<(() => void) | null>(null);
  const descriptionTextRef = useRef<HTMLDivElement>(null);
  const preservePostInstallPromptRef = useRef(false);
  const { activeBorderColor, inactiveBorderColor, activeShadow } = useInputFocusRing();
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);

  const localeKey = resolveLocaleKey(i18n.language);

  useEffect(() => {
    document.title = 'One Person Lab App';
  }, []);

  // --- Skills state ---
  // Home skill choices are bounded by the App product packaged skill set.
  // Upstream AionUI builtin-auto skills are shell candidates, not home catalog
  // policy.
  const [allSkills, setAllSkills] = useState<Array<{ name: string; description: string; isAuto: boolean }>>([]);
  const [guidDisabledBuiltinSkills, setGuidDisabledBuiltinSkills] = useState<string[] | undefined>(
    DEFAULT_AUTO_SKILL_EXCLUSIONS
  );
  const [guidEnabledSkills, setGuidEnabledSkills] = useState<string[] | undefined>(undefined);
  const [availableMcpServers, setAvailableMcpServers] = useState<IMcpServer[]>([]);
  const [guidSelectedMcpServerIds, setGuidSelectedMcpServerIds] = useState<string[] | undefined>(undefined);

  useEffect(() => {
    ipcBridge.fs.listAvailableSkills
      .invoke()
      .then((availableSkills) => {
        const descriptionByName = new Map(availableSkills.map((skill) => [skill.name, skill.description]));
        setAllSkills(
          getOplOrdinarySkillAllowlist().map((name) => ({
            name,
            description: descriptionByName.get(name) ?? '',
            isAuto: false,
          }))
        );
      })
      .catch(() => {
        setAllSkills(getOplOrdinarySkillAllowlist().map((name) => ({ name, description: '', isAuto: false })));
      });
  }, []);

  useEffect(() => {
    const ordinarySkillNames = new Set(getOplOrdinarySkillAllowlist());
    ipcBridge.fs.listBuiltinAutoSkills
      .invoke()
      .then((autoSkills) => {
        setGuidDisabledBuiltinSkills(
          Array.from(
            new Set([
              ...DEFAULT_AUTO_SKILL_EXCLUSIONS,
              ...autoSkills.map((skill) => skill.name).filter((name) => !ordinarySkillNames.has(name)),
            ])
          )
        );
      })
      .catch(() => {
        setGuidDisabledBuiltinSkills(DEFAULT_AUTO_SKILL_EXCLUSIONS);
      });
  }, []);

  useEffect(() => {
    void ensureBackendMcpCatalog()
      .then(({ allServers }) => {
        const visibleServers = filterOplOrdinaryMcpServers(allServers);
        const visibleIds = new Set(visibleServers.map((server) => server.id));
        setAvailableMcpServers(visibleServers);
        setGuidSelectedMcpServerIds((prev) => (prev ?? []).filter((id) => visibleIds.has(id)));
      })
      .catch((error) => {
        console.error('[GuidPage] Failed to load MCP catalog:', error);
        setAvailableMcpServers([]);
        setGuidSelectedMcpServerIds((prev) => prev ?? []);
      });
  }, []);

  const handleToggleSkill = useCallback((skillName: string, isAuto: boolean) => {
    if (isAuto) {
      setGuidDisabledBuiltinSkills((prev) => {
        const list = prev ?? [];
        return list.includes(skillName) ? list.filter((s) => s !== skillName) : [...list, skillName];
      });
    } else {
      setGuidEnabledSkills((prev) => {
        const list = prev ?? [];
        return list.includes(skillName) ? list.filter((s) => s !== skillName) : [...list, skillName];
      });
    }
  }, []);

  const handleToggleMcpServer = useCallback((serverId: string) => {
    setGuidSelectedMcpServerIds((prev) => {
      const current = prev ?? [];
      return current.includes(serverId) ? current.filter((id) => id !== serverId) : [...current, serverId];
    });
  }, []);

  // --- Hooks ---
  // Only aionrs uses this provider-based model picker now (Gemini runs as a
  // regular ACP backend with its own model selector).
  const modelSelection = useGuidModelSelection('aionrs');

  const navState = location.state as GuidNavigationState | null;
  const resetAssistantRequested = navState?.resetAssistant === true;
  const preselectAgentKey = navState?.selectedAgentKey;
  const postInstallSelfCheckRequested = navState?.postInstallSelfCheck === true;
  const agentSelection = useGuidAgentSelection({
    modelList: modelSelection.modelList,
    isGoogleAuth: modelSelection.isGoogleAuth,
    localeKey,
    resetAssistant: resetAssistantRequested,
    preselectAgentKey,
    locationKey: location.key,
  });

  const guidInput = useGuidInput({
    locationState: navState,
  });

  const selectedAssistantRecord = useMemo(() => {
    if (!agentSelection.is_presetAgent || !agentSelection.selectedAgentInfo?.custom_agent_id) return undefined;
    const selectedId = agentSelection.selectedAgentInfo.custom_agent_id;
    const strippedId = selectedId.replace(/^builtin-/, '');
    const candidates = new Set([selectedId, `builtin-${strippedId}`, strippedId]);
    return agentSelection.assistants.find((item) => candidates.has(item.id));
  }, [agentSelection.assistants, agentSelection.is_presetAgent, agentSelection.selectedAgentInfo?.custom_agent_id]);

  const selectedAssistantLabel = useMemo(() => {
    if (!selectedAssistantRecord) return undefined;
    return selectedAssistantRecord.avatar || selectedAssistantRecord.name;
  }, [selectedAssistantRecord]);
  const selectedAssistantSkillProfile = useMemo(() => {
    if (!selectedAssistantRecord) return undefined;
    return getOplAssistantSkillProfile(selectedAssistantRecord.id);
  }, [selectedAssistantRecord]);
  const selectedAssistantRequiredSkills = selectedAssistantSkillProfile?.required_skills ?? EMPTY_GUID_SKILLS;
  const effectiveGuidEnabledSkills = useMemo(() => {
    if (selectedAssistantRequiredSkills.length === 0 && !guidEnabledSkills?.length) return undefined;
    return mergeRequiredSkills(selectedAssistantRequiredSkills, guidEnabledSkills ?? []);
  }, [guidEnabledSkills, selectedAssistantRequiredSkills]);

  const mention = useGuidMention({
    availableAgents: agentSelection.availableAgents,
    customAgentAvatarMap: agentSelection.customAgentAvatarMap,
    selectedAgentKey: agentSelection.selectedAgentKey,
    setSelectedAgentKey: agentSelection.setSelectedAgentKey,
    setInput: guidInput.setInput,
    selectedAgentInfo: agentSelection.selectedAgentInfo,
    selectedAgentLabelOverride: selectedAssistantLabel,
  });

  const send = useGuidSend({
    // Input state
    input: guidInput.input,
    setInput: guidInput.setInput,
    files: guidInput.files,
    setFiles: guidInput.setFiles,
    dir: guidInput.dir,
    setDir: guidInput.setDir,
    setLoading: guidInput.setLoading,
    loading: guidInput.loading,

    // Agent state
    selectedAgent: agentSelection.selectedAgent,
    selectedAgentKey: agentSelection.selectedAgentKey,
    selectedAgentInfo: agentSelection.selectedAgentInfo,
    is_presetAgent: agentSelection.is_presetAgent,
    selectedMode: agentSelection.selectedMode,
    selectedAcpModel: agentSelection.selectedAcpModel,
    selectedReasoningEffort: agentSelection.selectedReasoningEffort,
    currentAcpCachedModelInfo: agentSelection.currentAcpCachedModelInfo,
    current_model: modelSelection.current_model,

    // Agent helpers
    findAgentByKey: agentSelection.findAgentByKey,
    getEffectiveAgentType: agentSelection.getEffectiveAgentType,
    resolvePresetRulesAndSkills: agentSelection.resolvePresetRulesAndSkills,
    resolveEnabledSkills: agentSelection.resolveEnabledSkills,
    resolveDisabledBuiltinSkills: agentSelection.resolveDisabledBuiltinSkills,
    guidDisabledBuiltinSkills,
    guidEnabledSkills: effectiveGuidEnabledSkills,
    availableMcpServers,
    selectedMcpServerIds: guidSelectedMcpServerIds,
    currentEffectiveAgentInfo: agentSelection.currentEffectiveAgentInfo,
    isGoogleAuth: modelSelection.isGoogleAuth,

    // Mention state reset
    setMentionOpen: mention.setMentionOpen,
    setMentionQuery: mention.setMentionQuery,
    setMentionSelectorOpen: mention.setMentionSelectorOpen,
    setMentionActiveIndex: mention.setMentionActiveIndex,

    // Navigation
    navigate,
    t,
    language: i18n.language,
  });

  // --- Coordinated handlers (depend on multiple hooks) ---
  const handleInputChange = useCallback(
    (value: string) => {
      guidInput.setInput(value);
      const match = value.match(mention.mentionMatchRegex);
      // 首页不根据输入 @ 呼起 mention 列表，占位符里的 @agent 仅为提示，选 agent 用顶部栏或下拉手动选
      if (match) {
        mention.setMentionQuery(match[1]);
        mention.setMentionOpen(false);
      } else {
        mention.setMentionQuery(null);
        mention.setMentionOpen(false);
      }
    },
    [mention.mentionMatchRegex, guidInput.setInput, mention.setMentionQuery, mention.setMentionOpen]
  );

  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (
        (mention.mentionOpen || mention.mentionSelectorOpen) &&
        (event.key === 'ArrowDown' || event.key === 'ArrowUp')
      ) {
        event.preventDefault();
        if (mention.filteredMentionOptions.length === 0) return;
        mention.setMentionActiveIndex((prev) => {
          if (event.key === 'ArrowDown') {
            return (prev + 1) % mention.filteredMentionOptions.length;
          }
          return (prev - 1 + mention.filteredMentionOptions.length) % mention.filteredMentionOptions.length;
        });
        return;
      }
      if ((mention.mentionOpen || mention.mentionSelectorOpen) && event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (mention.filteredMentionOptions.length > 0) {
          const query = mention.mentionQuery?.toLowerCase();
          const exactMatch = query
            ? mention.filteredMentionOptions.find(
                (option) => option.label.toLowerCase() === query || option.tokens.has(query)
              )
            : undefined;
          const selected =
            exactMatch ||
            mention.filteredMentionOptions[mention.mentionActiveIndex] ||
            mention.filteredMentionOptions[0];
          if (selected) {
            mention.selectMentionAgent(selected.key);
            return;
          }
        }
        mention.setMentionOpen(false);
        mention.setMentionQuery(null);
        mention.setMentionSelectorOpen(false);
        mention.setMentionActiveIndex(0);
        return;
      }
      if (mention.mentionOpen && (event.key === 'Backspace' || event.key === 'Delete') && !mention.mentionQuery) {
        mention.setMentionOpen(false);
        mention.setMentionQuery(null);
        mention.setMentionActiveIndex(0);
        return;
      }
      if (
        !mention.mentionOpen &&
        mention.mentionSelectorVisible &&
        !guidInput.input.trim() &&
        (event.key === 'Backspace' || event.key === 'Delete')
      ) {
        event.preventDefault();
        mention.setMentionSelectorVisible(false);
        mention.setMentionSelectorOpen(false);
        mention.setMentionActiveIndex(0);
        return;
      }
      if ((mention.mentionOpen || mention.mentionSelectorOpen) && event.key === 'Escape') {
        event.preventDefault();
        mention.setMentionOpen(false);
        mention.setMentionQuery(null);
        mention.setMentionSelectorOpen(false);
        mention.setMentionActiveIndex(0);
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (!guidInput.input.trim()) return;
        send.sendMessageHandler();
      }
    },
    [mention, guidInput.input, send.sendMessageHandler]
  );

  const handleSelectAssistant = useCallback(
    (assistantId: string) => {
      agentSelection.setSelectedAgentKey(assistantId);
      mention.setMentionOpen(false);
      mention.setMentionQuery(null);
      mention.setMentionSelectorOpen(false);
      mention.setMentionSelectorVisible(true);
      mention.setMentionActiveIndex(0);
    },
    [
      agentSelection.setSelectedAgentKey,
      mention.setMentionOpen,
      mention.setMentionQuery,
      mention.setMentionSelectorOpen,
      mention.setMentionSelectorVisible,
      mention.setMentionActiveIndex,
    ]
  );

  useEffect(() => {
    mention.setMentionSelectorVisible(agentSelection.is_presetAgent);
  }, [agentSelection.is_presetAgent, agentSelection.selectedAgentKey, mention.setMentionSelectorVisible]);

  // Typewriter placeholder
  const defaultPlaceholder = t('conversation.welcome.placeholder');
  const oplPlaceholder = t('conversation.welcome.oplPlaceholder');
  const typewriterPlaceholder = useTypewriterPlaceholder(
    agentSelection.is_presetAgent && selectedAssistantRecord
      ? selectedAssistantRecord.description_i18n?.[localeKey] ||
          selectedAssistantRecord.description ||
          defaultPlaceholder
      : oplPlaceholder
  );
  // Sync disabledBuiltinSkills + enabledSkills from preset assistant config
  useEffect(() => {
    if (agentSelection.is_presetAgent && selectedAssistantRecord) {
      setGuidEnabledSkills(
        mergeRequiredSkills(selectedAssistantRequiredSkills, selectedAssistantRecord.enabled_skills ?? [])
      );
    } else {
      setGuidEnabledSkills(undefined);
    }
  }, [agentSelection.is_presetAgent, selectedAssistantRecord, selectedAssistantRequiredSkills]);

  const heroTitle = useMemo(() => {
    return t('conversation.welcome.title');
  }, [t]);
  const modelStatusText = useMemo(() => getOplModelStatusDisplayText(localeKey), [localeKey]);
  const inspectorTabs = useMemo(
    () => [
      {
        id: 'files',
        label: t('guid.inspector.files'),
        icon: <FolderOpen theme='outline' size='14' fill='currentColor' />,
      },
      {
        id: 'capabilities',
        label: t('guid.inspector.capabilities'),
        icon: <Link theme='outline' size='14' fill='currentColor' />,
      },
      {
        id: 'runtime',
        label: t('guid.inspector.runtime'),
        icon: <Timer theme='outline' size='14' fill='currentColor' />,
      },
      {
        id: 'memory',
        label: t('guid.inspector.memory'),
        icon: <MemoryCard theme='outline' size='14' fill='currentColor' />,
      },
      {
        id: 'automations',
        label: t('guid.inspector.automations'),
        icon: <History theme='outline' size='14' fill='currentColor' />,
      },
      {
        id: 'settings',
        label: t('guid.inspector.settings'),
        icon: <SettingTwo theme='outline' size='14' fill='currentColor' />,
      },
    ],
    [t]
  );
  const shouldRenderAgentTabs =
    agentSelection.availableAgents !== undefined && shouldShowOplHomeAgentTabs(agentSelection.availableAgents);
  const selectedAssistantDescription = useMemo(() => {
    return selectedAssistantRecord?.description_i18n?.[localeKey] || selectedAssistantRecord?.description || '';
  }, [selectedAssistantRecord, localeKey]);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [canExpandDescription, setCanExpandDescription] = useState(false);

  // Reset guid-local UI state before paint so same-route navigations do not
  // briefly show the previous draft or preset assistant layout.
  useLayoutEffect(() => {
    if (postInstallSelfCheckRequested) {
      guidInput.setInput(buildPostInstallSelfCheckPrompt(t, localeKey));
      preservePostInstallPromptRef.current = true;
    } else if (preservePostInstallPromptRef.current) {
      preservePostInstallPromptRef.current = false;
    } else {
      guidInput.setInput('');
    }
    guidInput.setFiles([]);
    guidInput.setLoading(false);
    if (!navState?.workspace) {
      guidInput.setDir('');
    }
    setIsDescriptionExpanded(false);
  }, [
    guidInput.setDir,
    guidInput.setFiles,
    guidInput.setInput,
    guidInput.setLoading,
    localeKey,
    location.key,
    navState?.workspace,
    postInstallSelfCheckRequested,
    t,
  ]);

  // Clear resetAssistant from location.state after the hook has consumed it,
  // so that re-renders don't re-trigger the reset logic.
  //
  // Must go through React Router's navigate — raw window.history.replaceState
  // with `location.pathname` would write the HashRouter virtual path (e.g.
  // '/guid') into the browser's real URL and strip the leading '#'. On the
  // next hard reload, the browser would then request '/guid' directly from
  // the dev server (which has no SPA fallback) and 404.
  useEffect(() => {
    if (!resetAssistantRequested && !preselectAgentKey && !postInstallSelfCheckRequested) return;
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
  }, [
    resetAssistantRequested,
    preselectAgentKey,
    postInstallSelfCheckRequested,
    location.pathname,
    location.search,
    location.hash,
    navigate,
  ]);

  useEffect(() => {
    const node = descriptionTextRef.current;
    if (!node || !agentSelection.is_presetAgent || !selectedAssistantDescription) {
      setCanExpandDescription(false);
      return;
    }

    const checkExpandable = () => {
      // In line-clamp mode, scrollWidth/scrollHeight can be unreliable in some engines.
      // Measure the natural multi-line height via an off-screen clone.
      const clone = node.cloneNode(true) as HTMLDivElement;
      const computed = window.getComputedStyle(node);
      clone.style.position = 'absolute';
      clone.style.visibility = 'hidden';
      clone.style.pointerEvents = 'none';
      clone.style.zIndex = '-1';
      clone.style.left = '-99999px';
      clone.style.top = '0';
      clone.style.width = `${node.clientWidth}px`;
      clone.style.display = 'block';
      clone.style.overflow = 'visible';
      clone.style.whiteSpace = 'normal';
      clone.style.webkitLineClamp = 'unset';
      clone.style.webkitBoxOrient = 'unset';
      clone.style.lineHeight = computed.lineHeight;
      clone.style.fontSize = computed.fontSize;
      clone.style.fontWeight = computed.fontWeight;
      clone.style.letterSpacing = computed.letterSpacing;
      clone.style.fontFamily = computed.fontFamily;
      document.body.appendChild(clone);

      const expandedHeight = clone.scrollHeight;
      document.body.removeChild(clone);
      const lineHeight = Number.parseFloat(computed.lineHeight) || 20;
      const canExpand = expandedHeight > lineHeight + 1;
      setCanExpandDescription(canExpand);
      if (!canExpand) {
        setIsDescriptionExpanded(false);
      }
    };

    checkExpandable();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => checkExpandable());
    observer.observe(node);
    return () => observer.disconnect();
  }, [agentSelection.is_presetAgent, selectedAssistantDescription]);

  const effectiveAgentRecord = useMemo(() => {
    return agentSelection.availableAgents?.find(
      (agent) =>
        !agent.is_preset && (agent.backend || agent.agent_type) === agentSelection.currentEffectiveAgentInfo.agent_type
    );
  }, [agentSelection.availableAgents, agentSelection.currentEffectiveAgentInfo.agent_type]);

  const effectiveAgentLogo = useMemo(
    () =>
      resolveAgentLogo({
        icon: effectiveAgentRecord?.icon,
        backend: effectiveAgentRecord?.backend || agentSelection.currentEffectiveAgentInfo.agent_type,
        custom_agent_id: effectiveAgentRecord?.custom_agent_id,
        isExtension: effectiveAgentRecord?.isExtension,
      }),
    [effectiveAgentRecord, agentSelection.currentEffectiveAgentInfo.agent_type]
  );

  // Resolve the effective agent type once — covers both direct selection and preset assistants
  const effectiveAgentType = agentSelection.is_presetAgent
    ? agentSelection.currentEffectiveAgentInfo.agent_type
    : agentSelection.selectedAgent;

  // Agents that use configured model providers instead of ACP probe-based models.
  // Only aionrs now — Gemini runs as a regular ACP backend with ACP-cached models.
  const PROVIDER_BASED_AGENTS = new Set(['aionrs']);
  const isGeminiMode =
    PROVIDER_BASED_AGENTS.has(effectiveAgentType) &&
    (!agentSelection.is_presetAgent || agentSelection.currentEffectiveAgentInfo.isAvailable);

  // Build the mention dropdown node
  const mentionDropdownNode = (
    <MentionDropdown
      menuRef={mention.mentionMenuRef}
      options={mention.filteredMentionOptions}
      selectedKey={mention.mentionMenuSelectedKey}
      onSelect={mention.selectMentionAgent}
    />
  );

  const modelSelectorNode: React.ReactNode =
    shouldShowOplCodexModelSelector() && !agentSelection.is_presetAgent ? (
      <GuidModelSelector
        isGeminiMode={isGeminiMode}
        modelList={modelSelection.modelList}
        current_model={modelSelection.current_model}
        setCurrentModel={modelSelection.setCurrentModel}
        currentAcpCachedModelInfo={agentSelection.currentAcpCachedModelInfo}
        selectedAcpModel={agentSelection.selectedAcpModel}
        setSelectedAcpModel={agentSelection.setSelectedAcpModel}
        selectedReasoningEffort={agentSelection.selectedReasoningEffort}
        setSelectedReasoningEffort={agentSelection.setSelectedReasoningEffort}
        backend={effectiveAgentType}
      />
    ) : null;

  const handleSpeechTranscript = useCallback(
    (transcript: string) => {
      guidInput.setInput((prev) => appendSpeechTranscript(prev, transcript));
    },
    [guidInput.setInput]
  );
  const { handleLiveTranscript } = useLiveTranscriptInsertion(guidInput.setInput);

  // Build the action row
  const actionRowNode = (
    <GuidActionRow
      files={guidInput.files}
      onFilesUploaded={guidInput.handleFilesUploaded}
      modelSelectorNode={modelSelectorNode}
      selectedAgent={agentSelection.selectedAgent}
      effectiveModeAgent={agentSelection.currentEffectiveAgentInfo.agent_type}
      selectedMode={agentSelection.selectedMode}
      onModeSelect={agentSelection.setSelectedMode}
      is_presetAgent={agentSelection.is_presetAgent}
      selectedAgentInfo={agentSelection.selectedAgentInfo}
      assistants={agentSelection.assistants}
      localeKey={localeKey}
      onClosePresetTag={() => agentSelection.setSelectedAgentKey(agentSelection.defaultAgentKey)}
      agentLogo={effectiveAgentLogo}
      agentSwitcherItems={[]}
      showModeSelector={shouldShowOplHomePermissionModeSelector()}
      allSkills={buildAssistantScopedSkillMenuItems(allSkills, selectedAssistantSkillProfile)}
      disabledBuiltinSkills={guidDisabledBuiltinSkills ?? []}
      enabledSkills={effectiveGuidEnabledSkills ?? []}
      onToggleSkill={handleToggleSkill}
      mcpServers={availableMcpServers}
      selectedMcpServerIds={guidSelectedMcpServerIds ?? []}
      onToggleMcpServer={handleToggleMcpServer}
      hidePresetTag
      speechInputNode={
        <SpeechInputButton
          disabled={guidInput.loading}
          onLiveTranscript={handleLiveTranscript}
          onTranscript={handleSpeechTranscript}
        />
      }
      loading={guidInput.loading}
      isButtonDisabled={send.isButtonDisabled}
      onSend={send.sendMessageHandler}
    />
  );

  return (
    <ConfigProvider getPopupContainer={() => guidContainerRef.current || document.body}>
      <div
        ref={guidContainerRef}
        className={styles.guidContainer}
        data-testid='opl-guid-entry'
        aria-label='opl-guid-entry'
      >
        <div className={styles.guidShellFrame} data-testid='opl-chat-first-frame'>
          <Button
            type='secondary'
            shape='circle'
            className={styles.guidContextInspectorToggle}
            data-testid='opl-guid-context-inspector-toggle'
            aria-label={t('guid.inspector.open')}
            icon={<Right theme='outline' size='14' fill='currentColor' />}
            onClick={() => setIsInspectorOpen((open) => !open)}
          />
          {isInspectorOpen ? (
            <aside className={styles.guidContextInspector} data-testid='opl-guid-context-inspector'>
              <div className={styles.guidContextInspectorTitle}>{t('guid.inspector.title')}</div>
              <div className={styles.guidContextInspectorTabs}>
                {inspectorTabs.map((tab) => (
                  <Button
                    key={tab.id}
                    type='text'
                    size='mini'
                    className={styles.guidContextInspectorTab}
                    data-testid={`opl-inspector-tab-${tab.id}`}
                    aria-label={tab.label}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </Button>
                ))}
              </div>
            </aside>
          ) : null}
        </div>
        <div className={styles.guidLayout}>
          <div className={styles.heroHeader}>
            <div className='text-center'>
              <p className='text-2xl font-semibold mb-0 text-0 text-center'>{heroTitle}</p>
            </div>
          </div>

          {agentSelection.is_presetAgent && selectedAssistantDescription ? (
            <div
              className={`${styles.heroSubtitle} ${isDescriptionExpanded ? styles.heroSubtitleExpanded : ''}`}
              onClick={() => {
                if (!canExpandDescription) return;
                setIsDescriptionExpanded((v) => !v);
              }}
            >
              <div
                ref={descriptionTextRef}
                className={`${styles.heroSubtitleText} ${isDescriptionExpanded ? styles.heroSubtitleTextExpanded : ''}`}
              >
                {selectedAssistantDescription}
              </div>
              {canExpandDescription ? (
                <Button
                  size='mini'
                  type='secondary'
                  shape='circle'
                  icon={<Down theme='outline' size={12} fill='currentColor' />}
                  className={`${styles.heroSubtitleToggle} ${isDescriptionExpanded ? styles.heroSubtitleToggleExpanded : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDescriptionExpanded((v) => !v);
                  }}
                  aria-label={
                    isDescriptionExpanded
                      ? t('common.collapse', { defaultValue: 'Collapse' })
                      : t('common.expand', { defaultValue: 'Expand' })
                  }
                />
              ) : null}
            </div>
          ) : null}

          <div className={styles.homeModelStatusRow}>
            <span className={styles.homeModelStatus} data-testid='opl-home-model-status'>
              {modelStatusText}
            </span>
          </div>

          <GuidInputCard
            input={guidInput.input}
            onInputChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            onPaste={guidInput.onPaste}
            onFocus={guidInput.handleTextareaFocus}
            onBlur={guidInput.handleTextareaBlur}
            placeholder={
              agentSelection.is_presetAgent
                ? `${mention.selectedAgentLabel}, ${typewriterPlaceholder || defaultPlaceholder}`
                : typewriterPlaceholder || oplPlaceholder
            }
            isInputActive={guidInput.isInputFocused}
            isFileDragging={guidInput.isFileDragging}
            activeBorderColor={activeBorderColor}
            inactiveBorderColor={inactiveBorderColor}
            activeShadow={activeShadow}
            dragHandlers={guidInput.dragHandlers}
            mentionOpen={mention.mentionOpen}
            mentionSelectorBadge={
              <MentionSelectorBadge
                visible={mention.mentionSelectorVisible}
                open={mention.mentionSelectorOpen}
                onOpenChange={mention.setMentionSelectorOpen}
                agentLabel={mention.selectedAgentLabel}
                mentionMenu={mentionDropdownNode}
                onResetQuery={() => mention.setMentionQuery(null)}
                dropdownEnabled={false}
                onClear={() => {
                  agentSelection.setSelectedAgentKey(agentSelection.defaultAgentKey);
                  mention.setMentionSelectorVisible(false);
                  mention.setMentionSelectorOpen(false);
                  mention.setMentionActiveIndex(0);
                }}
              />
            }
            mentionDropdown={mentionDropdownNode}
            files={guidInput.files}
            onRemoveFile={guidInput.handleRemoveFile}
            actionRow={actionRowNode}
            workspaceDir={guidInput.dir}
            onSelectWorkspace={(dir) => guidInput.setDir(dir)}
            onClearWorkspace={() => guidInput.setDir('')}
          />

          <AssistantSelectionArea
            is_presetAgent={agentSelection.is_presetAgent}
            selectedAgentInfo={agentSelection.selectedAgentInfo}
            assistants={agentSelection.assistants}
            localeKey={localeKey}
            currentEffectiveAgentInfo={agentSelection.currentEffectiveAgentInfo}
            onSelectAssistant={handleSelectAssistant}
            onSetInput={guidInput.setInput}
            onFocusInput={guidInput.handleTextareaFocus}
            onRegisterOpenDetails={(openDetails) => {
              openAssistantDetailsRef.current = openDetails;
            }}
          />
        </div>
      </div>
    </ConfigProvider>
  );
};

export default GuidPage;
