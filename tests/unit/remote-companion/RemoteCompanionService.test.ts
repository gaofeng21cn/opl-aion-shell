import { describe, expect, it, vi } from 'vitest';
import { generateX25519KeyMaterial } from '@/process/services/remote-companion/crypto';
import { RemoteCompanionService } from '@/process/services/remote-companion/RemoteCompanionService';
import {
  InMemoryRemoteCredentialStore,
  type RemoteCredentialRecord,
} from '@/process/services/remote-companion/credentialStore';
import type { RemoteCanonicalActionPort } from '@/process/services/remote-companion/canonicalActionBridge';
import type { RemoteBrokerPort } from '@/process/services/remote-companion/types';
import type { RemoteTransportAdapter } from '@/process/services/remote-companion/tencentImAdapter';
import type { BrokerReadPairingResponse, RemoteBrokerConfig } from '@/process/services/remote-companion/brokerClient';
import type { RemoteActionRequest } from '@/common/types/remoteCompanion';
import { REMOTE_COMPANION_PROTOCOL_VERSION } from '@/common/types/remoteCompanion';

const PAIR_ID = 'pair-test-001';
const DESKTOP_DEVICE_ID = 'desktop-test-device';
const IOS_DEVICE_ID = 'ios-test-device';

function deviceActivation(
  overrides: Partial<NonNullable<BrokerReadPairingResponse['device_activation']>> = {}
): NonNullable<BrokerReadPairingResponse['device_activation']> {
  const peer = generateX25519KeyMaterial();
  return {
    device_id: DESKTOP_DEVICE_ID,
    device_label: 'Broker desktop label',
    peer_device_id: IOS_DEVICE_ID,
    peer_device_label: 'Broker iPhone label',
    provider_user_id: 'desktop-user-activation',
    peer_provider_user_id: 'ios-user-activation',
    peer_public_key: peer.public_key,
    sdk_app_id: 'sdk-from-activation',
    usersig: 'usersig-activation',
    usersig_expires_at: '2026-08-17T13:00:00.000Z',
    ...overrides,
  };
}

function activePairingResponse(
  activationOverrides: Partial<NonNullable<BrokerReadPairingResponse['device_activation']>> = {}
): BrokerReadPairingResponse {
  return {
    protocol_version: REMOTE_COMPANION_PROTOCOL_VERSION,
    pairing_id: PAIR_ID,
    state: 'active',
    authentication_string: '867 604',
    expires_at: '2026-08-17T13:00:00.000Z',
    device_activation: deviceActivation(activationOverrides),
  };
}

function canonicalPort(): RemoteCanonicalActionPort {
  return {
    listThreads: vi.fn().mockResolvedValue({
      schema: 'opl_codex_thread_directory.v1',
      host: 'codex-app-server',
      complete: true,
      threads: [],
    }),
    readThread: vi.fn(),
    startTurn: vi.fn().mockResolvedValue({ turnId: 'turn-001', msgId: 'message-001' }),
    interruptTurn: vi.fn().mockResolvedValue(undefined),
  };
}

function transport(): RemoteTransportAdapter {
  return {
    provider: 'tencent_cloud_im',
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    onMessage: vi.fn(() => () => undefined),
  };
}

function activeRecord(): RemoteCredentialRecord {
  const desktop = generateX25519KeyMaterial();
  const ios = generateX25519KeyMaterial();
  return {
    pair_id: PAIR_ID,
    desktop_device_id: DESKTOP_DEVICE_ID,
    desktop_label: 'This desktop',
    peer_device_id: IOS_DEVICE_ID,
    peer_device_label: 'Test iPhone',
    state: 'active',
    authentication_string: '867 604',
    key_epoch: 1,
    desktop_key_material: desktop,
    peer_public_key: ios.public_key,
    desktop_sender_sequence: 0,
    last_inbound_sequence: 0,
    seen_inbound_nonces: [],
    device_credential: 'device-credential-001',
    provider_user_id: 'desktop-user-001',
    peer_provider_user_id: 'ios-user-001',
    sdk_app_id: 'sdk-001',
    usersig_expires_at: '2026-08-17T13:00:00.000Z',
  };
}

