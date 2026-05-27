/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Codex model defaults are App product policy.
 * The shell may observe newer Codex capability lists from ACP, but it must not
 * expose a synthetic or retired model catalog as a user-facing choice list.
 */
import {
  getOplDefaultCodexModel,
  getOplDefaultCodexReasoningEffort,
  getOplRetiredCodexModels,
} from '@/common/config/oplProductProfile';
import type { AcpModelInfo } from '@/common/types/platform/acpTypes';

export const DEFAULT_CODEX_MODEL_ID = getOplDefaultCodexModel();
export const DEFAULT_CODEX_REASONING_EFFORT = getOplDefaultCodexReasoningEffort();
export const DEFAULT_CODEX_MODEL_WITH_REASONING_ID = DEFAULT_CODEX_REASONING_EFFORT
  ? `${DEFAULT_CODEX_MODEL_ID}/${DEFAULT_CODEX_REASONING_EFFORT}`
  : DEFAULT_CODEX_MODEL_ID;
export const DEFAULT_CODEX_MODEL_DISPLAY_LABEL = DEFAULT_CODEX_REASONING_EFFORT
  ? `${DEFAULT_CODEX_MODEL_ID}${DEFAULT_CODEX_REASONING_EFFORT}`
  : DEFAULT_CODEX_MODEL_ID;

export const DEFAULT_CODEX_MODELS: Array<{ id: string; label: string; description: string }> = [
  {
    id: DEFAULT_CODEX_MODEL_ID,
    label: DEFAULT_CODEX_MODEL_DISPLAY_LABEL,
    description: 'One Person Lab App default Codex model',
  },
];

type CodexModelOption = { id: string; label?: string | null };

const CODEX_FRONTIER_MODEL_PATTERN = /^gpt-(\d+(?:\.\d+)*)(?:-codex)?$/;
const RETIRED_CODEX_MODEL_IDS = new Set(getOplRetiredCodexModels());

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
  let selected = appDefaultModelId;
  let selectedVersion = parseCodexFrontierVersion(appDefaultModelId);

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

  return selected;
}

export function buildCodexDefaultModelInfo(handshakeModels?: AcpModelInfo | null): AcpModelInfo {
  const currentModelId = selectDefaultCodexModelId(handshakeModels?.available_models);
  return {
    current_model_id: currentModelId,
    current_model_label: currentModelId === DEFAULT_CODEX_MODEL_ID ? DEFAULT_CODEX_MODEL_DISPLAY_LABEL : currentModelId,
    available_models: [],
  };
}
