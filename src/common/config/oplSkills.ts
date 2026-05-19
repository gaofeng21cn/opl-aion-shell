/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getOplCodexSessionContext,
  getOplDefaultCodexSkills,
  getOplLegacyCodexSessionContexts,
} from './oplProductProfile';

export const OPL_DEFAULT_CODEX_SKILLS = getOplDefaultCodexSkills();

export const OPL_APP_ACTIVATION_POLICY = getOplCodexSessionContext();

export const OPL_LEGACY_CODEX_CONTEXT_SNIPPETS = getOplLegacyCodexSessionContexts();

export const OPL_CODEX_CONTEXT_SNIPPET = OPL_APP_ACTIVATION_POLICY;

export function normalizeOplCodexSessionContext(context?: unknown): string | undefined {
  if (typeof context !== 'string') return undefined;
  const trimmed = context.trim();
  if (!trimmed) return undefined;
  return OPL_LEGACY_CODEX_CONTEXT_SNIPPETS.some((legacyContext) => legacyContext === trimmed)
    ? OPL_CODEX_CONTEXT_SNIPPET
    : trimmed;
}

export function mergeOplDefaultCodexSkills(enabledSkills?: string[]): string[] {
  return [...new Set([...OPL_DEFAULT_CODEX_SKILLS, ...(enabledSkills ?? [])])];
}

export function mergeOplDefaultCodexContext(
  context?: string,
  options: { codexSessionAddendum?: string; codexSessionContext?: string } = {}
): string {
  const trimmed = context?.trim();
  const sessionContext = normalizeOplCodexSessionContext(options.codexSessionContext);
  const sessionAddendum = sessionContext ? undefined : options.codexSessionAddendum?.trim();
  const parts = [sessionContext || OPL_CODEX_CONTEXT_SNIPPET];
  if (sessionAddendum) {
    parts.push(['## OPL App 会话补充', '', sessionAddendum].join('\n'));
  }
  if (trimmed) {
    parts.push(trimmed);
  }
  return parts.join('\n\n');
}
