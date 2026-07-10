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
import { isRunnableManagedAgent, useManagedAgents } from '@/renderer/hooks/agent/useManagedAgents';

export type ConversationAgent = ManagedAgent &
  Assistant & {
    assistant_id: string;
    managed_agent_id: string;
  };

export type UseConversationAgentsResult = {
  /** Detected execution engines (acp, extension, remote, aionrs, gemini, etc.) */
  cliAgents: ConversationAgent[];
  /** Preset assistants from `/api/assistants` — kept as-is, not re-shaped into agent form */
  presetAssistants: Assistant[];
  /** Loading state */
  isLoading: boolean;
  /** Refresh data */
  refresh: () => Promise<void>;
};

export function selectRunnableConversationAgents(
  managedAgents: ManagedAgent[],
  assistants: Assistant[]
): ConversationAgent[] {
  const managedById = new Map(managedAgents.map((agent) => [agent.id, agent]));
  const candidates: ConversationAgent[] = [];
  for (const assistant of assistants) {
    if (assistant.enabled === false || assistant.source !== 'generated' || !assistant.agent_id) continue;
    const managedAgent = managedById.get(assistant.agent_id);
    if (!managedAgent || !isRunnableManagedAgent(managedAgent) || !isSupportedNewConversationAgent(managedAgent)) {
      continue;
    }
    candidates.push({
      ...managedAgent,
      ...assistant,
      id: assistant.id,
      name: assistant.name,
      icon: assistant.avatar || managedAgent.icon,
      team_capable: assistant.team_selectable ?? managedAgent.team_capable,
      assistant_id: assistant.id,
      managed_agent_id: managedAgent.id,
    });
  }
  return candidates;
}

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
  const cliAgents = useMemo(
    () => selectRunnableConversationAgents(managedAgents, enabledAssistants),
    [enabledAssistants, managedAgents]
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
