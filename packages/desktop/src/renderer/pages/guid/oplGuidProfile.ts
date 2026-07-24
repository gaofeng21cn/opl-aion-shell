/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getOplDefaultExecutorAgentKey } from '@/common/config/oplProductProfile';
import type { AvailableAgent } from './types';

function getAgentBackend(agent: Pick<AvailableAgent, 'backend' | 'agent_type'>): string {
  return agent.backend || agent.agent_type;
}

export function filterOplHomeAgents(agents: AvailableAgent[] | undefined): AvailableAgent[] {
  const visibleBackends = new Set([getOplDefaultExecutorAgentKey()]);
  return (agents ?? []).filter((agent) => !agent.is_preset && visibleBackends.has(getAgentBackend(agent)));
}

export function shouldShowOplHomeAgentTabs(agents: AvailableAgent[] | undefined): boolean {
  return filterOplHomeAgents(agents).length > 1;
}

export function resolveOplDefaultAgentKey(agents: AvailableAgent[] | undefined): string {
  const defaultBackend = getOplDefaultExecutorAgentKey();
  const matched = (agents ?? []).find((agent) => !agent.is_preset && getAgentBackend(agent) === defaultBackend);
  return matched ? getAgentBackend(matched) : defaultBackend;
}

export function shouldShowOplAgentManagementEntry(): boolean {
  return false;
}
