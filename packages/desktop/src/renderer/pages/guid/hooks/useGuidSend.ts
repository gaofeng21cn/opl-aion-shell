/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import {
  canonicalizeOplProfessionalAgentId,
  filterOplOrdinaryMcpServers,
  filterOplOrdinarySkillNames,
} from '@/common/config/oplProductProfile';
import type { IMcpServer, TProviderWithModel } from '@/common/config/storage';
import type { GitWorkspaceHandoffMetadata } from '@/common/types/platform/gitWorkspace';
import { resolveLocaleKey } from '@/common/utils';
import { resolveOplCodexAutoSelection } from '@/common/types/codex/codexModels';
import { buildAgentConversationParams } from '@/common/utils/buildAgentConversationParams';
import { toSessionMcpServer } from '@/renderer/hooks/mcp/catalog';
import { emitter } from '@/renderer/utils/emitter';
import { updateWorkspaceTime } from '@/renderer/utils/workspace/workspaceHistory';
import { Message } from '@arco-design/web-react';
import { useCallback, useRef } from 'react';
import { type TFunction } from 'i18next';
import type { NavigateFunction } from 'react-router-dom';
import { getConversationCreateErrorMessage } from '@/renderer/pages/conversation/utils/conversationCreateError';
import type { AcpModelInfo, AvailableAgent, EffectiveAgentInfo } from '../types';
import { useOplAppState } from '@/renderer/hooks/system/useOplAppState';
import { resolveOplPackageLaunchGate } from '../utils/oplHomeAssistants';
import {
  buildOplShortcutInvocationReceipt,
  buildOplShortcutRouteReceipt,
  resolveOplActiveShortcut,
  type OplAgentPackageInvocationReceipt,
  type OplActiveShortcut,
  type OplAssistantRouteReceipt,
} from '../utils/activeShortcut';
import {
  OplAgentPackageLaunchError,
  parseOplAgentPackageLaunchResult,
  type OplAgentPackageActivationReceipt,
} from '../utils/oplAgentPackageLaunchAuthority';

export type GuidSendDeps = {
  // Input state
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  files: string[];
  setFiles: React.Dispatch<React.SetStateAction<string[]>>;
  dir: string;
  workspaceHandoff?: GitWorkspaceHandoffMetadata;
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
};

export type GuidSendResult = {
  handleSend: () => Promise<void>;
  sendMessageHandler: () => void;
  isButtonDisabled: boolean;
};

function buildLegacyOplAssistantRouteReceipt(
  isPreset: boolean,
  agentInfo: { custom_agent_id?: string } | undefined
): OplAssistantRouteReceipt | undefined {
  if (!isPreset || !agentInfo?.custom_agent_id) return undefined;
  const assistantId = canonicalizeOplProfessionalAgentId(agentInfo.custom_agent_id);
  const shortcut = resolveOplActiveShortcut(assistantId);
  if (shortcut) return buildOplShortcutRouteReceipt(shortcut);
  return undefined;
}

function buildLegacyOplAgentPackageInvocationReceipt(
  isPreset: boolean,
  agentInfo: { custom_agent_id?: string } | undefined
): OplAgentPackageInvocationReceipt | undefined {
  if (!isPreset || !agentInfo?.custom_agent_id) return undefined;
  return buildOplShortcutInvocationReceipt(resolveOplActiveShortcut(agentInfo.custom_agent_id));
}

async function activateOplAgentPackage(
  packageId: string,
  targetWorkspace: string
): Promise<OplAgentPackageActivationReceipt> {
  const result = await ipcBridge.oplRuntime.executeAction.invoke({
    actionId: 'agent_package_activate',
    dryRun: false,
    payloadRefsOnlyJson: {
      package_id: packageId,
      scope: 'workspace',
      target_workspace: targetWorkspace,
    },
  });
  if (result.ok === false) {
    throw new Error(result.error?.message || result.command);
  }
  return parseOplAgentPackageLaunchResult({
    parsed: result.parsed,
    packageId,
    targetWorkspace,
  });
}

