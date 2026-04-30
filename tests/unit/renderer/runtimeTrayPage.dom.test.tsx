import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
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
  'common.historyBack': 'Back',
  'common.open': 'Open',
  'common.runtimeTray.activeRun': 'Active Run',
  'common.runtimeTray.attentionReason': 'Why this needs attention',
  'common.runtimeTray.attentionReasonChecks':
    'This task still has {{count}} quality or delivery check(s) open. OPL should continue along the current paper line.',
  'common.runtimeTray.currentSituation': 'Current situation',
  'common.runtimeTray.developerDetails': 'Developer Details',
  'common.runtimeTray.health': 'Health',
  'common.runtimeTray.monitoringUrl': 'Monitoring URL',
  'common.runtimeTray.noSourceRefs': 'No source references',
  'common.runtimeTray.openWorkspace': 'Open Workspace',
  'common.runtimeTray.physicianView': 'Status for doctors/PIs',
  'common.runtimeTray.project': 'Project',
  'common.runtimeTray.sourceRef': 'Source {{index}}',
  'common.runtimeTray.sourceRefs': 'Source References',
  'common.runtimeTray.study': 'Study',
  'common.runtimeTray.tellOpl': 'Tell OPL',
  'common.runtimeTray.tellOplNextAction': 'Continue {{title}}, prioritizing: {{nextAction}}',
  'common.runtimeTray.updatedAt': 'Updated',
  'common.status': 'Status',
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

describe('RuntimeTrayItemPage', () => {
  it('shows physician-facing guidance instead of command suggestions', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/runtime/item', state: { runtimeItem } }]}>
        <RuntimeTrayItemPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Status for doctors/PIs')).toBeInTheDocument();
    expect(screen.getByText('Current situation')).toBeInTheDocument();
    expect(screen.getByText('Why this needs attention')).toBeInTheDocument();
    expect(screen.getByText('Tell OPL')).toBeInTheDocument();
    expect(
      screen.getByText('Continue 002-dm-china-us-mortality-attribution, prioritizing: 补充分析与稳健性验证')
    ).toBeInTheDocument();
    expect(screen.getByText('Developer Details')).toBeInTheDocument();
    expect(screen.queryByText('Recommended Commands')).not.toBeInTheDocument();
    expect(screen.queryByText('medautosci study-progress --study-id 002')).not.toBeInTheDocument();
  });
});
