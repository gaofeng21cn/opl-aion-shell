/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ManagedAgent } from '@/renderer/utils/model/agentTypes';
import { MANAGED_AGENTS_SWR_KEY, fetchManagedAgents } from '@/renderer/utils/model/agentTypes';
import { useMemo } from 'react';
import useSWR, { mutate } from 'swr';

export type UseManagedAgentsResult = {
  agents: ManagedAgent[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: unknown;
  revalidate: () => Promise<ManagedAgent[] | undefined>;
  refreshCatalog: () => Promise<ManagedAgent[] | undefined>;
};

export type ManagedAgentBackendOption = {
  id: string;
  name: string;
  isExtension?: boolean;
};

export async function refreshManagedAgentCatalogAndAssistants(): Promise<ManagedAgent[] | undefined> {
  const [agents] = await Promise.all([
    mutate<ManagedAgent[]>(MANAGED_AGENTS_SWR_KEY),
    mutate('assistants.list'),
    mutate('assistants'),
  ]);
  return agents;
}

export const useManagedAgents = (): UseManagedAgentsResult => {
  const { data, isLoading, isValidating, error } = useSWR<ManagedAgent[]>(MANAGED_AGENTS_SWR_KEY, fetchManagedAgents);

  return {
    agents: data ?? [],
    isLoading,
    isRefreshing: isValidating && !isLoading,
    error,
    revalidate: () => mutate<ManagedAgent[]>(MANAGED_AGENTS_SWR_KEY),
    refreshCatalog: refreshManagedAgentCatalogAndAssistants,
  };
};

export const useManagedAgentRuntimeCatalog = (): ManagedAgent[] => {
  const { data } = useSWR<ManagedAgent[]>(MANAGED_AGENTS_SWR_KEY, fetchManagedAgents);
  return data ?? [];
};

export const useManagedAgentBackends = () => {
  const { agents, isLoading, refreshCatalog } = useManagedAgents();
  const availableBackends = useMemo<ManagedAgentBackendOption[]>(
    () =>
      agents
        .filter(
          (agent) =>
            agent.agent_type !== 'remote' &&
            agent.enabled &&
            agent.installed &&
            agent.status !== 'missing' &&
            agent.status !== 'offline'
        )
        .map((agent) => ({
          id: agent.backend || agent.agent_type,
          name: agent.name,
          isExtension: agent.agent_source === 'extension',
        })),
    [agents]
  );

  return {
    availableBackends,
    isLoading,
    refreshAgentDetection: async () => {
      await refreshCatalog();
    },
  };
};

export async function getManagedAgents(): Promise<ManagedAgent[]> {
  const data = await fetchManagedAgents();
  await mutate(MANAGED_AGENTS_SWR_KEY, data, { revalidate: false });
  return data;
}
