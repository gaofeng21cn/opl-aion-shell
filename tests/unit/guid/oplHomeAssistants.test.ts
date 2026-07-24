import { describe, expect, it } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { filterOplFoundryAssistants, withOplFoundryAssistantDefaults } from '@/renderer/pages/guid/oplGuidProfile';
import {
  buildAssistantScopedSkillMenuItems,
  isGuidSkillChecked,
  mergeRequiredSkills,
} from '@/renderer/pages/guid/utils/assistantSkillMenu';
import {
  resolveOplHomeAssistants,
  resolveOplProfessionalAgentAssistants,
  resolveOplPackageLaunchGate,
} from '@/renderer/pages/guid/utils/oplHomeAssistants';
import { getOplHomeShortcutPreferencesFromAppState } from '@/renderer/pages/guid/utils/oplHomeShortcutPreferences';
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
  it('keeps Home shortcuts separate from the complete professional-agent directory', () => {
    expect(resolveOplHomeAssistants([]).map((item) => item.id)).toEqual(['mas', 'rca', 'mag', 'obf', 'oma']);

    const directory = resolveOplProfessionalAgentAssistants([]);
    expect(directory.map((item) => item.id)).toEqual(['mas', 'mag', 'rca', 'obf', 'oma']);
    expect(directory.find((item) => item.id === 'oma')?.description_i18n['zh-CN']).toBe(
      '用于创建、接管、检查和改进 OPL 专业智能体。'
    );
    expect(directory.find((item) => item.id === 'obf')?.enabled_skills).toEqual(['opl-bookforge']);
  });

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

    expect(resolved.map((item) => item.id)).toEqual(['mas', 'rca', 'mag', 'obf', 'oma']);
    expect(resolved.map((item) => item.name_i18n['zh-CN'])).toEqual(['科研', '演示', '基金', '写书', '元智能体']);
    expect(resolved.map((item) => item.name_i18n['en-US'])).toEqual([
      'Med Auto Science',
      'RedCube AI',
      'Med Auto Grant',
      'OPL Book Forge',
      'OPL Meta Agent',
    ]);
    expect(resolved[0]?.description_i18n['zh-CN']).toContain('科研任务');
    expect(resolved.map((item) => item.id)).not.toEqual(expect.arrayContaining(['cowork', 'mds']));
    expect(Object.fromEntries(resolved.map((item) => [item.id, item.enabled_skills]))).toEqual({
      mas: ['med-autoscience'],
      mag: ['med-autogrant'],
      rca: ['redcube-ai'],
      obf: ['opl-bookforge'],
      oma: ['opl-meta-agent'],
    });
  });

  it('adds the default-visible Book Forge and OMA shortcuts when merging shell defaults for the Guid page', () => {
    const resolved = withOplFoundryAssistantDefaults([
      assistant({ id: 'mas', name: 'Med Auto Science', name_i18n: { 'zh-CN': 'Med Auto Science' } }),
    ]);

    expect(resolved.map((item) => item.id)).toEqual(['mas', 'rca', 'mag', 'obf', 'oma']);
    expect(resolved.map((item) => item.name_i18n['zh-CN'])).toEqual(['科研', '演示', '基金', '写书', '元智能体']);
    expect(resolved.map((item) => item.name_i18n['en-US'])).toEqual([
      'Med Auto Science',
      'RedCube AI',
      'Med Auto Grant',
      'OPL Book Forge',
      'OPL Meta Agent',
    ]);
    expect(filterOplFoundryAssistants(resolved).map((item) => item.id)).toEqual(['mas', 'rca', 'mag', 'obf', 'oma']);
    expect(resolved.map((item) => item.enabled_skills)).toEqual([
      ['med-autoscience'],
      ['redcube-ai'],
      ['med-autogrant'],
      ['opl-bookforge'],
      ['opl-meta-agent'],
    ]);
  });

  it('uses only explicit user preferences to override App-owned defaults', () => {
    expect(
      getOplHomeShortcutPreferencesFromAppState({
        opl_agent_packages: {
          home_shortcut_preferences: [
            { shortcut_id: 'grant', visible: true, sort_order: 0, source: 'default' },
            { shortcut_id: 'book', visible: false, sort_order: 1, source: 'default' },
            { shortcut_id: 'ppt', visible: true, sort_order: 2, source: 'user_preference' },
          ],
        },
      })
    ).toEqual({
      hiddenShortcutIds: [],
      visibleShortcutIds: ['ppt'],
      orderedShortcutIds: ['ppt'],
    });
  });

  it('preserves an explicit user preference that hides Book Forge', () => {
    expect(
      getOplHomeShortcutPreferencesFromAppState({
        opl_agent_package_status: {
          home_shortcut_preferences: [
            { shortcut_id: 'book', visible: false, sort_order: 3, source: 'user_preference' },
          ],
        },
      })
    ).toEqual({
      hiddenShortcutIds: ['book'],
      visibleShortcutIds: [],
      orderedShortcutIds: ['book'],
    });
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
      state: 'package_unavailable',
      launchAllowed: false,
      launchBlockedReason: 'package_not_installed',
      allowedWhenBlocked: ['status', 'doctor', 'repair'],
    });
  });

  it('keeps a missing workspace materialization local to launch readiness', () => {
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
      state: 'degraded',
      launchAllowed: false,
      launchBlockedReason: 'scope_materialization_scope_required',
      allowedWhenBlocked: ['status', 'doctor', 'repair'],
    });
  });

  it('keeps missing package readout unknown until Framework returns a status record', () => {
    expect(
      resolveOplPackageLaunchGate({ agent_packages: { status_index: { packages: {} } } }, 'med-autoscience')
    ).toEqual({
      state: 'degraded',
      launchAllowed: null,
      launchBlockedReason: null,
      allowedWhenBlocked: [],
    });
    expect(resolveOplPackageLaunchGate({}, 'unknown-agent')).toEqual({
      state: 'degraded',
      launchAllowed: null,
      launchBlockedReason: null,
      allowedWhenBlocked: [],
    });
  });

  it('keeps operational_ready=false as a degraded continuation when launch is still allowed', () => {
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

    expect(gate.state).toBe('degraded');
    expect(gate.launchAllowed).toBe(true);
    expect(gate.allowedWhenBlocked).toEqual(['status', 'doctor', 'repair']);
  });

  it('keeps directory launch readiness authoritative over stale status diagnostics', () => {
    const gate = resolveOplPackageLaunchGate(
      {
        agent_packages: {
          directory: {
            entries: [
              {
                package_id: 'mas',
                readiness: {
                  status: 'ready',
                  operational_ready: true,
                  launch_allowed: true,
                  reason: 'use_boundary_reconciliation_ready',
                },
              },
            ],
          },
          status_index: {
            packages: {
              mas: {
                package_id: 'mas',
                operational_ready: false,
                launch_allowed: false,
                launch_blocked_reason: null,
                allowed_when_blocked: ['status', 'doctor', 'repair'],
              },
            },
          },
        },
      },
      'mas'
    );

    expect(gate).toEqual({
      state: 'ready',
      launchAllowed: true,
      launchBlockedReason: null,
      allowedWhenBlocked: ['status', 'doctor', 'repair'],
    });
  });

  it.each([
    'package_status_read_failed',
    'package_dependency_missing',
    'physical_surface_not_ready',
    'runtime_source_missing',
    'runtime_source_incompatible',
    'carrier_authority_invalid',
    'live_verification_deferred',
    'update_available',
    'optional_dependency_missing',
  ])('keeps %s local and degraded instead of hard-blocking the selected starter', (reason) => {
    const gate = resolveOplPackageLaunchGate(
      {
        agent_packages: {
          status_index: {
            packages: {
              mas: {
                package_id: 'mas',
                operational_ready: false,
                launch_allowed: false,
                launch_blocked_reason: reason,
              },
            },
          },
        },
      },
      'mas'
    );

    expect(gate).toMatchObject({ state: 'degraded', launchAllowed: false, launchBlockedReason: reason });
  });

  it('keeps live verification deferred as degraded from canonical directory readiness', () => {
    const appState = {
      agent_packages: {
        directory: {
          entries: [
            {
              package_id: 'med-autoscience',
              readiness: {
                status: 'verification_deferred',
                operational_ready: false,
                launch_allowed: false,
                verification_deferred: true,
                reason: 'live_verification_deferred',
              },
            },
          ],
        },
        status_index: { packages: {} },
      },
    };

    expect(resolveOplPackageLaunchGate(appState, 'mas')).toMatchObject({
      state: 'degraded',
      launchAllowed: false,
      launchBlockedReason: 'live_verification_deferred',
    });
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
