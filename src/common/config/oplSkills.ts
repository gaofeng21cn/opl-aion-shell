/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const OPL_DEFAULT_CODEX_SKILLS = [
  'mas',
  'mag',
  'rca',
  'superpowers',
  'officecli',
  'officecli-docx',
  'officecli-pptx',
  'officecli-xlsx',
  'morph-ppt',
] as const;

export function mergeOplDefaultCodexSkills(enabledSkills?: string[]): string[] {
  return [...new Set([...OPL_DEFAULT_CODEX_SKILLS, ...(enabledSkills ?? [])])];
}
