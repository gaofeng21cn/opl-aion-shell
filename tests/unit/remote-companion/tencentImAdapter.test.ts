import { describe, expect, it, vi } from 'vitest';
import type { RemoteProviderCredentialProjection, RemoteTransportEnvelope } from '@/common/types/remoteCompanion';
import {
  TencentCloudImAdapter,
  TencentCloudImSdkGateway,
  type TencentCloudChatSdk,
} from '@/process/services/remote-companion/tencentImAdapter';

const PAIR_ID = 'pair-test-001';
const PEER_DEVICE_ID = 'ios-test-device';

function credentials(overrides: Partial<RemoteProviderCredentialProjection> = {}): RemoteProviderCredentialProjection {
  return {
    provider: 'tencent_cloud_im',
    sdk_app_id: 100001,
    provider_user_id: 'desktop-user-001',
    peer_provider_user_id: 'ios-user-001',
    usersig: 'usersig-001',
    usersig_expires_at: '2026-08-17T13:00:00.000Z',
    ...overrides,
  };
}

function envelope(): RemoteTransportEnvelope {
  return {
    protocol_version: 'opl_remote_transport.v1',
    pair_id: PAIR_ID,
    sender_device_id: 'desktop-test-device',
    recipient_device_id: PEER_DEVICE_ID,
    key_epoch: 1,
    sender_sequence: 1,
    nonce: 'AAECAwQFBgcICQoL',
    ciphertext: 'YQ',
  };
}

function fakeSdk() {
  const sdk = {
    TYPES: { MSG_CUSTOM: 'TIMCustomElem', CONV_C2C: 'C2C' },
    EVENT: {
      SDK_READY: 'sdkStateReady',
      SDK_NOT_READY: 'sdkStateNotReady',
      MESSAGE_RECEIVED: 'onMessageReceived',
    },
    create: vi.fn(),
  } as unknown as TencentCloudChatSdk;
  type FakeChat = ReturnType<TencentCloudChatSdk['create']>;
  const handlers = new Map<string, Set<(event: { data?: unknown }) => void>>();
  let ready = false;
  const sent: unknown[] = [];
  const chat = {
    login: vi.fn(async () => {
      ready = true;
      for (const handler of handlers.get(sdk.EVENT.SDK_READY) ?? []) handler({});
    }),
    logout: vi.fn(async () => {
      ready = false;
    }),
    destroy: vi.fn(async () => undefined),
    isReady: vi.fn(() => ready),
    on: vi.fn((eventName: string, handler: (event: { data?: unknown }) => void) => {
      const eventHandlers = handlers.get(eventName) ?? new Set();
      eventHandlers.add(handler);
      handlers.set(eventName, eventHandlers);
    }),
    off: vi.fn((eventName: string, handler: (event: { data?: unknown }) => void) => {
      handlers.get(eventName)?.delete(handler);
    }),
    createCustomMessage: vi.fn((input: unknown) => input),
    sendMessage: vi.fn(async (message: unknown) => {
      sent.push(message);
    }),
  } as unknown as FakeChat;
  sdk.create = vi.fn(() => chat);
  return {
    sdk,
    chat,
    sent,
    emit(eventName: string, event: { data?: unknown }) {
      for (const handler of handlers.get(eventName) ?? []) handler(event);
    },
  };
}

describe('TencentCloudImAdapter', () => {
  it('logs in through the official SDK shape and sends provider-neutral envelopes as C2C custom messages', async () => {
    const fake = fakeSdk();
    const gateway = new TencentCloudImSdkGateway(fake.sdk);
    const adapter = new TencentCloudImAdapter(gateway);
    const received = vi.fn();
    adapter.onMessage(received);

    await adapter.connect(PAIR_ID, credentials());
    await adapter.send(PAIR_ID, envelope());

    expect(fake.sdk.create).toHaveBeenCalledWith({ SDKAppID: 100001 });
    expect(fake.chat.login).toHaveBeenCalledWith({ userID: 'desktop-user-001', userSig: 'usersig-001' });
    expect(fake.chat.createCustomMessage).toHaveBeenCalledWith({
      to: 'ios-user-001',
      conversationType: 'C2C',
      payload: {
        data: JSON.stringify(envelope()),
        description: 'opl_remote_transport.v1',
        extension: PAIR_ID,
      },
    });
    expect(fake.sent).toHaveLength(1);

    const inbound = { ...envelope(), sender_device_id: PEER_DEVICE_ID, recipient_device_id: 'desktop-test-device' };
    fake.emit(fake.sdk.EVENT.MESSAGE_RECEIVED, {
      data: [
        {
          type: fake.sdk.TYPES.MSG_CUSTOM,
          from: 'ios-user-001',
          payload: { extension: PAIR_ID, data: JSON.stringify(inbound) },
        },
      ],
    });
    await Promise.resolve();
    expect(received).toHaveBeenCalledWith({
      pair_id: PAIR_ID,
      sender_device_id: PEER_DEVICE_ID,
      envelope: inbound,
    });

    await adapter.disconnect(PAIR_ID);
    expect(fake.chat.logout).toHaveBeenCalledTimes(1);
    expect(fake.chat.destroy).toHaveBeenCalledTimes(1);
  });

  it('does not log a second account into the same SDKAppID instance', async () => {
    const fake = fakeSdk();
    const gateway = new TencentCloudImSdkGateway(fake.sdk);

    await gateway.connect({ pair_id: PAIR_ID, ...credentials() });
    await expect(
      gateway.connect({ pair_id: 'pair-test-002', ...credentials({ provider_user_id: 'desktop-user-002' }) })
    ).rejects.toThrow('one active SDK session per SDKAppID');
    expect(fake.chat.login).toHaveBeenCalledTimes(1);
  });

  it('rejects a string SDKAppID instead of coercing it at the provider boundary', async () => {
    const fake = fakeSdk();
    const gateway = new TencentCloudImSdkGateway(fake.sdk);
    const invalid = {
      pair_id: PAIR_ID,
      ...credentials(),
      sdk_app_id: '100001',
    } as unknown as Parameters<typeof gateway.connect>[0];

    await expect(gateway.connect(invalid)).rejects.toThrow('SDKAppID is invalid');
    expect(fake.sdk.create).not.toHaveBeenCalled();
  });
});
