import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RuntimePage from '@/renderer/pages/runtime';
import RuntimeSettings from '@/renderer/pages/settings/sections/RuntimeSettings';

const bridgeMocks = vi.hoisted(() => ({
  getAppStateInvoke: vi.fn(),
  getDrilldownInvoke: vi.fn(),
  executeActionInvoke: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      getAppState: { invoke: bridgeMocks.getAppStateInvoke },
      getInitialize: { invoke: vi.fn() },
      runInstallPrep: { invoke: vi.fn() },
      getDrilldown: { invoke: bridgeMocks.getDrilldownInvoke },
      executeAction: { invoke: bridgeMocks.executeActionInvoke },
    },
    shell: {
      openFolderWith: { invoke: vi.fn() },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      const renderedValues = Object.values(values ?? {})
        .filter((value) => value !== undefined && value !== null && String(value).length > 0)
        .map(String)
        .join(' ');
      return renderedValues ? `${key} ${renderedValues}` : key;
    },
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
            status: 'attention_needed',
            path: '/Users/example/workspace/med-autoscience',
          },
        ],
      },
      actions: [],
    },
  },
};

describe('RuntimeSettings app state bridge usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    bridgeMocks.getAppStateInvoke.mockResolvedValue(appStateResult);
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

    fireEvent.click(screen.getByText('settings.oplEnvironmentPage.actions.refresh'));

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(2));
    expect(bridgeMocks.getAppStateInvoke).toHaveBeenLastCalledWith({ profile: 'fast' });
    expect(bridgeMocks.getDrilldownInvoke).not.toHaveBeenCalled();
  });

  it('renders runtime status and module path-source values through i18n aliases', async () => {
    render(<RuntimeSettings />);

    await waitFor(() =>
      expect(
        screen.getAllByText('settings.oplEnvironmentPage.status.attention_required attention_required').length
      ).toBeGreaterThan(0)
    );
    expect(document.body.textContent).toContain(
      'settings.oplEnvironmentPage.moduleVersion.pathSources.familyWorkspaceRoot'
    );
    expect(screen.queryByText('settings.oplEnvironmentPage.status.attention_needed')).not.toBeInTheDocument();
  });

  it('keeps the Settings Runtime refresh button idle during cached background revalidation', async () => {
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
    const button = screen.getByText('settings.oplEnvironmentPage.actions.refresh').closest('button');
    expect(button?.className).not.toContain('arco-btn-loading');
    expect(button?.getAttribute('aria-busy')).not.toBe('true');

    await act(async () => {
      resolveState(appStateResult);
    });
  });

  it('deduplicates Settings Runtime refresh while the initial App state read is still pending', async () => {
    let resolveState: (value: typeof appStateResult) => void = () => {};
    bridgeMocks.getAppStateInvoke.mockReturnValue(
      new Promise((resolve) => {
        resolveState = resolve;
      })
    );

    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(1));
    const button = screen.getByText('settings.oplEnvironmentPage.actions.refresh').closest('button');
    expect(button).toBeTruthy();

    fireEvent.click(button!);

    expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(1);
    expect(button?.className).toContain('arco-btn-loading');

    await act(async () => {
      resolveState(appStateResult);
    });

    await waitFor(() => expect(button?.className).not.toContain('arco-btn-loading'));
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
    expect(button?.className).not.toContain('arco-btn-loading');
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
          operator: {
            status: 'ready',
            summary: {
              runtime_status: 'ready',
              provider_status: 'ready',
              visible_action_count: 20,
              profile: 'fast',
            },
            workbench: {
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
                  title: 'DM002 publication evaluation',
                  state: 'running',
                  active_stage_id: 'paper_autonomy/repair-recheck',
                  active_stage_label: 'Publication repair check',
                  progress_delta_classification: 'deliverable_progress',
                  deliverable_progress_delta: { count: 1 },
                  platform_repair_delta: { count: 0 },
                  next_visible_step: 'Finish reviewer evaluation against current inputs',
                  next_owner: 'AI reviewer',
                  last_progress_at: '2026-06-02T00:01:12.853Z',
                  stage_attempt_ids: ['sat_dm002'],
                  blocker_ref_count: 0,
                },
                {
                  task_id: 'dm003-publication-gate',
                  domain_id: 'medautogrant',
                  domain_label: 'Med Auto Grant',
                  title: 'DM003 grant aftercare',
                  state: 'queued',
                  active_stage_id: 'aftercare/reviewer-refresh',
                  active_stage_label: 'Reviewer refresh',
                  progress_delta_classification: 'human_gate',
                  deliverable_progress_delta: { count: 0 },
                  platform_repair_delta: { count: 0 },
                  next_visible_step: 'Wait for owner confirmation',
                  next_owner: 'User',
                  blocker_ref_count: 1,
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

    await waitFor(() => expect(screen.getByText('common.runtime.taskOverview')).toBeInTheDocument());
    expect(bridgeMocks.getDrilldownInvoke).toHaveBeenCalledWith({ detail: 'summary' });
    expect(screen.getByText('common.runtime.runningTasks')).toBeInTheDocument();
    expect(screen.getByText('common.runtime.runningTaskCount 1')).toBeInTheDocument();
    expect(screen.getByText('common.runtime.activeProjectCount 2')).toBeInTheDocument();
    expect(screen.getByText('common.runtime.queuedTaskCount 1')).toBeInTheDocument();
    expect(screen.getByText('common.runtime.attentionTaskCount 1')).toBeInTheDocument();
    expect(screen.getByText('common.runtime.taskProgress')).toBeInTheDocument();
    expect(screen.getByText('DM002 publication evaluation')).toBeInTheDocument();
    expect(screen.getByText('common.runtime.currentStage Publication repair check')).toBeInTheDocument();
    expect(
      screen.getByText('common.runtime.nextStep Finish reviewer evaluation against current inputs')
    ).toBeInTheDocument();
    expect(screen.getByText('common.runtime.nextOwner AI reviewer')).toBeInTheDocument();
    expect(screen.getByText('common.runtime.inactiveTasks')).toBeInTheDocument();
    expect(screen.getByText('common.runtime.inactiveTaskSummaryText 1')).toBeInTheDocument();
    expect(screen.queryByText('DM003 grant aftercare')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('common.runtime.inactiveTasks'));
    expect(screen.getByText('DM003 grant aftercare')).toBeInTheDocument();
    expect(screen.getByText('common.runtime.nextOwner User')).toBeInTheDocument();
    const defaultViewText = document.body.textContent?.split('common.runtime.advancedRuntimeDetails')[0] ?? '';
    expect(defaultViewText).not.toMatch(/Temporal|provider|projection|投影|引用|refs|stage attempt/i);
    expect(screen.queryByText('common.runtime.maintenanceAttentionSummaryText 4')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('common.runtime.advancedRuntimeDetails'));
    await waitFor(() =>
      expect(screen.getByText('common.runtime.maintenanceAttentionSummaryText 4')).toBeInTheDocument()
    );
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
    expect(
      screen.getByText('studies/002-dm-china-us-mortality-attribution/artifacts/publication_eval/latest.json')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/controller_decisions/latest.json'
      )
    ).toBeInTheDocument();
  });
});
