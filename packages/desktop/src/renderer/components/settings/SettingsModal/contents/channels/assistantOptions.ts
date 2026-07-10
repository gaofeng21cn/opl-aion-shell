/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Assistant } from '@/common/types/agent/assistantTypes';

export type ChannelAgentOption = {
  agent_type: string;
  backend?: string;
  name: string;
  id?: string;
};

export function buildChannelAgentOptions(assistants: Assistant[]): ChannelAgentOption[] {
  return assistants
    .filter(
      (assistant) =>
        assistant.enabled !== false &&
        assistant.source === 'generated' &&
        assistant.agent &&
        assistant.agent_status !== 'missing' &&
        assistant.agent_status !== 'offline'
    )
    .map((assistant) => ({
      agent_type: assistant.agent!.type,
      backend: assistant.agent!.acp_backend,
      name: assistant.name,
      id: assistant.agent_id,
    }));
}