function broker(overrides: Partial<RemoteBrokerPort> = {}): RemoteBrokerPort {
  return {
    configured: true,
    createPairing: vi.fn().mockResolvedValue({
      protocol_version: REMOTE_COMPANION_PROTOCOL_VERSION,
      pairing_id: PAIR_ID,
      desktop_pair_token: 'desktop-pair-token-001',
      claim_secret: 'claim-secret-001',
      manual_code: 'manual-code-001',
      expires_at: '2026-08-17T13:00:00.000Z',
      broker_url: 'https://broker.example.test',
    }),
    readPairing: vi.fn(),
    confirmPairing: vi.fn(),
    revokePair: vi.fn().mockResolvedValue({
      protocol_version: REMOTE_COMPANION_PROTOCOL_VERSION,
      pairing_id: PAIR_ID,
      state: 'revoking',
      revocation_receipt_id: 'receipt-001',
      revocation_receipt_token: 'receipt-token-001',
    }),
    readRevocation: vi.fn().mockResolvedValue({
      protocol_version: REMOTE_COMPANION_PROTOCOL_VERSION,
      pairing_id: PAIR_ID,
      state: 'revoked',
      desktop_provider_identity_absent: true,
      ios_provider_identity_absent: true,
      seat_released: true,
    }),
    refreshProviderCredentials: vi.fn().mockResolvedValue({
      provider: 'tencent_cloud_im',
      sdk_app_id: 'sdk-001',
      provider_user_id: 'desktop-user-001',
      peer_provider_user_id: 'ios-user-001',
      usersig: 'usersig-001',
      usersig_expires_at: '2026-08-17T13:00:00.000Z',
    }),
    ...overrides,
  };
}

function service(
  store: InMemoryRemoteCredentialStore,
  canonical: RemoteCanonicalActionPort,
  remoteBroker: RemoteBrokerPort,
  remoteTransport: RemoteTransportAdapter
): RemoteCompanionService {
  const config: RemoteBrokerConfig = {
    baseUrl: 'https://broker.example.test',
  };
  return new RemoteCompanionService({
    broker: remoteBroker,
    brokerConfig: config,
    credentialStore: store,
    transport: remoteTransport,
    canonical,
    desktopDeviceId: DESKTOP_DEVICE_ID,
    revokePollAttempts: 1,
    revokePollIntervalMs: 0,
    sleep: async () => undefined,
  });
}

