/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const REMOTE_COMPANION_ACCESS_VIEW_TYPE = 'remote_companion_access' as const;
export const REMOTE_COMPANION_ACCESS_SCHEMA_VERSION = 'opl-app-remote-companion-access.v1' as const;

export const REMOTE_COMPANION_ACCESS_STATUSES = [
  'unavailable',
  'unpaired',
  'reserving',
  'qr_ready',
  'awaiting_confirmation',
  'active',
  'revoking',
  'attention',
] as const;
export type OplRemoteCompanionAccessStatus = (typeof REMOTE_COMPANION_ACCESS_STATUSES)[number];

export const REMOTE_COMPANION_ACCESS_ACTION_IDS = [
  'pair.start',
  'pair.refresh',
  'pair.confirm',
  'pair.cancel',
  'device.rename',
  'pair.revoke',
] as const;
export type OplRemoteCompanionAccessActionId = (typeof REMOTE_COMPANION_ACCESS_ACTION_IDS)[number];

export type OplRemoteCompanionAccessPairStartInput = {
  invitation_code: string;
  display_name: string;
};

export type OplRemoteCompanionAccessPairingIdInput = {
  pairing_id: string;
};

export type OplRemoteCompanionAccessPairConfirmInput = {
  pairing_id: string;
  authentication_digits: string;
};

export type OplRemoteCompanionAccessDeviceRenameInput = {
  device_id: string;
  display_name: string;
};

export type OplRemoteCompanionAccessActionInput =
  | OplRemoteCompanionAccessPairStartInput
  | OplRemoteCompanionAccessPairingIdInput
  | OplRemoteCompanionAccessPairConfirmInput
  | OplRemoteCompanionAccessDeviceRenameInput;

export type OplRemoteCompanionAccessAction =
  | { commandId: 'pair.start'; input: OplRemoteCompanionAccessPairStartInput }
  | { commandId: 'pair.refresh'; input: OplRemoteCompanionAccessPairingIdInput }
  | { commandId: 'pair.confirm'; input: OplRemoteCompanionAccessPairConfirmInput }
  | { commandId: 'pair.cancel'; input: OplRemoteCompanionAccessPairingIdInput }
  | { commandId: 'device.rename'; input: OplRemoteCompanionAccessDeviceRenameInput }
  | { commandId: 'pair.revoke'; input: OplRemoteCompanionAccessPairingIdInput };

export type OplRemoteCompanionAccessPairing = {
  pairingId: string;
  manualCode?: string;
  authenticationDigits?: string;
  expiresAt: string;
  qrPayload?: string;
};

export type OplRemoteCompanionAccessDevice = {
  deviceId: string;
  deviceType: 'desktop' | 'mobile';
  displayName: string;
  authorizationState: 'pending' | 'authorized' | 'revoking' | 'revoked' | 'attention';
  lastActivityAt: string | null;
};

type OplRemoteCompanionAccessCommon = {
  schemaVersion: typeof REMOTE_COMPANION_ACCESS_SCHEMA_VERSION;
  status: OplRemoteCompanionAccessStatus;
  actions: OplRemoteCompanionAccessAction[];
  refreshAfterMs?: number;
};

export type OplRemoteCompanionAccessResult = OplRemoteCompanionAccessCommon & {
  unavailableReason?: string;
  pairing?: OplRemoteCompanionAccessPairing;
  devices?: OplRemoteCompanionAccessDevice[];
};

export type OplRemoteCompanionAccessActionInputOverrides = Readonly<{
  invitationCode?: string;
  displayName?: string;
  authenticationDigits?: string;
}>;

const MAX_INVITATION_CODE_LENGTH = 512;
const MAX_DISPLAY_NAME_LENGTH = 256;
const MAX_QR_PAYLOAD_LENGTH = 8_192;
const MAX_REFRESH_AFTER_MS = 60_000;
const MIN_REFRESH_AFTER_MS = 250;
const MAX_ACTIONS = 6;

const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u;
const MANUAL_CODE = /^[0-9A-HJKMNP-TV-Z]{12}$/iu;
const AUTHENTICATION_DIGITS = /^\d{6}$/u;
const STABLE_ID = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(record).every((key) => allowed.has(key));
}

