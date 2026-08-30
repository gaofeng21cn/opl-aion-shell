import { describe, expect, it } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
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
import {
  getOplHomeAgentShortcutsFromAppState,
  getOplHomeShortcutPreferencesFromAppState,
} from '@/renderer/pages/guid/utils/oplHomeShortcutPreferences';
import { resolveOplActiveShortcut } from '@/renderer/pages/guid/utils/activeShortcut';
import { resolveOplStandardAgentCapabilityMetadata } from '@/common/types/opl/appState';

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

const projectedHomeShortcut = (
  shortcutId: string,
  label: string,
  codexVisibleEntry: string,
  defaultVisible = true,
  iconId?: string
) => ({
  shortcut_id: shortcutId,
  ...(iconId === undefined ? {} : { icon_id: iconId }),
  label_i18n: { 'zh-CN': label, 'en-US': label },
  default_visible: defaultVisible,
  user_configurable: true,
  route: {
    route_kind: 'agent_package_shortcut',
    executor: 'codex_cli',
    codex_visible_entry: codexVisibleEntry,
  },
});

const dynamicAppState = () => ({
  agent_packages: {
    directory: {
      entries: [
        {
          package_id: 'mas',
          display_name: 'Med Auto Science',
          description: 'Research',
          package_role: 'standard_agent',
          installed: true,
          home_shortcuts: [projectedHomeShortcut('research', '科研', 'med-autoscience')],
        },
        {
          package_id: 'mag',
          display_name: 'Med Auto Grant',
          description: 'Grants',
          package_role: 'standard_agent',
          installed: true,
          home_shortcuts: [projectedHomeShortcut('grant', '基金', 'med-autogrant')],
          capability_metadata: {
            source: 'normalized_owner_manifest',
            required_skill_ids: ['med-autogrant'],
            optional_skill_refs: ['officecli-docx', 'officecli-xlsx', 'mineru-document-extractor'],
          },
        },
        {
          package_id: 'rca',
          display_name: 'RedCube AI',
          description: 'Presentations',
          package_role: 'standard_agent',
          installed: true,
          home_shortcuts: [projectedHomeShortcut('ppt', '演示', 'redcube-ai')],
        },
        {
          package_id: 'obf',
          display_name: 'OPL Book Forge',
          description: 'Books',
          package_role: 'standard_agent',
          installed: true,
          home_shortcuts: [projectedHomeShortcut('book', '写书', 'opl-bookforge')],
        },
        {
          package_id: 'oma',
          display_name: 'OPL Meta Agent',
          description: 'Agents',
          package_role: 'standard_agent',
          installed: true,
          home_shortcuts: [projectedHomeShortcut('oma', '元智能体', 'opl-meta-agent')],
        },
        {
          package_id: 'opl-flow',
          display_name: 'OPL Flow',
          description: 'Workflow',
          package_role: 'workflow_profile',
          installed: true,
        },
      ],
    },
    status_index: {
      home_shortcut_preferences: [
        {
          package_id: 'mas',
          shortcut_id: 'research',
          visible: true,
          sort_order: 0,
          source: 'default',
          installed: true,
        },
        { package_id: 'rca', shortcut_id: 'ppt', visible: true, sort_order: 1, source: 'default', installed: true },
        { package_id: 'mag', shortcut_id: 'grant', visible: true, sort_order: 2, source: 'default', installed: true },
        { package_id: 'obf', shortcut_id: 'book', visible: true, sort_order: 3, source: 'default', installed: true },
        { package_id: 'oma', shortcut_id: 'oma', visible: true, sort_order: 4, source: 'default', installed: true },
        {
          package_id: 'opl-flow',
          shortcut_id: 'flow',
          visible: true,
          sort_order: 5,
          source: 'default',
          installed: true,
        },
      ],
    },
  },
});

