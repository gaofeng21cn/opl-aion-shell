import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WeixinConfigForm from '@/renderer/components/settings/SettingsModal/contents/channels/WeixinConfigForm';

const channelMocks = vi.hoisted(() => ({
  enablePlugin: vi.fn(),
  disablePlugin: vi.fn(),
  getPluginStatus: vi.fn(),
  getPendingPairings: vi.fn(),
  getAuthorizedUsers: vi.fn(),
  approvePairing: vi.fn(),
  rejectPairing: vi.fn(),
  revokeUser: vi.fn(),
}));

const messageMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  channel: {
    enablePlugin: { invoke: channelMocks.enablePlugin },
    disablePlugin: { invoke: channelMocks.disablePlugin },
    getPluginStatus: { invoke: channelMocks.getPluginStatus },
    getPendingPairings: { invoke: channelMocks.getPendingPairings },
    getAuthorizedUsers: { invoke: channelMocks.getAuthorizedUsers },
    approvePairing: { invoke: channelMocks.approvePairing },
    rejectPairing: { invoke: channelMocks.rejectPairing },
    revokeUser: { invoke: channelMocks.revokeUser },
    pairingRequested: { on: () => () => undefined },
    userAuthorized: { on: () => () => undefined },
  },
}));

vi.mock('@/common/adapter/httpBridge', () => ({ getBaseUrl: () => 'http://127.0.0.1:1234' }));
vi.mock('@/renderer/components/settings/SettingsModal/contents/channels/assistantOptions', () => ({
  useFixedChannelAssistantSelection: () => undefined,
}));
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg aria-label='weixin-qr' data-value={value} />,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      ...actual.Message,
      success: messageMocks.success,
      error: messageMocks.error,
      info: messageMocks.info,
      warning: messageMocks.warning,
    },
  };
});

type EventListener = (event: MessageEvent) => void;

class FakeEventSource {
  static last: FakeEventSource | null = null;

  readonly listeners = new Map<string, EventListener>();
  readonly url: string;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.last = this;
  }

  addEventListener(type: string, listener: EventListener): void {
    this.listeners.set(type, listener);
  }

  close(): void {}

  emit(type: string, data = ''): void {
    this.listeners.get(type)?.({ data } as MessageEvent);
  }
}

describe('WeixinConfigForm', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', FakeEventSource);
    FakeEventSource.last = null;
    vi.clearAllMocks();
    channelMocks.getPendingPairings.mockResolvedValue([]);
    channelMocks.getAuthorizedUsers.mockResolvedValue([]);
    channelMocks.enablePlugin.mockResolvedValue(undefined);
    channelMocks.disablePlugin.mockResolvedValue(undefined);
    channelMocks.getPluginStatus.mockResolvedValue([
      { type: 'weixin', enabled: true, connected: true, hasToken: true, botUsername: 'OPL' },
    ]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the AionCore login endpoint and enables the built-in Weixin plugin after QR completion', async () => {
    const onStatusChange = vi.fn();
    render(<WeixinConfigForm pluginStatus={null} onStatusChange={onStatusChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'settings.weixin.loginButton' }));
    expect(FakeEventSource.last?.url).toBe('http://127.0.0.1:1234/api/channel/weixin/login');

    FakeEventSource.last?.emit('qr', JSON.stringify({ qrcodeData: 'weixin-ticket' }));
    expect(await screen.findByLabelText('weixin-qr')).toHaveAttribute('data-value', 'weixin-ticket');

    FakeEventSource.last?.emit('done', JSON.stringify({ accountId: 'account-1', botToken: 'token-1' }));
    await waitFor(() => {
      expect(channelMocks.enablePlugin).toHaveBeenCalledWith({
        plugin_id: 'weixin',
        config: { credentials: { account_id: 'account-1', bot_token: 'token-1' } },
      });
    });
    expect(onStatusChange).toHaveBeenCalledWith(expect.objectContaining({ type: 'weixin', connected: true }));
  });

  it('disconnects through the AionCore channel IPC', async () => {
    const onStatusChange = vi.fn();
    render(
      <WeixinConfigForm
        pluginStatus={{ type: 'weixin', enabled: true, connected: true, hasToken: true } as never}
        onStatusChange={onStatusChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'settings.weixin.disconnect' }));
    await waitFor(() => expect(channelMocks.disablePlugin).toHaveBeenCalledWith({ plugin_id: 'weixin' }));
    expect(onStatusChange).toHaveBeenCalledWith(null);
  });
});
