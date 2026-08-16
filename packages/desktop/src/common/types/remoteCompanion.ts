/**
 * OPL Link desktop wire types.
 *
 * This module is deliberately type-only at runtime: the desktop and mobile
 * clients share the names and allowlists, while the main process owns key
 * material, broker credentials, and action dispatch.
 */

export const REMOTE_COMPANION_PROTOCOL_VERSION = 'opl_remote_transport.v1' as const;
export const REMOTE_COMPANION_URL_SCHEME = 'opllink' as const;
export const REMOTE_COMPANION_PAIRING_HOST = 'pair' as const;
export const REMOTE_COMPANION_MAX_MESSAGE_BYTES = 65_536;
export const REMOTE_COMPANION_MAX_ACTIVE_PAIRS = 1;

export const REMOTE_COMPANION_ALLOWED_ACTIONS = [
  'canonical_task.list',
  'canonical_task.read',
  'canonical_task.refresh',
  'canonical_task.start',
  'canonical_task.send_text',
  'canonical_turn.stop',
  'canonical_approval.respond',
  'pair.revoke',
] as const;

export type RemoteCompanionActionId = (typeof REMOTE_COMPANION_ALLOWED_ACTIONS)[number];

export const REMOTE_COMPANION_ALLOWED_EVENT_TYPES = [
  'task.snapshot',
  'task.list_snapshot',
  'thread.snapshot',
  'turn.delta',
  'turn.completed',
  'turn.stopped',
  'approval.requested',
  'approval.resolved',
  'action.accepted',
  'action.rejected',
  'desktop.heartbeat',
  'pair.revoked',
] as const;

export type RemoteCompanionEventType = (typeof REMOTE_COMPANION_ALLOWED_EVENT_TYPES)[number];

export type RemotePairingState =
  | 'reserved'
  | 'claimed'
  | 'awaiting_desktop_confirmation'
  | 'provisioning'
  | 'active'
  | 'revoking'
  | 'provider_reclaim_pending'
  | 'revoked'
  | 'expired';

export type RemoteChannelDirection = 'desktop_to_ios' | 'ios_to_desktop';

export type RemoteTransportEnvelope = {
  protocol_version: typeof REMOTE_COMPANION_PROTOCOL_VERSION;
  pair_id: string;
  sender_device_id: string;
  recipient_device_id: string;
  key_epoch: number;
  sender_sequence: number;
  nonce: string;
  ciphertext: string;
};

export type RemoteCommand = {
  kind: 'command';
  request_id: string;
  action_id: RemoteCompanionActionId;
  canonical_thread_id?: string;
  payload: Record<string, unknown>;
};

export type RemoteEvent = {
  kind: 'event';
  event_id: string;
  request_id?: string;
  event_type: RemoteCompanionEventType;
  canonical_revision?: number;
  payload: Record<string, unknown>;
};

export type RemoteEncryptedPayload = RemoteCommand | RemoteEvent;

export type RemotePairingPublicState = {
  pair_id: string;
  desktop_device_id: string;
  desktop_label: string;
  peer_device_id: string | null;
  peer_device_label: string | null;
  state: RemotePairingState;
  authentication_string: string | null;
  expires_at: string;
  key_epoch: number;
  projection_stale: boolean;
  provider: 'tencent_cloud_im';
  usersig_expires_at: string | null;
};

export type RemotePairingSessionPublicState = {
  pair_id: string;
  desktop_label: string;
  state: RemotePairingState;
  manual_code: string;
  qr_url: string;
  authentication_string: string | null;
  expires_at: string;
};

export type RemoteCompanionState = {
  schema: 'opl_remote_companion_desktop_state.v1';
  configured: boolean;
  provider: 'tencent_cloud_im';
  max_active_pairs: typeof REMOTE_COMPANION_MAX_ACTIVE_PAIRS;
  pairs: RemotePairingPublicState[];
  pairing: RemotePairingSessionPublicState | null;
  unavailable_reason: 'broker_not_configured' | 'credential_store_unavailable' | null;
};

export type RemoteStartPairingRequest = {
  invitation_code: string;
  desktop_label: string;
};

export type RemotePollPairingRequest = { pair_id: string };
export type RemoteConfirmPairingRequest = { pair_id: string; authentication_string: string };
export type RemoteRevokePairingRequest = { pair_id: string };

export type RemoteActionRequest = {
  pair_id: string;
  key_epoch: number;
  request_id: string;
  action_id: RemoteCompanionActionId;
  canonical_thread_id?: string;
  payload: Record<string, unknown>;
};

export type RemoteActionResponse = {
  request_id: string;
  accepted: boolean;
  action_id: RemoteCompanionActionId;
  canonical_revision?: number;
  payload: Record<string, unknown>;
  error_code?: string;
  refresh_required?: boolean;
};

export type RemoteProviderCredentialProjection = {
  provider: 'tencent_cloud_im';
  sdk_app_id: number;
  provider_user_id: string;
  peer_provider_user_id: string;
  usersig: string;
  usersig_expires_at: string;
};

export function isValidRemoteSdkAppId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
