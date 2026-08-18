import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import RemoteCompanionSettings from '@/renderer/pages/settings/sections/RemoteCompanionSettings';
import type { RemoteCompanionState } from '@/common/types/remoteCompanion';

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  startPairing: vi.fn(),
  pollPairing: vi.fn(),
  confirmPairing: vi.fn(),
  revokePairing: vi.fn(),
  refreshPair: vi.fn(),
  stateChangedOn: vi.fn(() => () => undefined),
  copyText: vi.fn(),
}));

const initialState = (): RemoteCompanionState => ({
  schema: 'opl_remote_companion_desktop_state.v1',
  configured: true,
  provider: 'tencent_cloud_im',
  max_active_pairs: 3,
  pairs: [],
  pairing: null,
  unavailable_reason: null,
});

const pendingState = (authenticationString: string | null = null): RemoteCompanionState => ({
  ...initialState(),
  pairing: {
    pair_id: 'pair-test-001',
    desktop_label: 'This desktop',
    state: authenticationString ? 'awaiting_desktop_confirmation' : 'reserved',
    manual_code: '01ABCDEFGHJK',
    qr_url: authenticationString ? '' : 'opllink://pair?protocol_version=opl_remote_transport.v1',
    authentication_string: authenticationString,
    expires_at: '2026-08-17T13:00:00.000Z',
  },
});

const activeState = (): RemoteCompanionState => ({
  ...initialState(),
  pairs: [
    {
      pair_id: 'pair-test-001',
      desktop_device_id: 'desktop-test-device',
      desktop_label: 'This desktop',
      peer_device_id: 'ios-test-device',
      peer_device_label: 'Test iPhone',
      state: 'active',
      authentication_string: '867 604',
      expires_at: '2026-08-17T13:00:00.000Z',
      key_epoch: 1,
      projection_stale: true,
      provider: 'tencent_cloud_im',
      usersig_expires_at: '2026-08-17T13:00:00.000Z',
    },
  ],
});

vi.mock('@/common', () => ({
  ipcBridge: {
    remoteCompanion: {
      getState: { invoke: mocks.getState },
      startPairing: { invoke: mocks.startPairing },
      pollPairing: { invoke: mocks.pollPairing },
      confirmPairing: { invoke: mocks.confirmPairing },
      revokePairing: { invoke: mocks.revokePairing },
      refreshPair: { invoke: mocks.refreshPair },
      stateChanged: { on: mocks.stateChangedOn },
    },
  },
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({ copyText: mocks.copyText }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const values: Record<string, string> = {
        'settings.resourcesPage.remoteCompanion.desktopLabelDefault': 'This desktop',
        'settings.resourcesPage.remoteCompanion.provider': 'Managed transport',
        'settings.resourcesPage.remoteCompanion.unavailable': 'Remote pairing unavailable',
        'settings.resourcesPage.remoteCompanion.loading': 'Loading',
        'settings.resourcesPage.remoteCompanion.copied': 'Copied',
        'settings.resourcesPage.remoteCompanion.copyFailed': 'Copy failed',
        'settings.resourcesPage.remoteCompanion.pairing.title': 'Pair a phone',
        'settings.resourcesPage.remoteCompanion.pairing.refresh': 'Refresh status',
        'settings.resourcesPage.remoteCompanion.pairing.qr': 'Scan with OPL Link',
        'settings.resourcesPage.remoteCompanion.pairing.qrAlt': 'Pairing QR',
        'settings.resourcesPage.remoteCompanion.pairing.copyQr': 'Copy pairing link',
        'settings.resourcesPage.remoteCompanion.pairing.manualCode': 'Pairing code',
        'settings.resourcesPage.remoteCompanion.pairing.copyManualCode': 'Copy pairing code',
        'settings.resourcesPage.remoteCompanion.pairing.authentication': 'Authentication string',
        'settings.resourcesPage.remoteCompanion.pairing.confirm': 'Confirm pairing',
        'settings.resourcesPage.remoteCompanion.invitationCode': 'Invitation code',
        'settings.resourcesPage.remoteCompanion.invitationCodePlaceholder': 'Invitation',
        'settings.resourcesPage.remoteCompanion.desktopLabel': 'Desktop name',
        'settings.resourcesPage.remoteCompanion.desktopLabelPlaceholder': 'Desktop',
        'settings.resourcesPage.remoteCompanion.startPairing': 'Create pairing QR',
        'settings.resourcesPage.remoteCompanion.pairs.title': 'Paired devices',
        'settings.resourcesPage.remoteCompanion.pairs.stale': 'Needs refresh',
        'settings.resourcesPage.remoteCompanion.pairs.refresh': 'Refresh access',
        'settings.resourcesPage.remoteCompanion.pairs.revoke': 'Revoke device',
        'settings.resourcesPage.remoteCompanion.pairs.revokeTitle': 'Revoke this device?',
        'settings.resourcesPage.remoteCompanion.pairs.revokeDescription': 'Revoke description',
        'settings.resourcesPage.remoteCompanion.pairs.confirmRevoke': 'Revoke pairing',
        'common.cancel': 'Cancel',
      };
      const value = values[key] ?? String(options?.defaultValue ?? key);
      return value.replace(/\{\{(\w+)\}\}/gu, (_match, name: string) => String(options?.[name] ?? ''));
    },
  }),
}));

