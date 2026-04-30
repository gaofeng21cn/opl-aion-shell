/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICreateConversationParams } from '@/common/adapter/ipcBridge';
import type { TProviderWithModel } from '@/common/config/storage';
import type { AcpBackend, AcpBackendAll } from '@/common/types/acpTypes';
import { mergeOplDefaultCodexContext, mergeOplDefaultCodexSkills } from '@/common/config/oplSkills';

export type BuildAgentConversationPresetResources = {
  rules?: string;
  enabledSkills?: string[];
  excludeBuiltinSkills?: string[];
};

export type BuildAgentConversationInput = {
  backend: string;
  name: string;
  agentName?: string;
  presetAssistantId?: string;
  workspace: string;
  model: TProviderWithModel;
  cliPath?: string;
  customAgentId?: string;
  customWorkspace?: boolean;
  isPreset?: boolean;
  presetAgentType?: string;
  presetResources?: BuildAgentConversationPresetResources;
  sessionMode?: string;
  currentModelId?: string;
  extra?: Partial<ICreateConversationParams['extra']>;
};

function normalizeBackend(backend: string): string {
  if (backend === 'gemini' || backend === 'aionrs') return 'codex';
  return backend;
}

export function getConversationTypeForBackend(backend: string): ICreateConversationParams['type'] {
  switch (normalizeBackend(backend)) {
    case 'openclaw-gateway':
    case 'openclaw':
      return 'openclaw-gateway';
    case 'nanobot':
      return 'nanobot';
    case 'remote':
      return 'remote';
    default:
      return 'acp';
  }
}

export function buildAgentConversationParams(input: BuildAgentConversationInput): ICreateConversationParams {
  const {
    backend,
    name,
    agentName,
    presetAssistantId,
    workspace,
    model,
    cliPath,
    customAgentId,
    customWorkspace = true,
    isPreset = false,
    presetAgentType,
    presetResources,
    sessionMode,
    currentModelId,
    extra: extraOverrides,
  } = input;

  const normalizedBackend = normalizeBackend(backend);
  const effectivePresetType = normalizeBackend(presetAgentType || normalizedBackend);
  const effectivePresetAssistantId = presetAssistantId || customAgentId;
  const type = getConversationTypeForBackend(isPreset ? effectivePresetType : normalizedBackend);
  const extra: ICreateConversationParams['extra'] = {
    workspace,
    customWorkspace,
    ...extraOverrides,
  };

  if (isPreset) {
    extra.enabledSkills =
      effectivePresetType === 'codex'
        ? mergeOplDefaultCodexSkills(presetResources?.enabledSkills)
        : presetResources?.enabledSkills;
    extra.excludeBuiltinSkills = presetResources?.excludeBuiltinSkills;
    extra.presetAssistantId = effectivePresetAssistantId;
    if (type === 'gemini') {
      extra.presetRules = presetResources?.rules;
    } else {
      extra.presetContext =
        effectivePresetType === 'codex' ? mergeOplDefaultCodexContext(presetResources?.rules) : presetResources?.rules;
      if (type === 'acp') {
        extra.backend = effectivePresetType as AcpBackend;
      }
    }
  } else if (normalizedBackend === 'codex') {
    extra.enabledSkills = mergeOplDefaultCodexSkills(extra.enabledSkills);
    extra.presetContext = mergeOplDefaultCodexContext(extra.presetContext);
    extra.backend = 'codex' as AcpBackendAll;
    extra.agentName = agentName || name;
    if (cliPath) extra.cliPath = cliPath;
    if (customAgentId) {
      extra.customAgentId = customAgentId;
    }
  } else if (type === 'remote') {
    extra.remoteAgentId = customAgentId;
  } else if (type === 'acp' || type === 'openclaw-gateway') {
    extra.backend = normalizedBackend as AcpBackendAll;
    extra.agentName = agentName || name;
    if (cliPath) extra.cliPath = cliPath;
    if (customAgentId) {
      extra.customAgentId = customAgentId;
    }
  }

  if (sessionMode) extra.sessionMode = sessionMode;
  if (currentModelId) extra.currentModelId = currentModelId;

  return {
    type,
    model,
    name,
    extra,
  };
}
