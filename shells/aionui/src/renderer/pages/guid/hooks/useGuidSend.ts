/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConfigStorage, type TProviderWithModel } from '@/common/config/storage';
import type { TChatConversation } from '@/common/config/storage';
import { mergeOplDefaultCodexContext, normalizeOplCodexSessionContext } from '@/common/config/oplSkills';
import { buildAgentConversationParams } from '@/common/utils/buildAgentConversationParams';
import { emitter } from '@/renderer/utils/emitter';
import { buildDisplayMessage } from '@/renderer/utils/file/messageFiles';
import { updateWorkspaceTime } from '@/renderer/utils/workspace/workspaceHistory';
import { useCallback, useRef } from 'react';
import { type TFunction } from 'i18next';
import type { NavigateFunction } from 'react-router-dom';
import type { AcpBackend, AvailableAgent, EffectiveAgentInfo } from '../types';
import { DEFAULT_CODEX_MODEL_ID } from '@/common/types/codex/codexModels';

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
  isPresetAgent: boolean;
  selectedMode: string;
  selectedAcpModel: string | null;
  pendingConfigOptions: Record<string, string>;
  cachedConfigOptions: import('@/common/types/acpTypes').AcpSessionConfigOption[];
  currentModel: TProviderWithModel | undefined;

  // Agent helpers
  findAgentByKey: (key: string) => AvailableAgent | undefined;
  getEffectiveAgentType: (agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined) => EffectiveAgentInfo;
  resolvePresetRulesAndSkills: (
    agentInfo: { backend: AcpBackend; customAgentId?: string; context?: string } | undefined
  ) => Promise<{ rules?: string; skills?: string }>;
  resolveEnabledSkills: (
    agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined
  ) => string[] | undefined;
  resolveDisabledBuiltinSkills: (
    agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined
  ) => string[] | undefined;
  guidDisabledBuiltinSkills: string[] | undefined;
  currentEffectiveAgentInfo: EffectiveAgentInfo;
  isGoogleAuth: boolean;

  // Mention state reset
  setMentionOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMentionQuery: React.Dispatch<React.SetStateAction<string | null>>;
  setMentionSelectorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMentionActiveIndex: React.Dispatch<React.SetStateAction<number>>;

  // Navigation & tabs
  navigate: NavigateFunction;
  closeAllTabs: () => void;
  openTab: (conversation: TChatConversation) => void;
  t: TFunction;
};

export type GuidSendResult = {
  handleSend: () => Promise<void>;
  sendMessageHandler: () => void;
  isButtonDisabled: boolean;
};

const CODEX_SCHEMA_MODEL = {
  id: 'codex_system',
  name: 'Codex',
  platform: 'codex',
  baseUrl: '',
  apiKey: '',
  useModel: DEFAULT_CODEX_MODEL_ID,
} as TProviderWithModel;

function normalizeOplAgent(agent: string | undefined): string {
  if (!agent || agent === 'gemini' || agent === 'aionrs') return 'codex';
  return agent;
}

async function resolveOplCodexSessionContext(): Promise<string | undefined> {
  const context = await ConfigStorage.get('opl.codexSessionContext');
  const sessionContext = normalizeOplCodexSessionContext(context);
  if (sessionContext) {
    return sessionContext;
  }

  const addendum = await ConfigStorage.get('opl.codexSessionAddendum');
  if (typeof addendum === 'string' && addendum.trim().length > 0) {
    return mergeOplDefaultCodexContext(undefined, { codexSessionAddendum: addendum });
  }

  return undefined;
}

