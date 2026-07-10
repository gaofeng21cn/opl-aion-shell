/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getOplCodexModelDisplayOptions,
  getOplDefaultCodexReasoningEffort,
  type OplCodexReasoningEffort,
} from '@/common/config/oplProductProfile';
import { resolveOplCodexAutoSelection } from '@/common/types/codex/codexModels';
import type { AcpModelInfo } from '@/common/types/platform/acpTypes';

export type OplModelDisplayLocale = 'zh-CN' | 'en-US';

export type OplCodexModelDisplayInput = {
  id: string;
  label?: string | null;
  reasoningEffort?: string | null;
  localeKey: OplModelDisplayLocale;
};

export type OplCodexModelDisplay = {
  label: string;
  description: string;
  modelLabel: string;
  reasoningLabel: string;
};

function resolveLocaleKey(localeKey: OplModelDisplayLocale): OplModelDisplayLocale {
  return localeKey === 'en-US' ? 'en-US' : 'zh-CN';
}

function friendlyCodexModelLabel(
  modelId: string,
  fallbackLabel: string | null | undefined,
  localeKey: OplModelDisplayLocale
): string {
  const options = getOplCodexModelDisplayOptions();
  const matched = options.visible_models.find((model) => model.id === modelId);
  if (matched) {
    return localeKey === 'en-US' ? matched.label_en : matched.label_zh;
  }

  const trimmedFallback = fallbackLabel?.trim();
  if (trimmedFallback && trimmedFallback !== modelId) return trimmedFallback;

  const codexMatch = modelId.match(/^gpt-(\d+(?:\.\d+)*)(?:-(codex))?$/i);
  if (!codexMatch) return modelId;
  return codexMatch[2] ? `GPT-${codexMatch[1]} Codex` : `GPT-${codexMatch[1]}`;
}

export function formatOplCodexCompactModelLabel(modelLabel: string): string {
  const trimmed = modelLabel.trim();
  const match = trimmed.match(/^GPT-(\d+(?:\.\d+)*)(?:\s+Codex)?$/i);
  if (!match) return trimmed;
  return trimmed.toLowerCase().includes('codex') ? `${match[1]} Codex` : match[1];
}

export function formatOplCodexReasoningLabel(
  reasoningEffort: string | null | undefined,
  localeKey: OplModelDisplayLocale
): string {
  const options = getOplCodexModelDisplayOptions();
  const effectiveReasoning = reasoningEffort ?? getOplDefaultCodexReasoningEffort() ?? options.default_reasoning_effort;
  const configuredLabel = options.reasoning_labels[effectiveReasoning as OplCodexReasoningEffort];
  if (configuredLabel) {
    return resolveLocaleKey(localeKey) === 'en-US' ? configuredLabel.en : configuredLabel.zh;
  }
  return resolveLocaleKey(localeKey) === 'en-US' ? `${effectiveReasoning} reasoning` : `推理${effectiveReasoning}`;
}

export function formatOplCodexReasoningMenuLabel(
  reasoningEffort: string | null | undefined,
  localeKey: OplModelDisplayLocale
): string {
  const label = formatOplCodexReasoningLabel(reasoningEffort, localeKey);
  return resolveLocaleKey(localeKey) === 'en-US' ? label.replace(/\s+reasoning$/i, '') : label.replace(/^推理/, '');
}

export function formatOplCodexModelDisplay(input: OplCodexModelDisplayInput): OplCodexModelDisplay {
  const localeKey = resolveLocaleKey(input.localeKey);
  const options = getOplCodexModelDisplayOptions();
  const reasoningEffort =
    input.reasoningEffort ?? getOplDefaultCodexReasoningEffort() ?? options.default_reasoning_effort;
  const modelLabel = friendlyCodexModelLabel(input.id, input.label, localeKey);
  const reasoningLabel = formatOplCodexReasoningLabel(reasoningEffort, localeKey);
  return {
    label: modelLabel,
    description: localeKey === 'en-US' ? options.fixed_model_description_en : options.fixed_model_description_zh,
    modelLabel,
    reasoningLabel,
  };
}

export function buildOplCodexAutoModelOption(input: {
  modelInfo: AcpModelInfo;
  localeKey: OplModelDisplayLocale;
}): OplCodexModelDisplay {
  const localeKey = resolveLocaleKey(input.localeKey);
  const options = getOplCodexModelDisplayOptions();
  const selection = resolveOplCodexAutoSelection(input.modelInfo);
  const catalog = input.modelInfo.catalog_models ?? input.modelInfo.available_models;
  const resolvedModel = catalog.find((model) => model.id === selection.modelId);
  const modelDisplay = formatOplCodexModelDisplay({
    id: selection.modelId,
    label: resolvedModel?.label,
    reasoningEffort: selection.reasoningEffort,
    localeKey,
  });
  const label = localeKey === 'en-US' ? options.auto_option.label_en : options.auto_option.label_zh;
  const description =
    localeKey === 'en-US'
      ? `Current ${modelDisplay.modelLabel} · ${modelDisplay.reasoningLabel} · follows latest strongest`
      : `当前 ${modelDisplay.modelLabel} · ${modelDisplay.reasoningLabel} · 跟随最新最强`;
  return {
    label,
    description,
    modelLabel: modelDisplay.modelLabel,
    reasoningLabel: modelDisplay.reasoningLabel,
  };
}
