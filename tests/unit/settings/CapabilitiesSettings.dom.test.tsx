import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import CapabilitiesSettings, {
  AgentPackagesSettingsContent,
  CapabilitiesSettingsContent,
  type CapabilitiesTab,
} from '@/renderer/pages/settings/CapabilitiesSettings';
import { resolveOplHomeAssistants } from '@/renderer/pages/guid/utils/oplHomeAssistants';
import {
  getOplHomeShortcutPreferences,
  replaceOplHomeShortcutPreferences,
  setOplHomeShortcutHidden,
} from '@/renderer/pages/guid/utils/oplHomeShortcutPreferences';
import { LayoutContext } from '@/renderer/hooks/context/LayoutContext';

const appStateOverrides = vi.hoisted(() => ({
  developerMode: undefined as Record<string, unknown> | undefined,
  appState: undefined as Record<string, unknown> | undefined,
  loading: false,
  refreshing: false,
  error: null as string | null,
  developerConfirmationRequired: false,
}));

const translationMocks = vi.hoisted(() => ({ language: 'en-US' }));

const bridgeMocks = vi.hoisted(() => ({
  executeActionInvoke: vi.fn(),
  applyOfficialProfileInvoke: vi.fn(),
  loadAppState: vi.fn(),
  modalConfirm: vi.fn((config: { onOk?: () => unknown }) => config.onOk?.()),
  messageSuccess: vi.fn(),
  messageError: vi.fn(),
  currentAppState: {} as Record<string, unknown>,
}));

const actionFixture = (
  actionId: string,
  payload: Record<string, unknown>,
  requiredPayloadFields: string[],
  confirmationRequired = false
) => ({
  action_id: actionId,
  action_ref: `app_state.actions#${actionId}`,
  payload,
  required_payload_fields: requiredPayloadFields,
  confirmation_required: confirmationRequired,
});

const appStateWithDirectory = (
  entries: Record<string, unknown>[],
  options: {
    workspaceRootPath?: string | null;
    directoryStatus?: string;
    directoryStatusReadError?: unknown;
    statusEntries?: Record<string, unknown>[];
    homeShortcutPreferences?: Record<string, unknown>[];
  } = {}
) => ({
  paths: options.workspaceRootPath === null ? {} : { workspace_root_path: options.workspaceRootPath ?? '/workspace' },
  agent_packages: {
    directory: {
      status: options.directoryStatus ?? 'available',
      status_read_error: options.directoryStatusReadError ?? null,
      entries,
    },
    status_index: {
      packages: options.statusEntries ?? [],
      home_shortcut_preferences: options.homeShortcutPreferences ?? [],
    },
  },
});

const shortcutPackageById: Record<string, string> = {
  research: 'mas',
  grant: 'mag',
  ppt: 'rca',
  book: 'obf',
  oma: 'oma',
};

const homeShortcutPreference = (
  shortcutId: string,
  visible: boolean,
  sortOrder: number,
  source: 'default' | 'user_preference' = 'default'
) => ({
  package_id: shortcutPackageById[shortcutId] ?? shortcutId,
  shortcut_id: shortcutId,
  visible,
  sort_order: sortOrder,
  source,
  installed: true,
});

const defaultHomeShortcutPreferences = () =>
  ['research', 'grant', 'ppt', 'book', 'oma'].map((shortcutId, sortOrder) =>
    homeShortcutPreference(shortcutId, true, sortOrder)
  );

const homeShortcutDirectoryEntries = () =>
  Object.entries(shortcutPackageById).map(([shortcutId, packageId]) => ({
    package_id: packageId,
    display_name: shortcutId,
    package_role: 'standard_agent',
    installed: true,
  }));

const homeShortcutAppState = (preferences = defaultHomeShortcutPreferences()) => ({
  agent_packages: {
    directory: { entries: homeShortcutDirectoryEntries() },
    status_index: { home_shortcut_preferences: preferences },
  },
});

const homeShortcutReadback = (shortcutId: string, visible: boolean, sortOrder: number) => ({
  app_state: {
    agent_packages: {
      directory: {
        entries: [
          {
            package_id: shortcutPackageById[shortcutId] ?? shortcutId,
            display_name: shortcutPackageById[shortcutId] ?? shortcutId,
            package_role: 'standard_agent',
            installed: true,
          },
        ],
      },
      status_index: {
        home_shortcut_preferences: [homeShortcutPreference(shortcutId, visible, sortOrder, 'user_preference')],
      },
    },
  },
});

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      executeAction: { invoke: bridgeMocks.executeActionInvoke },
      applyOfficialProfile: { invoke: bridgeMocks.applyOfficialProfileInvoke },
    },
  },
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      success: bridgeMocks.messageSuccess,
      error: bridgeMocks.messageError,
    },
    Modal: {
      ...actual.Modal,
      confirm: bridgeMocks.modalConfirm,
    },
  };
});

vi.mock('@/renderer/pages/settings/SkillsHubSettings', () => ({
  default: ({
    flowManagedSkillIds = [],
    flowManagedSkillDependencies = [],
    onSyncFlow,
  }: {
    flowManagedSkillIds?: string[];
    flowManagedSkillDependencies?: Array<{ id: string; installed: boolean }>;
    onSyncFlow?: () => void;
  }) => (
    <div
      data-testid='skills-detail'
      data-flow-skills={flowManagedSkillIds.join(',')}
      data-flow-skill-statuses={flowManagedSkillDependencies
        .map((dependency) => `${dependency.id}:${dependency.installed}`)
        .join(',')}
    >
      Skills detail
      {onSyncFlow && (
        <button data-testid='settings-capabilities-primary-action' onClick={onSyncFlow}>
          Sync Flow
        </button>
      )}
    </div>
  ),
}));

