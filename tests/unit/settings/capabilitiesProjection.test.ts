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
      default_visible: false,
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
      default_home_visible: false,
      required_skill_ids: ['opl-meta-agent'],
      optional_skill_ids: [],
    },
  ],
}));

describe('buildCapabilitiesViewModel', () => {
  it('treats dirty developer checkouts as source instead of repair', () => {
    const [research] = buildCapabilitiesViewModel(
      {
        modules: {
          items: [
            {
              module_id: 'medautoscience',
              installed: true,
              health_status: 'dirty',
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
      },
      'en-US'
    );

    expect(research.status).toBe('source');
    expect(research.primaryAction).toBe('maintenance');
    expect(research.version).toBe('4d4dead');
    expect(research.title).toBe('Med Auto Science');
    expect(research.description).toBe('Research');
  });

  it('treats legacy managed-root git update hints as source maintenance, not package updates', () => {
    const capabilities = buildCapabilitiesViewModel(
      {
        modules: {
          items: [
            {
              module_id: 'oplmetaagent',
              installed: true,
              install_origin: 'managed_root',
              health_status: 'ready',
              recommended_action: 'update',
              git: {
                dirty: false,
                sync_status: 'behind',
                short_sha: '712b006',
              },
            },
          ],
        },
      },
      'en-US'
    );
    const oma = capabilities.find((capability) => capability.packageId === 'opl-meta-agent');

    expect(oma?.status).toBe('source');
    expect(oma?.primaryAction).toBe('maintenance');
    expect(oma?.version).toBe('712b006');
  });

  it('prefers package-native projection when app_state exposes opl_agent_package_status', () => {
    const [research] = buildCapabilitiesViewModel(
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
      },
      'en-US'
    );

    expect(research.status).toBe('sync');
    expect(research.primaryAction).toBe('maintenance');
    expect(research.source).toBe('package_projection');
    expect(research.version).toBe('9.9.9');
  });

  it.each(['repair_required', 'blocked'] as const)(
    'does not report ready when dependency readiness is %s',
    (dependencyStatus) => {
      const capability = buildCapabilitiesViewModel(
        {
          agent_packages: {
            status_index: {
              packages: {
                'example-agent': {
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
                    action_id: 'repair_dependency_closure',
                    command_ref: 'opl packages repair example-agent --json',
                    enabled: true,
                    reason_code: 'dependency_closure_not_ready',
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

      expect(capability.status).toBe('repair');
      expect(capability.operationalReady).toBe(false);
      expect(capability.failureReason).toMatch(/required_export_missing|version_incompatible/);
      expect(capability.codexVisibility).toBe('notVisible');
    }
  );

  it('reports ready only when dependency closure and operational readiness are ready', () => {
    const capability = buildCapabilitiesViewModel(
      {
        agent_packages: {
          status_index: {
            packages: {
              'example-agent': {
                package_id: 'example-agent',
                status: 'ready',
                operational_ready: true,
                codex_visible: true,
                dependency_readiness: { status: 'ready', required_count: 1, ready_count: 1, checks: [] },
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

    expect(capability.status).toBe('ready');
    expect(capability.operationalReady).toBe(true);
  });

  it('normalizes generic repair, dependent guard, and closure diagnostics', () => {
    const capability = buildCapabilitiesViewModel(
      {
        agent_packages: {
          directory: {
            installed_packages: [
              {
                package_id: 'example-agent',
                dependency_closure: {
                  transaction_id: 'tx-1',
                  generation_id: 'generation-2',
                  closure_digest: 'sha256:current',
                  last_known_good_generation_id: 'generation-1',
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
                dependency_readiness: { status: 'repair_required', required_count: 1, ready_count: 0, checks: [] },
                repair_action: {
                  action_id: 'repair_dependency_closure',
                  command_ref: 'opl packages repair example-agent --json',
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

    expect(capability.repairAction).toMatchObject({ actionId: 'repair_dependency_closure', enabled: true });
    expect(capability.dependentGuard).toMatchObject({
      requiredByPackageIds: ['consumer-agent'],
      uninstallAllowed: false,
    });
    expect(capability.dependencyClosure).toEqual({
      transactionId: 'tx-1',
      generationId: 'generation-2',
      closureDigest: 'sha256:current',
      lastKnownGoodGenerationId: 'generation-1',
      lastKnownGoodClosureDigest: 'sha256:previous',
    });
  });

  it('deduplicates extra purpose overlays when the package already exists', () => {
    const capabilities = buildCapabilitiesViewModel(
      {
        modules: {
          items: [{ module_id: 'oplmetaagent', status: 'ready' }],
        },
      },
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

  it('projects workflow, connector, and export action refs without skill bodies or domain action execution', () => {
    const [research] = buildCapabilitiesViewModel(
      {
        modules: {
          items: [{ module_id: 'medautoscience', status: 'ready', codex_visible: true }],
        },
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
      },
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
