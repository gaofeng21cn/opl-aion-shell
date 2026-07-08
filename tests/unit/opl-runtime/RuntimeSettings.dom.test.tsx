import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import RuntimePage from '@/renderer/pages/runtime';
import RuntimeSettings from '@/renderer/pages/settings/sections/RuntimeSettings';
import { resetOplAppStateLoadsForTest } from '@/renderer/hooks/system/useOplAppState';
import {
  executeManagedUpdateRead,
  resetManagedUpdateMaintenanceForTest,
} from '@/renderer/services/managedUpdateMaintenance';

const bridgeMocks = vi.hoisted(() => ({
  getAppStateInvoke: vi.fn(),
  getInitializeInvoke: vi.fn(),
  runInstallPrepInvoke: vi.fn(),
  getDrilldownInvoke: vi.fn(),
  executeActionInvoke: vi.fn(),
  getUpdateStatusInvoke: vi.fn(),
  runUpdateCheckInvoke: vi.fn(),
  getUpdatePlanInvoke: vi.fn(),
  applyUpdateComponentInvoke: vi.fn(),
  repairUpdateInvoke: vi.fn(),
  rollbackUpdateComponentInvoke: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      getAppState: { invoke: bridgeMocks.getAppStateInvoke },
      getInitialize: { invoke: bridgeMocks.getInitializeInvoke },
      runInstallPrep: { invoke: bridgeMocks.runInstallPrepInvoke },
      getDrilldown: { invoke: bridgeMocks.getDrilldownInvoke },
      executeAction: { invoke: bridgeMocks.executeActionInvoke },
      getUpdateStatus: { invoke: bridgeMocks.getUpdateStatusInvoke },
      runUpdateCheck: { invoke: bridgeMocks.runUpdateCheckInvoke },
      getUpdatePlan: { invoke: bridgeMocks.getUpdatePlanInvoke },
      applyUpdateComponent: { invoke: bridgeMocks.applyUpdateComponentInvoke },
      repairUpdate: { invoke: bridgeMocks.repairUpdateInvoke },
      rollbackUpdateComponent: { invoke: bridgeMocks.rollbackUpdateComponentInvoke },
    },
    shell: {
      openFolderWith: { invoke: vi.fn() },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      const labels: Record<string, string> = {
        'common.cancel': 'Cancel',
        'settings.updateConfirm': 'Confirm Changes',
        'settings.oplEnvironmentPage.maintenanceHub.makeUsable.confirmTitle': 'Confirm OPL maintenance',
        'settings.oplEnvironmentPage.maintenanceHub.makeUsable.confirmWillChange': 'Will run safe maintenance.',
        'settings.oplEnvironmentPage.maintenanceHub.makeUsable.confirmWillNotChange':
          'Will not overwrite local work or delete user data.',
        'settings.oplEnvironmentPage.maintenanceHub.makeUsable.confirmRecovery': 'Receipts remain visible.',
        'settings.oplEnvironmentPage.maintenanceHub.makeUsable.confirmAction': 'Run maintenance',
        'settings.oplEnvironmentPage.updates.components.unknown': 'OPL component',
        'settings.oplEnvironmentPage.updates.actions.previewChanges': 'Preview changes',
        'settings.runtimePage.taskRuns.artifactContext.ledgerRecord': 'Ledger record',
        'settings.runtimePage.taskRuns.artifactContext.roCrate': 'RO-Crate metadata',
        'settings.runtimePage.taskRuns.artifactContext.openAction': 'Open detail action',
        'common.runtime.telemetryMissing': '用量未记录',
        'common.unit.second_short': 's',
        'common.unit.minute_short': 'm',
        'common.unit.hour_short': 'h',
        'common.unit.day_short': 'd',
      };
      if (labels[key]) return labels[key];
      const renderedValues = Object.values(values ?? {})
        .filter((value) => value !== undefined && value !== null && String(value).length > 0)
        .map(String)
        .join(' ');
      return renderedValues ? `${key} ${renderedValues}` : key;
    },
    i18n: { language: 'zh-CN', resolvedLanguage: 'zh-CN' },
  }),
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='settings-page-wrapper'>{children}</div>,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

const appStateResult = {
  surface: 'app_state_fast',
  command: 'opl app state --profile fast --json',
  stdout: '{}',
  parsed: {
    app_state: {
      schema_version: 'opl_app_state.v1',
      surface_kind: 'opl_app_state',
      operator: { status: 'ready', summary: 'ready' },
      core: {
        codex: {
          parsed_version: '0.125.0',
          default_model: 'gpt-5.5',
          default_reasoning_effort: 'xhigh',
        },
      },
      provider: {
        temporal: { status: 'attention_needed', health_status: 'attention_needed' },
      },
      paths: {
        family_workspace_root: {
          selected_path: '/Users/example/workspace',
        },
      },
      modules: {
        summary: { default_modules_count: 4, healthy_default_modules_count: 4 },
        source: {
          mode: 'sibling_workspace',
          modules_root: '/Users/example/workspace',
        },
        items: [
          {
            module_id: 'medautoscience',
            display_name: 'Med Auto Science',
            status: 'dirty',
            path: '/Users/example/workspace/med-autoscience',
            git: { dirty: true },
          },
          {
            module_id: 'oplbookforge',
            display_name: 'BookForge',
            status: 'ready',
            version: 'bookforge-1.0.0',
            install_origin: 'managed_root',
            path: '/Users/example/workspace/modules/bookforge',
          },
          {
            module_id: 'mas',
            display_name: 'med-autoscience',
            status: 'ready',
          },
          {
            module_id: 'oma',
            display_name: 'opl-meta-agent',
            status: 'ready',
          },
          {
            module_id: 'opl-flow',
            display_name: 'opl-flow',
            status: 'ready',
          },
        ],
      },
      actions: [],
    },
  },
};

const managedUpdateStatusResult = {
  surface: 'update_status',
  command: 'opl update status --json',
  stdout: '{}',
  parsed: {
    managed_update: {
      operation: 'status',
      operation_mode: 'read_only_projection',
      update_channel: 'stable',
      idempotency_lock: { status: 'free' },
      components: [
        {
          component_id: 'installation_carrier',
          display_group: 'Installation carrier',
          state: 'host_executor_required',
          host_executor_required: true,
          host_update_route: 'host_executor_runs_documented_installer_or_compose_pull_and_up',
          host_update_route_examples: [
            'install-docker-webui.sh --yes --update',
            'docker compose pull && docker compose up -d',
          ],
          data_volume_preservation: 'required_before_replacing_docker_webui_image',
          preserved_mounts: ['OnePersonLab/data -> /data', 'OnePersonLab/projects -> /projects'],
          required_preservation_evidence: ['compose_config_readback', 'volume_mount_readback'],
          manual_guidance: 'Docker/WebUI image update must run from the host and preserve data volumes.',
          conditions: [
            {
              type: 'HostRoute',
              status: 'False',
              reason: 'HostExecutorRequired',
              message: 'Docker/WebUI image replacement cannot be applied from inside opl update apply.',
            },
          ],
          receipt: { last_receipt_ref: 'receipt://installation_carrier/current' },
        },
        {
          component_id: 'runtime_substrate',
          display_group: 'OPL Runtime Fabric',
          state: 'update_available',
          safe_to_apply: true,
          conditions: [
            {
              type: 'ReadyToApply',
              status: 'True',
              reason: 'Verified',
              message: 'Runtime update is verified',
            },
          ],
          receipt: {
            last_receipt_ref: 'receipt://runtime_substrate/latest',
            rollback_ref: 'rollback://runtime_substrate/previous',
            repair_action: 'runtime_substrate_repair_only',
          },
          needs_restart: true,
          reload_guidance: 'Restart the app after apply.',
        },
        {
          component_id: 'capability_packages',
          display_group: 'OPL capability packages',
          state: 'update_available',
          safe_to_apply: true,
          repair_allowed: true,
          conditions: [
            {
              type: 'PostApplySync',
              status: 'False',
              reason: 'SyncFailed',
              message: 'Skill sync needs repair',
            },
          ],
          receipt: {
            last_receipt_ref: 'receipt://capability_packages/failed-sync',
            repair_action: 'agent_package_reconcile_and_skill_sync_only',
          },
          needs_reload: true,
          reload_guidance: 'Reload Codex plugin cache after repair.',
        },
        {
          component_id: 'codex_surface',
          display_group: 'Codex Surface',
          state: 'needs_reload',
          conditions: [
            {
              type: 'Visible',
              status: 'Unknown',
              reason: 'CacheStale',
              message: 'Codex Surface cache is stale',
            },
          ],
          receipt: { last_receipt_ref: 'receipt://codex_surface/cache' },
          needs_reload: true,
          reload_guidance: 'Reload the app to refresh visible capabilities.',
        },
        {
          component_id: 'workflow_profile',
          display_group: 'Workflow profile',
          state: 'current',
          conditions: [
            {
              type: 'SemanticMergeRequired',
              status: 'True',
              reason: 'NoSilentProfileOverwrite',
              message: 'Existing Codex profile files require semantic merge instead of updater apply.',
            },
          ],
          receipt: { last_receipt_ref: 'receipt://workflow_profile/current' },
        },
      ],
      repair_actions: [
        {
          component_id: 'capability_packages',
          receipt_ref: 'receipt://capability_packages/failed-sync',
          action_ref: 'repair://capability_packages/sync',
        },
      ],
      reload_guidance: 'Restart or reload only when a component reports it.',
    },
  },
};

