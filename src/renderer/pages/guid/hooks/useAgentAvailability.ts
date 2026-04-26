/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider } from '@/common/config/storage';
import type { AcpBackend, AvailableAgent, EffectiveAgentInfo } from '../types';
import { useCallback } from 'react';

type UseAgentAvailabilityOptions = {
  modelList: IProvider[];
  isGoogleAuth: boolean;
  availableAgents: AvailableAgent[] | undefined;
  resolvePresetAgentType: (agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined) => string;
};

type UseAgentAvailabilityResult = {
  isMainAgentAvailable: (agentType: string) => boolean;
  getEffectiveAgentType: (agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined) => EffectiveAgentInfo;
};

/**
 * Hook that provides agent availability checking logic.
 * Determines whether agents are available and provides fallback resolution.
 */
export const useAgentAvailability = ({
  availableAgents,
  resolvePresetAgentType,
}: UseAgentAvailabilityOptions): UseAgentAvailabilityResult => {
  const isMainAgentAvailable = useCallback(
    (agentType: string): boolean => {
      const backend = agentType === 'gemini' || agentType === 'aionrs' ? 'codex' : agentType;
      return availableAgents?.some((agent) => agent.backend === backend) ?? backend === 'codex';
    },
    [availableAgents]
  );

  const getEffectiveAgentType = useCallback(
    (agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined): EffectiveAgentInfo => {
      const originalType = resolvePresetAgentType(agentInfo);
      const isAvailable = isMainAgentAvailable(originalType);
      return { agentType: originalType, isFallback: false, originalType, isAvailable };
    },
    [resolvePresetAgentType, isMainAgentAvailable]
  );

  return {
    isMainAgentAvailable,
    getEffectiveAgentType,
  };
};
