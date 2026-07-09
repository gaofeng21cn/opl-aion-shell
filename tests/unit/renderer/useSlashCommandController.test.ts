import { describe, expect, it } from 'vitest';
import {
  filterSlashCommands,
  getFuzzyMatchIndices,
  matchSlashQuery,
} from '@/renderer/hooks/chat/useSlashCommandController';
import type { SlashCommandItem } from '@/common/chat/slash/types';

const command = (name: string): SlashCommandItem => ({
  name,
  description: name,
  kind: 'template',
  source: 'builtin',
});

describe('useSlashCommandController helpers', () => {
  it('matches substring command queries without opening for normal input', () => {
    expect(matchSlashQuery('/med')).toBe('med');
    expect(matchSlashQuery('please /med')).toBeNull();
    expect(getFuzzyMatchIndices('med-autoscience', 'auto')).toEqual([4, 5, 6, 7]);
    expect(getFuzzyMatchIndices('med-autoscience', 'official')).toBeNull();

    expect(filterSlashCommands([command('open'), command('med-autoscience')], 'auto').map((item) => item.name)).toEqual([
      'med-autoscience',
    ]);
  });
});
