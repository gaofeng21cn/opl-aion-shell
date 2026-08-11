import { describe, expect, it, vi } from 'vitest';
import {
  buildCapabilitiesViewModel,
  readManagedComputerUse,
  readPackageCapabilityDependencySummaries,
} from '@/renderer/pages/settings/capabilitiesProjection';

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  oplRecord: (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  oplRecordList: (value: unknown) =>
    Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)) : [],
  oplString: (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null),
}));

type PackageFixture = Record<string, unknown>;

describe('readManagedComputerUse', () => {
  it('consumes the Framework companion and action catalog without a Shell provider list', () => {
    const projection = readManagedComputerUse({
      managed_companions: {
        computer_use: {
          provider_id: 'kimi-cu',
          product_name: 'KimiCU',
          version: '0.5.4',
          status: 'permission_required',
          ready: false,
          installed: true,
          registered: true,
          enabled: true,
          permission: 'required',
          bundle: { path: '/Applications/KimiCU.app' },
          available_actions: [
            'settings_request_computer_use_permissions',
            'settings_recheck_computer_use',
            'settings_reinstall_computer_use',
          ],
        },
      },
      actions: [
        { action_id: 'settings_request_computer_use_permissions', confirmation_required: false },
        { action_id: 'settings_recheck_computer_use', confirmation_required: false },
        { action_id: 'settings_reinstall_computer_use', confirmation_required: true, danger_level: 'medium' },
      ],
    });

    expect(projection).toBeNull();

    const arrayProjection = readManagedComputerUse({
      managed_companions: [
        {
          surface_kind: 'opl_managed_computer_use_projection',
          provider_id: 'kimi-cu',
          product_name: 'KimiCU',
          version: '0.5.4',
          status: 'permission_required',
          ready: false,
          installed: true,
          registered: true,
          enabled: true,
          permission: 'required',
          bundle: { path: '/Applications/KimiCU.app' },
          available_actions: [
            'settings_request_computer_use_permissions',
            'settings_recheck_computer_use',
            'settings_repair_computer_use',
            'settings_reinstall_computer_use',
            'settings_unknown_computer_use',
          ],
        },
      ],
      actions: [
        {
          action_id: 'settings_request_computer_use_permissions',
          surface: 'opl app action execute',
          submit_via: 'opl app action execute',
          payload_fields: [],
          route_requires_domain_or_app_payload: false,
          can_submit_to_safe_action_shell: true,
          confirmation_required: false,
        },
        {
          action_id: 'settings_recheck_computer_use',
          surface: 'opl app action execute',
          submit_via: 'opl app action execute',
          payload_fields: [],
          route_requires_domain_or_app_payload: false,
          can_submit_to_safe_action_shell: true,
          confirmation_required: false,
        },
        {
          action_id: 'settings_repair_computer_use',
          surface: 'opl app action execute',
          submit_via: 'opl app action execute',
          payload_fields: [],
          route_requires_domain_or_app_payload: false,
          can_submit_to_safe_action_shell: true,
          confirmation_required: false,
          danger_level: 'low',
        },
        {
          action_id: 'settings_reinstall_computer_use',
          surface: 'opl app action execute',
          submit_via: 'opl app action execute',
          payload_fields: [],
          route_requires_domain_or_app_payload: false,
          can_submit_to_safe_action_shell: true,
          confirmation_required: true,
          danger_level: 'medium',
        },
        {
          action_id: 'settings_unknown_computer_use',
          surface: 'opl app action execute',
          submit_via: 'opl app action execute',
          payload_fields: [],
          route_requires_domain_or_app_payload: false,
          can_submit_to_safe_action_shell: true,
          confirmation_required: false,
        },
      ],
    });

    expect(arrayProjection).toMatchObject({
      providerId: 'kimi-cu',
      productName: 'KimiCU',
      version: '0.5.4',
      status: 'permission_required',
      permission: 'required',
    });
    expect(arrayProjection?.actions).toEqual([
      { actionId: 'settings_request_computer_use_permissions', confirmationRequired: false, dangerLevel: null },
      { actionId: 'settings_recheck_computer_use', confirmationRequired: false, dangerLevel: null },
      { actionId: 'settings_repair_computer_use', confirmationRequired: false, dangerLevel: 'low' },
      { actionId: 'settings_reinstall_computer_use', confirmationRequired: true, dangerLevel: 'medium' },
    ]);
  });

  it('does not invent a managed provider when Framework has not projected one', () => {
    expect(readManagedComputerUse({ actions: [] })).toBeNull();
  });
});

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

