import { describe, expect, it } from 'vitest';
import { buildGuidSlashCommands } from '@/common/chat/slash/guidSlashCommands';
import type { SlashCommandItem } from '@/common/chat/slash/types';

const openCommand: SlashCommandItem = {
  name: 'open',
  description: 'Add File',
  kind: 'builtin',
  source: 'builtin',
};

describe('buildGuidSlashCommands', () => {
  it('keeps Guid slash commands inside the OPL ordinary skill allowlist', () => {
    const commands = buildGuidSlashCommands({
      builtinCommands: [openCommand],
      selectedSkills: ['med-autoscience', 'aionui-team', 'official-assistant'],
      descriptionByName: new Map([
        ['med-autoscience', 'MAS skill'],
        ['aionui-team', 'Team command'],
        ['official-assistant', 'Official assistant'],
      ]),
      skillFallbackDescription: 'Skill',
    });

    expect(commands.map((command) => command.name)).toEqual(['open', 'med-autoscience']);
    expect(commands.find((command) => command.name === 'med-autoscience')).toMatchObject({
      description: 'MAS skill',
      kind: 'template',
      source: 'builtin',
      selectionBehavior: 'insert',
    });
  });
});
