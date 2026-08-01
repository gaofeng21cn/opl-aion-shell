/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { filterOplOrdinaryMcpServers } from '@/common/config/oplProductProfile';
import type { IMcpServer, TProviderWithModel } from '@/common/config/storage';
import {
  getOplDirectorySkillIds,
  isOplFlowInstalledFromAppState,
  resolveOplFlowCodexModelRecommendation,
  resolveOplStandardAgentCapabilityMetadata,
} from '@/common/types/opl/appState';
import { resolveLocaleKey } from '@/common/utils';
import { resolveOplCodexAutoSelection } from '@/common/types/codex/codexModels';
import { buildAgentConversationParams } from '@/common/utils/buildAgentConversationParams';
import { toSessionMcpServer } from '@/renderer/hooks/mcp/catalog';
import { emitter } from '@/renderer/utils/emitter';
import { updateWorkspaceTime } from '@/renderer/utils/workspace/workspaceHistory';
import { Message } from '@arco-design/web-react';
import { createElement, useCallback, useRef } from 'react';
import { type TFunction } from 'i18next';
import type { NavigateFunction } from 'react-router-dom';
import { getConversationCreateErrorMessage } from '@/renderer/pages/conversation/utils/conversationCreateError';
import type { AcpModelInfo, AvailableAgent, EffectiveAgentInfo } from '../types';
import { resolveOplPackageLaunchGate } from '../utils/oplHomeAssistants';
import { resolveOplActiveShortcut, type OplActiveShortcut } from '../utils/activeShortcut';
import { loadOplAppStateFromBridge } from '@/renderer/hooks/system/useOplAppState';

function showOplAgentPackageLaunchBlocked(message: string, packageId: string, reason: string, actions: string[]) {
  Message.error({
    className: 'opl-agent-package-launch-blocked',
    content: createElement(
      'span',
      {
        'data-testid': 'opl-agent-package-launch-blocked',
        'data-opl-package-id': packageId,
        'data-opl-block-reason': reason,
        'data-opl-repair-actions': actions.join(','),
      },
      message
    ),
  });
}
export type GuidSendDeps = {
  // Input state
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  files: string[];
  setFiles: React.Dispatch<React.SetStateAction<string[]>>;
  dir: string;
  setDir: React.Dispatch<React.SetStateAction<string>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  loading: boolean;

  // Agent state
  selectedAgent: string;
  selectedAgentKey: string;
  selectedAgentInfo: AvailableAgent | undefined;
  is_presetAgent: boolean;
  activeShortcut: OplActiveShortcut | null;
  selectedMode: string;
  selectedAcpModel: string | null;
  selectedReasoningEffort: string | null;
  currentAcpCachedModelInfo: AcpModelInfo | null;
  current_model: TProviderWithModel | undefined;

  // Agent helpers
  findAgentByKey: (key: string) => AvailableAgent | undefined;
  getEffectiveAgentType: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string } | undefined
  ) => EffectiveAgentInfo;
  resolvePresetRulesAndSkills: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string; context?: string } | undefined
  ) => Promise<{ rules?: string; skills?: string }>;
  resolveEnabledSkills: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string } | undefined
  ) => string[] | undefined;
  resolveDisabledBuiltinSkills: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string } | undefined
  ) => string[] | undefined;
  guidDisabledBuiltinSkills: string[] | undefined;
  guidEnabledSkills: string[] | undefined;
  availableMcpServers: IMcpServer[];
  selectedMcpServerIds: string[] | undefined;
  currentEffectiveAgentInfo: EffectiveAgentInfo;

  // Mention state reset
  setMentionOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMentionQuery: React.Dispatch<React.SetStateAction<string | null>>;
  setMentionSelectorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMentionActiveIndex: React.Dispatch<React.SetStateAction<number>>;

  // Navigation
  navigate: NavigateFunction;
  t: TFunction;
  language: string;
  appState: unknown;
};

export type GuidSendResult = {
  handleSend: () => Promise<boolean>;
  sendMessageHandler: () => void;
  isButtonDisabled: boolean;
};

/**
 * Hook that manages the send logic for ACP and Aion CLI conversations.
 */
