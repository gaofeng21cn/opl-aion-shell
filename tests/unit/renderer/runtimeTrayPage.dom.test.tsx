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
  'common.runtimeTray.attentionReasonChecks':
    'This task has {{count}} open quality or delivery check(s).',
  'common.runtimeTray.attentionReasonDefault':
    'Runtime state requires review against the current project projection.',
  'common.runtimeTray.actionSummaryDefault': 'Runtime projection loaded; awaiting the next status update.',
  'common.runtimeTray.attentionReasonInfra':
    'Background supervision item; no user action is required unless the condition persists.',
  'common.runtimeTray.attentionReasonRecovering':
    'Runtime recovery is in progress; continuity on the same paper line must be confirmed after recovery.',
  'common.runtimeTray.attentionReasonReview':
    'Review or delivery handoff is pending; user confirmation is required.',
  'common.runtimeTray.currentSituation': 'Current Status',
  'common.runtimeTray.developerDetails': 'Developer Details',
  'common.runtimeTray.health': 'Health',
  'common.runtimeTray.infrastructureProblem': 'Background Supervision Status',
  'common.runtimeTray.infrastructureRecovery': 'Recovery Action',
  'common.runtimeTray.monitoringUrl': 'Monitoring URL',
  'common.runtimeTray.noRuntimeItems': 'No runtime items',
  'common.runtimeTray.noSourceRefs': 'No source references',
  'common.runtimeTray.openWorkspace': 'Open Workspace',
  'common.runtimeTray.operatorView': 'Operator View',
  'common.runtimeTray.oplHandling': 'Current Processing',
  'common.runtimeTray.physicianView': 'Status Summary',
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
              detail_summary: '系统已检测到运行掉线，正在自动尝试恢复。',
              next_action_summary: '补充分析与稳健性验证',
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
