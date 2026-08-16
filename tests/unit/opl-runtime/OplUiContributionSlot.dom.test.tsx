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

function contribution(input: { confirmationRequired?: boolean; kind?: string; slot?: string; viewType?: string } = {}) {
  return {
    contribution_key: 'example.package:activity',
    contribution_id: 'activity',
    package_id: 'example.package',
    slot: input.slot ?? 'runtime.detail',
    contribution_kind: input.kind ?? 'view',
    trust_tier: 'declarative',
    scope: 'root',
    sort_order: 10,
    view: {
      view_id: 'activity',
      view_type: input.viewType ?? 'activity_log',
      title_i18n: { 'en-US': 'Package activity' },
      data_ref: 'example.activity.v1#current',
    },
    commands: [
      {
        command_id: 'refresh',
        label_i18n: { 'en-US': 'Refresh activity' },
        action_ref: 'example.activity.v1#refresh',
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

function channelAccessReadResult(
  input: {
    state?: 'disconnected' | 'connecting' | 'qr_ready' | 'qr_scanned' | 'connected' | 'attention';
    expiresAtMs?: number;
  } = {}
) {
  return {
    surface: 'package_contribution_read',
    ok: true,
    parsed: {
      opl_app_contribution: {
        surface_kind: 'opl_app_package_contribution.v1',
        package_id: 'example.package',
        ref: 'example.activity.v1#current',
        operation: 'read',
        confirmation_required: false,
        carrier_readback: {
          kind: 'local',
          identity: 'example.package@local',
          lifecycle_authority: 'carrier_owned',
        },
        readiness: {
          installed: true,
          physical_status: 'available',
          callability: 'callable',
        },
        response: {
          schema_version: 'opl-package-app-contribution-response.v1',
          ok: true,
          ref: 'example.activity.v1#current',
          operation: 'read',
          result: {
            schema_version: 'opl-app-channel-access.v1',
            status: 'available',
            channel_id: 'example',
            connection: {
              state: input.state ?? 'qr_ready',
              qr_challenge: {
                payload: 'ephemeral-qr-payload',
                expires_at_ms: input.expiresAtMs ?? Date.now() + 60_000,
              },
            },
            actions: [],
            pending_pairings: [],
            authorized_users: [
              {
                user_id: 'user-1',
                display_name: 'Channel user',
                authorized_at_ms: 1,
                actions: [
                  {
                    command_id: 'refresh',
                    input: { channel_id: 'example', user_id: 'user-1' },
                  },
                ],
              },
            ],
          },
        },
      },
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

  it('renders channel_access data and dispatches the exact validated entity input', async () => {
    stateMocks.appState = appState([contribution({ slot: 'settings.section', viewType: 'channel_access' })]);
    stateMocks.runPackageContribution.mockResolvedValue(channelAccessReadResult());

    render(<OplUiContributionSlot slot='settings.section' />);
    expect(await screen.findByText('Channel user')).toBeInTheDocument();
    expect(screen.getByLabelText('common.oplUiContributions.channelAccess.qrCode')).toBeInTheDocument();
    expect(stateMocks.runPackageContribution).toHaveBeenCalledWith({
      packageId: 'example.package',
      ref: 'example.activity.v1#current',
      operation: 'read',
      input: {},
    });

    fireEvent.click(screen.getByRole('button', { name: 'Refresh activity' }));
    await waitFor(() => {
      expect(stateMocks.executeAction).toHaveBeenCalledWith({
        actionId: 'package_contribution_execute',
        payloadJson: {
          package_id: 'example.package',
          ref: 'example.activity.v1#refresh',
          input: { channel_id: 'example', user_id: 'user-1' },
          confirmed: false,
        },
        dryRun: false,
      });
    });
    await waitFor(() => expect(stateMocks.runPackageContribution).toHaveBeenCalledTimes(2));
  });

  it.each([
    ['the connection is not qr_ready', 'connected' as const, Date.now() + 60_000],
    ['the challenge is expired', 'qr_ready' as const, Date.now() - 1],
  ])('hides the channel QR when %s', async (_description, state, expiresAtMs) => {
    stateMocks.appState = appState([contribution({ slot: 'settings.section', viewType: 'channel_access' })]);
    stateMocks.runPackageContribution.mockResolvedValue(channelAccessReadResult({ state, expiresAtMs }));

    render(<OplUiContributionSlot slot='settings.section' />);
    expect(await screen.findByText('Channel user')).toBeInTheDocument();
    expect(screen.queryByTestId('opl-channel-access-qr')).not.toBeInTheDocument();
  });

  it('removes the channel QR when the challenge expires without a projection refresh', async () => {
    stateMocks.appState = appState([contribution({ slot: 'settings.section', viewType: 'channel_access' })]);
    stateMocks.runPackageContribution.mockResolvedValue(channelAccessReadResult({ expiresAtMs: Date.now() + 200 }));

    render(<OplUiContributionSlot slot='settings.section' />);
    expect(await screen.findByTestId('opl-channel-access-qr')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('opl-channel-access-qr')).not.toBeInTheDocument(), {
      timeout: 1_000,
    });
    expect(stateMocks.runPackageContribution).toHaveBeenCalledTimes(1);
  });
});