export const useGuidSend = (deps: GuidSendDeps): GuidSendResult => {
  const {
    input,
    setInput,
    files,
    setFiles,
    dir,
    setDir,
    setLoading,
    loading,
    selectedAgent,
    selectedAgentKey,
    selectedAgentInfo,
    is_presetAgent,
    activeShortcut,
    selectedMode,
    selectedAcpModel,
    selectedReasoningEffort,
    currentAcpCachedModelInfo,
    current_model,
    findAgentByKey,
    getEffectiveAgentType,
    resolvePresetRulesAndSkills,
    resolveEnabledSkills,
    resolveDisabledBuiltinSkills,
    guidDisabledBuiltinSkills,
    guidEnabledSkills,
    availableMcpServers,
    selectedMcpServerIds,
    currentEffectiveAgentInfo: _currentEffectiveAgentInfo,
    setMentionOpen,
    setMentionQuery,
    setMentionSelectorOpen,
    setMentionActiveIndex,
    navigate,
    t,
    language,
    appState,
  } = deps;
  const sendingRef = useRef(false);
  const selectedShortcut =
    activeShortcut ??
    (is_presetAgent && selectedAgentInfo?.custom_agent_id
      ? resolveOplActiveShortcut(selectedAgentInfo.custom_agent_id, appState)
      : null);
  const selectedPackageId = selectedShortcut?.package_id ?? null;
  const selectedPackageLaunchGate = selectedPackageId
    ? resolveOplPackageLaunchGate(appState, selectedPackageId)
    : {
        state: 'ready' as const,
        launchAllowed: null,
        launchBlockedReason: null,
        allowedWhenBlocked: [],
      };
  const selectedPackageCapabilityMetadata = resolveOplStandardAgentCapabilityMetadata(appState, selectedPackageId);
  const capabilityMetadataMissing = Boolean(selectedPackageId && !selectedPackageCapabilityMetadata);
  const packageLaunchHardBlocked =
    selectedPackageLaunchGate.state === 'package_unavailable' || capabilityMetadataMissing;
  const effectiveLaunchBlockedReason =
    selectedPackageLaunchGate.state === 'package_unavailable'
      ? selectedPackageLaunchGate.launchBlockedReason
      : capabilityMetadataMissing
        ? 'capability_metadata_missing'
        : selectedPackageLaunchGate.launchBlockedReason;
  const launchBlockedMessage = () =>
    t('guid.home.launchBlocked', {
      reason: effectiveLaunchBlockedReason ?? t('guid.home.operationalNotReady'),
      actions: selectedPackageLaunchGate.allowedWhenBlocked.join(', '),
    });
  const handleSend = useCallback(async (): Promise<boolean> => {
    if (packageLaunchHardBlocked) {
      showOplAgentPackageLaunchBlocked(
        launchBlockedMessage(),
        selectedPackageId ?? '',
        effectiveLaunchBlockedReason ?? 'package_unavailable',
        selectedPackageLaunchGate.allowedWhenBlocked
      );
      return false;
    }
    const isCustomWorkspace = !!dir;
    const finalWorkspace = dir || '';
    const initialFiles = Array.from(new Set(files));

    const agentInfo = selectedAgentInfo;
    const is_preset = is_presetAgent;
    const preset_assistant_id = is_preset ? agentInfo?.custom_agent_id : undefined;

    const { agent_type: effectiveAgentType } = getEffectiveAgentType(agentInfo);

    const { rules: preset_rules } = await resolvePresetRulesAndSkills(agentInfo);
    // Guid page's per-conversation skill overrides take precedence over the
    // assistant's saved defaults. The combined skills menu lets the user pick
    // any custom skill — not just preset-declared ones — so for non-preset
    // agents we still forward the user's selection (the backend accepts
    // `preset_enabled_skills` regardless of `is_preset`).
    const presetEnabledSkillsDefault = resolveEnabledSkills(agentInfo);
    const capabilityMetadata = selectedPackageCapabilityMetadata;
    const allowedSkillIds = new Set(
      capabilityMetadata
        ? [...capabilityMetadata.requiredSkillIds, ...capabilityMetadata.optionalSkillRefs]
        : selectedPackageId
          ? []
          : getOplDirectorySkillIds(appState)
    );
    const filterEnabledSkills = (skills: string[]) =>
      Array.from(new Set(skills.filter((name) => allowedSkillIds.has(name))));
    const requiredSkillIds = capabilityMetadata?.requiredSkillIds ?? [];
    const enabled_skills = Array.from(
      new Set([...requiredSkillIds, ...filterEnabledSkills(guidEnabledSkills ?? presetEnabledSkillsDefault ?? [])])
    );
    const filteredGuidEnabledSkills = Array.from(
      new Set([...requiredSkillIds, ...filterEnabledSkills(guidEnabledSkills ?? [])])
    );
    const enabled_skills_to_send = is_presetAgent
      ? enabled_skills
      : filteredGuidEnabledSkills.length
        ? filteredGuidEnabledSkills
        : undefined;
    const excludeBuiltinSkills = guidDisabledBuiltinSkills ?? resolveDisabledBuiltinSkills(agentInfo);
    const selectedMcpServerIdSet = new Set(selectedMcpServerIds ?? []);
    const visibleMcpServers = filterOplOrdinaryMcpServers(availableMcpServers);
    const selectedUserMcpServerIds = visibleMcpServers
      .filter((server) => selectedMcpServerIdSet.has(server.id) && server.builtin !== true)
      .map((server) => server.id);
    const selectedAllSessionMcpServers = visibleMcpServers
      .filter((server) => selectedMcpServerIdSet.has(server.id))
      .map((server) => toSessionMcpServer(server));
    const selectedSessionMcpServers = visibleMcpServers
      .filter((server) => selectedMcpServerIdSet.has(server.id) && server.builtin === true)
      .map((server) => toSessionMcpServer(server));

    const finalEffectiveAgentType = effectiveAgentType;
    const freshAppState = await loadOplAppStateFromBridge('fast', { forceFresh: true }).catch((): null => null);
    const oplFlowInstalled = isOplFlowInstalledFromAppState(freshAppState);
    const oplFlowModelRecommendation = resolveOplFlowCodexModelRecommendation(freshAppState);

    // OpenClaw Gateway path
    if (selectedAgent === 'openclaw-gateway') {
      const openclawAgentInfo = agentInfo || findAgentByKey(selectedAgentKey);
      const openclawConversationParams = buildAgentConversationParams({
        backend: openclawAgentInfo?.backend || 'openclaw-gateway',
        name: input,
        agent_name: openclawAgentInfo?.name,
        preset_assistant_id,
        workspace: finalWorkspace,
        model: current_model!,
        cli_path: openclawAgentInfo?.cli_path,
        custom_agent_id: openclawAgentInfo?.custom_agent_id,
        custom_workspace: isCustomWorkspace,
        language,
        opl_flow_installed: oplFlowInstalled,
        extra: {
          default_files: initialFiles,
          runtime_validation: {
            expected_workspace: finalWorkspace,
            expected_backend: openclawAgentInfo?.backend,
            expected_agent_name: openclawAgentInfo?.name,
            expected_cli_path: openclawAgentInfo?.cli_path,
            expected_model: current_model?.use_model,
            switched_at: Date.now(),
          },
          preset_enabled_skills: enabled_skills_to_send,
          exclude_auto_inject_skills: excludeBuiltinSkills,
        },
      });

      try {
        const conversation = await ipcBridge.conversation.create.invoke(openclawConversationParams);

        if (!conversation || !conversation.id) {
          Message.error(t('conversation.createFailed'));
          return false;
        }

        if (isCustomWorkspace) {
          updateWorkspaceTime(finalWorkspace);
        }

        emitter.emit('chat.history.refresh');

        const initialMessage = {
          input,
          files: initialFiles.length > 0 ? initialFiles : undefined,
        };
        sessionStorage.setItem(`openclaw_initial_message_${conversation.id}`, JSON.stringify(initialMessage));

        await navigate(`/conversation/${conversation.id}`);
      } catch (error: unknown) {
        console.error('Failed to create OpenClaw conversation:', error);
        throw error;
      }
      return true;
    }

    // Nanobot path
    if (selectedAgent === 'nanobot') {
      const nanobotAgentInfo = agentInfo || findAgentByKey(selectedAgentKey);
      const nanobotConversationParams = buildAgentConversationParams({
        backend: nanobotAgentInfo?.backend || 'nanobot',
        name: input,
        agent_name: nanobotAgentInfo?.name,
        preset_assistant_id,
        workspace: finalWorkspace,
        model: current_model!,
        custom_agent_id: nanobotAgentInfo?.custom_agent_id,
        custom_workspace: isCustomWorkspace,
        language,
        opl_flow_installed: oplFlowInstalled,
        extra: {
          default_files: initialFiles,
          preset_enabled_skills: enabled_skills_to_send,
          exclude_auto_inject_skills: excludeBuiltinSkills,
        },
      });

      try {
        const conversation = await ipcBridge.conversation.create.invoke(nanobotConversationParams);

        if (!conversation || !conversation.id) {
          Message.error(t('conversation.createFailed'));
          return false;
        }

        if (isCustomWorkspace) {
          updateWorkspaceTime(finalWorkspace);
        }

        emitter.emit('chat.history.refresh');

        const initialMessage = {
          input,
          files: initialFiles.length > 0 ? initialFiles : undefined,
        };
        sessionStorage.setItem(`nanobot_initial_message_${conversation.id}`, JSON.stringify(initialMessage));

        await navigate(`/conversation/${conversation.id}`);
      } catch (error: unknown) {
        console.error('Failed to create Nanobot conversation:', error);
        throw error;
      }
      return true;
    }

    // Aionrs path (direct selection or preset assistant with aionrs as main agent)
    if (selectedAgent === 'aionrs' || (is_preset && finalEffectiveAgentType === 'aionrs')) {
      if (!current_model) {
        Message.warning(t('conversation.noModelConfigured'));
        return false;
      }
      try {
        const conversation = await ipcBridge.conversation.create.invoke({
          type: 'aionrs',
          name: input,
          model: current_model,
          assistant: selectedAgentInfo?.backend_assistant_id
            ? { id: selectedAgentInfo.backend_assistant_id, locale: resolveLocaleKey(language) }
            : undefined,
          extra: {
            default_files: initialFiles,
            workspace: finalWorkspace,
            custom_workspace: isCustomWorkspace,
            preset_rules: is_preset ? preset_rules : undefined,
            preset_enabled_skills: enabled_skills_to_send,
            exclude_auto_inject_skills: excludeBuiltinSkills,
            selected_mcp_server_ids: selectedUserMcpServerIds,
            // aionrs should consume the authoritative session snapshot, just
            // like team MCP does, instead of reloading only user servers from
            // the global MCP repository at runtime.
            selected_session_mcp_servers: selectedAllSessionMcpServers,
            preset_assistant_id,
            session_mode: selectedMode,
          },
        });

        if (!conversation || !conversation.id) {
          Message.error(t('conversation.createFailed'));
          return false;
        }

        if (isCustomWorkspace) {
          updateWorkspaceTime(finalWorkspace);
        }

        emitter.emit('chat.history.refresh');

        const initialMessage = {
          input,
          files: initialFiles.length > 0 ? initialFiles : undefined,
        };
        sessionStorage.setItem(`aionrs_initial_message_${conversation.id}`, JSON.stringify(initialMessage));

        await navigate(`/conversation/${conversation.id}`);
      } catch (error: unknown) {
        console.error('Failed to create Aion CLI conversation:', error);
        throw error;
      }
      return true;
    }

    // Remaining agent path (ACP/remote/custom, including preset fallbacks)
    {
      // Agent-type fallback only applies to preset assistants whose primary agent
      // was unavailable and got switched. For non-preset
      // agents (including extension-contributed ACP adapters with backend='custom'),
      // we must keep the original selectedAgent so the correct backend/cli_path is used.
      const agent_typeChanged = is_preset && selectedAgent !== finalEffectiveAgentType;
      const acpBackend: string | undefined = agent_typeChanged
        ? finalEffectiveAgentType
        : is_preset
          ? finalEffectiveAgentType
          : selectedAgent;

      const acpAgentInfo = agent_typeChanged
        ? findAgentByKey(acpBackend as string)
        : agentInfo || findAgentByKey(selectedAgentKey);

      if (!acpAgentInfo && !is_preset) {
        console.warn(`${acpBackend} CLI not found, but proceeding to let conversation panel handle it.`);
      }
      const agentBackend = acpBackend || selectedAgent;
      const codexAutoSelection =
        agentBackend === 'codex' && selectedAcpModel === null
          ? resolveOplCodexAutoSelection(currentAcpCachedModelInfo, oplFlowModelRecommendation)
          : null;
      const codexReasoningEffort = selectedReasoningEffort ?? codexAutoSelection?.reasoningEffort;
      const agentConversationParams = buildAgentConversationParams({
        backend: agentBackend,
        name: input,
        // For row-scoped rows (custom ACP / remote) the backend factory
        // needs the actual catalog id — `backend` collapses to the `custom`
        // slot so it cannot discriminate between rows on its own.
        agent_id: acpAgentInfo?.id,
        agent_name: acpAgentInfo?.name,
        preset_assistant_id,
        backend_assistant_id: acpAgentInfo?.backend_assistant_id,
        workspace: finalWorkspace,
        model: current_model!,
        cli_path: acpAgentInfo?.cli_path,
        custom_agent_id: acpAgentInfo?.custom_agent_id,
        custom_workspace: isCustomWorkspace,
        is_preset,
        preset_agent_type: finalEffectiveAgentType,
        preset_resources: is_preset
          ? {
              rules: preset_rules,
              enabled_skills,
              exclude_auto_inject_skills: excludeBuiltinSkills,
            }
          : undefined,
        session_mode: selectedMode,
        current_model_id:
          selectedAcpModel || codexAutoSelection?.modelId || currentAcpCachedModelInfo?.current_model_id || undefined,
        config_options: codexReasoningEffort ? { reasoning_effort: codexReasoningEffort } : undefined,
        language,
        opl_flow_installed: oplFlowInstalled,
        extra: {
          default_files: initialFiles,
          exclude_auto_inject_skills: excludeBuiltinSkills,
          selected_mcp_server_ids: selectedUserMcpServerIds,
          selected_session_mcp_servers: selectedSessionMcpServers,
          // Non-preset agents still forward user-selected custom skills via the
          // shared backend slot. For preset assistants this is already wired
          // through `preset_resources.enabled_skills` above.
          ...(is_preset
            ? {}
            : filteredGuidEnabledSkills.length
              ? { preset_enabled_skills: filteredGuidEnabledSkills }
              : {}),
        },
      });

      try {
        const conversation = await ipcBridge.conversation.create.invoke(agentConversationParams);
        if (!conversation || !conversation.id) {
          console.error('Failed to create ACP conversation - conversation object is null or missing id');
          Message.error(t('conversation.createFailed'));
          return false;
        }

        if (isCustomWorkspace) {
          updateWorkspaceTime(finalWorkspace);
        }

        emitter.emit('chat.history.refresh', conversation);

        const initialMessage = {
          input,
          files: initialFiles.length > 0 ? initialFiles : undefined,
        };
        sessionStorage.setItem(`acp_initial_message_${conversation.id}`, JSON.stringify(initialMessage));

        await navigate(`/conversation/${conversation.id}`);
        return true;
      } catch (error: unknown) {
        console.error('Failed to create ACP conversation:', error);
        throw error;
      }
    }
  }, [
    input,
    files,
    dir,
    selectedAgent,
    selectedAgentKey,
    selectedAgentInfo,
    is_presetAgent,
    activeShortcut,
    selectedMode,
    selectedAcpModel,
    currentAcpCachedModelInfo,
    current_model,
    findAgentByKey,
    getEffectiveAgentType,
    resolvePresetRulesAndSkills,
    resolveEnabledSkills,
    resolveDisabledBuiltinSkills,
    guidDisabledBuiltinSkills,
    guidEnabledSkills,
    availableMcpServers,
    selectedMcpServerIds,
    navigate,
    t,
    language,
    appState,
    selectedPackageLaunchGate.launchAllowed,
    selectedPackageLaunchGate.launchBlockedReason,
    selectedPackageLaunchGate.allowedWhenBlocked,
    selectedPackageId,
    selectedPackageCapabilityMetadata,
    effectiveLaunchBlockedReason,
    packageLaunchHardBlocked,
  ]);

  const sendMessageHandler = useCallback(() => {
    if (loading || sendingRef.current) return;
    if (packageLaunchHardBlocked) {
      showOplAgentPackageLaunchBlocked(
        launchBlockedMessage(),
        selectedPackageId ?? '',
        effectiveLaunchBlockedReason ?? 'package_unavailable',
        selectedPackageLaunchGate.allowedWhenBlocked
      );
      return;
    }
    sendingRef.current = true;
    setLoading(true);
    const sentInput = input;
    const sentFiles = new Set(files);
    const sentDir = dir;
    handleSend()
      .then((accepted) => {
        if (!accepted) return;
        setInput((currentInput) => (currentInput === sentInput ? '' : currentInput));
        setMentionOpen(false);
        setMentionQuery(null);
        setMentionSelectorOpen(false);
        setMentionActiveIndex(0);
        setFiles((currentFiles) => currentFiles.filter((file) => !sentFiles.has(file)));
        setDir((currentDir) => (currentDir === sentDir ? '' : currentDir));
      })
      .catch((error) => {
        console.error('Failed to send message:', error);
        Message.error(getConversationCreateErrorMessage(error, t));
      })
      .finally(() => {
        sendingRef.current = false;
        setLoading(false);
      });
  }, [
    loading,
    input,
    files,
    handleSend,
    setLoading,
    setInput,
    setMentionOpen,
    setMentionQuery,
    setMentionSelectorOpen,
    setMentionActiveIndex,
    setFiles,
    setDir,
    t,
    selectedPackageLaunchGate.launchAllowed,
    selectedPackageLaunchGate.launchBlockedReason,
    selectedPackageLaunchGate.allowedWhenBlocked,
    selectedPackageId,
    effectiveLaunchBlockedReason,
    dir,
    packageLaunchHardBlocked,
  ]);

  // Calculate button disabled state
  const isButtonDisabled = loading || !input.trim();

  return {
    handleSend,
    sendMessageHandler,
    isButtonDisabled,
  };
};
