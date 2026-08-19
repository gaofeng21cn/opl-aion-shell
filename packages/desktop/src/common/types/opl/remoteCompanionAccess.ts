/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const REMOTE_COMPANION_ACCESS_VIEW_TYPE = 'remote_companion_access' as const;
export const REMOTE_COMPANION_ACCESS_SCHEMA_VERSION = 'opl-app-remote-companion-access.v1' as const;

export const REMOTE_COMPANION_ACCESS_STATES = [
  'unavailable',
  'unpaired',
  'reserving',
  'qr_ready',
  'awaiting_confirmation',
  'active',
  'revoking',
  'attention',
] as const;
export type OplRemoteCompanionAccessState = (typeof REMOTE_COMPANION_ACCESS_STATES)[number];

export const REMOTE_COMPANION_ACCESS_ACTION_KINDS = [
  'pair',
  'confirm',
  'cancel',
  'refresh',
  'retry',
  'rename',
  'revoke',
] as const;
export type OplRemoteCompanionAccessActionKind = (typeof REMOTE_COMPANION_ACCESS_ACTION_KINDS)[number];

export type OplRemoteCompanionAccessActionInput =
  | Record<string, never>
  | { pairing_id: string }
  | { account_id: string };

export type OplRemoteCompanionAccessAction = {
  actionKind: OplRemoteCompanionAccessActionKind;
  commandId: string;
  input: OplRemoteCompanionAccessActionInput;
};

export type OplRemoteCompanionAccessPairing = {
  pairingId: string;
  expiresAtMs: number;
  qrPayload?: string;
  shortCode?: string;
  authenticationString?: string;
};

export type OplRemoteCompanionAccessAccount = {
  accountId: string;
  displayName?: string;
  deviceLabel?: string;
};

type OplRemoteCompanionAccessCommon = {
  schemaVersion: typeof REMOTE_COMPANION_ACCESS_SCHEMA_VERSION;
  actions: OplRemoteCompanionAccessAction[];
  refreshAfterMs?: number;
  reasonCode?: string;
};

export type OplRemoteCompanionAccessResult =
  | (OplRemoteCompanionAccessCommon & {
      status: 'available';
      state: Exclude<OplRemoteCompanionAccessState, 'unavailable'>;
      pairing?: OplRemoteCompanionAccessPairing;
      account?: OplRemoteCompanionAccessAccount;
    })
  | (OplRemoteCompanionAccessCommon & {
      status: 'unavailable';
      state: 'unavailable';
      unavailableReason: string;
    });

export type OplRemoteCompanionAccessSubmissionInput =
  | OplRemoteCompanionAccessActionInput
  | { pairing_id: string; authentication_string: string }
  | { account_id: string; display_name: string };

const MAX_REASON_LENGTH = 256;
const MAX_QR_PAYLOAD_LENGTH = 16_384;
const MAX_DISPLAY_NAME_LENGTH = 128;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(record).every((key) => allowed.has(key));
}

function exactText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' || !value || value.length > maxLength || value !== value.trim()) return null;
  if (/\p{Cc}/u.test(value)) return null;
  return value;
}

function stableId(value: unknown): string | null {
  const text = exactText(value, 128);
  return text && /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u.test(text) ? text : null;
}

function opaqueId(value: unknown): string | null {
  const text = exactText(value, 512);
  return text && !/\s/u.test(text) ? text : null;
}

function integer(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum ? value : null;
}

function actionKind(value: unknown): OplRemoteCompanionAccessActionKind | null {
  return typeof value === 'string' && (REMOTE_COMPANION_ACCESS_ACTION_KINDS as readonly string[]).includes(value)
    ? (value as OplRemoteCompanionAccessActionKind)
    : null;
}

function accessState(value: unknown): OplRemoteCompanionAccessState | null {
  return (REMOTE_COMPANION_ACCESS_STATES as readonly unknown[]).includes(value)
    ? (value as OplRemoteCompanionAccessState)
    : null;
}