describe('OPL home assistants', () => {
  it('preserves owner-declared shortcut icon tokens through the Home projection', () => {
    const appState = dynamicAppState();
    appState.agent_packages.directory.entries[0].home_shortcuts[0].icon_id = 'send';
    appState.agent_packages.directory.entries[1].home_shortcuts[0].icon_id = 'research';

    expect(
      Object.fromEntries(
        getOplHomeAgentShortcutsFromAppState(appState).map((shortcut) => [shortcut.package_id, shortcut.icon_id])
      )
    ).toEqual({
      mas: 'send',
      mag: 'research',
      rca: null,
      obf: null,
      oma: null,
    });
    expect(
      Object.fromEntries(
        resolveOplHomeAssistants([], appState).map((resolvedAssistant) => [
          resolvedAssistant.opl_package_id,
          resolvedAssistant.opl_icon_id,
        ])
      )
    ).toEqual({
      mas: 'send',
      mag: 'research',
      rca: null,
      obf: null,
      oma: null,
    });
  });

  it('uses the Framework directory as membership and excludes workflow packages', () => {
    const appState = dynamicAppState();
    expect(resolveOplHomeAssistants([], appState).map((item) => item.id)).toEqual([
      'research',
      'ppt',
      'grant',
      'book',
      'oma',
    ]);

    const directory = resolveOplProfessionalAgentAssistants([], appState);
    expect(directory.map((item) => item.id)).toEqual(['mas', 'mag', 'rca', 'obf', 'oma']);
    expect(directory.find((item) => item.id === 'oma')?.description_i18n).toEqual({
      'zh-CN': 'Agents',
      'en-US': 'Agents',
    });
    expect(directory.find((item) => item.id === 'obf')?.enabled_skills).toEqual([]);
    expect(directory.every((item) => item.agent_id === undefined && item.agent === undefined)).toBe(true);
  });

  it('joins a backend assistant only through its descriptor-declared Codex entry', () => {
    const appState = {
      agent_packages: {
        directory: {
          entries: [
            {
              package_id: 'future-research',
              display_name: 'Future Research',
              description: 'Descriptor owned',
              package_role: 'standard_agent',
              installed: true,
              home_shortcuts: [projectedHomeShortcut('future-main', 'Future', 'future-research-cli')],
            },
          ],
        },
        status_index: { home_shortcut_preferences: [] },
      },
    };

    const resolved = resolveOplProfessionalAgentAssistants(
      [assistant({ id: 'future_research_cli', name: 'Owner runtime', enabled_skills: ['owner-skill'] })],
      appState
    );

    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      id: 'future-research',
      name: 'Future Research',
      enabled_skills: ['owner-skill'],
    });
  });

  it('fails closed when descriptors claim the same backend assistant identity', () => {
    const appState = {
      agent_packages: {
        directory: {
          entries: [
            {
              package_id: 'first-agent',
              display_name: 'First',
              description: 'First descriptor',
              package_role: 'standard_agent',
              installed: true,
              home_shortcuts: [projectedHomeShortcut('first-main', 'First', 'shared-owner-entry')],
            },
            {
              package_id: 'second-agent',
              display_name: 'Second',
              description: 'Second descriptor',
              package_role: 'standard_agent',
              installed: true,
              home_shortcuts: [projectedHomeShortcut('second-main', 'Second', 'shared-owner-entry')],
            },
          ],
        },
        status_index: { home_shortcut_preferences: [] },
      },
    };

    const resolved = resolveOplProfessionalAgentAssistants(
      [assistant({ id: 'shared-owner-entry', name: 'Ambiguous backend', enabled_skills: ['owner-skill'] })],
      appState
    );

    expect(resolved.map((entry) => entry.enabled_skills)).toEqual([[], []]);
  });

  it('resolves legacy Home selection only through one descriptor-declared identity', () => {
    const appState = {
      agent_packages: {
        directory: {
          entries: [
            {
              package_id: 'future-research',
              display_name: 'Future Research',
              description: 'Descriptor owned',
              package_role: 'standard_agent',
              installed: true,
              home_shortcuts: [projectedHomeShortcut('future-main', 'Future', 'future-research-cli')],
            },
            {
              package_id: 'other-research',
              display_name: 'Other Research',
              description: 'Independent descriptor',
              package_role: 'standard_agent',
              installed: true,
              home_shortcuts: [projectedHomeShortcut('other-main', 'Other', 'other-research-cli')],
            },
          ],
        },
        status_index: { home_shortcut_preferences: [] },
      },
    };

    expect(resolveOplActiveShortcut('future_research_cli', appState)).toMatchObject({
      package_id: 'future-research',
      shortcut_id: 'future-main',
    });
    expect(resolveOplActiveShortcut('unclaimed-runtime', appState)).toBeNull();
  });

  it('keeps selectable uninstalled directory packages visible on Home and launch-gates them', () => {
    const appState = {
      agent_packages: {
        directory: {
          entries: [
            { package_id: 'mas-scholar-skills', package_role: 'framework_capability_package', installed: true },
            {
              package_id: 'mag',
              display_name: 'Med Auto Grant',
              package_role: 'standard_agent',
              installed: false,
              home_shortcuts: [projectedHomeShortcut('grant', '基金', 'med-autogrant')],
            },
            {
              package_id: 'mas',
              display_name: 'Med Auto Science',
              package_role: 'standard_agent',
              installed: false,
              home_shortcuts: [projectedHomeShortcut('research', '科研', 'med-autoscience')],
            },
            {
              package_id: 'obf',
              display_name: 'OPL Book Forge',
              package_role: 'standard_agent',
              installed: false,
              home_shortcuts: [projectedHomeShortcut('book', '写书', 'opl-bookforge')],
            },
            { package_id: 'opl-flow', package_role: 'workflow_profile', installed: true },
            {
              package_id: 'oma',
              display_name: 'OPL Meta Agent',
              package_role: 'standard_agent',
              installed: false,
              home_shortcuts: [projectedHomeShortcut('oma', '元智能体', 'opl-meta-agent')],
            },
            {
              package_id: 'rca',
              display_name: 'RedCube AI',
              package_role: 'standard_agent',
              installed: false,
              home_shortcuts: [projectedHomeShortcut('ppt', '演示', 'redcube-ai')],
            },
          ],
        },
        status_index: {
          home_shortcut_preferences: [],
          packages: {
            mas: {
              package_id: 'mas',
              operational_ready: false,
              launch_allowed: false,
              launch_blocked_reason: 'package_not_installed',
              allowed_when_blocked: ['status', 'doctor', 'repair'],
            },
          },
        },
      },
    };

    const shortcuts = getOplHomeAgentShortcutsFromAppState(appState);
    expect(shortcuts.map((item) => item.shortcut_id)).toEqual(['grant', 'research', 'book', 'oma', 'ppt']);
    expect(shortcuts.every((item) => item.installed === false)).toBe(true);
    expect(resolveOplProfessionalAgentAssistants([], appState).map((item) => item.id)).toEqual([
      'mag',
      'mas',
      'obf',
      'oma',
      'rca',
    ]);
    expect(resolveOplHomeAssistants([], appState).map((item) => item.opl_package_id)).toEqual([
      'mag',
      'mas',
      'obf',
      'oma',
      'rca',
    ]);
    expect(resolveOplPackageLaunchGate(appState, 'mas')).toEqual({
      state: 'package_unavailable',
      launchAllowed: false,
      launchBlockedReason: 'package_not_installed',
      allowedWhenBlocked: ['status', 'doctor', 'repair'],
    });
  });

  it('keeps backend assistants as runtime binding without making them membership authority', () => {
    const appState = dynamicAppState();
    const resolved = resolveOplHomeAssistants(
      [
        assistant({ id: 'cowork', name: 'Cowork' }),
        assistant({ id: 'mds', name: 'Med Deep Scientist' }),
        assistant({
          id: 'mas',
          name: 'Custom MAS',
          name_i18n: { 'zh-CN': '定制 MAS' },
          description_i18n: { 'zh-CN': '用户已有 MAS 配置' },
          agent_id: 'codex-managed',
          agent: { type: 'acp', source: 'builtin', acp_backend: 'codex' },
        }),
      ],
      appState
    );

    expect(resolved.map((item) => item.id)).toEqual(['research', 'ppt', 'grant', 'book', 'oma']);
    expect(resolved.map((item) => item.name_i18n['zh-CN'])).toEqual(['科研', '演示', '基金', '写书', '元智能体']);
    expect(resolved.map((item) => item.name_i18n['en-US'])).toEqual(['科研', '演示', '基金', '写书', '元智能体']);
    expect(resolved[0]?.description_i18n).toEqual({ 'zh-CN': 'Research', 'en-US': 'Research' });
    expect(resolved[0]).toMatchObject({ agent_id: 'codex-managed', agent: { acp_backend: 'codex' } });
    expect(resolved.slice(1).every((item) => item.agent_id === undefined && item.agent === undefined)).toBe(true);
    expect(resolved.map((item) => item.id)).not.toEqual(expect.arrayContaining(['cowork', 'mds']));
    expect(resolved.every((item) => item.enabled_skills.length === 0)).toBe(true);
  });

  it('joins a backend identity only when the owner descriptor declares it without changing membership', () => {
    const appState = {
      agent_packages: {
        directory: {
          entries: [
            {
              package_id: 'med-autoscience',
              display_name: 'Med Auto Science',
              description: 'Research',
              package_role: 'standard_agent',
              installed: true,
              home_shortcuts: [projectedHomeShortcut('research', '科研', 'mas')],
            },
          ],
        },
        status_index: {
          home_shortcut_preferences: [
            {
              package_id: 'med-autoscience',
              shortcut_id: 'research',
              visible: true,
              sort_order: 0,
              source: 'default',
              installed: true,
            },
          ],
        },
      },
    };
    const resolved = resolveOplHomeAssistants(
      [
        assistant({
          id: 'mas',
          name: 'Backend MAS',
          agent_id: 'codex-managed',
          agent: { type: 'acp', source: 'builtin', acp_backend: 'codex' },
        }),
      ],
      appState
    );

    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      id: 'research',
      opl_package_id: 'med-autoscience',
      opl_shortcut_id: 'research',
      name: '科研',
      agent_id: 'codex-managed',
    });
  });

  it('does not synthesize fixed agents when the directory is absent', () => {
    expect(resolveOplHomeAssistants([], {})).toEqual([]);
    expect(resolveOplProfessionalAgentAssistants([], {})).toEqual([]);
  });

  it('supports a future Agent presentation without inventing runtime binding, prompts, or skills', () => {
    const appState = {
      agent_packages: {
        directory: {
          entries: [
            {
              package_id: 'future-agent',
              display_name: 'Future Agent',
              description: 'Future work',
              package_role: 'standard_agent',
              installed: true,
              home_shortcuts: [
                projectedHomeShortcut('future-main', 'Future Main', 'future-agent'),
                projectedHomeShortcut('future-review', 'Future Review', 'future-agent'),
              ],
            },
          ],
        },
        status_index: {
          home_shortcut_preferences: [
            {
              package_id: 'future-agent',
              shortcut_id: 'future-main',
              visible: true,
              sort_order: 1,
              source: 'default',
              installed: true,
            },
            {
              package_id: 'future-agent',
              shortcut_id: 'future-review',
              visible: true,
              sort_order: 0,
              source: 'user_preference',
              installed: true,
            },
          ],
        },
      },
    };

    expect(getOplHomeAgentShortcutsFromAppState(appState).map((item) => [item.package_id, item.shortcut_id])).toEqual([
      ['future-agent', 'future-review'],
      ['future-agent', 'future-main'],
    ]);
    expect(
      resolveOplHomeAssistants([], appState).map((item) => ({
        id: item.id,
        packageId: item.opl_package_id,
        label: item.name,
        description: item.description,
        agentId: item.agent_id,
        runtime: item.agent,
        status: item.agent_status,
        prompts: item.prompts,
        skills: item.enabled_skills,
      }))
    ).toEqual([
      {
        id: 'future-review',
        packageId: 'future-agent',
        label: 'Future Review',
        description: 'Future work',
        agentId: undefined,
        runtime: undefined,
        status: 'missing',
        prompts: [],
        skills: [],
      },
      {
        id: 'future-main',
        packageId: 'future-agent',
        label: 'Future Main',
        description: 'Future work',
        agentId: undefined,
        runtime: undefined,
        status: 'missing',
        prompts: [],
        skills: [],
      },
    ]);
  });

  it('keeps installed truth owned by the directory while preferences only control visibility and order', () => {
    const appState = {
      agent_packages: {
        directory: {
          entries: [
            {
              package_id: 'installed-agent',
              display_name: 'Installed Agent',
              package_role: 'standard_agent',
              installed: true,
              home_shortcuts: [projectedHomeShortcut('installed-main', 'Installed', 'installed-agent')],
            },
            {
              package_id: 'missing-agent',
              display_name: 'Missing Agent',
              package_role: 'standard_agent',
              installed: false,
              home_shortcuts: [projectedHomeShortcut('missing-main', 'Missing', 'missing-agent', false)],
            },
          ],
        },
        status_index: {
          home_shortcut_preferences: [
            {
              package_id: 'installed-agent',
              shortcut_id: 'installed-main',
              visible: false,
              sort_order: 1,
              source: 'user_preference',
              installed: false,
            },
            {
              package_id: 'missing-agent',
              shortcut_id: 'missing-main',
              visible: true,
              sort_order: 0,
              source: 'user_preference',
              installed: true,
            },
          ],
        },
      },
    };

    expect(
      getOplHomeAgentShortcutsFromAppState(appState).map((shortcut) => ({
        shortcutId: shortcut.shortcut_id,
        installed: shortcut.installed,
        visible: shortcut.visible,
        preferenceSource: shortcut.preference_source,
        sortOrder: shortcut.sort_order,
      }))
    ).toEqual([
      {
        shortcutId: 'missing-main',
        installed: false,
        visible: true,
        preferenceSource: 'user_preference',
        sortOrder: 0,
      },
      {
        shortcutId: 'installed-main',
        installed: true,
        visible: false,
        preferenceSource: 'user_preference',
        sortOrder: 1,
      },
    ]);
  });

  it('uses only explicit user preferences to override App-owned defaults', () => {
    expect(
      getOplHomeShortcutPreferencesFromAppState({
        agent_packages: {
          status_index: {
            home_shortcut_preferences: [
              { shortcut_id: 'grant', visible: true, sort_order: 0, source: 'default' },
              { shortcut_id: 'book', visible: false, sort_order: 1, source: 'default' },
              { shortcut_id: 'ppt', visible: true, sort_order: 2, source: 'user_preference' },
            ],
          },
        },
      })
    ).toEqual({
      hiddenShortcutIds: [],
      visibleShortcutIds: ['ppt'],
      orderedShortcutIds: ['ppt'],
    });
  });

  it('keeps backend-provided skills without injecting fixed Profile requirements', () => {
    const resolved = resolveOplHomeAssistants(
      [
        assistant({
          id: 'mag',
          name: 'Custom MAG',
          enabled_skills: ['officecli-docx'],
        }),
      ],
      dynamicAppState()
    );

    expect(resolved.find((item) => item.opl_package_id === 'mag')?.enabled_skills).toEqual(['officecli-docx']);
  });

  it('does not bind directory-only Agents to the generated default assistant runtime id', () => {
    const resolved = resolveOplHomeAssistants(
      [
        assistant({
          id: 'generated-codex',
          source: 'generated',
          name: 'Codex',
          agent_id: '8e1acf31',
          agent: { type: 'acp', source: 'builtin', acp_backend: 'codex' },
        }),
      ],
      dynamicAppState()
    );

    expect(resolved.every((item) => item.agent_id === undefined)).toBe(true);
    expect(resolved.every((item) => item.agent === undefined && item.agent_status === 'missing')).toBe(true);
  });

  it('fails closed for package_not_installed and preserves Framework-projected recovery actions', () => {
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
      allowedWhenBlocked: ['status', 'doctor', 'repair', 'launch', 'uninstall'],
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

  it.each(['package_version_mismatch', 'incompatible_package_version'])(
    'does not restore a Shell-side SemVer launch gate for %s',
    (reason) => {
      const gate = resolveOplPackageLaunchGate(
        {
          agent_packages: {
            directory: {
              entries: [
                {
                  package_id: 'future-agent',
                  package_role: 'standard_agent',
                  installed: true,
                },
              ],
            },
            status_index: {
              packages: [
                {
                  package_id: 'future-agent',
                  operational_ready: false,
                  launch_allowed: false,
                  launch_blocked_reason: reason,
                },
              ],
            },
          },
        },
        'future-agent'
      );

      expect(gate).toMatchObject({ state: 'degraded', launchAllowed: false, launchBlockedReason: reason });
    }
  );

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

    expect(resolveOplPackageLaunchGate(appState, 'med-autoscience')).toMatchObject({
      state: 'degraded',
      launchAllowed: false,
      launchBlockedReason: 'live_verification_deferred',
    });
  });

  it('builds an assistant-scoped skill menu with locked required skills from App-approved skills', () => {
    const metadata = resolveOplStandardAgentCapabilityMetadata(dynamicAppState(), 'mag');
    const magProfile = metadata
      ? { required_skills: metadata.requiredSkillIds, optional_skills: metadata.optionalSkillRefs }
      : undefined;
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

  it('returns no capability metadata when the live directory omits or malforms the owner projection', () => {
    expect(resolveOplStandardAgentCapabilityMetadata(dynamicAppState(), 'mas')).toBeNull();
    expect(
      resolveOplStandardAgentCapabilityMetadata(
        {
          agent_packages: {
            directory: {
              entries: [
                {
                  package_id: 'future-agent',
                  package_role: 'standard_agent',
                  installed: true,
                  capability_metadata: {
                    source: 'owner',
                    required_skill_ids: ['future-skill'],
                    optional_skill_refs: 'not-an-array',
                  },
                },
              ],
            },
          },
        },
        'future-agent'
      )
    ).toBeNull();
  });
});
