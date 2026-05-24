import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Message } from '@arco-design/web-react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    Checkbox: ({
      children,
      checked,
      disabled,
      onChange,
    }: {
      children?: React.ReactNode;
      checked?: boolean;
      disabled?: boolean;
      onChange?: (checked: boolean) => void;
    }) => (
      <label>
        <input
          type='checkbox'
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange?.(event.currentTarget.checked)}
        />
        {children}
      </label>
    ),
    Input: {
      TextArea: ({
        value,
        placeholder,
        onChange,
      }: {
        value?: string;
        placeholder?: string;
        onChange?: (value: string) => void;
      }) => (
        <textarea value={value} placeholder={placeholder} onChange={(event) => onChange?.(event.currentTarget.value)} />
      ),
    },
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
  'common.runtimeTray.attemptWorkbench.feedbackFailed': 'Signal failed for {{attempt}}: {{message}}',
  'common.runtimeTray.attemptWorkbench.feedbackPending': 'Sending {{operation}} for {{attempt}}...',
  'common.runtimeTray.attemptWorkbench.feedbackQueued': 'Signal queued for {{attempt}}.',
  'common.runtimeTray.attemptWorkbench.filterActive': 'Active',
  'common.runtimeTray.attemptWorkbench.filterAll': 'All',
  'common.runtimeTray.attemptWorkbench.filterDeadLetter': 'Dead Letter',
  'common.runtimeTray.attemptWorkbench.filterHumanGate': 'Human Gate',
  'common.runtimeTray.attemptWorkbench.filterLabel': 'Attempt Filter',
  'common.runtimeTray.attemptWorkbench.heartbeat': 'Heartbeat',
  'common.runtimeTray.attemptWorkbench.humanGate': 'Human Gate',
  'common.runtimeTray.attemptWorkbench.humanGateCount': 'Human Gates',
  'common.runtimeTray.attemptWorkbench.nextOwner': 'Next Owner',
  'common.runtimeTray.attemptWorkbench.noAttempts': 'No stage attempts in the local OPL ledger.',
  'common.runtimeTray.attemptWorkbench.noFilteredAttempts': 'No stage attempts match this filter.',
  'common.runtimeTray.attemptWorkbench.operations': 'Operations',
  'common.runtimeTray.attemptWorkbench.providerCompletion': 'Provider Completion',
  'common.runtimeTray.attemptWorkbench.rejectedWrites': 'Rejected Writes',
  'common.runtimeTray.attemptWorkbench.resume': 'Resume',
  'common.runtimeTray.attemptWorkbench.selectedAttempt': 'Selected Attempt',
  'common.runtimeTray.attemptWorkbench.showDetails': 'Show Details',
  'common.runtimeTray.attemptWorkbench.signalDeadLetterRepair': 'Request Dead-letter Repair',
  'common.runtimeTray.attemptWorkbench.signalFailed': 'Stage attempt signal failed.',
  'common.runtimeTray.attemptWorkbench.signalHumanGate': 'Request Human Gate',
  'common.runtimeTray.attemptWorkbench.signalQueued': 'Stage attempt signal sent.',
  'common.runtimeTray.attemptWorkbench.signalResume': 'Resume Attempt',
  'common.runtimeTray.attemptWorkbench.routeImpact': 'Route Impact',
  'common.runtimeTray.attemptWorkbench.title': 'Stage Attempt Workbench',
  'common.runtimeTray.attemptWorkbench.total': 'Attempts',
  'common.runtimeTray.appDrilldown.actionRouting': 'Action Routes',
  'common.runtimeTray.appDrilldown.artifacts': 'Artifacts',
  'common.runtimeTray.appDrilldown.authorityBoundary':
    'Refs-only view. OPL does not own domain truth, memory body, artifact body, quality readiness, or export verdict.',
  'common.runtimeTray.appDrilldown.blockers': 'Blockers',
  'common.runtimeTray.appDrilldown.decisionMap': 'Decision Map',
  'common.runtimeTray.appDrilldown.executableRoutes': 'Executable Routes',
  'common.runtimeTray.appDrilldown.exports': 'Exports',
  'common.runtimeTray.appDrilldown.externalEvidence': 'External Evidence',
  'common.runtimeTray.appDrilldown.evidenceCounters': 'Evidence Counters',
  'common.runtimeTray.appDrilldown.externalRequests': 'External Requests',
  'common.runtimeTray.appDrilldown.evidenceGateReceipts': 'Evidence Gate Receipts',
  'common.runtimeTray.appDrilldown.evidenceGates': 'Evidence Gates',
  'common.runtimeTray.appDrilldown.legacyCleanup': 'Legacy Cleanup',
  'common.runtimeTray.appDrilldown.omaAgentLabResults': 'Agent Lab Results',
  'common.runtimeTray.appDrilldown.omaCandidatePackage': 'Candidate Package',
  'common.runtimeTray.appDrilldown.omaDeveloperWorkOrder': 'Developer Work Order',
  'common.runtimeTray.appDrilldown.omaMechanismProposal': 'Mechanism Proposal',
  'common.runtimeTray.appDrilldown.omaScaleoutEvidence': 'Scaleout Evidence',
  'common.runtimeTray.appDrilldown.omaTargetBrief': 'Target Brief',
  'common.runtimeTray.appDrilldown.cleanupPlans': 'Cleanup Plans',
  'common.runtimeTray.appDrilldown.providerCadenceWindow': 'Provider Cadence Window',
  'common.runtimeTray.appDrilldown.cadenceWindowStatus': 'Status',
  'common.runtimeTray.appDrilldown.longEvidenceReady': 'Long Evidence Ready',
  'common.runtimeTray.appDrilldown.expectedReceipts': 'Expected Receipts',
  'common.runtimeTray.appDrilldown.observedReceipts': 'Observed Receipts',
  'common.runtimeTray.appDrilldown.missingReceipts': 'Missing Receipts',
  'common.runtimeTray.appDrilldown.blockedRepairReceipts': 'Blocked Repair Receipts',
  'common.runtimeTray.appDrilldown.functionalAudit': 'Functional Privatization Audit',
  'common.runtimeTray.appDrilldown.openRequests': 'Open Requests',
  'common.runtimeTray.appDrilldown.remainingGates': 'Remaining Gates',
  'common.runtimeTray.appDrilldown.readyPlans': 'Ready Plans',
  'common.runtimeTray.appDrilldown.applyReady': 'Apply Ready',
  'common.runtimeTray.appDrilldown.verifiedReceipts': 'Verified Receipts',
  'common.runtimeTray.appDrilldown.verifiedGateReceipts': 'Verified Gate Receipts',
  'common.runtimeTray.appDrilldown.loadFullDetail': 'Load Full Detail',
  'common.runtimeTray.appDrilldown.fullDetailLoaded': 'Full App drilldown loaded.',
  'common.runtimeTray.appDrilldown.fullDetailFailed': 'Failed to load full App drilldown.',
  'common.runtimeTray.appDrilldown.execute': 'Execute',
  'common.runtimeTray.appDrilldown.executeDryRun': 'Dry Run',
  'common.runtimeTray.appDrilldown.dryRunResult': 'Dry-run Result',
  'common.runtimeTray.appDrilldown.executeResult': 'Execute Result',
  'common.runtimeTray.appDrilldown.actionExecutionSucceeded': 'Action completed.',
  'common.runtimeTray.appDrilldown.actionExecutionFailed': 'Action failed.',
  'common.runtimeTray.appDrilldown.actionExecutionInvalid': 'Action result has an invalid format.',
  'common.runtimeTray.appDrilldown.nextSafeAction': 'Next Safe Action',
  'common.runtimeTray.appDrilldown.safeActionRouteBoundary': 'Safe Action Route',
  'common.runtimeTray.appDrilldown.safeActionRouteInvalid':
    'Safe action is disabled because this projection does not route through the OPL CLI safe-action shell.',
  'common.runtimeTray.appDrilldown.providerHealth': 'Provider Health',
  'common.runtimeTray.appDrilldown.missingEvidence': 'Missing Evidence',
  'common.runtimeTray.appDrilldown.blocking': 'Blocking',
  'common.runtimeTray.appDrilldown.advisory': 'Advisory',
  'common.runtimeTray.appDrilldown.owner': 'Owner',
  'common.runtimeTray.appDrilldown.payloadRefs': 'Payload Refs',
  'common.runtimeTray.appDrilldown.payloadRefsPlaceholder': 'Refs-only JSON payload',
  'common.runtimeTray.appDrilldown.invalidPayload': 'Payload must be refs-only JSON.',
  'common.runtimeTray.appDrilldown.noAttentionPayload': 'No attention-first payload',
  'common.runtimeTray.appDrilldown.noSafeAction': 'No safe action available',
  'common.runtimeTray.appDrilldown.memory': 'Memory Refs',
  'common.runtimeTray.appDrilldown.memoryWriteback': 'Writeback Receipts',
  'common.runtimeTray.appDrilldown.noRefs': 'No refs',
  'common.runtimeTray.appDrilldown.packageLifecycle': 'Package / Export Lifecycle',
  'common.runtimeTray.appDrilldown.packages': 'Packages',
  'common.runtimeTray.appDrilldown.privateResidue': 'Private Residue',
  'common.runtimeTray.appDrilldown.providerSlo': 'Provider SLO',
  'common.runtimeTray.appDrilldown.quality': 'Quality Refs',
  'common.runtimeTray.appDrilldown.readiness': 'Readiness Refs',
  'common.runtimeTray.appDrilldown.reviewRepair': 'Review Queue',
  'common.runtimeTray.appDrilldown.routeGraph': 'Route Graph',
  'common.runtimeTray.appDrilldown.safeActions': 'Safe Actions',
  'common.runtimeTray.appDrilldown.semanticReview': 'Semantic Review',
  'common.runtimeTray.appDrilldown.stageAttempts': 'Stage Attempts',
  'common.runtimeTray.appDrilldown.title': 'App Operator Drilldown',
  'common.runtimeTray.appDrilldown.watchlist': 'Watchlist',
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

