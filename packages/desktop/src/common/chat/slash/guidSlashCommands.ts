/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { filterOplOrdinarySkillNames } from '@/common/config/oplProductProfile';
import type { SlashCommandItem } from './types';

type BuildGuidSlashCommandsInput = {
  builtinCommands: readonly SlashCommandItem[];
  selectedSkills: readonly string[];
  descriptionByName: ReadonlyMap<string, string>;
  skillFallbackDescription: string;
};

function buildSkillSlashCommands(
  selectedSkills: readonly string[],
  descriptionByName: ReadonlyMap<string, string>,
  fallbackDescription: string
): SlashCommandItem[] {
  return filterOplOrdinarySkillNames([...selectedSkills]).map((name) => ({
    name,
    description: descriptionByName.get(name) || fallbackDescription,
    kind: 'template',
    source: 'builtin',
    selectionBehavior: 'insert',
  }));
}

export function buildGuidSlashCommands({
  builtinCommands,
  selectedSkills,
  descriptionByName,
  skillFallbackDescription,
}: BuildGuidSlashCommandsInput): SlashCommandItem[] {
  const merged = new Map<string, SlashCommandItem>();
  for (const command of builtinCommands) {
    merged.set(command.name, command);
  }
  for (const command of buildSkillSlashCommands(selectedSkills, descriptionByName, skillFallbackDescription)) {
    if (!merged.has(command.name)) {
      merged.set(command.name, command);
    }
  }
  return Array.from(merged.values());
}
