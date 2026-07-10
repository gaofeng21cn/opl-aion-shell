/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import useSWR from 'swr';
import { ipcBridge } from '@/common';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import type { ManagedAgent } from '@/renderer/utils/model/agentTypes';
import { isSupportedNewConversationAgent } from '@/renderer/utils/model/agentTypeSupportPolicy';
import { useMemo } from 'react';
import { useManagedAgents } from '@/renderer/hooks/agent/useManagedAgents';

export type UseConversationAgentsResult = {
  /** Detected execution engines (acp, extension, remote, aionrs, gemini, etc.) */
  cliAgents: ManagedAgent[];
  /** Preset assistants from `/api/assistants` — kept as-is, not re-shaped into agent form */
  presetAssistants: Assistant[];
  /** Loading state */
  isLoading: boolean;
  /** Refresh data */
  refresh: () => Promise<void>;
};

/**
 * Hook to fetch available CLI agents and preset assistants for the conversation tab dropdown.
 *
 * Business candidates come from `/api/assistants`; managed rows only enrich
 * generated assistants with runtime metadata used by existing selectors.
 */
export const useConversationAgents = (): UseConversationAgentsResult => {
  const { agents: managedAgents, isLoading: isLoadingAgents, refreshCatalog } = useManagedAgents();

  const { data: assistantCatalog, isLoading: isLoadingPresets } = useSWR('assistants.list', async () => {
    try {
      return await ipcBridge.assistants.list.invoke();
    } catch (error) {
      console.error('Failed to load assistants for conversation selector:', error);
      return [] as Assistant[];
    }
  });

  const enabledAssistants = useMemo(
    () => (assistantCatalog ?? []).filter((assistant) => assistant.enabled !== false),
    [assistantCatalog]
  );
  const generatedAgentIds = useMemo(
    () =>
      new Set(
        enabledAssistants
          .filter((assistant) => assistant.source === 'generated')
          .map((assistant) => assistant.agent_id)
          .filter((agentId): agentId is string => Boolean(agentId))
      ),
    [enabledAssistants]
  );
  const cliAgents = useMemo(
    () => managedAgents.filter((agent) => generatedAgentIds.has(agent.id) && isSupportedNewConversationAgent(agent)),
    [generatedAgentIds, managedAgents]
  );
  const presetAssistants = useMemo(
    () => enabledAssistants.filter((assistant) => assistant.source !== 'generated'),
    [enabledAssistants]
  );

  return {
    cliAgents,
    presetAssistants,
    isLoading: isLoadingAgents || isLoadingPresets,
    refresh: async () => {
      await refreshCatalog();
    },
  };
};