describe('buildCapabilitiesViewModel', () => {
  it('uses owner-projected localized directory metadata for every package', () => {
    const localizedMetadata: Record<string, [string, string]> = {
      mas: ['医学科研智能体', '用于科研选题、文献分析、数据分析、论文写作、审稿、返修和投稿。'],
      mag: ['医学基金智能体', '用于基金选题、标书与申请书撰写、预算说明和评审回复。'],
      rca: ['演示与视觉智能体', '用于制作演示文稿、汇报材料、图表和其他专业视觉交付物。'],
      oma: ['元智能体', '用于创建、接管、检查和改进 OPL 专业智能体。'],
      obf: ['写书智能体', '用于书稿规划、章节写作、插图表格、排版、审校和导出。'],
      'mas-scholar-skills': ['MAS 学术技能', '供医学科研智能体使用的可复用医学科研能力。'],
      'opl-flow': ['OPL Flow', 'OPL 推荐工作流配置与受管 Codex 策略。'],
    };
    const capabilities = buildCapabilitiesViewModel(
      appStateWithPackageDirectory(
        Object.entries(localizedMetadata).map(([packageId, [displayName, description]]) => ({
          package_id: packageId,
          display_name: `Runtime ${packageId}`,
          description: `Runtime description for ${packageId}`,
          display_name_i18n: { 'zh-CN': displayName, 'en-US': `Runtime ${packageId}` },
          description_i18n: { 'zh-CN': description, 'en-US': `Runtime description for ${packageId}` },
          installed: true,
        }))
      ),
      'zh-CN'
    );
    const localizedByPackageId = new Map(
      capabilities.map((capability) => [capability.packageId, [capability.title, capability.description]])
    );

    expect(localizedByPackageId.get('mas')).toEqual([
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
      appStateWithPackageDirectory(
        [
          {
            package_id: 'mas',
            domain_id: 'med-autoscience',
            display_name: 'Med Auto Science',
            description:
              'For research planning, literature review, data analysis, manuscript writing, peer review, revision, and submission.',
            installed: true,
          },
        ],
        [],
        {
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
        }
      ),
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
        {
          package_id: 'vendor.tool',
          display_name: 'Vendor Tool',
          home_shortcuts: [
            {
              shortcut_id: 'vendor-tool',
              label_i18n: { 'en-US': 'Vendor Tool' },
              default_visible: false,
              user_configurable: true,
              route: {
                route_kind: 'agent_package_shortcut',
                executor: 'codex_cli',
                codex_visible_entry: 'vendor-tool',
              },
            },
          ],
        },
        { package_id: 'vendortool', display_name: 'VendorTool' },
      ]),
      'en-US'
    );

    expect(capabilities.map((item) => item.packageId)).toEqual(['vendor.tool', 'vendortool']);
    expect(capabilities[0]).toMatchObject({ key: 'vendor.tool', userConfigurable: true, defaultHomeVisible: false });
    expect(capabilities[1]).toMatchObject({ key: 'vendortool', userConfigurable: false, defaultHomeVisible: null });
    expect(new Set(capabilities.map((item) => item.key)).size).toBe(2);
  });

  it('keeps an unknown package visible without Profile membership or alias joins', () => {
    const [capability] = buildCapabilitiesViewModel(
      appStateWithPackageDirectory(
        [
          {
            package_id: 'synthetic-lab.agent',
            display_name: 'Synthetic Lab Agent',
            description: 'Directory-owned description',
            package_role: 'standard_agent',
            tags: ['synthetic'],
            installed: true,
          },
        ],
        [
          { package_id: 'syntheticlabagent', status: 'repair_required', installed_version: 'wrong' },
          { package_id: 'synthetic-lab.agent', status: 'ready', installed_version: '1.0.0' },
        ],
        {
          runtime_source_carriers: {
            items: [
              { package_id: 'syntheticlabagent', source_origin: 'wrong_alias_source' },
              { package_id: 'synthetic-lab.agent', source_origin: 'owner_projected_source' },
            ],
          },
          operator: {
            workbench: {
              task_drilldowns: {
                alias: { domain_id: 'syntheticlabagent', workflow_refs: ['opl://workflow/wrong-alias'] },
                exact: { domain_id: 'synthetic-lab.agent', workflow_refs: ['opl://workflow/exact-package'] },
              },
            },
          },
        }
      ),
      'en-US'
    );

    expect(capability).toMatchObject({
      key: 'synthetic-lab.agent',
      packageId: 'synthetic-lab.agent',
      packageRole: 'standard_agent',
      title: 'Synthetic Lab Agent',
      description: 'Directory-owned description',
      actualSource: 'owner_projected_source',
      installedVersion: null,
      version: '1.0.0',
      tags: ['synthetic', 'standard_agent'],
    });
    expect(capability.workflowRefs.map((ref) => ref.ref)).toEqual(['opl://workflow/exact-package']);
  });

  it('joins a runtime carrier by its exact projected module id', () => {
    const [capability] = buildCapabilitiesViewModel(
      appStateWithPackageDirectory(
        [{ package_id: 'synthetic-lab.agent', module_id: 'synthetic-runtime', installed: true }],
        [],
        {
          runtime_source_carriers: {
            items: [
              {
                package_id: 'different-package',
                carrier_id: 'different-carrier',
                module_id: 'synthetic-runtime',
                source_origin: 'owner_projected_module_source',
              },
            ],
          },
        }
      ),
      'en-US'
    );

    expect(capability.actualSource).toBe('owner_projected_module_source');
  });

  it('applies first-party presentation only to the exact directory package id', () => {
    const [capability] = buildCapabilitiesViewModel(
      appStateWithPackageDirectory([
        {
          package_id: 'med-autoscience',
          display_name: 'Directory Med Auto Science',
          description: 'Directory description',
        },
      ]),
      'zh-CN'
    );

    expect(capability).toMatchObject({
      key: 'med-autoscience',
      packageId: 'med-autoscience',
      title: 'Directory Med Auto Science',
      description: 'Directory description',
    });
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

  it('normalizes generic repair and dependent guard diagnostics', () => {
    const capability = buildCapabilitiesViewModel(
      {
        agent_packages: {
          directory: {
            entries: [
              {
                package_id: 'example-agent',
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
  });

  it('deduplicates only exact extra purpose package ids when the package already exists', () => {
    const capabilities = buildCapabilitiesViewModel(
      appStateWithPackageDirectory([{ package_id: 'opl-meta-agent', status: 'ready', installed: true }]),
      'en-US',
      [
        {
          key: 'opl-meta-agent',
          title: 'OPL Meta Agent',
          description: 'Use OMA explicitly.',
          tags: ['OMA', 'Skills', 'Tools'],
          moduleIds: ['opl-meta-agent', 'oma'],
          packageId: 'opl-meta-agent',
        },
      ]
    );

    expect(capabilities.filter((item) => item.key === 'opl-meta-agent')).toHaveLength(1);
    expect(capabilities[0].moduleIds).toEqual(['opl-meta-agent']);
  });

  it('projects only actions that satisfy the exact five-field ABI', () => {
    const action = {
      action_id: 'install_from_manifest_url',
      action_ref: 'app_state.actions#install_from_manifest_url',
      payload: { manifest_url_ref: 'opl://agent-package-manifest/example-agent/stable' },
      required_payload_fields: ['manifest_url_ref'],
      confirmation_required: true,
      semantic: 'install',
      surface: 'settings',
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
      semantic: 'install',
      surface: 'settings',
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
              semantic: 'install',
              surface: 'settings',
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

  it('requires the recommended action ref to exactly match its available action', () => {
    const availableAction = {
      action_id: 'agent_package_activate',
      action_ref: 'app_state.actions#agent_package_activate',
      payload: { package_id: 'example-agent' },
      required_payload_fields: ['package_id', 'scope', 'target_workspace or target_quest'],
      confirmation_required: false,
      semantic: 'activate',
      surface: 'workspace',
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
      semantic: 'update',
      surface: 'settings',
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
      semantic: 'preferences',
      surface: 'settings',
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
              action_id: 'future_package_activate',
              command_ref: 'opl app action execute --action future_package_activate --payload <json> --json',
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
      actionId: 'future_package_activate',
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
        [{ package_id: 'mas', domain_id: 'med-autoscience', status: 'ready', installed: true, codex_visible: true }],
        [],
        {
          operator: {
            workbench: {
              task_drilldowns: {
                medautoscience: {
                  domain_id: 'med-autoscience',
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

describe('Framework package semantic projections', () => {
  it('selects a settings action by producer semantic without a fixed action id', () => {
    const actionId = 'future_package_install';
    const projectedAction = {
      action_id: actionId,
      action_ref: `app_state.actions#${actionId}`,
      payload: { package_id: 'future-package' },
      required_payload_fields: ['package_id'],
      confirmation_required: false,
      semantic: 'install',
      surface: 'settings',
    };
    const [capability] = buildCapabilitiesViewModel(
      appStateWithPackageDirectory([
        {
          package_id: 'future-package',
          installed: false,
          recommended_action: actionId,
          recommended_action_ref: projectedAction,
          available_actions: [projectedAction],
        },
      ]),
      'en-US'
    );

    expect(capability.installAction).toMatchObject({
      actionId,
      semantic: 'install',
      surface: 'settings',
    });
    expect(capability.recommendedAction?.actionId).toBe(actionId);
  });

  it('reads one descriptor-owned Package role summary and preserves its dynamic route', () => {
    const summaries = readPackageCapabilityDependencySummaries(
      appStateWithPackageDirectory(
        [
          {
            package_id: 'future-workflow-profile',
            package_role: 'workflow_profile',
            capability_dependency_summary: [
              {
                id: 'future-net-skill',
                kind: 'codex_skill',
                relationship: 'required',
                activation: 'task_routed',
                presence: 'missing',
                callability: 'unavailable',
                user_outcome: 'required_for_workflow',
                route: {
                  action_ref: 'app_state.actions#future_flow_repair',
                  payload: { package_id: 'future-workflow-profile' },
                  detail_surface: 'opl packages status --package-id future-workflow-profile --json',
                },
              },
            ],
          },
          {
            package_id: 'opl-flow',
            package_role: 'capability_package',
            capability_dependency_summary: [{ id: 'wrong-role-summary' }],
          },
        ],
        [],
        {
          managed_update: {
            flow_dependencies: [{ id: 'legacy-only-skill' }],
          },
        }
      ),
      'workflow_profile'
    );

    expect(summaries).toEqual([
      {
        id: 'future-net-skill',
        kind: 'codex_skill',
        relationship: 'required',
        activation: 'task_routed',
        presence: 'missing',
        callability: 'unavailable',
        userOutcome: 'required_for_workflow',
        route: {
          actionId: 'future_flow_repair',
          payload: { package_id: 'future-workflow-profile' },
        },
      },
    ]);

    expect(
      readPackageCapabilityDependencySummaries(
        appStateWithPackageDirectory([
          { package_id: 'one', package_role: 'workflow_profile', capability_dependency_summary: [] },
          { package_id: 'two', package_role: 'workflow_profile', capability_dependency_summary: [] },
        ]),
        'workflow_profile'
      )
    ).toEqual([]);
  });
});