describe('RemoteCompanionService', () => {
  it('creates a pending pairing projection without exposing the pair token', async () => {
    const remoteBroker = broker();
    const target = service(new InMemoryRemoteCredentialStore(), canonicalPort(), remoteBroker, transport());

    const state = await target.startPairing({ invitation_code: 'invitation-001', desktop_label: 'This desktop' });

    expect(state.pairing).toMatchObject({ pair_id: PAIR_ID, state: 'reserved', manual_code: 'manual-code-001' });
    expect(state.pairing?.qr_url).toContain('protocol_version=opl_remote_transport.v1');
    expect(JSON.stringify(state)).not.toContain('desktop-pair-token-001');
    expect(remoteBroker.createPairing).toHaveBeenCalledWith(
      expect.objectContaining({ desktop_device_id: DESKTOP_DEVICE_ID, desktop_device_label: 'This desktop' })
    );
  });

  it('activates from broker fields and connects with the activation SDKAppID', async () => {
    const remoteBroker = broker({ readPairing: vi.fn().mockResolvedValue(activePairingResponse()) });
    const remoteTransport = transport();
    const store = new InMemoryRemoteCredentialStore();
    const target = service(store, canonicalPort(), remoteBroker, remoteTransport);

    await target.startPairing({ invitation_code: 'invitation-001', desktop_label: 'Local label' });
    const state = await target.pollPairing(PAIR_ID);

    expect(state.pairing).toBeNull();
    expect(state.pairs).toMatchObject([
      {
        pair_id: PAIR_ID,
        desktop_label: 'Broker desktop label',
        peer_device_id: IOS_DEVICE_ID,
        peer_device_label: 'Broker iPhone label',
        state: 'active',
      },
    ]);
    expect((await store.list())[0]).toMatchObject({
      device_credential: 'desktop-pair-token-001',
      peer_device_id: IOS_DEVICE_ID,
      peer_device_label: 'Broker iPhone label',
      sdk_app_id: 'sdk-from-activation',
    });
    expect(remoteTransport.connect).toHaveBeenCalledWith(
      PAIR_ID,
      expect.objectContaining({
        sdk_app_id: 'sdk-from-activation',
        provider_user_id: 'desktop-user-activation',
        peer_provider_user_id: 'ios-user-activation',
      })
    );
  });

  it('does not activate or connect when the broker omits the peer public key', async () => {
    const remoteBroker = broker({
      readPairing: vi.fn().mockResolvedValue(activePairingResponse({ peer_public_key: undefined })),
    });
    const remoteTransport = transport();
    const target = service(new InMemoryRemoteCredentialStore(), canonicalPort(), remoteBroker, remoteTransport);

    await target.startPairing({ invitation_code: 'invitation-001', desktop_label: 'Local label' });
    const state = await target.pollPairing(PAIR_ID);

    expect(state.pairs).toEqual([]);
    expect(state.pairing).toMatchObject({ pair_id: PAIR_ID, state: 'active' });
    expect(remoteTransport.connect).not.toHaveBeenCalled();
  });

  it('enforces one active pair before creating another pairing', async () => {
    const remoteBroker = broker();
    const target = service(
      new InMemoryRemoteCredentialStore([activeRecord()]),
      canonicalPort(),
      remoteBroker,
      transport()
    );

    await expect(
      target.startPairing({ invitation_code: 'invitation-002', desktop_label: 'Second desktop label' })
    ).rejects.toThrow('capacity');
    expect(remoteBroker.createPairing).not.toHaveBeenCalled();
  });

  it('deduplicates a command before the canonical bridge and requires refresh after an unknown result', async () => {
    const canonical = canonicalPort();
    const target = service(new InMemoryRemoteCredentialStore([activeRecord()]), canonical, broker(), transport());
    const request: RemoteActionRequest = {
      pair_id: PAIR_ID,
      key_epoch: 1,
      request_id: 'request-list-001',
      action_id: 'canonical_task.list',
      payload: {},
    };

    const first = await target.executeAction(request);
    const duplicate = await target.executeAction(request);
    expect(duplicate).toEqual(first);
    expect(canonical.listThreads).toHaveBeenCalledTimes(1);

    target.markUnknownResult(PAIR_ID);
    const blocked = await target.executeAction({
      ...request,
      request_id: 'request-send-001',
      action_id: 'canonical_task.send_text',
      canonical_thread_id: 'thread-001',
      payload: { text: 'Do not resend this command' },
    });
    expect(blocked).toMatchObject({
      accepted: false,
      error_code: 'canonical_refresh_required',
      refresh_required: true,
    });
    expect(canonical.startTurn).not.toHaveBeenCalled();

    const refreshed = await target.executeAction({
      ...request,
      request_id: 'request-refresh-001',
      action_id: 'canonical_task.refresh',
    });
    expect(refreshed.accepted).toBe(true);
    expect((await target.getState()).pairs[0]?.projection_stale).toBe(false);
  });

  it('waits for both provider identities and seat release before deleting a pair', async () => {
    const remoteTransport = transport();
    const target = service(
      new InMemoryRemoteCredentialStore([activeRecord()]),
      canonicalPort(),
      broker(),
      remoteTransport
    );

    const state = await target.revokePair({ pair_id: PAIR_ID });

    expect(state.pairs).toEqual([]);
    expect(remoteTransport.disconnect).toHaveBeenCalledWith(PAIR_ID);
    expect((await target.getState()).pairs).toEqual([]);
  });

  it('restores active state when revocation does not reach the terminal owner readback', async () => {
    const target = service(
      new InMemoryRemoteCredentialStore([activeRecord()]),
      canonicalPort(),
      broker({
        readRevocation: vi.fn().mockResolvedValue({
          protocol_version: REMOTE_COMPANION_PROTOCOL_VERSION,
          pairing_id: PAIR_ID,
          state: 'provider_reclaim_pending',
          desktop_provider_identity_absent: true,
          ios_provider_identity_absent: false,
          seat_released: false,
        }),
      }),
      transport()
    );

    await expect(target.revokePair({ pair_id: PAIR_ID })).rejects.toThrow('provider-absence terminal state');
    expect((await target.getState()).pairs[0]?.state).toBe('active');
  });
});
