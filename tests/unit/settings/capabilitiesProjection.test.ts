import { describe, expect, it, vi } from 'vitest';
import { buildCapabilitiesViewModel } from '@/renderer/pages/settings/capabilitiesProjection';
import { localizedCapabilitySummary } from '@/renderer/utils/ui/capabilitySummary';

vi.mock('@/common/config/oplProductProfile', () => ({
  canonicalizeOplProfessionalAgentId: (value: string) => {
    const normalized = value
      .replace(/^builtin-/, '')
      .trim()
      .toLowerCase();
    const aliasMap: Record<string, string> = {
      mas: 'med-autoscience',
      medautoscience: 'med-autoscience',
      mag: 'med-autogrant',
      medautogrant: 'med-autogrant',
      rca: 'redcube-ai',
      redcube: 'redcube-ai',
      redcubeai: 'redcube-ai',
      oma: 'opl-meta-agent',
      oplmetaagent: 'opl-meta-agent',
      bookforge: 'opl-bookforge',
      obf: 'opl-bookforge',
      oplbookforge: 'opl-bookforge',
    };
    return aliasMap[normalized.replace(/[^a-z0-9]/g, '')] ?? normalized;
  },
  getOplHomeAgentShortcuts: () => [
    {
      shortcut_id: 'research',
      package_id: 'med-autoscience',
      primary_label: 'Research',
      user_configurable: true,
      default_visible: true,
    },
    {
      shortcut_id: 'automations',
      package_id: 'opl-meta-agent',
      primary_label: 'Meta agent',
      user_configurable: true,
      default_visible: true,
    },
  ],
  getOplFirstPartyPackagePresentations: () => [
    {
      package_id: 'mas',
      display_name_i18n: { 'zh-CN': '医学科研智能体', 'en-US': 'Med Auto Science' },
      description_i18n: {
        'zh-CN': '用于科研选题、文献分析、数据分析、论文写作、审稿、返修和投稿。',
        'en-US':
          'For research planning, literature review, data analysis, manuscript writing, peer review, revision, and submission.',
      },
    },
    {
      package_id: 'mag',
      display_name_i18n: { 'zh-CN': '医学基金智能体', 'en-US': 'Med Auto Grant' },
      description_i18n: {
        'zh-CN': '用于基金选题、标书与申请书撰写、预算说明和评审回复。',
        'en-US': 'For grant topics, proposals and applications, budget narratives, and reviewer responses.',
      },
    },
    {
      package_id: 'rca',
      display_name_i18n: { 'zh-CN': '演示与视觉智能体', 'en-US': 'RedCube AI' },
      description_i18n: {
        'zh-CN': '用于制作演示文稿、汇报材料、图表和其他专业视觉交付物。',
        'en-US': 'For presentations, reports, charts, and other professional visual deliverables.',
      },
    },
    {
      package_id: 'oma',
      display_name_i18n: { 'zh-CN': '元智能体', 'en-US': 'OPL Meta Agent' },
      description_i18n: {
        'zh-CN': '用于创建、接管、检查和改进 OPL 专业智能体。',
        'en-US': 'For creating, taking over, inspecting, and improving OPL professional agents.',
      },
    },
    {
      package_id: 'obf',
      display_name_i18n: { 'zh-CN': '写书智能体', 'en-US': 'OPL Book Forge' },
      description_i18n: {
        'zh-CN': '用于书稿规划、章节写作、插图表格、排版、审校和导出。',
        'en-US': 'For book planning, chapter writing, figures and tables, layout, editing, and export.',
      },
    },
    {
      package_id: 'mas-scholar-skills',
      display_name_i18n: { 'zh-CN': 'MAS 学术技能', 'en-US': 'MAS Scholar Skills' },
      description_i18n: {
        'zh-CN': '供医学科研智能体使用的可复用医学科研能力。',
        'en-US': 'Reusable medical research capabilities consumed by Med Auto Science.',
      },
    },
    {
      package_id: 'opl-flow',
      display_name_i18n: { 'zh-CN': 'OPL Flow', 'en-US': 'OPL Flow' },
      description_i18n: {
        'zh-CN': 'OPL 推荐工作流配置与受管 Codex 策略。',
        'en-US': 'Recommended OPL workflow profile and managed Codex policy.',
      },
    },
  ],
  getOplProfessionalAgentPackages: () => [
    {
      package_id: 'med-autoscience',
      display_name: 'Med Auto Science',
      short_name: 'MAS',
      codex_visible_entry: 'mas',
      default_home_visible: true,
      required_skill_ids: ['mas'],
      optional_skill_ids: [],
    },
    {
      package_id: 'opl-meta-agent',
      display_name: 'OPL Meta Agent',
      short_name: 'OMA',
      codex_visible_entry: 'opl-meta-agent',
      default_home_visible: true,
      required_skill_ids: ['opl-meta-agent'],
      optional_skill_ids: [],
    },
  ],
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  oplRecord: (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  oplRecordList: (value: unknown) =>
    Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)) : [],
  oplString: (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null),
}));

type PackageFixture = Record<string, unknown>;