function parseActionInput(
  kind: OplRemoteCompanionAccessActionKind,
  value: unknown
): OplRemoteCompanionAccessActionInput | null {
  const input = asRecord(value);
  if (!input) return null;
  if (kind === 'pair' || kind === 'refresh' || kind === 'retry') {
    return Object.keys(input).length === 0 ? {} : null;
  }
  if (kind === 'confirm' || kind === 'cancel') {
    const pairingId = opaqueId(input.pairing_id);
    return pairingId && hasOnlyKeys(input, ['pairing_id']) ? { pairing_id: pairingId } : null;
  }
  const accountId = opaqueId(input.account_id);
  return accountId && hasOnlyKeys(input, ['account_id']) ? { account_id: accountId } : null;
}

function parseAction(value: unknown): OplRemoteCompanionAccessAction | null {
  const action = asRecord(value);
  const kind = actionKind(action?.action_kind);
  const commandId = stableId(action?.command_id);
  if (!action || !kind || !commandId || !hasOnlyKeys(action, ['action_kind', 'command_id', 'input'])) return null;
  const input = parseActionInput(kind, action.input);
  return input ? { actionKind: kind, commandId, input } : null;
}

function parseActions(value: unknown): OplRemoteCompanionAccessAction[] | null {
  if (!Array.isArray(value)) return null;
  const actions = value.flatMap((entry) => {
    const parsed = parseAction(entry);
    return parsed ? [parsed] : [];
  });
  return actions.length === value.length && new Set(actions.map((action) => action.commandId)).size === actions.length
    ? actions
    : null;
}

function parsePairing(value: unknown): OplRemoteCompanionAccessPairing | null {
  const pairing = asRecord(value);
  const pairingId = opaqueId(pairing?.pairing_id);
  const expiresAtMs = integer(pairing?.expires_at_ms);
  if (
    !pairing ||
    !pairingId ||
    expiresAtMs === null ||
    !hasOnlyKeys(pairing, ['pairing_id', 'expires_at_ms', 'qr_payload', 'short_code', 'authentication_string'])
  ) {
    return null;
  }
  const qrPayload = pairing.qr_payload === undefined ? undefined : exactText(pairing.qr_payload, MAX_QR_PAYLOAD_LENGTH);
  if (pairing.qr_payload !== undefined && !qrPayload) return null;
  const shortCode = pairing.short_code === undefined ? undefined : exactText(pairing.short_code, 12);
  if (pairing.short_code !== undefined && (!shortCode || !/^[0-9A-HJKMNP-TV-Z]{12}$/iu.test(shortCode))) return null;
  const authenticationString =
    pairing.authentication_string === undefined ? undefined : exactText(pairing.authentication_string, 7);
  if (
    pairing.authentication_string !== undefined &&
    (!authenticationString || !/^\d{3} \d{3}$/u.test(authenticationString))
  ) {
    return null;
  }
  return {
    pairingId,
    expiresAtMs,
    ...(qrPayload === undefined ? {} : { qrPayload }),
    ...(shortCode === undefined ? {} : { shortCode }),
    ...(authenticationString === undefined ? {} : { authenticationString }),
  };
}

function parseAccount(value: unknown): OplRemoteCompanionAccessAccount | null {
  const account = asRecord(value);
  const accountId = opaqueId(account?.account_id);
  if (!account || !accountId || !hasOnlyKeys(account, ['account_id', 'display_name', 'device_label'])) return null;
  const displayName =
    account.display_name === undefined ? undefined : exactText(account.display_name, MAX_DISPLAY_NAME_LENGTH);
  const deviceLabel =
    account.device_label === undefined ? undefined : exactText(account.device_label, MAX_DISPLAY_NAME_LENGTH);
  if ((account.display_name !== undefined && !displayName) || (account.device_label !== undefined && !deviceLabel))
    return null;
  return {
    accountId,
    ...(displayName === undefined ? {} : { displayName }),
    ...(deviceLabel === undefined ? {} : { deviceLabel }),
  };
}

function isPairingState(state: OplRemoteCompanionAccessState): boolean {
  return state === 'reserving' || state === 'qr_ready' || state === 'awaiting_confirmation';
}

