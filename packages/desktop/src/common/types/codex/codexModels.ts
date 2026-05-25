/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Default Codex model list maintained by AionUi.
 * These are known models that Codex CLI supports.
 * Validation is done by Codex CLI itself — AionUi only passes the model name.
 *
 * The first entry is used as the default when the user hasn't made a selection.
 */
import { getOplDefaultCodexModel, getOplDefaultCodexReasoningEffort } from '@/common/config/oplProductProfile';

export const DEFAULT_CODEX_MODEL_ID = getOplDefaultCodexModel();
export const DEFAULT_CODEX_REASONING_EFFORT = getOplDefaultCodexReasoningEffort();
export const DEFAULT_CODEX_MODEL_WITH_REASONING_ID = DEFAULT_CODEX_REASONING_EFFORT
  ? `${DEFAULT_CODEX_MODEL_ID}/${DEFAULT_CODEX_REASONING_EFFORT}`
  : DEFAULT_CODEX_MODEL_ID;

const AIONUI_DEFAULT_CODEX_MODELS: Array<{ id: string; label: string; description: string }> = [
  { id: 'gpt-5.3-codex', label: 'gpt-5.3-codex', description: 'Latest frontier agentic coding model' },
  { id: 'gpt-5.4', label: 'gpt-5.4', description: 'Latest frontier agentic coding model' },
  { id: 'gpt-5.2-codex', label: 'gpt-5.2-codex', description: 'Frontier agentic coding model' },
  {
    id: 'gpt-5.1-codex-max',
    label: 'gpt-5.1-codex-max',
    description: 'Codex-optimized flagship for deep and fast reasoning',
  },
  {
    id: 'gpt-5.2',
    label: 'gpt-5.2',
    description: 'Latest frontier model with improvements across knowledge, reasoning and coding',
  },
  {
    id: 'gpt-5.1-codex-mini',
    label: 'gpt-5.1-codex-mini',
    description: 'Optimized for codex. Cheaper, faster, but less capable',
  },
];

export const DEFAULT_CODEX_MODELS: Array<{ id: string; label: string; description: string }> = [
  {
    id: DEFAULT_CODEX_MODEL_ID,
    label: DEFAULT_CODEX_MODEL_WITH_REASONING_ID,
    description: 'One Person Lab App default Codex model',
  },
  ...AIONUI_DEFAULT_CODEX_MODELS.filter((model) => model.id !== DEFAULT_CODEX_MODEL_ID),
];