function appStateWithPackageDirectory(
  entries: PackageFixture[],
  statuses: PackageFixture[] = [],
  rest: Record<string, unknown> = {}
) {
  return {
    ...rest,
    agent_packages: {
      directory: { entries },
      status_index: { packages: statuses },
    },
  };
}

describe('localizedCapabilitySummary', () => {
  it.each([
    ['mas', 'medAutoscience'],
    ['med-auto-science', 'medAutoscience'],
    ['mag', 'medAutogrant'],
    ['med-auto-grant', 'medAutogrant'],
    ['rca', 'redcubeAi'],
    ['oma', 'oplMetaAgent'],
    ['obf', 'oplBookforge'],
    ['opl-book-forge', 'oplBookforge'],
    ['mas-scholar-skills', 'masScholarSkills'],
    ['opl-flow', 'oplFlow'],
  ])('maps %s to the dedicated %s summary', (identity, summaryKey) => {
    expect(localizedCapabilitySummary([identity], identity, (key) => key)).toBe(
      `settings.uiOptimization.capabilities.summaries.${summaryKey}`
    );
  });
});

describe('buildCapabilitiesViewModel', () => {
  it('uses App-owned localized metadata for every first-party package', () => {
    const capabilities = buildCapabilitiesViewModel(
      appStateWithPackageDirectory(
        ['mas', 'mag', 'rca', 'oma', 'obf', 'mas-scholar-skills', 'opl-flow'].map((packageId) => ({
          package_id: packageId,
          display_name: `Runtime ${packageId}`,
          description: `Runtime description for ${packageId}`,
          installed: true,
        }))
      ),
      'zh-CN'
    );
    const localizedByPackageId = new Map(
      capabilities.map((capability) => [capability.packageId, [capability.title, capability.description]])
    );

    expect(localizedByPackageId.get('med-autoscience')).toEqual([
      '医学科研智能体',
      '用于科研选题、文献分析、数据分析、论文写作、审稿、返修和投稿。',
    ]);
    expect(localizedByPackageId.get('mas-scholar-skills')).toEqual([
      'MAS 学术技能',
      '供医学科研智能体使用的可复用医学科研能力。',
    ]);
    expect(localizedByPackageId.get('opl-flow')).toEqual(['OPL Flow', 'OPL 推荐工作流配置与受管 Codex 策略。']);
    expect([...localizedByPackageId.values()].every(([title, description]) => title && description)).toBe(true);
  });

  it('treats dirty developer checkouts as source instead of repair', () => {
    const [research] = buildCapabilitiesViewModel(
      appStateWithPackageDirectory([{ package_id: 'med-autoscience', installed: true }], [], {
        runtime_source_carriers: {
          items: [
            {
              package_id: 'med-autoscience',
              carrier_id: 'medautoscience',
              source_origin: 'sibling_workspace',
              source_policy: {
                effective_install_update_source: 'git_checkout',
                configured_by: 'developer_mode',
              },
              git: {
                dirty: true,
                sync_status: 'behind',
                short_sha: '4d4dead',
              },
            },
          ],
        },
      }),
      'en-US'
    );

    expect(research.status).toBe('source');
    expect(research.primaryAction).toBe('maintenance');
    expect(research.version).toBe('4d4dead');
    expect(research.title).toBe('Med Auto Science');
    expect(research.description).toBe(
      'For research planning, literature review, data analysis, manuscript writing, peer review, revision, and submission.'
    );
  });

  it('treats managed-root git update hints as source maintenance, not package updates', () => {
    const capabilities = buildCapabilitiesViewModel(
      appStateWithPackageDirectory([{ package_id: 'opl-meta-agent', installed: true }], [], {
        runtime_source_carriers: {
          items: [
            {
              package_id: 'opl-meta-agent',
              carrier_id: 'oplmetaagent',
              source_origin: 'managed_root',
              git: {
                dirty: false,
                sync_status: 'behind',
                short_sha: '712b006',
              },
            },
          ],
        },
      }),
      'en-US'
    );
    const oma = capabilities.find((capability) => capability.packageId === 'opl-meta-agent');

    expect(oma?.status).toBe('source');
    expect(oma?.primaryAction).toBe('maintenance');
    expect(oma?.version).toBe('712b006');
  });

  it('ignores legacy package and module projections without canonical directory entries', () => {
    const capabilities = buildCapabilitiesViewModel(
      {
        opl_agent_package_status: {
          items: [
            {
              package_id: 'mas',
              status: 'ready',
              source: 'package_projection',
              version: '9.9.9',
              capability_exposure: { status: 'needs_sync' },
            },
          ],
        },
        modules: {
          items: [
            {
              module_id: 'medautoscience',
              status: 'failed_with_repair',
              source: 'module_projection',
              version: '1.2.3',
            },
          ],
        },
        agent_packages: {
          status_index: {
            packages: [{ package_id: 'mas', status: 'ready' }],
          },
        },
      },
      'en-US'
    );

    expect(capabilities).toEqual([]);
  });

  it('keeps punctuation-significant third-party package ids as distinct directory rows', () => {
    const capabilities = buildCapabilitiesViewModel(
      appStateWithPackageDirectory([
        { package_id: 'vendor.tool', display_name: 'Vendor Tool' },
        { package_id: 'vendortool', display_name: 'VendorTool' },
      ]),
      'en-US'
    );

    expect(capabilities.map((item) => item.packageId)).toEqual(['vendor.tool', 'vendortool']);
    expect(new Set(capabilities.map((item) => item.key)).size).toBe(2);
  });

  it.each(['repair_required', 'blocked'] as const)(
    'does not report ready when dependency readiness is %s',
    (dependencyStatus) => {
      const capability = buildCapabilitiesViewModel(
        appStateWithPackageDirectory(
          [{ package_id: 'example-agent', display_name: 'Example agent', installed: true }],
          [
            {
              package_id: 'example-agent',
              status: 'ready',
              operational_ready: false,
              dependency_readiness: {
                status: dependencyStatus,
                required_count: 1,
                ready_count: 0,
                checks: [
                  {
                    package_id: 'example-provider',
                    ready: false,
                    failure_reasons: [
                      dependencyStatus === 'blocked' ? 'version_incompatible' : 'required_export_missing',
                    ],
                  },
                ],
              },
              repair_action: {
                action_id: 'agent_package_repair',
                command_ref: 'opl app action execute --action agent_package_repair --payload <json> --json',
                enabled: true,
                reason_code: 'dependency_closure_not_ready',
              },
            },
          ]
        ),
        'en-US',
        [
          {
            key: 'example-agent',
            title: 'Example agent',
            description: 'Example',
            tags: [],
            moduleIds: [],
            packageId: 'example-agent',
          },
        ]
      ).find((item) => item.packageId === 'example-agent')!;

      expect(capability.status).toBe('repair');
      expect(capability.operationalReady).toBe(false);
      expect(capability.failureReason).toMatch(/required_export_missing|version_incompatible/);
      expect(capability.codexVisibility).toBe('notVisible');
    }
  );

  it('does not treat a physically visible developer checkout as operationally ready', () => {
    const [research] = buildCapabilitiesViewModel(
      appStateWithPackageDirectory(
        [{ package_id: 'mas', installed: true, codex_visible: true }],
        [
          {
            package_id: 'mas',
            status: 'update_available',
            operational_ready: false,
            dependency_readiness: { status: 'repair_required', required_count: 1, ready_count: 0, checks: [] },
          },
        ],
        {
          runtime_source_carriers: {
            items: [
              {
                package_id: 'mas',
                carrier_id: 'medautoscience',
                source_origin: 'sibling_workspace',
                source_policy: {
                  effective_install_update_source: 'git_checkout',
                  configured_by: 'developer_mode',
                },
                git: { dirty: true, sync_status: 'behind' },
              },
            ],
          },
        }
      ),
      'en-US'
    );

    expect(research.status).toBe('repair');
    expect(research.availabilityStatus).toBe('repair');
    expect(research.codexVisibility).toBe('notVisible');
    expect(research.actualSource).toBe('sibling_workspace');
  });

  it('uses the runtime carrier as run source without replacing package installation truth', () => {
    const [research] = buildCapabilitiesViewModel(
      appStateWithPackageDirectory(
        [
          {
            package_id: 'mas',
            status: 'installed',
            source_kind: 'local_manifest_file',
            codex_visible: true,
          },
        ],
        [],
        {
          runtime_source_carriers: {
            items: [
              {
                package_id: 'mas',
                carrier_id: 'medautoscience',
                source_origin: 'sibling_workspace',
                source_path: '/workspace/med-autoscience',
                managed_source_path: '/managed/med-autoscience',
                source_policy: {
                  effective_install_update_source: 'git_checkout',
                  configured_by: 'developer_mode',
                },
                git: { dirty: false, sync_status: 'synced', short_sha: 'abc1234' },
              },
            ],
          },
        }
      ),
      'en-US'
    );

    expect(research.status).toBe('ready');
    expect(research.actualSource).toBe('sibling_workspace');
    expect(research.checkoutPath).toBe('/workspace/med-autoscience');
  });

  it('does not treat an uninstalled runtime carrier as package installation truth', () => {
    const capabilities = buildCapabilitiesViewModel(
      appStateWithPackageDirectory([], [], {
        runtime_source_carriers: {
          items: [
            {
              package_id: 'mas',
              carrier_id: 'medautoscience',
              source_origin: 'sibling_workspace',
              source_health_status: 'ready',
            },
          ],
        },
      }),
      'en-US'
    );

    expect(capabilities).toEqual([]);
  });

  it('reports ready only when dependency closure and operational readiness are ready', () => {
    const capability = buildCapabilitiesViewModel(
      appStateWithPackageDirectory(
        [{ package_id: 'example-agent', display_name: 'Example agent', installed: true }],
        [
          {
            package_id: 'example-agent',
            status: 'ready',
            operational_ready: true,
            launch_allowed: true,
            codex_visible: true,
            dependency_readiness: { status: 'ready', required_count: 1, ready_count: 1, checks: [] },
          },
        ]
      ),
      'en-US',
      [
        {
          key: 'example-agent',
          title: 'Example agent',
          description: 'Example',
          tags: [],
          moduleIds: [],
          packageId: 'example-agent',
        },
      ]
    ).find((item) => item.packageId === 'example-agent')!;

    expect(capability.status).toBe('ready');
    expect(capability.operationalReady).toBe(true);
    expect(capability.launchAllowed).toBe(true);
    expect(capability.codexVisibility).toBe('visible');
  });

  it('defers scope readiness to the real domain stage workspace', () => {
    const capabilities = buildCapabilitiesViewModel(
      appStateWithPackageDirectory([
        {
          package_id: 'optional-agent',
          display_name: 'Optional agent',
          installed: true,
          readiness: {
            status: 'activation_required',
            operational_ready: true,
            launch_allowed: true,
            reason: 'package_activation_required',
          },
        },
        {
          package_id: 'blocked-agent',
          display_name: 'Blocked agent',
          installed: true,
          readiness: {
            status: 'activation_required',
            operational_ready: true,
            launch_allowed: true,
            reason: 'scope_materialization_missing',
          },
        },
      ]),
      'en-US'
    );

    expect(capabilities.find((item) => item.packageId === 'optional-agent')?.status).toBe('ready');
    expect(capabilities.find((item) => item.packageId === 'blocked-agent')?.status).toBe('ready');
  });

  it('normalizes generic repair, dependent guard, and closure diagnostics', () => {
    const capability = buildCapabilitiesViewModel(
      {
        agent_packages: {
          directory: {
            entries: [
              {
                package_id: 'example-agent',
                dependency_closure: {
                  transaction_id: 'tx-1',
                  closure_digest: 'sha256:current',
                  last_known_good_transaction_id: 'tx-0',
                  last_known_good_closure_digest: 'sha256:previous',
                },
              },
            ],
          },
          status_index: {
            packages: {
              'example-agent': {
                package_id: 'example-agent',
                status: 'ready',
                operational_ready: false,
                launch_allowed: false,
                launch_blocked_reason: 'required_export_missing',
                allowed_when_blocked: ['status', 'doctor', 'repair'],
                dependency_readiness: {
                  status: 'repair_required',
                  required_count: 1,
                  ready_count: 0,
                  checks: [],
                  closure: {
                    transaction_id: 'tx-1',
                    closure_digest: 'sha256:current',
                    last_known_good_transaction_id: 'tx-0',
                    last_known_good_closure_digest: 'sha256:previous',
                  },
                },
                repair_action: {
                  action_id: 'agent_package_repair',
                  command_ref: 'opl app action execute --action agent_package_repair --payload <json> --json',
                  enabled: true,
                  reason_code: 'required_export_missing',
                },
                dependent_guard: {
                  required_by_package_ids: ['consumer-agent'],
                  disable: { allowed: false, reason_code: 'required_by_installed_package' },
                  uninstall: { allowed: false, reason_code: 'required_by_installed_package' },
                },
              },
            },
          },
        },
      },
      'en-US',
      [
        {
          key: 'example-agent',
          title: 'Example agent',
          description: 'Example',
          tags: [],
          moduleIds: [],
          packageId: 'example-agent',
        },
      ]
    ).find((item) => item.packageId === 'example-agent')!;

    expect(capability.repairAction).toMatchObject({ actionId: 'agent_package_repair', enabled: true });
    expect(capability).toMatchObject({
      launchAllowed: false,
      launchBlockedReason: 'required_export_missing',
      allowedWhenBlocked: ['status', 'doctor', 'repair'],
    });
    expect(capability.dependentGuard).toMatchObject({
      requiredByPackageIds: ['consumer-agent'],
      uninstallAllowed: false,
    });
    expect(capability.dependencyClosure).toEqual({
      transactionId: 'tx-1',
      closureDigest: 'sha256:current',
      lastKnownGoodTransactionId: 'tx-0',
      lastKnownGoodClosureDigest: 'sha256:previous',
    });
  });

  it('deduplicates extra purpose overlays when the package already exists', () => {
    const capabilities = buildCapabilitiesViewModel(
      appStateWithPackageDirectory([{ package_id: 'opl-meta-agent', status: 'ready', installed: true }]),
      'en-US',
      [
        {
          key: 'oma',
          title: 'OPL Meta Agent',
          description: 'Use OMA explicitly.',
          tags: ['OMA', 'Skills', 'Tools'],
          moduleIds: ['opl-meta-agent', 'oma'],
          packageId: 'opl-meta-agent',
        },
      ]
    );

    expect(capabilities.filter((item) => item.key === 'oma')).toHaveLength(1);
  });

  it('projects only actions that satisfy the exact five-field ABI', () => {
    const action = {
      action_id: 'install_from_manifest_url',
      action_ref: 'app_state.actions#install_from_manifest_url',
      payload: { manifest_url_ref: 'opl://agent-package-manifest/example-agent/stable' },
      required_payload_fields: ['manifest_url_ref'],
      confirmation_required: true,
    };
    const [capability] = buildCapabilitiesViewModel(
      appStateWithPackageDirectory([
        {
          package_id: 'example-agent',
          display_name: 'Example agent',
          installability: { status: 'available', installable: true },
          available_actions: [
            action,
            {
              action_id: 'agent_package_install',
              action_ref: 'app_state.actions#agent_package_install',
              payload: { package_id: 'example-agent' },
              required_payload_fields: ['package_id'],
              confirmation_required: false,
            },
            {
              action_id: 'agent_package_activate',
              action_ref: 'app_state.actions#agent_package_activate',
              payload: {},
              required_payload_fields: [],
            },
            {
              action_id: 'agent_package_update',
              action_ref: 'app_state.actions#agent_package_update',
              payload: { package_id: 'example-agent' },
              required_payload_fields: ['package_id'],
              confirmation_required: false,
              locally_inferred: true,
            },
            {
              action_id: 'agent_package_repair',
              action_ref: 'app_state.actions#wrong_action',
              payload: { package_id: 'example-agent' },
              required_payload_fields: ['package_id'],
              confirmation_required: false,
            },
            {
              action_id: 'refresh_registry',
              action_ref: 'app_state.actions#refresh_registry',
              payload: {},
              required_payload_fields: [null],
              confirmation_required: false,
            },
          ],
          recommended_action: 'install_from_manifest_url',
          recommended_action_ref: action,
        },
      ]),
      'en-US'
    );

    expect(capability.installAction).toEqual({
      actionId: 'install_from_manifest_url',
      actionRef: 'app_state.actions#install_from_manifest_url',
      payloadRefsOnlyJson: { manifest_url_ref: 'opl://agent-package-manifest/example-agent/stable' },
      requiredPayloadFields: ['manifest_url_ref'],
      confirmationRequired: true,
    });
    expect(capability.activationAction).toBeNull();
    expect(capability.availableActions.agent_package_update).toBeUndefined();
    expect(capability.availableActions.agent_package_repair).toBeUndefined();
    expect(capability.availableActions.agent_package_install).toBeUndefined();
    expect(capability.availableActions.refresh_registry).toBeUndefined();
    expect(capability.recommendedAction).toEqual(capability.installAction);
  });

  it('does not synthesize package_id into projected action payloads', () => {
    const [capability] = buildCapabilitiesViewModel(
      appStateWithPackageDirectory([
        {
          package_id: 'example-agent',
          available_actions: [
            {
              action_id: 'install_from_manifest_url',
              action_ref: 'app_state.actions#install_from_manifest_url',
              payload: { manifest_url_ref: 'opl://agent-package-manifest/example-agent/stable' },
              required_payload_fields: ['manifest_url_ref'],
              confirmation_required: false,
            },
          ],
        },
      ]),
      'en-US'
    );

    expect(capability.installAction?.payloadRefsOnlyJson).toEqual({
      manifest_url_ref: 'opl://agent-package-manifest/example-agent/stable',
    });
    expect(capability.installAction?.payloadRefsOnlyJson).not.toHaveProperty('package_id');
  });

  it('projects receipt and physical skill diagnostics only from status_index', () => {
    const [capability] = buildCapabilitiesViewModel(
      appStateWithPackageDirectory(
        [
          {
            package_id: 'example-agent',
            package_lock_ref: 'directory-lock-must-not-win',
            physical_surface: { status: 'directory-must-not-win' },
          },
        ],
        [
          {
            package_id: 'example-agent',
            package_lock_ref: 'opl://agent-package-lock/example-agent/1.0.0',
            action_receipt_ref: 'opl://agent-package-action/example-agent/install-1',
            rollback_ref: 'opl://agent-package-rollback/example-agent/install-1',
            physical_surface: {
              status: 'materialized',
              plugin_id: 'example-agent',
              materialized_required_skill_ids: ['example-core', 'example-review'],
              materialized_required_skill_paths: ['/codex/skills/example-core', '/codex/skills/example-review'],
              reload_required: true,
            },
          },
        ]
      ),
      'en-US'
    );

    expect(capability.packageLockRef).toBe('opl://agent-package-lock/example-agent/1.0.0');
    expect(capability.actionReceiptRef).toBe('opl://agent-package-action/example-agent/install-1');
    expect(capability.rollbackRef).toBe('opl://agent-package-rollback/example-agent/install-1');
    expect(capability.physicalSurface).toMatchObject({
      status: 'materialized',
      pluginId: 'example-agent',
      materializedRequiredSkillIds: ['example-core', 'example-review'],
      materializedRequiredSkillPaths: ['/codex/skills/example-core', '/codex/skills/example-review'],
      reloadRequired: true,
    });
  });

  it('requires the recommended action ref to exactly match its available action', () => {
    const availableAction = {
      action_id: 'agent_package_activate',
      action_ref: 'app_state.actions#agent_package_activate',
      payload: { package_id: 'example-agent' },
      required_payload_fields: ['package_id', 'scope', 'target_workspace or target_quest'],
      confirmation_required: false,
    };
    const [capability] = buildCapabilitiesViewModel(
      appStateWithPackageDirectory([
        {
          package_id: 'example-agent',
          installed: true,
          recommended_action: 'agent_package_activate',
          recommended_action_ref: {
            ...availableAction,
            payload: { package_id: 'different-package' },
          },
          available_actions: [availableAction],
        },
      ]),
      'en-US'
    );

    expect(capability.availableActions.agent_package_activate?.payloadRefsOnlyJson).toEqual({
      package_id: 'example-agent',
    });
    expect(capability.activationAction).toBeNull();
    expect(capability.recommendedAction).toBeNull();
  });

  it('keeps directory-owned catalog metadata, readiness, and actions authoritative over status diagnostics', () => {
    const directoryAction = {
      action_id: 'agent_package_update',
      action_ref: 'app_state.actions#agent_package_update',
      payload: { package_id: 'example-agent' },
      required_payload_fields: ['package_id'],
      confirmation_required: false,
    };
    const statusAction = {
      action_id: 'agent_package_uninstall',
      action_ref: 'app_state.actions#agent_package_uninstall',
      payload: { package_id: 'wrong-package' },
      required_payload_fields: ['package_id'],
      confirmation_required: true,
    };
    const [capability] = buildCapabilitiesViewModel(
      appStateWithPackageDirectory(
        [
          {
            package_id: 'example-agent',
            display_name: 'Directory title',
            publisher: 'Directory publisher',
            package_role: 'standard_agent',
            installed: true,
            readiness: {
              status: 'ready',
              operational_ready: true,
              launch_allowed: true,
              reason: 'use_boundary_reconciliation_ready',
            },
            available_actions: [directoryAction],
          },
        ],
        [
          {
            package_id: 'example-agent',
            display_name: 'Status title',
            publisher: 'Status publisher',
            package_role: 'workflow_profile',
            status: 'ready',
            operational_ready: false,
            launch_allowed: false,
            launch_blocked_reason: null,
            allowed_when_blocked: ['status', 'doctor', 'repair'],
            capability_exposure: { status: 'visible', codex_visible: true },
            available_actions: [statusAction],
          },
        ]
      ),
      'en-US'
    );

    expect(capability).toMatchObject({
      title: 'Directory title',
      publisher: 'Directory publisher',
      packageRole: 'standard_agent',
      status: 'ready',
      availabilityStatus: 'ready',
      operationalReady: true,
      launchAllowed: true,
      launchBlockedReason: null,
      codexVisibility: 'visible',
    });
    expect(Object.keys(capability.availableActions)).toEqual(['agent_package_update']);
  });

  it('projects deferred physical exposure as ordinarily available without reporting a failure', () => {
    const [capability] = buildCapabilitiesViewModel(
      appStateWithPackageDirectory([
        {
          package_id: 'example-agent',
          installed: true,
          codex_visible: true,
          readiness: {
            status: 'verification_deferred',
            operational_ready: false,
            launch_allowed: false,
            verification_deferred: true,
            reason: 'live_verification_deferred',
          },
        },
      ]),
      'en-US'
    );

    expect(capability.status).toBe('ready');
    expect(capability.codexVisibility).toBe('visible');
    expect(capability.operationalReady).toBe(false);
    expect(capability.launchAllowed).toBe(false);
    expect(capability.failureReason).toBeNull();
  });

  it('preserves a package status read error as a row failure', () => {
    const [capability] = buildCapabilitiesViewModel(
      appStateWithPackageDirectory([
        {
          package_id: 'example-agent',
          installed: true,
          readiness: {
            status: 'failed',
            operational_ready: false,
            launch_allowed: false,
            verification_deferred: false,
            reason: 'status_read_error',
            status_read_error: { message: 'package status unavailable' },
          },
        },
      ]),
      'en-US'
    );

    expect(capability.status).toBe('repair');
    expect(capability.failureReason).toBe('package status unavailable');
  });

  it('projects canonical producer dependency readiness and exposure state without changing directory actions', () => {
    const preferenceAction = {
      action_id: 'agent_package_preferences_set',
      action_ref: 'app_state.actions#agent_package_preferences_set',
      payload: { package_id: 'example-agent' },
      required_payload_fields: ['package_id', 'exposure_action or shortcut_id'],
      confirmation_required: false,
    };
    const [capability] = buildCapabilitiesViewModel(
      appStateWithPackageDirectory(
        [
          {
            package_id: 'example-agent',
            installed: true,
            available_actions: [preferenceAction],
          },
        ],
        [
          {
            package_id: 'example-agent',
            status: 'ready',
            dependency_readiness: {
              status: 'repair_required',
              required_count: 2,
              ready_count: 1,
              checks: [{ package_id: 'provider', ready: false, failure_reasons: ['required_export_missing'] }],
            },
            capability_exposure: { status: 'disabled' },
          },
        ]
      ),
      'en-US'
    );

    expect(capability.status).toBe('repair');
    expect(capability.dependencyReadiness).toMatchObject({
      status: 'repair_required',
      requiredCount: 2,
      readyCount: 1,
    });
    expect(capability.enabled).toBe(false);
    expect(Object.keys(capability.availableActions)).toEqual(['agent_package_preferences_set']);
  });

  it('prefers canonical dependency readiness over the bounded legacy Framework fallback', () => {
    const [capability] = buildCapabilitiesViewModel(
      appStateWithPackageDirectory(
        [{ package_id: 'example-agent', installed: true }],
        [
          {
            package_id: 'example-agent',
            status: 'ready',
            dependency_readiness: { status: 'ready', required_count: 1, ready_count: 1, checks: [] },
            package_dependency_readiness: {
              status: 'repair_required',
              required_count: 1,
              ready_count: 0,
              checks: [{ package_id: 'stale-provider', ready: false, failure_reasons: ['stale_fallback'] }],
            },
          },
        ]
      ),
      'en-US'
    );

    expect(capability.status).toBe('ready');
    expect(capability.dependencyReadiness).toMatchObject({ status: 'ready', readyCount: 1 });
  });

  it('uses raw package dependency readiness only as a bounded legacy Framework fallback', () => {
    const [capability] = buildCapabilitiesViewModel(
      appStateWithPackageDirectory(
        [{ package_id: 'example-agent', installed: true }],
        [
          {
            package_id: 'example-agent',
            status: 'ready',
            package_dependency_readiness: {
              status: 'repair_required',
              required_count: 1,
              ready_count: 0,
              checks: [{ package_id: 'provider', ready: false, failure_reasons: ['required_export_missing'] }],
            },
          },
        ]
      ),
      'en-US'
    );

    expect(capability.status).toBe('repair');
    expect(capability.dependencyReadiness?.status).toBe('repair_required');
  });

  it('accepts only complete producer activation and dependent-guard projections', () => {
    const [capability] = buildCapabilitiesViewModel(
      appStateWithPackageDirectory(
        [
          {
            package_id: 'example-agent',
            installed: true,
            activation_action: {
              action_id: 'agent_package_activate',
              command_ref: 'directory must not own activation status',
              enabled: true,
              preparation_status: 'ready',
              reason_code: 'wrong_owner',
            },
          },
        ],
        [
          {
            package_id: 'example-agent',
            activation_action: {
              action_id: 'agent_package_activate',
              command_ref: 'opl app action execute --action agent_package_activate --payload <json> --json',
              enabled: true,
              preparation_status: 'prepare_required',
              reason_code: 'scope_reconciliation_required',
            },
            dependent_guard: {
              required_by_package_ids: ['consumer-agent'],
              disable: { allowed: false, reason_code: 'required_by_installed_package' },
              uninstall: { allowed: false, reason_code: 'required_by_installed_package' },
            },
          },
        ]
      ),
      'en-US'
    );

    expect(capability.activationAction).toMatchObject({
      enabled: true,
      preparationStatus: 'prepare_required',
      reasonCode: 'scope_reconciliation_required',
    });
    expect(capability.dependentGuard?.requiredByPackageIds).toEqual(['consumer-agent']);
  });

  it('ignores incomplete producer activation and dependent-guard projections', () => {
    const [capability] = buildCapabilitiesViewModel(
      appStateWithPackageDirectory(
        [{ package_id: 'example-agent', installed: true }],
        [
          {
            package_id: 'example-agent',
            activation_action: {
              action_id: 'agent_package_activate',
              enabled: true,
              preparation_status: 'ready',
              reason_code: 'use_boundary_reconciliation_ready',
            },
            dependent_guard: {
              required_by_package_ids: [],
              disable: { allowed: true, reason_code: null },
            },
          },
        ]
      ),
      'en-US'
    );

    expect(capability.activationAction).toBeNull();
    expect(capability.dependentGuard).toBeNull();
  });

  it.each([
    ['visible', true, false],
    ['hidden', true, true],
    ['enabled', true, false],
    ['disabled', false, true],
  ] as const)('maps capability exposure %s into stable enabled and hidden readback', (status, enabled, hidden) => {
    const [capability] = buildCapabilitiesViewModel(
      appStateWithPackageDirectory(
        [{ package_id: 'example-agent', installed: true }],
        [{ package_id: 'example-agent', capability_exposure: { status } }]
      ),
      'en-US'
    );

    expect(capability.enabled).toBe(enabled);
    expect(capability.hidden).toBe(hidden);
  });

  it('projects workflow, connector, and export action refs without skill bodies or domain action execution', () => {
    const [research] = buildCapabilitiesViewModel(
      appStateWithPackageDirectory(
        [{ package_id: 'med-autoscience', status: 'ready', installed: true, codex_visible: true }],
        [],
        {
          operator: {
            workbench: {
              task_drilldowns: {
                medautoscience: {
                  status: 'blocked',
                  next_owner: 'opl_framework',
                  next_visible_step: 'repair connector',
                  workflow_refs: [
                    {
                      id: 'module-runtime-repair',
                      title: 'Module runtime repair',
                      status: 'available',
                      ref: 'opl://workflow/medautoscience/module-runtime-repair',
                      owner: 'opl_framework',
                      next_action: 'run dry-run first',
                      body: 'must not render',
                    },
                  ],
                  connector_readiness_refs: ['opl://connect/pubmed/readiness', 'opl://fabric/storage/readiness'],
                  gateway_status_ref: 'opl://gateway/status/gflabtoken',
                  environment_ref: {
                    id: 'python-r-quarto',
                    title: 'Python/R/Quarto',
                    ref: 'opl://environment/python-r-quarto',
                    status: 'available',
                  },
                  environment_template_ref: 'opl://environment-template/python-r-quarto',
                  environment_version_ref: 'opl://environment-version/python-r-quarto/2026-07',
                  task_applicability_ref: 'opl://task-applicability/mas',
                  storage_ref: 'opl://storage/workspace-volume/medautoscience',
                  resource_source_refs: ['opl://resource-source/opl-cloud/managed-compute'],
                  resource_receipt_ref: 'receipt://resource/latest',
                  cost_estimate_ref: 'opl://cost-estimate/mas/latest',
                  export_bundle_action_ref: 'opl://app-action/export_reproducibility_bundle',
                  action_receipt: {
                    dry_run_action_ref: 'opl://app-action/task_action_receipt_preview',
                    latest_receipt_ref: 'receipt://export/latest',
                  },
                },
              },
            },
          },
        }
      ),
      'en-US'
    );

    expect(research.workflowRefs).toEqual([
      {
        id: 'module-runtime-repair',
        title: 'Module runtime repair',
        status: 'available',
        ref: 'opl://workflow/medautoscience/module-runtime-repair',
        owner: 'opl_framework',
        nextAction: 'run dry-run first',
      },
    ]);
    expect(research.connectorReadinessRefs).toEqual([
      {
        id: 'readiness',
        title: 'readiness',
        status: 'blocked',
        ref: 'opl://connect/pubmed/readiness',
        owner: 'opl_framework',
        nextAction: 'repair connector',
      },
      {
        id: 'readiness',
        title: 'readiness',
        status: 'blocked',
        ref: 'opl://fabric/storage/readiness',
        owner: 'opl_framework',
        nextAction: 'repair connector',
      },
    ]);
    expect(research.connectorReadinessGroups).toEqual([
      {
        key: 'oplConnect',
        refs: [
          {
            id: 'readiness',
            title: 'readiness',
            status: 'blocked',
            ref: 'opl://connect/pubmed/readiness',
            owner: 'opl_framework',
            nextAction: 'repair connector',
          },
        ],
      },
      {
        key: 'oplFabric',
        refs: [
          {
            id: 'readiness',
            title: 'readiness',
            status: 'blocked',
            ref: 'opl://fabric/storage/readiness',
            owner: 'opl_framework',
            nextAction: 'repair connector',
          },
        ],
      },
    ]);
    expect(research.resourceContextRefs).toEqual([
      {
        id: 'managed-compute',
        title: 'managed-compute',
        status: 'blocked',
        ref: 'opl://resource-source/opl-cloud/managed-compute',
        owner: 'opl_framework',
        nextAction: 'repair connector',
      },
      {
        id: 'gflabtoken',
        title: 'gflabtoken',
        status: 'blocked',
        ref: 'opl://gateway/status/gflabtoken',
        owner: 'opl_framework',
        nextAction: 'repair connector',
      },
      {
        id: 'python-r-quarto',
        title: 'Python/R/Quarto',
        status: 'available',
        ref: 'opl://environment/python-r-quarto',
        owner: 'opl_framework',
        nextAction: 'repair connector',
      },
      {
        id: 'python-r-quarto',
        title: 'python-r-quarto',
        status: 'blocked',
        ref: 'opl://environment-template/python-r-quarto',
        owner: 'opl_framework',
        nextAction: 'repair connector',
      },
      {
        id: '2026-07',
        title: '2026-07',
        status: 'blocked',
        ref: 'opl://environment-version/python-r-quarto/2026-07',
        owner: 'opl_framework',
        nextAction: 'repair connector',
      },
      {
        id: 'mas',
        title: 'mas',
        status: 'blocked',
        ref: 'opl://task-applicability/mas',
        owner: 'opl_framework',
        nextAction: 'repair connector',
      },
      {
        id: 'medautoscience',
        title: 'medautoscience',
        status: 'blocked',
        ref: 'opl://storage/workspace-volume/medautoscience',
        owner: 'opl_framework',
        nextAction: 'repair connector',
      },
      {
        id: 'latest',
        title: 'latest',
        status: 'blocked',
        ref: 'receipt://resource/latest',
        owner: 'opl_framework',
        nextAction: 'repair connector',
      },
      {
        id: 'latest',
        title: 'latest',
        status: 'blocked',
        ref: 'opl://cost-estimate/mas/latest',
        owner: 'opl_framework',
        nextAction: 'repair connector',
      },
    ]);
    expect(research.resourceContextGroups.map((group) => group.key)).toEqual([
      'gateway',
      'environment',
      'storage',
      'resources',
      'receipts',
      'costs',
    ]);
    expect(research.exportBundleAction).toEqual({
      actionId: 'export_reproducibility_bundle',
      ref: 'opl://app-action/export_reproducibility_bundle',
      status: 'blocked',
      dryRunSummary: 'opl://app-action/task_action_receipt_preview',
      receiptSummary: 'receipt://export/latest',
    });
  });
});
