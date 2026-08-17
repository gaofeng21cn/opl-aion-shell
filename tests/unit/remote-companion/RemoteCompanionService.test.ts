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
    sdk_app_id: 100001,
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
    startWithDesktopDefaults: vi.fn().mockResolvedValue({
      thread: {
        id: 'thread-started',
        title: 'Started task',
        summary: '',
        status: 'running',
        projectId: '',
        workspace: '/workspace/project',
        host: 'codex-app-server',
        owner: null,
        goal: null,
        parentThreadId: null,
        ancestorThreadIds: [],
        activeTurnId: null,
        archived: false,
        updatedAt: '2026-08-17T12:00:00.000Z',
      },
      turn: { turnId: 'turn-started', msgId: 'message-started' },
    }),
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
    sdk_app_id: 100001,
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
      sdk_app_id: 100001,
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
  it('refreshes active credentials and reconnects the provider on cold start', async () => {
    const store = new InMemoryRemoteCredentialStore([activeRecord()]);
    const remoteBroker = broker();
    const remoteTransport = transport();
    const target = service(store, canonicalPort(), remoteBroker, remoteTransport);

    await target.getState();

    expect(remoteBroker.refreshProviderCredentials).toHaveBeenCalledWith(
      PAIR_ID,
      'device-credential-001',
      DESKTOP_DEVICE_ID,
      expect.any(String)
    );
    expect(remoteTransport.connect).toHaveBeenCalledWith(
      PAIR_ID,
      expect.objectContaining({ sdk_app_id: 100001, usersig: 'usersig-001' })
    );
  });

  it('creates a pending pairing projection without exposing the pair token', async () => {
    const remoteBroker = broker();
    const target = service(new InMemoryRemoteCredentialStore(), canonicalPort(), remoteBroker, transport());

    const state = await target.startPairing({ invitation_code: 'invitation-001', desktop_label: 'This desktop' });

    expect(state.pairing).toMatchObject({ pair_id: PAIR_ID, state: 'reserved', manual_code: 'manual-code-001' });
    expect(state.pairing?.qr_url).toContain('protocol_version=opl_remote_transport.v1');
    expect(JSON.stringify(state)).not.toContain('desktop-pair-token-001');
    expect(remoteBroker.createPairing).toHaveBeenCalledWith(
      expect.objectContaining({ desktop_device_id: DESKTOP_DEVICE_ID, desktop_device_label: 'This desktop' }),
      expect.any(String)
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
      sdk_app_id: 100001,
    });
    expect(remoteTransport.connect).toHaveBeenCalledWith(
      PAIR_ID,
      expect.objectContaining({
        sdk_app_id: 100001,
        provider_user_id: 'desktop-user-activation',
        peer_provider_user_id: 'ios-user-activation',
      })
    );
  });

  it('rejects a mismatched pairing identity before mutating the pending session', async () => {
    const remoteBroker = broker({
      readPairing: vi.fn().mockResolvedValue({ ...activePairingResponse(), pairing_id: 'other-pair' }),
    });
    const target = service(new InMemoryRemoteCredentialStore(), canonicalPort(), remoteBroker, transport());

    await target.startPairing({ invitation_code: 'invitation-001', desktop_label: 'Local label' });
    await expect(target.pollPairing(PAIR_ID)).rejects.toThrow('mismatched pairing identity');
    expect(await target.getState()).toMatchObject({
      pairing: { pair_id: PAIR_ID, state: 'reserved', authentication_string: null },
    });
  });

  it('rejects a missing active device activation instead of leaving a fake active pending session', async () => {
    const remoteBroker = broker({
      readPairing: vi.fn().mockResolvedValue({ ...activePairingResponse(), device_activation: undefined }),
    });
    const target = service(new InMemoryRemoteCredentialStore(), canonicalPort(), remoteBroker, transport());

    await target.startPairing({ invitation_code: 'invitation-001', desktop_label: 'Local label' });
    await expect(target.pollPairing(PAIR_ID)).rejects.toThrow('omitted device activation');
    expect(await target.getState()).toMatchObject({
      pairing: { pair_id: PAIR_ID, state: 'reserved', authentication_string: null },
    });
  });

  it('rejects a mismatched active device activation identity before mutating the pending session', async () => {
    const remoteBroker = broker({
      readPairing: vi.fn().mockResolvedValue(activePairingResponse({ device_id: 'other-desktop-device' })),
    });
    const target = service(new InMemoryRemoteCredentialStore(), canonicalPort(), remoteBroker, transport());

    await target.startPairing({ invitation_code: 'invitation-001', desktop_label: 'Local label' });
    await expect(target.pollPairing(PAIR_ID)).rejects.toThrow('mismatched device activation identity');
    expect(await target.getState()).toMatchObject({
      pairing: { pair_id: PAIR_ID, state: 'reserved', authentication_string: null },
    });
  });

  it('rejects a mismatched pairing identity from confirm before mutating the pending session', async () => {
    const remoteBroker = broker({
      readPairing: vi.fn().mockResolvedValue({
        protocol_version: REMOTE_COMPANION_PROTOCOL_VERSION,
        pairing_id: PAIR_ID,
        state: 'reserved',
        authentication_string: '867 604',
        expires_at: '2026-08-17T13:00:00.000Z',
      }),
      confirmPairing: vi.fn().mockResolvedValue({
        protocol_version: REMOTE_COMPANION_PROTOCOL_VERSION,
        pairing_id: 'other-pair',
        state: 'active',
      }),
    });
    const target = service(new InMemoryRemoteCredentialStore(), canonicalPort(), remoteBroker, transport());

    await target.startPairing({ invitation_code: 'invitation-001', desktop_label: 'Local label' });
    await target.pollPairing(PAIR_ID);
    await expect(target.confirmPairing({ pair_id: PAIR_ID, authentication_string: '867 604' })).rejects.toThrow(
      'mismatched pairing identity'
    );
    expect(await target.getState()).toMatchObject({
      pairing: { pair_id: PAIR_ID, state: 'reserved', authentication_string: '867 604' },
    });
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

  it('does not activate when broker JSON supplies sdk_app_id as a string', async () => {
    const remoteBroker = broker({
      readPairing: vi.fn().mockResolvedValue(activePairingResponse({ sdk_app_id: '100001' as unknown as number })),
    });
    const remoteTransport = transport();
    const target = service(new InMemoryRemoteCredentialStore(), canonicalPort(), remoteBroker, remoteTransport);

    await target.startPairing({ invitation_code: 'invitation-001', desktop_label: 'Local label' });
    const state = await target.pollPairing(PAIR_ID);

    expect(state.pairs).toEqual([]);
    expect(remoteTransport.connect).not.toHaveBeenCalled();
  });

  it('rejects string sdk_app_id values returned by provider credential refresh', async () => {
    const remoteBroker = broker({
      refreshProviderCredentials: vi.fn().mockResolvedValue({
        provider: 'tencent_cloud_im',
        sdk_app_id: '100001' as unknown as number,
        provider_user_id: 'desktop-user-001',
        peer_provider_user_id: 'ios-user-001',
        usersig: 'usersig-001',
        usersig_expires_at: '2026-08-17T13:00:00.000Z',
      }),
    });
    const remoteTransport = transport();
    const target = service(
      new InMemoryRemoteCredentialStore([activeRecord()]),
      canonicalPort(),
      remoteBroker,
      remoteTransport
    );

    await expect(target.refreshPair(PAIR_ID)).rejects.toThrow('invalid provider credentials');
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

  it('atomically shares an in-flight duplicate start request', async () => {
    const canonical = canonicalPort();
    let resolveStart:
      | ((value: Awaited<ReturnType<NonNullable<RemoteCanonicalActionPort['startWithDesktopDefaults']>>>) => void)
      | null = null;
    const startWithDesktopDefaults = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<NonNullable<RemoteCanonicalActionPort['startWithDesktopDefaults']>>>>(
          (resolve) => {
            resolveStart = resolve;
          }
        )
    );
    canonical.startWithDesktopDefaults = startWithDesktopDefaults;
    const target = service(new InMemoryRemoteCredentialStore([activeRecord()]), canonical, broker(), transport());
    const request: RemoteActionRequest = {
      pair_id: PAIR_ID,
      key_epoch: 1,
      request_id: 'request-start-concurrent',
      action_id: 'canonical_task.start',
      payload: { text: 'Start once' },
    };

    const first = target.executeAction(request);
    const duplicate = target.executeAction(request);
    await vi.waitFor(() => expect(startWithDesktopDefaults).toHaveBeenCalledOnce());
    resolveStart?.({
      thread: {
        id: 'thread-concurrent',
        title: 'Concurrent task',
        summary: '',
        status: 'running',
        projectId: '',
        workspace: '/workspace/project',
        host: 'codex-app-server',
        owner: null,
        goal: null,
        parentThreadId: null,
        ancestorThreadIds: [],
        activeTurnId: null,
        archived: false,
        updatedAt: '2026-08-17T12:00:00.000Z',
      },
      turn: { turnId: 'turn-concurrent', msgId: 'message-concurrent' },
    });
    const [firstResponse, duplicateResponse] = await Promise.all([first, duplicate]);
    expect(duplicateResponse).toEqual(firstResponse);
  });

  it('maps the canonical pair.revoke wire action to the service revocation path', async () => {
    const remoteBroker = broker();
    const remoteTransport = transport();
    const target = service(
      new InMemoryRemoteCredentialStore([activeRecord()]),
      canonicalPort(),
      remoteBroker,
      remoteTransport
    );

    const response = await target.executeAction({
      pair_id: PAIR_ID,
      key_epoch: 1,
      request_id: 'request-revoke-wire',
      action_id: 'pair.revoke',
      payload: {},
    });

    expect(response).toMatchObject({ accepted: true, action_id: 'pair.revoke', payload: { pair_id: PAIR_ID } });
    expect(remoteBroker.revokePair).toHaveBeenCalledWith(PAIR_ID, 'device-credential-001', expect.any(String));
    expect(remoteTransport.disconnect).toHaveBeenCalledWith(PAIR_ID);
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

  it('persists revocation receipt and provider reclaim status when terminal readback is not ready', async () => {
    const store = new InMemoryRemoteCredentialStore([activeRecord()]);
    const target = service(
      store,
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
    expect((await target.getState()).pairs[0]?.state).toBe('provider_reclaim_pending');
    expect(await store.list()).toEqual([
      expect.objectContaining({
        state: 'provider_reclaim_pending',
        revocation_receipt_id: 'receipt-001',
        revocation_receipt_token: 'receipt-token-001',
      }),
    ]);
  });

  it('awaits transport disconnect for every active pair during disposal', async () => {
    const remoteTransport = transport();
    let resolveDisconnect: (() => void) | null = null;
    remoteTransport.disconnect = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDisconnect = resolve;
        })
    );
    const target = service(
      new InMemoryRemoteCredentialStore([activeRecord()]),
      canonicalPort(),
      broker(),
      remoteTransport
    );

    await target.getState();
    const disposal = target.dispose();
    await vi.waitFor(() => expect(remoteTransport.disconnect).toHaveBeenCalledWith(PAIR_ID));
    resolveDisconnect?.();
    await disposal;
  });

  it('resumes a persisted revocation receipt during cold start without issuing a second revoke', async () => {
    const store = new InMemoryRemoteCredentialStore([activeRecord()]);
    const firstBroker = broker({
      readRevocation: vi.fn().mockResolvedValue({
        protocol_version: REMOTE_COMPANION_PROTOCOL_VERSION,
        pairing_id: PAIR_ID,
        state: 'provider_reclaim_pending',
        desktop_provider_identity_absent: true,
        ios_provider_identity_absent: false,
        seat_released: false,
      }),
    });
    const first = service(store, canonicalPort(), firstBroker, transport());
    await expect(first.revokePair({ pair_id: PAIR_ID })).rejects.toThrow('provider-absence terminal state');
    await first.dispose();

    const secondBroker = broker();
    const secondTransport = transport();
    const second = service(store, canonicalPort(), secondBroker, secondTransport);
    const state = await second.getState();

    expect(state.pairs).toEqual([]);
    expect(secondBroker.revokePair).not.toHaveBeenCalled();
    expect(secondBroker.readRevocation).toHaveBeenCalledWith('receipt-001', 'receipt-token-001');
    expect(secondTransport.disconnect).toHaveBeenCalledWith(PAIR_ID);
  });
});
