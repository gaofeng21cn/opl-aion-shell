import { describe, expect, it } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { filterOplFoundryAssistants, withOplFoundryAssistantDefaults } from '@/renderer/pages/guid/oplGuidProfile';
import {
  buildAssistantScopedSkillMenuItems,
  isGuidSkillChecked,
  mergeRequiredSkills,
} from '@/renderer/pages/guid/utils/assistantSkillMenu';
import { resolveOplHomeAssistants } from '@/renderer/pages/guid/utils/oplHomeAssistants';
import { getOplAssistantSkillProfile } from '@/common/config/oplProductProfile';

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

    expect(resolved.map((item) => item.id)).toEqual(['mas', 'mag', 'rca', 'bookforge']);
    expect(resolved.map((item) => item.name_i18n['zh-CN'])).toEqual(['科研', '基金', '演示', '写书']);
    expect(resolved.map((item) => item.name_i18n['en-US'])).toEqual([
      'Med Auto Science',
      'Med Auto Grant',
      'RedCube AI',
      'OPL BookForge',
    ]);
    expect(resolved[0]?.description_i18n['zh-CN']).toContain('科研任务');
    expect(resolved.map((item) => item.id)).not.toEqual(expect.arrayContaining(['cowork', 'mds']));
    expect(resolved.map((item) => item.id)).not.toContain('oma');
    expect(resolved.map((item) => item.name)).not.toEqual(
      expect.arrayContaining(['Med Auto Science', 'Med Auto Grant', 'RedCube AI', 'OPL Meta Agent'])
    );
    expect(Object.fromEntries(resolved.map((item) => [item.id, item.enabled_skills]))).toEqual({
      mas: ['mas'],
      mag: ['mag'],
      rca: ['rca'],
      bookforge: ['opl-bookforge'],
    });
  });

  it('does not re-add OMA when merging shell defaults for the Guid page', () => {
    const resolved = withOplFoundryAssistantDefaults([
      assistant({ id: 'mas', name: 'Med Auto Science', name_i18n: { 'zh-CN': 'Med Auto Science' } }),
    ]);

    expect(resolved.map((item) => item.id)).toEqual(['mas', 'mag', 'rca', 'bookforge']);
    expect(resolved.map((item) => item.name_i18n['zh-CN'])).toEqual(['科研', '基金', '演示', '写书']);
    expect(resolved.map((item) => item.name_i18n['en-US'])).toEqual([
      'Med Auto Science',
      'Med Auto Grant',
      'RedCube AI',
      'OPL BookForge',
    ]);
    expect(filterOplFoundryAssistants(resolved).map((item) => item.id)).toEqual(['mas', 'mag', 'rca', 'bookforge']);
    expect(resolved.map((item) => item.enabled_skills)).toEqual([['mas'], ['mag'], ['rca'], ['opl-bookforge']]);
  });

  it('keeps caller-added assistant skills while forcing the required profile skill', () => {
    const resolved = resolveOplHomeAssistants([
      assistant({
        id: 'mag',
        name: 'Custom MAG',
        enabled_skills: ['officecli-docx'],
      }),
    ]);

    expect(resolved.find((item) => item.id === 'mag')?.enabled_skills).toEqual(['mag', 'officecli-docx']);
  });

  it('builds an assistant-scoped skill menu with locked required skills from App-approved skills', () => {
    const magProfile = getOplAssistantSkillProfile('mag');
    const menuItems = buildAssistantScopedSkillMenuItems(
      [
        { name: 'mag', description: 'Grant skill', isAuto: false },
        { name: 'officecli-docx', description: 'Word documents', isAuto: false },
        { name: 'mineru-document-extractor', description: 'Extract documents', isAuto: false },
      ],
      magProfile
    );

    expect(menuItems.map((item) => item.name)).toEqual([
      'mag',
      'officecli-docx',
      'officecli-xlsx',
      'mineru-document-extractor',
    ]);
    expect(menuItems.find((item) => item.name === 'mag')).toMatchObject({ required: true, locked: true });
    expect(menuItems.find((item) => item.name === 'officecli-docx')).toMatchObject({ required: false, locked: false });
    expect(isGuidSkillChecked(menuItems[0], [], [])).toBe(true);
    expect(isGuidSkillChecked(menuItems[1], ['officecli-docx'], [])).toBe(true);
    expect(mergeRequiredSkills(['mag'], ['officecli-docx', 'mag'])).toEqual(['mag', 'officecli-docx']);
  });
});