vi.mock('@/renderer/services/managedUpdateMaintenance', () => ({
  useManagedUpdateMaintenance: () => ({
    result: {
      parsed: {
        managed_update: {
          components: [
            {
              component_id: 'opl_base',
              current: {
                dependency_catalog: {
                  lifecycle_owner: 'opl_base',
                  flow_dependencies: [
                    {
                      dependency_id: 'opl-flow',
                      dependency_kind: 'codex_skill',
                      installed: true,
                      currentness: 'current',
                      ownership: 'opl_flow_managed',
                      update_mode: 'silent_managed',
                    },
                    {
                      dependency_id: 'officecli-pptx',
                      dependency_kind: 'codex_skill',
                      installed: true,
                      currentness: 'current',
                      ownership: 'opl_flow_managed',
                      update_mode: 'silent_managed',
                    },
                    {
                      dependency_id: 'officecli-docx',
                      dependency_kind: 'codex_skill',
                      installed: true,
                      currentness: 'current',
                      ownership: 'opl_flow_managed',
                      update_mode: 'silent_managed',
                    },
                  ],
                  dependencies: [],
                },
              },
            },
          ],
        },
      },
    },
  }),
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/ToolsModalContent', () => ({
  default: () => <div data-testid='tools-detail'>Tools detail</div>,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/SystemModalContent/VoiceInputSection', () => ({
  default: () => <div data-testid='voice-input-detail'>Voice input detail</div>,
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => {
  const packageAction = (
    actionId: string,
    payload: Record<string, unknown>,
    requiredPayloadFields: string[],
    confirmationRequired = false
  ) => ({
    action_id: actionId,
    action_ref: `app_state.actions#${actionId}`,
    payload,
    required_payload_fields: requiredPayloadFields,
    confirmation_required: confirmationRequired,
  });
  const preferenceAction = (packageId: string) =>
    packageAction('agent_package_preferences_set', { package_id: packageId }, [
      'package_id',
      'exposure_action or shortcut_id',
    ]);
  return {
    oplRecord: (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
    oplRecordList: (value: unknown) =>
      Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)) : [],
    oplString: (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null),
    getAppState: (value: unknown) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
      const record = value as Record<string, unknown>;
      const appState = record.app_state;
      return appState && typeof appState === 'object' && !Array.isArray(appState) ? appState : record;
    },
    useOplAppState: () => {
      const appState = appStateOverrides.appState ?? {
        actions: [
          {
            action_id: 'install_from_manifest_url',
            payload_fields: ['manifest_url', 'trust_tier'],
            dry_run_supported: true,
            confirmation_required: true,
          },
        ],
        settings_control_center: {
          configuration_catalog: {
            items: [
              {
                configuration_id: 'developer_supervisor',
                current_value: {
                  status: 'ready',
                  effective_state: 'active_direct',
                  mode: 'developer_apply_safe',
                },
                action_id: 'developer_supervisor',
                payload_fields: [
                  'developerSupervisorEnabled',
                  'developerSupervisorMode',
                  'developerSupervisorModuleId',
                  'developerSupervisorModuleSource',
                ],
                confirmation_required: appStateOverrides.developerConfirmationRequired,
                verify_action_id: 'developer_supervisor_refresh',
                verify_ref: 'app_state.actions#developer_supervisor_refresh',
              },
            ],
          },
        },
        paths: { workspace_root_path: '/Users/test/OPL Workspace' },
        developer_mode: appStateOverrides.developerMode ?? {
          enabled: 'auto',
          mode: 'developer_apply_safe',
          effective_state: 'active_direct',
          inactive_reason: null,
          config_source: 'default',
          developer_workspace: {
            selected_path: '/Users/test/workspace',
            source: 'state',
            exists: true,
          },
          github_identity: { status: 'ready', login: 'gaofeng21cn' },
          repo_authority: {
            status: 'ready',
            direct_write_repo_count: 7,
            pr_route_repo_count: 0,
            required_repo_count: 7,
          },
          repository_maintenance_protection: {
            status: 'ready',
            dirty_worktree: { requires_isolated_worktree: true },
            branch: { direct_push_to_protected_branch: false },
          },
        },
        agent_packages: {
          directory: {
            status: 'available',
            entries: [
              {
                package_id: 'mas',
                domain_id: 'medautoscience',
                package_role: 'standard_agent',
                installed: true,
                status: 'dirty',
                installed_version: '1.2.3',
                readiness: { status: 'ready', operational_ready: true, launch_allowed: true },
                source_explanation: {
                  kind: 'first_party_release_catalog',
                  source: 'first_party',
                  summary: 'First-party release catalog',
                },
                available_actions: [
                  preferenceAction('mas'),
                  packageAction('agent_package_update', { package_id: 'mas' }, ['package_id', 'manifest_url']),
                ],
              },
              {
                package_id: 'mag',
                package_role: 'standard_agent',
                installed: true,
                status: 'update_available',
                manifest_url: 'https://example.test/mag.json',
                readiness: { status: 'update_available', operational_ready: true, launch_allowed: true },
                source_explanation: {
                  kind: 'agent_package_registry_cache',
                  source: 'third_party',
                  summary: 'Public registry',
                },
                available_actions: [
                  preferenceAction('mag'),
                  packageAction(
                    'agent_package_update',
                    { package_id: 'mag', manifest_url: 'https://example.test/mag.json' },
                    ['package_id', 'manifest_url']
                  ),
                  packageAction('agent_package_repair', { package_id: 'mag' }, ['package_id']),
                  packageAction('agent_package_uninstall', { package_id: 'mag' }, ['package_id'], true),
                ],
              },
              {
                package_id: 'rca',
                package_role: 'standard_agent',
                installed: true,
                status: 'failed_with_repair',
                failure_reason: 'receipt missing',
                source_explanation: {
                  kind: 'agent_package_registry_cache',
                  source: 'third_party',
                  summary: 'Public registry',
                },
                available_actions: [preferenceAction('rca')],
              },
              {
                package_id: 'obf',
                package_role: 'standard_agent',
                installed: true,
                status: 'ready',
                codex_visible: true,
                readiness: { status: 'ready', operational_ready: true, launch_allowed: true },
                source_explanation: {
                  kind: 'first_party_release_catalog',
                  source: 'first_party',
                  summary: 'First-party release catalog',
                },
                available_actions: [preferenceAction('obf')],
              },
              {
                package_id: 'oma',
                package_role: 'standard_agent',
                installed: true,
                status: 'ready',
                available_actions: [preferenceAction('oma')],
              },
              {
                package_id: 'example-agent',
                package_role: 'framework_capability_package',
                installed: true,
                status: 'ready',
                source_explanation: {
                  kind: 'agent_package_registry_cache',
                  source: 'manifest_url',
                  summary: 'Public registry',
                },
                available_actions: [
                  preferenceAction('example-agent'),
                  packageAction('agent_package_repair', { package_id: 'example-agent' }, ['package_id']),
                  packageAction('agent_package_uninstall', { package_id: 'example-agent' }, ['package_id'], true),
                ],
              },
            ],
          },
          status_index: {
            home_shortcut_preferences: defaultHomeShortcutPreferences(),
            packages: [
              {
                package_id: 'mas',
                capability_exposure: {
                  status: 'visible',
                  last_sync_at: '2026-06-30T01:00:00Z',
                },
                source_kind: 'registry',
                package_lock_ref: 'opl://agent-package-lock/mas/0.1.0a4',
                action_receipt_ref: 'opl://agent-package-action/mas/install-1',
                rollback_ref: 'opl://agent-package-rollback/mas/install-1',
                physical_surface: {
                  status: 'materialized',
                  plugin_id: 'mas',
                  marketplace_id: 'opl-agent-mas-local',
                  codex_plugin_cache_path: '/tmp/codex/plugins/cache/opl-agent-mas-local/mas/0.1.0a4',
                  marketplace_path:
                    '/tmp/opl/codex-plugin-marketplaces/opl-agent-mas-local/.agents/plugins/marketplace.json',
                  codex_config_path: '/tmp/codex/config.toml',
                  materialized_required_skill_ids: ['med-autoscience', 'medical-research-lit'],
                  materialized_required_skill_paths: [
                    '/tmp/codex/skills/med-autoscience',
                    '/tmp/codex/skills/medical-research-lit',
                  ],
                  reload_required: true,
                },
              },
              {
                package_id: 'mag',
                capability_exposure: { status: 'disabled' },
                package_lock_ref: 'opl://agent-package-lock/mag/0.1.0',
                repair_action: {
                  action_id: 'agent_package_repair',
                  command_ref: 'opl app action execute --action agent_package_repair --payload <json> --json',
                  enabled: true,
                  reason_code: 'repair_available',
                },
                dependent_guard: {
                  required_by_package_ids: [],
                  disable: { allowed: true, reason_code: null },
                  uninstall: { allowed: true, reason_code: null },
                },
              },
              {
                package_id: 'obf',
                capability_exposure: { status: 'visible' },
              },
              {
                package_id: 'example-agent',
                status: 'ready',
                capability_exposure: { status: 'visible' },
                package_lock_ref: 'opl://agent-package-lock/example-agent/1.0.0',
                operational_ready: false,
                launch_allowed: false,
                launch_blocked_reason: 'required_export_missing',
                allowed_when_blocked: ['status', 'doctor', 'repair'],
                dependency_readiness: {
                  status: 'repair_required',
                  required_count: 1,
                  ready_count: 0,
                  checks: [
                    { package_id: 'example-provider', ready: false, failure_reasons: ['required_export_missing'] },
                  ],
                  closure: {
                    transaction_id: 'tx-example-1',
                    closure_digest: 'sha256:example-current',
                    last_known_good_transaction_id: 'tx-example-0',
                    last_known_good_closure_digest: 'sha256:example-previous',
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
            ],
          },
        },
        runtime_source_carriers: {
          items: [
            {
              package_id: 'mas',
              carrier_id: 'medautoscience',
              source_policy: {
                effective_install_update_source: 'git_checkout',
                configured_by: 'developer_mode',
                source_preference: 'auto',
                developer_checkout_path: '/Users/test/workspace/med-autoscience',
              },
              source_origin: 'sibling_workspace',
              source_path: '/Users/test/workspace/med-autoscience',
              managed_source_path: '/Users/test/Library/Application Support/OPL/state/modules/med-autoscience',
              git: {
                dirty: true,
                sync_status: 'behind',
                short_sha: '1a2b3c4',
              },
            },
            {
              package_id: 'obf',
              carrier_id: 'oplbookforge',
              source_origin: 'sibling_workspace',
              source_policy: {
                effective_install_update_source: 'git_checkout',
                configured_by: 'developer_mode',
              },
              git: { sync_status: 'behind', dirty: false },
            },
            {
              package_id: 'oma',
              carrier_id: 'oplmetaagent',
              source_origin: 'sibling_workspace',
              source_policy: {
                effective_install_update_source: 'git_checkout',
                configured_by: 'developer_mode',
              },
              git: { sync_status: 'behind', dirty: false },
            },
          ],
        },
        operator: {
          workbench: {
            task_drilldowns: {
              medautoscience: {
                package_id: 'mas',
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
                  },
                ],
                candidate_reports: [
                  {
                    id: 'openscience-artifact-graph',
                    title: 'OpenScience artifact graph review',
                    status: 'candidate_report_ready',
                    ref: 'candidate://openscience/artifact-graph',
                    owner: 'opl_ledger',
                    next_action: 'review report before enabling any skill',
                    candidate_purpose: 'Review OpenScience artifact graph before enabling any skill.',
                    report_ref: 'report://openscience/artifact-graph',
                    decision_status: 'review_pending',
                    decision_actions: ['review', 'needs_changes', 'continue_in_conversation'],
                    body: 'must not render',
                  },
                ],
                connector_readiness_refs: [
                  'opl://connect/pubmed/readiness',
                  'opl://connector/generic/readiness',
                  {
                    id: 'fabric-storage',
                    title: 'Fabric storage readiness',
                    ref: 'opl://fabric/storage/readiness',
                    status: 'refs_only',
                  },
                ],
                gateway_status_ref: 'opl://gateway/status/gflabtoken',
                environment_ref: 'opl://environment/python-r-quarto',
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
              medautogrant: {
                package_id: 'mag',
                status: 'ready',
                next_owner: 'grant_owner',
                next_visible_step: 'review reusable grant workflow first',
                workflow_refs: [
                  {
                    id: 'grant-workflow',
                    title: 'Grant workflow candidate',
                    status: 'refs_available',
                    ref: 'opl://workflow/medautogrant/grant-draft',
                  },
                ],
              },
            },
          },
        },
      };
      bridgeMocks.currentAppState = appState;
      return {
        appState,
        loading: appStateOverrides.loading,
        refreshing: appStateOverrides.refreshing,
        error: appStateOverrides.error,
        load: bridgeMocks.loadAppState,
      };
    },
  };
});

vi.mock('@/common/config/oplProductProfile', () => {
  const homeAgentShortcuts = [
    {
      shortcut_id: 'research',
      package_id: 'mas',
      primary_label: 'Research',
      user_configurable: true,
      default_visible: true,
    },
    {
      shortcut_id: 'grant',
      package_id: 'mag',
      primary_label: 'Grant Writing',
      user_configurable: true,
      default_visible: true,
    },
    {
      shortcut_id: 'ppt',
      package_id: 'rca',
      primary_label: 'Presentations',
      user_configurable: true,
      default_visible: true,
    },
    {
      shortcut_id: 'book',
      package_id: 'obf',
      primary_label: 'Writing books',
      user_configurable: true,
      default_visible: true,
    },
    {
      shortcut_id: 'oma',
      package_id: 'oma',
      primary_label: 'Meta agent',
      user_configurable: true,
      default_visible: true,
    },
  ];
  const professionalAgentPackages = [
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
      package_id: 'med-autogrant',
      display_name: 'Med Auto Grant',
      short_name: 'MAG',
      codex_visible_entry: 'mag',
      default_home_visible: true,
      required_skill_ids: ['mag'],
      optional_skill_ids: [],
    },
    {
      package_id: 'redcube-ai',
      display_name: 'RedCube AI',
      short_name: 'RCA',
      codex_visible_entry: 'rca',
      default_home_visible: true,
      required_skill_ids: ['rca'],
      optional_skill_ids: [],
    },
    {
      package_id: 'opl-bookforge',
      display_name: 'OPL Book Forge',
      short_name: 'OBF',
      codex_visible_entry: 'opl-bookforge',
      default_home_visible: true,
      required_skill_ids: ['opl-bookforge'],
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
    {
      package_id: 'example-agent',
      display_name: 'Example Agent',
      short_name: 'EXAMPLE',
      codex_visible_entry: 'example-agent',
      default_home_visible: false,
      required_skill_ids: [],
      optional_skill_ids: [],
    },
  ];
  const firstPartyPackagePresentations = [
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
  ];
  return {
    canonicalizeOplProfessionalAgentId: (id: string) => {
      const normalized = id.replace(/[^a-z0-9]/gi, '').toLowerCase();
      const aliases: Record<string, string> = {
        mas: 'med-autoscience',
        medautoscience: 'med-autoscience',
        mag: 'med-autogrant',
        medautogrant: 'med-autogrant',
        rca: 'redcube-ai',
        redcubeai: 'redcube-ai',
        obf: 'opl-bookforge',
        oplbookforge: 'opl-bookforge',
        oma: 'opl-meta-agent',
        oplmetaagent: 'opl-meta-agent',
      };
      return aliases[normalized] ?? id;
    },
    getOplAssistantSkillProfile: () => null,
    getOplDefaultExecutorAgentKey: () => 'codex',
    getOplDefaultHomeAssistants: () => [],
    getOplFirstPartyPackagePresentations: () => firstPartyPackagePresentations,
    getOplHomeAgentShortcuts: () => homeAgentShortcuts,
    getOplProfessionalAgentPackage: (id: string) =>
      professionalAgentPackages.find((agentPackage) => agentPackage.package_id === id),
    getOplProfessionalAgentPackages: () => professionalAgentPackages,
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: translationMocks.language },
    t: (key: string, options?: Record<string, string | undefined> & { defaultValue?: string }) => {
      const labels: Record<string, string> = {
        'settings.agentsPage.title': 'Agents',
        'settings.agentsPage.description': 'Manage runnable agents.',
        'settings.agentsPage.addAgent': 'Add agent',
        'settings.agentsPage.restoreOfficialProfile': 'Restore official set',
        'settings.agentsPage.restoreOfficialProfileConfirmTitle': 'Restore the official package set?',
        'settings.agentsPage.restoreOfficialProfileConfirmContent': 'Install missing official packages.',
        'settings.agentsPage.restoreOfficialProfileComplete': 'Official package set restored.',
        'settings.capabilitiesPage.title': 'Capabilities',
        'settings.capabilitiesPage.description': 'Manage skills and plugins.',
        'settings.capabilitiesPage.groups.manualAndThirdParty.title': 'Manual and third-party capabilities',
        'settings.capabilitiesPage.groups.manualAndThirdParty.description': 'Manage other capabilities.',
        'settings.capabilitiesPage.developerSource.title': 'Runtime source',
        'settings.capabilitiesPage.developerSource.advancedTitle': 'Advanced runtime and maintenance',
        'settings.capabilitiesPage.developerSource.advancedSummary': `${options?.mode ?? ''} · ${options?.state ?? ''}`,
        'settings.capabilitiesPage.developerSource.description': 'Choose the source used at runtime.',
        'settings.capabilitiesPage.developerSource.changeConfirmTitle': 'Change runtime source?',
        'settings.capabilitiesPage.developerSource.changeConfirmContent':
          'Verify the runtime source after changing it.',
        'settings.capabilitiesPage.developerSource.changeVerified': 'Runtime source updated and verified.',
        'settings.capabilitiesPage.developerSource.changeNotVerified': 'Runtime source change not verified.',
        'settings.capabilitiesPage.developerSource.modeLabel': 'Global runtime source',
        'settings.capabilitiesPage.developerSource.modes.managed': 'Managed',
        'settings.capabilitiesPage.developerSource.modes.auto': 'Automatic',
        'settings.capabilitiesPage.developerSource.modes.developer': 'Developer',
        'settings.capabilitiesPage.developerSource.safeMaintenance': 'Maintain authorized development repositories',
        'settings.capabilitiesPage.developerSource.safeMaintenanceDescription': 'Use supervised maintenance.',
        'settings.capabilitiesPage.developerSource.maintenanceModeLabel': 'Authorized repository maintenance',
        'settings.capabilitiesPage.developerSource.maintenanceModes.auto': 'Automatic maintenance',
        'settings.capabilitiesPage.developerSource.maintenanceModes.off': 'Off',
        'settings.capabilitiesPage.developerSource.effectiveStates.inactive': 'Currently inactive',
        'settings.capabilitiesPage.developerSource.effectiveStates.automatic': 'Automatically active',
        'settings.capabilitiesPage.developerSource.effectiveStates.manual': 'Manually active',
        'settings.capabilitiesPage.developerSource.effectiveStates.off': 'Off',
        'settings.capabilitiesPage.developerSource.workspace': 'Developer workspace',
        'settings.capabilitiesPage.developerSource.identity': 'GitHub identity',
        'settings.capabilitiesPage.developerSource.authority': 'Directly maintainable repositories',
        'settings.capabilitiesPage.developerSource.authoritySummary': `${options?.direct ?? ''} direct · ${options?.pullRequest ?? ''} pull request · ${options?.total ?? ''} total`,
        'settings.capabilitiesPage.developerSource.configurationSource': 'Configuration source',
        'settings.capabilitiesPage.developerSource.configurationSources.default': 'Automatic default',
        'settings.capabilitiesPage.developerSource.configurationSources.user_config': 'User configuration',
        'settings.capabilitiesPage.developerSource.configurationSources.other': 'Framework-managed configuration',
        'settings.capabilitiesPage.developerSource.inspectionPending':
          'Checking GitHub identity and repository authority. No mismatch has been inferred.',
        'settings.capabilitiesPage.developerSource.protection': 'Repository protection',
        'settings.capabilitiesPage.developerSource.protectionSummary': `${options?.dirty ?? ''} · ${options?.branch ?? ''}`,
        'settings.capabilitiesPage.developerSource.protectionValues.isolatedWorktree':
          'dirty worktrees use an isolated worktree',
        'settings.capabilitiesPage.developerSource.protectionValues.topicBranch':
          'protected branches require a topic branch',
        'settings.capabilitiesPage.developerSource.protectionValues.notReported': 'not reported',
        'settings.capabilitiesPage.developerSource.inactiveReason': 'Why it is inactive',
        'settings.capabilitiesPage.developerSource.inactiveReasons.authority_inspection_pending':
          'Repository authority inspection is still running.',
        'settings.capabilitiesPage.developerSource.inactiveReasons.other':
          'The runtime source is currently inactive. Refresh the page or open Maintenance for details.',
        'settings.capabilitiesPage.developerSource.packageTitle': 'Runtime source for this capability',
        'settings.capabilitiesPage.developerSource.packageDescription': 'Follow global or select a source.',
        'settings.capabilitiesPage.developerSource.packageModes.auto': 'Follow global',
        'settings.capabilitiesPage.developerSource.packageModes.managed': 'Managed copy',
        'settings.capabilitiesPage.developerSource.packageModes.developer': 'Developer repository',
        'settings.capabilitiesPage.developerSource.actualSource': 'Current source',
        'settings.capabilitiesPage.developerSource.activePath': 'Current path',
        'settings.capabilitiesPage.developerSource.managedPath': 'Managed path',
        'settings.capabilitiesPage.developerSource.developerPath': 'Developer path',
        'settings.capabilitiesPage.developerSource.fallback': 'Using the managed fallback.',
        'settings.capabilitiesPage.status.ready': 'Available',
        'settings.capabilitiesPage.status.update': 'Update required',
        'settings.capabilitiesPage.status.sync': 'Sync required',
        'settings.capabilitiesPage.status.source': 'Available',
        'settings.capabilitiesPage.status.verification': 'Checking',
        'settings.capabilitiesPage.status.inactive': 'Enable required',
        'settings.capabilitiesPage.status.attention': 'Temporarily unavailable',
        'settings.capabilitiesPage.status.repair': 'Repair required',
        'settings.capabilitiesPage.status.missing': 'Install required',
        'settings.advancedSettings': 'Advanced Settings',
        'common.close': 'Close',
        'common.technical_details': 'Technical Details',
        'settings.localServicesPage.actions.openMaintenance': 'Open Maintenance',
        'settings.capabilitiesPage.detailsHeader': 'Capability details',
        'settings.capabilitiesPage.codexVisibilitySummary': `Codex visibility: ${options?.value ?? ''}`,
        'settings.capabilitiesPage.codexVisibility.visible': 'Visible in Codex',
        'settings.capabilitiesPage.codexVisibility.verificationPending': 'Status being confirmed',
        'settings.capabilitiesPage.codexVisibility.needsSync': 'Needs sync before Codex sees the latest version',
        'settings.capabilitiesPage.codexVisibility.notVisible': 'Not visible to Codex yet',
        'settings.capabilitiesPage.codexVisibility.unknown': 'Visibility not reported',
        'settings.capabilitiesPage.visibility.conversation': 'Current availability',
        'settings.capabilitiesPage.visibility.home': 'Show on Home',
        'settings.capabilitiesPage.visibility.conversationAvailable': 'Available for conversations',
        'settings.capabilitiesPage.visibility.conversationNeedsSync': 'Sync required',
        'settings.capabilitiesPage.visibility.conversationUnavailable':
          'Temporarily unavailable; open details for the reason',
        'settings.capabilitiesPage.visibility.conversationUnverified': 'Checking the current status',
        'settings.capabilitiesPage.visibility.conversationVerificationPending': 'Available for conversations',
        'settings.capabilitiesPage.actions.reviewLocalCheck': 'Review local check',
        'settings.capabilitiesPage.packageManager.roleLabels.standardAgent': 'Runnable agent',
        'settings.capabilitiesPage.packageManager.roleLabels.workflowProfile': 'Workflow profile',
        'settings.capabilitiesPage.packageManager.roleLabels.supportingCapability': 'Supporting capability',
        'settings.capabilitiesPage.packageManager.roleLabels.other': 'Other package',
        'settings.uiOptimization.capabilities.groups.frequent': 'Frequent',
        'settings.uiOptimization.capabilities.groups.needsAttention': 'Needs attention',
        'settings.uiOptimization.capabilities.groups.other': 'Other',
        'settings.uiOptimization.capabilities.actions.viewDetails': 'View details',
        'settings.uiOptimization.capabilities.details.title': 'Capability details',
        'settings.uiOptimization.capabilities.details.purpose': 'Purpose',
        'settings.uiOptimization.capabilities.details.triggerRules': 'Trigger rules',
        'settings.uiOptimization.capabilities.details.source': 'Source',
        'settings.uiOptimization.capabilities.details.version': 'Version',
        'settings.uiOptimization.capabilities.summaries.medAutoscience':
          'Advance medical research, papers, and data analysis',
        'settings.uiOptimization.capabilities.summaries.medAutogrant': 'Plan and write medical research grants',
        'settings.uiOptimization.capabilities.summaries.redcubeAi':
          'Produce research presentations and visual deliverables',
        'settings.uiOptimization.capabilities.summaries.oplBookforge': 'Plan, write, and organize long-form books',
        'settings.uiOptimization.capabilities.summaries.oplMetaAgent': 'Create, review, and improve OPL agents',
        'settings.uiOptimization.capabilities.summaries.masScholarSkills':
          translationMocks.language === 'zh-CN'
            ? '为医学科研智能体提供可复用科研能力'
            : 'Provide reusable research capabilities for Med Auto Science',
        'settings.uiOptimization.capabilities.summaries.oplFlow':
          translationMocks.language === 'zh-CN'
            ? '管理 OPL 推荐工作流与受管 Codex 策略'
            : 'Manage recommended OPL workflows and managed Codex policy',
        'settings.uiOptimization.capabilities.summaries.fallback': 'Support {{name}} tasks',
        'settings.capabilitiesPage.packageManager.supportingFor': `Supports ${options?.parent ?? ''}`,
        'settings.capabilitiesPage.packageManager.composition': `Runnable agents ${options?.agents ?? ''} · Workflows ${options?.workflows ?? ''} · Supporting capabilities ${options?.supporting ?? ''}`,
        'settings.capabilitiesPage.detailLabels.purpose': 'Purpose',
        'settings.capabilitiesPage.detailLabels.codexVisibility': 'Codex visibility',
        'settings.capabilitiesPage.detailLabels.packageId': 'Package ID',
        'settings.capabilitiesPage.detailLabels.codexVisibleEntry': 'Codex entry',
        'settings.capabilitiesPage.detailLabels.defaultHomeVisible': 'Default Home shortcut',
        'settings.capabilitiesPage.detailLabels.userConfigurable': 'User configurable',
        'settings.capabilitiesPage.detailLabels.sourceKind': 'Source kind',
        'settings.capabilitiesPage.detailLabels.packageLockRef': 'Package lock receipt',
        'settings.capabilitiesPage.detailLabels.actionReceiptRef': 'Action receipt',
        'settings.capabilitiesPage.detailLabels.rollbackRef': 'Recovery reference',
        'settings.capabilitiesPage.detailLabels.physicalSurfaceStatus': 'Installed Codex surface',
        'settings.capabilitiesPage.detailLabels.physicalSurfaceReloadRequired': 'Codex reload required',
        'settings.capabilitiesPage.detailLabels.physicalSurfacePluginId': 'Installed plugin',
        'settings.capabilitiesPage.detailLabels.physicalSurfaceMarketplaceId': 'Local marketplace',
        'settings.capabilitiesPage.detailLabels.physicalSurfaceCachePath': 'Plugin cache path',
        'settings.capabilitiesPage.detailLabels.physicalSurfaceMarketplacePath': 'Marketplace path',
        'settings.capabilitiesPage.detailLabels.physicalSurfaceConfigPath': 'Codex config path',
        'settings.capabilitiesPage.detailLabels.physicalSurfaceRequiredSkillIds': 'Materialized required skills',
        'settings.capabilitiesPage.detailLabels.physicalSurfaceRequiredSkillPaths': 'Materialized required skill paths',
        'settings.capabilitiesPage.detailLabels.version': 'Version',
        'settings.capabilitiesPage.detailLabels.source': 'Source',
        'settings.capabilitiesPage.detailLabels.lastSync': 'Last sync',
        'settings.capabilitiesPage.detailLabels.failureReason': 'Failure reason',
        'settings.capabilitiesPage.detailLabels.dependencyReadiness': 'Dependency readiness',
        'settings.capabilitiesPage.detailLabels.dependencyReadinessCount': 'Ready dependencies',
        'settings.capabilitiesPage.detailLabels.operationalReady': 'Operationally ready',
        'settings.capabilitiesPage.detailLabels.launchAllowed': 'Can start work',
        'settings.capabilitiesPage.detailLabels.launchBlockedReason': 'Start blocked',
        'settings.capabilitiesPage.detailLabels.allowedWhenBlocked': 'Available maintenance actions',
        'settings.capabilitiesPage.detailLabels.dependencyFailures': 'Dependency issues',
        'settings.capabilitiesPage.detailLabels.requiredByPackages': 'Required by installed packages',
        'settings.capabilitiesPage.detailLabels.disableDisabledReason': 'Cannot disable',
        'settings.capabilitiesPage.detailLabels.uninstallDisabledReason': 'Cannot uninstall',
        'settings.capabilitiesPage.detailLabels.repairCommandRef': 'Repair command reference',
        'settings.capabilitiesPage.detailLabels.dependencyClosureTransactionId': 'Closure transaction',
        'settings.capabilitiesPage.detailLabels.dependencyClosureDigest': 'Closure digest',
        'settings.capabilitiesPage.detailLabels.dependencyClosureLastKnownGoodTransactionId':
          'Last known good transaction',
        'settings.capabilitiesPage.detailLabels.dependencyClosureLastKnownGoodDigest': 'Last known good closure digest',
        'settings.capabilitiesPage.dependencyReadiness.ready': 'Ready',
        'settings.capabilitiesPage.dependencyReadiness.repair_required': 'Repair required',
        'settings.capabilitiesPage.dependencyReadiness.blocked': 'Blocked',
        'settings.capabilitiesPage.reasonCodes.required_export_missing': 'A required capability export is missing',
        'settings.capabilitiesPage.reasonCodes.required_by_installed_package': 'Required by another installed package',
        'settings.capabilitiesPage.reasonCodes.other':
          'Framework reported an issue that this App version does not yet recognize.',
        'settings.capabilitiesPage.detailValues.readinessCount': `${options?.ready ?? ''} of ${options?.required ?? ''}`,
        'settings.capabilitiesPage.detailLabels.connectorReadinessRefs': 'Connector readiness',
        'settings.capabilitiesPage.detailLabels.workflowRefs': 'Reusable workflows',
        'settings.capabilitiesPage.detailLabels.resourceContextRefs': 'Environment and resource context',
        'settings.capabilitiesPage.detailLabels.exportBundleAction': 'Reproducibility export bundle action',
        'settings.capabilitiesPage.detailValues.notReported': 'Not reported',
        'settings.capabilitiesPage.detailValues.none': 'None',
        'settings.capabilitiesPage.detailValues.yes': 'Yes',
        'settings.capabilitiesPage.detailValues.no': 'No',
        'settings.capabilitiesPage.sourceLabels.developer': 'Local developer source',
        'settings.capabilitiesPage.sourceLabels.managed': 'OPL managed package',
        'settings.capabilitiesPage.sourceLabels.registry': 'Registry install',
        'settings.capabilitiesPage.sourceLabels.local': 'Local install',
        'settings.capabilitiesPage.candidateReports.title': 'Review suggestions',
        'settings.capabilitiesPage.candidateReports.description':
          'Only source-backed workflow or skill suggestions that need review appear here. This view does not install, enable, or edit skills.',
        'settings.capabilitiesPage.candidateReports.purpose': 'Suggested use',
        'settings.capabilitiesPage.candidateReports.report': 'Source report',
        'settings.capabilitiesPage.candidateReports.decision': 'Review state',
        'settings.capabilitiesPage.candidateReports.pendingDecision': 'Needs review',
        'settings.capabilitiesPage.candidateReports.actions.review': 'Review',
        'settings.capabilitiesPage.candidateReports.actions.needsChanges': 'Needs changes',
        'settings.capabilitiesPage.candidateReports.actions.continueInConversation': 'Continue in conversation',
        'settings.capabilitiesPage.connectorGroups.oplConnect': 'OPL Connect',
        'settings.capabilitiesPage.connectorGroups.oplFabric': 'OPL Fabric',
        'settings.capabilitiesPage.resourceContextGroups.gateway': 'OPL Gateway',
        'settings.capabilitiesPage.resourceContextGroups.environment': 'Environment catalog',
        'settings.capabilitiesPage.resourceContextGroups.storage': 'Storage',
        'settings.capabilitiesPage.resourceContextGroups.resources': 'Resource sources',
        'settings.capabilitiesPage.resourceContextGroups.receipts': 'Resource receipts',
        'settings.capabilitiesPage.resourceContextGroups.costs': 'Quota / cost',
        'settings.capabilitiesPage.refLabels.id': 'ID',
        'settings.capabilitiesPage.refLabels.ref': 'Source',
        'settings.capabilitiesPage.refLabels.owner': 'Owner',
        'settings.capabilitiesPage.refLabels.nextAction': 'Next action',
        'settings.capabilitiesPage.refLabels.action': 'Action',
        'settings.capabilitiesPage.refLabels.dryRun': 'Dry-run summary',
        'settings.capabilitiesPage.refLabels.receipt': 'Receipt summary',
        'settings.capabilitiesPage.actions.openDetails': 'Review capability',
        'settings.capabilitiesPage.actions.installOrSync': 'Set up capability',
        'settings.capabilitiesPage.actions.updateOrSync': 'Update or sync',
        'settings.capabilitiesPage.actions.repair': 'Review repair path',
        'settings.capabilitiesPage.packageManager.title': 'Capability directory',
        'settings.capabilitiesPage.packageManager.description': 'Package lifecycle actions use App action routes.',
        'settings.capabilitiesPage.packageManager.catalogTitle': 'Capability directory',
        'settings.capabilitiesPage.packageManager.catalogDescription':
          'Manage install state and Home visibility from one compact list.',
        'settings.capabilitiesPage.packageManager.refreshRegistry': 'Refresh registry',
        'settings.capabilitiesPage.packageManager.searchPlaceholder': 'Search package, tag, or description',
        'settings.capabilitiesPage.packageManager.searchLabel': 'Search agent packages',
        'settings.capabilitiesPage.packageManager.roleFilter': 'Filter by package role',
        'settings.capabilitiesPage.packageManager.statusFilter': 'Filter by package status',
        'settings.capabilitiesPage.packageManager.sourceFilter': 'Filter by source',
        'settings.capabilitiesPage.packageManager.allRoles': 'All roles',
        'settings.capabilitiesPage.packageManager.allStatuses': 'All statuses',
        'settings.capabilitiesPage.packageManager.allSources': 'All sources',
        'settings.capabilitiesPage.packageManager.resetFilters': 'Reset',
        'settings.capabilitiesPage.packageManager.loading': 'Loading the agent package directory...',
        'settings.capabilitiesPage.packageManager.refreshing': 'Refreshing the agent package directory...',
        'settings.capabilitiesPage.packageManager.staleWithReason': `Showing the last directory snapshot: ${options?.reason ?? ''}`,
        'settings.capabilitiesPage.packageManager.failed': `Directory failed: ${options?.reason ?? ''}`,
        'settings.capabilitiesPage.packageManager.noFilterResults': 'No packages match these filters.',
        'settings.capabilitiesPage.packageManager.workspaceRequired':
          'The runtime uses a project folder only when the specific task requires one.',
        'settings.capabilitiesPage.packageManager.openWorkspace': 'Choose project folder',
        'settings.capabilitiesPage.packageManager.manifestUrlPlaceholder': 'Manifest URL',
        'settings.capabilitiesPage.packageManager.trustTierLabel': 'Manifest trust level',
        'settings.capabilitiesPage.packageManager.trustTierPlaceholder': 'Choose trust level',
        'settings.capabilitiesPage.packageManager.trustTierRequired': 'Choose a trust level before installing.',
        'settings.capabilitiesPage.packageManager.trustTiers.thirdPartyUnverified': 'Unverified third party',
        'settings.capabilitiesPage.packageManager.trustTiers.thirdPartyVerified': 'Verified third party',
        'settings.capabilitiesPage.packageManager.installFromManifest': 'Install manifest',
        'settings.capabilitiesPage.packageManager.installPreviewInvalid': 'Install preview did not return a package.',
        'settings.capabilitiesPage.packageManager.installConfirmTitle': `Install ${options?.packageId ?? ''}?`,
        'settings.capabilitiesPage.packageManager.installConfirmContent': 'Continue after reviewing the manifest.',
        'settings.capabilitiesPage.packageManager.installVerified': `${options?.name ?? ''} installed and verified: ${options?.status ?? ''}.`,
        'settings.capabilitiesPage.packageManager.installNotVerified': 'Package installation not verified.',
        'settings.capabilitiesPage.packageManager.addCapability': 'Add capability',
        'settings.capabilitiesPage.packageManager.advancedAddTitle': 'Advanced add method',
        'settings.capabilitiesPage.packageManager.advancedAddDescription': 'Use a validated capability manifest.',
        'settings.capabilitiesPage.packageManager.management': 'Manage capabilities',
        'settings.capabilitiesPage.packageManager.moreActions': 'More package actions',
        'settings.capabilitiesPage.packageManager.hideFromHome': 'Hide from Home',
        'settings.capabilitiesPage.packageManager.showOnHome': 'Show on Home',
        'settings.capabilitiesPage.packageManager.moveUp': 'Move up',
        'settings.capabilitiesPage.packageManager.moveDown': 'Move down',
        'settings.capabilitiesPage.packageManager.homeVisibleWithOrder': `Home visible · Order ${options?.order ?? ''}`,
        'settings.capabilitiesPage.packageManager.homeHidden': 'Home hidden',
        'settings.capabilitiesPage.packageManager.noHomeShortcut': 'No Home shortcut',
        'settings.capabilitiesPage.packageManager.rowMeta': `${options?.sourceLabel ?? ''}: ${options?.sourceValue ?? ''} · ${options?.versionLabel ?? ''}: ${options?.versionValue ?? ''} · ${options?.homeLabel ?? ''}`,
        'settings.capabilitiesPage.packageManager.packageCount': `Showing ${options?.count ?? ''} / ${options?.total ?? ''}`,
        'settings.capabilitiesPage.packageManager.empty': 'No matching agent packages.',
        'settings.capabilitiesPage.packageManager.pendingFrameworkAction':
          'Waiting for Framework action receipt support',
        'settings.capabilitiesPage.packageManager.actionQueued': 'Action routed to OPL',
        'settings.capabilitiesPage.packageManager.uninstallConfirmTitle': 'Uninstall capability',
        'settings.capabilitiesPage.packageManager.uninstallConfirmContent': 'Uninstall through App package manager.',
        'settings.capabilitiesPage.packageManager.tableHeaders.package': 'Capability',
        'settings.capabilitiesPage.packageManager.tableHeaders.purpose': 'Purpose',
        'settings.capabilitiesPage.packageManager.tableHeaders.status': 'Status',
        'settings.capabilitiesPage.packageManager.tableHeaders.source': 'Source',
        'settings.capabilitiesPage.packageManager.tableHeaders.version': 'Version',
        'settings.capabilitiesPage.packageManager.tableHeaders.codex': 'Codex',
        'settings.capabilitiesPage.packageManager.tableHeaders.home': 'Home shortcut',
        'settings.capabilitiesPage.packageManager.tableHeaders.actions': 'Action',
        'settings.capabilitiesPage.packageManager.actions.update': 'Update',
        'settings.capabilitiesPage.packageManager.actions.install': 'Install',
        'settings.capabilitiesPage.packageManager.actions.activate': 'Activate',
        'settings.capabilitiesPage.packageManager.actions.repair': 'Repair',
        'settings.capabilitiesPage.packageManager.actions.rollback': 'Rollback',
        'settings.capabilitiesPage.packageManager.actions.uninstall': 'Uninstall',
        'settings.capabilitiesPage.packageManager.actions.enable': 'Enable',
        'settings.capabilitiesPage.packageManager.actions.disable': 'Disable',
        'settings.capabilitiesPage.packageManager.actions.hide': 'Hide',
        'settings.capabilitiesPage.packageManager.actions.show': 'Show',
        'settings.capabilitiesPage.packageManager.actions.unhide': 'Unhide',
        'settings.capabilitiesPage.packageManager.actions.run': 'Run',
        'settings.retry': 'Retry',
        'common.cancel': 'Cancel',
        'common.confirm': 'Confirm',
        'settings.capabilitiesPage.purposes.automation.title': 'Meta agent',
        'settings.capabilitiesPage.purposes.automation.description': 'Use OMA explicitly.',
        'settings.capabilitiesPage.entries.externalTools.title': 'External tools & voice',
        'settings.capabilitiesPage.entries.externalTools.description': 'Connect external tools and speech input.',
        'settings.capabilitiesPage.entries.externalTools.technical': 'Technical detail: MCP is the protocol.',
        'settings.capabilitiesPage.supporting.title': 'Skills and tools',
        'settings.capabilitiesPage.supporting.compactTitle': 'Skills and tools',
        'settings.capabilitiesPage.supporting.description':
          'Supporting capability details stay collapsed by default. Open them only when you need to configure or troubleshoot.',
        'settings.capabilitiesTab.skills': 'Skills',
        'settings.capabilitiesTab.tools': 'External tools & voice',
        'settings.capabilitiesTab.oplFlowManaged': 'Recommended by OPL Flow',
        'settings.capabilitiesTab.manualAndThirdParty': 'Manually added',
      };
      return labels[key] ?? options?.defaultValue ?? key;
    },
  }),
}));

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid='current-location'>{`${location.pathname}${location.hash}`}</output>;
};

