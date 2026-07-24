/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { buildGuidSlashCommands } from '@/common/chat/slash/guidSlashCommands';
import type { SlashCommandItem } from '@/common/chat/slash/types';
import {
  filterOplOrdinaryMcpServers,
  filterOplOrdinarySkillNames,
  getOplOrdinarySkillAllowlist,
  getOplOrdinaryCapabilitySelectorPolicy,
  getOplAssistantSkillProfile,
} from '@/common/config/oplProductProfile';
import type { IMcpServer } from '@/common/config/storage';
import { resolveLocaleKey } from '@/common/utils';

import { useInputFocusRing } from '@/renderer/hooks/chat/useInputFocusRing';
import { useSlashCommandController } from '@/renderer/hooks/chat/useSlashCommandController';
import GuidActionRow from './components/GuidActionRow';
import GuidInputCard from './components/GuidInputCard';
import GuidWorkspaceContextBar from './components/GuidWorkspaceContextBar';
import GuidModelSelector from './components/GuidModelSelector';
import HomeStarters from './components/HomeStarters';
import GuidSetupNotice, { type GuidSetupNoticeKind } from './components/GuidSetupNotice';
import MentionDropdown from './components/MentionDropdown';
import SlashCommandMenu, { type SlashCommandMenuItem } from '@/renderer/components/chat/SlashCommandMenu';
import { useGuidAgentSelection } from './hooks/useGuidAgentSelection';
import { useGuidInput } from './hooks/useGuidInput';
import { useGuidMention } from './hooks/useGuidMention';
import { useGuidModelSelection } from './hooks/useGuidModelSelection';
import { useGuidSend } from './hooks/useGuidSend';
import { useTypewriterPlaceholder } from './hooks/useTypewriterPlaceholder';
import { buildAssistantScopedSkillMenuItems, mergeRequiredSkills } from './utils/assistantSkillMenu';
import { resolveOplActiveShortcut, type OplActiveShortcut } from './utils/activeShortcut';
import { resolveOplProfessionalAgentAssistants } from './utils/oplHomeAssistants';
import { resolveOplHomeComposerSurface } from './utils/composerSurface';
import { useOpenFileSelector } from '@/renderer/hooks/file/useOpenFileSelector';
import { ensureBackendMcpCatalog } from '@/renderer/hooks/mcp/catalog';
import SpeechInputButton from '@/renderer/components/chat/composer/SpeechInputButton';
import { appendSpeechTranscript } from '@/renderer/hooks/system/useSpeechInput';
import { useLiveTranscriptInsertion } from '@/renderer/hooks/system/useLiveTranscriptInsertion';
import { useCoreLaunchPrerequisites } from '@/renderer/hooks/system/useCoreLaunchPrerequisites';
import { resolveAgentLogo } from '@/renderer/utils/model/agentLogo';
import { Button, ConfigProvider } from '@arco-design/web-react';
import { Info, Right } from '@icon-park/react';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import styles from './index.module.css';

const EMPTY_GUID_SKILLS: string[] = [];
const DEFAULT_AUTO_SKILL_EXCLUSIONS = getOplOrdinaryCapabilitySelectorPolicy().forbidden_skill_examples;
const AGENT_REFERENCE_ADMISSION_POLICY = getOplOrdinaryCapabilitySelectorPolicy().agent_reference_admission_policy;

type GuidNavigationState = {
  resetAssistant?: boolean;
  selectedAgentKey?: string;
  workspace?: string;
  postInstallSelfCheck?: boolean;
  selectedCapabilityId?: string;
};