const managedUpdateAutoApplyPlanResult = {
  surface: 'update_plan',
  command: 'opl update plan --json',
  stdout: '{}',
  parsed: {
    managed_update: {
      operation: 'plan',
      idempotency_lock: { status: 'released' },
      execution: { status: 'completed' },
      reload_guidance: 'Reload visible OPL capabilities after background maintenance.',
      components: [
        {
          component_id: 'installation_carrier',
          state: 'host_executor_required',
          safe_to_apply: true,
          host_executor_required: true,
          host_update_route: 'host_executor_runs_documented_installer_or_compose_pull_and_up',
          host_update_route_examples: [
            'install-docker-webui.sh --yes --update',
            'docker compose pull && docker compose up -d',
          ],
          data_volume_preservation: 'required_before_replacing_docker_webui_image',
          preserved_mounts: ['OnePersonLab/data -> /data', 'OnePersonLab/projects -> /projects'],
          required_preservation_evidence: ['compose_config_readback', 'volume_mount_readback'],
          manual_guidance: 'Update the installation carrier from the host, not from opl update apply.',
        },
        {
          component_id: 'runtime_substrate',
          state: 'update_available',
          safe_to_apply: true,
          needs_restart: true,
          reload_guidance: 'Restart the app before the new runtime is visible.',
        },
        {
          component_id: 'capability_packages',
          state: 'update_available',
          safe_to_apply: true,
          reload_guidance: 'Reload Codex plugin cache after agent package sync.',
        },
        {
          component_id: 'codex_surface',
          state: 'staged',
          needs_reload: true,
          reload_guidance: 'Reload the app to refresh visible capabilities.',
        },
        {
          component_id: 'workflow_profile',
          state: 'current',
          auto_apply: {
            mode: 'projection_only',
            eligible: false,
            app_background_safe: false,
            blocked_reasons: ['workflow_profile_requires_codex_semantic_merge'],
          },
        },
      ],
    },
  },
};

