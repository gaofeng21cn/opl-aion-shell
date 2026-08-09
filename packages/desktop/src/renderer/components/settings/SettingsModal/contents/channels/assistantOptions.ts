/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Assistant } from '@/common/types/agent/assistantTypes';
import type { IChannelAssistantBindingRead } from '@/common/types/channel/channel';
import { assistants as assistantApi, channel } from '@/common/adapter/ipcBridge';
import { useCallback, useEffect, useState } from 'react';

export type ChannelAgentOption = {
  assistant_id: string;
  runtime_agent_id?: string;
  agent_type: string;
  backend?: string;
  name: string;
};

export function buildChannelAgentOptions(assistants: Assistant[]): ChannelAgentOption[] {
  return assistants
    .filter(
      (assistant) =>
        assistant.enabled !== false &&
        assistant.agent &&
        assistant.agent_status !== 'missing' &&
        assistant.agent_status !== 'offline'
    )
    .map((assistant) => ({
      assistant_id: assistant.id,
      runtime_agent_id: assistant.agent_id,
      agent_type: assistant.agent!.type,
      backend: assistant.agent!.acp_backend,
      name: assistant.name,
    }));
}

export function buildChannelAssistantSelection(agent: ChannelAgentOption): { assistant_id: string } {
  return { assistant_id: agent.assistant_id };
}

export function resolveFixedBackendAssistantSelection(
  saved: IChannelAssistantBindingRead | null | undefined,
  assistants: Assistant[],
  backend: string
): { agent: ChannelAgentOption | null; shouldPersist: boolean } {
  const matches = buildChannelAgentOptions(assistants).filter((assistant) => assistant.backend === backend);
  if (matches.length !== 1) return { agent: null, shouldPersist: false };

  const agent = matches[0];
  return {
    agent,
    shouldPersist: saved?.assistant_id !== agent.assistant_id,
  };
}

export function resolveChannelAssistantSelection(
  saved: IChannelAssistantBindingRead | null | undefined,
  assistants: Assistant[]
): { assistantId?: string; hasBrokenSavedAssistant: boolean } {
  const options = buildChannelAgentOptions(assistants);
  if (!saved) {
    const defaultAssistant = options.find((assistant) => assistant.agent_type === 'aionrs') ?? options[0];
    return { assistantId: defaultAssistant?.assistant_id, hasBrokenSavedAssistant: false };
  }

  if (saved.assistant_id && options.some((assistant) => assistant.assistant_id === saved.assistant_id)) {
    return { assistantId: saved.assistant_id, hasBrokenSavedAssistant: false };
  }

  return {
    assistantId: undefined,
    hasBrokenSavedAssistant: Boolean(saved.assistant_id || saved.custom_agent_id || saved.backend || saved.agent_type),
  };
}

export function useChannelAssistantSelection(platform: string): {
  availableAgents: ChannelAgentOption[];
  selectedAgent: ChannelAgentOption | null;
  hasBrokenSavedAssistant: boolean;
  persistSelectedAgent: (agent: ChannelAgentOption) => Promise<void>;
} {
  const [availableAgents, setAvailableAgents] = useState<ChannelAgentOption[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<ChannelAgentOption | null>(null);
  const [hasBrokenSavedAssistant, setHasBrokenSavedAssistant] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([assistantApi.list.invoke(), channel.getPlatformSettings.invoke({ platform })])
      .then(([assistantList, saved]) => {
        if (cancelled) return;
        const options = buildChannelAgentOptions(assistantList);
        const selection = resolveChannelAssistantSelection(saved.assistant, assistantList);
        setAvailableAgents(options);
        setSelectedAgent(options.find((option) => option.assistant_id === selection.assistantId) ?? null);
        setHasBrokenSavedAssistant(selection.hasBrokenSavedAssistant);
      })
      .catch((error) => {
        console.error(`[ChannelAssistantSelection] Failed to load ${platform} assistant:`, error);
      });
    return () => {
      cancelled = true;
    };
  }, [platform]);

  const persistSelectedAgent = useCallback(
    async (agent: ChannelAgentOption) => {
      await channel.setAssistantSetting.invoke({
        platform,
        assistant: buildChannelAssistantSelection(agent),
      });
      setSelectedAgent(agent);
      setHasBrokenSavedAssistant(false);
    },
    [platform]
  );

  return { availableAgents, selectedAgent, hasBrokenSavedAssistant, persistSelectedAgent };
}

export function useFixedChannelAssistantSelection(platform: string, backend: string): void {
  useEffect(() => {
    let cancelled = false;
    void Promise.all([assistantApi.list.invoke(), channel.getPlatformSettings.invoke({ platform })])
      .then(async ([assistantList, saved]) => {
        const selection = resolveFixedBackendAssistantSelection(saved.assistant, assistantList, backend);
        if (cancelled || !selection.agent || !selection.shouldPersist) return;
        await channel.setAssistantSetting.invoke({
          platform,
          assistant: buildChannelAssistantSelection(selection.agent),
        });
      })
      .catch((error) => {
        console.error(`[FixedChannelAssistantSelection] Failed to bind ${platform} to ${backend}:`, error);
      });
    return () => {
      cancelled = true;
    };
  }, [backend, platform]);
}
