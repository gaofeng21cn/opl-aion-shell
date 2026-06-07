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

export type OplModelDisplayLocale = 'zh-CN' | 'en-US';

export type OplCodexModelDisplayInput = {
  id: string;
  label?: string | null;
  reasoningEffort?: OplCodexReasoningEffort | null;
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

function friendlyCodexModelLabel(modelId: string, fallbackLabel: string | null | undefined, localeKey: OplModelDisplayLocale): string {
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

export function formatOplCodexReasoningLabel(
  reasoningEffort: OplCodexReasoningEffort | null | undefined,
  localeKey: OplModelDisplayLocale
): string {
  const options = getOplCodexModelDisplayOptions();
  const effectiveReasoning = reasoningEffort ?? getOplDefaultCodexReasoningEffort() ?? options.default_reasoning_effort;
  const configuredLabel = options.reasoning_labels[effectiveReasoning];
  if (configuredLabel) {
    return resolveLocaleKey(localeKey) === 'en-US' ? configuredLabel.en : configuredLabel.zh;
  }
  return resolveLocaleKey(localeKey) === 'en-US' ? `${effectiveReasoning} reasoning` : `推理${effectiveReasoning}`;
}

export function formatOplCodexModelDisplay(input: OplCodexModelDisplayInput): OplCodexModelDisplay {
  const localeKey = resolveLocaleKey(input.localeKey);
  const options = getOplCodexModelDisplayOptions();
  const reasoningEffort = input.reasoningEffort ?? getOplDefaultCodexReasoningEffort() ?? options.default_reasoning_effort;
  const modelLabel = friendlyCodexModelLabel(input.id, input.label, localeKey);
  const reasoningLabel = formatOplCodexReasoningLabel(reasoningEffort, localeKey);
  return {
    label: `${modelLabel} · ${reasoningLabel}`,
    description: localeKey === 'en-US' ? options.fixed_model_description_en : options.fixed_model_description_zh,
    modelLabel,
    reasoningLabel,
  };
}

export function buildOplCodexAutoModelOption(input: {
  currentModelId: string;
  currentModelLabel?: string | null;
  reasoningEffort?: OplCodexReasoningEffort | null;
  localeKey: OplModelDisplayLocale;
}): OplCodexModelDisplay {
  const localeKey = resolveLocaleKey(input.localeKey);
  const options = getOplCodexModelDisplayOptions();
  const modelDisplay = formatOplCodexModelDisplay({
    id: input.currentModelId,
    label: input.currentModelLabel,
    reasoningEffort: input.reasoningEffort ?? options.auto_option.resolved_reasoning_effort,
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
