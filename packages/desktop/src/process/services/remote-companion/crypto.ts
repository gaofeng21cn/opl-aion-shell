import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  type KeyObject,
} from 'node:crypto';
import {
  REMOTE_COMPANION_PROTOCOL_VERSION,
  type RemoteChannelDirection,
  type RemoteEncryptedPayload,
  type RemoteTransportEnvelope,
} from '@/common/types/remoteCompanion';
import {
  associatedData,
  assertBase64Url,
  assertKeyEpoch,
  assertOpaqueId,
  assertSequence,
  validateEncryptedPayload,
  validateEnvelope,
} from './protocol';

const X25519_PUBLIC_DER_PREFIX = Buffer.from('302a300506032b656e032100', 'hex');

export type X25519KeyMaterial = {
  private_key: string;
  public_key: string;
};

export type DirectionalKeys = Record<RemoteChannelDirection, Buffer>;

export function toBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

export function fromBase64Url(value: string, label: string): Buffer {
  assertBase64Url(value, label);
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

export function generateX25519KeyMaterial(): X25519KeyMaterial {
  const { privateKey, publicKey } = generateKeyPairSync('x25519');
  const privateDer = privateKey.export({ format: 'der', type: 'pkcs8' });
  const publicDer = publicKey.export({ format: 'der', type: 'spki' });
  if (!publicDer.subarray(0, X25519_PUBLIC_DER_PREFIX.length).equals(X25519_PUBLIC_DER_PREFIX)) {
    throw new Error('Unexpected X25519 public key encoding.');
  }
  return {
    private_key: toBase64Url(privateDer),
    public_key: toBase64Url(publicDer.subarray(X25519_PUBLIC_DER_PREFIX.length)),
  };
}

function privateKeyFromMaterial(material: X25519KeyMaterial): KeyObject {
  return createPrivateKey({ key: fromBase64Url(material.private_key, 'private_key'), format: 'der', type: 'pkcs8' });
}

function publicKeyFromRaw(value: string): KeyObject {
  const raw = fromBase64Url(value, 'public_key');
  if (raw.length !== 32) throw new Error('X25519 public key must be 32 bytes.');
  return createPublicKey({ key: Buffer.concat([X25519_PUBLIC_DER_PREFIX, raw]), format: 'der', type: 'spki' });
}

export function deriveDirectionalKeys(
  material: X25519KeyMaterial,
  peerPublicKey: string,
  pairId: string,
  keyEpoch: number
): DirectionalKeys {
  const normalizedPairId = assertOpaqueId(pairId, 'pair_id');
  const normalizedEpoch = assertKeyEpoch(keyEpoch);
  const shared = diffieHellman({
    privateKey: privateKeyFromMaterial(material),
    publicKey: publicKeyFromRaw(peerPublicKey),
  });
  const salt = Buffer.from(normalizedPairId, 'utf8');
  const derive = (direction: RemoteChannelDirection) =>
    Buffer.from(
      hkdfSync(
        'sha256',
        shared,
        salt,
        Buffer.from(`${REMOTE_COMPANION_PROTOCOL_VERSION}|key_epoch=${normalizedEpoch}|direction=${direction}`, 'utf8'),
        32
      )
    );
  return {
    desktop_to_ios: derive('desktop_to_ios'),
    ios_to_desktop: derive('ios_to_desktop'),
  };
}

export function authenticationString(pairId: string, desktopPublicKey: string, iosPublicKey: string): string {
  const fields: Array<[string, string]> = [
    ['pair_id', assertOpaqueId(pairId, 'pair_id')],
    ['desktop_public_key', desktopPublicKey],
    ['ios_public_key', iosPublicKey],
  ];
  const digest = createHash('sha256')
    .update(
      Buffer.from(
        fields.map(([name, value]) => `${name}=${Buffer.byteLength(value, 'utf8')}:${value}`).join('|'),
        'utf8'
      )
    )
    .digest();
  const numeric = digest.readUInt32BE(0) % 1_000_000;
  const digits = String(numeric).padStart(6, '0');
  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

export function encryptPayload(input: {
  key: Buffer;
  pair_id: string;
  sender_device_id: string;
  recipient_device_id: string;
  key_epoch: number;
  sender_sequence: number;
  direction: RemoteChannelDirection;
  payload: RemoteEncryptedPayload;
  nonce?: Uint8Array;
}): RemoteTransportEnvelope {
  const nonce = Buffer.from(input.nonce ?? randomBytes(12));
  if (nonce.length !== 12) throw new Error('Remote transport nonce must be 12 bytes.');
  if (input.key.length !== 32) throw new Error('Remote transport key must be 32 bytes.');
  const envelopeBase = {
    protocol_version: REMOTE_COMPANION_PROTOCOL_VERSION,
    pair_id: assertOpaqueId(input.pair_id, 'pair_id'),
    sender_device_id: assertOpaqueId(input.sender_device_id, 'sender_device_id'),
    recipient_device_id: assertOpaqueId(input.recipient_device_id, 'recipient_device_id'),
    key_epoch: assertKeyEpoch(input.key_epoch),
    sender_sequence: assertSequence(input.sender_sequence),
  };
  const cipher = createCipheriv('aes-256-gcm', input.key, nonce);
  cipher.setAAD(associatedData(envelopeBase, input.direction));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(validateEncryptedPayload(input.payload)), 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return validateEnvelope({
    ...envelopeBase,
    nonce: toBase64Url(nonce),
    ciphertext: toBase64Url(ciphertext),
  });
}

export function decryptPayload(input: {
  key: Buffer;
  envelope: RemoteTransportEnvelope;
  direction: RemoteChannelDirection;
}): RemoteEncryptedPayload {
  const envelope = validateEnvelope(input.envelope);
  if (input.key.length !== 32) throw new Error('Remote transport key must be 32 bytes.');
  const nonce = fromBase64Url(envelope.nonce, 'nonce');
  const ciphertext = fromBase64Url(envelope.ciphertext, 'ciphertext');
  if (nonce.length !== 12 || ciphertext.length < 16) throw new Error('Invalid remote transport ciphertext.');
  const decipher = createDecipheriv('aes-256-gcm', input.key, nonce);
  decipher.setAAD(associatedData(envelope, input.direction));
  decipher.setAuthTag(ciphertext.subarray(-16));
  const plaintext = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
  return validateEncryptedPayload(JSON.parse(plaintext.toString('utf8')));
}

type ReplayState = { lastSequence: number; nonces: Set<string> };

export class RemoteReplayGuard {
  private readonly states = new Map<string, ReplayState>();

  prime(input: {
    pair_id: string;
    key_epoch: number;
    sender_device_id: string;
    last_sequence: number;
    nonces?: string[];
  }): void {
    const key = `${assertOpaqueId(input.pair_id, 'pair_id')}\u001f${assertKeyEpoch(input.key_epoch)}\u001f${assertOpaqueId(input.sender_device_id, 'sender_device_id')}`;
    this.states.set(key, {
      lastSequence: Number.isSafeInteger(input.last_sequence) && input.last_sequence >= 0 ? input.last_sequence : 0,
      nonces: new Set((input.nonces ?? []).filter((nonce) => /^[A-Za-z0-9_-]+$/u.test(nonce))),
    });
  }

  reserve(envelope: RemoteTransportEnvelope): { gap: boolean } {
    const normalized = validateEnvelope(envelope);
    const key = `${normalized.pair_id}\u001f${normalized.key_epoch}\u001f${normalized.sender_device_id}`;
    const state = this.states.get(key) ?? { lastSequence: 0, nonces: new Set<string>() };
    const nonce = normalized.nonce;
    if (state.nonces.has(nonce)) throw new Error('REMOTE_REPLAY_NONCE');
    if (normalized.sender_sequence <= state.lastSequence) throw new Error('REMOTE_REPLAY_SEQUENCE');
    if (state.lastSequence === 0 && normalized.sender_sequence !== 1) {
      throw new Error('REMOTE_REPLAY_SEQUENCE_START');
    }
    const gap = state.lastSequence > 0 && normalized.sender_sequence > state.lastSequence + 1;
    state.lastSequence = normalized.sender_sequence;
    state.nonces.add(nonce);
    if (state.nonces.size > 2048) state.nonces.delete(state.nonces.values().next().value as string);
    this.states.set(key, state);
    return { gap };
  }

  reset(): void {
    this.states.clear();
  }
}

export class RemoteRequestDedupe {
  private readonly responses = new Map<string, unknown>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  async run<T>(pairId: string, keyEpoch: number, requestId: string, operation: () => Promise<T>): Promise<T> {
    const key = this.key(pairId, keyEpoch, requestId);
    const cached = this.responses.get(key);
    if (cached !== undefined) return cached as T;
    const existing = this.inFlight.get(key);
    if (existing) return (await existing) as T;

    let promise: Promise<T>;
    try {
      promise = operation();
    } catch (error) {
      promise = Promise.reject(error);
    }
    this.inFlight.set(key, promise);
    void promise.then(
      (response) => {
        this.set(pairId, keyEpoch, requestId, response);
        this.inFlight.delete(key);
      },
      () => {
        this.inFlight.delete(key);
      }
    );
    return promise;
  }

  get(pairId: string, keyEpoch: number, requestId: string): unknown | undefined {
    return this.responses.get(this.key(pairId, keyEpoch, requestId));
  }

  set(pairId: string, keyEpoch: number, requestId: string, response: unknown): void {
    this.responses.set(this.key(pairId, keyEpoch, requestId), response);
    if (this.responses.size > 2048) this.responses.delete(this.responses.keys().next().value as string);
  }

  clear(): void {
    this.responses.clear();
    this.inFlight.clear();
  }

  private key(pairId: string, keyEpoch: number, requestId: string): string {
    return `${pairId}\u001f${keyEpoch}\u001f${requestId}`;
  }
}
