import { describe, it, expect } from 'vitest';
import { OPL_DEFAULT_CODEX_SKILLS, mergeOplDefaultCodexSkills } from '@/common/config/oplSkills';
import { buildAgentConversationParams } from '@/common/utils/buildAgentConversationParams';

describe('OPL default Codex skills', () => {
  it('adds MAS, MAG, RCA, superpowers, and Office skills to plain Codex conversations', () => {
    const params = buildAgentConversationParams({
      backend: 'codex',
      name: 'One Person Lab',
      workspace: '/tmp/opl',
      model: {},
    });

    expect(params.extra?.enabledSkills).toEqual([...OPL_DEFAULT_CODEX_SKILLS]);
  });

  it('preserves user-enabled skills after the OPL default family and companion skills', () => {
    expect(mergeOplDefaultCodexSkills(['officecli', 'mas', 'custom-skill'])).toEqual([
      'mas',
      'mag',
      'rca',
      'superpowers',
      'officecli',
      'officecli-docx',
      'officecli-pptx',
      'officecli-xlsx',
      'ui-ux-pro-max',
      'custom-skill',
    ]);
  });
});
