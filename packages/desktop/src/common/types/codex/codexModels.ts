/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Codex model defaults are App product policy.
 * The shell observes Codex capability lists from ACP, filters retired entries,
 * and exposes only the App allowlist in its product-defined order.
 */
import {
  getOplCodexFrontierModelPreferenceOrder,
  getOplCodexModelDisplayOptions,
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
const CODEX_FRONTIER_MODEL_PREFERENCE_INDEX = new Map(
  CODEX_FRONTIER_MODEL_PREFERENCE_ORDER.map((id, index) => [id, index])
);
const CODEX_MODEL_DISPLAY_LABELS = new Map(
  getOplCodexModelDisplayOptions().visible_models.map((model) => [model.id, model.label_en])
);
const RETIRED_CODEX_MODEL_IDS = new Set(getOplRetiredCodexModels());

export const DEFAULT_CODEX_MODELS: Array<{ id: string; label: string; description: string }> =
  CODEX_FRONTIER_MODEL_PREFERENCE_ORDER.filter((id) => !RETIRED_CODEX_MODEL_IDS.has(id)).map((id) => ({
    id,
    label: CODEX_MODEL_DISPLAY_LABELS.get(id) ?? id,
    description: 'One Person Lab App Codex frontier model',
  }));

type CodexModelOption = { id: string; label?: string | null };

export function selectDefaultCodexModelId(
  availableModels: CodexModelOption[] | undefined | null,
  appDefaultModelId = DEFAULT_CODEX_MODEL_ID
): string {
  const normalizedAppDefaultModelId = appDefaultModelId.trim();
  let selected: { id: string; preference: number } | null = null;

  for (const model of availableModels ?? []) {
    const id = model.id.trim();
    if (RETIRED_CODEX_MODEL_IDS.has(id)) continue;
    const preference = CODEX_FRONTIER_MODEL_PREFERENCE_INDEX.get(id);
    if (preference === undefined) continue;
    if (id === normalizedAppDefaultModelId) return id;
    if (!selected || preference < selected.preference) {
      selected = { id, preference };
    }
  }

  return selected?.id ?? normalizedAppDefaultModelId;
}

function normalizeCodexModelOptions(availableModels: CodexModelOption[] | undefined | null): Array<{
  id: string;
  label: string;
}> {
  const seen = new Set<string>();
  const options: Array<{ id: string; label: string; preference: number }> = [];

  for (const model of availableModels ?? []) {
    const id = model.id.trim();
    if (!id || RETIRED_CODEX_MODEL_IDS.has(id) || seen.has(id)) continue;
    const preference = CODEX_FRONTIER_MODEL_PREFERENCE_INDEX.get(id);
    if (preference === undefined) continue;
    seen.add(id);
    options.push({
      id,
      label: CODEX_MODEL_DISPLAY_LABELS.get(id) ?? model.label?.trim() ?? id,
      preference,
    });
  }

  return options
    .toSorted((left, right) => left.preference - right.preference)
    .map(({ id, label }) => ({
      id,
      label,
    }));
}

export function normalizeCodexModelInfo(modelInfo: AcpModelInfo): AcpModelInfo {
  const availableModels = normalizeCodexModelOptions(modelInfo.available_models);
  const currentModel = availableModels.find((model) => model.id === modelInfo.current_model_id);
  return {
    current_model_id: currentModel?.id ?? null,
    current_model_label: currentModel?.label ?? null,
    available_models: availableModels,
  };
}

export function buildCodexDefaultModelInfo(handshakeModels?: AcpModelInfo | null): AcpModelInfo {
  const visibleModels =
    handshakeModels == null
      ? DEFAULT_CODEX_MODELS.map((model) => ({ id: model.id, label: model.label }))
      : normalizeCodexModelInfo(handshakeModels).available_models;
  const currentModelId = visibleModels.length > 0 ? selectDefaultCodexModelId(visibleModels) : null;
  const currentModelLabel =
    currentModelId == null
      ? null
      : visibleModels.find((model) => model.id === currentModelId)?.label ||
        (currentModelId === DEFAULT_CODEX_MODEL_ID ? DEFAULT_CODEX_MODEL_DISPLAY_LABEL : currentModelId);
  return {
    current_model_id: currentModelId,
    current_model_label: currentModelLabel,
    available_models: visibleModels,
  };
}
