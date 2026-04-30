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
  'common.runtimeTray.attentionReason': 'Why this needs attention',
  'common.runtimeTray.attentionReasonChecks':
    'This task still has {{count}} quality or delivery check(s) open. OPL should continue along the current paper line.',
  'common.runtimeTray.attentionReasonDefault':
    'This task needs OPL to re-check the current runtime state and decide whether to continue, recover, or wait for your confirmation.',
  'common.runtimeTray.actionSummaryDefault':
    'OPL is reading the runtime projection and will continue through the current project state.',
  'common.runtimeTray.attentionReasonInfra':
    'This is a background supervision job. You usually do not need to handle it directly; if it keeps failing, ask OPL to check and restore supervision.',
  'common.runtimeTray.attentionReasonRecovering':
    'The system detected a dropped run and is recovering it automatically. Watch whether it continues on the same paper line after recovery.',
  'common.runtimeTray.attentionReasonReview':
    'This paper line is at a human review or delivery handoff point. It needs your review, a submission decision, or new revision notes.',
  'common.runtimeTray.currentSituation': 'Current situation',
  'common.runtimeTray.developerDetails': 'Developer Details',
  'common.runtimeTray.health': 'Health',
  'common.runtimeTray.infrastructureProblem': 'What happened to background supervision',
  'common.runtimeTray.infrastructureRecovery': 'What the system needs to recover',
  'common.runtimeTray.monitoringUrl': 'Monitoring URL',
  'common.runtimeTray.noRuntimeItems': 'No runtime items',
  'common.runtimeTray.noSourceRefs': 'No source references',
  'common.runtimeTray.openWorkspace': 'Open Workspace',
  'common.runtimeTray.operatorView': 'Operator View',
  'common.runtimeTray.oplHandling': 'What OPL is handling',
  'common.runtimeTray.physicianView': 'Status for doctors/PIs',
  'common.runtimeTray.primaryCommand': 'Primary Command',
  'common.runtimeTray.project': 'Project',
  'common.runtimeTray.runtimeStatusTitle': 'OPL Runtime Status',
  'common.runtimeTray.sourceRef': 'Source {{index}}',
  'common.runtimeTray.sourceRefs': 'Source References',
  'common.runtimeTray.study': 'Study',
  'common.runtimeTray.summaryByOwner':
    '{{running}} running, {{opl}} OPL handling, {{infrastructure}} background recovery, {{user}} needs you',
  'common.runtimeTray.tellOpl': 'Tell OPL',
  'common.runtimeTray.tellOplCheck':
    'Check the current state of {{title}} and tell me whether I need to review, confirm, or provide new materials.',
  'common.runtimeTray.tellOplInfra':
    'Check whether the background supervision job for {{title}} is healthy; if not, restore supervision.',
  'common.runtimeTray.tellOplNextAction': 'Continue {{title}}, prioritizing: {{nextAction}}',
  'common.runtimeTray.tellOplRecovering':
    'Check whether {{title}} has recovered; after recovery, continue the current paper-line revision package.',
  'common.runtimeTray.tellOplReview':
    'I have reviewed the submission or human-review package for {{title}}. Continue along the same paper line; I will send revision notes if needed.',
  'common.runtimeTray.updatedAt': 'Updated',
  'common.runtimeTray.userActionRequired': 'What you need to do',
  'common.runtimeTray.whyNotDone': 'Why it is not finished',
  'common.status': 'Status',
  'common.tray.runtimeAttention': 'Needs attention',
  'common.tray.runtimeInfrastructure': 'Background Recovery',
  'common.tray.runtimeOplAction': 'OPL Is Handling',
  'common.tray.runtimeRecent': 'Recent items',
  'common.tray.runtimeRunning': 'Running items',
  'common.tray.runtimeStatusIdle': 'Idle',
  'common.tray.runtimeStatusNeedsAttention': 'Needs Attention',
  'common.tray.runtimeStatusOffline': 'Offline',
  'common.tray.runtimeStatusRunning': 'Running',
  'common.tray.runtimeUserAction': 'Needs You',
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
  actionSummary: 'OPL/MAS is closing publication and quality gates while the active run continues.',
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
  it('shows physician-facing guidance instead of command suggestions', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/runtime/item', state: { runtimeItem } }]}>
        <RuntimeTrayItemPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Status for doctors/PIs')).toBeInTheDocument();
    expect(screen.getByText('What OPL is handling')).toBeInTheDocument();
    expect(
      screen.getByText('OPL/MAS is closing publication and quality gates while the active run continues.')
    ).toBeInTheDocument();
    expect(screen.getByText('Why it is not finished')).toBeInTheDocument();
    expect(screen.queryByText('Tell OPL')).not.toBeInTheDocument();
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
            status: 'needs_attention',
            label: 'Needs attention',
            summary: '1 running, 1 OPL handling.',
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
              action_summary: 'OPL/MAS is closing publication and quality gates while the active run continues.',
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

    expect(await screen.findByText('OPL Is Handling')).toBeInTheDocument();
    expect(screen.getByText('What OPL is handling')).toBeInTheDocument();
    expect(
      screen.getByText('OPL/MAS is closing publication and quality gates while the active run continues.')
    ).toBeInTheDocument();
    expect(screen.getByText('Why it is not finished')).toBeInTheDocument();
    expect(
      screen.getByText(
        'The system detected a dropped run and is recovering it automatically. Watch whether it continues on the same paper line after recovery.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('Tell OPL')).not.toBeInTheDocument();
    expect(screen.getByText('0 running, 1 OPL handling, 0 background recovery, 0 needs you')).toBeInTheDocument();
    expect(screen.queryByText(/Recommended route-back/)).not.toBeInTheDocument();
    expect(screen.queryByText(/return_to_analysis_campaign/)).not.toBeInTheDocument();
    expect(screen.queryByText('medautosci study-progress --study-id 002')).not.toBeInTheDocument();
  });
});
