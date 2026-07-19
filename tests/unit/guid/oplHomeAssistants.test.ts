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
  resolveOplPackageActivationAction,
  resolveOplPackageLaunchGate,
  resolveOplPackageSelectionVersion,
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

const activationAction = (
  packageId: string,
  payload: Record<string, unknown> = { package_id: packageId },
  requiredPayloadFields: string[] = ['package_id']
) => ({
  action_id: 'agent_package_activate',
  action_ref: 'app_state.actions#agent_package_activate',
  payload,
  required_payload_fields: requiredPayloadFields,
  confirmation_required: false,
});

describe('OPL home assistants', () => {
  it('keeps Home shortcuts separate from the complete professional-agent directory', () => {
    expect(resolveOplHomeAssistants([]).map((item) => item.id)).toEqual(['mas', 'rca', 'mag', 'oma']);

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

    expect(resolved.map((item) => item.id)).toEqual(['mas', 'rca', 'mag', 'oma']);
    expect(resolved.map((item) => item.name_i18n['zh-CN'])).toEqual(['科研', '演示', '基金', '元智能体']);
    expect(resolved.map((item) => item.name_i18n['en-US'])).toEqual([
      'Med Auto Science',
      'RedCube AI',
      'Med Auto Grant',
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

    expect(resolved.map((item) => item.id)).toEqual(['mas', 'rca', 'mag', 'oma']);
    expect(resolved.map((item) => item.name_i18n['zh-CN'])).toEqual(['科研', '演示', '基金', '元智能体']);
    expect(resolved.map((item) => item.name_i18n['en-US'])).toEqual([
      'Med Auto Science',
      'RedCube AI',
      'Med Auto Grant',
      'OPL Meta Agent',
    ]);
    expect(filterOplFoundryAssistants(resolved).map((item) => item.id)).toEqual(['mas', 'rca', 'mag', 'oma']);
    expect(resolved.map((item) => item.enabled_skills)).toEqual([
      ['med-autoscience'],
      ['redcube-ai'],
      ['med-autogrant'],
      ['opl-meta-agent'],
    ]);
  });

  it('uses only explicit user preferences to override the App-owned default order', () => {
    expect(
      getOplHomeShortcutPreferencesFromAppState({
        opl_agent_packages: {
          home_shortcut_preferences: [
            { shortcut_id: 'grant', visible: true, sort_order: 0, source: 'default' },
            { shortcut_id: 'ppt', visible: true, sort_order: 1, source: 'user_preference' },
          ],
        },
      })
    ).toEqual({
      hiddenShortcutIds: [],
      visibleShortcutIds: ['grant', 'ppt'],
      orderedShortcutIds: ['ppt'],
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
      activationRequired: false,
    });
  });

  it('treats a missing workspace materialization as a pre-launch activation requirement', () => {
    const gate = resolveOplPackageLaunchGate(
      {
        agent_packages: {
          directory: {
            entries: [
              {
                package_id: 'mas',
                available_actions: [
                  activationAction('mas', { package_id: 'mas', scope: 'workspace' }, [
                    'package_id',
                    'scope',
                    'target_workspace or target_quest',
                  ]),
                ],
              },
            ],
          },
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
      activationRequired: true,
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
      activationRequired: false,
    });
    expect(resolveOplPackageLaunchGate({}, 'unknown-agent')).toEqual({
      state: 'degraded',
      launchAllowed: null,
      launchBlockedReason: null,
      allowedWhenBlocked: [],
      activationRequired: false,
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

  it('reads the selected package version from owner projections without parsing a manifest', () => {
    expect(
      resolveOplPackageSelectionVersion(
        {
          agent_packages: {
            directory: { entries: [{ package_id: 'med-autoscience', package_version: null }] },
            status_index: { packages: { mas: { package_id: 'mas', package_version: '0.2.10' } } },
          },
        },
        'med-autoscience'
      )
    ).toBe('0.2.10');
  });

  it('keeps live verification deferred JIT-eligible from the exact projected action', () => {
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
              available_actions: [activationAction('med-autoscience')],
            },
          ],
        },
        status_index: { packages: {} },
      },
    };

    expect(resolveOplPackageActivationAction(appState, 'mas')).toMatchObject({
      actionId: 'agent_package_activate',
      payloadRefsOnlyJson: { package_id: 'med-autoscience' },
      requiredPayloadFields: ['package_id'],
    });
    expect(resolveOplPackageLaunchGate(appState, 'mas')).toMatchObject({
      state: 'degraded',
      launchAllowed: false,
      launchBlockedReason: 'live_verification_deferred',
      activationRequired: true,
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