function getOplAgentPackageLaunchErrorMessage(error: unknown, t: TFunction): string | null {
  if (!(error instanceof OplAgentPackageLaunchError)) return null;

  switch (error.code) {
    case 'agent_package_launch_blocked':
      return t('guid.home.packageLaunchErrors.blocked');
    case 'agent_package_selection_mismatch':
      return t('guid.home.packageLaunchErrors.selectionMismatch');
    case 'agent_package_version_mismatch':
      return t('guid.home.packageLaunchErrors.versionMismatch');
    case 'agent_package_target_mismatch':
      return t('guid.home.packageLaunchErrors.targetMismatch');
    case 'agent_package_activation_invalid':
      return t('guid.home.packageLaunchErrors.invalid');
  }
}

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
    workspaceHandoff,
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
  } = deps;
  const sendingRef = useRef(false);
  const { appState } = useOplAppState('fast');
  const selectedShortcut =
    activeShortcut ??
    (is_presetAgent && selectedAgentInfo?.custom_agent_id
      ? resolveOplActiveShortcut(selectedAgentInfo.custom_agent_id)
      : null);
  const selectedPackageId = selectedShortcut?.package_id ?? null;
  const selectedPackageLaunchGate = selectedPackageId
    ? resolveOplPackageLaunchGate(appState, selectedPackageId)
    : { launchAllowed: null, launchBlockedReason: null, allowedWhenBlocked: [], activationRequired: false };
  const packageLaunchHardBlocked =
    selectedPackageLaunchGate.launchAllowed === false && !selectedPackageLaunchGate.activationRequired;
  const launchBlockedMessage = () =>
    t('guid.home.launchBlocked', {
      reason: selectedPackageLaunchGate.launchBlockedReason ?? t('guid.home.operationalNotReady'),
      actions: selectedPackageLaunchGate.allowedWhenBlocked.join(', '),
    });

  const handleSend = useCallback(async () => {
    if (packageLaunchHardBlocked) {
      Message.error(launchBlockedMessage());
      return;
    }
    if (selectedPackageId && !dir) {
      Message.error(t('guid.workspace.specifyWorkspace'));
      return;
    }
    const isCustomWorkspace = !!dir;
    const finalWorkspace = dir || '';
    const initialFiles = Array.from(new Set(files));
    const oplAgentPackageActivation = selectedPackageId
      ? await activateOplAgentPackage(selectedPackageId, finalWorkspace)
      : undefined;

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
    const enabled_skills = filterOplOrdinarySkillNames(guidEnabledSkills ?? presetEnabledSkillsDefault ?? []);
    const filteredGuidEnabledSkills = filterOplOrdinarySkillNames(guidEnabledSkills ?? []);
    const enabled_skills_to_send = is_presetAgent
      ? enabled_skills
      : filteredGuidEnabledSkills.length
        ? filteredGuidEnabledSkills
        : undefined;
    const excludeBuiltinSkills = guidDisabledBuiltinSkills ?? resolveDisabledBuiltinSkills(agentInfo);
    const oplAssistantRoute = activeShortcut
      ? buildOplShortcutRouteReceipt(activeShortcut)
      : buildLegacyOplAssistantRouteReceipt(is_preset, agentInfo);
    const oplAgentPackageInvocation = activeShortcut
      ? buildOplShortcutInvocationReceipt(activeShortcut)
      : buildLegacyOplAgentPackageInvocationReceipt(is_preset, agentInfo);
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
          opl_agent_package_invocation: oplAgentPackageInvocation,
          opl_agent_package_activation: oplAgentPackageActivation,
          opl_assistant_route: oplAssistantRoute,
        },
      });

      try {
        const conversation = await ipcBridge.conversation.create.invoke(openclawConversationParams);

        if (!conversation || !conversation.id) {
          Message.error(t('conversation.createFailed'));
          return;
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
      return;
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
        extra: {
          default_files: initialFiles,
          preset_enabled_skills: enabled_skills_to_send,
          exclude_auto_inject_skills: excludeBuiltinSkills,
          opl_agent_package_invocation: oplAgentPackageInvocation,
          opl_agent_package_activation: oplAgentPackageActivation,
          opl_assistant_route: oplAssistantRoute,
        },
      });

      try {
        const conversation = await ipcBridge.conversation.create.invoke(nanobotConversationParams);

        if (!conversation || !conversation.id) {
          Message.error(t('conversation.createFailed'));
          return;
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
      return;
    }

    // Aionrs path (direct selection or preset assistant with aionrs as main agent)
    if (selectedAgent === 'aionrs' || (is_preset && finalEffectiveAgentType === 'aionrs')) {
      if (!current_model) {
        Message.warning(t('conversation.noModelConfigured'));
        return;
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
            opl_agent_package_invocation: oplAgentPackageInvocation,
            opl_agent_package_activation: oplAgentPackageActivation,
            opl_assistant_route: oplAssistantRoute,
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
          return;
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
      return;
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
          ? resolveOplCodexAutoSelection(currentAcpCachedModelInfo)
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
        extra: {
          default_files: initialFiles,
          exclude_auto_inject_skills: excludeBuiltinSkills,
          opl_agent_package_invocation: oplAgentPackageInvocation,
          opl_agent_package_activation: oplAgentPackageActivation,
          opl_assistant_route: oplAssistantRoute,
          workspace_handoff: workspaceHandoff,
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
          return;
        }

        if (isCustomWorkspace) {
          updateWorkspaceTime(finalWorkspace);
        }

        emitter.emit('chat.history.refresh');

        const initialMessage = {
          input,
          files: initialFiles.length > 0 ? initialFiles : undefined,
        };
        sessionStorage.setItem(`acp_initial_message_${conversation.id}`, JSON.stringify(initialMessage));

        await navigate(`/conversation/${conversation.id}`);
      } catch (error: unknown) {
        console.error('Failed to create ACP conversation:', error);
        throw error;
      }
    }
  }, [
    input,
    files,
    dir,
    workspaceHandoff,
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
    selectedPackageLaunchGate.launchAllowed,
    selectedPackageLaunchGate.launchBlockedReason,
    selectedPackageLaunchGate.allowedWhenBlocked,
    selectedPackageLaunchGate.activationRequired,
    selectedPackageId,
    packageLaunchHardBlocked,
  ]);

  const sendMessageHandler = useCallback(() => {
    if (loading || sendingRef.current) return;
    if (packageLaunchHardBlocked) {
      Message.error(launchBlockedMessage());
      return;
    }
    if (selectedPackageId && !dir) {
      Message.error(t('guid.workspace.specifyWorkspace'));
      return;
    }
    sendingRef.current = true;
    setLoading(true);
    handleSend()
      .then(() => {
        setInput('');
        setMentionOpen(false);
        setMentionQuery(null);
        setMentionSelectorOpen(false);
        setMentionActiveIndex(0);
        setFiles([]);
        setDir('');
      })
      .catch((error) => {
        console.error('Failed to send message:', error);
        Message.error(getOplAgentPackageLaunchErrorMessage(error, t) ?? getConversationCreateErrorMessage(error, t));
      })
      .finally(() => {
        sendingRef.current = false;
        setLoading(false);
      });
  }, [
    loading,
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
    selectedPackageLaunchGate.activationRequired,
    selectedPackageId,
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
