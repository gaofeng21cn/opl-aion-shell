/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Mirror of aionui-api-types/src/assistant.rs.
// Any shape change on either side requires a same-PR update on the other.

export type AssistantSource = 'builtin' | 'generated' | 'user' | 'extension';
export type AssistantAgentStatus = 'missing' | 'online' | 'offline' | 'unchecked';
export type AssistantAgentSource = 'internal' | 'builtin' | 'extension' | 'custom';

export type AssistantAgent = {
  type: string;
  source: AssistantAgentSource;
  acp_backend?: string;
};

export function assistantRuntimeKey(assistant?: Pick<Assistant, 'agent' | 'preset_agent_type'> | null): string {
  return assistant?.agent?.acp_backend || assistant?.agent?.type || assistant?.preset_agent_type || '';
}

export function isAionrsAssistant(assistant?: Pick<Assistant, 'agent' | 'preset_agent_type'> | null): boolean {
  return assistantRuntimeKey(assistant) === 'aionrs';
}

export interface Assistant {
  id: string;
  source: AssistantSource;
  name: string;
  name_i18n: Record<string, string>;
  description?: string;
  description_i18n: Record<string, string>;
  avatar?: string;
  enabled: boolean;
  sort_order: number;
  /** Legacy shell field retained for older stored assistants. */
  preset_agent_type?: string;
  agent_id?: string;
  agent?: AssistantAgent;
  enabled_skills: string[];
  custom_skill_names: string[];
  disabled_builtin_skills: string[];
  context?: string;
  context_i18n: Record<string, string>;
  prompts: string[];
  prompts_i18n: Record<string, string[]>;
  models: string[];
  last_used_at?: number;
  agent_status?: AssistantAgentStatus;
  agent_status_message?: string;
  team_selectable?: boolean;
  team_block_reason?: string;
  deletable?: boolean;
}

export interface CreateAssistantRequest {
  id?: string;
  name: string;
  description?: string;
  avatar?: string;
  agent_id?: string;
  enabled_skills?: string[];
  custom_skill_names?: string[];
  disabled_builtin_skills?: string[];
  prompts?: string[];
  models?: string[];
  name_i18n?: Record<string, string>;
  description_i18n?: Record<string, string>;
  prompts_i18n?: Record<string, string[]>;
}

export type UpdateAssistantRequest = Partial<Omit<CreateAssistantRequest, 'id'>> & {
  id: string;
};

export interface SetAssistantStateRequest {
  id: string;
  enabled?: boolean;
  sort_order?: number;
  last_used_at?: number;
}

export interface ImportAssistantsRequest {
  assistants: CreateAssistantRequest[];
}

export interface ImportError {
  id: string;
  error: string;
}

export interface ImportAssistantsResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: ImportError[];
}
