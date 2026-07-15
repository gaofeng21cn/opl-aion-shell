import { describe, expect, it } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { filterOplFoundryAssistants, withOplFoundryAssistantDefaults } from '@/renderer/pages/guid/oplGuidProfile';
import {
  buildAssistantScopedSkillMenuItems,
  isGuidSkillChecked,
  mergeRequiredSkills,
} from '@/renderer/pages/guid/utils/assistantSkillMenu';
import { resolveOplHomeAssistants, resolveOplPackageLaunchGate } from '@/renderer/pages/guid/utils/oplHomeAssistants';
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
  it('filters historical AionUI assistants and exposes the configured home entries', () => {
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

    expect(resolved.map((item) => item.id)).toEqual(['mas', 'mag', 'rca', 'oma']);
    expect(resolved.map((item) => item.name_i18n['zh-CN'])).toEqual(['科研', '基金', '演示', '元智能体']);
    expect(resolved.map((item) => item.name_i18n['en-US'])).toEqual([
      'Med Auto Science',
      'Med Auto Grant',
      'RedCube AI',
      'OPL Meta Agent',
    ]);
    expect(resolved[0]?.description_i18n['zh-CN']).toContain('科研任务');
    expect(resolved.map((item) => item.id)).not.toEqual(expect.arrayContaining(['cowork', 'mds']));
    expect(Object.fromEntries(resolved.map((item) => [item.id, item.enabled_skills]))).toEqual({
      mas: ['med-autoscience'],
      mag: ['med-autogrant'],
      rca: ['redcube-ai'],
      oma: ['opl-meta-agent'],
    });
  });

  it('adds the default-visible OMA shortcut when merging shell defaults for the Guid page', () => {
    const resolved = withOplFoundryAssistantDefaults([
      assistant({ id: 'mas', name: 'Med Auto Science', name_i18n: { 'zh-CN': 'Med Auto Science' } }),
    ]);

    expect(resolved.map((item) => item.id)).toEqual(['mas', 'mag', 'rca', 'oma']);
    expect(resolved.map((item) => item.name_i18n['zh-CN'])).toEqual(['科研', '基金', '演示', '元智能体']);
    expect(resolved.map((item) => item.name_i18n['en-US'])).toEqual([
      'Med Auto Science',
      'Med Auto Grant',
      'RedCube AI',
      'OPL Meta Agent',
    ]);
    expect(filterOplFoundryAssistants(resolved).map((item) => item.id)).toEqual(['mas', 'mag', 'rca', 'oma']);
    expect(resolved.map((item) => item.enabled_skills)).toEqual([
      ['med-autoscience'],
      ['med-autogrant'],
      ['redcube-ai'],
      ['opl-meta-agent'],
    ]);
  });

  it('keeps caller-added assistant skills while forcing the required profile skill', () => {
    const resolved = resolveOplHomeAssistants([
      assistant({
        id: 'mag',
        name: 'Custom MAG',
        enabled_skills: ['officecli-docx'],
      }),
    ]);

    expect(resolved.find((item) => item.id === 'mag')?.enabled_skills).toEqual(['med-autogrant', 'officecli-docx']);
  });

  it('binds synthetic OPL entries to the generated default assistant runtime id', () => {
    const resolved = resolveOplHomeAssistants([
      assistant({
        id: 'generated-codex',
        source: 'generated',
        name: 'Codex',
        agent_id: '8e1acf31',
        agent: { type: 'acp', source: 'builtin', acp_backend: 'codex' },
      }),
    ]);

    expect(resolved.every((item) => item.agent_id === '8e1acf31')).toBe(true);
    expect(resolved.some((item) => item.agent_id === 'codex')).toBe(false);
  });

  it('fails closed for package_not_installed and keeps only maintenance actions', () => {
    const gate = resolveOplPackageLaunchGate(
      {
        agent_packages: {
          status_index: {
            packages: {
              'example-agent': {
                package_id: 'example-agent',
                operational_ready: true,
                launch_allowed: true,
                launch_blocked_reason: 'package_not_installed',
                allowed_when_blocked: ['status', 'doctor', 'repair', 'launch', 'uninstall'],
              },
            },
          },
        },
      },
      'example-agent'
    );

    expect(gate).toEqual({
      launchAllowed: false,
      launchBlockedReason: 'package_not_installed',
      allowedWhenBlocked: ['status', 'doctor', 'repair'],
      activationRequired: false,
    });
  });

  it('treats a missing workspace materialization as a pre-launch activation requirement', () => {
    const gate = resolveOplPackageLaunchGate(
      {
        agent_packages: {
          status_index: {
            packages: {
              mas: {
                package_id: 'mas',
                operational_ready: false,
                launch_allowed: false,
                launch_blocked_reason: 'scope_materialization_scope_required',
                allowed_when_blocked: ['status', 'doctor', 'repair'],
              },
            },
          },
        },
      },
      'mas'
    );

    expect(gate).toEqual({
      launchAllowed: false,
      launchBlockedReason: 'scope_materialization_scope_required',
      allowedWhenBlocked: ['status', 'doctor', 'repair'],
      activationRequired: true,
    });
  });

  it('keeps missing package readout unknown until Framework returns a status record', () => {
    expect(
      resolveOplPackageLaunchGate({ agent_packages: { status_index: { packages: {} } } }, 'med-autoscience')
    ).toEqual({
      launchAllowed: null,
      launchBlockedReason: null,
      allowedWhenBlocked: [],
      activationRequired: false,
    });
    expect(resolveOplPackageLaunchGate({}, 'unknown-agent')).toEqual({
      launchAllowed: null,
      launchBlockedReason: null,
      allowedWhenBlocked: [],
      activationRequired: false,
    });
  });

  it('blocks ordinary launch when operational readiness is false even if launch_allowed is true', () => {
    const gate = resolveOplPackageLaunchGate(
      {
        agent_packages: {
          status_index: {
            packages: {
              'future-agent': {
                package_id: 'future-agent',
                operational_ready: false,
                launch_allowed: true,
                allowed_when_blocked: ['status', 'doctor', 'repair'],
              },
            },
          },
        },
      },
      'future-agent'
    );

    expect(gate.launchAllowed).toBe(false);
    expect(gate.allowedWhenBlocked).toEqual(['status', 'doctor', 'repair']);
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
      'med-autogrant',
      'officecli-docx',
      'officecli-xlsx',
      'mineru-document-extractor',
    ]);
    expect(menuItems.find((item) => item.name === 'med-autogrant')).toMatchObject({ required: true, locked: true });
    expect(menuItems.find((item) => item.name === 'officecli-docx')).toMatchObject({ required: false, locked: false });
    expect(isGuidSkillChecked(menuItems[0], [], [])).toBe(true);
    expect(isGuidSkillChecked(menuItems[1], ['officecli-docx'], [])).toBe(true);
    expect(mergeRequiredSkills(['med-autogrant'], ['officecli-docx', 'med-autogrant'])).toEqual([
      'med-autogrant',
      'officecli-docx',
    ]);
  });
});