const POST_INSTALL_SELF_CHECK_PROMPT_DEFAULTS: Record<'zh-CN' | 'en-US', string> = {
  'zh-CN': [
    '安装后智能自检',
    '',
    '首次设置的核心阶段已经完成；Package 安装、依赖补齐和后台维护可能仍在继续。请以 OPL Framework 的机器状态为准，检查当前环境是否已进入可用工作模式。不要根据目录、缓存或固定 Package 清单猜测结果。',
    '',
    '检查顺序：',
    '1. 先运行 `opl app state --profile fast --json`，确认 Codex CLI、模型访问和首次设置核心状态。分别报告“App 核心可用”和“后台维护完成”，不要混为一个结论。',
    '2. 确认新建 Codex 会话已获得 OPL App 会话上下文、跟随当前界面语言，并遵守用户及仓库的 AGENTS.md；不得覆盖规则或改写用户文件。',
    '3. 按当前 Official Profile、用户偏好和实际安装状态检查 OPL Package。组合采用 presence-only：用户主动卸载的 Package 不算故障，缺少可选 Package 只影响依赖它的功能。',
    '4. 对已安装或本次明确选择的 Package，按照状态返回的 detail_surface，或运行 `opl packages status --package-id <id> --json` 做 fresh 检查，确认 configured carrier readback、required dependencies 和对应入口是否可见、可调用。',
    '5. OPL Flow 缺失或被用户卸载时不得阻断 App 核心功能；如果已安装，则检查其会话上下文、语言策略和工作区规则共存情况。',
    '6. 自动更新或后台维护后重新读取 fast state 和相关 Package 状态；不能仅凭插件目录、Skill 缓存或历史 receipt 声称连续性成立。',
    '',
    '请先给出：',
    '- App 核心状态',
    '- 各相关 Package 的局部状态',
    '- 后台维护状态',
    '- 证据与实际执行的只读命令',
    '- 发现的问题及建议动作',
    '',
    '本轮只诊断，不修改文件、不安装、不更新、不修复。如需执行 mutation，请引用 Framework 返回的 action，说明原因、影响范围和具体命令，等待我确认。',
  ].join('\n'),
  'en-US': [
    'Post-install intelligent self-check',
    '',
    'The core first-run setup stage has completed; Package installation, dependency reconciliation, and background maintenance may still be in progress. Treat OPL Framework machine state as authoritative when checking whether the current environment is usable. Do not infer the result from directories, caches, or a fixed Package list.',
    '',
    'Check in this order:',
    '1. First run `opl app state --profile fast --json` and inspect Codex CLI, model access, and core first-run state. Report "App core usable" separately from "background maintenance complete."',
    '2. Confirm that new Codex sessions receive OPL App session context, follow the current UI language, and respect user and repository AGENTS.md files without overwriting rules or modifying user files.',
    '3. Check OPL Packages against the current Official Profile, user preferences, and actual installed state. Composition is presence-only: Packages explicitly removed by the user are not failures, and an absent optional Package affects only features that depend on it.',
    '4. For installed or explicitly selected Packages, follow the returned detail_surface or run `opl packages status --package-id <id> --json` for fresh configured carrier readback, required dependency, and route visibility/callability checks.',
    '5. Missing or user-uninstalled OPL Flow must not block App core functionality. When it is installed, verify its session context, language policy, and coexistence with workspace rules.',
    '6. After automatic update or background maintenance, reread fast state and the relevant Package status. Do not claim continuity from plugin directories, Skill caches, or historical receipts.',
    '',
    'Report first:',
    '- App core state',
    '- Per-Package state for relevant Packages',
    '- Background maintenance state',
    '- Evidence and the read-only commands actually run',
    '- Issues and recommended actions',
    '',
    'This turn is diagnostic only: do not modify files, install, update, or repair. If a mutation is needed, cite the action returned by Framework, explain the reason, impact, and exact command, then wait for my confirmation.',
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
  const navState = location.state as GuidNavigationState | null;
  const guidContainerRef = useRef<HTMLDivElement>(null);
  const preservePostInstallPromptRef = useRef(false);
  const { activeBorderColor, inactiveBorderColor, activeShadow } = useInputFocusRing();
  const [setupNoticeKind, setSetupNoticeKind] = useState<GuidSetupNoticeKind | null>(null);
  const [activeShortcut, setActiveShortcut] = useState<OplActiveShortcut | null>(() =>
    resolveOplActiveShortcut(navState?.selectedCapabilityId)
  );

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
  const coreReadiness = useCoreLaunchPrerequisites();
  const workspaceAccessBlocked = coreReadiness.known && !coreReadiness.workspaceRootReady;
  const runtimeNeedsAttention =
    coreReadiness.known && (!coreReadiness.codexCliReady || !coreReadiness.modelAccessReady);

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
    fileAccessEnabled: true,
  });

  const appendSlashSelectedFiles = useCallback(
    (selectedFiles: string[]) => {
      guidInput.setFiles((prevFiles) => [...prevFiles, ...selectedFiles]);
    },
    [guidInput.setFiles]
  );
  const { onSlashBuiltinCommand } = useOpenFileSelector({
    onFilesSelected: appendSlashSelectedFiles,
  });

  const professionalAssistants = useMemo(
    () => resolveOplProfessionalAgentAssistants(agentSelection.assistants),
    [agentSelection.assistants]
  );
  const selectedAssistantRecord = useMemo(() => {
    if (!activeShortcut) return undefined;
    return professionalAssistants.find(
      (item) => resolveOplActiveShortcut(item.id)?.package_id === activeShortcut.package_id
    );
  }, [activeShortcut, professionalAssistants]);

  useLayoutEffect(() => {
    if (!preselectAgentKey || !agentSelection.is_presetAgent || !agentSelection.selectedAgentInfo?.custom_agent_id)
      return;
    const legacyShortcut = resolveOplActiveShortcut(agentSelection.selectedAgentInfo.custom_agent_id);
    if (!legacyShortcut) return;
    setActiveShortcut((current) => current ?? legacyShortcut);
    agentSelection.setSelectedAgentKey(agentSelection.defaultAgentKey);
  }, [
    agentSelection.defaultAgentKey,
    agentSelection.is_presetAgent,
    agentSelection.selectedAgentInfo?.custom_agent_id,
    agentSelection.setSelectedAgentKey,
    preselectAgentKey,
  ]);

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
  const guidSlashSkillNames = useMemo(
    () => filterOplOrdinarySkillNames(effectiveGuidEnabledSkills ?? []),
    [effectiveGuidEnabledSkills]
  );
  const guidSlashSkillDescriptionByName = useMemo(
    () => new Map(allSkills.map((skill) => [skill.name, skill.description])),
    [allSkills]
  );
  const guidBuiltinSlashCommands = useMemo<SlashCommandItem[]>(
    () => [
      {
        name: 'open',
        description: t('conversation.workspace.addFile', { defaultValue: 'Add File' }),
        kind: 'builtin',
        source: 'builtin',
      },
    ],
    [t]
  );
  const guidSlashCommands = useMemo(
    () =>
      buildGuidSlashCommands({
        builtinCommands: guidBuiltinSlashCommands,
        selectedSkills: guidSlashSkillNames,
        descriptionByName: guidSlashSkillDescriptionByName,
        skillFallbackDescription: t('settings.assistantSkills', { defaultValue: 'Skills' }),
      }),
    [guidBuiltinSlashCommands, guidSlashSkillDescriptionByName, guidSlashSkillNames, t]
  );
  const slashController = useSlashCommandController({
    input: guidInput.input,
    commands: guidSlashCommands,
    onExecuteBuiltin: (name) => {
      onSlashBuiltinCommand(name);
      guidInput.setInput('');
    },
    onSelectTemplate: (name) => {
      guidInput.setInput(`/${name} `);
    },
  });
  const slashMenuItems = useMemo<SlashCommandMenuItem[]>(
    () =>
      slashController.filteredCommands.map((command) => ({
        key: command.name,
        label: `/${command.name}`,
        description: command.description,
        badge: command.hint,
      })),
    [slashController.filteredCommands]
  );

  const mention = useGuidMention({
    selectionEnabled: AGENT_REFERENCE_ADMISSION_POLICY.at_mention_agent_selection_allowed,
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
    activeShortcut,
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

  const openFirstRunSetup = useCallback(() => {
    void navigate('/first-run');
  }, [navigate]);

  const openRuntimeMaintenance = useCallback(() => {
    void navigate('/settings/environment?section=diagnostics');
  }, [navigate]);

  const sendWithPrerequisiteCheck = useCallback(() => {
    if (coreReadiness.known && !coreReadiness.codexCliReady) {
      setSetupNoticeKind('local_assistant');
      return;
    }
    if (coreReadiness.known && !coreReadiness.modelAccessReady) {
      setSetupNoticeKind('model_access');
      return;
    }
    setSetupNoticeKind(null);
    send.sendMessageHandler();
  }, [coreReadiness, send.sendMessageHandler]);

  useEffect(() => {
    if (!setupNoticeKind || !coreReadiness.known) return;
    const resolved =
      (setupNoticeKind === 'local_assistant' && coreReadiness.codexCliReady) ||
      (setupNoticeKind === 'model_access' && coreReadiness.modelAccessReady) ||
      (setupNoticeKind === 'workspace' && coreReadiness.workspaceRootReady);
    if (resolved) setSetupNoticeKind(null);
  }, [coreReadiness, setupNoticeKind]);

  const handleWorkspaceSelect = useCallback(
    (dir: string) => {
      guidInput.setDir(dir);
    },
    [guidInput.setDir]
  );

  const handleWorkspaceClear = useCallback(() => {
    guidInput.setDir('');
  }, [guidInput.setDir]);

  // --- Coordinated handlers (depend on multiple hooks) ---
  const handleInputChange = useCallback(
    (value: string) => {
      guidInput.setInput(value);
      if (!AGENT_REFERENCE_ADMISSION_POLICY.at_mention_agent_selection_allowed) {
        mention.setMentionQuery(null);
        mention.setMentionOpen(false);
        return;
      }
      const match = value.match(mention.mentionMatchRegex);
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
      if (slashController.onKeyDown(event)) {
        return;
      }

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
        sendWithPrerequisiteCheck();
      }
    },
    [mention, guidInput.input, sendWithPrerequisiteCheck, slashController]
  );

  const handleSelectShortcut = useCallback(
    (assistantId: string | null) => {
      setActiveShortcut(resolveOplActiveShortcut(assistantId));
      mention.setMentionOpen(false);
      mention.setMentionQuery(null);
      mention.setMentionSelectorOpen(false);
      mention.setMentionSelectorVisible(false);
      mention.setMentionActiveIndex(0);
    },
    [
      mention.setMentionOpen,
      mention.setMentionQuery,
      mention.setMentionSelectorOpen,
      mention.setMentionSelectorVisible,
      mention.setMentionActiveIndex,
    ]
  );

  useEffect(() => {
    mention.setMentionSelectorVisible(false);
  }, [activeShortcut, mention.setMentionSelectorVisible]);

  // Typewriter placeholder
  const defaultPlaceholder = t('conversation.welcome.placeholder');
  const oplPlaceholder = t('conversation.welcome.oplPlaceholder');
  const typewriterPlaceholder = useTypewriterPlaceholder(
    selectedAssistantRecord
      ? selectedAssistantRecord.description_i18n?.[localeKey] ||
          selectedAssistantRecord.description ||
          defaultPlaceholder
      : oplPlaceholder
  );
  // Sync disabledBuiltinSkills + enabledSkills from preset assistant config
  useEffect(() => {
    if (selectedAssistantRecord) {
      setGuidEnabledSkills(
        mergeRequiredSkills(selectedAssistantRequiredSkills, selectedAssistantRecord.enabled_skills ?? [])
      );
    } else {
      setGuidEnabledSkills(undefined);
    }
  }, [selectedAssistantRecord, selectedAssistantRequiredSkills]);

  const activeCapabilityLabel = useMemo(() => {
    return selectedAssistantRecord?.name_i18n?.[localeKey] || selectedAssistantRecord?.name;
  }, [localeKey, selectedAssistantRecord]);
  const heroTitle = useMemo(
    () =>
      activeCapabilityLabel
        ? t('guid.home.capabilityQuestion', { capability: activeCapabilityLabel })
        : t('guid.home.question'),
    [activeCapabilityLabel, t]
  );
  const composerSurface = useMemo(() => resolveOplHomeComposerSurface(activeShortcut), [activeShortcut]);

  // Reset guid-local UI state before paint so same-route navigations do not
  // briefly show the previous draft or preset assistant layout.
  useLayoutEffect(() => {
    if (navState?.selectedCapabilityId) {
      setActiveShortcut(resolveOplActiveShortcut(navState.selectedCapabilityId));
    } else if (resetAssistantRequested) {
      setActiveShortcut(null);
    }
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
  }, [
    guidInput.setDir,
    guidInput.setFiles,
    guidInput.setInput,
    guidInput.setLoading,
    localeKey,
    location.key,
    navState?.selectedCapabilityId,
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
    if (
      !resetAssistantRequested &&
      !preselectAgentKey &&
      !postInstallSelfCheckRequested &&
      !navState?.selectedCapabilityId
    )
      return;
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
  }, [
    resetAssistantRequested,
    preselectAgentKey,
    postInstallSelfCheckRequested,
    navState?.selectedCapabilityId,
    location.pathname,
    location.search,
    location.hash,
    navigate,
  ]);

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

  const modelSelectorNode: React.ReactNode = composerSurface.model_reasoning_visible ? (
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
      setCodexModelSelection={agentSelection.setCodexModelSelection}
      backend={composerSurface.executor}
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
      fileAccessDisabled={false}
      modelSelectorNode={modelSelectorNode}
      mobileCodexModelSelection={
        composerSurface.executor === 'codex' && modelSelectorNode
          ? {
              modelInfo: agentSelection.currentAcpCachedModelInfo,
              selectedModelId: agentSelection.selectedAcpModel,
              selectedReasoningEffort: agentSelection.selectedReasoningEffort,
              onChange: agentSelection.setCodexModelSelection,
            }
          : undefined
      }
      activeCapabilityId={activeShortcut?.package_id}
      activeCapabilityLabel={activeCapabilityLabel}
      onSelectCapability={handleSelectShortcut}
      selectedAgent={agentSelection.selectedAgent}
      effectiveModeAgent={agentSelection.currentEffectiveAgentInfo.agent_type}
      selectedMode={agentSelection.selectedMode}
      onModeSelect={agentSelection.setSelectedMode}
      is_presetAgent={agentSelection.is_presetAgent}
      selectedAgentInfo={agentSelection.selectedAgentInfo}
      assistants={professionalAssistants}
      localeKey={localeKey}
      onClosePresetTag={() => agentSelection.setSelectedAgentKey(agentSelection.defaultAgentKey)}
      agentLogo={effectiveAgentLogo}
      agentSwitcherItems={[]}
      showModeSelector={composerSurface.permission_access_visible}
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
      onSend={sendWithPrerequisiteCheck}
    />
  );
  const slashCommandMenuNode = slashController.isOpen ? (
    <SlashCommandMenu
      title={t('messages.slash.title', { defaultValue: 'Commands' })}
      hint={t('messages.slash.hint', { defaultValue: 'Type / to open command menu' })}
      items={slashMenuItems}
      activeIndex={slashController.activeIndex}
      loading={false}
      onHoverItem={slashController.setActiveIndex}
      onSelectItem={(item) => {
        const targetIndex = slashController.filteredCommands.findIndex((command) => command.name === item.key);
        if (targetIndex >= 0) {
          slashController.onSelectByIndex(targetIndex);
        }
      }}
      emptyText={t('messages.slash.empty', { defaultValue: 'No commands found' })}
    />
  ) : null;

  return (
    <ConfigProvider getPopupContainer={() => guidContainerRef.current || document.body}>
      <div
        ref={guidContainerRef}
        className={styles.guidContainer}
        data-testid='opl-guid-entry'
        aria-label='opl-guid-entry'
        data-opl-composer-executor={composerSurface.executor}
        data-opl-active-shortcut={composerSurface.active_shortcut_id ?? ''}
        data-opl-workspace-selected={String(Boolean(guidInput.dir))}
        data-opl-workspace-path={guidInput.dir}
        data-opl-model-reasoning-visible={String(composerSurface.model_reasoning_visible)}
        data-opl-permission-access-visible={String(composerSurface.permission_access_visible)}
        data-opl-executor-selector-visible={String(composerSurface.executor_selector_visible)}
        data-opl-at-mention-agent-selection-enabled={String(
          AGENT_REFERENCE_ADMISSION_POLICY.at_mention_agent_selection_allowed
        )}
      >
        <div className={styles.guidLayout}>
          <div className={styles.guidHero}>
            <div className={styles.heroHeader}>
              <div className='text-center'>
                <p className={styles.homePrompt}>{heroTitle}</p>
              </div>
            </div>

            <HomeStarters
              assistants={agentSelection.assistants}
              localeKey={localeKey}
              activeCapabilityId={activeShortcut?.package_id}
              onSelect={(assistantId) => {
                handleSelectShortcut(assistantId);
                guidInput.handleTextareaFocus();
              }}
              onClear={() => {
                handleSelectShortcut(null);
                guidInput.handleTextareaFocus();
              }}
            />
          </div>

          <div className={styles.guidComposerDock}>
            {runtimeNeedsAttention && !setupNoticeKind ? (
              <div
                className={styles.guidSetupNotice}
                data-testid='opl-home-runtime-alert'
                role='status'
                aria-live='polite'
              >
                <Info theme='outline' size='16' fill='currentColor' className={styles.guidSetupNoticeIcon} />
                <div className={styles.guidSetupNoticeCopy}>
                  <strong>{t('guid.uiOptimization.home.runtimeAlert.title')}</strong>
                  <span>{t('guid.uiOptimization.home.runtimeAlert.description')}</span>
                </div>
                <Button
                  type='text'
                  size='small'
                  icon={<Right theme='outline' size='14' fill='currentColor' />}
                  onClick={openRuntimeMaintenance}
                  data-testid='opl-home-runtime-alert-action'
                >
                  {t('guid.uiOptimization.home.runtimeAlert.openMaintenance')}
                </Button>
              </div>
            ) : null}
            <GuidWorkspaceContextBar
              workspaceDir={guidInput.dir}
              onSelectWorkspace={handleWorkspaceSelect}
              onClearWorkspace={handleWorkspaceClear}
              workspaceAccessDisabled={workspaceAccessBlocked}
              workspaceAccessDisabledReason={t('common.firstRunRecovery.workspaceAccessUnavailable')}
            />
            <GuidInputCard
              input={guidInput.input}
              onInputChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              onPaste={guidInput.onPaste}
              onFocus={guidInput.handleTextareaFocus}
              onBlur={guidInput.handleTextareaBlur}
              placeholder={
                selectedAssistantRecord
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
              mentionDropdown={mentionDropdownNode}
              files={guidInput.files}
              onRemoveFile={guidInput.handleRemoveFile}
              actionRow={actionRowNode}
              slashCommandMenu={slashCommandMenuNode}
              fileAccessEnabled={true}
            />

            {setupNoticeKind ? <GuidSetupNotice kind={setupNoticeKind} onOpenSetup={openFirstRunSetup} /> : null}
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
};

export default GuidPage;
