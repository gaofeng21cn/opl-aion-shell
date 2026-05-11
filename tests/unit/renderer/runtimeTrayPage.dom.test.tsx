import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';
import type { RuntimeTrayOpenPayload } from '@/renderer/pages/runtime/types';
import RuntimeTrayItemPage from '@/renderer/pages/runtime';

vi.mock('@/common', () => ({
  ipcBridge: {
    shell: {
      openExternal: { invoke: vi.fn() },
      openFile: { invoke: vi.fn() },
      runOplCommand: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@icon-park/react', () => ({
  FolderOpen: () => <span data-testid='icon-folder-open' />,
  Left: () => <span data-testid='icon-left' />,
  Refresh: () => <span data-testid='icon-refresh' />,
}));

vi.mock('@arco-design/web-react', () => {
  const Collapse = Object.assign(
    ({ children }: { children?: React.ReactNode }) => <div data-testid='arco-collapse'>{children}</div>,
    {
      Item: ({ children, header }: { children?: React.ReactNode; header?: React.ReactNode }) => (
        <section>
          <h2>{header}</h2>
          {children}
        </section>
      ),
    }
  );

  return {
    Button: ({
      children,
      onClick,
      ...props
    }: {
      children?: React.ReactNode;
      onClick?: () => void;
      [key: string]: unknown;
    }) => (
      <button onClick={onClick} {...props}>
        {children}
      </button>
    ),
    Collapse,
    Empty: ({ description }: { description?: React.ReactNode }) => <div>{description}</div>,
    Message: {
      error: vi.fn(),
      success: vi.fn(),
    },
    Spin: () => <div data-testid='arco-spin' />,
    Tag: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  };
});

const translations: Record<string, string> = {
  'common.refresh': 'Refresh',
  'common.historyBack': 'Back',
  'common.open': 'Open',
  'common.runtimeTray.activeRun': 'Active Run',
  'common.runtimeTray.attentionReason': 'Status Note',
  'common.runtimeTray.attentionReasonChecks': 'This task has {{count}} open quality or delivery check(s).',
  'common.runtimeTray.attentionReasonDefault': 'Runtime state requires review against the current project projection.',
  'common.runtimeTray.actionSummaryDefault': 'Runtime projection loaded; awaiting the next status update.',
  'common.runtimeTray.attentionReasonInfra':
    'Background supervision item; no user action is required unless the condition persists.',
  'common.runtimeTray.attentionReasonRecovering':
    'Runtime recovery is in progress; continuity on the same paper line must be confirmed after recovery.',
  'common.runtimeTray.attentionReasonReview': 'Review or delivery handoff is pending; user confirmation is required.',
  'common.runtimeTray.currentSituation': 'Current Status',
  'common.runtimeTray.developerDetails': 'Developer Details',
  'common.runtimeTray.health': 'Health',
  'common.runtimeTray.masPortal': 'MAS Portal',
  'common.runtimeTray.masWorkbench.actionAvailable': 'Available',
  'common.runtimeTray.masWorkbench.actionDisabled': 'Disabled',
  'common.runtimeTray.masWorkbench.actionReceiptRequired': 'MAS receipt required',
  'common.runtimeTray.masWorkbench.actions': 'Actions',
  'common.runtimeTray.masWorkbench.activeRun': 'Active Run',
  'common.runtimeTray.masWorkbench.artifact': 'Artifact',
  'common.runtimeTray.masWorkbench.conversationReadModel': 'Executor Conversation',
  'common.runtimeTray.masWorkbench.currentStage': 'Current Stage',
  'common.runtimeTray.masWorkbench.freshnessStatus': 'Freshness',
  'common.runtimeTray.masWorkbench.freshnessSummary': 'Freshness Summary',
  'common.runtimeTray.masWorkbench.links': 'Workbench Links',
  'common.runtimeTray.masWorkbench.liveConsoleReadModel': 'Live Console',
  'common.runtimeTray.masWorkbench.noActions': 'No available actions',
  'common.runtimeTray.masWorkbench.noLinks': 'No workbench links',
  'common.runtimeTray.masWorkbench.openMonitoring': 'Open Monitoring',
  'common.runtimeTray.masWorkbench.portalFallback': 'Portal fallback',
  'common.runtimeTray.masWorkbench.portalFallbackDescription':
    'This item has MAS Portal metadata but no App-native workbench projection yet. The workspace-local Portal remains available for inspection.',
  'common.runtimeTray.masWorkbench.portalSource': 'Portal Source',
  'common.runtimeTray.masWorkbench.progress': 'Progress',
  'common.runtimeTray.masWorkbench.progressPayload': 'Progress Payload',
  'common.runtimeTray.masWorkbench.sourceRefs': 'Workbench Source References',
  'common.runtimeTray.masWorkbench.state': 'State',
  'common.runtimeTray.masWorkbench.studyId': 'Study',
  'common.runtimeTray.masWorkbench.summary': 'Summary',
  'common.runtimeTray.masWorkbench.terminalAttachGate': 'Terminal Gate',
  'common.runtimeTray.masWorkbench.terminalInput': 'Terminal Input',
  'common.runtimeTray.masWorkbench.terminalInputDisabled':
    'Interactive terminal input is disabled until MAS exposes an attach-capable live run.',
  'common.runtimeTray.masWorkbench.terminalMode': 'Terminal',
  'common.runtimeTray.masWorkbench.title': 'MAS Runtime Workbench',
  'common.runtimeTray.masWorkbench.userNext': 'User Next',
  'common.runtimeTray.masWorkbench.workbenchSource': 'Workbench Source',
  'common.runtimeTray.masWorkbench.worker': 'Worker',
  'common.runtimeTray.infrastructureProblem': 'Background Supervision Status',
  'common.runtimeTray.infrastructureRecovery': 'Recovery Action',
  'common.runtimeTray.attemptWorkbench.attempt': 'Stage Attempt',
  'common.runtimeTray.attemptWorkbench.authorityBoundary':
    'Provider completion is transport status only. Domain readiness, quality verdicts, and artifact authority remain owned by the domain agent.',
  'common.runtimeTray.attemptWorkbench.checkpoints': 'Checkpoints',
  'common.runtimeTray.attemptWorkbench.closeoutReceipt': 'Closeout Receipt',
  'common.runtimeTray.attemptWorkbench.closeoutRefs': 'Closeout References',
  'common.runtimeTray.attemptWorkbench.consumedRefs': 'Consumed References',
  'common.runtimeTray.attemptWorkbench.deadLetter': 'Dead Letter',
  'common.runtimeTray.attemptWorkbench.deadLetterCount': 'Dead Letters',
  'common.runtimeTray.attemptWorkbench.domainReadyVerdict': 'Domain Ready Verdict',
  'common.runtimeTray.attemptWorkbench.heartbeat': 'Heartbeat',
  'common.runtimeTray.attemptWorkbench.humanGate': 'Human Gate',
  'common.runtimeTray.attemptWorkbench.humanGateCount': 'Human Gates',
  'common.runtimeTray.attemptWorkbench.nextOwner': 'Next Owner',
  'common.runtimeTray.attemptWorkbench.noAttempts': 'No stage attempts in the local OPL ledger.',
  'common.runtimeTray.attemptWorkbench.providerCompletion': 'Provider Completion',
  'common.runtimeTray.attemptWorkbench.rejectedWrites': 'Rejected Writes',
  'common.runtimeTray.attemptWorkbench.resume': 'Resume',
  'common.runtimeTray.attemptWorkbench.routeImpact': 'Route Impact',
  'common.runtimeTray.attemptWorkbench.title': 'Stage Attempt Workbench',
  'common.runtimeTray.attemptWorkbench.total': 'Attempts',
  'common.runtimeTray.monitoringUrl': 'Monitoring URL',
  'common.runtimeTray.noRuntimeItems': 'No runtime items',
  'common.runtimeTray.noSourceRefs': 'No source references',
  'common.runtimeTray.openMasPortal': 'Open MAS Portal',
  'common.runtimeTray.openWorkspace': 'Open Workspace',
  'common.runtimeTray.operatorView': 'Operator View',
  'common.runtimeTray.oplHandling': 'Current Processing',
  'common.runtimeTray.physicianView': 'Status Summary',
  'common.runtimeTray.portalFreshness': 'Portal Freshness',
  'common.runtimeTray.portalPayloadRef': 'Portal Payload',
  'common.runtimeTray.portalSourceRefs': 'Portal Source References',
  'common.runtimeTray.primaryCommand': 'Primary Command',
  'common.runtimeTray.project': 'Project',
  'common.runtimeTray.runtimeStatusTitle': 'OPL Runtime Status',
  'common.runtimeTray.sourceRef': 'Source {{index}}',
  'common.runtimeTray.sourceRefs': 'Source References',
  'common.runtimeTray.study': 'Study',
  'common.runtimeTray.summaryByOwner':
    '{{running}} running, {{opl}} in process, {{infrastructure}} background recovery, {{user}} user action',
  'common.runtimeTray.tellOpl': 'Suggested Instruction',
  'common.runtimeTray.tellOplCheck':
    'Check the current state of {{title}} and confirm whether user review, confirmation, or additional material is required.',
  'common.runtimeTray.tellOplInfra':
    'Check background supervision for {{title}}; restore the supervision task if the condition persists.',
  'common.runtimeTray.tellOplNextAction': 'Continue {{title}}; priority item: {{nextAction}}',
  'common.runtimeTray.tellOplRecovering':
    'Check whether {{title}} has recovered; continue the current paper-line revision package after recovery.',
  'common.runtimeTray.tellOplReview':
    'Submission or review package for {{title}} has been reviewed; continue on the same paper line.',
  'common.runtimeTray.updatedAt': 'Updated',
  'common.runtimeTray.userActionRequired': 'User Action',
  'common.runtimeTray.whyNotDone': 'Open Items',
  'common.runtimeTray.workspaceLabel': 'Workspace',
  'common.status': 'Status',
  'common.tray.runtimeAttention': 'User Action Required',
  'common.tray.runtimeInfrastructure': 'Background Recovery',
  'common.tray.runtimeOplAction': 'In Process',
  'common.tray.runtimeRecent': 'Recent Items',
  'common.tray.runtimeRunning': 'Running Items',
  'common.tray.runtimeStatusIdle': 'Idle',
  'common.tray.runtimeStatusNeedsAttention': 'User Action Required',
  'common.tray.runtimeStatusOffline': 'Offline',
  'common.tray.runtimeStatusRunning': 'Running',
  'common.tray.runtimeUserAction': 'User Action',
  'common.tray.untitled': 'Untitled',
  'common.workspace': 'Workspace',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      let value = translations[key] ?? key;
      for (const [name, replacement] of Object.entries(values ?? {})) {
        value = value.replaceAll(`{{${name}}}`, String(replacement));
      }
      return value;
    },
  }),
}));