vi.mock('@icon-park/react', () => {
  const Icon = () => null;
  return { Copy: Icon, Delete: Icon, Link: Icon, Refresh: Icon };
});

vi.mock('@arco-design/web-react', () => {
  const Button = ({
    children,
    icon,
    loading: _loading,
    status: _status,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    icon?: React.ReactNode;
    loading?: boolean;
    status?: string;
  }) => (
    <button {...props} type='button'>
      {icon}
      {children}
    </button>
  );
  const Input = ({
    value,
    onChange,
    ...props
  }: { value?: string; onChange?: (value: string) => void } & Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'onChange'
  >) => <input {...props} value={value} onChange={(event) => onChange?.(event.target.value)} />;
  const Alert = ({ title, content, ...props }: { title?: React.ReactNode; content?: React.ReactNode }) => (
    <div {...props}>
      {title}
      {content}
    </div>
  );
  const Modal = ({
    visible,
    title,
    footer,
    children,
    onCancel,
    ...props
  }: React.PropsWithChildren<
    {
      visible?: boolean;
      title?: React.ReactNode;
      footer?: React.ReactNode;
      onCancel?: () => void;
    } & React.HTMLAttributes<HTMLDivElement>
  >) =>
    visible ? (
      <div {...props}>
        <div>{title}</div>
        {children}
        {footer}
        <button type='button' onClick={onCancel}>
          Close
        </button>
      </div>
    ) : null;
  const Space = ({ children }: React.PropsWithChildren) => <div>{children}</div>;
  const Tag = ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement> & { color?: string }) => (
    <span {...props}>{children}</span>
  );
  const Text = ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>{children}</span>;
  return {
    Alert,
    Button,
    Input,
    Message: { success: vi.fn(), error: vi.fn() },
    Modal,
    Space,
    Tag,
    Typography: { Text },
  };
});

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value, ...props }: { value: string } & React.SVGProps<SVGSVGElement>) => (
    <svg {...props} data-testid='qr-svg' data-value={value} />
  ),
}));

describe('RemoteCompanionSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getState.mockResolvedValue(initialState());
    mocks.startPairing.mockResolvedValue(pendingState());
    mocks.pollPairing.mockResolvedValue(pendingState('867 604'));
    mocks.confirmPairing.mockResolvedValue(activeState());
    mocks.refreshPair.mockResolvedValue(activeState());
    mocks.revokePairing.mockResolvedValue(initialState());
  });

  afterEach(() => cleanup());

  it('starts pairing, renders copyable QR and short-code paths, and confirms the SAS explicitly', async () => {
    const view = render(<RemoteCompanionSettings />);
    await waitFor(() => expect(view.getByTestId('remote-companion-start')).toBeTruthy());

    fireEvent.change(view.getByTestId('remote-companion-invitation-code'), { target: { value: 'invite-001' } });
    fireEvent.change(view.getByTestId('remote-companion-desktop-label'), { target: { value: 'Lab desktop' } });
    fireEvent.click(view.getByTestId('remote-companion-start'));
    await waitFor(() =>
      expect(mocks.startPairing).toHaveBeenCalledWith({ invitation_code: 'invite-001', desktop_label: 'Lab desktop' })
    );
    expect(view.getByTestId('remote-companion-qr')).toBeTruthy();
    expect(view.getByTestId('remote-companion-copy-qr')).toBeTruthy();
    expect(view.getByTestId('remote-companion-manual-code')).toHaveTextContent('01AB CDEF GHJK');
    fireEvent.click(view.getByTestId('remote-companion-copy-manual-code'));
    await waitFor(() => expect(mocks.copyText).toHaveBeenCalledWith('01ABCDEFGHJK'));

    fireEvent.click(view.getByTestId('remote-companion-poll'));
    await waitFor(() => expect(mocks.pollPairing).toHaveBeenCalledWith({ pair_id: 'pair-test-001' }));
    expect(view.queryByTestId('remote-companion-manual-code')).toBeNull();
    expect(view.getByTestId('remote-companion-authentication')).toBeTruthy();
    fireEvent.click(view.getByTestId('remote-companion-confirm'));
    await waitFor(() =>
      expect(mocks.confirmPairing).toHaveBeenCalledWith({
        pair_id: 'pair-test-001',
        authentication_string: '867 604',
      })
    );
  });

  it('keeps revoke behind explicit confirmation and offers refresh for stale projection', async () => {
    mocks.getState.mockResolvedValue(activeState());
    const view = render(<RemoteCompanionSettings />);
    await waitFor(() => expect(view.getByTestId('remote-companion-pairs')).toBeTruthy());

    fireEvent.click(view.getByTestId('remote-companion-refresh-pair-test-001'));
    await waitFor(() => expect(mocks.refreshPair).toHaveBeenCalledWith({ pair_id: 'pair-test-001' }));
    fireEvent.click(view.getByTestId('remote-companion-revoke-pair-test-001'));
    fireEvent.click(view.getByTestId('remote-companion-revoke-confirm'));
    await waitFor(() => expect(mocks.revokePairing).toHaveBeenCalledWith({ pair_id: 'pair-test-001' }));
  });
});