export function readOplRemoteCompanionAccessResult(value: unknown): OplRemoteCompanionAccessResult | null {
  const result = asRecord(value);
  if (!result || result.schema_version !== REMOTE_COMPANION_ACCESS_SCHEMA_VERSION) return null;
  const state = accessState(result.state);
  if (!state) return null;
  const actions = parseActions(result.actions);
  const refreshAfterMs =
    result.refresh_after_ms === undefined ? undefined : integer(result.refresh_after_ms, 86_400_000);
  const reasonCode = result.reason_code === undefined ? undefined : exactText(result.reason_code, MAX_REASON_LENGTH);
  if (
    !actions ||
    (result.refresh_after_ms !== undefined && refreshAfterMs === null) ||
    (result.reason_code !== undefined && !reasonCode)
  ) {
    return null;
  }

  if (state === 'unavailable') {
    if (
      result.status !== 'unavailable' ||
      !hasOnlyKeys(result, [
        'schema_version',
        'status',
        'state',
        'actions',
        'refresh_after_ms',
        'reason_code',
        'unavailable_reason',
      ]) ||
      actions.some((action) => action.actionKind !== 'refresh' && action.actionKind !== 'retry')
    ) {
      return null;
    }
    const unavailableReason = exactText(result.unavailable_reason, MAX_REASON_LENGTH);
    return unavailableReason
      ? {
          schemaVersion: REMOTE_COMPANION_ACCESS_SCHEMA_VERSION,
          status: 'unavailable',
          state,
          unavailableReason,
          actions,
          ...(refreshAfterMs === undefined ? {} : { refreshAfterMs }),
          ...(reasonCode === undefined ? {} : { reasonCode }),
        }
      : null;
  }

  if (
    result.status !== 'available' ||
    !hasOnlyKeys(result, [
      'schema_version',
      'status',
      'state',
      'actions',
      'refresh_after_ms',
      'reason_code',
      'pairing',
      'account',
    ])
  ) {
    return null;
  }
  const pairing = result.pairing === undefined ? undefined : parsePairing(result.pairing);
  const account = result.account === undefined ? undefined : parseAccount(result.account);
  if ((result.pairing !== undefined && !pairing) || (result.account !== undefined && !account)) return null;
  if (isPairingState(state)) {
    if (!pairing || account) return null;
    if (state === 'qr_ready' && (!pairing.qrPayload || !pairing.shortCode || pairing.authenticationString)) return null;
    if (state === 'reserving' && (pairing.qrPayload || pairing.shortCode || pairing.authenticationString)) return null;
    if (state === 'awaiting_confirmation' && (!pairing.authenticationString || pairing.qrPayload || pairing.shortCode))
      return null;
  } else if ((state === 'active' || state === 'revoking') && (!account || pairing)) {
    return null;
  } else if (state === 'unpaired' && (pairing || account)) {
    return null;
  }
  if (state === 'attention' && !reasonCode) return null;
  return {
    schemaVersion: REMOTE_COMPANION_ACCESS_SCHEMA_VERSION,
    status: 'available',
    state,
    actions,
    ...(pairing === undefined ? {} : { pairing }),
    ...(account === undefined ? {} : { account }),
    ...(refreshAfterMs === undefined ? {} : { refreshAfterMs }),
    ...(reasonCode === undefined ? {} : { reasonCode }),
  };
}

export function prepareOplRemoteCompanionAccessActionInput(
  action: OplRemoteCompanionAccessAction,
  pairing?: OplRemoteCompanionAccessPairing,
  displayName?: string
): Record<string, unknown> | null {
  if (action.actionKind === 'confirm') {
    const authenticationString = pairing?.authenticationString;
    return authenticationString ? { ...action.input, authentication_string: authenticationString } : null;
  }
  if (action.actionKind === 'rename') {
    const normalized = typeof displayName === 'string' ? displayName.trim() : '';
    return normalized && normalized.length <= MAX_DISPLAY_NAME_LENGTH
      ? { ...action.input, display_name: normalized }
      : null;
  }
  return action.input;
}
