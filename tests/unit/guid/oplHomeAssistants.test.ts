import { describe, expect, it } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { filterOplFoundryAssistants, withOplFoundryAssistantDefaults } from '@/renderer/pages/guid/oplGuidProfile';
import { resolveOplHomeAssistants } from '@/renderer/pages/guid/utils/oplHomeAssistants';

const assistant = (input: Partial<Assistant> & Pick<Assistant, 'id' | 'name'>): Assistant => ({
  source: 'builtin',
  name_i18n: {},
  description_i18n: {},
  enabled: true,
  sort_order: 100,
  preset_agent_type: 'codex',
  enabled_skills: [],
  custom_skill_names: [],
  disabled_builtin_skills: [],
  prompts: [],
  prompts_i18n: {},
  models: [],
  ...input,
});

describe('OPL home assistants', () => {
  it('filters historical AionUI assistants and exposes only purpose-first home entries', () => {
    const resolved = resolveOplHomeAssistants([
      assistant({ id: 'cowork', name: 'Cowork' }),
      assistant({ id: 'mds', name: 'Med Deep Scientist' }),
      assistant({
        id: 'mas',
        name: 'Custom MAS',
        name_i18n: { 'zh-CN': '定制 MAS' },
        description_i18n: { 'zh-CN': '用户已有 MAS 配置' },
      }),
    ]);

    expect(resolved.map((item) => item.id)).toEqual(['mas', 'mag', 'rca']);
    expect(resolved.map((item) => item.name_i18n['zh-CN'])).toEqual(['科研', '基金', 'PPT']);
    expect(resolved.map((item) => item.name_i18n['en-US'])).toEqual(['Research', 'Grants', 'PPT']);
    expect(resolved[0]?.description_i18n['zh-CN']).toContain('科研任务');
    expect(resolved.map((item) => item.id)).not.toEqual(expect.arrayContaining(['cowork', 'mds']));
    expect(resolved.map((item) => item.id)).not.toContain('oma');
    expect(resolved.map((item) => item.name)).not.toEqual(
      expect.arrayContaining(['Med Auto Science', 'Med Auto Grant', 'RedCube AI', 'OPL Meta Agent'])
    );
  });

  it('does not re-add OMA when merging shell defaults for the Guid page', () => {
    const resolved = withOplFoundryAssistantDefaults([
      assistant({ id: 'mas', name: 'Med Auto Science', name_i18n: { 'zh-CN': 'Med Auto Science' } }),
    ]);

    expect(resolved.map((item) => item.id)).toEqual(['mas', 'mag', 'rca']);
    expect(resolved.map((item) => item.name_i18n['zh-CN'])).toEqual(['科研', '基金', 'PPT']);
    expect(resolved.map((item) => item.name_i18n['en-US'])).toEqual(['Research', 'Grants', 'PPT']);
    expect(filterOplFoundryAssistants(resolved).map((item) => item.id)).toEqual(['mas', 'mag', 'rca']);
  });
});
