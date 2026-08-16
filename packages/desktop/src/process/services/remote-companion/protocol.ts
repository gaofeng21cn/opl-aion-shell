import {
  REMOTE_COMPANION_ALLOWED_ACTIONS,
  REMOTE_COMPANION_ALLOWED_EVENT_TYPES,
  REMOTE_COMPANION_MAX_MESSAGE_BYTES,
  REMOTE_COMPANION_PAIRING_HOST,
  REMOTE_COMPANION_PROTOCOL_VERSION,
  REMOTE_COMPANION_URL_SCHEME,
  type RemoteChannelDirection,
  type RemoteCompanionActionId,
  type RemoteCompanionEventType,
  type RemoteEncryptedPayload,
  type RemoteTransportEnvelope,
} from '@/common/types/remoteCompanion';

const ACTIONS = new Set<string>(REMOTE_COMPANION_ALLOWED_ACTIONS);
const EVENTS = new Set<string>(REMOTE_COMPANION_ALLOWED_EVENT_TYPES);

export class RemoteProtocolError extends Error {
  readonly code:
    | 'invalid_request'
    | 'unsupported_protocol'
    | 'message_too_large'
    | 'unknown_action'
    | 'unknown_event'
    | 'invalid_envelope'
    | 'invalid_payload'
    | 'invalid_qr';

  constructor(code: RemoteProtocolError['code'], message: string) {
    super(message);
    this.name = 'RemoteProtocolError';
    this.code = code;
  }
}

export function assertProtocolVersion(value: unknown): asserts value is typeof REMOTE_COMPANION_PROTOCOL_VERSION {
  if (value !== REMOTE_COMPANION_PROTOCOL_VERSION) {
    throw new RemoteProtocolError('unsupported_protocol', 'Unsupported OPL Link transport protocol.');
  }
}

export function assertOpaqueId(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 256 || /\s/.test(value)) {
    throw new RemoteProtocolError('invalid_request', `Invalid ${field}.`);
  }
  return value;
}

export function assertActionId(value: unknown): asserts value is RemoteCompanionActionId {
  if (typeof value !== 'string' || !ACTIONS.has(value)) {
    throw new RemoteProtocolError('unknown_action', 'The requested remote action is not supported.');
  }
}

export function assertEventType(value: unknown): asserts value is RemoteCompanionEventType {
  if (typeof value !== 'string' || !EVENTS.has(value)) {
    throw new RemoteProtocolError('unknown_event', 'The received remote event is not supported.');
  }
}

export function assertSequence(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new RemoteProtocolError('invalid_envelope', 'Sender sequence must start at one.');
  }
  return value as number;
}

export function assertKeyEpoch(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RemoteProtocolError('invalid_envelope', 'Invalid remote key epoch.');
  }
  return value as number;
}

export function assertBase64Url(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 100_000 ||
    !/^[A-Za-z0-9_-]+$/.test(value) ||
    value.includes('=')
  ) {
    throw new RemoteProtocolError('invalid_envelope', `Invalid ${field}.`);
  }
  return value;
}

export function validateEnvelope(value: unknown): RemoteTransportEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RemoteProtocolError('invalid_envelope', 'Remote transport envelope must be an object.');
  }
  const input = value as Record<string, unknown>;
  const expectedFields = [
    'protocol_version',
    'pair_id',
    'sender_device_id',
    'recipient_device_id',
    'key_epoch',
    'sender_sequence',
    'nonce',
    'ciphertext',
  ];
  if (Object.keys(input).some((key) => !expectedFields.includes(key))) {
    throw new RemoteProtocolError('invalid_envelope', 'Remote transport envelope has unknown fields.');
  }
  assertProtocolVersion(input.protocol_version);
  const pairId = assertOpaqueId(input.pair_id, 'pair_id');
  const senderDeviceId = assertOpaqueId(input.sender_device_id, 'sender_device_id');
  const recipientDeviceId = assertOpaqueId(input.recipient_device_id, 'recipient_device_id');
  if (senderDeviceId === recipientDeviceId) {
    throw new RemoteProtocolError('invalid_envelope', 'Remote transport sender and recipient must differ.');
  }
  return {
    protocol_version: REMOTE_COMPANION_PROTOCOL_VERSION,
    pair_id: pairId,
    sender_device_id: senderDeviceId,
    recipient_device_id: recipientDeviceId,
    key_epoch: assertKeyEpoch(input.key_epoch),
    sender_sequence: assertSequence(input.sender_sequence),
    nonce: assertBase64Url(input.nonce, 'nonce'),
    ciphertext: assertBase64Url(input.ciphertext, 'ciphertext'),
  };
}

