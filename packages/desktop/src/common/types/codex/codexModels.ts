/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Codex model defaults are App product policy.
 * The shell observes Codex capability lists from ACP, filters hidden or retired
 * entries, and keeps App-known models separate from unknown catalog defaults.
 */
import {
  getOplCodexAutoModelPolicy,
  getOplCodexModelDisplayOptions,
  getOplDefaultCodexModel,
  getOplDefaultCodexModelDisplayLabel,
  getOplDefaultCodexReasoningEffort,
  getOplRetiredCodexModels,
} from '@/common/config/oplProductProfile';
import type { AcpAvailableModel, AcpModelInfo } from '@/common/types/platform/acpTypes';

export const DEFAULT_CODEX_MODEL_ID = getOplDefaultCodexModel();
export const DEFAULT_CODEX_REASONING_EFFORT = getOplDefaultCodexReasoningEffort();
export const DEFAULT_CODEX_MODEL_WITH_REASONING_ID = DEFAULT_CODEX_REASONING_EFFORT
  ? `${DEFAULT_CODEX_MODEL_ID}/${DEFAULT_CODEX_REASONING_EFFORT}`
  : DEFAULT_CODEX_MODEL_ID;
export const DEFAULT_CODEX_MODEL_DISPLAY_LABEL = getOplDefaultCodexModelDisplayLabel();
const CODEX_AUTO_MODEL_POLICY = getOplCodexAutoModelPolicy();
const ACCEPT_UNKNOWN_CATALOG_DEFAULT =
  CODEX_AUTO_MODEL_POLICY.unknown_default_model_policy ===
  'accept_catalog_default_even_when_not_in_frontier_model_preference_order';
const USE_HIGHEST_UNKNOWN_REASONING =
  CODEX_AUTO_MODEL_POLICY.unknown_model_reasoning_effort_policy === 'highest_supported_reasoning_effort_from_catalog';
const EXCLUDE_HIDDEN_MODELS =
  CODEX_AUTO_MODEL_POLICY.catalog_hidden_model_policy === 'exclude_hidden_models_from_auto_and_fixed_options';
const CODEX_FRONTIER_MODEL_PREFERENCE_ORDER = CODEX_AUTO_MODEL_POLICY.frontier_model_preference_order;
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

type CodexModelOption = AcpAvailableModel | { id: string; label?: string | null; hidden?: boolean };

function normalizeCodexCatalogOptions(availableModels: CodexModelOption[] | undefined | null): AcpAvailableModel[] {
  const seen = new Set<string>();
  return (availableModels ?? []).flatMap((model) => {
    const id = model.id.trim();
    if (!id || (EXCLUDE_HIDDEN_MODELS && model.hidden === true) || RETIRED_CODEX_MODEL_IDS.has(id) || seen.has(id)) {
      return [];
    }
    seen.add(id);
    return [{ ...model, id, label: model.label?.trim() || CODEX_MODEL_DISPLAY_LABELS.get(id) || id }];
  });
}

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
  const options: Array<{ id: string; label: string; preference: number; catalogIndex: number }> = [];

  for (const [catalogIndex, model] of (availableModels ?? []).entries()) {
    const id = model.id.trim();
    if (!id || RETIRED_CODEX_MODEL_IDS.has(id) || seen.has(id)) continue;
    const preference = CODEX_FRONTIER_MODEL_PREFERENCE_INDEX.get(id) ?? CODEX_FRONTIER_MODEL_PREFERENCE_ORDER.length;
    seen.add(id);
    options.push({
      id,
      label: CODEX_MODEL_DISPLAY_LABELS.get(id) ?? model.label?.trim() ?? id,
      preference,
      catalogIndex,
    });
  }

  return options
    .toSorted((left, right) => left.preference - right.preference || left.catalogIndex - right.catalogIndex)
    .map(({ id, label }) => ({
      id,
      label,
    }));
}

export function normalizeCodexModelInfo(modelInfo: AcpModelInfo): AcpModelInfo {
  const catalogModels = normalizeCodexCatalogOptions(modelInfo.catalog_models ?? modelInfo.available_models);
  const availableModels = normalizeCodexModelOptions(catalogModels);
  const currentModel =
    availableModels.find((model) => model.id === modelInfo.current_model_id) ??
    catalogModels.find((model) => model.id === modelInfo.current_model_id);
  return {
    current_model_id: currentModel?.id ?? null,
    current_model_label: currentModel?.label ?? null,
    available_models: availableModels,
    catalog_models: catalogModels,
  };
}

export type CodexAutoSelection = {
  modelId: string;
  reasoningEffort: string | null;
};

export function resolveOplCodexAutoSelection(modelInfo?: AcpModelInfo | null): CodexAutoSelection {
  const catalogModels = normalizeCodexCatalogOptions(modelInfo?.catalog_models ?? modelInfo?.available_models);
  const catalogDefault = catalogModels.find((model) => model.isDefault);
  const unknownCatalogDefault =
    ACCEPT_UNKNOWN_CATALOG_DEFAULT && catalogDefault && !CODEX_FRONTIER_MODEL_PREFERENCE_INDEX.has(catalogDefault.id)
      ? catalogDefault
      : null;
  const knownModel = CODEX_FRONTIER_MODEL_PREFERENCE_ORDER.find((id) => catalogModels.some((model) => model.id === id));
  const modelId =
    unknownCatalogDefault?.id ??
    knownModel ??
    catalogModels[0]?.id ??
    CODEX_AUTO_MODEL_POLICY.catalog_unavailable_fallback.model;
  const selectedModel = catalogModels.find((model) => model.id === modelId);
  const reasoningEffort = unknownCatalogDefault
    ? (USE_HIGHEST_UNKNOWN_REASONING
        ? unknownCatalogDefault.supportedReasoningEfforts?.at(-1)?.reasoningEffort?.trim()
        : null) ||
      unknownCatalogDefault.defaultReasoningEffort?.trim() ||
      CODEX_AUTO_MODEL_POLICY.catalog_unavailable_fallback.reasoning_effort
    : (CODEX_AUTO_MODEL_POLICY.known_model_reasoning_effort_overrides[modelId] ??
      selectedModel?.defaultReasoningEffort?.trim() ??
      CODEX_AUTO_MODEL_POLICY.catalog_unavailable_fallback.reasoning_effort);
  return { modelId, reasoningEffort: reasoningEffort || null };
}

export function buildCodexDefaultModelInfo(handshakeModels?: AcpModelInfo | null): AcpModelInfo {
  const normalized = handshakeModels == null ? null : normalizeCodexModelInfo(handshakeModels);
  const visibleModels =
    normalized?.available_models ?? DEFAULT_CODEX_MODELS.map((model) => ({ id: model.id, label: model.label }));
  const catalogModels = normalized?.catalog_models ?? visibleModels;
  const currentModelId = resolveOplCodexAutoSelection({
    current_model_id: null,
    current_model_label: null,
    available_models: visibleModels,
    catalog_models: catalogModels,
  }).modelId;
  const currentModelLabel =
    currentModelId == null
      ? null
      : visibleModels.find((model) => model.id === currentModelId)?.label ||
        catalogModels.find((model) => model.id === currentModelId)?.label ||
        (currentModelId === DEFAULT_CODEX_MODEL_ID ? DEFAULT_CODEX_MODEL_DISPLAY_LABEL : currentModelId);
  return {
    current_model_id: currentModelId,
    current_model_label: currentModelLabel,
    available_models: visibleModels,
    catalog_models: catalogModels,
  };
}
