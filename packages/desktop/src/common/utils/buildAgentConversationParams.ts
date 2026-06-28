/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICreateConversationParams } from '@/common/adapter/ipcBridge';
import { getOplCodexSessionContextForLocale, getOplFlowContextPolicy } from '@/common/config/oplProductProfile';
import type { TProviderWithModel } from '@/common/config/storage';
import { resolveLocaleKey } from '@/common/utils';

export type BuildAgentConversationPresetResources = {
  rules?: string;
  enabled_skills?: string[];
  exclude_auto_inject_skills?: string[];
};

export type BuildAgentConversationInput = {
  backend: string;
  name: string;
  agent_id?: string;
  agent_name?: string;
  preset_assistant_id?: string;
  workspace: string;
  model: TProviderWithModel;
  cli_path?: string;
  custom_agent_id?: string;
  custom_workspace?: boolean;
  is_preset?: boolean;
  preset_agent_type?: string;
  preset_resources?: BuildAgentConversationPresetResources;
  session_mode?: string;
  current_model_id?: string;
  config_options?: Record<string, string>;
  language?: string;
  extra?: Partial<ICreateConversationParams['extra']>;
};

function mergePresetContext(oplFlowContext: string, presetRules?: string): string {
  return [oplFlowContext.trim(), presetRules?.trim()].filter(Boolean).join('\n\n');
}

export function getConversationTypeForBackend(backend: string): ICreateConversationParams['type'] {
  return backend === 'aionrs' ? 'aionrs' : 'acp';
}

export function buildAgentConversationParams(input: BuildAgentConversationInput): ICreateConversationParams {
  const {
    backend,
    name,
    agent_id,
    agent_name,
    preset_assistant_id,
    workspace,
    model,
    cli_path,
    custom_agent_id,
    custom_workspace = true,
    is_preset = false,
    preset_agent_type,
    preset_resources,
    session_mode,
    current_model_id,
    config_options,
    language = 'zh-CN',
    extra: extraOverrides,
  } = input;

  const effectivePresetType = preset_agent_type || backend;
  const effectivePresetAssistantId = preset_assistant_id || custom_agent_id;
  const type = getConversationTypeForBackend(is_preset ? effectivePresetType : backend);
  const oplFlowContextPolicy = getOplFlowContextPolicy();
  const oplFlowSessionContext = getOplCodexSessionContextForLocale(resolveLocaleKey(language));
  const extra: ICreateConversationParams['extra'] = {
    workspace,
    custom_workspace,
    opl_flow_context: {
      flow_id: oplFlowContextPolicy.flow_id,
      source: oplFlowContextPolicy.source,
      delivery: oplFlowContextPolicy.delivery,
      language: oplFlowContextPolicy.language_policy,
      user_agents_policy: oplFlowContextPolicy.user_agents_policy,
    },
    ...extraOverrides,
  };

  if (is_preset) {
    // Transient create-request fields: backend's create handler consumes
    // them to compute extra.skills, then strips before persistence.
    if (preset_resources?.enabled_skills?.length) {
      extra.preset_enabled_skills = preset_resources.enabled_skills;
    }
    if (preset_resources?.exclude_auto_inject_skills?.length) {
      extra.exclude_auto_inject_skills = preset_resources.exclude_auto_inject_skills;
    }
    extra.preset_assistant_id = effectivePresetAssistantId;
    extra.preset_context = mergePresetContext(oplFlowSessionContext, preset_resources?.rules);
    if (type === 'acp') {
      extra.backend = effectivePresetType as string;
    }
  } else if (type === 'acp') {
    extra.backend = backend as string;
    extra.agent_name = agent_name || name;
    extra.preset_context = mergePresetContext(oplFlowSessionContext, extra.preset_context);
    if (agent_id) extra.agent_id = agent_id;
    if (cli_path) extra.cli_path = cli_path;
    if (custom_agent_id) {
      extra.custom_agent_id = custom_agent_id;
    }
  }

  if (session_mode) extra.session_mode = session_mode;
  if (current_model_id) extra.current_model_id = current_model_id;
  if (config_options && Object.keys(config_options).length > 0) {
    extra.pending_config_options = config_options;
  }

  return {
    type,
    model,
    name,
    extra,
  };
}
