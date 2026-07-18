/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICronAgentConfigRead, ICronAgentConfigWrite, ICronJob } from '@/common/adapter/ipcBridge';
import { assistantRuntimeKey, type Assistant } from '@/common/types/agent/assistantTypes';

export type CronAssistantIdentity = Pick<Assistant, 'id' | 'name' | 'name_i18n' | 'agent' | 'preset_agent_type'>;
export type OplScheduledCodexCandidate = CronAssistantIdentity & Pick<Assistant, 'source' | 'enabled'>;
export type OplScheduledCodexResolution =
  | { status: 'ready'; assistant: OplScheduledCodexCandidate }
  | { status: 'missing' | 'ambiguous' };

type ResolveCronAgentConfigInput = {
  assistantId: string;
  assistants: CronAssistantIdentity[];
  selectedAionrsProvider?: { id?: string };
  model_id?: string;
  config_options?: Record<string, string>;
  workspace?: string;
  localeKey?: string;
  getMode: (assistant: CronAssistantIdentity) => string | undefined;
  aionrsModelRequiredMessage: string;
};

type CronExecutionMode = 'existing' | 'new_conversation';

function isGeneratedEnabledCodex(candidate: OplScheduledCodexCandidate): boolean {
  return candidate.source === 'generated' && candidate.enabled && assistantRuntimeKey(candidate) === 'codex';
}

export function resolveOplScheduledCodexAssistant(
  candidates: OplScheduledCodexCandidate[]
): OplScheduledCodexResolution {
  const matches = candidates.filter(isGeneratedEnabledCodex);
  if (matches.length === 0) return { status: 'missing' };
  if (matches.length > 1) return { status: 'ambiguous' };
  return { status: 'ready', assistant: matches[0] };
}

export function isOplCodexCronJob(job: Pick<ICronJob, 'metadata'>, candidates: OplScheduledCodexCandidate[]): boolean {
  const config = job.metadata.agent_config;
  const knownCodexAssistantIds = new Set(candidates.filter(isGeneratedEnabledCodex).map((candidate) => candidate.id));
  if (config?.assistant_id && knownCodexAssistantIds.has(config.assistant_id)) return true;

  const runtimeKeys = [config?.backend, config?.preset_agent_type, job.metadata.agent_type]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/^(cli|preset):/, ''));
  return runtimeKeys.includes('codex');
}

export function resolveCronEditProviderId(config: ICronAgentConfigRead | undefined): string | undefined {
  return config?.model?.provider_id;
}

export function shouldIncludeCronAgentConfig(input: {
  isEditMode: boolean;
  originalExecutionMode?: CronExecutionMode;
  nextExecutionMode: CronExecutionMode;
}): boolean {
  if (!input.isEditMode) return true;
  return (input.originalExecutionMode ?? 'existing') !== 'existing' && input.nextExecutionMode !== 'existing';
}

export function resolveCronAgentConfig(input: ResolveCronAgentConfigInput): ICronAgentConfigWrite {
  const assistant = input.assistants.find((candidate) => candidate.id === input.assistantId);
  if (!assistant) throw new Error('assistant_id is required');

  const name = assistant.name_i18n?.[input.localeKey ?? 'en-US'] || assistant.name;
  const mode = input.getMode(assistant);
  const runtimeKey = assistantRuntimeKey(assistant);

  if (runtimeKey === 'aionrs') {
    if (!input.selectedAionrsProvider?.id || !input.model_id) {
      throw new Error(input.aionrsModelRequiredMessage);
    }
    return {
      name,
      assistant_id: assistant.id,
      mode,
      model_id: input.model_id,
      model: {
        provider_id: input.selectedAionrsProvider.id,
        model: input.model_id,
        use_model: input.model_id,
      },
      workspace: input.workspace,
    };
  }

  return {
    name,
    assistant_id: assistant.id,
    mode,
    model_id: input.model_id,
    config_options: input.config_options,
    workspace: input.workspace,
  };
}