const translate = (key: string, values?: Record<string, string | number>) => {
  let value = translations[key] ?? key;
  for (const [name, replacement] of Object.entries(values ?? {})) {
    value = value.replaceAll(`{{${name}}}`, String(replacement));
  }
  return value;
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: translate,
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
  beforeEach(() => {
    vi.clearAllMocks();
    runOplCommandMock.mockReset();
  });

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

  it('keeps non-ISO runtime timestamps readable in developer details', () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/runtime/item',
            state: {
              runtimeItem: {
                ...runtimeItem,
                updatedAt: '当前 grant 已进入 critique 阶段',
              },
            },
          },
        ]}
      >
        <RuntimeTrayItemPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Updated')).toBeInTheDocument();
    expect(screen.getByText('当前 grant 已进入 critique 阶段')).toBeInTheDocument();
    expect(screen.queryByText('Invalid Date')).not.toBeInTheDocument();
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
    const snapshotResponse = {
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
          app_operator_drilldown: {
            surface_kind: 'opl_app_operator_drilldown_read_model',
            availability: 'available',
            summary: {
              stage_attempt_count: 1,
              route_graph_ref_count: 1,
              decision_map_ref_count: 1,
              review_repair_queue_item_count: 1,
              artifact_gallery_item_count: 2,
              package_ref_count: 1,
              export_ref_count: 1,
              memory_ref_count: 1,
              memory_writeback_ref_count: 1,
              quality_ref_count: 1,
              readiness_ref_count: 1,
              provider_slo_action_count: 1,
              provider_cadence_window_status: 'window_evidence_incomplete',
              provider_cadence_window_long_evidence_ready: false,
              provider_cadence_window_expected_receipt_count: 7,
              provider_cadence_window_observed_receipt_count: 0,
              provider_cadence_window_missing_receipt_count: 7,
              provider_cadence_window_blocked_repair_receipt_count: 0,
              operator_action_route_count: 2,
              operator_executable_route_count: 1,
              safe_action_ref_count: 1,
              functional_privatization_active_private_generic_residue_count: 0,
              functional_privatization_default_watchlist_count: 0,
              functional_privatization_semantic_equivalence_review_count: 0,
              functional_privatization_blocker_count: 0,
              domain_external_evidence_request_count: 7,
              domain_open_evidence_request_count: 2,
              domain_external_verified_evidence_receipt_count: 5,
              domain_evidence_gate_count: 4,
              domain_remaining_evidence_gate_count: 1,
              domain_evidence_gate_verified_receipt_count: 3,
              domain_legacy_cleanup_plan_count: 3,
              domain_legacy_cleanup_ready_plan_count: 3,
              domain_legacy_cleanup_opl_apply_ready_count: 2,
            },
            attention_first_payload: {
              surface_kind: 'opl_app_drilldown_attention_first_payload',
              owner: {
                projection_owner: 'one-person-lab',
                active_action_owner: 'opl',
                domain_truth_owner: 'domain repositories',
              },
              blocking: {
                items: [
                  {
                    owner: 'medautoscience',
                    blocking_kind: 'typed_blocker_ref',
                    blocker_ref: 'blocker:publication-readiness',
                  },
                ],
                omitted_count: 0,
                total_count: 1,
              },
              advisory: {
                items: [
                  {
                    owner: 'one-person-lab',
                    advisory_kind: 'production_evidence_tail',
                    status: 'open',
                    detail_ref: 'tail:production-evidence',
                  },
                ],
                omitted_count: 0,
                total_count: 1,
              },
              missing_evidence: {
                items: [
                  {
                    owner: 'medautoscience',
                    evidence_kind: 'stage_production_evidence',
                    domain_id: 'medautoscience',
                    stage_id: 'analysis-campaign',
                    missing: ['evidence:soak-window'],
                    detail_ref: 'stage:analysis-campaign',
                    next_safe_action_id: 'stage-production-attempt:medautoscience:analysis-campaign',
                  },
                ],
                omitted_count: 0,
                total_count: 1,
              },
              next_safe_action: {
                action_id: 'stage-production-attempt:medautoscience:analysis-campaign',
                action_kind: 'stage_production_attempt_request',
                owner: 'opl',
                route_target_kind: 'opl_cli',
                submit_via: 'opl runtime action execute',
                submit_args: [
                  'runtime',
                  'action',
                  'execute',
                  '--action',
                  'stage-production-attempt:medautoscience:analysis-campaign',
                ],
                dry_run_supported: true,
                approve_domain_action_supported: false,
                can_submit_to_safe_action_shell: true,
                can_execute_domain_action_directly: false,
                domain_id: 'medautoscience',
                stage_id: 'analysis-campaign',
                expected_receipt_refs: ['receipt:stage-production-request'],
              },
              additional_safe_action_count: 1,
              provider_health: {
                health_status: 'attention_required',
                provider_kind: 'temporal',
                missing_receipt_count: 7,
                blocked_repair_receipt_count: 0,
                domain_truth_boundary_preserved: true,
              },
              authority_boundary: {
                can_write_domain_truth: false,
                can_read_memory_body: false,
                can_read_artifact_body: false,
                can_authorize_quality_verdict: false,
                can_authorize_export_verdict: false,
              },
              full_detail_args: ['--detail', 'full'],
              lazy_load_targets: [
                {
                  section: 'operator_action_routing_refs',
                  detail_args: ['--detail', 'full'],
                  load_policy: 'explicit_drilldown_lazy_load',
                },
              ],
            },
            route_graph_refs: {
              refs: [{ ref: '/stage_attempt_workbench/attempts/sat_001/route_decision_graph', role: 'route_graph' }],
            },
            decision_map_refs: {
              refs: [{ ref: '/stage_attempt_workbench/attempts/sat_001/decision_map', role: 'decision_map' }],
            },
            review_repair_queue_refs: {
              items: [{ repair_target: 'opl family-runtime attempt query sat_001', role: 'review_repair' }],
            },
            artifact_gallery_refs: {
              refs: [
                { ref: 'artifact:analysis-table', role: 'artifact_ref' },
                { ref: 'package:submission-minimal', role: 'package_ref' },
              ],
            },
            package_export_lifecycle_refs: {
              package_refs: ['package:submission-minimal'],
              export_refs: ['export:current-package'],
              gap_report_refs: ['gap:package-readiness'],
              handoff_refs: ['handoff:manual-submission'],
            },
            memory_writeback_refs: {
              consumed_memory_refs: ['memory:publication-route-risk-model'],
              writeback_receipt_refs: ['memory-writeback:receipt-1'],
            },
            quality_readiness_refs: {
              quality_refs: ['publication_eval/latest.json'],
              readiness_refs: ['controller_decisions/latest.json'],
            },
            provider_slo_operator_action_refs: {
              refs: [
                {
                  ref: 'opl family-runtime residency proof --provider temporal --production',
                  role: 'provider_slo_cadence_execution',
                  execution_owner: 'operator_or_infrastructure',
                },
              ],
            },
            operator_action_routing_refs: {
              refs: [
                {
                  ref: 'opl family-runtime attempt query sat_001',
                  action_kind: 'stage_attempt_query',
                  owner: 'opl',
                  execution_policy: 'opl_safe_action_shell',
                },
                {
                  ref: 'domain_owner:med-autoscience',
                  action_kind: 'domain_owner_handoff',
                  owner: 'domain',
                },
              ],
            },
            safe_action_refs: {
              refs: [
                {
                  ref: 'opl family-runtime attempt query sat_001',
                  role: 'safe_action',
                  execution_policy: 'opl_safe_action_shell',
                },
              ],
            },
            functional_privatization_audit_summary: {
              default_watchlist_count: 0,
              semantic_equivalence_review_count: 0,
              active_private_generic_residue_count: 0,
              blocker_count: 0,
            },
            authority_boundary: {
              domain: 'truth_memory_artifact_quality_export_owner',
            },
            oma_sections: {
              target_brief: {
                refs: [
                  {
                    ref: 'oma:target-brief/medautoscience-operator-loop',
                    status: 'blocked_pending_owner_receipt',
                    typed_blocker_ref: 'typed-blocker:oma/target-brief-domain-owner',
                    receipt_ref: 'receipt:oma/target-brief-intake',
                  },
                ],
              },
              candidate_package: {
                refs: [
                  {
                    package_ref: 'package:oma/candidate-standard-domain-agent',
                    status: 'review_pending',
                    blocker_ref: 'blocker:oma/candidate-package-owner-boundary',
                    receipt_ref: 'receipt:oma/candidate-package-captured',
                  },
                ],
              },
              agent_lab_results: {
                refs: [
                  {
                    evidence_ref: 'agent-lab-result:oma/repair-route-suite',
                    result_status: 'blocked_from_auto_promotion',
                    typed_blocker_ref: 'typed-blocker:oma/agent-lab-independent-review',
                    receipt_ref: 'receipt:oma/agent-lab-suite-result',
                  },
                ],
              },
              developer_work_order: {
                refs: [
                  {
                    work_order_ref: 'work-order:oma/app-render-lane-d',
                    status: 'operator_review_required',
                    blocker_ref: 'blocker:oma/work-order-needs-runtime-proof',
                    owner_receipt_ref: 'receipt:oma/work-order-owner-ack',
                  },
                ],
              },
              mechanism_proposal: {
                refs: [
                  {
                    proposal_ref: 'mechanism-proposal:oma/summary-first-app-drilldown',
                    review_status: 'ai_review_pending',
                    typed_blocker_ref: 'typed-blocker:oma/mechanism-review-gate',
                    receipt_ref: 'receipt:oma/mechanism-proposal-captured',
                  },
                ],
              },
              scaleout_evidence: {
                refs: [
                  {
                    evidence_ref: 'scaleout-evidence:oma/mas-mag-rca-owner-chain',
                    status: 'evidence_incomplete',
                    blocker_ref: 'blocker:oma/scaleout-receipt-gap',
                    evidence_receipt_ref: 'receipt:oma/scaleout-partial',
                  },
                ],
              },
            },
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
    };
    const snapshotPayload = JSON.parse(snapshotResponse.stdout) as { runtime_tray_snapshot: Record<string, unknown> };
    const snapshotRecord = snapshotPayload.runtime_tray_snapshot;
    const drilldownRecord = snapshotRecord.app_operator_drilldown as Record<string, unknown>;
    snapshotResponse.stdout = JSON.stringify({
      app_operator_drilldown: {
        ...drilldownRecord,
        runtime_health: snapshotRecord.runtime_health,
        last_updated: snapshotRecord.last_updated,
        stage_attempt_workbench: snapshotRecord.stage_attempt_workbench,
        running_items: snapshotRecord.running_items,
        attention_items: snapshotRecord.attention_items,
        recent_items: snapshotRecord.recent_items,
        action_counts: snapshotRecord.action_counts,
      },
    });
    const fullDetailResponse = {
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify({
        app_operator_drilldown: {
          surface_kind: 'opl_app_operator_drilldown_read_model',
          availability: 'available',
          detail_level: 'full',
          summary: {
            stage_attempt_count: 1,
            route_graph_ref_count: 2,
            decision_map_ref_count: 1,
            review_repair_queue_item_count: 1,
            artifact_gallery_item_count: 2,
            package_ref_count: 1,
            export_ref_count: 1,
            memory_ref_count: 1,
            memory_writeback_ref_count: 1,
            quality_ref_count: 1,
            readiness_ref_count: 1,
            provider_slo_action_count: 1,
            provider_cadence_window_status: 'window_evidence_incomplete',
            provider_cadence_window_long_evidence_ready: false,
            provider_cadence_window_expected_receipt_count: 7,
            provider_cadence_window_observed_receipt_count: 0,
            provider_cadence_window_missing_receipt_count: 7,
            provider_cadence_window_blocked_repair_receipt_count: 0,
            operator_action_route_count: 2,
            operator_executable_route_count: 1,
            safe_action_ref_count: 1,
            functional_privatization_active_private_generic_residue_count: 0,
            functional_privatization_default_watchlist_count: 0,
            functional_privatization_semantic_equivalence_review_count: 0,
            functional_privatization_blocker_count: 0,
          },
          route_graph_refs: {
            refs: [
              { ref: '/stage_attempt_workbench/attempts/sat_001/route_decision_graph', role: 'route_graph' },
              { ref: '/stage_attempt_workbench/attempts/sat_full/route_decision_graph', role: 'route_graph' },
            ],
          },
          authority_boundary: {
            domain: 'truth_memory_artifact_quality_export_owner',
          },
        },
      }),
    };
    const dryRunResponse = {
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify({
        runtime_operator_action_execution: {
          surface_kind: 'opl_runtime_operator_action_execution',
          action_id: 'stage-production-attempt:medautoscience:analysis-campaign',
          dry_run: true,
          execution: {
            execution_status: 'dry_run',
            execution_kind: 'opl_cli_stage_attempt_create',
            executed_runtime_command: 'opl family-runtime attempt create --domain medautoscience',
          },
          authority_boundary: {
            can_write_domain_truth: false,
            can_read_memory_body: false,
            can_read_artifact_body: false,
            can_authorize_quality_verdict: false,
            can_authorize_export_verdict: false,
          },
        },
      }),
    };
    const executeResponse = {
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify({
        runtime_operator_action_execution: {
          surface_kind: 'opl_runtime_operator_action_execution',
          action_id: 'stage-production-attempt:medautoscience:analysis-campaign',
          dry_run: false,
          execution: {
            execution_status: 'executed',
            execution_kind: 'opl_cli_stage_attempt_create',
            executed_runtime_command: 'opl family-runtime attempt create --domain medautoscience',
          },
          authority_boundary: {
            can_write_domain_truth: false,
            can_read_memory_body: false,
            can_read_artifact_body: false,
            can_authorize_quality_verdict: false,
            can_authorize_export_verdict: false,
          },
        },
      }),
    };
    const refreshedSummaryResponse = {
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify({
        app_operator_drilldown: {
          surface_kind: 'opl_app_operator_drilldown_read_model',
          availability: 'available',
          detail_level: 'summary',
          summary: {
            stage_attempt_count: 1,
            route_graph_ref_count: 2,
            operator_action_route_count: 2,
            safe_action_ref_count: 1,
          },
        },
      }),
    };
    let snapshotCallCount = 0;
    runOplCommandMock.mockImplementation(({ args }: { args: string[] }) => {
      if (args.join(' ') === 'runtime app-operator-drilldown --json --detail full') {
        return Promise.resolve(fullDetailResponse);
      }
      if (args.join(' ') === 'runtime app-operator-drilldown --json') {
        snapshotCallCount += 1;
        return Promise.resolve(snapshotCallCount === 1 ? snapshotResponse : refreshedSummaryResponse);
      }
      if (args.join(' ').startsWith('runtime action execute')) {
        return Promise.resolve(args.includes('--dry-run') ? dryRunResponse : executeResponse);
      }
      throw new Error(`unexpected command ${args.join(' ')}`);
    });

    render(
      <MemoryRouter initialEntries={['/runtime']}>
        <RuntimeTrayItemPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('In Process')).toBeInTheDocument();
    expect(runOplCommandMock).toHaveBeenCalledWith({
      args: ['runtime', 'app-operator-drilldown', '--json'],
    });
    expect(runOplCommandMock).not.toHaveBeenCalledWith({ args: ['runtime', 'snapshot', '--json'] });
    expect(screen.getByText('Stage Attempt Workbench')).toBeInTheDocument();
    expect(screen.getByText('App Operator Drilldown')).toBeInTheDocument();
    expect(screen.getAllByText('Route Graph').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Decision Map').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Review Queue').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Artifacts').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Package / Export Lifecycle').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/package:submission-minimal/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/export:current-package/)).toBeInTheDocument();
    expect(screen.getByText(/gap:package-readiness/)).toBeInTheDocument();
    expect(screen.getByText(/handoff:manual-submission/)).toBeInTheDocument();
    expect(screen.getAllByText('Memory Refs').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('memory:publication-route-risk-model').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('memory-writeback:receipt-1')).toBeInTheDocument();
    expect(screen.getByText('publication_eval/latest.json')).toBeInTheDocument();
    expect(screen.getByText('controller_decisions/latest.json')).toBeInTheDocument();
    expect(screen.getByText(/provider_slo_cadence_execution/)).toBeInTheDocument();
    expect(screen.getByText(/domain_owner:med-autoscience/)).toBeInTheDocument();
    expect(screen.getByText(/Functional Privatization Audit/)).toBeInTheDocument();
    expect(screen.getByText(/Private Residue: 0; Watchlist: 0; Semantic Review: 0; Blockers: 0/)).toBeInTheDocument();
    expect(screen.getByText(/External Evidence/)).toBeInTheDocument();
    expect(screen.getByText(/External Requests: 7; Open Requests: 2; Verified Receipts: 5$/)).toBeInTheDocument();
    expect(screen.getByText(/Evidence Counters/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /External Requests: 7; Open Requests: 2; Verified Receipts: 5; Evidence Gates: 4; Remaining Gates: 1; Verified Gate Receipts: 3/
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/Evidence Gate Receipts/)).toBeInTheDocument();
    expect(screen.getByText(/^Evidence Gates: 4; Remaining Gates: 1; Verified Gate Receipts: 3$/)).toBeInTheDocument();
    expect(screen.getByText(/Legacy Cleanup/)).toBeInTheDocument();
    expect(screen.getByText(/Cleanup Plans: 3; Ready Plans: 3; Apply Ready: 2/)).toBeInTheDocument();
    expect(screen.getByText(/Provider Cadence Window/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Status: window_evidence_incomplete; Long Evidence Ready: false; Expected Receipts: 7; Observed Receipts: 0; Missing Receipts: 7; Blocked Repair Receipts: 0/
      )
    ).toBeInTheDocument();
    expect(screen.getByText('summary')).toBeInTheDocument();
    expect(screen.getByText('Target Brief')).toBeInTheDocument();
    expect(screen.getByText(/ref=oma:target-brief\/medautoscience-operator-loop/)).toBeInTheDocument();
    expect(screen.getByText(/status=blocked_pending_owner_receipt/)).toBeInTheDocument();
    expect(screen.getByText(/blocker=typed-blocker:oma\/target-brief-domain-owner/)).toBeInTheDocument();
    expect(screen.getByText(/receipt=receipt:oma\/target-brief-intake/)).toBeInTheDocument();
    expect(screen.getByText('Candidate Package')).toBeInTheDocument();
    expect(screen.getByText(/ref=package:oma\/candidate-standard-domain-agent/)).toBeInTheDocument();
    expect(screen.getByText(/blocker=blocker:oma\/candidate-package-owner-boundary/)).toBeInTheDocument();
    expect(screen.getByText('Agent Lab Results')).toBeInTheDocument();
    expect(screen.getByText(/ref=agent-lab-result:oma\/repair-route-suite/)).toBeInTheDocument();
    expect(screen.getByText(/status=blocked_from_auto_promotion/)).toBeInTheDocument();
    expect(screen.getByText('Developer Work Order')).toBeInTheDocument();
    expect(screen.getByText(/ref=work-order:oma\/app-render-lane-d/)).toBeInTheDocument();
    expect(screen.getByText('Mechanism Proposal')).toBeInTheDocument();
    expect(screen.getByText(/ref=mechanism-proposal:oma\/summary-first-app-drilldown/)).toBeInTheDocument();
    expect(screen.getByText('Scaleout Evidence')).toBeInTheDocument();
    expect(screen.getByText(/ref=scaleout-evidence:oma\/mas-mag-rca-owner-chain/)).toBeInTheDocument();
    const omaText = [
      'Target Brief',
      'Candidate Package',
      'Agent Lab Results',
      'Developer Work Order',
      'Mechanism Proposal',
      'Scaleout Evidence',
    ]
      .map((title) => screen.getByText(title).closest('section')?.textContent ?? '')
      .join(' ');
    expect(omaText).not.toMatch(/\bpromoted\b/i);
    expect(omaText).not.toMatch(/\bready\b/i);
    expect(omaText).not.toMatch(/quality verdict/i);
    expect(screen.getByText('Next Safe Action')).toBeInTheDocument();
    expect(
      screen.getAllByText(/stage-production-attempt:medautoscience:analysis-campaign/).length
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Safe Action Route')).toBeInTheDocument();
    expect(screen.getAllByText(/route_target_kind=opl_cli/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/submit_via=opl runtime action execute/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/can_execute_domain_action_directly=false/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Provider Health')).toBeInTheDocument();
    expect(screen.getByText(/health_status=attention_required/)).toBeInTheDocument();
    expect(screen.getByText('Missing Evidence')).toBeInTheDocument();
    expect(screen.getByText(/evidence:soak-window/)).toBeInTheDocument();
    expect(screen.getByText('Blocking')).toBeInTheDocument();
    expect(screen.getByText(/blocker:publication-readiness/)).toBeInTheDocument();
    expect(screen.getByText('Advisory')).toBeInTheDocument();
    expect(screen.getByText(/tail:production-evidence/)).toBeInTheDocument();
    expect(screen.getAllByText('Safe Actions').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/role=safe_action/)).toBeInTheDocument();
    expect(
      screen.getByText(
        'Refs-only view. OPL does not own domain truth, memory body, artifact body, quality readiness, or export verdict. truth_memory_artifact_quality_export_owner'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('medautoscience / analysis-campaign / temporal')).toBeInTheDocument();
    expect(screen.getAllByText('Provider Completion').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('domain_gate_pending').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Consumed References')).toBeInTheDocument();
    expect(screen.getAllByText('memory:publication-route-risk-model').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Rejected Writes').length).toBeGreaterThanOrEqual(1);
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

    fireEvent.click(screen.getByText('Dry Run'));
    await waitFor(() => {
      expect(runOplCommandMock).toHaveBeenCalledWith({
        args: [
          'runtime',
          'action',
          'execute',
          '--action',
          'stage-production-attempt:medautoscience:analysis-campaign',
          '--dry-run',
        ],
      });
    });
    expect(await screen.findByText('Dry-run Result')).toBeInTheDocument();
    expect(screen.getByText(/execution_status=dry_run/)).toBeInTheDocument();
    expect(screen.getAllByText(/can_write_domain_truth=false/).length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByText('Execute'));
    await waitFor(() => {
      expect(runOplCommandMock).toHaveBeenCalledWith({
        args: ['runtime', 'action', 'execute', '--action', 'stage-production-attempt:medautoscience:analysis-campaign'],
      });
    });
    await waitFor(() => {
      expect(runOplCommandMock).toHaveBeenCalledWith({
        args: ['runtime', 'app-operator-drilldown', '--json'],
      });
    });
    await waitFor(() => {
      expect(vi.mocked(Message.success)).toHaveBeenCalledWith('Action completed.');
    });
    expect(await screen.findByText('Execute Result')).toBeInTheDocument();
    expect(screen.getByText(/execution_status=executed/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Load Full Detail'));
    await waitFor(() => {
      expect(runOplCommandMock).toHaveBeenCalledWith({
        args: ['runtime', 'app-operator-drilldown', '--json', '--detail', 'full'],
      });
    });
    await waitFor(() => {
      expect(vi.mocked(Message.success)).toHaveBeenCalledWith('Full App drilldown loaded.');
    });
    expect(await screen.findByText(/sat_full/)).toBeInTheDocument();
    expect(screen.getByText('full')).toBeInTheDocument();
  });

  it('triggers stage attempt human gate, resume, and dead-letter repair through the signal bridge', async () => {
    runOplCommandMock.mockResolvedValue({
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify({
        runtime_tray_snapshot: {
          schema_version: 'runtime_tray_snapshot.v1',
          runtime_health: {
            status: 'needs_attention',
            label: 'Needs attention',
            summary: 'Stage attempts need operator review',
          },
          last_updated: '2026-05-11T10:00:00.000Z',
          stage_attempt_workbench: {
            surface_kind: 'opl_stage_attempt_workbench',
            availability: 'available',
            provider_completion_is_domain_ready: false,
            summary: {
              total: 3,
              human_gate_count: 1,
              dead_letter_count: 1,
            },
            attempts: [
              {
                stage_attempt_id: 'sat_running',
                provider_kind: 'temporal',
                domain_id: 'medautoscience',
                stage_id: 'analysis-campaign',
                local_status: 'running',
                completion_boundary: {
                  provider_completion: 'not_completed',
                  domain_ready_verdict: 'domain_gate_pending',
                  provider_completion_is_domain_ready: false,
                },
              },
              {
                stage_attempt_id: 'sat_human_gate',
                provider_kind: 'temporal',
                domain_id: 'medautogrant',
                stage_id: 'critique',
                local_status: 'human_gate',
                human_gate_refs: ['gate:operator-review'],
                resume_refs: ['resume:after-human-review'],
                completion_boundary: {
                  provider_completion: 'not_completed',
                  domain_ready_verdict: null,
                  provider_completion_is_domain_ready: false,
                },
              },
              {
                stage_attempt_id: 'sat_dead_letter',
                provider_kind: 'temporal',
                domain_id: 'redcube',
                stage_id: 'visual-review',
                local_status: 'dead_lettered',
                dead_letter: 'retry_budget_exhausted',
                completion_boundary: {
                  provider_completion: 'not_completed',
                  domain_ready_verdict: 'not_ready',
                  provider_completion_is_domain_ready: false,
                },
              },
            ],
          },
          running_items: [],
          attention_items: [],
          recent_items: [],
          action_counts: { user: 0, opl: 0, infrastructure: 0 },
          source_refs: [],
        },
      }),
    });

    render(
      <MemoryRouter initialEntries={['/runtime']}>
        <RuntimeTrayItemPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('medautoscience / analysis-campaign / temporal')).toBeInTheDocument();
    expect(screen.getAllByText('Provider Completion').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Domain Ready Verdict').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('domain_gate_pending').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('present').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('clear').length).toBeGreaterThanOrEqual(1);

    screen.getByText('Request Human Gate').click();
    await waitFor(() => {
      expect(runOplCommandMock).toHaveBeenCalledWith({
        args: [
          'family-runtime',
          'attempt',
          'signal',
          'sat_running',
          '--kind',
          'human_gate',
          '--payload',
          '{"human_gate_ref":"opl-aion-shell:human_gate:sat_running","reason":"operator_human_gate_requested"}',
          '--source',
          'opl-aion-shell',
        ],
      });
    });

    screen.getByText('Resume Attempt').click();
    await waitFor(() => {
      expect(runOplCommandMock).toHaveBeenCalledWith({
        args: [
          'family-runtime',
          'attempt',
          'signal',
          'sat_human_gate',
          '--kind',
          'resume',
          '--payload',
          '{"reason":"operator_resume_requested"}',
          '--source',
          'opl-aion-shell',
        ],
      });
    });

    screen.getByText('Request Dead-letter Repair').click();
    await waitFor(() => {
      expect(runOplCommandMock).toHaveBeenCalledWith({
        args: [
          'family-runtime',
          'attempt',
          'signal',
          'sat_dead_letter',
          '--kind',
          'user_instruction',
          '--payload',
          '{"instruction_kind":"dead_letter_repair","reason":"operator_dead_letter_repair_requested"}',
          '--source',
          'opl-aion-shell',
        ],
      });
    });

    expect(vi.mocked(Message.success)).toHaveBeenCalledWith('Stage attempt signal sent.');
  });

  it('disables App safe actions that are not explicitly routed through the OPL CLI shell', async () => {
    runOplCommandMock.mockResolvedValue({
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify({
        runtime_tray_snapshot: {
          schema_version: 'runtime_tray_snapshot.v1',
          runtime_health: {
            status: 'needs_attention',
            label: 'Needs attention',
            summary: 'Unsafe route blocked',
          },
          last_updated: '2026-05-11T10:00:00.000Z',
          app_operator_drilldown: {
            surface_kind: 'opl_app_operator_drilldown_read_model',
            availability: 'available',
            detail_level: 'summary',
            summary: {
              safe_action_ref_count: 1,
              operator_executable_route_count: 1,
            },
            attention_first_payload: {
              next_safe_action: {
                action_id: 'domain-direct:medautoscience:unsafe-apply',
                action_kind: 'domain_apply',
                owner: 'domain',
                route_target_kind: 'domain_action',
                submit_via: 'domain runtime',
                can_submit_to_safe_action_shell: false,
                can_execute_domain_action_directly: true,
                approve_domain_action_supported: true,
              },
            },
          },
          running_items: [],
          attention_items: [],
          recent_items: [],
          action_counts: { user: 0, opl: 0, infrastructure: 0 },
          source_refs: [],
        },
      }),
    });

    render(
      <MemoryRouter initialEntries={['/runtime']}>
        <RuntimeTrayItemPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('App Operator Drilldown')).toBeInTheDocument();
    expect(screen.getByText('Safe Action Route')).toBeInTheDocument();
    expect(screen.getAllByText(/route_target_kind=domain_action/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/can_execute_domain_action_directly=true/).length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText(
        'Safe action is disabled because this projection does not route through the OPL CLI safe-action shell.'
      )
    ).toBeInTheDocument();

    const executeButton = screen.getByText('Execute').closest('button');
    expect(executeButton).toBeDisabled();
    expect(runOplCommandMock).toHaveBeenCalledTimes(1);
  });

  it('filters stage attempts, drills into one attempt, and keeps operation feedback visible', async () => {
    runOplCommandMock
      .mockResolvedValueOnce({
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
          runtime_tray_snapshot: {
            schema_version: 'runtime_tray_snapshot.v1',
            runtime_health: {
              status: 'needs_attention',
              label: 'Needs attention',
              summary: 'Stage attempts need operator review',
            },
            last_updated: '2026-05-11T10:00:00.000Z',
            stage_attempt_workbench: {
              surface_kind: 'opl_stage_attempt_workbench',
              availability: 'available',
              summary: {
                total: 3,
                human_gate_count: 1,
                dead_letter_count: 1,
              },
              attempts: [
                {
                  stage_attempt_id: 'sat_running',
                  provider_kind: 'temporal',
                  domain_id: 'medautoscience',
                  stage_id: 'analysis-campaign',
                  local_status: 'running',
                  completion_boundary: {
                    provider_completion: 'not_completed',
                    domain_ready_verdict: 'domain_gate_pending',
                  },
                },
                {
                  stage_attempt_id: 'sat_human_gate',
                  provider_kind: 'temporal',
                  domain_id: 'medautogrant',
                  stage_id: 'critique',
                  local_status: 'human_gate',
                  human_gate_refs: ['gate:operator-review'],
                  resume_refs: ['resume:after-human-review'],
                },
                {
                  stage_attempt_id: 'sat_dead_letter',
                  provider_kind: 'temporal',
                  domain_id: 'redcube',
                  stage_id: 'visual-review',
                  local_status: 'dead_lettered',
                  dead_letter: 'retry_budget_exhausted',
                },
              ],
            },
            running_items: [],
            attention_items: [],
            recent_items: [],
            action_counts: { user: 0, opl: 0, infrastructure: 0 },
            source_refs: [],
          },
        }),
      })
      .mockResolvedValueOnce({ exitCode: 0, stderr: '', stdout: '{"ok":true}' });

    render(
      <MemoryRouter initialEntries={['/runtime']}>
        <RuntimeTrayItemPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('medautoscience / analysis-campaign / temporal')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Human Gate' }));

    await waitFor(() => {
      expect(screen.queryByText('medautoscience / analysis-campaign / temporal')).not.toBeInTheDocument();
    });
    expect(screen.getByText('medautogrant / critique / temporal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show Details' }));
    expect(screen.getByText('Selected Attempt')).toBeInTheDocument();
    expect(screen.getByText('sat_human_gate')).toBeInTheDocument();
    expect(screen.getAllByText('gate:operator-review').length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByText('Resume Attempt'));
    expect(await screen.findByText('Signal queued for sat_human_gate.')).toBeInTheDocument();
  });

  it('ignores malformed or non-OPL attempt workbench records in the renderer', async () => {
    runOplCommandMock.mockResolvedValue({
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify({
        runtime_tray_snapshot: {
          schema_version: 'runtime_tray_snapshot.v1',
          runtime_health: {
            status: 'running',
            label: 'Running',
            summary: 'Runtime is available',
          },
          last_updated: '2026-05-11T10:00:00.000Z',
          stage_attempt_workbench: {
            surface_kind: 'family_runtime_internal_workbench',
            availability: 'available',
            attempts: [
              {
                stage_attempt_id: 'sat_internal',
                domain_id: 'internal',
                stage_id: 'fan-out',
                local_status: 'running',
              },
            ],
          },
          running_items: [],
          attention_items: [],
          recent_items: [],
          source_refs: [],
        },
      }),
    });

    render(
      <MemoryRouter initialEntries={['/runtime']}>
        <RuntimeTrayItemPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('OPL Runtime Status')).toBeInTheDocument();
    expect(screen.queryByText('Stage Attempt Workbench')).not.toBeInTheDocument();
    expect(screen.queryByText('internal / fan-out')).not.toBeInTheDocument();
  });
});
