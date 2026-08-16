import { randomUUID } from 'node:crypto';
import {
  REMOTE_COMPANION_MAX_ACTIVE_PAIRS,
  REMOTE_COMPANION_PROTOCOL_VERSION,
  type RemoteActionRequest,
  type RemoteActionResponse,
  type RemoteCompanionState,
  type RemoteEncryptedPayload,
  type RemotePairingPublicState,
  type RemotePairingSessionPublicState,
  type RemotePairingState,
  type RemoteRevokePairingRequest,
  type RemoteStartPairingRequest,
  type RemoteTransportEnvelope,
  isValidRemoteSdkAppId,
} from '@/common/types/remoteCompanion';
import {
  decryptPayload,
  deriveDirectionalKeys,
  encryptPayload,
  generateX25519KeyMaterial,
  RemoteReplayGuard,
  RemoteRequestDedupe,
} from './crypto';
import { buildPairingQrUrl, RemoteProtocolError, validateEnvelope, validateEncryptedPayload } from './protocol';
import type {
  BrokerReadPairingResponse,
  BrokerRevocationResponse,
  BrokerRevokePairingResponse,
  RemoteBrokerConfig,
} from './brokerClient';
import type { RemoteBrokerPort } from './types';
import type { RemoteCanonicalActionPort, RemoteProjectionEvent } from './canonicalActionBridge';
import { RemoteActionDispatchError, RemoteCanonicalActionBridge } from './canonicalActionBridge';
import type { RemoteCredentialRecord, RemoteCredentialStore } from './credentialStore';
import type { RemoteProviderCredentialProjection } from '@/common/types/remoteCompanion';
import type { RemoteTransportAdapter } from './tencentImAdapter';

type PendingPairing = {
  pair_id: string;
  desktop_device_id: string;
  desktop_label: string;
  desktop_public_key: string;
  desktop_key_material: ReturnType<typeof generateX25519KeyMaterial>;
  desktop_pair_token: string;
  claim_secret: string;
  manual_code: string;
  broker_url: string;
  expires_at: string;
  state: RemotePairingState;
  authentication_string: string | null;
};

type RemoteCompanionServiceOptions = {
  broker: RemoteBrokerPort;
  brokerConfig: RemoteBrokerConfig;
  credentialStore: RemoteCredentialStore;
  transport: RemoteTransportAdapter;
  canonical: RemoteCanonicalActionPort;
  desktopDeviceId?: string;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  revokePollAttempts?: number;
  revokePollIntervalMs?: number;
};

type RemoteStateListener = (state: RemoteCompanionState) => void;

