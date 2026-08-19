import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OplUiContributionSlot from '@/renderer/components/opl/OplUiContributionSlot';
import {
  getOplClientCordisComposition,
  resetOplClientCordisCompositionForTest,
} from '@/renderer/services/oplClientCordis';

const stateMocks = vi.hoisted(() => ({
  appState: {} as Record<string, unknown>,
  load: vi.fn(),
  executeAction: vi.fn(),
  runPackageContribution: vi.fn(),
  modalConfirm: vi.fn(),
  messageSuccess: vi.fn(),
  messageError: vi.fn(),
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  useOplAppState: () => ({ appState: stateMocks.appState, load: stateMocks.load }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      executeAction: { invoke: stateMocks.executeAction },
      runPackageContribution: { invoke: stateMocks.runPackageContribution },
    },
  },
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      ...actual.Message,
      useMessage: () => [{ success: stateMocks.messageSuccess, error: stateMocks.messageError }, null],
    },
    Modal: { ...actual.Modal, confirm: stateMocks.modalConfirm },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => (values ? `${key}:${Object.values(values).join(':')}` : key),
    i18n: { language: 'en-US', resolvedLanguage: 'en-US' },
  }),
}));

function contribution(
  input: {
    actionBoundary?: string;
    confirmationRequired?: boolean;
    commandId?: string;
    actionRef?: string;
    kind?: string;
    slot?: string;
    viewType?: string;
  } = {}
) {
  return {
    contribution_key: 'example.package:activity',
    contribution_id: 'activity',
    package_id: 'example.package',
    slot: input.slot ?? 'runtime.detail',
    contribution_kind: input.kind ?? 'view',
    trust_tier: 'declarative',
    scope: 'root',
    sort_order: 10,
    ...(input.actionBoundary ? { action_boundary: input.actionBoundary } : {}),
    view: {
      view_id: 'activity',
      view_type: input.viewType ?? 'activity_log',
      title_i18n: { 'en-US': 'Package activity' },
      data_ref: 'example.activity.v1#current',
    },
    commands: [
      {
        command_id: input.commandId ?? 'refresh',
        label_i18n: { 'en-US': 'Refresh activity' },
        action_ref: input.actionRef ?? 'example.activity.v1#refresh',
        confirmation_required: input.confirmationRequired ?? false,
      },
    ],
    badges: [
      {
        badge_id: 'health',
        label_i18n: { 'en-US': 'Healthy' },
        data_ref: 'example.activity.v1#health',
        tone: 'success',
      },
    ],
  };
}

function appState(entries: unknown[], actionAvailable = true) {
  return {
    actions: actionAvailable ? [{ action_id: 'package_contribution_execute' }] : [],
    ui_contributions: {
      surface_kind: 'opl_app_ui_contributions_projection.v1',
      entries,
    },
  };
}