const runtimeItem: RuntimeTrayOpenPayload = {
  projectId: 'medautoscience',
  projectLabel: 'MAS',
  itemId: 'medautoscience:study:002-dm-china-us-mortality-attribution',
  title: '002-dm-china-us-mortality-attribution',
  statusLabel: 'Live: Analysis campaign',
  summary: 'Publication surface is blocked.',
  updatedAt: '2026-04-30T07:58:52+00:00',
  command: 'uv run python -m med_autoscience.cli study-progress --study-id 002',
  workspacePath: '/workspace/dm-cvd',
  sourceRefs: [{ label: 'runtime_status_summary.json', path: '/workspace/status.json' }],
  actionOwner: 'opl',
  requiresUserAction: false,
  actionKind: 'publication_gate',
  actionSummary: 'Publication quality or delivery checks remain open; current stage: Analysis campaign.',
  studyId: '002-dm-china-us-mortality-attribution',
  detailSummary: '托管运行时在线，研究仍在自动推进。',
  nextActionSummary: '补充分析与稳健性验证',
  activeRunId: 'run-be197b12',
  browserUrl: 'https://example.com/runtime',
  portalPath: '/workspace/dm-cvd/portal/index.html',
  portalUrl: 'https://example.com/mas-portal',
  portalPayloadRef: '/workspace/dm-cvd/portal/payload.json',
  portalFreshness: {
    status: 'fresh',
    summary: 'Recent MAS progress exists',
    latest_event_at: '2026-05-08T16:21:59+00:00',
  },
  portalSourceRefs: [{ label: 'portal_status.json', path: '/workspace/portal/status.json' }],
  healthStatus: 'live',
  blockers: ['claim_evidence_consistency_failed'],
  recommendedCommands: [
    {
      step_id: 'inspect_study_progress',
      title: 'Inspect study progress',
      surface_kind: 'study_progress',
      command: 'medautosci study-progress --study-id 002',
    },
  ],
};