const ACTIVE_STATES = new Set<RemotePairingState>(['active', 'revoking', 'provider_reclaim_pending']);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Remote ${field} is required.`);
  return value.trim();
}

function nowIso(now: () => Date): string {
  return now().toISOString();
}

export class RemoteCompanionService {
  private readonly broker: RemoteBrokerPort;
  private readonly brokerConfig: RemoteBrokerConfig;
  private readonly credentialStore: RemoteCredentialStore;
  private readonly transport: RemoteTransportAdapter;
  private readonly canonical: RemoteCanonicalActionBridge;
  private readonly desktopDeviceId: string;
  private readonly now: () => Date;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly revokePollAttempts: number;
  private readonly revokePollIntervalMs: number;
  private readonly pendingPairings = new Map<string, PendingPairing>();
  private readonly credentials = new Map<string, RemoteCredentialRecord>();
  private readonly replayGuard = new RemoteReplayGuard();
  private readonly requestDedupe = new RemoteRequestDedupe();
  private readonly refreshRequired = new Set<string>();
  private readonly listeners = new Set<RemoteStateListener>();
  private loaded = false;
  private credentialStoreUnavailable = false;
  private pairingQrClaimUsed = new Set<string>();
  private transportOff: (() => void) | null = null;
  private canonicalOff: (() => void) | null = null;
  private eventSendQueue = Promise.resolve();

  constructor(options: RemoteCompanionServiceOptions) {
    this.broker = options.broker;
    this.brokerConfig = options.brokerConfig;
    this.credentialStore = options.credentialStore;
    this.transport = options.transport;
    this.canonical = new RemoteCanonicalActionBridge(options.canonical);
    this.desktopDeviceId = options.desktopDeviceId ?? randomUUID();
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.revokePollAttempts = options.revokePollAttempts ?? 30;
    this.revokePollIntervalMs = options.revokePollIntervalMs ?? 1_000;
    this.transportOff = this.transport.onMessage((message) => this.handleIncomingTransportMessage(message));
    this.canonicalOff = this.canonical.subscribeEvents((event) => {
      void this.handleCanonicalEvent(event);
    });
  }

  async getState(): Promise<RemoteCompanionState> {
    await this.ensureLoaded();
    return this.publicState();
  }

  onStateChanged(listener: RemoteStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async startPairing(request: RemoteStartPairingRequest): Promise<RemoteCompanionState> {
    await this.ensureLoaded();
    this.assertConfigured();
    if (this.activePairCount() + this.pendingPairings.size >= REMOTE_COMPANION_MAX_ACTIVE_PAIRS) {
      throw new Error('Remote pairing capacity is full on this desktop.');
    }
    const invitationCode = requiredText(request.invitation_code, 'invitation_code');
    const desktopLabel = requiredText(request.desktop_label, 'desktop_label').slice(0, 80);
    const keyMaterial = generateX25519KeyMaterial();
    const created = await this.broker.createPairing({
      invitation_code: invitationCode,
      desktop_device_id: this.desktopDeviceId,
      desktop_device_label: desktopLabel,
      desktop_public_key: keyMaterial.public_key,
    });
    this.assertBrokerProtocol(created);
    const pairing: PendingPairing = {
      pair_id: requiredText(created.pairing_id, 'pairing_id'),
      desktop_device_id: this.desktopDeviceId,
      desktop_label: desktopLabel,
      desktop_public_key: keyMaterial.public_key,
      desktop_key_material: keyMaterial,
      desktop_pair_token: requiredText(created.desktop_pair_token, 'desktop_pair_token'),
      claim_secret: requiredText(created.claim_secret, 'claim_secret'),
      manual_code: requiredText(created.manual_code, 'manual_code'),
      broker_url: requiredText(created.broker_url, 'broker_url'),
      expires_at: requiredText(created.expires_at, 'expires_at'),
      state: 'reserved',
      authentication_string: null,
    };
    this.pendingPairings.set(pairing.pair_id, pairing);
    this.emitState();
    return this.publicState();
  }

  async pollPairing(pairId: string): Promise<RemoteCompanionState> {
    await this.ensureLoaded();
    const pairing = this.pendingPairings.get(requiredText(pairId, 'pair_id'));
    if (!pairing) throw new Error('Remote pairing is no longer pending.');
    const response = await this.broker.readPairing(pairing.pair_id, pairing.desktop_pair_token);
    this.assertBrokerProtocol(response);
    pairing.state = response.state;
    pairing.authentication_string = response.authentication_string;
    if (response.state === 'active') await this.activatePairing(pairing, response);
    if (response.state === 'expired' || response.state === 'revoked') this.pendingPairings.delete(pairing.pair_id);
    this.emitState();
    return this.publicState();
  }

  async confirmPairing(input: { pair_id: string; authentication_string: string }): Promise<RemoteCompanionState> {
    await this.ensureLoaded();
    const pairing = this.pendingPairings.get(requiredText(input.pair_id, 'pair_id'));
    if (!pairing) throw new Error('Remote pairing is no longer pending.');
    const value = requiredText(input.authentication_string, 'authentication_string');
    if (!pairing.authentication_string || value !== pairing.authentication_string) {
      throw new Error('Remote pairing authentication string does not match.');
    }
    const response = await this.broker.confirmPairing(pairing.pair_id, pairing.desktop_pair_token, value);
    this.assertBrokerProtocol(response);
    pairing.state = response.state;
    this.emitState();
    return this.publicState();
  }

  async revokePair(input: RemoteRevokePairingRequest): Promise<RemoteCompanionState> {
    await this.ensureLoaded();
    const pairId = requiredText(input.pair_id, 'pair_id');
    const pending = this.pendingPairings.get(pairId);
    const record = this.credentials.get(pairId);
    if (record && record.state !== 'active') throw new Error('Remote pair revocation is already in progress.');
    const bearerToken = record?.device_credential ?? pending?.desktop_pair_token;
    if (!bearerToken) throw new Error('Remote pair credentials are unavailable.');
    if (record) {
      record.state = 'revoking';
      await this.persistCredentials();
    } else if (pending) {
      pending.state = 'revoking';
      this.emitState();
    }
    try {
      const response = await this.broker.revokePair(pairId, bearerToken);
      this.assertBrokerProtocol(response);
      const terminal = await this.waitForRevocation(response, pairId);
      if (
        !terminal ||
        !terminal.desktop_provider_identity_absent ||
        !terminal.ios_provider_identity_absent ||
        !terminal.seat_released
      ) {
        throw new Error('Remote pair revocation did not reach the provider-absence terminal state.');
      }
    } catch (error) {
      if (record) {
        record.state = 'active';
        await this.persistCredentials();
      } else if (pending) {
        pending.state = 'reserved';
        this.emitState();
      }
      throw error;
    }
    await this.transport.disconnect(pairId);
    this.credentials.delete(pairId);
    this.pendingPairings.delete(pairId);
    this.refreshRequired.delete(pairId);
    await this.persistCredentials();
    this.emitState();
    return this.publicState();
  }

  async refreshPair(pairId: string): Promise<RemoteCompanionState> {
    await this.ensureLoaded();
    const record = this.credentials.get(requiredText(pairId, 'pair_id'));
    if (!record || record.state !== 'active') throw new Error('Remote pair credentials are unavailable.');
    const credentials = await this.broker.refreshProviderCredentials(
      record.pair_id,
      record.device_credential,
      record.desktop_device_id
    );
    this.assertProviderCredentials(credentials);
    record.sdk_app_id = credentials.sdk_app_id;
    record.provider_user_id = credentials.provider_user_id;
    record.peer_provider_user_id = credentials.peer_provider_user_id;
    record.usersig_expires_at = credentials.usersig_expires_at;
    await this.transport.connect(record.pair_id, credentials);
    this.refreshRequired.delete(record.pair_id);
    await this.persistCredentials();
    this.emitState();
    return this.publicState();
  }

  async executeAction(request: RemoteActionRequest): Promise<RemoteActionResponse> {
    await this.ensureLoaded();
    const record = this.credentials.get(requiredText(request.pair_id, 'pair_id'));
    if (!record || record.state !== 'active') throw new Error('Remote pair is not active.');
    if (request.key_epoch !== record.key_epoch) throw new Error('Remote pair key epoch is stale.');
    const cached = this.requestDedupe.get(record.pair_id, record.key_epoch, request.request_id);
    if (cached) return clone(cached as RemoteActionResponse);
    if (this.refreshRequired.has(record.pair_id) && request.action_id !== 'canonical_task.refresh') {
      return {
        request_id: request.request_id,
        accepted: false,
        action_id: request.action_id,
        payload: {},
        error_code: 'canonical_refresh_required',
        refresh_required: true,
      };
    }
    try {
      const response = await this.canonical.execute(request);
      if (request.action_id === 'canonical_task.refresh') this.refreshRequired.delete(record.pair_id);
      this.requestDedupe.set(record.pair_id, record.key_epoch, request.request_id, response);
      await this.persistCredentials();
      return clone(response);
    } catch (error) {
      const response: RemoteActionResponse = {
        request_id: request.request_id,
        accepted: false,
        action_id: request.action_id,
        payload: {},
        error_code: error instanceof RemoteActionDispatchError ? error.code : 'canonical_failure',
        refresh_required: this.refreshRequired.has(record.pair_id),
      };
      this.requestDedupe.set(record.pair_id, record.key_epoch, request.request_id, response);
      return response;
    }
  }

  markUnknownResult(pairId: string): void {
    this.refreshRequired.add(requiredText(pairId, 'pair_id'));
    this.emitState();
  }

  async handleIncomingMessage(message: {
    pair_id: string;
    sender_device_id: string;
    envelope: RemoteTransportEnvelope;
  }): Promise<void> {
    const pairId = requiredText(message.pair_id, 'pair_id');
    const record = this.credentials.get(pairId);
    if (!record || record.state !== 'active') return;
    const envelope = validateEnvelope(message.envelope);
    if (
      envelope.pair_id !== pairId ||
      envelope.sender_device_id !== message.sender_device_id ||
      envelope.recipient_device_id !== record.desktop_device_id ||
      envelope.key_epoch !== record.key_epoch
    ) {
      throw new RemoteProtocolError('invalid_envelope', 'Remote envelope does not target this active pair.');
    }
    if (!record.peer_public_key) throw new Error('Remote peer public key is unavailable; refusing plaintext fallback.');
    const keys = deriveDirectionalKeys(record.desktop_key_material, record.peer_public_key, pairId, record.key_epoch);
    const payload = decryptPayload({ key: keys.ios_to_desktop, envelope, direction: 'ios_to_desktop' });
    const replay = this.replayGuard.reserve(envelope);
    record.last_inbound_sequence = envelope.sender_sequence;
    record.seen_inbound_nonces = [...(record.seen_inbound_nonces ?? []), envelope.nonce].slice(-256);
    await this.persistCredentials();
    if (replay.gap) this.markUnknownResult(pairId);
    const command = validateEncryptedPayload(payload);
    if (command.kind !== 'command') return;
    const response = await this.executeAction({
      pair_id: pairId,
      key_epoch: record.key_epoch,
      request_id: command.request_id,
      action_id: command.action_id,
      canonical_thread_id: command.canonical_thread_id,
      payload: command.payload,
    });
    const events: Array<Extract<RemoteEncryptedPayload, { kind: 'event' }>> = [
      {
        kind: 'event',
        event_id: randomUUID(),
        request_id: response.request_id,
        event_type: response.accepted ? 'action.accepted' : 'action.rejected',
        payload: response.accepted
          ? { action_id: response.action_id }
          : {
              action_id: response.action_id,
              error_code: response.error_code ?? 'canonical_failure',
              refresh_required: response.refresh_required === true,
            },
      },
    ];
    if (response.accepted) {
      try {
        events.push(
          ...(
            await this.canonical.project(
              {
                pair_id: pairId,
                key_epoch: record.key_epoch,
                request_id: command.request_id,
                action_id: command.action_id,
                canonical_thread_id: command.canonical_thread_id,
                payload: command.payload,
              },
              response
            )
          ).map((event) => ({ kind: 'event' as const, event_id: randomUUID(), ...event }))
        );
      } catch {
        this.markUnknownResult(pairId);
      }
    }
    await this.enqueueEvents(record, events);
  }

  dispose(): void {
    this.transportOff?.();
    this.transportOff = null;
    this.canonicalOff?.();
    this.canonicalOff = null;
    this.listeners.clear();
  }

  private async handleCanonicalEvent(event: RemoteProjectionEvent): Promise<void> {
    await this.ensureLoaded();
    const record = [...this.credentials.values()].find((candidate) => candidate.state === 'active');
    if (!record) return;
    try {
      await this.enqueueEvents(record, [
        {
          kind: 'event',
          event_id: randomUUID(),
          event_type: event.event_type,
          payload: event.payload,
        },
      ]);
    } catch {
      this.markUnknownResult(record.pair_id);
    }
  }

  private async sendEvent(
    record: RemoteCredentialRecord,
    payload: Extract<RemoteEncryptedPayload, { kind: 'event' }>
  ): Promise<void> {
    if (!record.peer_public_key) throw new Error('Remote peer public key is unavailable.');
    const keys = deriveDirectionalKeys(
      record.desktop_key_material,
      record.peer_public_key,
      record.pair_id,
      record.key_epoch
    );
    const nextSequence = record.desktop_sender_sequence + 1;
    record.desktop_sender_sequence = nextSequence;
    await this.persistCredentials();
    try {
      const envelope = encryptPayload({
        key: keys.desktop_to_ios,
        pair_id: record.pair_id,
        sender_device_id: record.desktop_device_id,
        recipient_device_id: record.peer_device_id,
        key_epoch: record.key_epoch,
        sender_sequence: nextSequence,
        direction: 'desktop_to_ios',
        payload,
      });
      await this.transport.send(record.pair_id, envelope);
    } catch {
      this.markUnknownResult(record.pair_id);
      throw new Error('Remote event delivery returned an unknown terminal result.');
    }
  }

  private enqueueEvents(
    record: RemoteCredentialRecord,
    events: Array<Extract<RemoteEncryptedPayload, { kind: 'event' }>>
  ): Promise<void> {
    const next = this.eventSendQueue.then(async () => {
      for (const event of events) {
        await this.sendEvent(record, event);
      }
    });
    this.eventSendQueue = next.catch((): void => undefined);
    return next;
  }

  private async activatePairing(pairing: PendingPairing, response: BrokerReadPairingResponse): Promise<void> {
    const activation = response.device_activation;
    if (!activation || activation.device_id !== pairing.desktop_device_id) return;
    const deviceCredential = pairing.desktop_pair_token;
    const deviceLabel = activation.device_label;
    const peerDeviceId = activation.peer_device_id;
    const peerDeviceLabel = activation.peer_device_label;
    const providerUserId = activation.provider_user_id;
    const peerProviderUserId = activation.peer_provider_user_id;
    const peerPublicKey = activation.peer_public_key;
    const sdkAppId = activation.sdk_app_id;
    const usersig = activation.usersig;
    if (
      !deviceCredential ||
      !deviceLabel ||
      !peerDeviceId ||
      !peerDeviceLabel ||
      !providerUserId ||
      !peerProviderUserId ||
      !peerPublicKey ||
      !isValidRemoteSdkAppId(sdkAppId) ||
      !usersig ||
      !activation.usersig_expires_at
    )
      return;
    if (this.activePairCount() >= REMOTE_COMPANION_MAX_ACTIVE_PAIRS) {
      throw new Error('This desktop already has an active OPL Link pair.');
    }
    const record: RemoteCredentialRecord = {
      pair_id: pairing.pair_id,
      desktop_device_id: pairing.desktop_device_id,
      desktop_label: deviceLabel,
      peer_device_id: peerDeviceId,
      peer_device_label: peerDeviceLabel,
      state: 'active',
      authentication_string: pairing.authentication_string ?? '',
      key_epoch: 1,
      desktop_key_material: pairing.desktop_key_material,
      peer_public_key: peerPublicKey,
      desktop_sender_sequence: 0,
      device_credential: deviceCredential,
      provider_user_id: providerUserId,
      peer_provider_user_id: peerProviderUserId,
      sdk_app_id: sdkAppId,
      usersig_expires_at: activation.usersig_expires_at,
    };
    this.credentials.set(record.pair_id, record);
    await this.persistCredentials();
    try {
      await this.transport.connect(pairing.pair_id, {
        provider: 'tencent_cloud_im',
        sdk_app_id: sdkAppId,
        provider_user_id: providerUserId,
        peer_provider_user_id: peerProviderUserId,
        usersig,
        usersig_expires_at: activation.usersig_expires_at,
      });
    } catch {
      // Keep the active credential encrypted on disk; the provider adapter can
      // be retried through refreshPair once the SDK boundary is available.
    }
    this.pendingPairings.delete(pairing.pair_id);
  }

  private async waitForRevocation(
    response: BrokerRevokePairingResponse,
    pairId: string
  ): Promise<BrokerRevocationResponse | null> {
    for (let attempt = 0; attempt < this.revokePollAttempts; attempt += 1) {
      // Revocation readback must remain ordered so an earlier provider state cannot be skipped.
      // eslint-disable-next-line no-await-in-loop
      const status = await this.broker.readRevocation(
        response.revocation_receipt_id,
        response.revocation_receipt_token
      );
      this.assertBrokerProtocol(status);
      if (
        status.pairing_id === pairId &&
        status.state === 'revoked' &&
        status.desktop_provider_identity_absent &&
        status.ios_provider_identity_absent &&
        status.seat_released
      ) {
        return status;
      }
      // eslint-disable-next-line no-await-in-loop
      await this.sleep(this.revokePollIntervalMs);
    }
    return null;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const records = await this.credentialStore.list();
      for (const record of records) {
        this.credentials.set(record.pair_id, record);
        this.replayGuard.prime({
          pair_id: record.pair_id,
          key_epoch: record.key_epoch,
          sender_device_id: record.peer_device_id,
          last_sequence: record.last_inbound_sequence ?? 0,
          nonces: record.seen_inbound_nonces,
        });
      }
    } catch {
      this.credentialStoreUnavailable = true;
    }
  }

  private async persistCredentials(): Promise<void> {
    try {
      await this.credentialStore.replace([...this.credentials.values()]);
      this.credentialStoreUnavailable = false;
    } catch {
      this.credentialStoreUnavailable = true;
      throw new Error('Protected OPL Link credential storage is unavailable.');
    }
  }

  private assertConfigured(): void {
    if (!this.brokerConfig.baseUrl) throw new Error('Remote broker is not configured.');
    if (this.credentialStoreUnavailable) throw new Error('Protected OPL Link credential storage is unavailable.');
  }

  private activePairCount(): number {
    return [...this.credentials.values()].filter((record) => ACTIVE_STATES.has(record.state)).length;
  }

  private publicState(): RemoteCompanionState {
    const pairs = [...this.credentials.values()].map((record) => this.publicPair(record));
    const pairing = [...this.pendingPairings.values()][0];
    const pending: RemotePairingSessionPublicState | null = pairing
      ? {
          pair_id: pairing.pair_id,
          desktop_label: pairing.desktop_label,
          state: pairing.state,
          manual_code: pairing.manual_code,
          qr_url: this.qrUrl(pairing),
          authentication_string: pairing.authentication_string,
          expires_at: pairing.expires_at,
        }
      : null;
    return {
      schema: 'opl_remote_companion_desktop_state.v1',
      configured: Boolean(this.brokerConfig.baseUrl && !this.credentialStoreUnavailable),
      provider: 'tencent_cloud_im',
      max_active_pairs: REMOTE_COMPANION_MAX_ACTIVE_PAIRS,
      pairs,
      pairing: pending,
      unavailable_reason: this.credentialStoreUnavailable
        ? 'credential_store_unavailable'
        : !this.brokerConfig.baseUrl
          ? 'broker_not_configured'
          : null,
    };
  }

  private publicPair(record: RemoteCredentialRecord): RemotePairingPublicState {
    return {
      pair_id: record.pair_id,
      desktop_device_id: record.desktop_device_id,
      desktop_label: record.desktop_label,
      peer_device_id: record.peer_device_id,
      peer_device_label: record.peer_device_label,
      state: record.state,
      authentication_string: record.authentication_string,
      expires_at: record.usersig_expires_at ?? nowIso(this.now),
      key_epoch: record.key_epoch,
      projection_stale: this.refreshRequired.has(record.pair_id),
      provider: 'tencent_cloud_im',
      usersig_expires_at: record.usersig_expires_at,
    };
  }

  private qrUrl(pairing: PendingPairing): string {
    if (this.pairingQrClaimUsed.has(pairing.pair_id) || pairing.state !== 'reserved') return '';
    return buildPairingQrUrl({
      broker_url: pairing.broker_url,
      pairing_id: pairing.pair_id,
      claim_secret: pairing.claim_secret,
      desktop_public_key: pairing.desktop_public_key,
      expires_at: pairing.expires_at,
    });
  }

  private emitState(): void {
    const state = this.publicState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch {
        // UI listeners must never break main-process transport handling.
      }
    }
  }

  private async handleIncomingTransportMessage(message: {
    pair_id: string;
    sender_device_id: string;
    envelope: RemoteTransportEnvelope;
  }): Promise<void> {
    try {
      await this.handleIncomingMessage(message);
    } catch {
      // A provider message is untrusted input. Do not log its body or secrets.
    }
  }

  private assertBrokerProtocol(value: { protocol_version?: unknown }): void {
    if (value.protocol_version !== REMOTE_COMPANION_PROTOCOL_VERSION) {
      throw new Error('Remote broker returned an unsupported protocol version.');
    }
  }

  private assertProviderCredentials(value: RemoteProviderCredentialProjection): void {
    if (
      value.provider !== 'tencent_cloud_im' ||
      !isValidRemoteSdkAppId(value.sdk_app_id) ||
      !value.provider_user_id ||
      !value.peer_provider_user_id ||
      !value.usersig ||
      !value.usersig_expires_at
    ) {
      throw new Error('Remote broker returned invalid provider credentials.');
    }
  }
}

export const __remoteCompanionServiceTest = {
  ACTIVE_STATES,
  clone,
};
