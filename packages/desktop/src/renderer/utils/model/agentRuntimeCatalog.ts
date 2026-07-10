/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mapAcpCommandsToSlashCommands } from '@/common/chat/slash/acpMapping';
import type { SlashCommandItem } from '@/common/chat/slash/types';
import type { AcpModelInfo, AcpSessionConfigOption } from '@/common/types/platform/acpTypes';
import type { AgentModeOption } from './agentTypes';

type RuntimeField = 'available_models' | 'available_modes' | 'available_commands' | 'config_options';

export type AgentRuntimeCatalog = {
  available_models?: unknown;
  available_modes?: unknown;
  available_commands?: unknown;
  config_options?: unknown;
  handshake?: Partial<Record<RuntimeField, unknown>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonPayload(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function readRuntimeField(agent: AgentRuntimeCatalog, field: RuntimeField): unknown {
  return agent[field] !== undefined ? agent[field] : agent.handshake?.[field];
}

function normalizeConfigOptions(value: unknown): AcpSessionConfigOption[] {
  const payload = parseJsonPayload(value);
  if (Array.isArray(payload)) return payload as AcpSessionConfigOption[];
  if (!isRecord(payload) || !Array.isArray(payload.config_options)) return [];
  return payload.config_options as AcpSessionConfigOption[];
}

function getConfigOptionCurrentValue(option: AcpSessionConfigOption): string | undefined {
  const record = option as AcpSessionConfigOption & { currentValue?: string };
  return option.current_value || option.selected_value || record.currentValue;
}

function normalizeModelOption(value: unknown): AcpModelInfo['available_models'][number] | null {
  if (typeof value === 'string' && value.trim()) return { id: value, label: value };
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' ? value.id : typeof value.value === 'string' ? value.value : '';
  if (!id) return null;
  return {
    id,
    label: typeof value.label === 'string' ? value.label : typeof value.name === 'string' ? value.name : id,
  };
}

function buildModelInfoFromPayload(value: unknown): AcpModelInfo | null {
  const payload = parseJsonPayload(value);
  if (!isRecord(payload) || !Array.isArray(payload.available_models)) return null;
  const available_models = payload.available_models.map(normalizeModelOption).filter((item) => item !== null);
  if (available_models.length === 0) {
    return { current_model_id: null, current_model_label: null, available_models: [] };
  }
  const current_model_id =
    typeof payload.current_model_id === 'string'
      ? payload.current_model_id
      : typeof payload.currentModelId === 'string'
        ? payload.currentModelId
        : available_models[0].id;
  const current_model_label =
    typeof payload.current_model_label === 'string'
      ? payload.current_model_label
      : typeof payload.currentModelLabel === 'string'
        ? payload.currentModelLabel
        : available_models.find((model) => model.id === current_model_id)?.label || current_model_id;
  return { current_model_id, current_model_label, available_models };
}

function buildModelInfoFromConfigOptions(configOptions: AcpSessionConfigOption[]): AcpModelInfo | null {
  const option = configOptions.find((item) => item.category === 'model' && item.type === 'select');
  if (!option?.options?.length) return null;
  const available_models = option.options.map((item) => ({
    id: item.value,
    label: item.label || item.name || item.value,
  }));
  const current_model_id = getConfigOptionCurrentValue(option) || available_models[0].id;
  return {
    current_model_id,
    current_model_label: available_models.find((model) => model.id === current_model_id)?.label || current_model_id,
    available_models,
  };
}

export function buildAgentRuntimeModelInfo(agent: AgentRuntimeCatalog | null | undefined): AcpModelInfo | null {
  if (!agent) return null;
  return (
    buildModelInfoFromConfigOptions(normalizeConfigOptions(readRuntimeField(agent, 'config_options'))) ||
    buildModelInfoFromPayload(readRuntimeField(agent, 'available_models'))
  );
}

function normalizeModeOption(value: unknown): AgentModeOption | null {
  if (typeof value === 'string' && value.trim()) return { value, label: value };
  if (!isRecord(value)) return null;
  const mode = typeof value.id === 'string' ? value.id : typeof value.value === 'string' ? value.value : '';
  if (!mode) return null;
  return {
    value: mode,
    label: typeof value.name === 'string' ? value.name : typeof value.label === 'string' ? value.label : mode,
    description: typeof value.description === 'string' ? value.description : undefined,
  };
}

export type RuntimeCatalogState = 'unknown' | 'empty' | 'ready';

export type AgentRuntimeModeState = {
  state: RuntimeCatalogState;
  currentMode?: string;
  options: AgentModeOption[];
};

export type AgentRuntimeCommandState = {
  state: RuntimeCatalogState;
  commands: SlashCommandItem[];
};

function buildModeStateFromPayload(value: unknown): Omit<AgentRuntimeModeState, 'state'> | null {
  const payload = parseJsonPayload(value);
  if (!isRecord(payload) || !Array.isArray(payload.available_modes)) return null;
  return {
    currentMode:
      typeof payload.current_mode_id === 'string'
        ? payload.current_mode_id
        : typeof payload.currentModeId === 'string'
          ? payload.currentModeId
          : undefined,
    options: payload.available_modes.map(normalizeModeOption).filter((item) => item !== null),
  };
}

function buildModeStateFromConfigOptions(
  configOptions: AcpSessionConfigOption[]
): Omit<AgentRuntimeModeState, 'state'> | null {
  const option = configOptions.find((item) => item.category === 'mode' && item.type === 'select');
  if (!option) return null;
  if (!option.options?.length) return { options: [] };
  return {
    currentMode: getConfigOptionCurrentValue(option),
    options: option.options.map((item) => {
      const description = (item as unknown as Record<string, unknown>).description;
      return {
        value: item.value,
        label: item.label || item.name || item.value,
        description: typeof description === 'string' ? description : undefined,
      };
    }),
  };
}

export function buildAgentRuntimeModeState(agent: AgentRuntimeCatalog | null | undefined): AgentRuntimeModeState {
  if (!agent) return { state: 'unknown', options: [] };

  const configValue = readRuntimeField(agent, 'config_options');
  if (configValue !== undefined) {
    const fromConfig = buildModeStateFromConfigOptions(normalizeConfigOptions(configValue));
    if (fromConfig) {
      return { state: fromConfig.options.length > 0 ? 'ready' : 'empty', ...fromConfig };
    }
  }

  const modeValue = readRuntimeField(agent, 'available_modes');
  if (modeValue === undefined) return { state: 'unknown', options: [] };
  const fromPayload = buildModeStateFromPayload(modeValue);
  if (!fromPayload) return { state: 'unknown', options: [] };
  return { state: fromPayload.options.length > 0 ? 'ready' : 'empty', ...fromPayload };
}

export function buildAgentRuntimeSlashCommands(
  agent: AgentRuntimeCatalog | null | undefined
): AgentRuntimeCommandState {
  if (!agent) return { state: 'unknown', commands: [] };
  const commandValue = readRuntimeField(agent, 'available_commands');
  if (commandValue === undefined) return { state: 'unknown', commands: [] };
  const payload = parseJsonPayload(commandValue);
  const commands = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.available_commands)
      ? payload.available_commands
      : null;
  if (!commands) return { state: 'unknown', commands: [] };
  const mapped = mapAcpCommandsToSlashCommands(commands as Parameters<typeof mapAcpCommandsToSlashCommands>[0]);
  return { state: mapped.length > 0 ? 'ready' : 'empty', commands: mapped };
}