describe('RuntimeSettings app state bridge usage', () => {
  beforeEach(() => {
    resetOplAppStateLoadsForTest();
    resetManagedUpdateMaintenanceForTest();
    vi.clearAllMocks();
    localStorage.clear();
    bridgeMocks.getAppStateInvoke.mockResolvedValue(appStateResult);
    bridgeMocks.getInitializeInvoke.mockResolvedValue({ stdout: '{}', parsed: {} });
    bridgeMocks.runInstallPrepInvoke.mockResolvedValue({ stdout: '{}', parsed: {} });
    bridgeMocks.executeActionInvoke.mockResolvedValue({ stdout: '{}', parsed: {} });
    bridgeMocks.getUpdateStatusInvoke.mockResolvedValue(managedUpdateStatusResult);
    bridgeMocks.runUpdateCheckInvoke.mockResolvedValue(managedUpdateStatusResult);
    bridgeMocks.getUpdatePlanInvoke.mockResolvedValue(managedUpdateStatusResult);
    bridgeMocks.applyUpdateComponentInvoke.mockResolvedValue({
      ...managedUpdateStatusResult,
      surface: 'update_apply',
      command: 'opl update apply --component runtime_substrate --json',
    });
    bridgeMocks.repairUpdateInvoke.mockResolvedValue({
      ...managedUpdateStatusResult,
      surface: 'update_repair',
      command: 'opl update repair --receipt receipt://capability_packages/failed-sync --json',
    });
    bridgeMocks.rollbackUpdateComponentInvoke.mockResolvedValue({
      ...managedUpdateStatusResult,
      surface: 'update_rollback',
      command: 'opl update rollback --component runtime_substrate --json',
    });
    bridgeMocks.getDrilldownInvoke.mockImplementation(({ detail }: { detail: 'summary' | 'full' }) =>
      Promise.resolve(
        detail === 'summary'
          ? {
              surface: 'runtime_summary',
              command: 'opl runtime app-operator-drilldown --json',
              stdout: JSON.stringify({
                app_operator_drilldown: {
                  surface_kind: 'opl_app_operator_drilldown_read_model',
                  availability: 'available',
                  summary: {
                    stage_attempt_count: 25,
                    current_control_state_blocked_count: 3,
                    current_control_state_running_provider_attempt_count: 2,
                    current_control_state_running_provider_attempt_domain_ids: ['medautoscience'],
                    current_control_state_running_provider_attempt_task_kinds: [
                      'paper_autonomy/repair-recheck',
                      'publication_aftercare/reviewer-refresh',
                    ],
                    current_control_state_running_provider_attempt_stage_attempt_ids: ['sat_dm002', 'sat_dm003'],
                    current_control_state_latest_running_provider_heartbeat_at: '2026-06-02T00:01:12.853Z',
                    current_control_state_running_provider_attempt_summary_policy:
                      'refs_only_liveness_projection_no_domain_ready_publication_ready_or_artifact_ready',
                  },
                  current_control_state: {
                    summary: {
                      running_provider_attempt_count: 2,
                      running_provider_attempt_domain_ids: ['medautoscience'],
                      running_provider_attempt_task_kinds: [
                        'paper_autonomy/repair-recheck',
                        'publication_aftercare/reviewer-refresh',
                      ],
                      running_provider_attempt_stage_attempt_ids: ['sat_dm002', 'sat_dm003'],
                      latest_running_provider_heartbeat_at: '2026-06-02T00:01:12.853Z',
                      running_provider_attempt_summary_policy:
                        'refs_only_liveness_projection_no_domain_ready_publication_ready_or_artifact_ready',
                    },
                    states: [
                      {
                        task_id: 'frt_dm002',
                        domain_id: 'medautoscience',
                        task_kind: 'paper_autonomy/repair-recheck',
                        running_provider_attempt: true,
                        current_stage_attempt_id: 'sat_dm002',
                        workflow_id: 'wf_dm002',
                        provider_kind: 'temporal',
                        current_attempt_state: 'running',
                        stage_progress_log: {
                          started_at: '2026-06-01T23:31:12.853Z',
                          missing_usage_telemetry_attempt_count: 1,
                        },
                        provider_run: {
                          provider_status: 'running',
                          last_heartbeat_at: '2026-06-02T00:01:12.853Z',
                        },
                      },
                      {
                        task_id: 'frt_dm003',
                        domain_id: 'medautoscience',
                        task_kind: 'publication_aftercare/reviewer-refresh',
                        running_provider_attempt: true,
                        current_stage_attempt_id: 'sat_dm003',
                        workflow_id: 'wf_dm003',
                        provider_kind: 'temporal',
                        current_attempt_state: 'checkpointed',
                        provider_run: {
                          provider_status: 'checkpointed',
                          last_heartbeat_at: '2026-06-02T00:01:10.000Z',
                        },
                      },
                    ],
                  },
                  attention_first_payload: {
                    provider_health: {
                      provider_kind: 'temporal',
                      health_status: 'ready',
                    },
                  },
                },
              }),
              parsed: undefined,
            }
          : {
              surface: 'runtime_full',
              command: 'opl runtime app-operator-drilldown --detail full --json',
              stdout: '{}',
              parsed: {
                app_operator_drilldown: { surface_kind: 'opl_app_operator_drilldown_read_model', status: 'ready' },
              },
            }
      )
    );
  });

  it('loads the fast OPL app state on initial render and fast App state on page refresh', async () => {
    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));
    expect(bridgeMocks.getDrilldownInvoke).not.toHaveBeenCalled();
    expect(screen.getByTestId('opl-maintenance-hub')).toBeInTheDocument();
    expect(screen.queryByText('settings.oplEnvironmentPage.actions.refresh')).not.toBeInTheDocument();
  });

  it('renders runtime status and module path-source values through i18n aliases', async () => {
    render(<RuntimeSettings />);

    await waitFor(() =>
      expect(
        screen.getAllByText('settings.oplEnvironmentPage.status.attention_required attention_required').length
      ).toBeGreaterThan(0)
    );
    fireEvent.click(screen.getByText('settings.oplEnvironmentPage.diagnostics.title'));
    fireEvent.click(screen.getByText('settings.oplEnvironmentPage.diagnostics.modulesTitle'));
    expect(document.body.textContent).toContain(
      'settings.oplEnvironmentPage.moduleVersion.pathSources.familyWorkspaceRoot'
    );
    expect(screen.queryByText('settings.oplEnvironmentPage.status.attention_needed')).not.toBeInTheDocument();
  });

  it('normalizes OPL plugin and module labels to one display style', async () => {
    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));

    expect(screen.getAllByText('Med Auto Science').length).toBeGreaterThan(0);
    expect(screen.getAllByText('OPL Meta Agent').length).toBeGreaterThan(0);
    expect(screen.getAllByText('OPL Book Forge').length).toBeGreaterThan(0);
    expect(screen.getAllByText('OPL Flow').length).toBeGreaterThan(0);
    expect(screen.queryByText('med-autoscience')).not.toBeInTheDocument();
    expect(screen.queryByText('opl-meta-agent')).not.toBeInTheDocument();
    expect(screen.queryByText('opl-flow')).not.toBeInTheDocument();
  });

  it('renders TaskRunProjection v2 task list and selected task refs from fast app state', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValue({
      ...appStateResult,
      parsed: {
        app_state: {
          ...appStateResult.parsed.app_state,
          operator: {
            status: 'ready',
            workbench: {
              task_run_projection_v2: {
                projection_kind: 'task_run_projection_v2',
                schema_version: 2,
                tasks: [
                  {
                    task_id: 'dm002-taskrun',
                    title: 'DM002 TaskRun',
                    state: 'running',
                    status_label: 'Advancing',
                    stage: 'review',
                    progress_label: 'evidence ready',
                    next_owner: 'reviewer',
                    next_step: 'Review evidence cards',
                    last_progress_at: '2026-07-01T00:00:00Z',
                    blocker_refs: ['blocker://needs-owner'],
                    evidence_cards: [
                      {
                        card_id: 'artifact',
                        kind: 'artifact_or_blocker_refs',
                        owner: 'medautoscience',
                        updated_at: '2026-07-01T00:00:00Z',
                        title: 'Publication artifact',
                        summary: 'Artifact refs available',
                        ref: 'artifact://summary',
                        why_it_matters: 'Shows the artifact refs without exposing the artifact body',
                        open_action: {
                          action_id: 'task-export',
                          route: 'opl app action execute --action task_export_bundle_preview --dry-run',
                        },
                      },
                    ],
                    action_cards: [
                      {
                        card_id: 'review-dry-run',
                        title: 'Preview review',
                        summary: 'Open dry-run receipt',
                        ref: 'action://dry-run',
                        action_ref: 'action://dry-run',
                        open_action: {
                          action_id: 'review-dry-run',
                          route: 'opl app action execute --action review-dry-run --dry-run',
                        },
                        risk: {
                          mutation_policy: 'no_writes_preview_only',
                        },
                        expected_output: {
                          ref: 'receipt://expected',
                        },
                        rollback_ref: 'receipt://rollback',
                        verify_ref: 'receipt://verify',
                      },
                    ],
                    resource_cards: [
                      {
                        card_id: 'fabric-resource',
                        resource_kind: 'fabric',
                        title: 'Fabric resource',
                        ref: 'resource://status',
                        status_ref: 'resource://status',
                        usage_ref: 'resource://usage',
                        quota_ref: 'resource://quota',
                        permission_ref: 'resource://permission',
                        cost_estimate_ref: 'resource://cost',
                        open_action: {
                          action_id: 'workspace_inspect',
                          route: 'opl app action execute --action workspace_inspect --dry-run',
                        },
                      },
                    ],
                    diagnostics_ref: 'diagnostics://task',
                    artifact_native_drilldown: {
                      provenance_projection_kind: 'artifact_provenance_bundle_projection',
                      provenance_projection_ref:
                        'contracts/app-runtime-bridge.json#artifact_provenance_bundle_projection',
                      provenance_index_ref: 'opl://artifact-provenance-index/medautoscience/dm002',
                      provenance_bundle_refs: [
                        {
                          artifact_id: 'figure:dm002-flow',
                          artifact_ref: 'opl://artifact/medautoscience/dm002/figure-flow',
                          bundle_ref: 'opl://artifact-provenance-bundle/medautoscience/dm002/figure-flow',
                          ledger_record_ref: 'opl://ledger/artifact-provenance/medautoscience/dm002/figure-flow',
                          content_hash_ref: 'sha256:dm002figureflow',
                          content_policy: 'refs_only_no_artifact_body',
                        },
                      ],
                      ro_crate_metadata_ref:
                        'opl://artifact-provenance-bundle/medautoscience/dm002/figure-flow/ro-crate-metadata.json',
                      replay_status_ref: 'opl://artifact-replay-status/medautoscience/dm002/figure-flow',
                      agent_trace_refs: [
                        {
                          trace_kind: 'turn_summary_ref',
                          trace_ref: 'opl://agent-trace/medautoscience/dm002/figure-flow/summary',
                          access: 'readback',
                          content_policy: 'ref_only_no_trace_body',
                        },
                      ],
                      review_refs: [
                        {
                          review_kind: 'visual_audit_receipt',
                          review_ref: 'opl://review/medautoscience/dm002/figure-flow/visual-audit',
                          reviewer_owner: 'medautoscience_reviewer_agent',
                          content_policy: 'ref_only_no_review_body_no_quality_verdict',
                        },
                      ],
                      typed_issues: [
                        {
                          issue_type: 'replay_not_verified_in_fast_fixture',
                          severity: 'info',
                          ref: 'opl://typed-issue/medautoscience/dm002/figure-flow/replay-not-verified',
                          owner: 'medautoscience',
                          content_policy: 'refs_only_no_issue_body',
                        },
                      ],
                      provenance_drawer: {
                        surface_kind: 'artifact_provenance_bundle_drawer',
                        route: 'right_context_inspector/artifacts/provenance',
                        projection_ref: 'contracts/app-runtime-bridge.json#artifact_provenance_bundle_projection',
                        open_action: {
                          action_id: 'artifact_provenance_bundle_readback',
                          action_ref:
                            'app_state.operator.workbench.task_drilldowns[dm002-taskrun].artifact_native_drilldown.provenance_bundle_refs[0]',
                          route: 'opl runtime app-operator-drilldown --task dm002-taskrun --json',
                          required_mode: 'read_only',
                          content_policy: 'refs_only_no_artifact_body',
                        },
                      },
                      artifact_body: 'artifact_body should stay hidden',
                      domain_verdict: 'domain_verdict should stay hidden',
                      quality_verdict: 'quality_verdict should stay hidden',
                    },
                  },
                ],
              },
            },
          },
        },
      },
    });

    render(<RuntimeSettings />);

    await waitFor(() => expect(screen.getByTestId('opl-maintenance-hub')).toBeInTheDocument());
    expect(screen.queryByTestId('runtime-task-run-projection-v2')).not.toBeInTheDocument();
    expect(screen.queryByText('DM002 TaskRun')).not.toBeInTheDocument();
    expect(screen.queryByText('Publication artifact')).not.toBeInTheDocument();
    expect(screen.queryByText('artifact://summary')).not.toBeInTheDocument();
    expect(
      screen.queryByText('opl runtime app-operator-drilldown --task dm002-taskrun --json')
    ).not.toBeInTheDocument();
  });

  it('renders the unified Updates & Maintenance plane and routes controlled component actions through opl update IPC', async () => {
    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getUpdateStatusInvoke).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId('opl-managed-updates')).toHaveTextContent('settings.oplEnvironmentPage.updates.title');
    expect(screen.getByTestId('opl-managed-update-installation_carrier')).toHaveTextContent('Installation carrier');
    expect(screen.getByTestId('opl-managed-update-runtime_substrate')).toHaveTextContent('OPL Runtime Fabric');
    expect(screen.getByTestId('opl-managed-update-capability_packages')).toHaveTextContent('OPL capability packages');
    expect(screen.getByTestId('opl-managed-update-codex_surface')).toHaveTextContent('Codex Surface');
    expect(screen.getByTestId('opl-managed-update-workflow_profile')).toHaveTextContent('Workflow profile');
    expect(screen.getByTestId('opl-managed-update-workflow_profile')).toHaveTextContent(
      'settings.oplEnvironmentPage.updates.userSummaries.workflowProfile'
    );
    expect(screen.getByTestId('opl-managed-update-workflow_profile')).toHaveTextContent(
      'settings.oplEnvironmentPage.updates.nextStep settings.oplEnvironmentPage.updates.nextActions.semanticMerge'
    );
    expect(screen.getByTestId('opl-managed-update-codex_surface')).toHaveTextContent(
      'settings.oplEnvironmentPage.updates.userSummaries.codexSurface'
    );
    expect(screen.getByTestId('opl-managed-update-codex_surface')).toHaveTextContent(
      'settings.oplEnvironmentPage.updates.nextStep settings.oplEnvironmentPage.updates.nextActions.projectionOnly'
    );
    expect(screen.getByTestId('opl-managed-update-installation_carrier')).toHaveTextContent(
      'settings.oplEnvironmentPage.updates.userSummaries.hostExecutorRequired'
    );
    expect(screen.getByTestId('opl-managed-update-installation_carrier')).toHaveTextContent(
      'settings.oplEnvironmentPage.updates.nextStep settings.oplEnvironmentPage.updates.nextActions.hostRoute'
    );
    expect(screen.getByTestId('opl-managed-update-runtime_substrate')).toHaveTextContent(
      'settings.oplEnvironmentPage.updates.userSummaries.needsRestart'
    );
    expect(screen.getByTestId('opl-managed-update-capability_packages')).toHaveTextContent(
      'settings.oplEnvironmentPage.updates.userSummaries.canApply'
    );
    expect(screen.getByTestId('opl-runtime-health-summary')).toHaveTextContent(
      'settings.oplEnvironmentPage.healthSummary.usable'
    );
    expect(screen.getByTestId('opl-maintenance-hub')).toHaveTextContent(
      'settings.oplEnvironmentPage.maintenanceHub.title'
    );
    expect(screen.getByTestId('opl-maintenance-hub-make-usable')).toHaveTextContent(
      'settings.oplEnvironmentPage.maintenanceHub.makeUsable.label'
    );
    expect(screen.getByTestId('opl-maintenance-hub-appUpdates')).toHaveTextContent(
      'settings.oplEnvironmentPage.maintenanceHub.items.appUpdates.title'
    );
    expect(screen.getByTestId('opl-maintenance-hub-runtimeEnvironment')).toHaveTextContent(
      'settings.oplEnvironmentPage.maintenanceHub.items.runtimeEnvironment.title'
    );
    expect(screen.getByTestId('opl-maintenance-hub-runtimeEnvironment')).toHaveTextContent(
      'settings.oplEnvironmentPage.maintenanceHub.actions.repairRuntimeEnvironment'
    );
    expect(screen.getByTestId('opl-maintenance-hub-capabilitySurfaceSync')).toHaveTextContent(
      'settings.oplEnvironmentPage.maintenanceHub.items.capabilitySurfaceSync.title'
    );
    expect(screen.getByTestId('opl-maintenance-hub-capabilitySurfaceSync')).toHaveTextContent(
      'settings.oplEnvironmentPage.maintenanceHub.actions.syncCapabilityPacks'
    );
    expect(screen.getByTestId('opl-maintenance-hub-localServicesRepair')).toHaveTextContent(
      'settings.oplEnvironmentPage.maintenanceHub.items.localServicesRepair.title'
    );
    expect(screen.getByTestId('opl-managed-updates')).toHaveTextContent(
      'settings.oplEnvironmentPage.updates.nextStep settings.oplEnvironmentPage.updates.nextActions.repair'
    );
    expect(screen.getByTestId('opl-managed-update-recommended-action')).toHaveTextContent(
      'settings.oplEnvironmentPage.updates.actions.recommendedRepair'
    );
    expect(screen.getByTestId('opl-runtime-developer-source-alert')).toHaveTextContent(
      'settings.oplEnvironmentPage.developerSource.title'
    );
    expect(screen.getByTestId('opl-runtime-developer-source-alert')).toHaveTextContent(
      'settings.oplEnvironmentPage.developerSource.dirtyImpact'
    );
    expect(screen.getByTestId('opl-maintenance-link-outs')).toHaveTextContent('settings.workspace');
    expect(screen.getByTestId('opl-maintenance-link-outs')).toHaveTextContent('settings.storage');
    expect(screen.queryByText('settings.oplEnvironmentPage.updates.actions.plan')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('settings.oplEnvironmentPage.updates.advancedActions'));
    expect(screen.getByTestId('opl-managed-update-plan')).toHaveTextContent('Preview changes');
    fireEvent.click(screen.getAllByText('settings.oplEnvironmentPage.updates.diagnostics.componentDetails')[1]);
    expect(screen.getByTestId('opl-managed-update-runtime_substrate')).toHaveTextContent('Runtime update is verified');
    expect(screen.getByTestId('opl-managed-update-runtime_substrate')).toHaveTextContent(
      'receipt://runtime_substrate/latest'
    );
    fireEvent.click(screen.getAllByText('settings.oplEnvironmentPage.updates.diagnostics.componentDetails')[2]);
    expect(screen.getByTestId('opl-managed-update-capability_packages')).toHaveTextContent(
      'Reload Codex plugin cache after repair.'
    );
    expect(screen.getByTestId('opl-managed-update-host-route-installation_carrier')).toHaveTextContent(
      'settings.oplEnvironmentPage.updates.hostManualRouteTitle'
    );
    expect(screen.getByTestId('opl-managed-update-host-route-installation_carrier')).toHaveTextContent(
      'settings.oplEnvironmentPage.updates.hostUpdateRoute host_executor_runs_documented_installer_or_compose_pull_and_up'
    );
    expect(screen.getByTestId('opl-managed-update-host-route-installation_carrier')).toHaveTextContent(
      'settings.oplEnvironmentPage.updates.hostUpdateRouteExamples install-docker-webui.sh --yes --update, docker compose pull && docker compose up -d'
    );
    expect(screen.getByTestId('opl-managed-update-installation_carrier')).toHaveTextContent(
      'settings.oplEnvironmentPage.updates.manualGuidance Docker/WebUI image update must run from the host and preserve data volumes.'
    );
    expect(screen.getByTestId('opl-managed-update-installation_carrier')).toHaveTextContent(
      'OnePersonLab/data -> /data, OnePersonLab/projects -> /projects'
    );
    expect(screen.getByTestId('opl-managed-update-copy-host-route-installation_carrier')).toBeInTheDocument();
    expect(screen.queryByTestId('opl-managed-update-apply-installation_carrier')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-managed-update-repair-installation_carrier')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-managed-update-rollback-installation_carrier')).not.toBeInTheDocument();
    expect(screen.getByTestId('opl-managed-update-apply-runtime_substrate')).toBeInTheDocument();
    expect(screen.queryByTestId('opl-managed-update-apply-codex_surface')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-managed-update-rollback-codex_surface')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-managed-update-apply-workflow_profile')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-managed-update-repair-workflow_profile')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-managed-update-rollback-workflow_profile')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('opl-managed-update-semantic-merge-workflow_profile'));
    await waitFor(() => expect(bridgeMocks.getUpdatePlanInvoke).toHaveBeenCalledTimes(1));
    expect(bridgeMocks.applyUpdateComponentInvoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('opl-managed-update-refresh'));
    await waitFor(() => expect(bridgeMocks.getUpdateStatusInvoke).toHaveBeenCalledTimes(2));

    fireEvent.click(
      screen.getByTestId('opl-maintenance-hub-capabilitySurfaceSync').querySelector('button') as HTMLButtonElement
    );
    await waitFor(() => expect(bridgeMocks.runUpdateCheckInvoke).toHaveBeenCalledTimes(1));

    fireEvent.click(
      screen.getByTestId('opl-maintenance-hub-localServicesRepair').querySelector('button') as HTMLButtonElement
    );
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({ actionId: 'doctor', dryRun: false })
    );
    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByTestId('opl-managed-update-apply-capability_packages'));
    expect(bridgeMocks.applyUpdateComponentInvoke).not.toHaveBeenCalled();
    expect(screen.getByTestId('opl-managed-update-confirmation')).toHaveTextContent('Confirm Changes');
    expect(screen.getByTestId('opl-managed-update-confirmation')).toHaveTextContent(
      'settings.oplEnvironmentPage.updates.confirmation.willChange'
    );
    expect(screen.getByTestId('opl-managed-update-confirmation')).toHaveTextContent(
      'settings.oplEnvironmentPage.updates.confirmation.willNotChange'
    );
    expect(screen.getByTestId('opl-managed-update-confirmation')).toHaveTextContent(
      'receipt://capability_packages/failed-sync'
    );
    fireEvent.click(screen.getByTestId('opl-managed-update-confirmation').querySelector('.arco-btn-primary')!);
    await waitFor(() =>
      expect(bridgeMocks.applyUpdateComponentInvoke).toHaveBeenCalledWith({ componentId: 'capability_packages' })
    );
    await waitFor(() =>
      expect(screen.getByTestId('opl-managed-update-post-action-notice')).toHaveTextContent(
        'settings.oplEnvironmentPage.updates.postAction.title'
      )
    );
    expect(screen.getByTestId('opl-managed-update-post-action-notice')).toHaveTextContent('capability_packages');
    expect(screen.getByTestId('opl-managed-update-post-action-notice')).toHaveTextContent(
      'settings.oplEnvironmentPage.updates.postAction.nextCheck'
    );
    expect(screen.getByTestId('opl-managed-update-post-action-notice')).toHaveTextContent(
      'settings.oplEnvironmentPage.updates.postAction.reloadGuidance'
    );
    fireEvent.click(screen.getByTestId('opl-managed-update-apply-runtime_substrate'));
    expect(bridgeMocks.applyUpdateComponentInvoke).not.toHaveBeenCalledWith({ componentId: 'runtime_substrate' });
    fireEvent.click(screen.getByTestId('opl-managed-update-confirmation').querySelector('.arco-btn-primary')!);
    await waitFor(() =>
      expect(bridgeMocks.applyUpdateComponentInvoke).toHaveBeenCalledWith({ componentId: 'runtime_substrate' })
    );
    fireEvent.click(screen.getByTestId('opl-managed-update-repair-capability_packages'));
    fireEvent.click(screen.getByTestId('opl-managed-update-confirmation').querySelector('.arco-btn-primary')!);
    await waitFor(() =>
      expect(bridgeMocks.repairUpdateInvoke).toHaveBeenCalledWith({
        componentId: 'capability_packages',
        receiptId: 'receipt://capability_packages/failed-sync',
      })
    );
    fireEvent.click(screen.getByTestId('opl-managed-update-rollback-runtime_substrate'));
    fireEvent.click(screen.getByTestId('opl-managed-update-confirmation').querySelector('.arco-btn-primary')!);
    await waitFor(() =>
      expect(bridgeMocks.rollbackUpdateComponentInvoke).toHaveBeenCalledWith({ componentId: 'runtime_substrate' })
    );
  });

  it('runs the Maintenance hub make-usable action through App repair, check, and safe component actions', async () => {
    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getUpdateStatusInvoke).toHaveBeenCalledTimes(1));

    fireEvent.click(
      screen.getByTestId('opl-maintenance-hub-runtimeEnvironment').querySelector('button') as HTMLButtonElement
    );

    expect(bridgeMocks.executeActionInvoke).not.toHaveBeenCalled();
    expect(bridgeMocks.runInstallPrepInvoke).not.toHaveBeenCalled();
    expect(bridgeMocks.runUpdateCheckInvoke).not.toHaveBeenCalled();
    expect(screen.getByTestId('opl-maintenance-hub-make-usable-confirmation')).toHaveTextContent(
      'Confirm OPL maintenance'
    );
    expect(screen.getByTestId('opl-maintenance-hub-make-usable-confirmation')).toHaveTextContent(
      'Will not overwrite local work or delete user data.'
    );

    fireEvent.click(screen.getByTestId('opl-maintenance-hub-make-usable-confirm'));

    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({ actionId: 'repair', dryRun: false })
    );
    expect(bridgeMocks.runInstallPrepInvoke).not.toHaveBeenCalled();
    await waitFor(() => expect(bridgeMocks.runUpdateCheckInvoke).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(bridgeMocks.repairUpdateInvoke).toHaveBeenCalledWith({
        componentId: 'capability_packages',
        receiptId: 'receipt://capability_packages/failed-sync',
      })
    );
    expect(bridgeMocks.applyUpdateComponentInvoke).not.toHaveBeenCalledWith({
      componentId: 'runtime_substrate',
    });
    expect(bridgeMocks.applyUpdateComponentInvoke).not.toHaveBeenCalledWith({
      componentId: 'codex_surface',
    });
    expect(bridgeMocks.applyUpdateComponentInvoke).not.toHaveBeenCalledWith({
      componentId: 'installation_carrier',
    });
    expect(bridgeMocks.rollbackUpdateComponentInvoke).not.toHaveBeenCalled();
    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(2));
  });

  it('routes recommended doctor and repair actions through the App action contract', async () => {
    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getUpdateStatusInvoke).toHaveBeenCalledTimes(1));

    fireEvent.click(
      screen.getByTestId('opl-maintenance-hub-localServicesRepair').querySelector('button') as HTMLButtonElement
    );
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({ actionId: 'doctor', dryRun: false })
    );
    expect(bridgeMocks.getInitializeInvoke).not.toHaveBeenCalled();
    expect(bridgeMocks.runInstallPrepInvoke).not.toHaveBeenCalled();
  });

  it('renders user-friendly agent module maintenance from app state modules and managed update actions', async () => {
    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getUpdateStatusInvoke).toHaveBeenCalledTimes(1));

    const section = screen.getByTestId('opl-module-maintenance');
    expect(section).toHaveTextContent('settings.oplEnvironmentPage.moduleMaintenance.title');
    expect(section).toHaveTextContent('Med Auto Science');
    expect(section).toHaveTextContent('Med Auto Grant');
    expect(section).toHaveTextContent('RedCube AI');
    expect(section).toHaveTextContent('OPL Meta Agent');
    expect(section).toHaveTextContent('OPL Book Forge');
    expect(section).toHaveTextContent('bookforge-1.0.0');
    expect(section).toHaveTextContent('settings.oplEnvironmentPage.moduleMaintenance.status.manualRequired');
    expect(section).toHaveTextContent('settings.oplEnvironmentPage.moduleMaintenance.manualReasons.dirtyCheckout');

    fireEvent.click(screen.getByTestId('opl-module-maintenance-check'));
    await waitFor(() => expect(bridgeMocks.runUpdateCheckInvoke).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('opl-module-maintenance-repair-capability_packages'));
    expect(bridgeMocks.repairUpdateInvoke).not.toHaveBeenCalled();
    expect(screen.getByTestId('opl-module-maintenance-confirmation')).toHaveTextContent('Confirm Changes');
    fireEvent.click(screen.getByTestId('opl-module-maintenance-confirmation').querySelector('.arco-btn-primary')!);
    await waitFor(() =>
      expect(bridgeMocks.repairUpdateInvoke).toHaveBeenCalledWith({
        componentId: 'capability_packages',
        receiptId: 'receipt://capability_packages/failed-sync',
      })
    );
    expect(screen.getByTestId('opl-module-maintenance-component-codex_surface')).toHaveTextContent('Codex Surface');
    expect(screen.queryByTestId('opl-module-maintenance-apply-codex_surface')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-module-maintenance-rollback-codex_surface')).not.toBeInTheDocument();
  });

  it('does not expose component mutation buttons for dirty managed module checkouts', async () => {
    bridgeMocks.getUpdateStatusInvoke.mockResolvedValueOnce({
      ...managedUpdateStatusResult,
      parsed: {
        managed_update: {
          ...managedUpdateStatusResult.parsed.managed_update,
          components: managedUpdateStatusResult.parsed.managed_update.components.map((component) =>
            component.component_id === 'capability_packages'
              ? { ...component, dirty_checkout: true, safe_to_apply: true, rollback_allowed: true }
              : component
          ),
        },
      },
    });

    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getUpdateStatusInvoke).toHaveBeenCalledTimes(1));

    const component = screen.getByTestId('opl-module-maintenance-component-capability_packages');
    expect(component).toHaveTextContent('settings.oplEnvironmentPage.updates.userSummaries.dirtyCheckout');
    expect(screen.queryByTestId('opl-module-maintenance-apply-capability_packages')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-module-maintenance-repair-capability_packages')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-module-maintenance-rollback-capability_packages')).not.toBeInTheDocument();
  });

  it('projects background managed update maintenance timestamps and failures into Settings Runtime', async () => {
    bridgeMocks.getUpdateStatusInvoke.mockResolvedValueOnce({
      ...managedUpdateStatusResult,
      ok: false,
      error: { message: 'managed update lock is held' },
    });

    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getUpdateStatusInvoke).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('settings.oplEnvironmentPage.updates.diagnostics.title'));
    const backgroundStatus = screen.getByTestId('opl-managed-update-background-status');
    expect(backgroundStatus).toHaveTextContent('settings.oplEnvironmentPage.updates.background.lastRunAt');
    expect(backgroundStatus).toHaveTextContent('settings.oplEnvironmentPage.updates.background.nextRunAt');
    expect(backgroundStatus).toHaveTextContent('settings.oplEnvironmentPage.updates.background.lastFailure');
    expect(backgroundStatus).toHaveTextContent('managed update lock is held');

    fireEvent.click(screen.getByText('settings.oplEnvironmentPage.updates.advancedActions'));
    fireEvent.click(screen.getByTestId('opl-managed-update-check'));

    await waitFor(() => expect(bridgeMocks.runUpdateCheckInvoke).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('opl-managed-update-background-status')).toHaveTextContent(
        'settings.oplEnvironmentPage.updates.background.noFailure'
      )
    );
  });

  it('shows loading only on the managed update read action that is running', async () => {
    let resolveCheck: (value: typeof managedUpdateStatusResult) => void = () => {};
    bridgeMocks.runUpdateCheckInvoke.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCheck = resolve;
      })
    );

    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getUpdateStatusInvoke).toHaveBeenCalledTimes(1));

    const refreshButton = screen.getByTestId('opl-managed-update-refresh');
    fireEvent.click(screen.getByText('settings.oplEnvironmentPage.updates.advancedActions'));
    const checkButton = screen.getByTestId('opl-managed-update-check');
    const planButton = screen.getByTestId('opl-managed-update-plan');
    expect(checkButton).toBeTruthy();
    expect(planButton).toBeTruthy();

    fireEvent.click(checkButton!);

    await waitFor(() => expect(checkButton?.className).toContain('arco-btn-loading'));
    expect(refreshButton.className).not.toContain('arco-btn-loading');
    expect(planButton?.className).not.toContain('arco-btn-loading');

    await act(async () => {
      resolveCheck(managedUpdateStatusResult);
    });

    await waitFor(() => expect(checkButton?.className).not.toContain('arco-btn-loading'));
  });

  it('projects background managed update refresh-only skip reason and reload guidance', async () => {
    bridgeMocks.getUpdatePlanInvoke.mockResolvedValueOnce(managedUpdateAutoApplyPlanResult);

    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getUpdateStatusInvoke).toHaveBeenCalledTimes(1));

    await act(async () => {
      await executeManagedUpdateRead('plan', {
        background: true,
        trigger: 'daily_background_maintenance',
      });
    });

    fireEvent.click(screen.getByText('settings.oplEnvironmentPage.updates.diagnostics.title'));
    const backgroundStatus = screen.getByTestId('opl-managed-update-background-status');
    expect(backgroundStatus).not.toHaveTextContent('settings.oplEnvironmentPage.updates.background.lastAction');
    expect(backgroundStatus).toHaveTextContent('settings.oplEnvironmentPage.updates.background.lastSkipReason');
    expect(backgroundStatus).toHaveTextContent('installation_carrier: host_executor_required');
    expect(backgroundStatus).toHaveTextContent('runtime_substrate: restart_required');
    expect(backgroundStatus).toHaveTextContent('capability_packages: refresh_only');
    expect(backgroundStatus).toHaveTextContent('codex_surface: manual_confirmation_required');
    expect(backgroundStatus).not.toHaveTextContent('workflow_profile: manual_confirmation_required');
    expect(backgroundStatus).toHaveTextContent('settings.oplEnvironmentPage.updates.background.reloadGuidance');
    expect(backgroundStatus).toHaveTextContent('Reload visible OPL capabilities after background maintenance.');
  });

  it('does not expose a Settings Runtime fast-state refresh button during cached background revalidation', async () => {
    let resolveState: (value: typeof appStateResult) => void = () => {};
    bridgeMocks.getAppStateInvoke.mockReturnValue(
      new Promise((resolve) => {
        resolveState = resolve;
      })
    );
    localStorage.setItem(
      'opl.appState.fast.v1',
      JSON.stringify({
        payload: appStateResult.parsed,
        loadedAt: '09:00:00',
      })
    );

    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));
    expect(screen.queryByText('settings.oplEnvironmentPage.actions.refresh')).not.toBeInTheDocument();

    await act(async () => {
      resolveState(appStateResult);
    });
  });

  it('keeps Settings Runtime initial App state read single-flight without a manual refresh button', async () => {
    let resolveState: (value: typeof appStateResult) => void = () => {};
    bridgeMocks.getAppStateInvoke.mockReturnValue(
      new Promise((resolve) => {
        resolveState = resolve;
      })
    );

    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('settings.oplEnvironmentPage.actions.refresh')).not.toBeInTheDocument();
    expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveState(appStateResult);
    });
  });

  it('keeps the Runtime page refresh button idle during cached background revalidation', async () => {
    let resolveState: (value: typeof appStateResult) => void = () => {};
    bridgeMocks.getAppStateInvoke.mockReturnValue(
      new Promise((resolve) => {
        resolveState = resolve;
      })
    );
    localStorage.setItem(
      'opl.appState.fast.v1',
      JSON.stringify({
        payload: appStateResult.parsed,
        loadedAt: '09:00:00',
      })
    );

    render(<RuntimePage />);

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));
    const button = screen.getByText('common.refresh').closest('button');
    await waitFor(() => expect(button?.className).not.toContain('arco-btn-loading'));
    expect(button?.getAttribute('aria-busy')).not.toBe('true');

    await act(async () => {
      resolveState(appStateResult);
    });
  });

  it('keeps Runtime page safe actions on the App action boundary', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValue({
      ...appStateResult,
      parsed: {
        app_state: {
          ...appStateResult.parsed.app_state,
          actions: [
            {
              action_id: 'legacy-runtime-action',
              submit_via: 'opl runtime action execute',
            },
            {
              action_id: 'app-boundary-action',
              submit_via: 'opl app action execute',
              can_submit_to_safe_action_shell: true,
              dry_run_supported: true,
            },
            {
              action_id: 'payload-required-action',
              submit_via: 'opl app action execute',
              can_submit_to_safe_action_shell: true,
              route_requires_domain_or_app_payload: true,
              payload_fields: ['module_id'],
            },
          ],
        },
      },
    });

    render(<RuntimePage />);

    await waitFor(() => expect(screen.getByText('common.runtime.advancedRuntimeDetails')).toBeInTheDocument());
    fireEvent.click(screen.getByText('common.runtime.advancedRuntimeDetails'));
    await waitFor(() => expect(screen.getAllByText('app-boundary-action').length).toBeGreaterThan(0));
    expect(screen.queryByText('legacy-runtime-action')).not.toBeInTheDocument();
    expect(screen.queryByText('payload-required-action')).not.toBeInTheDocument();
  });

  it('renders Runtime page as a user-facing task status view', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValue({
      ...appStateResult,
      parsed: {
        app_state: {
          ...appStateResult.parsed.app_state,
          modules: {
            summary: { default_modules_count: 5, healthy_default_modules_count: 4 },
            items: [
              {
                module_id: 'medautoscience',
                status: 'dirty',
                git: { dirty: true },
              },
              {
                module_id: 'medautogrant',
                status: 'ready',
              },
              {
                module_id: 'redcube',
                status: 'ready',
              },
              {
                module_id: 'oplmetaagent',
                status: 'ready',
              },
              {
                module_id: 'oplbookforge',
                status: 'ready',
              },
            ],
          },
          operator: {
            status: 'ready',
            summary: {
              runtime_status: 'ready',
              provider_status: 'ready',
              visible_action_count: 20,
              profile: 'fast',
            },
            workbench: {
              runtime_scope: {
                scope_source: 'inferred',
                inferred_scope_hint: 'dm-cvd-mortality-risk',
                current_scope: {
                  kind: 'all_projects',
                  id: 'all-projects',
                  value: 'all_projects',
                  label: 'All projects',
                },
                scope_options: [
                  {
                    kind: 'all_projects',
                    id: 'all-projects',
                    value: 'all_projects',
                    label: 'All projects',
                  },
                  {
                    kind: 'workspace',
                    id: 'workspace:dm-cvd-mortality-risk',
                    value: 'dm-cvd-mortality-risk',
                    label: 'DM CVD Mortality Risk',
                  },
                  {
                    kind: 'project',
                    id: 'project:dm002',
                    value: 'dm002',
                    label: 'DM002 paper line',
                  },
                ],
              },
              domain_lane_map: {
                lanes: [
                  {
                    domain_id: 'medautoscience',
                    lane_label: 'Med Auto Science',
                    active_task_count: 1,
                    blocked_task_count: 1,
                    tasks: [
                      {
                        task_id: 'medautoscience',
                        label: 'Med Auto Science',
                        state: 'dirty',
                        active_stage_id: 'module_runtime',
                      },
                    ],
                  },
                  {
                    domain_id: 'medautogrant',
                    lane_label: 'Med Auto Grant',
                    active_task_count: 1,
                    blocked_task_count: 1,
                    tasks: [
                      {
                        task_id: 'medautogrant',
                        label: 'Med Auto Grant',
                        state: 'dirty',
                        active_stage_id: 'module_runtime',
                      },
                    ],
                  },
                  {
                    domain_id: 'redcube',
                    lane_label: 'RedCube AI',
                    active_task_count: 1,
                    blocked_task_count: 1,
                    tasks: [
                      {
                        task_id: 'redcube',
                        label: 'RedCube AI',
                        state: 'dirty',
                        active_stage_id: 'module_runtime',
                      },
                    ],
                  },
                  {
                    domain_id: 'oplmetaagent',
                    lane_label: 'OPL Meta Agent',
                    active_task_count: 1,
                    blocked_task_count: 1,
                    tasks: [
                      {
                        task_id: 'oplmetaagent',
                        label: 'OPL Meta Agent',
                        state: 'dirty',
                        active_stage_id: 'module_runtime',
                      },
                    ],
                  },
                ],
              },
              task_drilldowns: [
                {
                  task_id: 'dm002-publication-eval',
                  domain_id: 'medautoscience',
                  domain_label: 'Med Auto Science',
                  agent_display_name: 'MAS',
                  workspace_id: 'dm-cvd-mortality-risk',
                  workspace_label: 'DM CVD Mortality Risk',
                  project_id: 'dm002',
                  project_display_name: 'DM002 paper line',
                  work_item_display_name: 'Publication evaluation',
                  title: 'DM002 publication evaluation',
                  state: 'running',
                  primary_state: 'in_progress',
                  primary_state_label: 'common.runtime.primaryStates.inProgress',
                  automation_state: 'automation_running',
                  automation_state_label: 'common.runtime.automationStates.running',
                  active_stage_id: 'paper_autonomy/repair-recheck',
                  active_stage_label: 'Publication repair check',
                  progress_delta_classification: 'deliverable_progress',
                  deliverable_progress_delta: { count: 1 },
                  platform_repair_delta: { count: 0 },
                  active_run_id: 'wf_full_dm002',
                  next_visible_step: 'Finish reviewer evaluation against current inputs',
                  next_owner: 'AI reviewer',
                  last_progress_at: '2026-06-02T00:01:12.853Z',
                  stage_attempt_ids: ['sat_dm002'],
                  active_path: [
                    {
                      node_id: 'stage-intake',
                      label: 'Intake',
                      state: 'completed',
                    },
                    {
                      node_id: 'stage-review',
                      label: 'Publication repair check',
                      state: 'current',
                    },
                  ],
                  stage_run_cockpit: {
                    elapsed_seconds: 5400,
                    last_heartbeat_at: '2026-06-02T00:01:12.853Z',
                    stage_usage: { total_tokens: 128 },
                    task_total_usage: { total_tokens: 512 },
                  },
                  evidence_cards: [
                    {
                      card_id: 'dm002-evidence',
                      title: 'Publication evidence packet',
                      summary: 'Reviewer evidence is ready',
                      ref: 'artifact://dm002-publication-evidence',
                    },
                  ],
                  action_cards: [
                    {
                      card_id: 'dm002-action',
                      title: 'Preview reviewer handoff',
                      summary: 'Dry-run action is available',
                      ref: 'action://dm002-preview-reviewer-handoff',
                    },
                  ],
                  resource_cards: [
                    {
                      card_id: 'dm002-resource',
                      title: 'Fabric resource',
                      summary: 'Resource status is available',
                      ref: 'resource://dm002-fabric-status',
                    },
                  ],
                  blocker_ref_count: 0,
                  artifact_provenance_summary: 'publication eval packet from current App state',
                  reviewer_receipt_summary: 'review receipt accepted by reviewer lane',
                  typed_blocker_summary: 'owner blocker cleared',
                  action_receipt_ref: 'receipt://reviewer/current-action',
                },
                {
                  task_id: 'medautoscience:study:005-submission-followthrough',
                  domain_id: 'medautoscience',
                  workspace_id: 'dm-cvd-mortality-risk',
                  workspace_label: 'DM CVD Mortality Risk',
                  project_id: 'dm005',
                  project_display_name: 'DM005 paper line',
                  work_item_display_name: 'Submission follow-through',
                  title: 'DM005 submission follow-through',
                  state: 'running',
                  primary_state: 'in_progress',
                  automation_state: 'automation_running',
                  active_stage_id: 'submission_milestone_candidate::followthrough::followthrough-01',
                  next_step: 'domain_route/reconcile-apply',
                  next_owner: 'med-autoscience',
                  last_progress_at: '2026-07-04T19:00:00Z',
                  blocker_ref_count: 0,
                },
                {
                  task_id: 'medautoscience:study:003-dpcc-primary-care-phenotype-treatment-gap',
                  domain_id: 'medautoscience',
                  domain_label: 'Med Auto Science',
                  agent_display_name: 'MAS',
                  workspace_id: 'dm-cvd-mortality-risk',
                  workspace_label: 'DM CVD Mortality Risk',
                  project_id: 'dm003',
                  project_display_name: 'DM003 paper line',
                  work_item_display_name: 'Runtime closeout',
                  study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
                  title: 'DM003 paper mission runtime closeout',
                  state: 'attention_needed',
                  status: 'completed',
                  primary_state: 'system_attention_required',
                  primary_state_label: 'common.runtime.primaryStates.systemAttentionRequired',
                  automation_state: 'result_pending_terminalization',
                  automation_state_label: 'common.runtime.automationStates.pendingTerminalization',
                  status_label: 'OPL/MAS readback attention',
                  active_stage_id: 'write',
                  active_stage_label: 'Write',
                  progress_delta_classification: 'platform_repair',
                  deliverable_progress_delta: { count: 0 },
                  platform_repair_delta: { count: 1 },
                  active_run_id: 'wf_c7b369abb6b9f69f0c409f0d',
                  next_visible_step:
                    'Latest OPL runtime closeout differs from the MAS owner-consumed receipt; read MAS paper-mission/study-progress before any paper-progress claim.',
                  next_owner: 'MAS paper mission',
                  last_progress_at: '2026-07-04T16:43:40Z',
                  stage_attempt_ids: [
                    'sat_bf58a3caafa6ab7d654a3f5c',
                    'sat_e3a155cc896fa9fd2e965d95',
                    'sat_52667330acd398eba00f7940',
                    'sat_d1b5d94ecc7aa1688c6f54c7',
                    'sat_ccf4b55f0772e2a9e37d03fe',
                  ],
                  runtime_closeout_observed: true,
                  runtime_closeout_ref:
                    'ops/medautoscience/paper_mission_stage_attempts/sat_bf58a3caafa6ab7d654a3f5c/stage_attempt_closeout_packet.json',
                  mas_owner_consumption_status: 'owner_consumed_route_checkpoint',
                  mas_owner_consumption_ref:
                    'ops/medautoscience/paper_mission_receipt_owner_consumption/003-dpcc-primary-care-phenotype-treatment-gap/receipt_owner_consumption.json',
                  mas_owner_consumed_stage_attempt_id: 'sat_e3a155cc896fa9fd2e965d95',
                  mas_owner_consumed_closeout_ref:
                    'ops/medautoscience/paper_mission_stage_attempts/sat_e3a155cc896fa9fd2e965d95/stage_attempt_closeout_packet.json',
                  mas_owner_consumption_matches_runtime_closeout: false,
                  blocker_ref_count: 0,
                },
                {
                  task_id: 'medautoscience:binding:duplicate:study:dm003',
                  domain_id: 'medautoscience',
                  domain_label: 'Med Auto Science',
                  agent_display_name: 'MAS',
                  workspace_id: 'dm-cvd-mortality-risk',
                  workspace_label: 'DM CVD Mortality Risk',
                  project_id: 'dm003',
                  project_display_name: 'DM003 paper line',
                  work_item_display_name: 'Runtime closeout',
                  study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
                  title: 'DM003 duplicate binding row',
                  state: 'attention_needed',
                  primary_state: 'system_attention_required',
                  automation_state: 'automation_idle',
                  active_stage_id: 'domain_route/reconcile-apply',
                  next_visible_step:
                    'OPL runtime stage attempt needs operator attention; MAS terminalization is still required before any paper-progress claim.',
                  next_owner: { owner: 'medautoscience' },
                  stage: {
                    stage_id: 'domain_route/reconcile-apply',
                    label: 'OPL runtime blocked',
                  },
                  task_total_usage: {
                    total_tokens_observed: 0,
                  },
                  blocker_ref_count: 1,
                },
                {
                  task_id: 'medautoscience:study:004-reviewer-followup',
                  domain_id: 'medautoscience',
                  domain_label: 'Med Auto Science',
                  agent_display_name: 'MAS',
                  workspace_id: 'dm-cvd-mortality-risk',
                  workspace_label: 'DM CVD Mortality Risk',
                  project_id: 'dm004',
                  project_display_name: 'DM004 paper line',
                  work_item_display_name: 'Reviewer follow-up',
                  study_id: '004-reviewer-followup',
                  title: 'DM004 reviewer follow-up',
                  state: 'pending',
                  status: 'queued',
                  primary_state: 'paused_waiting_for_direction',
                  primary_state_label: 'common.runtime.primaryStates.pausedWaitingForDirection',
                  automation_state: 'automation_idle',
                  automation_state_label: 'common.runtime.automationStates.idle',
                  status_label: 'Waiting to start',
                  active_stage_id: 'reviewer-refresh',
                  active_stage_label: 'Reviewer refresh',
                  progress_delta_classification: 'human_gate',
                  deliverable_progress_delta: { count: 0 },
                  platform_repair_delta: { count: 0 },
                  next_visible_step: 'Wait for reviewer lane to accept the next run.',
                  next_owner: 'Reviewer lane',
                  last_progress_at: '2026-07-04T18:00:00Z',
                  blocker_ref_count: 0,
                },
                {
                  task_id: 'redcube',
                  domain_id: 'redcube',
                  title: 'RedCube AI',
                  state: 'dirty',
                  active_stage_id: 'module_runtime',
                  blocker_ref_count: 1,
                },
                {
                  task_id: 'oplmetaagent',
                  domain_id: 'oplmetaagent',
                  title: 'OPL Meta Agent',
                  state: 'dirty',
                  active_stage_id: 'module_runtime',
                  blocker_ref_count: 1,
                },
              ],
            },
          },
        },
      },
    });

    render(<RuntimePage />);

    await waitFor(() => expect(screen.getByTestId('runtime-primary-summary')).toBeInTheDocument());
    expect(bridgeMocks.getDrilldownInvoke).toHaveBeenCalledWith({ detail: 'summary' });
    expect(screen.getAllByText('common.runtime.scopeSelector').length).toBeGreaterThan(0);
    expect(screen.getByTestId('runtime-scope-selector')).toBeInTheDocument();
    expect(screen.getByTestId('runtime-primary-summary')).toHaveTextContent('common.runtime.primaryStates.inProgress');
    expect(screen.getByTestId('runtime-primary-summary')).toHaveTextContent(
      'common.runtime.primaryStates.systemAttentionRequired'
    );
    expect(screen.getByTestId('runtime-primary-summary')).toHaveTextContent(
      'common.runtime.primaryStates.deliveredAutoPaused'
    );
    expect(screen.getByTestId('runtime-primary-summary')).not.toHaveTextContent('2026-07-04T19:00:00Z');
    expect(screen.getByTestId('runtime-primary-summary')).toHaveTextContent('1');
    expect(screen.getByText('common.runtime.taskListTitle')).toBeInTheDocument();
    expect(screen.getByText('common.runtime.moduleStatus')).toBeInTheDocument();
    expect(document.body.textContent).toContain('common.runtime.moduleField.module');
    expect(document.body.textContent).toContain('common.runtime.moduleField.health');
    expect(document.body.textContent).toContain('common.runtime.moduleField.workload');
    expect(document.body.textContent).toContain('common.runtime.moduleField.lastActivity');
    expect(screen.getAllByText('Med Auto Science').length).toBeGreaterThan(0);
    expect(screen.getByText('Med Auto Grant')).toBeInTheDocument();
    expect(screen.getByText('OPL Book Forge')).toBeInTheDocument();
    expect(screen.getByText('RedCube AI')).toBeInTheDocument();
    expect(screen.getByText('OPL Meta Agent')).toBeInTheDocument();
    expect(screen.getByTestId('runtime-module-status-medautoscience')).toHaveTextContent(
      'common.runtime.moduleWorkloadText 2 4'
    );
    expect(document.body.textContent).toContain('Publication evaluation');
    expect(document.body.textContent).toContain('DM002 paper line');
    expect(document.body.textContent).toContain('common.runtime.taskField.projectPaper');
    expect(document.body.textContent).toContain('common.runtime.taskField.agent');
    expect(screen.getAllByText('common.runtime.taskField.stage').length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain('common.runtime.taskField.next');
    expect(screen.getByText('Publication repair check')).toBeInTheDocument();
    expect(document.body.textContent).toContain('1h');
    expect(document.body.textContent).toContain('common.runtime.usageStageAndTotal 128 tokens 512 tokens');
    expect(screen.getByText('Finish reviewer evaluation against current inputs')).toBeInTheDocument();
    expect(document.body.textContent).toContain('AI reviewer');
    expect(document.body.textContent).toContain('DM005 paper line');
    expect(document.body.textContent).toContain('投稿包后续处理');
    expect(document.body.textContent).toContain('同步项目状态/复核运行结果');
    expect(document.body.textContent).toContain('用量未记录');
    expect(screen.getByTestId('runtime-saved-views')).toHaveTextContent('common.runtime.savedViews');
    expect(screen.getByTestId('runtime-saved-view-all')).toBeInTheDocument();
    expect(screen.getByTestId('runtime-saved-view-automation_running')).toBeInTheDocument();
    expect(screen.getByTestId('runtime-saved-view-owner_decision')).toBeInTheDocument();
    expect(screen.getByTestId('runtime-saved-view-system_attention')).toBeInTheDocument();
    expect(screen.getByTestId('runtime-saved-view-mas_papers')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('runtime-saved-view-system_attention'));
    await waitFor(() => expect(screen.queryByTestId('runtime-group-in_progress')).not.toBeInTheDocument());
    expect(screen.getByTestId('runtime-group-system_attention_required')).toHaveTextContent(
      'common.runtime.groupSummaries.systemAttention 1'
    );
    fireEvent.click(screen.getByTestId('runtime-saved-view-all'));
    await waitFor(() => expect(screen.getByTestId('runtime-group-in_progress')).toBeInTheDocument());
    const inProgressGroup = screen.getByTestId('runtime-group-in_progress');
    const systemGroup = screen.getByTestId('runtime-group-system_attention_required');
    const pausedGroup = screen.getByTestId('runtime-group-paused_waiting_for_direction');
    expect(inProgressGroup).toHaveTextContent('common.runtime.groupSummaries.inProgress 2');
    expect(systemGroup).toHaveTextContent('common.runtime.groupSummaries.systemAttention 1');
    expect(pausedGroup).toHaveTextContent('common.runtime.groupSummaries.pausedWaiting 1');
    expect(inProgressGroup.compareDocumentPosition(systemGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(systemGroup.compareDocumentPosition(pausedGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.body.textContent).toContain('Runtime closeout');
    expect(screen.getByText('写作')).toBeInTheDocument();
    expect(document.body.textContent).toContain('Med Auto Science paper mission');
    expect(screen.queryByText('DM003 duplicate binding row')).not.toBeInTheDocument();
    const defaultViewText = document.body.textContent?.split('common.runtime.advancedRuntimeDetails')[0] ?? '';
    expect(defaultViewText).not.toContain('common.runtime.scopeSourceLabel');
    expect(defaultViewText).not.toContain('common.runtime.scopeInferredHint');
    expect(defaultViewText).not.toContain('common.runtime.metricHints.');
    expect(defaultViewText).not.toContain('common.runtime.moduleDirty');
    expect(defaultViewText).not.toContain('bookforge-1.0.0');
    expect(defaultViewText).not.toContain('Latest OPL runtime closeout differs from the MAS owner-consumed receipt');
    expect(defaultViewText).not.toContain('OPL runtime stage attempt needs operator attention; MAS terminalization');
    expect(defaultViewText).not.toContain('telemetry missing');
    expect(defaultViewText).not.toContain('med-autoscience');
    expect(defaultViewText).not.toMatch(/\b(medautoscience|medautogrant|redcube|oplmetaagent|oplbookforge)\b/);
    expect(defaultViewText).not.toContain('submission_milestone_candidate::followthrough::followthrough-01');
    expect(defaultViewText).not.toContain('domain_route/reconcile-apply');
    expect(defaultViewText).not.toContain('Publication evidence packet');
    expect(defaultViewText).not.toContain('artifact://dm002-publication-evidence');
    expect(defaultViewText).not.toContain('Preview reviewer handoff');
    expect(defaultViewText).not.toContain('resource://dm002-fabric-status');
    expect(defaultViewText).not.toContain('2026-07-04T19:00:00Z');
    expect(defaultViewText).not.toContain('telemetry_status');
    expect(defaultViewText).not.toContain('source_ref_count');
    expect(defaultViewText).not.toMatch(/Temporal|provider|projection|投影|引用|stage_attempt|wf_/i);
    expect(defaultViewText).not.toContain('common.runtime.masOwnerConsumptionDrift');
    expect(defaultViewText).not.toContain('common.runtime.automationStates.pendingTerminalization');
    const dm002Row = screen
      .getAllByTestId('runtime-task-row')
      .find((row) => row.textContent?.includes('DM002 paper line'));
    if (!dm002Row) throw new Error('DM002 task row should be visible');
    fireEvent.click(within(dm002Row).getByText('common.runtime.taskDetails.open'));
    const dm002Details = await screen.findByTestId('runtime-task-detail-dm002-publication-eval');
    expect(dm002Details).toHaveTextContent('common.runtime.taskDetails.stageMap');
    expect(dm002Details).toHaveTextContent('common.runtime.taskDetails.stage.completed');
    expect(dm002Details).toHaveTextContent('Intake');
    expect(dm002Details).toHaveTextContent('common.runtime.taskDetails.stage.current');
    expect(dm002Details).toHaveTextContent('Publication repair check');
    expect(dm002Details).toHaveTextContent('common.runtime.taskDetails.stage.next');
    expect(dm002Details).toHaveTextContent('Finish reviewer evaluation against current inputs');
    expect(dm002Details).toHaveTextContent('common.runtime.taskDetails.attemptCount');
    expect(dm002Details).toHaveTextContent('common.runtime.taskDetails.currentAttempt');
    expect(dm002Details).toHaveTextContent('1 1');
    expect(dm002Details).toHaveTextContent('1h');
    expect(dm002Details).toHaveTextContent('common.runtime.usageStageAndTotal 128 tokens 512 tokens');
    expect(dm002Details).toHaveTextContent('common.runtime.runningProofHeartbeat 2026-06-02T00:01:12.853Z');
    expect(dm002Details).toHaveTextContent('common.runtime.taskDetails.timeline');
    expect(dm002Details).toHaveTextContent('common.runtime.taskDetails.evidence');
    expect(dm002Details).toHaveTextContent('Publication evidence packet');
    expect(dm002Details).toHaveTextContent('artifact://dm002-publication-evidence');
    expect(dm002Details).toHaveTextContent('common.runtime.taskDetails.actions');
    expect(dm002Details).toHaveTextContent('Preview reviewer handoff');
    expect(dm002Details).toHaveTextContent('common.runtime.taskDetails.resources');
    expect(dm002Details).toHaveTextContent('Fabric resource');
    expect(dm002Details).toHaveTextContent('common.runtime.taskDetails.diagnostics');
    expect(dm002Details).not.toHaveTextContent('paper_autonomy/repair-recheck');
    expect(screen.queryByText('common.runtime.maintenanceAttentionSummaryText 4')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('common.runtime.advancedRuntimeDetails'));
    await waitFor(() =>
      expect(screen.getByText('common.runtime.maintenanceAttentionSummaryText 4')).toBeInTheDocument()
    );
    expect(document.body.textContent).toContain('common.runtime.scopeDiagnostics');
    expect(document.body.textContent).toContain('common.runtime.scopeSourceLabel');
    expect(document.body.textContent).toContain('common.runtime.moduleDirty');
    expect(document.body.textContent).toContain('common.runtime.masOwnerConsumptionDrift');
  });

  it('keeps explicit full-detail workbench tasks in diagnostics after full detail load', async () => {
    bridgeMocks.getDrilldownInvoke.mockImplementation(({ detail }: { detail: 'summary' | 'full' }) =>
      Promise.resolve({
        surface: detail === 'summary' ? 'runtime_summary' : 'runtime_full',
        command:
          detail === 'summary'
            ? 'opl runtime app-operator-drilldown --json'
            : 'opl runtime app-operator-drilldown --detail full --json',
        stdout: JSON.stringify({
          app_operator_drilldown: {
            surface_kind: 'opl_app_operator_drilldown_read_model',
            summary: { stage_attempt_count: 25, current_control_state_blocked_count: 3 },
            runtime_workbench:
              detail === 'full'
                ? {
                    task_drilldowns: [
                      {
                        task_id: 'full-dm002',
                        domain_id: 'medautoscience',
                        domain_label: 'MAS',
                        title: 'Full detail DM002 guarded apply',
                        state: 'checkpointed',
                        active_stage_id: 'paper_autonomy/guarded-apply',
                        stage_attempt_ids: ['sat_full_dm002'],
                        progress_delta_classification: 'deliverable_progress',
                        deliverable_progress_delta: { count: 1 },
                      },
                    ],
                  }
                : {},
            artifact_gallery_refs:
              detail === 'full'
                ? {
                    refs: [
                      {
                        ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/publication_eval/latest.json',
                      },
                      {
                        ref: 'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/controller_decisions/latest.json',
                      },
                    ],
                  }
                : { refs: [] },
          },
        }),
      })
    );

    render(<RuntimePage />);

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));
    fireEvent.click(screen.getByText('common.runtime.advancedRuntimeDetails'));
    fireEvent.click(screen.getByText('common.runtime.fullDetail'));

    await waitFor(() => expect(screen.getByText('common.runtime.fullDetailReady')).toBeInTheDocument());
    expect(screen.queryByText('Full detail DM002 guarded apply')).not.toBeInTheDocument();
    expect(document.body.textContent).toContain('sat_full_dm002');
    expect(
      screen.getByText('studies/002-dm-china-us-mortality-attribution/artifacts/publication_eval/latest.json')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/controller_decisions/latest.json'
      )
    ).toBeInTheDocument();
  });

  it('prefers canonical WorkItemProjection items over legacy task drilldowns on the Runtime page', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValue({
      ...appStateResult,
      parsed: {
        app_state: {
          ...appStateResult.parsed.app_state,
          operator: {
            status: 'ready',
            workbench: {
              work_item_projection_v1: {
                surface_kind: 'opl_work_item_projection',
                schema_version: 'work-item-projection.v1',
                items: [
                  {
                    item_id: 'dm002-canonical',
                    title: 'Canonical DM002 task',
                    work_item: {
                      work_item_id: 'dm002',
                      label: 'Canonical publication evaluation',
                      study_id: '002-dm-china-us-mortality-attribution',
                      project_label: 'DM002 canonical paper line',
                    },
                    agent: {
                      agent_id: 'medautoscience',
                      label: 'Med Auto Science',
                      owner: 'medautoscience',
                    },
                    stage: {
                      stage_id: 'canonical-stage',
                      display_label: 'Canonical write stage',
                      execution_run_label: 'Canonical run',
                    },
                    attempt: {
                      attempt_id: 'sat_canonical',
                      attempt_ref: 'attempt://canonical',
                      attempt_ids_ref: 'attempts://canonical',
                      attempt_count: 1,
                      active_run_id: 'run_canonical',
                      elapsed_seconds: 120,
                      last_heartbeat_at: '2026-07-01T00:02:00Z',
                      stage_usage: { total_tokens: 42 },
                      task_total_usage: { total_tokens: 80 },
                      refs_only: true,
                    },
                    action: {
                      action_kind: 'agent_action',
                      title: 'Canonical next action',
                      summary: 'Canonical reviewer next action',
                      owner: 'Med Auto Science',
                      action_ref: 'action://canonical',
                    },
                    evidence: {
                      refs_only: true,
                      cards: [
                        {
                          card_id: 'canonical-evidence',
                          title: 'Canonical evidence refs',
                          summary: 'Canonical refs available',
                          ref: 'evidence://canonical',
                        },
                      ],
                    },
                    status: {
                      primary_state: 'in_progress',
                      primary_state_label: 'common.runtime.primaryStates.inProgress',
                      automation_state: 'automation_running',
                      automation_state_label: 'common.runtime.automationStates.running',
                    },
                    conditions: [
                      {
                        type: 'Running',
                        status: 'True',
                        reason: 'agent_action',
                        message: 'Work item is being advanced.',
                        owner: 'medautoscience',
                      },
                    ],
                  },
                ],
              },
              task_drilldowns: [
                {
                  task_id: 'dm002-canonical',
                  domain_id: 'medautoscience',
                  domain_label: 'Med Auto Science',
                  workspace_id: 'dm-cvd-mortality-risk',
                  workspace_label: 'DM CVD Mortality Risk',
                  project_id: 'dm002',
                  project_display_name: 'Legacy DM002 paper line',
                  work_item_display_name: 'Legacy publication evaluation',
                  title: 'Legacy DM002 task',
                  state: 'running',
                  primary_state: 'in_progress',
                  automation_state: 'automation_running',
                  active_stage_id: 'paper_autonomy/legacy-stage',
                  active_stage_label: 'Legacy stage',
                  next_visible_step: 'Legacy next action',
                  next_owner: 'Legacy owner',
                  last_progress_at: '2026-07-01T00:00:00Z',
                  stage_attempt_ids: ['sat_legacy'],
                  active_path: [
                    {
                      node_id: 'stage-intake',
                      label: 'Intake',
                      state: 'completed',
                    },
                  ],
                  stage_run_cockpit: {
                    elapsed_seconds: 120,
                    last_heartbeat_at: '2026-07-01T00:02:00Z',
                    stage_usage: { total_tokens: 11 },
                    task_total_usage: { total_tokens: 22 },
                  },
                  evidence_cards: [
                    {
                      card_id: 'legacy-evidence',
                      title: 'Legacy evidence refs',
                      summary: 'Legacy refs available',
                      ref: 'evidence://legacy',
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    });

    render(<RuntimePage />);

    await waitFor(() => expect(screen.getByText('Canonical publication evaluation')).toBeInTheDocument());
    expect(document.body.textContent).toContain('DM002 canonical paper line');
    expect(document.body.textContent).toContain('Canonical write stage');
    expect(document.body.textContent).toContain('Canonical reviewer next action');
    expect(document.body.textContent).not.toContain('Legacy publication evaluation');
    expect(document.body.textContent).not.toContain('Legacy next action');

    const taskRow = screen
      .getAllByTestId('runtime-task-row')
      .find((row) => row.textContent?.includes('Canonical publication evaluation'));
    if (!taskRow) throw new Error('Canonical task row should be visible');
    fireEvent.click(within(taskRow).getByText('common.runtime.taskDetails.open'));

    const detail = await screen.findByTestId('runtime-task-detail-dm002-canonical');
    expect(detail).toHaveTextContent('Canonical evidence refs');
    expect(detail).toHaveTextContent('evidence://canonical');
    expect(detail).toHaveTextContent('common.runtime.usageStageAndTotal 42 tokens 80 tokens');
    expect(detail).toHaveTextContent('common.runtime.runningProofHeartbeat 2026-07-01T00:02:00Z');
    expect(detail).toHaveTextContent('common.runtime.taskDetails.diagnostics');
    expect(detail).toHaveTextContent('attempt://canonical');
    expect(detail).not.toHaveTextContent('Legacy evidence refs');
    expect(detail).not.toHaveTextContent('common.runtime.usageStageAndTotal 11 tokens 22 tokens');
    expect(detail).not.toHaveTextContent('paper_autonomy/legacy-stage');
  });

  it('renders action preview and receipt summaries without moving diagnostics into the default task view', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValue({
      ...appStateResult,
      parsed: {
        app_state: {
          ...appStateResult.parsed.app_state,
          operator: {
            status: 'ready',
            workbench: {
              task_drilldowns: [
                {
                  task_id: 'dm002-publication-eval',
                  domain_id: 'medautoscience',
                  domain_label: 'Med Auto Science',
                  title: 'DM002 publication evaluation',
                  state: 'running',
                  active_stage_id: 'paper_autonomy/repair-recheck',
                  progress_delta_classification: 'deliverable_progress',
                  next_visible_step: 'Finish reviewer evaluation against current inputs',
                  next_owner: 'AI reviewer',
                  artifact_or_blocker_summary: 'publication evaluation artifact is available',
                  action_receipt_refs: [{ ref: 'receipt://reviewer/task-ref' }],
                },
              ],
            },
          },
          actions: [
            {
              action_id: 'reviewer-receipt-preview',
              submit_via: 'opl app action execute',
              can_submit_to_safe_action_shell: true,
              dry_run_supported: true,
            },
          ],
        },
      },
    });
    bridgeMocks.executeActionInvoke.mockResolvedValueOnce({
      stdout: '{}',
      parsed: {
        action_preview_summary: 'would refresh reviewer receipt sources only',
        receipt_ref: 'receipt://reviewer/dry-run',
        current_control_state: { provider_kind: 'temporal' },
      },
    });

    render(<RuntimePage />);

    await waitFor(() => expect(screen.getAllByText('DM002 publication evaluation').length).toBeGreaterThan(0));
    expect(document.body.textContent?.split('common.runtime.advancedRuntimeDetails')[0]).toContain(
      'Finish reviewer evaluation against current inputs'
    );
    expect(document.body.textContent?.split('common.runtime.advancedRuntimeDetails')[0]).not.toMatch(
      /Temporal|provider|current_control_state|attempt/i
    );

    fireEvent.click(screen.getByText('common.runtime.advancedRuntimeDetails'));
    fireEvent.click(screen.getByText('common.runtime.dryRun'));

    await waitFor(() =>
      expect(document.body.textContent).toContain(
        'common.runtime.actionPreviewSummary: would refresh reviewer receipt sources only'
      )
    );
    expect(document.body.textContent).toContain('common.runtime.actionReceiptSummary: receipt://reviewer/dry-run');
  });
});