describe('OplUiContributionSlot', () => {
  beforeEach(async () => {
    await resetOplClientCordisCompositionForTest();
    vi.clearAllMocks();
    stateMocks.appState = appState([contribution()]);
    stateMocks.executeAction.mockResolvedValue({ ok: true });
    stateMocks.runPackageContribution.mockReset();
    stateMocks.load.mockResolvedValue({ app_state: stateMocks.appState });
  });

  afterEach(async () => {
    await resetOplClientCordisCompositionForTest();
  });

  it('executes through the canonical App action with exact payload and forces authoritative readback', async () => {
    const composition = await getOplClientCordisComposition();
    const projectionUpdates = vi.fn();
    const unsubscribe = composition.contributions.subscribe(projectionUpdates);
    render(<OplUiContributionSlot slot='runtime.detail' />);

    fireEvent.click(await screen.findByRole('button', { name: 'Refresh activity' }));

    await waitFor(() => {
      expect(projectionUpdates).toHaveBeenCalledWith(
        expect.objectContaining({
          surfaceKind: 'opl_app_ui_contributions_projection.v1',
          entries: [expect.objectContaining({ contributionKey: 'example.package:activity' })],
        })
      );
    });

    await waitFor(() => {
      expect(stateMocks.executeAction).toHaveBeenCalledWith({
        actionId: 'package_contribution_execute',
        payloadJson: {
          package_id: 'example.package',
          ref: 'example.activity.v1#refresh',
          input: {},
          confirmed: false,
        },
        dryRun: false,
      });
    });
    expect(stateMocks.load).toHaveBeenCalledWith('fast', { forceFresh: true });
    expect(stateMocks.messageSuccess).toHaveBeenCalledWith('common.oplUiContributions.executeSuccess');
    unsubscribe();
  });

  it('uses the existing confirmation surface for descriptor-confirmed commands', async () => {
    stateMocks.appState = appState([contribution({ confirmationRequired: true })]);
    render(<OplUiContributionSlot slot='runtime.detail' />);

    fireEvent.click(await screen.findByRole('button', { name: 'Refresh activity' }));
    expect(stateMocks.executeAction).not.toHaveBeenCalled();
    expect(stateMocks.modalConfirm).toHaveBeenCalledOnce();

    const confirmation = stateMocks.modalConfirm.mock.calls[0]?.[0] as { onOk: () => Promise<void> };
    await act(async () => confirmation.onOk());
    expect(stateMocks.executeAction).toHaveBeenCalledWith(
      expect.objectContaining({ payloadJson: expect.objectContaining({ confirmed: true }) })
    );
  });

  it('keeps read-only contributions visible while the exact action is unavailable', async () => {
    stateMocks.appState = appState([contribution()], false);
    render(<OplUiContributionSlot slot='runtime.detail' />);

    expect(await screen.findByText('Package activity')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh activity' })).toBeDisabled();
  });

  it('renders an unknown kind as a local fallback without hiding valid entries', async () => {
    const future = {
      ...contribution({ kind: 'future_kind' }),
      contribution_key: 'example.package:future',
      contribution_id: 'future',
    };
    stateMocks.appState = appState([future, contribution()]);
    render(<OplUiContributionSlot slot='runtime.detail' />);

    expect(await screen.findByText('common.oplUiContributions.unsupportedKind:future_kind')).toBeInTheDocument();
    expect(screen.getByTestId('opl-ui-contribution-example.package:activity')).toHaveTextContent('Package activity');
  });

  it('unmounts a contribution when it disappears from the current projection', async () => {
    const view = render(<OplUiContributionSlot slot='runtime.detail' />);
    expect(await screen.findByTestId('opl-ui-contribution-example.package:activity')).toBeInTheDocument();

    stateMocks.appState = appState([]);
    view.rerender(<OplUiContributionSlot slot='runtime.detail' />);

    await waitFor(() => {
      expect(screen.queryByTestId('opl-ui-contribution-example.package:activity')).not.toBeInTheDocument();
    });
  });

  it('does not admit Framework channel_access contributions in AionUI', async () => {
    stateMocks.appState = appState(
      [
        contribution({
          actionBoundary: 'opl.connect.channel-provider-host',
          slot: 'settings.section',
          viewType: 'channel_access',
        }),
      ],
      false
    );

    render(<OplUiContributionSlot slot='settings.section' />);
    await waitFor(() => {
      expect(screen.queryByTestId('opl-ui-contribution-slot-settings.section')).not.toBeInTheDocument();
    });
    expect(stateMocks.runPackageContribution).not.toHaveBeenCalled();
    expect(stateMocks.executeAction).not.toHaveBeenCalled();
  });

  it('admits remote_companion_access only through its activation boundary and keeps pairing material transient', async () => {
    localStorage.clear();
    stateMocks.appState = appState([
      contribution({
        actionBoundary: 'opl.connect.remote-companion-connector-host',
        commandId: 'pair.confirm',
        actionRef: 'example.activity.v1#pair-confirm',
        slot: 'settings.section',
        viewType: 'remote_companion_access',
      }),
      {
        ...contribution({ slot: 'settings.section', viewType: 'remote_companion_access' }),
        contribution_key: 'example.package:unadmitted-remote',
        contribution_id: 'unadmitted-remote',
      },
    ]);
    stateMocks.runPackageContribution.mockResolvedValue({
      surface: 'package_contribution_read',
      ok: true,
      parsed: {
        opl_app_contribution: {
          surface_kind: 'opl_app_package_contribution.v1',
          package_id: 'example.package',
          ref: 'example.activity.v1#current',
          operation: 'read',
          confirmation_required: false,
          carrier_readback: { kind: 'local', identity: 'connector@local', lifecycle_authority: 'carrier_owned' },
          readiness: { installed: true, physical_status: 'available', callability: 'callable' },
          response: {
            schema_version: 'opl-package-app-contribution-response.v1',
            ok: true,
            ref: 'example.activity.v1#current',
            operation: 'read',
            result: {
              schema_version: 'opl-app-remote-companion-access.v1',
              status: 'awaiting_confirmation',
              pairing: {
                pairing_id: 'pair-001',
                expires_at: '2026-08-19T01:00:00.000Z',
                authentication_digits: '123456',
              },
              actions: [
                {
                  command_id: 'pair.confirm',
                  input: { pairing_id: 'pair-001', authentication_digits: '123456' },
                },
              ],
            },
          },
        },
      },
    });

    render(<OplUiContributionSlot slot='settings.section' />);
    expect(await screen.findByTestId('opl-remote-companion-access-confirmation')).toBeInTheDocument();
    expect(screen.getByText('123 456')).toBeInTheDocument();
    expect(screen.queryByTestId('opl-ui-contribution-example.package:unadmitted-remote')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh activity' }));
    await waitFor(() => {
      expect(stateMocks.executeAction).toHaveBeenCalledWith(
        expect.objectContaining({
          payloadJson: expect.objectContaining({
            ref: 'example.activity.v1#pair-confirm',
            input: { pairing_id: 'pair-001', authentication_digits: '123456' },
          }),
        })
      );
    });
    expect(localStorage.length).toBe(0);
  });
});