function boundedText(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || /\p{Cc}/u.test(value)) return null;
  return value;
}

function exactOpaqueId(value: unknown): string | null {
  return boundedText(value, 512);
}

function stableId(value: unknown): string | null {
  const text = boundedText(value, 128);
  return text && STABLE_ID.test(text) ? text : null;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 64 || !RFC3339_UTC.test(value)) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function status(value: unknown): OplRemoteCompanionAccessStatus | null {
  return typeof value === 'string' && (REMOTE_COMPANION_ACCESS_STATUSES as readonly string[]).includes(value)
    ? (value as OplRemoteCompanionAccessStatus)
    : null;
}

function parsePairStartInput(value: unknown): OplRemoteCompanionAccessPairStartInput | null {
  const input = asRecord(value);
  const invitationCode = boundedText(input?.invitation_code, MAX_INVITATION_CODE_LENGTH);
  const displayName = boundedText(input?.display_name, MAX_DISPLAY_NAME_LENGTH);
  return input && invitationCode && displayName && hasOnlyKeys(input, ['invitation_code', 'display_name'])
    ? { invitation_code: invitationCode, display_name: displayName }
    : null;
}

function parsePairingIdInput(value: unknown): OplRemoteCompanionAccessPairingIdInput | null {
  const input = asRecord(value);
  const pairingId = exactOpaqueId(input?.pairing_id);
  return input && pairingId && hasOnlyKeys(input, ['pairing_id']) ? { pairing_id: pairingId } : null;
}

function parseConfirmInput(value: unknown): OplRemoteCompanionAccessPairConfirmInput | null {
  const input = asRecord(value);
  const pairingId = exactOpaqueId(input?.pairing_id);
  const authenticationDigits =
    typeof input?.authentication_digits === 'string' && AUTHENTICATION_DIGITS.test(input.authentication_digits)
      ? input.authentication_digits
      : null;
  return input && pairingId && authenticationDigits && hasOnlyKeys(input, ['pairing_id', 'authentication_digits'])
    ? { pairing_id: pairingId, authentication_digits: authenticationDigits }
    : null;
}

function parseRenameInput(value: unknown): OplRemoteCompanionAccessDeviceRenameInput | null {
  const input = asRecord(value);
  const deviceId = exactOpaqueId(input?.device_id);
  const displayName = boundedText(input?.display_name, MAX_DISPLAY_NAME_LENGTH);
  return input && deviceId && displayName && hasOnlyKeys(input, ['device_id', 'display_name'])
    ? { device_id: deviceId, display_name: displayName }
    : null;
}

function parseAction(value: unknown): OplRemoteCompanionAccessAction | null {
  const action = asRecord(value);
  if (!action || !hasOnlyKeys(action, ['command_id', 'input'])) return null;
  switch (action.command_id) {
    case 'pair.start': {
      const input = parsePairStartInput(action.input);
      return input ? { commandId: 'pair.start', input } : null;
    }
    case 'pair.refresh': {
      const input = parsePairingIdInput(action.input);
      return input ? { commandId: 'pair.refresh', input } : null;
    }
    case 'pair.confirm': {
      const input = parseConfirmInput(action.input);
      return input ? { commandId: 'pair.confirm', input } : null;
    }
    case 'pair.cancel': {
      const input = parsePairingIdInput(action.input);
      return input ? { commandId: 'pair.cancel', input } : null;
    }
    case 'device.rename': {
      const input = parseRenameInput(action.input);
      return input ? { commandId: 'device.rename', input } : null;
    }
    case 'pair.revoke': {
      const input = parsePairingIdInput(action.input);
      return input ? { commandId: 'pair.revoke', input } : null;
    }
    default:
      return null;
  }
}

function parseActions(value: unknown): OplRemoteCompanionAccessAction[] | null {
  if (!Array.isArray(value) || value.length > MAX_ACTIONS) return null;
  const actions = value.map(parseAction);
  if (actions.some((action): action is null => action === null)) return null;
  const parsed = actions as OplRemoteCompanionAccessAction[];
  return new Set(parsed.map((action) => action.commandId)).size === parsed.length ? parsed : null;
}