/**
 * Hook that manages the send logic for OPL-supported conversation types.
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
    isPresetAgent,
    selectedMode,
    selectedAcpModel,
    pendingConfigOptions,
    cachedConfigOptions,
    currentModel,
    findAgentByKey,
    getEffectiveAgentType,
    resolvePresetRulesAndSkills,
    resolveEnabledSkills,
    resolveDisabledBuiltinSkills,
    guidDisabledBuiltinSkills,
    currentEffectiveAgentInfo,
    setMentionOpen,
    setMentionQuery,
    setMentionSelectorOpen,
    setMentionActiveIndex,
    navigate,
    closeAllTabs,
    openTab,
  } = deps;
  const sendingRef = useRef(false);

  const handleSend = useCallback(async () => {
    const isCustomWorkspace = !!dir;
    const finalWorkspace = dir || '';

    const agentInfo = selectedAgentInfo;
    const isPreset = isPresetAgent;
    const presetAssistantId = isPreset ? agentInfo?.customAgentId : undefined;

    const { agentType: effectiveAgentType } = getEffectiveAgentType(agentInfo);

    const { rules: presetRules } = await resolvePresetRulesAndSkills(agentInfo);
    const enabledSkills = resolveEnabledSkills(agentInfo);
    // Use guid page's local skill state (initialized from assistant config, overridable by user)
    const excludeBuiltinSkills = guidDisabledBuiltinSkills ?? resolveDisabledBuiltinSkills(agentInfo);

    const finalEffectiveAgentType = normalizeOplAgent(effectiveAgentType);
    const selectedAgentForRoute = normalizeOplAgent(selectedAgent);
    const oplCodexSessionContext =
      finalEffectiveAgentType === 'codex' || selectedAgentForRoute === 'codex'
        ? await resolveOplCodexSessionContext()
        : undefined;
    const selectedAgentKeyForRoute =
      selectedAgentForRoute === selectedAgent && selectedAgentKey !== 'gemini' && selectedAgentKey !== 'aionrs'
        ? selectedAgentKey
        : 'codex';

    // OpenClaw Gateway path
    if (selectedAgentForRoute === 'openclaw-gateway') {
      const openclawAgentInfo = agentInfo || findAgentByKey(selectedAgentKey);
      const openclawConversationParams = buildAgentConversationParams({
        backend: openclawAgentInfo?.backend || 'openclaw-gateway',
        name: input,
        agentName: openclawAgentInfo?.name,
        presetAssistantId,
        workspace: finalWorkspace,
        model: currentModel!,
        cliPath: openclawAgentInfo?.cliPath,
        customAgentId: openclawAgentInfo?.customAgentId,
        customWorkspace: isCustomWorkspace,
        extra: {
          defaultFiles: files,
          runtimeValidation: {
            expectedWorkspace: finalWorkspace,
            expectedBackend: openclawAgentInfo?.backend,
            expectedAgentName: openclawAgentInfo?.name,
            expectedCliPath: openclawAgentInfo?.cliPath,
            expectedModel: currentModel?.useModel,
            switchedAt: Date.now(),
          },
          enabledSkills: isPreset ? enabledSkills : undefined,
          excludeBuiltinSkills,
        },
      });

      try {
        const conversation = await ipcBridge.conversation.create.invoke(openclawConversationParams);

        if (!conversation || !conversation.id) {
          alert('Failed to create OpenClaw conversation. Please ensure the OpenClaw Gateway is running.');
          return;
        }

        if (isCustomWorkspace) {
          closeAllTabs();
          updateWorkspaceTime(finalWorkspace);
          openTab(conversation);
        }

        emitter.emit('chat.history.refresh');

        const initialMessage = {
          input,
          files: files.length > 0 ? files : undefined,
        };
        sessionStorage.setItem(`openclaw_initial_message_${conversation.id}`, JSON.stringify(initialMessage));

        await navigate(`/conversation/${conversation.id}`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        alert(`Failed to create OpenClaw conversation: ${errorMessage}`);
        throw error;
      }
      return;
    }

    // Nanobot path
    if (selectedAgentForRoute === 'nanobot') {
      const nanobotAgentInfo = agentInfo || findAgentByKey(selectedAgentKey);
      const nanobotConversationParams = buildAgentConversationParams({
        backend: nanobotAgentInfo?.backend || 'nanobot',
        name: input,
        agentName: nanobotAgentInfo?.name,
        presetAssistantId,
        workspace: finalWorkspace,
        model: currentModel!,
        customAgentId: nanobotAgentInfo?.customAgentId,
        customWorkspace: isCustomWorkspace,
        extra: {
          defaultFiles: files,
          enabledSkills: isPreset ? enabledSkills : undefined,
          excludeBuiltinSkills,
        },
      });

      try {
        const conversation = await ipcBridge.conversation.create.invoke(nanobotConversationParams);

        if (!conversation || !conversation.id) {
          alert('Failed to create Nanobot conversation. Please ensure nanobot is installed.');
          return;
        }

        if (isCustomWorkspace) {
          closeAllTabs();
          updateWorkspaceTime(finalWorkspace);
          openTab(conversation);
        }

        emitter.emit('chat.history.refresh');

        const initialMessage = {
          input,
          files: files.length > 0 ? files : undefined,
        };
        sessionStorage.setItem(`nanobot_initial_message_${conversation.id}`, JSON.stringify(initialMessage));

        await navigate(`/conversation/${conversation.id}`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        alert(`Failed to create Nanobot conversation: ${errorMessage}`);
        throw error;
      }
      return;
    }

    // Remaining agent path (Codex, remote, or retained explicit custom backends)
    {
      // Agent-type fallback only applies to preset assistants whose primary agent
      // was unavailable and got switched. For non-preset agents
      // we must keep the original selectedAgent so the correct backend/cliPath is used.
      const agentTypeChanged = isPreset && selectedAgentForRoute !== finalEffectiveAgentType;
      const acpBackend: string | undefined = agentTypeChanged
        ? finalEffectiveAgentType
        : isPreset
          ? finalEffectiveAgentType
          : selectedAgentForRoute;

      const acpAgentInfo = agentTypeChanged
        ? findAgentByKey(acpBackend as string)
        : agentInfo || findAgentByKey(selectedAgentKeyForRoute);

      if (!acpAgentInfo && !isPreset) {
        console.warn(`${acpBackend} CLI not found, but proceeding to let conversation panel handle it.`);
      }
      const agentBackend = acpBackend || selectedAgent;
      const agentConversationParams = buildAgentConversationParams({
        backend: agentBackend,
        name: input,
        agentName: acpAgentInfo?.name,
        presetAssistantId,
        workspace: finalWorkspace,
        model: currentModel || CODEX_SCHEMA_MODEL,
        cliPath: acpAgentInfo?.cliPath,
        customAgentId: acpAgentInfo?.customAgentId,
        customWorkspace: isCustomWorkspace,
        isPreset,
        presetAgentType: finalEffectiveAgentType,
        presetResources: isPreset
          ? {
              rules: presetRules,
              enabledSkills,
              excludeBuiltinSkills,
            }
          : undefined,
        oplCodexSessionContext,
        sessionMode: selectedMode,
        currentModelId: selectedAcpModel || undefined,
        extra: {
          defaultFiles: files,
          excludeBuiltinSkills,
        },
      });

      try {
        // Merge pending selections into cached options so the UI shows the user's choice immediately
        const mergedCachedConfigOptions =
          cachedConfigOptions.length > 0
            ? Object.keys(pendingConfigOptions).length > 0
              ? cachedConfigOptions.map((opt) => {
                  const pending = opt.id ? pendingConfigOptions[opt.id] : undefined;
                  return pending ? { ...opt, currentValue: pending, selectedValue: pending } : opt;
                })
              : cachedConfigOptions
            : undefined;

        // Inject cachedConfigOptions & pendingConfigOptions into the params built by utility
        if (mergedCachedConfigOptions) {
          agentConversationParams.extra = {
            ...agentConversationParams.extra,
            cachedConfigOptions: mergedCachedConfigOptions,
          };
        }
        if (Object.keys(pendingConfigOptions).length > 0) {
          agentConversationParams.extra = { ...agentConversationParams.extra, pendingConfigOptions };
        }

        const conversation = await ipcBridge.conversation.create.invoke(agentConversationParams);
        if (!conversation || !conversation.id) {
          console.error('Failed to create ACP conversation - conversation object is null or missing id');
          return;
        }

        if (isCustomWorkspace) {
          closeAllTabs();
          updateWorkspaceTime(finalWorkspace);
          openTab(conversation);
        }

        emitter.emit('chat.history.refresh');

        const initialMessage = {
          input,
          files: files.length > 0 ? files : undefined,
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
    selectedAgent,
    selectedAgentKey,
    selectedAgentInfo,
    isPresetAgent,
    selectedMode,
    selectedAcpModel,
    pendingConfigOptions,
    cachedConfigOptions,
    currentModel,
    findAgentByKey,
    getEffectiveAgentType,
    resolvePresetRulesAndSkills,
    resolveEnabledSkills,
    resolveDisabledBuiltinSkills,
    guidDisabledBuiltinSkills,
    navigate,
    closeAllTabs,
    openTab,
  ]);

  const sendMessageHandler = useCallback(() => {
    if (loading || sendingRef.current) return;
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
  ]);

  // Calculate button disabled state
  const isButtonDisabled = loading || !input.trim();

  return {
    handleSend,
    sendMessageHandler,
    isButtonDisabled,
  };
};
