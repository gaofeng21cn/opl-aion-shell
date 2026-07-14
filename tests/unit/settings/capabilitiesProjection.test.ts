import { describe, expect, it, vi } from 'vitest';
import { buildCapabilitiesViewModel } from '@/renderer/pages/settings/capabilitiesProjection';

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

describe('buildCapabilitiesViewModel', () => {
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
    expect(research.description).toBe('Research');
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
                dependency_readiness: { status: 'repair_required', required_count: 1, ready_count: 0, checks: [] },
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
      action_id: 'agent_package_install',
      action_ref: 'app_state.actions#agent_package_install',
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
          recommended_action: 'agent_package_install',
          recommended_action_ref: action,
        },
      ]),
      'en-US'
    );

    expect(capability.installAction).toEqual({
      actionId: 'agent_package_install',
      actionRef: 'app_state.actions#agent_package_install',
      payloadRefsOnlyJson: { manifest_url_ref: 'opl://agent-package-manifest/example-agent/stable' },
      requiredPayloadFields: ['manifest_url_ref'],
      confirmationRequired: true,
    });
    expect(capability.activationAction).toBeNull();
    expect(capability.availableActions.agent_package_update).toBeUndefined();
    expect(capability.availableActions.agent_package_repair).toBeUndefined();
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
              action_id: 'agent_package_install',
              action_ref: 'app_state.actions#agent_package_install',
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

  it('keeps directory-owned catalog metadata and actions authoritative over status-index overlays', () => {
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
    });
    expect(Object.keys(capability.availableActions)).toEqual(['agent_package_update']);
  });

  it('keeps deferred physical exposure non-runnable without reporting a failure', () => {
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

    expect(capability.status).toBe('verification');
    expect(capability.codexVisibility).toBe('verificationPending');
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