function parsePairing(value: unknown): OplRemoteCompanionAccessPairing | null {
  const pairing = asRecord(value);
  const pairingId = exactOpaqueId(pairing?.pairing_id);
  const expiresAt = timestamp(pairing?.expires_at);
  if (
    !pairing ||
    !pairingId ||
    !expiresAt ||
    !hasOnlyKeys(pairing, ['pairing_id', 'manual_code', 'authentication_digits', 'expires_at', 'qr_payload'])
  ) {
    return null;
  }
  const manualCode = pairing.manual_code === undefined ? undefined : boundedText(pairing.manual_code, 12);
  if (pairing.manual_code !== undefined && (!manualCode || !MANUAL_CODE.test(manualCode))) return null;
  const authenticationDigits =
    pairing.authentication_digits === undefined ? undefined : boundedText(pairing.authentication_digits, 6);
  if (
    pairing.authentication_digits !== undefined &&
    (!authenticationDigits || !AUTHENTICATION_DIGITS.test(authenticationDigits))
  ) {
    return null;
  }
  const qrPayload =
    pairing.qr_payload === undefined ? undefined : boundedText(pairing.qr_payload, MAX_QR_PAYLOAD_LENGTH);
  if (pairing.qr_payload !== undefined && !qrPayload) return null;
  return {
    pairingId,
    expiresAt,
    ...(manualCode === undefined ? {} : { manualCode }),
    ...(authenticationDigits === undefined ? {} : { authenticationDigits }),
    ...(qrPayload === undefined ? {} : { qrPayload }),
  };
}

function parseDevice(value: unknown): OplRemoteCompanionAccessDevice | null {
  const device = asRecord(value);
  const deviceId = exactOpaqueId(device?.device_id);
  const displayName = boundedText(device?.display_name, MAX_DISPLAY_NAME_LENGTH);
  const rawLastActivityAt = device?.last_activity_at;
  const lastActivityAt = rawLastActivityAt === null ? null : timestamp(rawLastActivityAt);
  if (
    !device ||
    !deviceId ||
    (device.device_type !== 'desktop' && device.device_type !== 'mobile') ||
    !displayName ||
    !['pending', 'authorized', 'revoking', 'revoked', 'attention'].includes(String(device.authorization_state)) ||
    (rawLastActivityAt !== null && !lastActivityAt) ||
    !hasOnlyKeys(device, ['device_id', 'device_type', 'display_name', 'authorization_state', 'last_activity_at'])
  ) {
    return null;
  }
  return {
    deviceId,
    deviceType: device.device_type,
    displayName,
    authorizationState: device.authorization_state as OplRemoteCompanionAccessDevice['authorizationState'],
    lastActivityAt,
  };
}

function parseDevices(value: unknown): OplRemoteCompanionAccessDevice[] | null {
  if (!Array.isArray(value) || value.length > 2) return null;
  const devices = value.map(parseDevice);
  if (devices.some((device): device is null => device === null)) return null;
  const parsed = devices as OplRemoteCompanionAccessDevice[];
  return new Set(parsed.map((device) => device.deviceId)).size === parsed.length ? parsed : null;
}

function parseRefreshAfterMs(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= MIN_REFRESH_AFTER_MS &&
    value <= MAX_REFRESH_AFTER_MS
    ? value
    : null;
}

function hasRequiredPairingShape(
  currentStatus: OplRemoteCompanionAccessStatus,
  pairing: OplRemoteCompanionAccessPairing | undefined
): boolean {
  if (currentStatus === 'qr_ready') {
    return Boolean(pairing?.manualCode && pairing.qrPayload && !pairing.authenticationDigits);
  }
  if (currentStatus === 'awaiting_confirmation') {
    return Boolean(pairing?.authenticationDigits && !pairing.manualCode && !pairing.qrPayload);
  }
  if (currentStatus === 'reserving' || currentStatus === 'attention') {
    return pairing === undefined || (!pairing.manualCode && !pairing.authenticationDigits && !pairing.qrPayload);
  }
  if (currentStatus === 'active' || currentStatus === 'revoking') {
    return Boolean(pairing && !pairing.manualCode && !pairing.authenticationDigits && !pairing.qrPayload);
  }
  return true;
}