export function validateEncryptedPayload(value: unknown): RemoteEncryptedPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RemoteProtocolError('invalid_payload', 'Encrypted remote payload must be an object.');
  }
  const input = value as Record<string, unknown>;
  if (input.kind === 'command') {
    if (typeof input.request_id !== 'string' || input.request_id.length < 8) {
      throw new RemoteProtocolError('invalid_payload', 'Remote command request_id is required.');
    }
    assertActionId(input.action_id);
    if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) {
      throw new RemoteProtocolError('invalid_payload', 'Remote command payload must be an object.');
    }
    if (input.canonical_thread_id !== undefined && typeof input.canonical_thread_id !== 'string') {
      throw new RemoteProtocolError('invalid_payload', 'Invalid canonical_thread_id.');
    }
    const canonicalThreadId = input.canonical_thread_id;
    return {
      kind: 'command',
      request_id: input.request_id,
      action_id: input.action_id,
      ...(typeof canonicalThreadId === 'string' && canonicalThreadId ? { canonical_thread_id: canonicalThreadId } : {}),
      payload: input.payload as Record<string, unknown>,
    };
  }
  if (input.kind === 'event') {
    if (typeof input.event_id !== 'string' || input.event_id.length < 8) {
      throw new RemoteProtocolError('invalid_payload', 'Remote event event_id is required.');
    }
    assertEventType(input.event_type);
    if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) {
      throw new RemoteProtocolError('invalid_payload', 'Remote event payload must be an object.');
    }
    if (input.request_id !== undefined && typeof input.request_id !== 'string') {
      throw new RemoteProtocolError('invalid_payload', 'Invalid remote event request_id.');
    }
    if (input.canonical_revision !== undefined && !Number.isSafeInteger(input.canonical_revision)) {
      throw new RemoteProtocolError('invalid_payload', 'Invalid canonical_revision.');
    }
    const requestId = input.request_id;
    return {
      kind: 'event',
      event_id: input.event_id,
      ...(typeof requestId === 'string' && requestId ? { request_id: requestId } : {}),
      event_type: input.event_type,
      ...(input.canonical_revision !== undefined ? { canonical_revision: input.canonical_revision as number } : {}),
      payload: input.payload as Record<string, unknown>,
    };
  }
  throw new RemoteProtocolError('invalid_payload', 'Unknown encrypted remote payload kind.');
}

export function associatedData(
  envelope: Pick<
    RemoteTransportEnvelope,
    'protocol_version' | 'pair_id' | 'sender_device_id' | 'recipient_device_id' | 'key_epoch'
  >,
  direction: RemoteChannelDirection
): Buffer {
  const fields: Array<[string, string]> = [
    ['protocol_version', envelope.protocol_version],
    ['pair_id', envelope.pair_id],
    ['sender_device_id', envelope.sender_device_id],
    ['recipient_device_id', envelope.recipient_device_id],
    ['key_epoch', String(envelope.key_epoch)],
    ['channel_direction', direction],
  ];
  return Buffer.from(
    fields.map(([name, value]) => `${name}=${Buffer.byteLength(value, 'utf8')}:${value}`).join('|'),
    'utf8'
  );
}