const runOplCommandMock = vi.mocked(ipcBridge.shell.runOplCommand.invoke);

describe('RuntimeTrayItemPage', () => {
  it('shows professional status guidance instead of command suggestions', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/runtime/item', state: { runtimeItem } }]}>
        <RuntimeTrayItemPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Status Summary')).toBeInTheDocument();
    expect(screen.getByText('Current Processing')).toBeInTheDocument();
    expect(
      screen.getByText('Publication quality or delivery checks remain open; current stage: Analysis campaign.')
    ).toBeInTheDocument();
    expect(screen.getByText('Open Items')).toBeInTheDocument();
    expect(screen.queryByText('Suggested Instruction')).not.toBeInTheDocument();
    expect(screen.getByText('Developer Details')).toBeInTheDocument();
    expect(screen.queryByText('Recommended Commands')).not.toBeInTheDocument();
    expect(screen.queryByText('medautosci study-progress --study-id 002')).not.toBeInTheDocument();
  });

  it('shows MAS portal metadata and opens the local portal file first', async () => {
    const openFileMock = vi.mocked(ipcBridge.shell.openFile.invoke);
    const openExternalMock = vi.mocked(ipcBridge.shell.openExternal.invoke);
    openFileMock.mockResolvedValue(undefined);
    openExternalMock.mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={[{ pathname: '/runtime/item', state: { runtimeItem } }]}>
        <RuntimeTrayItemPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getAllByText('002-dm-china-us-mortality-attribution').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Active Run').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('run-be197b12').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Health')).toBeInTheDocument();
    expect(screen.getAllByText('live').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Portal Freshness')).toBeInTheDocument();
    expect(screen.getByText('fresh · Recent MAS progress exists · 2026-05-08T16:21:59+00:00')).toBeInTheDocument();
    expect(screen.getByText('Portal Source References')).toBeInTheDocument();
    expect(screen.getAllByText('/workspace/portal/status.json').length).toBeGreaterThanOrEqual(1);

    screen.getAllByText('Open MAS Portal')[0].click();

    expect(openFileMock).toHaveBeenCalledWith('/workspace/dm-cvd/portal/index.html');
    expect(openExternalMock).not.toHaveBeenCalledWith('https://example.com/mas-portal');
    expect(screen.getByText('Monitoring URL')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/runtime')).toBeInTheDocument();
  });

  it('shows the App-native MAS runtime workbench projection without terminal input ownership', () => {
    const workbenchItem: RuntimeTrayOpenPayload = {
      ...runtimeItem,
      workbenchProjection: {
        surface_kind: 'mas_opl_runtime_workbench_projection',
        schema_version: 'mas_opl_runtime_workbench_projection.v1',
        generated_at: '2026-05-10T12:00:00+00:00',
        terminal: {
          mode: 'read_only_tail',
          reason: 'Terminal input requires a MAS attach lease and action receipt.',
        },
      },
      workbenchProjectionSourceRefs: [
        {
          label: 'workbench_projection',
          path: '/workspace/dm-cvd/portal/payload.json#/mas_opl_runtime_workbench_projection',
        },
      ],
      studyWorkbench: {
        study_id: '002-dm-china-us-mortality-attribution',
        current_stage: 'Analysis campaign',
        macro_state: 'running',
        next_action_summary: 'Finish reviewer evidence matrix',
        user_next: 'No user input required',
        active_run_id: 'run-be197b12',
        worker_state: 'analysis_worker_active',
        freshness: {
          status: 'fresh',
          summary: 'Projection generated from the latest MAS progress payload.',
        },
        terminal: {
          mode: 'read_only_tail',
          reason: 'Terminal input requires a MAS attach lease and action receipt.',
        },
        links: {
          progress_payload_ref: '/workspace/dm-cvd/portal/payload.json',
          conversation_read_model_ref: '/workspace/dm-cvd/runtime/conversation.json',
          live_console_read_model_ref: '/workspace/dm-cvd/runtime/live-console.json',
          terminal_attach_status_ref: '/workspace/dm-cvd/runtime/terminal-attach.json',
          artifact_refs: [{ label: 'Current package', path: '/workspace/dm-cvd/current_package.zip' }],
        },
        actions: {
          pause: {
            allowed: false,
            owner: 'mas',
            endpoint_ref: 'mas:runtime-action:pause',
          },
          refresh_status: {
            allowed: true,
            owner: 'mas',
            endpoint_ref: 'mas:runtime-action:refresh_status',
          },
        },
        source_refs: [{ label: 'study_workbench', path: '/workspace/dm-cvd/runtime/study-workbench.json' }],
      },
    };

    render(
      <MemoryRouter initialEntries={[{ pathname: '/runtime/item', state: { runtimeItem: workbenchItem } }]}>
        <RuntimeTrayItemPage />
      </MemoryRouter>
    );

    expect(screen.getByText('MAS Runtime Workbench')).toBeInTheDocument();
    expect(screen.queryByText('Portal fallback')).not.toBeInTheDocument();
    expect(screen.getByText('Analysis campaign')).toBeInTheDocument();
    expect(screen.getByText('Finish reviewer evidence matrix')).toBeInTheDocument();
    expect(screen.getByText('No user input required')).toBeInTheDocument();
    expect(screen.getByText('Executor Conversation')).toBeInTheDocument();
    expect(screen.getByText('/workspace/dm-cvd/runtime/conversation.json')).toBeInTheDocument();
    expect(screen.getByText('Terminal Gate')).toBeInTheDocument();
    expect(screen.getByText('/workspace/dm-cvd/runtime/terminal-attach.json')).toBeInTheDocument();
    expect(screen.getByText('Current package')).toBeInTheDocument();
    expect(screen.getByText('pause')).toBeInTheDocument();
    expect(screen.getAllByText('Disabled').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('refresh_status')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('Terminal Input')).toBeInTheDocument();
    expect(screen.getByText('Terminal input requires a MAS attach lease and action receipt.')).toBeInTheDocument();
    expect(
      screen.getByText('/workspace/dm-cvd/portal/payload.json#/mas_opl_runtime_workbench_projection')
    ).toBeInTheDocument();
  });

  it('shows natural-language guidance on the runtime overview cards', async () => {
    runOplCommandMock.mockResolvedValue({
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify({
        runtime_tray_snapshot: {
          schema_version: 'runtime_tray_snapshot.v1',
          runtime_health: {
            status: 'running',
            label: 'Running',
            summary: '0 running, 1 in process, 0 background recovery, 0 user action',
          },
          last_updated: '2026-04-30T10:51:34.483Z',
          stage_attempt_workbench: {
            surface_kind: 'opl_stage_attempt_workbench',
            availability: 'available',
            summary: {
              total: 1,
              human_gate_count: 0,
              dead_letter_count: 0,
            },
            attempts: [
              {
                stage_attempt_id: 'sat_001',
                provider_kind: 'temporal',
                domain_id: 'medautoscience',
                stage_id: 'analysis-campaign',
                local_status: 'completed',
                workflow_status: 'completed',
                closeout_receipt_status: 'accepted_typed_closeout',
                closeout_refs: ['receipt:analysis-closeout'],
                checkpoint_refs: ['checkpoint:analysis-midpoint'],
                consumed_memory_refs: ['memory:publication-route-risk-model'],
                rejected_writeback_refs: [
                  {
                    writeback_id: 'wb_001',
                    status: 'rejected',
                    reason: 'single-study claim',
                  },
                ],
                route_impact: {
                  status: 'human_gate',
                  next_owner: 'med-autoscience',
                  summary: 'analysis-campaign closeout needs domain gate',
                },
                resume_refs: ['resume:after-human-review'],
                next_owner: 'med-autoscience',
                completion_boundary: {
                  provider_completion: 'completed',
                  domain_ready_verdict: 'domain_gate_pending',
                  provider_completion_is_domain_ready: false,
                },
                heartbeat: {
                  last_updated_at: '2026-05-10T12:00:00+00:00',
                },
              },
            ],
          },
          running_items: [],
          attention_items: [
            {
              item_id: 'medautoscience:study:002-dm-china-us-mortality-attribution',
              project_id: 'medautoscience',
              project_label: 'MAS',
              title: '002-dm-china-us-mortality-attribution',
              status_label: 'Live: Analysis campaign',
              summary:
                'bundle suggestions are downstream-only until the publication gate allows write. Recommended route-back: `return_to_analysis_campaign`.',
              updated_at: '2026-04-30T10:44:04+00:00',
              command: 'medautosci study-progress --study-id 002',
              workspace_path: '/workspace/dm-cvd',
              source_refs: [],
              action_owner: 'opl',
              requires_user_action: false,
              action_kind: 'publication_gate',
              action_summary: 'Publication quality or delivery checks remain open; current stage: Analysis campaign.',
              study_id: '002-dm-china-us-mortality-attribution',
              workspace_label: 'dm-cvd',
              detail_summary: '系统已检测到运行掉线，正在自动尝试恢复。',
              next_action_summary: '补充分析与稳健性验证',
              active_run_id: 'run-be197b12',
              portal_path: '/workspace/dm-cvd/portal/index.html',
              portal_url: 'https://example.com/mas-portal',
              portal_payload_ref: '/workspace/dm-cvd/portal/payload.json',
              portal_freshness: { status: 'fresh', summary: 'Recent MAS progress exists' },
              portal_source_refs: [{ label: 'portal_status.json', path: '/workspace/portal/status.json' }],
              health_status: 'recovering',
              blockers: ['claim_evidence_consistency_failed'],
              recommended_commands: [
                {
                  step_id: 'inspect_study_progress',
                  title: 'Inspect study progress',
                  surface_kind: 'study_progress',
                  command: 'medautosci study-progress --study-id 002',
                },
              ],
            },
          ],
          recent_items: [],
          action_counts: { user: 0, opl: 1, infrastructure: 0 },
          source_refs: [],
        },
      }),
    });

    render(
      <MemoryRouter initialEntries={['/runtime']}>
        <RuntimeTrayItemPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('In Process')).toBeInTheDocument();
    expect(screen.getByText('Stage Attempt Workbench')).toBeInTheDocument();
    expect(screen.getByText('medautoscience / analysis-campaign / temporal')).toBeInTheDocument();
    expect(screen.getByText('Provider Completion')).toBeInTheDocument();
    expect(screen.getByText('domain_gate_pending')).toBeInTheDocument();
    expect(screen.getByText('Consumed References')).toBeInTheDocument();
    expect(screen.getByText('memory:publication-route-risk-model')).toBeInTheDocument();
    expect(screen.getByText('Rejected Writes')).toBeInTheDocument();
    expect(screen.getByText('id=wb_001; status=rejected; reason=single-study claim')).toBeInTheDocument();
    expect(screen.getByText('Route Impact')).toBeInTheDocument();
    expect(
      screen.getByText('status=human_gate; next=med-autoscience; summary=analysis-campaign closeout needs domain gate')
    ).toBeInTheDocument();
    expect(screen.getByText('Resume')).toBeInTheDocument();
    expect(screen.getByText('resume:after-human-review')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Provider completion is transport status only. Domain readiness, quality verdicts, and artifact authority remain owned by the domain agent.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Current Processing')).toBeInTheDocument();
    expect(
      screen.getByText('Publication quality or delivery checks remain open; current stage: Analysis campaign.')
    ).toBeInTheDocument();
    expect(screen.getByText('Open Items')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Runtime recovery is in progress; continuity on the same paper line must be confirmed after recovery.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('Suggested Instruction')).not.toBeInTheDocument();
    expect(screen.getByText('0 running, 1 in process, 0 background recovery, 0 user action')).toBeInTheDocument();
    expect(screen.queryByText(/Recommended route-back/)).not.toBeInTheDocument();
    expect(screen.queryByText(/return_to_analysis_campaign/)).not.toBeInTheDocument();
    expect(screen.queryByText('medautosci study-progress --study-id 002')).not.toBeInTheDocument();
  });
});