export function readOplRemoteCompanionAccessResult(value: unknown): OplRemoteCompanionAccessResult | null {
  const result = asRecord(value);
  const currentStatus = status(result?.status);
  const actions = parseActions(result?.actions);
  const refreshAfterMs = parseRefreshAfterMs(result?.refresh_after_ms);
  if (
    !result ||
    result.schema_version !== REMOTE_COMPANION_ACCESS_SCHEMA_VERSION ||
    !currentStatus ||
    !actions ||
    refreshAfterMs === null
  ) {
    return null;
  }
  const pairing = result.pairing === undefined ? undefined : parsePairing(result.pairing);
  const devices = result.devices === undefined ? undefined : parseDevices(result.devices);
  if ((result.pairing !== undefined && !pairing) || (result.devices !== undefined && !devices)) return null;

  if (currentStatus === 'unavailable' || currentStatus === 'unpaired') {
    const unavailableReason = result.unavailable_reason === undefined ? undefined : stableId(result.unavailable_reason);
    if (
      (currentStatus === 'unavailable' && !unavailableReason) ||
      (currentStatus === 'unpaired' && unavailableReason !== undefined) ||
      pairing ||
      devices ||
      !hasOnlyKeys(result, ['schema_version', 'status', 'unavailable_reason', 'actions', 'refresh_after_ms'])
    ) {
      return null;
    }
    return {
      schemaVersion: REMOTE_COMPANION_ACCESS_SCHEMA_VERSION,
      status: currentStatus,
      actions,
      ...(unavailableReason === undefined ? {} : { unavailableReason }),
      ...(refreshAfterMs === undefined ? {} : { refreshAfterMs }),
    };
  }

  if (
    !hasOnlyKeys(result, [
      'schema_version',
      'status',
      'unavailable_reason',
      'pairing',
      'devices',
      'actions',
      'refresh_after_ms',
    ]) ||
    result.unavailable_reason !== undefined ||
    !hasRequiredPairingShape(currentStatus, pairing)
  ) {
    return null;
  }
  if ((currentStatus === 'active' || currentStatus === 'revoking') && (!devices || devices.length < 1)) return null;
  if (currentStatus !== 'active' && currentStatus !== 'revoking' && devices !== undefined) return null;
  return {
    schemaVersion: REMOTE_COMPANION_ACCESS_SCHEMA_VERSION,
    status: currentStatus,
    actions,
    ...(pairing === undefined ? {} : { pairing }),
    ...(devices === undefined ? {} : { devices }),
    ...(refreshAfterMs === undefined ? {} : { refreshAfterMs }),
  };
}

export function prepareOplRemoteCompanionAccessActionInput(
  action: OplRemoteCompanionAccessAction,
  overrides: OplRemoteCompanionAccessActionInputOverrides = {}
): Record<string, unknown> | null {
  switch (action.commandId) {
    case 'pair.start': {
      const invitationCode = boundedText(overrides.invitationCode, MAX_INVITATION_CODE_LENGTH);
      const displayName = boundedText(overrides.displayName, MAX_DISPLAY_NAME_LENGTH);
      return invitationCode && displayName ? { invitation_code: invitationCode, display_name: displayName } : null;
    }
    case 'pair.confirm': {
      const authenticationDigits =
        typeof overrides.authenticationDigits === 'string'
          ? overrides.authenticationDigits
          : action.input.authentication_digits;
      return AUTHENTICATION_DIGITS.test(authenticationDigits)
        ? { pairing_id: action.input.pairing_id, authentication_digits: authenticationDigits }
        : null;
    }
    case 'device.rename': {
      const displayName = boundedText(overrides.displayName, MAX_DISPLAY_NAME_LENGTH);
      return displayName ? { device_id: action.input.device_id, display_name: displayName } : null;
    }
    default:
      return action.input;
  }
}

export const __remoteCompanionAccessTest = {
  parseAction,
  parsePairing,
  parseDevices,
};
