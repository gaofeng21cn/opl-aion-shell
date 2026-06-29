/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Codex model defaults are App product policy.
 * The shell observes Codex capability lists from ACP, filters retired entries,
 * and resolves automatic selection to the newest usable frontier model.
 */
import {
  getOplCodexFrontierModelPreferenceOrder,
  getOplDefaultCodexModel,
  getOplDefaultCodexModelDisplayLabel,
  getOplDefaultCodexReasoningEffort,
  getOplRetiredCodexModels,
} from '@/common/config/oplProductProfile';
import type { AcpModelInfo } from '@/common/types/platform/acpTypes';

export const DEFAULT_CODEX_MODEL_ID = getOplDefaultCodexModel();
export const DEFAULT_CODEX_REASONING_EFFORT = getOplDefaultCodexReasoningEffort();
export const DEFAULT_CODEX_MODEL_WITH_REASONING_ID = DEFAULT_CODEX_REASONING_EFFORT
  ? `${DEFAULT_CODEX_MODEL_ID}/${DEFAULT_CODEX_REASONING_EFFORT}`
  : DEFAULT_CODEX_MODEL_ID;
export const DEFAULT_CODEX_MODEL_DISPLAY_LABEL = getOplDefaultCodexModelDisplayLabel();
const CODEX_FRONTIER_MODEL_PREFERENCE_ORDER = getOplCodexFrontierModelPreferenceOrder();
const RETIRED_CODEX_MODEL_IDS = new Set(getOplRetiredCodexModels());

export const DEFAULT_CODEX_MODELS: Array<{ id: string; label: string; description: string }> =
  CODEX_FRONTIER_MODEL_PREFERENCE_ORDER.filter((id) => !RETIRED_CODEX_MODEL_IDS.has(id)).map((id) => ({
    id,
    label: id === DEFAULT_CODEX_MODEL_ID ? DEFAULT_CODEX_MODEL_DISPLAY_LABEL : id,
    description: 'One Person Lab App Codex frontier model',
  }));

type CodexModelOption = { id: string; label?: string | null };

const CODEX_FRONTIER_MODEL_PATTERN = /^gpt-(\d+(?:\.\d+)*)(?:-codex)?$/;

function parseCodexFrontierVersion(modelId: string): number[] | null {
  const match = modelId.trim().match(CODEX_FRONTIER_MODEL_PATTERN);
  if (!match) return null;
  return match[1].split('.').map((part) => Number.parseInt(part, 10));
}

function compareVersionParts(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function selectDefaultCodexModelId(
  availableModels: CodexModelOption[] | undefined | null,
  appDefaultModelId = DEFAULT_CODEX_MODEL_ID
): string {
  let selected: string | null = null;
  let selectedVersion: number[] | null = null;

  for (const model of availableModels ?? []) {
    const id = model.id.trim();
    if (RETIRED_CODEX_MODEL_IDS.has(id)) continue;
    const version = parseCodexFrontierVersion(id);
    if (!version) continue;
    if (!selectedVersion || compareVersionParts(version, selectedVersion) > 0) {
      selected = id;
      selectedVersion = version;
    }
  }

  return selected ?? appDefaultModelId;
}

function normalizeCodexModelOptions(availableModels: CodexModelOption[] | undefined | null): Array<{
  id: string;
  label: string;
}> {
  const seen = new Set<string>();
  const options: Array<{ id: string; label: string; version: number[] }> = [];

  for (const model of availableModels ?? []) {
    const id = model.id.trim();
    if (!id || RETIRED_CODEX_MODEL_IDS.has(id) || seen.has(id)) continue;
    const version = parseCodexFrontierVersion(id);
    if (!version) continue;
    seen.add(id);
    options.push({
      id,
      label: model.label?.trim() || id,
      version,
    });
  }

  return options.toSorted((left, right) => compareVersionParts(right.version, left.version)).map(({ id, label }) => ({
    id,
    label,
  }));
}

export function buildCodexDefaultModelInfo(handshakeModels?: AcpModelInfo | null): AcpModelInfo {
  const availableModels = normalizeCodexModelOptions(handshakeModels?.available_models);
  const visibleModels =
    availableModels.length > 0
      ? availableModels
      : DEFAULT_CODEX_MODELS.map((model) => ({ id: model.id, label: model.label }));
  const currentModelId = selectDefaultCodexModelId(visibleModels);
  const currentModelLabel =
    visibleModels.find((model) => model.id === currentModelId)?.label ||
    (currentModelId === DEFAULT_CODEX_MODEL_ID ? DEFAULT_CODEX_MODEL_DISPLAY_LABEL : currentModelId);
  return {
    current_model_id: currentModelId,
    current_model_label: currentModelLabel,
    available_models: visibleModels,
  };
}