const renderCapabilities = (ui: React.ReactElement, isMobile = false, initialEntry = '/') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LayoutContext.Provider value={{ isMobile, siderCollapsed: false, setSiderCollapsed: vi.fn() }}>
        {ui}
        <LocationProbe />
      </LayoutContext.Provider>
    </MemoryRouter>
  );

const chooseSelectOption = async (testId: string, label: string) => {
  fireEvent.click(screen.getByTestId(testId));
  const matches = await screen.findAllByText(label);
  const option = matches.find((match) => match.closest('.arco-select-option')) ?? matches.at(-1);
  if (!option) throw new Error(`Missing select option: ${label}`);
  fireEvent.click(option);
};

describe('Agents and capabilities settings', () => {
  beforeEach(() => {
    translationMocks.language = 'en-US';
    appStateOverrides.developerMode = undefined;
    appStateOverrides.appState = undefined;
    appStateOverrides.loading = false;
    appStateOverrides.refreshing = false;
    appStateOverrides.error = null;
    appStateOverrides.developerConfirmationRequired = false;
    bridgeMocks.executeActionInvoke.mockReset();
    bridgeMocks.executeActionInvoke.mockResolvedValue({
      ok: true,
      command: 'opl app action execute --action test --json',
    });
    bridgeMocks.applyOfficialProfileInvoke.mockReset();
    bridgeMocks.applyOfficialProfileInvoke.mockResolvedValue({
      ok: true,
      command: 'node <official-profile-package-apply.ts> --intent explicit_restore',
    });
    bridgeMocks.loadAppState.mockReset();
    bridgeMocks.loadAppState.mockImplementation(async () => {
      const snapshot = structuredClone(bridgeMocks.currentAppState);
      const developerCall = bridgeMocks.executeActionInvoke.mock.calls
        .toReversed()
        .map(([input]) => input as { actionId?: string; payloadRefsOnlyJson?: Record<string, unknown> })
        .find((input) => input.actionId === 'developer_supervisor');
      const payload = developerCall?.payloadRefsOnlyJson;
      if (payload) {
        const developerMode = snapshot.developer_mode as Record<string, unknown> | undefined;
        const settingsControlCenter = snapshot.settings_control_center as Record<string, unknown> | undefined;
        const configurationCatalog = settingsControlCenter?.configuration_catalog as
          | Record<string, unknown>
          | undefined;
        const configurationItems = configurationCatalog?.items as Record<string, unknown>[] | undefined;
        const developerConfiguration = configurationItems?.find(
          (item) => item.configuration_id === 'developer_supervisor'
        );
        const currentValue = developerConfiguration?.current_value as Record<string, unknown> | undefined;
        if (developerMode && typeof payload.developerSupervisorEnabled === 'string') {
          developerMode.enabled = payload.developerSupervisorEnabled;
        }
        if (developerMode && currentValue && typeof payload.developerSupervisorMode === 'string') {
          developerMode.mode = payload.developerSupervisorMode;
          currentValue.mode = payload.developerSupervisorMode;
        }
        if (
          typeof payload.developerSupervisorModuleId === 'string' &&
          typeof payload.developerSupervisorModuleSource === 'string'
        ) {
          const carriers = snapshot.runtime_source_carriers as Record<string, unknown> | undefined;
          const items = carriers?.items as Record<string, unknown>[] | undefined;
          const carrier = items?.find((item) => item.carrier_id === payload.developerSupervisorModuleId);
          const sourcePolicy = carrier?.source_policy as Record<string, unknown> | undefined;
          if (sourcePolicy) sourcePolicy.source_preference = payload.developerSupervisorModuleSource;
        }
      }
      const preferenceCall = bridgeMocks.executeActionInvoke.mock.calls
        .toReversed()
        .map(([input]) => input as { actionId?: string; payloadRefsOnlyJson?: Record<string, unknown> })
        .find((input) => input.actionId === 'agent_package_preferences_set' && input.payloadRefsOnlyJson?.shortcut_id);
      const preferencePayload = preferenceCall?.payloadRefsOnlyJson;
      if (
        preferencePayload &&
        typeof preferencePayload.shortcut_id === 'string' &&
        typeof preferencePayload.visible === 'boolean' &&
        typeof preferencePayload.sort_order === 'number'
      ) {
        return homeShortcutReadback(
          preferencePayload.shortcut_id,
          preferencePayload.visible,
          preferencePayload.sort_order
        );
      }
      return { app_state: snapshot };
    });
    bridgeMocks.modalConfirm.mockClear();
    bridgeMocks.messageSuccess.mockReset();
    bridgeMocks.messageError.mockReset();
    bridgeMocks.currentAppState = {};
    localStorage.clear();
    replaceOplHomeShortcutPreferences({
      hiddenShortcutIds: [],
      visibleShortcutIds: [],
      orderedShortcutIds: [],
    });
  });

  it('shows runnable agent packages without embedding skills and tools', async () => {
    renderCapabilities(<AgentPackagesSettingsContent />);

    expect(screen.getByRole('heading', { name: 'Agents' })).toBeInTheDocument();
    expect(screen.getAllByText('Capability directory').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('settings-page-agents')).toHaveClass('opl-settings-page');
    const developerDisclosure = screen.getByTestId('opl-developer-profile-disclosure');
    expect(developerDisclosure).toHaveAttribute('aria-expanded', 'false');
    expect(developerDisclosure).toHaveTextContent('Automatic · Automatically active');
    expect(screen.queryByTestId('settings-agents-developer-summary')).not.toBeInTheDocument();
    fireEvent.click(developerDisclosure);
    expect(developerDisclosure).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('settings-agents-developer-summary').className).not.toMatch(/\bborder(?:-|\b)/);
    expect(screen.getByTestId('settings-agents-catalog-filters')).toHaveClass('sm:grid-cols-2');
    expect(screen.getByTestId('settings-agents-catalog-filters').className).not.toMatch(/\bborder(?:-|\b)/);
    expect(screen.getByTestId('capability-summary-grid')).toHaveClass('flex', 'flex-wrap');
    expect(screen.getByTestId('capability-summary-grid')).not.toHaveClass('md:grid-cols-3');
    expect(screen.getByTestId('capability-summary-catalog')).toHaveTextContent('Showing 6 / 6');
    expect(screen.getByTestId('capability-summary-composition')).toHaveTextContent(
      'Runnable agents 5 · Workflows 0 · Supporting capabilities 1'
    );
    expect(screen.getByTestId('capability-summary-conversation')).toHaveTextContent('2 / 6');
    expect(screen.getByTestId('capability-summary-home')).toHaveTextContent('5 / 6');
    const catalog = screen.getByTestId('agent-package-catalog');
    const developerProfile = screen.getByTestId('opl-developer-profile-control');
    expect(catalog.compareDocumentPosition(developerProfile) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    for (const anchor of ['catalog', 'package-role', 'availability', 'source', 'home-visibility']) {
      expect(document.getElementById(anchor)).not.toBeNull();
    }
    expect(within(catalog).getAllByText('Current availability')).toHaveLength(6);
    expect(within(catalog).getAllByText('Show on Home')).toHaveLength(6);
    const refreshRegistryButton = screen.getByTestId('agent-package-refresh-registry');
    expect(refreshRegistryButton).toHaveAccessibleName('Refresh registry');
    expect(refreshRegistryButton).toHaveTextContent('');
    expect(screen.queryByTestId('agent-package-install-manifest')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('settings-agents-primary-action'));
    const advancedAdd = screen.getByTestId('agent-package-advanced-add');
    expect(advancedAdd).toBeInTheDocument();
    expect(advancedAdd).toHaveClass('opl-settings-flat-subgroup');
    expect(advancedAdd.className).not.toMatch(/\brd-|\bbg-fill-/);
    expect(screen.getByTestId('agent-package-install-manifest')).toBeDisabled();
    expect(screen.getAllByText('Med Auto Science').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Med Auto Grant').length).toBeGreaterThan(0);
    expect(screen.getAllByText('RedCube AI').length).toBeGreaterThan(0);
    expect(screen.getAllByText('OPL Book Forge').length).toBeGreaterThan(0);
    expect(screen.getByText('OPL Meta Agent')).toBeInTheDocument();
    expect(screen.queryByText('Local developer source')).not.toBeInTheDocument();
    expect(screen.getAllByText('Update required').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Repair required').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Available for conversations').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sync required').length).toBeGreaterThan(0);

    const research = screen.getByTestId('capability-purpose-mas');
    expect(within(research).getByTestId('capability-description-mas')).toHaveTextContent(
      'Advance medical research, papers, and data analysis'
    );
    expect(within(research).queryByText(/For research planning/)).not.toBeInTheDocument();
    expect(within(research).getByText('Available')).toBeInTheDocument();
    const bookforge = screen.getByTestId('capability-purpose-obf');
    expect(within(bookforge).getByText('Available')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('capability-open-details-obf'));
    expect(screen.queryByTestId('agent-package-update-obf')).not.toBeInTheDocument();
    const oma = screen.getByTestId('capability-purpose-oma');
    expect(within(oma).getByTestId('capability-description-oma')).toHaveTextContent(
      'Create, review, and improve OPL agents'
    );
    expect(within(oma).getByText('Available')).toBeInTheDocument();
    expect(screen.getByTestId('settings-agents-group-frequent')).toContainElement(bookforge);
    expect(screen.getByTestId('settings-agents-group-frequent')).toContainElement(oma);
    expect(screen.getByTestId('settings-agents-group-frequent')).toContainElement(research);
    expect(screen.getByTestId('settings-agents-group-needsAttention')).toContainElement(
      screen.getByTestId('capability-purpose-mag')
    );
    expect(screen.getByTestId('settings-agents-group-needsAttention')).toContainElement(
      screen.getByTestId('capability-purpose-example-agent')
    );
    const omaHomeSwitch = within(oma).getByTestId('agent-package-home-toggle-details-oma');
    expect(omaHomeSwitch).toHaveClass('arco-switch-checked');
    expect(omaHomeSwitch).not.toBeDisabled();
    fireEvent.click(omaHomeSwitch);
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith(
        expect.objectContaining({
          actionId: 'agent_package_preferences_set',
          payloadRefsOnlyJson: expect.objectContaining({
            package_id: 'oma',
            shortcut_id: 'oma',
            visible: false,
          }),
        })
      )
    );
    fireEvent.click(screen.getByTestId('capability-open-details-mas'));
    let detailedResearch = screen.getByTestId('capability-details-mas');
    const productDetails = screen.getByTestId('capability-product-details-mas');
    expect(productDetails).not.toHaveAttribute('open');
    expect(productDetails).toHaveTextContent(
      'For research planning, literature review, data analysis, manuscript writing, peer review, revision, and submission.'
    );
    expect(productDetails).toHaveTextContent('Local developer source');
    expect(productDetails).toHaveTextContent('1.2.3');
    expect(within(detailedResearch).getByText('Review suggestions')).toBeInTheDocument();
    expect(within(detailedResearch).getByText('OpenScience artifact graph review')).toBeInTheDocument();
    const openscienceCandidate = within(detailedResearch).getByTestId(
      'capability-candidate-report-mas-openscience-artifact-graph'
    );
    expect(openscienceCandidate).toHaveTextContent('Review OpenScience artifact graph before enabling any skill.');
    expect(openscienceCandidate).not.toHaveTextContent('candidate://openscience/artifact-graph');
    expect(openscienceCandidate).not.toHaveTextContent('report://openscience/artifact-graph');
    expect(openscienceCandidate).toHaveTextContent('review_pending');
    expect(openscienceCandidate).toHaveTextContent('Needs changes');
    expect(openscienceCandidate).toHaveTextContent('Continue in conversation');
    expect(openscienceCandidate).not.toHaveTextContent('must not render');
    expect(detailedResearch).toHaveTextContent('Local developer source');
    expect(detailedResearch).not.toHaveTextContent('standard_agent');
    expect(detailedResearch).not.toHaveTextContent('Package ID');
    expect(detailedResearch).not.toHaveTextContent('git_checkout');
    expect(detailedResearch).not.toHaveTextContent('Not reported');
    expect(detailedResearch).not.toHaveTextContent('candidate://openscience/artifact-graph');
    expect(detailedResearch).not.toHaveTextContent('receipt://export/latest');

    expect(screen.queryByTestId('capability-advanced-mas')).not.toBeInTheDocument();
    expect(within(detailedResearch).queryByTestId('capability-connector-group-mas-oplConnect')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('capability-advanced-toggle-mas'));
    detailedResearch = screen.getByTestId('capability-details-mas');
    expect(detailedResearch).toHaveTextContent('Runnable agent');
    expect(detailedResearch).not.toHaveTextContent('standard_agent');
    expect(within(detailedResearch).getAllByText('1.2.3').length).toBeGreaterThan(0);
    expect(within(detailedResearch).queryByText('git_checkout')).not.toBeInTheDocument();
    expect(within(detailedResearch).getAllByText('2026-06-30T01:00:00Z').length).toBeGreaterThan(0);
    expect(within(detailedResearch).queryByText('Not reported')).not.toBeInTheDocument();
    expect(detailedResearch.textContent).toContain('Materialized required skills');
    expect(within(detailedResearch).getByText('med-autoscience, medical-research-lit')).toBeInTheDocument();
    expect(detailedResearch.textContent).toContain('Materialized required skill paths');
    expect(
      within(detailedResearch).getByText('/tmp/codex/skills/med-autoscience, /tmp/codex/skills/medical-research-lit')
    ).toBeInTheDocument();
    expect(within(detailedResearch).getByTestId('capability-connector-group-mas-oplConnect')).toBeInTheDocument();
    expect(within(detailedResearch).getByTestId('capability-connector-group-mas-oplFabric')).toBeInTheDocument();
    expect(within(detailedResearch).getByText('OPL Connect')).toBeInTheDocument();
    expect(within(detailedResearch).getByText('OPL Fabric')).toBeInTheDocument();
    expect(within(detailedResearch).queryByText(/opl:\/\/connect\/pubmed\/readiness/)).not.toBeInTheDocument();
    expect(within(detailedResearch).queryByText(/opl:\/\/connector\/generic\/readiness/)).not.toBeInTheDocument();
    expect(within(detailedResearch).queryByText(/opl:\/\/fabric\/storage\/readiness/)).not.toBeInTheDocument();
    expect(within(detailedResearch).getByText('Reusable workflows')).toBeInTheDocument();
    expect(within(detailedResearch).getByText('Module runtime repair')).toBeInTheDocument();
    expect(
      within(detailedResearch).queryByText(/opl:\/\/workflow\/medautoscience\/module-runtime-repair/)
    ).not.toBeInTheDocument();
    expect(within(detailedResearch).getByText('Environment and resource context')).toBeInTheDocument();
    expect(within(detailedResearch).getByText('OPL Gateway')).toBeInTheDocument();
    expect(within(detailedResearch).getByText('Environment catalog')).toBeInTheDocument();
    expect(within(detailedResearch).getByText('Storage')).toBeInTheDocument();
    expect(within(detailedResearch).getByText('Resource sources')).toBeInTheDocument();
    expect(within(detailedResearch).getByText('Resource receipts')).toBeInTheDocument();
    expect(within(detailedResearch).getByText('Quota / cost')).toBeInTheDocument();
    expect(within(detailedResearch).queryByText(/opl:\/\/gateway\/status\/gflabtoken/)).not.toBeInTheDocument();
    expect(within(detailedResearch).queryByText(/opl:\/\/environment\/python-r-quarto/)).not.toBeInTheDocument();
    expect(
      within(detailedResearch).queryByText(/opl:\/\/environment-template\/python-r-quarto/)
    ).not.toBeInTheDocument();
    expect(
      within(detailedResearch).queryByText(/opl:\/\/environment-version\/python-r-quarto\/2026-07/)
    ).not.toBeInTheDocument();
    expect(within(detailedResearch).queryByText(/opl:\/\/task-applicability\/mas/)).not.toBeInTheDocument();
    expect(
      within(detailedResearch).queryByText(/opl:\/\/storage\/workspace-volume\/medautoscience/)
    ).not.toBeInTheDocument();
    expect(
      within(detailedResearch).queryByText(/opl:\/\/resource-source\/opl-cloud\/managed-compute/)
    ).not.toBeInTheDocument();
    expect(within(detailedResearch).queryByText(/receipt:\/\/resource\/latest/)).not.toBeInTheDocument();
    expect(within(detailedResearch).queryByText(/opl:\/\/cost-estimate\/mas\/latest/)).not.toBeInTheDocument();
    expect(within(detailedResearch).getByText('Reproducibility export bundle action')).toBeInTheDocument();
    expect(within(detailedResearch).getByText('export_reproducibility_bundle')).toBeInTheDocument();
    expect(
      within(detailedResearch).queryByText(/opl:\/\/app-action\/task_action_receipt_preview/)
    ).not.toBeInTheDocument();
    expect(within(detailedResearch).getByText(/receipt:\/\/export\/latest/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('capability-open-details-mag'));
    expect(
      within(screen.getByTestId('capability-details-mag')).queryByTestId(
        'capability-candidate-report-mag-grant-workflow'
      )
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('capability-open-details-rca'));
    expect(within(screen.getByTestId('capability-details-rca')).queryByText('receipt missing')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('capability-advanced-toggle-rca'));
    expect(within(screen.getByTestId('capability-details-rca')).getAllByText('receipt missing').length).toBeGreaterThan(
      0
    );
    expect(screen.queryByText('Skills and tools')).not.toBeInTheDocument();
    expect(screen.queryByText('Custom assistants')).not.toBeInTheDocument();
    expect(screen.queryByTestId('capability-entry-external-tools')).not.toBeInTheDocument();
    expect(screen.queryByTestId('skills-detail')).not.toBeInTheDocument();
    expect(screen.getAllByText('OPL Meta Agent')).toHaveLength(1);

    expect(screen.queryByTestId('skills-detail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tools-detail')).not.toBeInTheDocument();
  });

  it('restores the Official Profile only after explicit Settings confirmation', async () => {
    renderCapabilities(<AgentPackagesSettingsContent />);

    fireEvent.click(screen.getByTestId('settings-agents-restore-official-profile'));
    expect(bridgeMocks.modalConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Restore the official package set?',
        okText: 'Restore official set',
      })
    );
    await waitFor(() => {
      expect(bridgeMocks.applyOfficialProfileInvoke).toHaveBeenCalledWith({ intent: 'explicit_restore' });
    });
    expect(bridgeMocks.loadAppState).toHaveBeenCalledWith('fast', {
      showRefreshing: true,
      forceFresh: true,
    });
    expect(bridgeMocks.messageSuccess).toHaveBeenCalledWith('Official package set restored.');
  });

  it('searches the canonical directory, reports visible counts, and resets a filter-empty result', () => {
    renderCapabilities(<AgentPackagesSettingsContent />);

    const search = screen.getByTestId('settings-agents-catalog-search');
    fireEvent.change(search, { target: { value: 'advance medical' } });
    expect(screen.getByTestId('capability-summary-catalog')).toHaveTextContent('Showing 1 / 6');
    expect(screen.getByTestId('capability-purpose-mas')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'budget narratives' } });
    expect(screen.getByTestId('capability-summary-catalog')).toHaveTextContent('Showing 1 / 6');
    expect(screen.getByTestId('capability-purpose-mag')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'grant' } });
    expect(screen.getByTestId('capability-summary-catalog')).toHaveTextContent('Showing 1 / 6');
    expect(screen.getByTestId('capability-purpose-mag')).toBeInTheDocument();
    expect(screen.queryByTestId('capability-purpose-mas')).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'no-such-package' } });
    expect(screen.getByTestId('settings-agents-filter-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-agents-empty')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('settings-agents-reset-filters'));
    expect(screen.getByTestId('capability-summary-catalog')).toHaveTextContent('Showing 6 / 6');
    expect(screen.queryByTestId('settings-agents-filter-empty')).not.toBeInTheDocument();
  });

  it('searches dedicated capability summaries in Chinese', () => {
    translationMocks.language = 'zh-CN';
    appStateOverrides.appState = appStateWithDirectory([
      {
        package_id: 'mas-scholar-skills',
        display_name: 'MAS Scholar Skills',
        package_role: 'framework_capability_package',
        installed: true,
        status: 'ready',
      },
      {
        package_id: 'opl-flow',
        display_name: 'OPL Flow',
        package_role: 'workflow_profile',
        installed: true,
        status: 'ready',
      },
    ]);
    renderCapabilities(<AgentPackagesSettingsContent />);

    const search = screen.getByTestId('settings-agents-catalog-search');
    expect(screen.getByTestId('capability-description-mas-scholar-skills')).toHaveTextContent(
      '为医学科研智能体提供可复用科研能力'
    );
    expect(screen.getByTestId('capability-description-opl-flow')).toHaveTextContent(
      '管理 OPL 推荐工作流与受管 Codex 策略'
    );

    fireEvent.change(search, { target: { value: '提供可复用' } });
    expect(screen.getByTestId('capability-purpose-mas-scholar-skills')).toBeInTheDocument();
    expect(screen.queryByTestId('capability-purpose-opl-flow')).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: '管理 opl' } });
    expect(screen.getByTestId('capability-purpose-opl-flow')).toBeInTheDocument();
    expect(screen.queryByTestId('capability-purpose-mas-scholar-skills')).not.toBeInTheDocument();
  });

  it('orders dynamic agents by projected title, separates workflows, and nests Framework-reported dependencies', async () => {
    appStateOverrides.appState = appStateWithDirectory(
      [
        {
          package_id: 'oma',
          display_name: 'OPL Meta Agent',
          package_role: 'standard_agent',
          installed: true,
          status: 'ready',
        },
        {
          package_id: 'mas-scholar-skills',
          display_name: 'MAS Scholar Skills',
          description: 'Research capabilities used by MAS.',
          package_role: 'framework_capability_package',
          installed: true,
          status: 'ready',
        },
        {
          package_id: 'opl-flow',
          display_name: 'OPL Flow',
          package_role: 'workflow_profile',
          installed: true,
          status: 'ready',
        },
        {
          package_id: 'mag',
          package_role: 'standard_agent',
          installed: true,
          status: 'ready',
        },
        {
          package_id: 'mas',
          package_role: 'standard_agent',
          installed: true,
          status: 'ready',
        },
        {
          package_id: 'obf',
          package_role: 'standard_agent',
          installed: true,
          status: 'ready',
        },
        {
          package_id: 'rca',
          package_role: 'standard_agent',
          installed: true,
          status: 'ready',
        },
      ],
      {
        statusEntries: [
          {
            package_id: 'mas-scholar-skills',
            dependent_guard: {
              required_by_package_ids: ['mas'],
              disable: { allowed: false, reason_code: 'required_by_installed_package' },
              uninstall: { allowed: false, reason_code: 'required_by_installed_package' },
            },
          },
        ],
      }
    );
    renderCapabilities(<AgentPackagesSettingsContent />);

    const groups = screen.getByTestId('settings-agents-catalog-groups');
    const rowOrder = Array.from(groups.querySelectorAll<HTMLElement>("[data-testid^='capability-purpose-']")).map(
      (row) => row.dataset.testid?.replace('capability-purpose-', '')
    );
    expect(rowOrder).toEqual(['mag', 'mas', 'mas-scholar-skills', 'obf', 'oma', 'rca', 'opl-flow']);
    expect(screen.getByTestId('settings-agents-group-frequent')).toHaveTextContent('Frequent5');
    expect(screen.getByTestId('settings-agents-group-other')).toHaveTextContent('Other1');
    expect(screen.queryByTestId('settings-agents-group-needsAttention')).not.toBeInTheDocument();
    expect(screen.getByTestId('capability-summary-composition')).toHaveTextContent(
      'Runnable agents 5 · Workflows 1 · Supporting capabilities 1'
    );

    const scholarSkills = screen.getByTestId('capability-purpose-mas-scholar-skills');
    expect(scholarSkills).toHaveClass('opl-settings-capability-row--dependent');
    expect(scholarSkills).toHaveAttribute('data-parent-capability', 'mas');
    expect(scholarSkills).toHaveTextContent('Supports Med Auto Science');
    expect(scholarSkills).not.toHaveTextContent('Supporting capability');
    expect(groups).not.toHaveTextContent('standard_agent');
    expect(groups).not.toHaveTextContent('workflow_profile');
    expect(groups).not.toHaveTextContent('framework_capability_package');

    await chooseSelectOption('settings-agents-role-filter', 'Supporting capability');
    const filteredScholarSkills = screen.getByTestId('capability-purpose-mas-scholar-skills');
    expect(filteredScholarSkills).not.toHaveClass('opl-settings-capability-row--dependent');
    expect(filteredScholarSkills).not.toHaveAttribute('data-parent-capability');
    expect(screen.getByTestId('settings-agents-group-other')).toBeInTheDocument();
    expect(screen.queryByTestId('capability-purpose-mas')).not.toBeInTheDocument();
  });

  it('moves a healthy parent entry to needs attention when a nested dependency requires repair', () => {
    appStateOverrides.appState = appStateWithDirectory(
      [
        {
          package_id: 'mas',
          display_name: 'Med Auto Science',
          package_role: 'standard_agent',
          installed: true,
          status: 'ready',
        },
        {
          package_id: 'mas-scholar-skills',
          display_name: 'MAS Scholar Skills',
          package_role: 'framework_capability_package',
          installed: true,
          status: 'failed',
        },
      ],
      {
        statusEntries: [
          {
            package_id: 'mas-scholar-skills',
            dependent_guard: {
              required_by_package_ids: ['mas'],
              disable: { allowed: false, reason_code: 'required_by_installed_package' },
              uninstall: { allowed: false, reason_code: 'required_by_installed_package' },
            },
          },
        ],
      }
    );

    renderCapabilities(<AgentPackagesSettingsContent />);

    const needsAttention = screen.getByTestId('settings-agents-group-needsAttention');
    const parent = screen.getByTestId('capability-purpose-mas');
    const dependent = screen.getByTestId('capability-purpose-mas-scholar-skills');
    expect(needsAttention).toContainElement(parent);
    expect(needsAttention).toContainElement(dependent);
    expect(screen.queryByTestId('settings-agents-group-frequent')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('settings-agents-catalog-search'), {
      target: { value: 'advance medical' },
    });
    expect(screen.getByTestId('settings-agents-group-needsAttention')).toContainElement(
      screen.getByTestId('capability-purpose-mas')
    );
    expect(screen.queryByTestId('capability-purpose-mas-scholar-skills')).not.toBeInTheDocument();
  });

  it('filters canonical package roles, statuses, and source explanation kinds', async () => {
    appStateOverrides.appState = appStateWithDirectory([
      {
        package_id: 'mas',
        package_role: 'standard_agent',
        installed: true,
        installed_version: '1.0.0',
        trust_tier: 'first_party',
        readiness: { status: 'ready', operational_ready: true, launch_allowed: true },
        source_explanation: {
          kind: 'first_party_release_catalog',
          source: 'first_party',
          summary: 'First-party release catalog',
        },
      },
      {
        package_id: 'mag',
        package_role: 'standard_agent',
        installed: true,
        installed_version: '1.0.0',
        readiness: { status: 'update_available', operational_ready: true, launch_allowed: true },
        source_explanation: {
          kind: 'agent_package_registry_cache',
          source: 'third_party',
          summary: 'Public registry',
        },
      },
      {
        package_id: 'oma',
        package_role: 'framework_capability_package',
        installed: true,
        installed_version: '1.0.0',
        readiness: {
          status: 'verification_deferred',
          operational_ready: false,
          launch_allowed: false,
          verification_deferred: true,
          reason: 'live_verification_deferred',
        },
        source_explanation: {
          kind: 'installed_package_lock',
          source: 'developer_checkout_override',
          summary: 'Installed from a developer checkout',
        },
      },
    ]);
    renderCapabilities(<AgentPackagesSettingsContent />);

    const managedRow = screen.getByTestId('capability-purpose-mas');
    expect(within(managedRow).queryByTestId('capability-source-mas')).not.toBeInTheDocument();
    expect(within(managedRow).getByTestId('capability-conversation-mas')).not.toHaveTextContent('Complete setup');
    expect(within(managedRow).getByTestId('capability-controls-mas')).toBeInTheDocument();
    expect(managedRow).not.toHaveTextContent('first_party');
    fireEvent.click(screen.getByTestId('capability-open-details-mas'));
    expect(screen.getByTestId('capability-product-details-mas')).toHaveTextContent('OPL managed package');
    fireEvent.click(screen.getByTestId('capability-details-close'));
    fireEvent.click(screen.getByTestId('capability-open-details-mag'));
    expect(screen.getByTestId('capability-product-details-mag')).toHaveTextContent('Registry install');
    fireEvent.click(screen.getByTestId('capability-details-close'));
    fireEvent.click(screen.getByTestId('capability-open-details-oma'));
    expect(screen.getByTestId('capability-product-details-oma')).toHaveTextContent('Local developer source');
    fireEvent.click(screen.getByTestId('capability-details-close'));

    expect(screen.getByTestId('agent-package-catalog')).not.toHaveTextContent('framework_capability_package');
    await chooseSelectOption('settings-agents-role-filter', 'Supporting capability');
    expect(screen.getByTestId('capability-purpose-oma')).toBeInTheDocument();
    expect(screen.queryByTestId('capability-purpose-mas')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('settings-agents-reset-filters'));

    await chooseSelectOption('settings-agents-status-filter', 'Available');
    expect(screen.getByTestId('capability-purpose-oma')).toBeInTheDocument();
    expect(screen.getByTestId('capability-purpose-mas')).toBeInTheDocument();
    expect(screen.queryByTestId('capability-purpose-mag')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('settings-agents-reset-filters'));

    await chooseSelectOption('settings-agents-source-filter', 'Registry install');
    expect(screen.getByTestId('capability-purpose-mag')).toBeInTheDocument();
    expect(screen.queryByTestId('capability-purpose-mas')).not.toBeInTheDocument();
  });

  it('distinguishes loading, refreshing, canonical empty, failed, and stale-with-last-good states', () => {
    appStateOverrides.appState = appStateWithDirectory([]);
    appStateOverrides.loading = true;
    const loadingView = renderCapabilities(<AgentPackagesSettingsContent />);
    expect(screen.getByTestId('settings-agents-loading')).toHaveAttribute('data-state', 'loading');
    expect(screen.queryByTestId('settings-agents-empty')).not.toBeInTheDocument();
    loadingView.unmount();

    appStateOverrides.loading = false;
    appStateOverrides.refreshing = true;
    appStateOverrides.appState = appStateWithDirectory([
      { package_id: 'example-agent', display_name: 'Example Agent', installed: true, status: 'ready' },
    ]);
    const refreshingView = renderCapabilities(<AgentPackagesSettingsContent />);
    expect(screen.getByTestId('settings-agents-loading')).toHaveAttribute('data-state', 'refreshing');
    expect(screen.getByTestId('capability-purpose-example-agent')).toBeInTheDocument();
    refreshingView.unmount();

    appStateOverrides.refreshing = false;
    appStateOverrides.appState = appStateWithDirectory([]);
    const emptyView = renderCapabilities(<AgentPackagesSettingsContent />);
    expect(screen.getByTestId('settings-agents-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-agents-error')).not.toBeInTheDocument();
    emptyView.unmount();

    appStateOverrides.error = 'app state unavailable';
    const failedView = renderCapabilities(<AgentPackagesSettingsContent />);
    expect(screen.getByTestId('settings-agents-error')).toHaveTextContent('app state unavailable');
    fireEvent.click(screen.getByTestId('settings-agents-retry'));
    expect(bridgeMocks.loadAppState).toHaveBeenCalledWith('fast', { showRefreshing: true });
    failedView.unmount();

    appStateOverrides.appState = appStateWithDirectory([
      { package_id: 'example-agent', display_name: 'Example Agent', installed: true, status: 'ready' },
    ]);
    renderCapabilities(<AgentPackagesSettingsContent />);
    expect(screen.getByTestId('settings-agents-stale')).toHaveTextContent('app state unavailable');
    expect(screen.queryByTestId('settings-agents-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('capability-purpose-example-agent')).toBeInTheDocument();
  });

  it('keeps an attention-required directory with rows out of stale and failed catalog states', () => {
    appStateOverrides.appState = appStateWithDirectory(
      [{ package_id: 'example-agent', display_name: 'Example Agent', installed: true, status: 'attention_needed' }],
      { directoryStatus: 'attention_required' }
    );
    renderCapabilities(<AgentPackagesSettingsContent />);

    expect(screen.getByTestId('capability-purpose-example-agent')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-agents-stale')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-agents-error')).not.toBeInTheDocument();
  });

  it('keeps an installed package that is handled at domain stage runtime available without preconfiguration', () => {
    appStateOverrides.appState = appStateWithDirectory([
      {
        package_id: 'example-agent',
        display_name: 'Example Agent',
        installed: true,
        readiness: {
          status: 'activation_required',
          operational_ready: true,
          launch_allowed: true,
          reason: 'package_activation_required',
        },
      },
    ]);
    renderCapabilities(<AgentPackagesSettingsContent />);

    expect(within(screen.getByTestId('capability-purpose-example-agent')).getByText('Available')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-agents-exception')).not.toBeInTheDocument();
    expect(screen.getByTestId('capability-summary-grid')).toHaveTextContent('Available');
  });

  it('uses canonical directory readiness instead of stale package diagnostics for user availability', () => {
    appStateOverrides.appState = appStateWithDirectory(
      [
        {
          package_id: 'mas',
          package_role: 'standard_agent',
          installed: true,
          readiness: {
            status: 'ready',
            operational_ready: true,
            launch_allowed: true,
            reason: 'use_boundary_reconciliation_ready',
          },
        },
      ],
      {
        statusEntries: [
          {
            package_id: 'mas',
            status: 'available',
            operational_ready: false,
            launch_allowed: false,
            launch_blocked_reason: null,
            allowed_when_blocked: ['status', 'doctor', 'repair'],
            capability_exposure: { status: 'visible', codex_visible: true },
          },
        ],
      }
    );
    renderCapabilities(<AgentPackagesSettingsContent />);

    const row = screen.getByTestId('capability-purpose-mas');
    expect(within(row).getByText('Available')).toBeInTheDocument();
    expect(within(row).getByTestId('capability-conversation-mas')).toHaveTextContent('Available for conversations');
    expect(within(row).queryByText('Temporarily unavailable')).not.toBeInTheDocument();
    expect(screen.getByTestId('capability-summary-conversation')).toHaveTextContent('1 / 1');
    fireEvent.click(screen.getByTestId('capability-open-details-mas'));
    expect(screen.queryByTestId('capability-readiness-mas')).not.toBeInTheDocument();
    expect(screen.queryByText('use_boundary_reconciliation_ready')).not.toBeInTheDocument();
  });

  it('presents deferred local verification as ordinarily available', () => {
    appStateOverrides.appState = appStateWithDirectory([
      {
        package_id: 'mas',
        package_role: 'standard_agent',
        installed: true,
        readiness: {
          status: 'verification_deferred',
          operational_ready: false,
          launch_allowed: false,
          verification_deferred: true,
          reason: 'live_verification_deferred',
        },
      },
    ]);
    renderCapabilities(<AgentPackagesSettingsContent />);

    const row = screen.getByTestId('capability-purpose-mas');
    expect(within(row).getByText('Available')).toBeInTheDocument();
    expect(within(row).getByTestId('capability-conversation-mas')).toHaveTextContent('Available for conversations');
    expect(within(row).queryByText('Local check not complete')).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Review local check' })).not.toBeInTheDocument();
    expect(screen.getByTestId('capability-summary-conversation')).toHaveTextContent('1 / 1');
    expect(screen.getByTestId('capability-summary-grid')).toHaveTextContent('Available');
    fireEvent.click(screen.getByTestId('capability-open-details-mas'));
    expect(screen.queryByTestId('capability-readiness-mas')).not.toBeInTheDocument();
  });

  it('keeps a row status read error local to that package and exposes its failure detail', () => {
    appStateOverrides.appState = appStateWithDirectory([
      {
        package_id: 'example-agent',
        display_name: 'Example Agent',
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
    ]);
    renderCapabilities(<AgentPackagesSettingsContent />);

    expect(screen.queryByTestId('settings-agents-error')).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('capability-purpose-example-agent')).getByText('Repair required')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('capability-open-details-example-agent'));
    fireEvent.click(screen.getByTestId('capability-advanced-toggle-example-agent'));
    expect(screen.getByTestId('capability-details-example-agent')).toHaveTextContent('package status unavailable');
  });

  it('executes install from its exact action but defers activation outside Settings', async () => {
    const installAction = actionFixture(
      'install_from_manifest_url',
      { manifest_url_ref: 'opl://agent-package-manifest/example-agent/stable' },
      ['manifest_url_ref']
    );
    appStateOverrides.appState = appStateWithDirectory([
      {
        package_id: 'example-agent',
        display_name: 'Example Agent',
        installed: false,
        installability: { status: 'installable', installable: true },
        readiness: {
          status: 'not_installed',
          operational_ready: false,
          launch_allowed: false,
          verification_deferred: false,
          reason: 'package_not_installed',
        },
        recommended_action: 'install_from_manifest_url',
        recommended_action_ref: installAction,
        available_actions: [installAction],
      },
    ]);
    const installView = renderCapabilities(<AgentPackagesSettingsContent />);
    fireEvent.click(screen.getByTestId('agent-package-install-example-agent'));
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'install_from_manifest_url',
        dryRun: false,
        payloadRefsOnlyJson: { manifest_url_ref: 'opl://agent-package-manifest/example-agent/stable' },
      })
    );
    expect(bridgeMocks.executeActionInvoke.mock.calls[0]?.[0]?.payloadRefsOnlyJson).not.toHaveProperty('package_id');
    installView.unmount();

    bridgeMocks.executeActionInvoke.mockClear();
    const activationAction = actionFixture(
      'agent_package_activate',
      { package_id: 'example-agent', scope: 'workspace' },
      ['package_id', 'scope', 'target_workspace or target_quest']
    );
    appStateOverrides.appState = appStateWithDirectory(
      [
        {
          package_id: 'example-agent',
          display_name: 'Example Agent',
          installed: true,
          readiness: {
            status: 'activation_required',
            operational_ready: false,
            launch_allowed: false,
            verification_deferred: false,
            reason: 'package_activation_required',
          },
          recommended_action: 'agent_package_activate',
          recommended_action_ref: activationAction,
          available_actions: [activationAction],
        },
      ],
      {
        workspaceRootPath: '/workspace/selected',
        statusEntries: [
          {
            package_id: 'example-agent',
            activation_action: {
              action_id: 'agent_package_activate',
              command_ref: 'opl app action execute --action agent_package_activate --payload <json> --json',
              enabled: true,
              preparation_status: 'ready',
              reason_code: 'use_boundary_reconciliation_ready',
            },
          },
        ],
      }
    );
    renderCapabilities(<AgentPackagesSettingsContent />);
    fireEvent.click(screen.getByTestId('capability-open-details-example-agent'));
    fireEvent.click(screen.getByTestId('capability-advanced-toggle-example-agent'));
    expect(screen.getByTestId('capability-advanced-example-agent')).toHaveTextContent(
      'opl app action execute --action agent_package_activate --payload <json> --json'
    );
    expect(screen.queryByTestId('agent-package-activate-example-agent')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-agents-workspace-required')).not.toBeInTheDocument();
    expect(screen.getByTestId('capability-purpose-example-agent')).toHaveTextContent('Available');
    expect(screen.getByTestId('capability-conversation-example-agent')).toHaveTextContent(
      'Available for conversations'
    );
    expect(bridgeMocks.executeActionInvoke).not.toHaveBeenCalled();
  });

  it('does not expose package-id-only activation as an ordinary Settings action', () => {
    const activationAction = actionFixture('agent_package_activate', { package_id: 'example-agent' }, ['package_id']);
    appStateOverrides.appState = appStateWithDirectory(
      [
        {
          package_id: 'example-agent',
          display_name: 'Example Agent',
          installed: true,
          readiness: {
            status: 'verification_deferred',
            operational_ready: false,
            launch_allowed: false,
            verification_deferred: true,
            reason: 'live_verification_deferred',
          },
          recommended_action: 'agent_package_activate',
          recommended_action_ref: activationAction,
          available_actions: [activationAction],
        },
      ],
      { workspaceRootPath: null, statusEntries: [] }
    );
    renderCapabilities(<AgentPackagesSettingsContent />);

    expect(screen.queryByTestId('agent-package-activate-example-agent')).not.toBeInTheDocument();
    expect(screen.getByTestId('capability-purpose-example-agent')).toHaveTextContent('Available');
    expect(bridgeMocks.executeActionInvoke).not.toHaveBeenCalled();
  });

  it('renders canonical recommended update, repair, and registry refresh actions on package rows', async () => {
    const updateAction = actionFixture('agent_package_update', { package_id: 'mag' }, ['package_id']);
    const repairAction = actionFixture('agent_package_repair', { package_id: 'rca' }, ['package_id']);
    const refreshAction = actionFixture('refresh_registry', { registry_url: 'https://example.test/registry.json' }, [
      'registry_url',
    ]);
    appStateOverrides.appState = appStateWithDirectory([
      {
        package_id: 'mag',
        installed: true,
        status: 'update_available',
        recommended_action: 'agent_package_update',
        recommended_action_ref: updateAction,
        available_actions: [updateAction],
      },
      {
        package_id: 'rca',
        installed: true,
        status: 'failed_with_repair',
        recommended_action: 'agent_package_repair',
        recommended_action_ref: repairAction,
        available_actions: [repairAction],
      },
      {
        package_id: 'example-agent',
        installed: true,
        status: 'ready',
        recommended_action: 'refresh_registry',
        recommended_action_ref: refreshAction,
        available_actions: [refreshAction],
      },
    ]);
    renderCapabilities(<AgentPackagesSettingsContent />);

    fireEvent.click(screen.getByTestId('agent-package-update-mag'));
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'agent_package_update',
        dryRun: false,
        payloadRefsOnlyJson: { package_id: 'mag' },
      })
    );
    fireEvent.click(screen.getByTestId('agent-package-repair-rca'));
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'agent_package_repair',
        dryRun: false,
        payloadRefsOnlyJson: { package_id: 'rca' },
      })
    );
    fireEvent.click(screen.getByTestId('agent-package-refresh-example-agent'));
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'refresh_registry',
        dryRun: false,
        payloadRefsOnlyJson: { registry_url: 'https://example.test/registry.json' },
      })
    );
  });

  it('does not route workspace-scoped activation through global Workspace settings', () => {
    const activationAction = actionFixture(
      'agent_package_activate',
      { package_id: 'example-agent', scope: 'workspace' },
      ['package_id', 'scope', 'target_workspace or target_quest']
    );
    appStateOverrides.appState = appStateWithDirectory(
      [
        {
          package_id: 'example-agent',
          display_name: 'Example Agent',
          installed: true,
          readiness: {
            status: 'activation_required',
            operational_ready: false,
            launch_allowed: false,
            verification_deferred: false,
            reason: 'package_activation_required',
          },
          recommended_action: 'agent_package_activate',
          recommended_action_ref: activationAction,
          available_actions: [activationAction],
        },
      ],
      {
        workspaceRootPath: null,
        statusEntries: [
          {
            package_id: 'example-agent',
            activation_action: {
              action_id: 'agent_package_activate',
              command_ref: 'opl app action execute --action agent_package_activate --payload <json> --json',
              enabled: true,
              preparation_status: 'ready',
              reason_code: 'use_boundary_reconciliation_ready',
            },
          },
        ],
      }
    );
    renderCapabilities(<AgentPackagesSettingsContent />);

    expect(screen.queryByTestId('agent-package-activate-example-agent')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-agents-workspace-required')).not.toBeInTheDocument();
    expect(screen.getByTestId('capability-purpose-example-agent')).toHaveTextContent('Available');
    expect(bridgeMocks.executeActionInvoke).not.toHaveBeenCalled();
  });

  it('does not expose a directory-only activation action in Settings', () => {
    const activationAction = actionFixture(
      'agent_package_activate',
      { package_id: 'example-agent', scope: 'workspace' },
      ['package_id', 'scope', 'target_workspace or target_quest']
    );
    appStateOverrides.appState = appStateWithDirectory(
      [
        {
          package_id: 'example-agent',
          installed: true,
          recommended_action: 'agent_package_activate',
          recommended_action_ref: activationAction,
          available_actions: [activationAction],
        },
      ],
      { workspaceRootPath: '/workspace/selected', statusEntries: [] }
    );
    renderCapabilities(<AgentPackagesSettingsContent />);

    expect(screen.queryByTestId('agent-package-activate-example-agent')).not.toBeInTheDocument();
    expect(bridgeMocks.executeActionInvoke).not.toHaveBeenCalled();
  });

  it('keeps an explicit disabled activation verdict out of ordinary Settings actions', () => {
    const activationAction = actionFixture(
      'agent_package_activate',
      { package_id: 'example-agent', scope: 'workspace' },
      ['package_id', 'scope', 'target_workspace or target_quest']
    );
    appStateOverrides.appState = appStateWithDirectory(
      [
        {
          package_id: 'example-agent',
          installed: true,
          recommended_action: 'agent_package_activate',
          recommended_action_ref: activationAction,
          available_actions: [activationAction],
        },
      ],
      {
        workspaceRootPath: '/workspace/selected',
        statusEntries: [
          {
            package_id: 'example-agent',
            activation_action: {
              action_id: 'agent_package_activate',
              command_ref: 'opl app action execute --action agent_package_activate --payload <json> --json',
              enabled: false,
              preparation_status: 'ready',
              reason_code: 'package_disabled',
            },
          },
        ],
      }
    );
    renderCapabilities(<AgentPackagesSettingsContent />);

    expect(screen.queryByTestId('agent-package-activate-example-agent')).not.toBeInTheDocument();
    expect(bridgeMocks.executeActionInvoke).not.toHaveBeenCalled();
  });

  it('fails soft when a projected row action has fields outside the exact ABI', () => {
    const malformedAction = {
      ...actionFixture('install_from_manifest_url', { package_id: 'example-agent' }, ['package_id']),
      locally_inferred: true,
    };
    appStateOverrides.appState = appStateWithDirectory([
      {
        package_id: 'example-agent',
        display_name: 'Example Agent',
        installed: false,
        recommended_action: 'install_from_manifest_url',
        recommended_action_ref: malformedAction,
        available_actions: [malformedAction],
      },
    ]);
    renderCapabilities(<AgentPackagesSettingsContent />);

    expect(screen.getByTestId('capability-purpose-example-agent')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-package-install-example-agent')).not.toBeInTheDocument();
  });

  it('rejects the retired agent_package_install action id', () => {
    const legacyAction = actionFixture('agent_package_install', { package_id: 'example-agent' }, ['package_id']);
    appStateOverrides.appState = appStateWithDirectory([
      {
        package_id: 'example-agent',
        installed: false,
        recommended_action: 'agent_package_install',
        recommended_action_ref: legacyAction,
        available_actions: [legacyAction],
      },
    ]);
    renderCapabilities(<AgentPackagesSettingsContent />);

    expect(screen.getByTestId('capability-purpose-example-agent')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-package-install-example-agent')).not.toBeInTheDocument();
  });

  it('keeps skills and third-party tools on the capabilities page', async () => {
    const onTabChange = vi.fn();
    const Harness = () => {
      const [activeTab, setActiveTab] = React.useState<CapabilitiesTab>('opl_flow_managed');
      return (
        <CapabilitiesSettingsContent
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            onTabChange(tab);
          }}
        />
      );
    };
    renderCapabilities(<Harness />);

    expect(screen.getByText('Capabilities')).toBeInTheDocument();
    expect(screen.getByTestId('settings-page-capabilities')).toBeInTheDocument();
    expect(screen.getByTestId('settings-capabilities-opl-flow-managed')).toBeInTheDocument();
    expect(screen.getByTestId('settings-capabilities-technical-details')).toBeInTheDocument();
    expect(screen.getByTestId('settings-capabilities-primary-action')).toBeInTheDocument();
    expect(screen.getByTestId('skills-detail')).toBeInTheDocument();
    expect(screen.getByTestId('skills-detail')).toHaveAttribute(
      'data-flow-skills',
      'opl-flow,officecli-pptx,officecli-docx'
    );
    expect(screen.getByTestId('skills-detail')).toHaveAttribute(
      'data-flow-skill-statuses',
      'opl-flow:true,officecli-pptx:true,officecli-docx:true'
    );
    expect(screen.queryByTestId('agent-package-catalog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('settings-capabilities-primary-action'));
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'settings_sync_capabilities',
        dryRun: false,
      })
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Manually added' }));
    expect(onTabChange).toHaveBeenCalledWith('manual_and_third_party');
    await waitFor(() => expect(screen.getByTestId('settings-capabilities-third-party')).toBeInTheDocument());
    expect(screen.getByTestId('settings-capabilities-primary-action').closest('[role="tabpanel"]')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    expect(screen.getByTestId('tools-detail')).toBeInTheDocument();
    expect(screen.getByTestId('settings-capabilities-voice-input')).toBeInTheDocument();
    expect(screen.getByTestId('voice-input-detail')).toBeInTheDocument();
  });

  it('opens the local capabilities tab from the full third-party section route', async () => {
    renderCapabilities(<CapabilitiesSettings />, false, '/settings/capabilities?section=third-party');

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Manually added' })).toHaveAttribute('aria-selected', 'true')
    );
    expect(screen.getByTestId('settings-capabilities-third-party')).toBeInTheDocument();
    expect(screen.getByTestId('settings-capabilities-third-party')).toHaveClass('opl-settings-flat-capabilities');
    for (const testId of [
      'settings-capabilities-manual-skills',
      'settings-capabilities-manual-tools',
      'settings-capabilities-voice-input',
    ]) {
      expect(screen.getByTestId(testId)).toHaveClass('opl-settings-flat-section');
      expect(screen.getByTestId(testId).className).not.toMatch(/\brounded|\bshadow/);
    }
    expect(screen.getByTestId('tools-detail')).toBeInTheDocument();
    expect(screen.getByTestId('voice-input-detail')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-capabilities-opl-flow-managed')).not.toBeInTheDocument();
  });

  it('configures the global developer profile and per-package runtime source through App actions', async () => {
    renderCapabilities(<AgentPackagesSettingsContent />);

    const profile = screen.getByTestId('opl-developer-profile-control');
    const disclosure = within(profile).getByTestId('opl-developer-profile-disclosure');
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    disclosure.focus();
    expect(disclosure).toHaveFocus();
    fireEvent.click(disclosure);
    expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    expect(profile).toHaveTextContent('/Users/test/workspace');
    expect(
      within(profile)
        .getAllByRole('radio')
        .map((control) => control.getAttribute('value'))
    ).toEqual(['auto', 'off', 'on', 'auto', 'off']);
    const maintenance = within(profile).getByTestId('opl-developer-profile-maintenance');
    expect(
      within(maintenance)
        .getAllByRole('radio')
        .map((control) => control.getAttribute('value'))
    ).toEqual(['auto', 'off']);
    expect(profile).toHaveTextContent('Maintain authorized development repositories');
    expect(profile).toHaveTextContent('Automatically active');
    expect(profile).toHaveTextContent('Automatic default');
    expect(profile).toHaveTextContent('7 direct · 0 pull request · 7 total');
    expect(screen.getByTestId('opl-developer-profile-protection')).toHaveTextContent('isolated worktree');
    expect(screen.getByTestId('capability-purpose-mas')).toHaveClass('opl-settings-capability-row');

    fireEvent.click(within(profile).getByText('Managed'));
    await waitFor(() =>
      expect(bridgeMocks.messageSuccess).toHaveBeenCalledWith('Runtime source updated and verified.')
    );
    expect(bridgeMocks.executeActionInvoke).toHaveBeenNthCalledWith(1, {
      actionId: 'developer_supervisor',
      dryRun: false,
      payloadRefsOnlyJson: {
        developerSupervisorEnabled: 'off',
        developerSupervisorMode: 'developer_apply_safe',
      },
    });
    expect(bridgeMocks.executeActionInvoke).toHaveBeenNthCalledWith(2, {
      actionId: 'developer_supervisor_refresh',
      dryRun: false,
    });
    expect(bridgeMocks.loadAppState).toHaveBeenCalledWith('fast', { showRefreshing: true, forceFresh: true });

    bridgeMocks.executeActionInvoke.mockClear();
    bridgeMocks.loadAppState.mockClear();
    bridgeMocks.messageSuccess.mockClear();
    fireEvent.click(within(maintenance).getByText('Off'));
    await waitFor(() =>
      expect(bridgeMocks.messageSuccess).toHaveBeenCalledWith('Runtime source updated and verified.')
    );
    expect(bridgeMocks.executeActionInvoke).toHaveBeenNthCalledWith(1, {
      actionId: 'developer_supervisor',
      dryRun: false,
      payloadRefsOnlyJson: {
        developerSupervisorEnabled: 'off',
        developerSupervisorMode: 'external_observe',
      },
    });
    expect(bridgeMocks.executeActionInvoke).toHaveBeenNthCalledWith(2, {
      actionId: 'developer_supervisor_refresh',
      dryRun: false,
    });

    bridgeMocks.executeActionInvoke.mockClear();
    bridgeMocks.loadAppState.mockClear();
    bridgeMocks.messageSuccess.mockClear();
    fireEvent.click(screen.getByTestId('capability-open-details-mas'));
    const details = screen.getByTestId('capability-details-mas');
    expect(details).toHaveTextContent('/Users/test/workspace/med-autoscience');
    expect(details).toHaveTextContent('/Users/test/Library/Application Support/OPL/state/modules/med-autoscience');

    fireEvent.click(within(details).getByText('Managed copy'));
    await waitFor(() =>
      expect(bridgeMocks.messageSuccess).toHaveBeenCalledWith('Runtime source updated and verified.')
    );
    expect(bridgeMocks.executeActionInvoke).toHaveBeenNthCalledWith(1, {
      actionId: 'developer_supervisor',
      dryRun: false,
      payloadRefsOnlyJson: {
        developerSupervisorModuleId: 'medautoscience',
        developerSupervisorModuleSource: 'managed',
      },
    });
    expect(bridgeMocks.executeActionInvoke).toHaveBeenNthCalledWith(2, {
      actionId: 'developer_supervisor_refresh',
      dryRun: false,
    });
  });

  it('does not report a Developer source change as complete when fresh readback is stale', async () => {
    bridgeMocks.loadAppState.mockResolvedValueOnce({ app_state: {} });
    renderCapabilities(<AgentPackagesSettingsContent />);

    fireEvent.click(screen.getByTestId('opl-developer-profile-disclosure'));
    fireEvent.click(within(screen.getByTestId('opl-developer-profile-control')).getByText('Managed'));

    await waitFor(() => expect(bridgeMocks.messageError).toHaveBeenCalledWith('Runtime source change not verified.'));
    expect(bridgeMocks.messageSuccess).not.toHaveBeenCalled();
    expect(bridgeMocks.loadAppState).toHaveBeenCalledWith('fast', { showRefreshing: true, forceFresh: true });
  });

  it('honors projected confirmation before changing the Developer runtime source', async () => {
    appStateOverrides.developerConfirmationRequired = true;
    renderCapabilities(<AgentPackagesSettingsContent />);

    fireEvent.click(screen.getByTestId('opl-developer-profile-disclosure'));
    fireEvent.click(within(screen.getByTestId('opl-developer-profile-control')).getByText('Managed'));

    await waitFor(() => expect(bridgeMocks.modalConfirm).toHaveBeenCalledTimes(1));
    expect(bridgeMocks.modalConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Change runtime source?',
        content: 'Verify the runtime source after changing it.',
      })
    );
    await waitFor(() =>
      expect(bridgeMocks.messageSuccess).toHaveBeenCalledWith('Runtime source updated and verified.')
    );
  });

  it('shows fast developer inspection as pending without claiming an identity mismatch', () => {
    appStateOverrides.developerMode = {
      enabled: 'auto',
      mode: 'developer_apply_safe',
      effective_state: 'inspection_pending',
      inactive_reason: 'authority_inspection_pending',
      config_source: 'default',
      developer_workspace: { selected_path: '/Users/test/workspace' },
      github_identity: { status: 'skipped', login: null },
      repo_authority: {
        status: 'not_checked',
        direct_write_repo_count: 0,
        pr_route_repo_count: 0,
        required_repo_count: 0,
      },
      repository_maintenance_protection: {
        status: 'ready',
        dirty_worktree: { requires_isolated_worktree: true },
        branch: { direct_push_to_protected_branch: false },
      },
    };

    renderCapabilities(<AgentPackagesSettingsContent />);

    fireEvent.click(screen.getByTestId('opl-developer-profile-disclosure'));
    const pending = screen.getByTestId('opl-developer-profile-inspection-pending');
    expect(pending).toHaveTextContent('Checking GitHub identity and repository authority');
    expect(screen.queryByText(/identity mismatch/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-developer-profile-inactive-reason')).not.toBeInTheDocument();
  });

  it('uses stable user-facing fallbacks for unknown Developer projection values', () => {
    appStateOverrides.developerMode = {
      enabled: 'auto',
      mode: 'developer_apply_safe',
      effective_state: 'inactive_future_policy',
      inactive_reason: 'future_inactive_reason',
      config_source: 'future_configuration_source',
      developer_workspace: { selected_path: '/Users/test/workspace' },
      github_identity: { status: 'skipped', login: null },
      repo_authority: { status: 'not_checked', required_repo_count: 0 },
      repository_maintenance_protection: { status: 'not_reported' },
    };
    renderCapabilities(<AgentPackagesSettingsContent />);

    fireEvent.click(screen.getByTestId('opl-developer-profile-disclosure'));
    const profile = screen.getByTestId('opl-developer-profile-control');
    expect(profile).toHaveTextContent('Framework-managed configuration');
    expect(profile).toHaveTextContent(
      'The runtime source is currently inactive. Refresh the page or open Maintenance for details.'
    );
    expect(profile).not.toHaveTextContent('future_configuration_source');
    expect(profile).not.toHaveTextContent('future_inactive_reason');
  });

  it('does not expose unknown Framework reason enums in capability details', () => {
    appStateOverrides.appState = appStateWithDirectory(
      [
        {
          package_id: 'example-agent',
          package_role: 'framework_capability_package',
          installed: true,
          status: 'blocked',
          readiness: { status: 'blocked' },
        },
      ],
      {
        statusEntries: [
          {
            package_id: 'example-agent',
            status: 'blocked',
            operational_ready: false,
            launch_allowed: false,
            launch_blocked_reason: 'future_framework_reason',
            capability_exposure: { status: 'visible' },
          },
        ],
      }
    );
    renderCapabilities(<AgentPackagesSettingsContent />);

    fireEvent.click(screen.getByTestId('capability-open-details-example-agent'));
    const readiness = screen.getByTestId('capability-readiness-example-agent');
    expect(readiness).toHaveTextContent('Framework reported an issue that this App version does not yet recognize.');
    expect(readiness).not.toHaveTextContent('future_framework_reason');
  });

  it('keeps raw package identifiers out of the directory and restores focus after closing the desktop panel', async () => {
    renderCapabilities(<AgentPackagesSettingsContent />);

    const catalog = screen.getByTestId('agent-package-catalog');
    expect(within(catalog).getByText('OPL Book Forge')).toBeInTheDocument();
    for (const packageId of ['mas', 'mag', 'rca', 'obf', 'oma']) {
      expect(within(catalog).queryByText(packageId)).not.toBeInTheDocument();
    }
    for (const token of ['MAS', 'MAG', 'RCA', 'OBF', 'OMA']) {
      expect(within(catalog).queryByText(token)).not.toBeInTheDocument();
    }

    const row = screen.getByTestId('capability-purpose-obf');
    const trigger = screen.getByTestId('capability-open-details-obf');
    trigger.focus();
    fireEvent.click(trigger);

    const panel = await screen.findByTestId('capability-details-obf');
    expect(panel.tagName).toBe('ASIDE');
    expect(panel).not.toHaveAttribute('role', 'dialog');
    expect(panel).toHaveAccessibleName('Capability details OPL Book Forge');
    expect(panel).not.toHaveTextContent('obf');
    expect(panel).not.toHaveTextContent('OBF');
    expect(row).toHaveAttribute('data-selected', 'true');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('capability-details-obf')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(row).toHaveAttribute('data-selected', 'false');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('uses an accessible Drawer for capability details on mobile', async () => {
    renderCapabilities(<AgentPackagesSettingsContent />, true);

    const trigger = screen.getByTestId('capability-open-details-obf');
    trigger.focus();
    fireEvent.click(trigger);

    const drawer = await screen.findByRole('dialog', { name: 'Capability details OPL Book Forge' });
    expect(drawer.tagName).toBe('ASIDE');
    expect(drawer).toHaveAttribute('aria-modal', 'true');
    expect(drawer.closest('.arco-drawer')).not.toBeNull();

    fireEvent.click(within(drawer).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('verifies Home shortcut visibility/order and routes registry/install through App actions', async () => {
    renderCapabilities(<AgentPackagesSettingsContent />);

    fireEvent.click(screen.getByTestId('agent-package-home-toggle-details-mas'));
    expect(localStorage.getItem('opl.homeAgentShortcutPreferences.v2')).toBeNull();
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'agent_package_preferences_set',
        dryRun: false,
        payloadRefsOnlyJson: {
          package_id: 'mas',
          shortcut_id: 'research',
          visible: false,
          sort_order: 0,
        },
      })
    );
    await waitFor(() =>
      expect(bridgeMocks.loadAppState).toHaveBeenCalledWith('fast', { background: true, forceFresh: true })
    );
    await waitFor(() => expect(bridgeMocks.messageSuccess).toHaveBeenCalledWith('Action routed to OPL'));

    fireEvent.click(screen.getByTestId('capability-open-details-mas'));
    fireEvent.click(screen.getByTestId('agent-package-home-down-details-mas'));
    expect(localStorage.getItem('opl.homeAgentShortcutPreferences.v2')).toBeNull();
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'agent_package_preferences_set',
        dryRun: false,
        payloadRefsOnlyJson: {
          package_id: 'mas',
          shortcut_id: 'research',
          visible: true,
          sort_order: 1,
        },
      })
    );

    fireEvent.click(screen.getByTestId('capability-advanced-toggle-mas'));
    fireEvent.click(screen.getByTestId('agent-package-refresh-registry'));
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'refresh_registry',
        dryRun: false,
        payloadRefsOnlyJson: undefined,
      })
    );

    bridgeMocks.executeActionInvoke.mockResolvedValueOnce({
      ok: true,
      command: 'opl app action execute --action install_from_manifest_url --dry-run --json',
      parsed: {
        app_action_execution: {
          result: {
            opl_agent_package_install: {
              package_lock: { package_id: 'example-agent' },
            },
          },
        },
      },
    });
    bridgeMocks.executeActionInvoke.mockResolvedValueOnce({
      ok: true,
      command: 'opl app action execute --action install_from_manifest_url --json',
    });
    bridgeMocks.loadAppState.mockResolvedValueOnce({
      app_state: {
        agent_packages: {
          directory: {
            status: 'available',
            entries: [
              {
                package_id: 'example-agent',
                display_name: 'Example Agent',
                installed: true,
                readiness: { status: 'ready' },
              },
            ],
          },
        },
      },
    });
    bridgeMocks.modalConfirm.mockClear();
    bridgeMocks.messageSuccess.mockClear();

    fireEvent.click(screen.getByTestId('settings-agents-primary-action'));
    fireEvent.change(screen.getByTestId('agent-package-manifest-url'), {
      target: { value: 'https://example.test/agent.json' },
    });
    expect(screen.getByTestId('agent-package-trust-tier-required')).toBeInTheDocument();
    expect(screen.getByTestId('agent-package-install-manifest')).toBeDisabled();
    await chooseSelectOption('agent-package-trust-tier', 'Unverified third party');
    expect(screen.queryByTestId('agent-package-trust-tier-required')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('agent-package-install-manifest'));
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'install_from_manifest_url',
        dryRun: true,
        payloadRefsOnlyJson: {
          manifest_url: 'https://example.test/agent.json',
          trust_tier: 'third_party_unverified',
        },
      })
    );
    expect(bridgeMocks.modalConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Install example-agent?',
        content: 'Continue after reviewing the manifest.',
      })
    );
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'install_from_manifest_url',
        dryRun: false,
        payloadRefsOnlyJson: {
          manifest_url: 'https://example.test/agent.json',
          trust_tier: 'third_party_unverified',
        },
      })
    );
    expect(bridgeMocks.loadAppState).toHaveBeenCalledWith('fast', { showRefreshing: true, forceFresh: true });
    expect(bridgeMocks.messageSuccess).toHaveBeenCalledWith('Example Agent installed and verified: Available.');
  });

  it('renders and routes every projected Home shortcut for one future Agent Package', async () => {
    appStateOverrides.appState = appStateWithDirectory(
      [
        {
          package_id: 'future-agent',
          display_name: 'Future Agent',
          package_role: 'standard_agent',
          installed: true,
          status: 'ready',
          available_actions: [
            actionFixture('agent_package_preferences_set', { package_id: 'future-agent' }, [
              'package_id',
              'exposure_action or shortcut_id',
            ]),
          ],
        },
      ],
      {
        homeShortcutPreferences: [
          {
            package_id: 'future-agent',
            shortcut_id: 'future-main',
            visible: true,
            sort_order: 0,
            source: 'user_preference',
            installed: true,
          },
          {
            package_id: 'future-agent',
            shortcut_id: 'future-review',
            visible: true,
            sort_order: 1,
            source: 'user_preference',
            installed: true,
          },
        ],
      }
    );
    renderCapabilities(<AgentPackagesSettingsContent />);

    expect(screen.getByTestId('agent-package-home-toggle-details-future-agent-future-main')).toBeInTheDocument();
    const reviewSwitch = screen.getByTestId('agent-package-home-toggle-details-future-agent-future-review');
    expect(reviewSwitch).toBeInTheDocument();

    fireEvent.click(reviewSwitch);
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'agent_package_preferences_set',
        dryRun: false,
        payloadRefsOnlyJson: {
          package_id: 'future-agent',
          shortcut_id: 'future-review',
          visible: false,
          sort_order: 1,
        },
      })
    );
  });

  it('rolls Home visibility back when the App action fails', async () => {
    bridgeMocks.executeActionInvoke.mockResolvedValueOnce({
      ok: false,
      command: 'opl app action execute --action agent_package_preferences_set --json',
      error: { message: 'preference update failed' },
    });
    renderCapabilities(<AgentPackagesSettingsContent />);

    const homeSwitch = screen.getByTestId('agent-package-home-toggle-details-mas');
    expect(homeSwitch).toHaveClass('arco-switch-checked');
    fireEvent.click(homeSwitch);

    await waitFor(() => expect(homeSwitch).toHaveClass('arco-switch-checked'));
    expect(localStorage.getItem('opl.homeAgentShortcutPreferences.v2')).toBeNull();
  });

  it('rolls Home visibility back when fresh Framework readback is unavailable', async () => {
    bridgeMocks.loadAppState.mockResolvedValueOnce(null);
    renderCapabilities(<AgentPackagesSettingsContent />);

    const homeSwitch = screen.getByTestId('agent-package-home-toggle-details-mas');
    fireEvent.click(homeSwitch);

    await waitFor(() => expect(homeSwitch).toHaveClass('arco-switch-checked'));
    expect(bridgeMocks.loadAppState).toHaveBeenCalledWith('fast', { background: true, forceFresh: true });
    expect(bridgeMocks.messageSuccess).not.toHaveBeenCalled();
    expect(localStorage.getItem('opl.homeAgentShortcutPreferences.v2')).toBeNull();
  });

  it('replaces optimistic Home visibility with a mismatched Framework projection', async () => {
    bridgeMocks.loadAppState.mockResolvedValueOnce(homeShortcutReadback('research', true, 0));
    renderCapabilities(<AgentPackagesSettingsContent />);

    const homeSwitch = screen.getByTestId('agent-package-home-toggle-details-mas');
    fireEvent.click(homeSwitch);

    await waitFor(() => expect(homeSwitch).toHaveClass('arco-switch-checked'));
    expect(bridgeMocks.messageSuccess).not.toHaveBeenCalled();
    expect(localStorage.getItem('opl.homeAgentShortcutPreferences.v2')).toBeNull();
  });

  it('stops manifest installation when dry-run does not return a package identity', async () => {
    bridgeMocks.executeActionInvoke.mockResolvedValueOnce({
      ok: true,
      command: 'opl app action execute --action install_from_manifest_url --dry-run --json',
      parsed: { app_action_execution: { result: {} } },
    });
    renderCapabilities(<AgentPackagesSettingsContent />);

    fireEvent.click(screen.getByTestId('settings-agents-primary-action'));
    fireEvent.change(screen.getByTestId('agent-package-manifest-url'), {
      target: { value: 'https://example.test/missing-package.json' },
    });
    await chooseSelectOption('agent-package-trust-tier', 'Verified third party');
    fireEvent.click(screen.getByTestId('agent-package-install-manifest'));

    await waitFor(() =>
      expect(bridgeMocks.messageError).toHaveBeenCalledWith('Install preview did not return a package.')
    );
    expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledTimes(1);
    expect(bridgeMocks.modalConfirm).not.toHaveBeenCalled();
    expect(bridgeMocks.loadAppState).not.toHaveBeenCalled();
  });

  it('does not report manifest installation as complete when the fresh directory read is stale', async () => {
    bridgeMocks.executeActionInvoke.mockResolvedValueOnce({
      ok: true,
      command: 'opl app action execute --action install_from_manifest_url --dry-run --json',
      parsed: {
        app_action_execution: {
          result: {
            opl_agent_package_install: {
              package_lock: { package_id: 'example-agent' },
            },
          },
        },
      },
    });
    bridgeMocks.executeActionInvoke.mockResolvedValueOnce({
      ok: true,
      command: 'opl app action execute --action install_from_manifest_url --json',
    });
    bridgeMocks.loadAppState.mockResolvedValueOnce({
      app_state: { agent_packages: { directory: { status: 'available', entries: [] } } },
    });
    renderCapabilities(<AgentPackagesSettingsContent />);

    fireEvent.click(screen.getByTestId('settings-agents-primary-action'));
    fireEvent.change(screen.getByTestId('agent-package-manifest-url'), {
      target: { value: 'https://example.test/stale-package.json' },
    });
    await chooseSelectOption('agent-package-trust-tier', 'Verified third party');
    fireEvent.click(screen.getByTestId('agent-package-install-manifest'));

    await waitFor(() => expect(bridgeMocks.messageError).toHaveBeenCalledWith('Package installation not verified.'));
    expect(bridgeMocks.messageSuccess).not.toHaveBeenCalled();
    expect(bridgeMocks.loadAppState).toHaveBeenCalledWith('fast', { showRefreshing: true, forceFresh: true });
  });

  it('keeps other Home switches interactive while one shortcut preference is pending', async () => {
    let resolveResearch!: (result: { ok: true; command: string }) => void;
    const researchResult = new Promise<{ ok: true; command: string }>((resolve) => {
      resolveResearch = resolve;
    });
    bridgeMocks.executeActionInvoke.mockReturnValueOnce(researchResult);
    renderCapabilities(<AgentPackagesSettingsContent />);

    const researchSwitch = screen.getByTestId('agent-package-home-toggle-details-mas');
    const grantSwitch = screen.getByTestId('agent-package-home-toggle-details-mag');
    fireEvent.click(researchSwitch);

    await waitFor(() => expect(researchSwitch).toBeDisabled());
    expect(researchSwitch).toHaveClass('arco-switch-loading');
    expect(grantSwitch).not.toBeDisabled();
    fireEvent.click(researchSwitch);
    expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledTimes(1);

    fireEvent.click(grantSwitch);
    await waitFor(() => expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledTimes(2));
    expect(researchSwitch).toBeDisabled();

    await act(async () => {
      resolveResearch({
        ok: true,
        command: 'opl app action execute --action agent_package_preferences_set --json',
      });
    });

    await waitFor(() => expect(researchSwitch).not.toBeDisabled());
    expect(bridgeMocks.loadAppState).toHaveBeenCalledWith('fast', { background: true, forceFresh: true });
  });

  it('routes package lifecycle management actions through App action refs', async () => {
    renderCapabilities(<AgentPackagesSettingsContent />);

    fireEvent.click(screen.getByTestId('capability-open-details-mas'));
    expect(screen.getByTestId('agent-package-update-mas')).toBeDisabled();

    fireEvent.click(screen.getByTestId('capability-open-details-mag'));
    expect(screen.queryByText('https://example.test/mag.json')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('capability-advanced-toggle-mag'));
    expect(screen.getByText('https://example.test/mag.json')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('agent-package-update-mag'));
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'agent_package_update',
        dryRun: false,
        payloadRefsOnlyJson: {
          package_id: 'mag',
          manifest_url: 'https://example.test/mag.json',
        },
      })
    );

    fireEvent.click(screen.getByTestId('agent-package-repair-mag'));
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'agent_package_repair',
        dryRun: false,
        payloadRefsOnlyJson: { package_id: 'mag' },
      })
    );

    fireEvent.click(screen.getByTestId('agent-package-enabled-toggle-mag'));
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'agent_package_preferences_set',
        dryRun: false,
        payloadRefsOnlyJson: { package_id: 'mag', exposure_action: 'enable' },
      })
    );

    fireEvent.click(screen.getByTestId('agent-package-uninstall-mag'));
    expect(bridgeMocks.modalConfirm).toHaveBeenCalled();
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'agent_package_uninstall',
        dryRun: false,
        payloadRefsOnlyJson: { package_id: 'mag' },
      })
    );
  });

  it.each([
    ['disabled', 'Enable', null],
    ['enabled', 'Disable', 'Hide'],
    ['hidden', 'Disable', 'Show'],
    ['visible', 'Disable', 'Hide'],
  ] as const)(
    'renders enable and visibility controls from refreshed capability exposure state %s',
    (exposureStatus, enabledLabel, hiddenLabel) => {
      const preferenceAction = actionFixture('agent_package_preferences_set', { package_id: 'example-agent' }, [
        'package_id',
        'exposure_action or shortcut_id',
      ]);
      appStateOverrides.appState = appStateWithDirectory(
        [
          {
            package_id: 'example-agent',
            installed: true,
            status: 'ready',
            available_actions: [preferenceAction],
          },
        ],
        {
          statusEntries: [{ package_id: 'example-agent', capability_exposure: { status: exposureStatus } }],
        }
      );
      renderCapabilities(<AgentPackagesSettingsContent />);

      fireEvent.click(screen.getByTestId('capability-open-details-example-agent'));
      expect(screen.getByTestId('agent-package-enabled-toggle-example-agent')).toHaveTextContent(enabledLabel);
      if (hiddenLabel) {
        expect(screen.getByTestId('agent-package-hidden-toggle-example-agent')).toHaveTextContent(hiddenLabel);
      } else {
        expect(screen.queryByTestId('agent-package-hidden-toggle-example-agent')).not.toBeInTheDocument();
      }
    }
  );

  it('routes Show from a refreshed hidden exposure state through the producer action', async () => {
    const preferenceAction = actionFixture('agent_package_preferences_set', { package_id: 'example-agent' }, [
      'package_id',
      'exposure_action or shortcut_id',
    ]);
    appStateOverrides.appState = appStateWithDirectory(
      [
        {
          package_id: 'example-agent',
          installed: true,
          status: 'ready',
          available_actions: [preferenceAction],
        },
      ],
      { statusEntries: [{ package_id: 'example-agent', capability_exposure: { status: 'hidden' } }] }
    );
    renderCapabilities(<AgentPackagesSettingsContent />);

    fireEvent.click(screen.getByTestId('capability-open-details-example-agent'));
    fireEvent.click(screen.getByTestId('agent-package-hidden-toggle-example-agent'));
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'agent_package_preferences_set',
        dryRun: false,
        payloadRefsOnlyJson: { package_id: 'example-agent', exposure_action: 'unhide' },
      })
    );
  });

  it('renders generic dependency repair and dependent guards without exposing closure diagnostics by default', async () => {
    renderCapabilities(<AgentPackagesSettingsContent />);

    fireEvent.click(screen.getByTestId('capability-open-details-example-agent'));
    const readiness = screen.getByTestId('capability-readiness-example-agent');
    expect(within(readiness).getByText('Repair required')).toBeInTheDocument();
    expect(within(readiness).getAllByText('A required capability export is missing')).toHaveLength(2);
    expect(within(readiness).getByText('consumer-agent')).toBeInTheDocument();
    expect(within(readiness).getAllByText('Required by another installed package')).toHaveLength(2);
    expect(within(readiness).getByText('status, doctor, repair')).toBeInTheDocument();
    expect(screen.getByTestId('agent-package-enabled-toggle-example-agent')).toBeDisabled();
    expect(screen.getByTestId('agent-package-uninstall-example-agent')).toBeDisabled();
    expect(screen.queryByText('sha256:example-current')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('agent-package-repair-example-agent'));
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'agent_package_repair',
        dryRun: false,
        payloadRefsOnlyJson: { package_id: 'example-agent' },
      })
    );

    fireEvent.click(screen.getByTestId('capability-advanced-toggle-example-agent'));
    expect(screen.getByText('sha256:example-current')).toBeInTheDocument();
    expect(screen.getByText('sha256:example-previous')).toBeInTheDocument();
  });

  it('does not synthesize a repair execution from status-index repair metadata', () => {
    appStateOverrides.appState = appStateWithDirectory(
      [{ package_id: 'example-agent', installed: true, status: 'failed_with_repair', available_actions: [] }],
      {
        statusEntries: [
          {
            package_id: 'example-agent',
            repair_action: {
              action_id: 'agent_package_repair',
              command_ref: 'opl app action execute --action agent_package_repair --payload <json> --json',
              enabled: true,
              reason_code: 'required_export_missing',
            },
          },
        ],
      }
    );
    renderCapabilities(<AgentPackagesSettingsContent />);

    fireEvent.click(screen.getByTestId('capability-open-details-example-agent'));
    expect(screen.queryByTestId('agent-package-repair-example-agent')).not.toBeInTheDocument();
    expect(bridgeMocks.executeActionInvoke).not.toHaveBeenCalled();
  });

  it('fails disable and uninstall closed when the dependent guard is missing', () => {
    const preferenceAction = actionFixture('agent_package_preferences_set', { package_id: 'example-agent' }, [
      'package_id',
      'exposure_action or shortcut_id',
    ]);
    const uninstallAction = actionFixture(
      'agent_package_uninstall',
      { package_id: 'example-agent' },
      ['package_id'],
      true
    );
    appStateOverrides.appState = appStateWithDirectory(
      [
        {
          package_id: 'example-agent',
          installed: true,
          available_actions: [preferenceAction, uninstallAction],
        },
      ],
      { statusEntries: [{ package_id: 'example-agent', capability_exposure: { status: 'visible' } }] }
    );
    renderCapabilities(<AgentPackagesSettingsContent />);

    fireEvent.click(screen.getByTestId('capability-open-details-example-agent'));
    expect(screen.getByTestId('agent-package-enabled-toggle-example-agent')).toBeDisabled();
    expect(screen.getByTestId('agent-package-uninstall-example-agent')).toBeDisabled();
    expect(screen.getByTestId('agent-package-hidden-toggle-example-agent')).not.toBeDisabled();
  });

  it('serializes package state writes until the active action finishes', async () => {
    let confirmOnOk: (() => unknown) | undefined;
    bridgeMocks.modalConfirm.mockImplementationOnce((config) => {
      confirmOnOk = config.onOk;
    });
    let resolveUpdate!: (result: { ok: true; command: string }) => void;
    const updateResult = new Promise<{ ok: true; command: string }>((resolve) => {
      resolveUpdate = resolve;
    });
    bridgeMocks.executeActionInvoke.mockReturnValueOnce(updateResult);

    renderCapabilities(<AgentPackagesSettingsContent />);

    fireEvent.click(screen.getByTestId('settings-agents-primary-action'));
    fireEvent.change(screen.getByTestId('agent-package-manifest-url'), {
      target: { value: 'https://example.test/agent.json' },
    });
    await chooseSelectOption('agent-package-trust-tier', 'Verified third party');
    fireEvent.click(screen.getByTestId('capability-open-details-mag'));
    fireEvent.click(screen.getByTestId('agent-package-uninstall-mag'));
    expect(confirmOnOk).toBeTypeOf('function');

    fireEvent.click(screen.getByTestId('agent-package-update-mag'));
    expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledTimes(1);
    expect(bridgeMocks.executeActionInvoke).toHaveBeenLastCalledWith({
      actionId: 'agent_package_update',
      dryRun: false,
      payloadRefsOnlyJson: {
        package_id: 'mag',
        manifest_url: 'https://example.test/mag.json',
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('agent-package-repair-mag')).toBeDisabled();
      expect(screen.getByTestId('agent-package-enabled-toggle-mag')).toBeDisabled();
      expect(screen.getByTestId('agent-package-uninstall-mag')).toBeDisabled();
      expect(screen.getByTestId('agent-package-home-toggle-details-mag')).toBeDisabled();
      expect(screen.getByTestId('agent-package-home-down-details-mag')).toBeDisabled();
      expect(screen.getByTestId('agent-package-refresh-registry')).toBeDisabled();
      expect(screen.getByTestId('agent-package-install-manifest')).toBeDisabled();
    });
    expect(screen.getByTestId('capability-open-details-mas')).not.toBeDisabled();
    expect(screen.getByTestId('capability-advanced-toggle-mag')).not.toBeDisabled();

    await act(async () => {
      await confirmOnOk?.();
    });
    fireEvent.click(screen.getByTestId('agent-package-repair-mag'));
    expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('agent-package-repair-mag')).toBeDisabled();

    await act(async () => {
      resolveUpdate({
        ok: true,
        command: 'opl app action execute --action agent_package_update --json',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('agent-package-repair-mag')).not.toBeDisabled();
      expect(screen.getByTestId('agent-package-enabled-toggle-mag')).not.toBeDisabled();
      expect(screen.getByTestId('agent-package-uninstall-mag')).not.toBeDisabled();
      expect(screen.getByTestId('agent-package-home-toggle-details-mag')).not.toBeDisabled();
      expect(screen.getByTestId('agent-package-home-down-details-mag')).not.toBeDisabled();
      expect(screen.getByTestId('agent-package-refresh-registry')).not.toBeDisabled();
      expect(screen.getByTestId('agent-package-install-manifest')).not.toBeDisabled();
    });
  });

  it('clears and ignores legacy locally persisted shortcut preferences', () => {
    localStorage.setItem(
      'opl.homeAgentShortcutPreferences.v2',
      JSON.stringify({
        hiddenShortcutIds: ['grant'],
        visibleShortcutIds: ['oma'],
        orderedShortcutIds: ['book', 'research', 'ppt', 'grant'],
      })
    );

    expect(resolveOplHomeAssistants([], homeShortcutAppState()).map((assistant) => assistant.id)).toEqual([
      'research',
      'grant',
      'ppt',
      'book',
      'oma',
    ]);
    getOplHomeShortcutPreferences();
    expect(localStorage.getItem('opl.homeAgentShortcutPreferences.v2')).toBeNull();
  });

  it('uses the persisted Framework App-state projection instead of the legacy local value', () => {
    localStorage.setItem(
      'opl.homeAgentShortcutPreferences.v2',
      JSON.stringify({
        hiddenShortcutIds: [],
        orderedShortcutIds: ['research', 'grant', 'ppt', 'book'],
      })
    );
    localStorage.setItem(
      'opl.appState.fast.v1',
      JSON.stringify({
        payload: {
          app_state: {
            agent_packages: {
              directory: { entries: homeShortcutDirectoryEntries() },
              status_index: {
                home_shortcut_preferences: [
                  {
                    package_id: 'obf',
                    shortcut_id: 'book',
                    visible: true,
                    sort_order: 0,
                    source: 'user_preference',
                  },
                  {
                    package_id: 'mas',
                    shortcut_id: 'research',
                    visible: true,
                    sort_order: 1,
                    source: 'user_preference',
                  },
                  {
                    package_id: 'mag',
                    shortcut_id: 'grant',
                    visible: false,
                    sort_order: 2,
                    source: 'user_preference',
                  },
                  {
                    package_id: 'rca',
                    shortcut_id: 'ppt',
                    visible: true,
                    sort_order: 3,
                    source: 'user_preference',
                  },
                  {
                    package_id: 'oma',
                    shortcut_id: 'oma',
                    visible: true,
                    sort_order: 4,
                    source: 'user_preference',
                  },
                ],
              },
            },
          },
        },
        loadedAt: '12:00:00',
      })
    );

    const projectedState = JSON.parse(localStorage.getItem('opl.appState.fast.v1') ?? '{}').payload;
    expect(resolveOplHomeAssistants([], projectedState).map((assistant) => assistant.id)).toEqual([
      'book',
      'research',
      'ppt',
      'oma',
    ]);
    getOplHomeShortcutPreferences();
    expect(localStorage.getItem('opl.homeAgentShortcutPreferences.v2')).toBeNull();
  });

  it('keeps the Framework App-state projection authoritative over an in-memory optimistic preference', () => {
    setOplHomeShortcutHidden('research', true);
    expect(resolveOplHomeAssistants([], homeShortcutAppState()).map((assistant) => assistant.id)).toContain('research');

    localStorage.setItem(
      'opl.appState.fast.v1',
      JSON.stringify({
        payload: homeShortcutReadback('research', true, 0),
        loadedAt: '12:00:00',
      })
    );

    const projectedState = JSON.parse(localStorage.getItem('opl.appState.fast.v1') ?? '{}').payload;
    expect(resolveOplHomeAssistants([], projectedState).map((assistant) => assistant.id)).toContain('research');
  });
});
