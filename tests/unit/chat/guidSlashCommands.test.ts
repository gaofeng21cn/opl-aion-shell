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
  it('keeps owner-projected skills without restoring a fixed Skill denylist', () => {
    const commands = buildGuidSlashCommands({
      builtinCommands: [openCommand],
      selectedSkills: ['med-autoscience', 'aionui-skills', 'third-party-live-skill'],
      descriptionByName: new Map([
        ['med-autoscience', 'MAS skill'],
        ['aionui-skills', 'Internal AionUI skill'],
        ['third-party-live-skill', 'Third-party live Skill'],
      ]),
      skillFallbackDescription: 'Skill',
    });

    expect(commands.map((command) => command.name)).toEqual([
      'open',
      'med-autoscience',
      'aionui-skills',
      'third-party-live-skill',
    ]);
    expect(commands.find((command) => command.name === 'med-autoscience')).toMatchObject({
      description: 'MAS skill',
      kind: 'template',
      source: 'builtin',
      selectionBehavior: 'insert',
    });
  });
});