export function serializeEnvelope(envelope: RemoteTransportEnvelope): string {
  const validated = validateEnvelope(envelope);
  const serialized = JSON.stringify(validated);
  if (Buffer.byteLength(serialized, 'utf8') > REMOTE_COMPANION_MAX_MESSAGE_BYTES) {
    throw new RemoteProtocolError('message_too_large', 'Remote transport message is too large.');
  }
  return serialized;
}

export function buildPairingQrUrl(input: {
  broker_url: string;
  pairing_id: string;
  claim_secret: string;
  desktop_public_key: string;
  expires_at: string;
}): string {
  const brokerUrl = new URL(input.broker_url);
  if (brokerUrl.protocol !== 'https:') {
    throw new RemoteProtocolError('invalid_qr', 'Remote broker URL must use HTTPS.');
  }
  const qr = new URL(`${REMOTE_COMPANION_URL_SCHEME}://${REMOTE_COMPANION_PAIRING_HOST}`);
  qr.searchParams.set('protocol_version', REMOTE_COMPANION_PROTOCOL_VERSION);
  for (const [key, value] of Object.entries(input)) qr.searchParams.set(key, value);
  return qr.toString();
}

export function parsePairingQrUrl(value: string): {
  protocol_version: typeof REMOTE_COMPANION_PROTOCOL_VERSION;
  broker_url: string;
  pairing_id: string;
  claim_secret: string;
  desktop_public_key: string;
  expires_at: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new RemoteProtocolError('invalid_qr', 'Invalid OPL Link pairing QR.');
  }
  if (parsed.protocol !== `${REMOTE_COMPANION_URL_SCHEME}:` || parsed.hostname !== REMOTE_COMPANION_PAIRING_HOST) {
    throw new RemoteProtocolError('invalid_qr', 'Invalid OPL Link pairing QR scheme.');
  }
  const required = [
    'protocol_version',
    'broker_url',
    'pairing_id',
    'claim_secret',
    'desktop_public_key',
    'expires_at',
  ] as const;
  const allowed = new Set<string>(required);
  const keys = [...parsed.searchParams.keys()];
  if (keys.some((key) => !allowed.has(key)) || keys.some((key) => parsed.searchParams.getAll(key).length !== 1)) {
    throw new RemoteProtocolError('invalid_qr', 'OPL Link pairing QR has unsupported fields.');
  }
  const values = Object.fromEntries(required.map((field) => [field, parsed.searchParams.get(field)]));
  if (required.some((field) => !values[field])) {
    throw new RemoteProtocolError('invalid_qr', 'OPL Link pairing QR is missing required fields.');
  }
  assertProtocolVersion(values.protocol_version);
  const brokerUrl = values.broker_url as string;
  let parsedBrokerUrl: URL;
  try {
    parsedBrokerUrl = new URL(brokerUrl);
  } catch {
    throw new RemoteProtocolError('invalid_qr', 'OPL Link pairing broker must use HTTPS.');
  }
  if (parsedBrokerUrl.protocol !== 'https:') {
    throw new RemoteProtocolError('invalid_qr', 'OPL Link pairing broker must use HTTPS.');
  }
  assertOpaqueId(values.pairing_id, 'pairing_id');
  assertOpaqueId(values.claim_secret, 'claim_secret');
  assertBase64Url(values.desktop_public_key, 'desktop_public_key');
  if (Number.isNaN(Date.parse(values.expires_at as string))) {
    throw new RemoteProtocolError('invalid_qr', 'OPL Link pairing QR has an invalid expiry.');
  }
  return {
    protocol_version: REMOTE_COMPANION_PROTOCOL_VERSION,
    broker_url: brokerUrl,
    pairing_id: values.pairing_id as string,
    claim_secret: values.claim_secret as string,
    desktop_public_key: values.desktop_public_key as string,
    expires_at: values.expires_at as string,
  };
}
