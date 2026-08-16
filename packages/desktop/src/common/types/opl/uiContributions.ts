/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const OPL_UI_CONTRIBUTION_SLOTS = ['composer.palette', 'runtime.detail', 'settings.section'] as const;

export type OplUiContributionSlot = (typeof OPL_UI_CONTRIBUTION_SLOTS)[number];
export type OplUiLocalizedText = Record<string, string>;

export type OplUiContributionCommand = {
  commandId: string;
  label: OplUiLocalizedText;
  actionRef: string;
  confirmationRequired: boolean;
};

export type OplUiContributionBadge = {
  badgeId: string;
  label: OplUiLocalizedText;
  dataRef: string;
  tone: string;
};

export type OplUiContributionView = {
  viewId: string;
  viewType: string;
  title: OplUiLocalizedText;
  dataRef: string;
  emptyState?: OplUiLocalizedText;
};

export type OplUiContribution = {
  contributionKey: string;
  contributionId: string;
  packageId: string;
  slot: OplUiContributionSlot;
  contributionKind: string;
  trustTier: string;
  scope: string;
  sortOrder: number;
  actionBoundary?: string;
  view?: OplUiContributionView;
  commands: OplUiContributionCommand[];
  badges: OplUiContributionBadge[];
};

export type OplUiContributionsProjection = {
  surfaceKind: 'opl_app_ui_contributions_projection.v1' | 'unavailable';
  entries: OplUiContribution[];
};

export type OplTransportBinding = {
  bindingId: string;
  providerId: string;
  accountId: string;
  channelSessionId: string;
  canonicalThreadHost: string;
  canonicalThreadId: string;
  projectAffinity: 'projectless';
  status: 'bound';
};

export type OplTransportBindingsProjection = {
  surfaceKind: 'opl_app_transport_bindings_projection.v1' | 'unavailable';
  status: 'available' | 'unavailable';
  bindings: OplTransportBinding[];
  unavailableReason?: 'producer_absent' | 'projection_unavailable' | 'invalid_projection';
};

export type OplChannelAccessActionInput =
  | { channel_id: string }
  | { channel_id: string; pairing_id: string }
  | { channel_id: string; user_id: string };

export type OplChannelAccessAction = {
  commandId: string;
  input: OplChannelAccessActionInput;
};

export type OplChannelAccessQrChallenge = {
  payload: string;
  expiresAtMs: number;
};

export type OplChannelAccessConnection = {
  state: 'disconnected' | 'connecting' | 'qr_ready' | 'qr_scanned' | 'connected' | 'attention';
  accountDisplayName?: string;
  reasonCode?: string;
  qrChallenge?: OplChannelAccessQrChallenge;
};

export type OplChannelAccessPairing = {
  pairingId: string;
  platformUserId?: string;
  displayName?: string;
  requestedAtMs: number;
  expiresAtMs: number;
  actions: OplChannelAccessAction[];
};

export type OplChannelAccessUser = {
  userId: string;
  platformUserId?: string;
  displayName?: string;
  authorizedAtMs: number;
  lastActiveAtMs?: number;
  actions: OplChannelAccessAction[];
};

export type OplChannelAccessResult =
  | {
      schemaVersion: 'opl-app-channel-access.v1';
      status: 'available';
      channelId: string;
      connection: OplChannelAccessConnection;
      actions: OplChannelAccessAction[];
      pendingPairings: OplChannelAccessPairing[];
      authorizedUsers: OplChannelAccessUser[];
      refreshAfterMs?: number;
    }
  | {
      schemaVersion: 'opl-app-channel-access.v1';
      status: 'unavailable';
      channelId: string;
      unavailableReason: string;
      refreshAfterMs?: number;
    };

export function activeOplChannelAccessQrChallenge(
  connection: OplChannelAccessConnection,
  nowMs: number
): OplChannelAccessQrChallenge | null {
  const challenge = connection.qrChallenge;
  return connection.state === 'qr_ready' && challenge && challenge.expiresAtMs > nowMs ? challenge : null;
}

const EMPTY_PROJECTION: OplUiContributionsProjection = Object.freeze({
  surfaceKind: 'unavailable',
  entries: Object.freeze([]) as unknown as OplUiContribution[],
});

function unavailableTransportBindingsProjection(
  reason: OplTransportBindingsProjection['unavailableReason'] = 'invalid_projection'
): OplTransportBindingsProjection {
  return {
    surfaceKind: 'unavailable',
    status: 'unavailable',
    bindings: [],
    unavailableReason: reason,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function hasOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(record).every((key) => allowed.has(key));
}

function stableId(value: unknown): string | null {
  const normalized = asString(value);
  return normalized && /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(normalized) && normalized.length <= 128
    ? normalized
    : null;
}

function opaqueId(value: unknown): string | null {
  const normalized = asString(value);
  return normalized && normalized.length <= 512 ? normalized : null;
}

function exactOpaqueId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 ? value : null;
}

function exactStableId(value: unknown): string | null {
  return typeof value === 'string' && /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(value) && value.length <= 128
    ? value
    : null;
}

function localizedText(value: unknown): OplUiLocalizedText {
  const record = asRecord(value);
  if (!record) return {};
  return Object.fromEntries(
    Object.entries(record).flatMap(([locale, text]) => {
      const normalized = asString(text);
      return normalized ? [[locale, normalized]] : [];
    })
  );
}

function parseCommand(value: unknown): OplUiContributionCommand | null {
  const command = asRecord(value);
  const commandId = asString(command?.command_id);
  const actionRef = asString(command?.action_ref);
  if (!commandId || !actionRef) return null;
  return {
    commandId,
    label: localizedText(command?.label_i18n),
    actionRef,
    confirmationRequired: command?.confirmation_required === true,
  };
}

function parseBadge(value: unknown): OplUiContributionBadge | null {
  const badge = asRecord(value);
  const badgeId = asString(badge?.badge_id);
  const dataRef = asString(badge?.data_ref);
  if (!badgeId || !dataRef) return null;
  return {
    badgeId,
    label: localizedText(badge?.label_i18n),
    dataRef,
    tone: asString(badge?.tone) ?? 'neutral',
  };
}

function parseView(value: unknown): OplUiContributionView | undefined {
  const view = asRecord(value);
  const viewId = asString(view?.view_id);
  const viewType = asString(view?.view_type);
  const dataRef = asString(view?.data_ref);
  if (!viewId || !viewType || !dataRef) return undefined;
  const emptyState = localizedText(view?.empty_state_i18n);
  return {
    viewId,
    viewType,
    title: localizedText(view?.title_i18n),
    dataRef,
    ...(Object.keys(emptyState).length > 0 ? { emptyState } : {}),
  };
}

function parseEntry(value: unknown): OplUiContribution | null {
  const entry = asRecord(value);
  const contributionKey = asString(entry?.contribution_key);
  const contributionId = asString(entry?.contribution_id);
  const packageId = asString(entry?.package_id);
  const slot = asString(entry?.slot);
  if (
    !contributionKey ||
    !contributionId ||
    !packageId ||
    contributionKey !== `${packageId}:${contributionId}` ||
    !slot ||
    !OPL_UI_CONTRIBUTION_SLOTS.includes(slot as OplUiContributionSlot)
  ) {
    return null;
  }

  const view = parseView(entry?.view);
  const actionBoundary = asString(entry?.action_boundary);
  return {
    contributionKey,
    contributionId,
    packageId,
    slot: slot as OplUiContributionSlot,
    contributionKind: asString(entry?.contribution_kind) ?? 'unknown',
    trustTier: asString(entry?.trust_tier) ?? 'unknown',
    scope: asString(entry?.scope) ?? 'root',
    sortOrder: typeof entry?.sort_order === 'number' && Number.isFinite(entry.sort_order) ? entry.sort_order : 0,
    ...(actionBoundary ? { actionBoundary } : {}),
    ...(view ? { view } : {}),
    commands: Array.isArray(entry?.commands)
      ? entry.commands.map(parseCommand).filter((command): command is OplUiContributionCommand => command !== null)
      : [],
    badges: Array.isArray(entry?.badges)
      ? entry.badges.map(parseBadge).filter((badge): badge is OplUiContributionBadge => badge !== null)
      : [],
  };
}

export function readOplUiContributionsProjection(state: unknown): OplUiContributionsProjection {
  const root = asRecord(state);
  const appState = asRecord(root?.app_state) ?? root;
  const projection = asRecord(appState?.ui_contributions);
  if (projection?.surface_kind !== 'opl_app_ui_contributions_projection.v1') return EMPTY_PROJECTION;

  const entries = Array.isArray(projection.entries)
    ? projection.entries.map(parseEntry).filter((entry): entry is OplUiContribution => entry !== null)
    : [];
  entries.sort(
    (left, right) =>
      left.sortOrder - right.sortOrder ||
      left.packageId.localeCompare(right.packageId) ||
      left.contributionId.localeCompare(right.contributionId)
  );
  return { surfaceKind: 'opl_app_ui_contributions_projection.v1', entries };
}

export function readOplTransportBindingsProjection(state: unknown): OplTransportBindingsProjection {
  const root = asRecord(state);
  const appState = asRecord(root?.app_state) ?? root;
  const projection = asRecord(appState?.transport_bindings);
  if (projection?.surface_kind !== 'opl_app_transport_bindings_projection.v1') {
    return unavailableTransportBindingsProjection();
  }
  if (!asRecord(projection.authority_boundary) || !Array.isArray(projection.bindings)) {
    return unavailableTransportBindingsProjection();
  }
  if (projection.status === 'unavailable') {
    const reason = projection.unavailable_reason;
    if (
      projection.bindings.length !== 0 ||
      (reason !== 'producer_absent' && reason !== 'projection_unavailable' && reason !== 'invalid_projection')
    ) {
      return unavailableTransportBindingsProjection();
    }
    return {
      surfaceKind: 'opl_app_transport_bindings_projection.v1',
      status: 'unavailable',
      bindings: [],
      unavailableReason: reason,
    };
  }
  if (projection.status !== 'available' || projection.unavailable_reason !== undefined) {
    return unavailableTransportBindingsProjection();
  }
  const bindings = projection.bindings.flatMap((value): OplTransportBinding[] => {
    const binding = asRecord(value);
    const bindingId = exactOpaqueId(binding?.binding_id);
    const providerId = exactStableId(binding?.provider_id);
    const accountId = exactOpaqueId(binding?.account_id);
    const channelSessionId = exactOpaqueId(binding?.channel_session_id);
    const canonicalThreadHost = exactOpaqueId(binding?.canonical_thread_host);
    const canonicalThreadId = exactOpaqueId(binding?.canonical_thread_id);
    if (
      !binding ||
      !hasOnlyKeys(binding, [
        'binding_id',
        'provider_id',
        'account_id',
        'channel_session_id',
        'canonical_thread_host',
        'canonical_thread_id',
        'project_affinity',
        'status',
      ]) ||
      !bindingId ||
      !providerId ||
      !accountId ||
      !channelSessionId ||
      !canonicalThreadHost ||
      !canonicalThreadId ||
      binding.project_affinity !== 'projectless' ||
      binding.status !== 'bound'
    ) {
      return [];
    }
    return [
      {
        bindingId,
        providerId,
        accountId,
        channelSessionId,
        canonicalThreadHost,
        canonicalThreadId,
        projectAffinity: 'projectless',
        status: 'bound',
      },
    ];
  });
  if (bindings.length !== projection.bindings.length) return unavailableTransportBindingsProjection();
  const bindingIdentities = bindings.map(
    (binding) => `${binding.providerId}:${binding.accountId}:${binding.channelSessionId}`
  );
  if (new Set(bindingIdentities).size !== bindingIdentities.length) return unavailableTransportBindingsProjection();
  return {
    surfaceKind: 'opl_app_transport_bindings_projection.v1',
    status: 'available',
    bindings,
  };
}

function parseChannelActionInput(value: unknown): OplChannelAccessActionInput | null {
  const input = asRecord(value);
  const channelId = stableId(input?.channel_id);
  if (!input || !channelId) return null;
  if (hasOnlyKeys(input, ['channel_id'])) return { channel_id: channelId };
  const pairingId = opaqueId(input.pairing_id);
  if (pairingId && hasOnlyKeys(input, ['channel_id', 'pairing_id'])) {
    return { channel_id: channelId, pairing_id: pairingId };
  }
  const userId = opaqueId(input.user_id);
  if (userId && hasOnlyKeys(input, ['channel_id', 'user_id'])) return { channel_id: channelId, user_id: userId };
  return null;
}

function parseChannelActions(
  value: unknown,
  scope: 'channel' | 'pairing' | 'user',
  entityId?: string
): OplChannelAccessAction[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const actions = value.flatMap((item): OplChannelAccessAction[] => {
    const action = asRecord(item);
    const commandId = stableId(action?.command_id);
    const input = parseChannelActionInput(action?.input);
    const inputMatchesScope =
      input &&
      ((scope === 'channel' && !('pairing_id' in input) && !('user_id' in input)) ||
        (scope === 'pairing' && 'pairing_id' in input && input.pairing_id === entityId) ||
        (scope === 'user' && 'user_id' in input && input.user_id === entityId));
    return action && hasOnlyKeys(action, ['command_id', 'input']) && commandId && inputMatchesScope
      ? [{ commandId, input }]
      : [];
  });
  if (actions.length !== value.length) return null;
  const identities = actions.map((action) => `${action.commandId}:${JSON.stringify(action.input)}`);
  return new Set(identities).size === identities.length ? actions : null;
}

function parseChannelConnection(value: unknown): OplChannelAccessConnection | null {
  const connection = asRecord(value);
  if (!connection || !hasOnlyKeys(connection, ['state', 'account_display_name', 'reason_code', 'qr_challenge'])) {
    return null;
  }
  const states = ['disconnected', 'connecting', 'qr_ready', 'qr_scanned', 'connected', 'attention'] as const;
  if (!states.includes(connection.state as (typeof states)[number])) return null;
  const accountDisplayName =
    connection.account_display_name === undefined ? null : asString(connection.account_display_name);
  const reasonCode = connection.reason_code === undefined ? null : stableId(connection.reason_code);
  if (connection.account_display_name !== undefined && !accountDisplayName) return null;
  if (connection.reason_code !== undefined && !reasonCode) return null;
  const qr = connection.qr_challenge === undefined ? null : asRecord(connection.qr_challenge);
  const qrPayload = qr ? asString(qr.payload) : null;
  const qrExpiry = qr ? asInteger(qr.expires_at_ms) : null;
  if (
    qr &&
    (!hasOnlyKeys(qr, ['payload', 'expires_at_ms']) || !qrPayload || qrPayload.length > 8192 || qrExpiry === null)
  ) {
    return null;
  }
  return {
    state: connection.state as OplChannelAccessConnection['state'],
    ...(accountDisplayName ? { accountDisplayName } : {}),
    ...(reasonCode ? { reasonCode } : {}),
    ...(qr && qrPayload && qrExpiry !== null ? { qrChallenge: { payload: qrPayload, expiresAtMs: qrExpiry } } : {}),
  };
}

function parseChannelPairings(value: unknown): OplChannelAccessPairing[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const pairings = value.flatMap((item): OplChannelAccessPairing[] => {
    const pairing = asRecord(item);
    if (
      !pairing ||
      !hasOnlyKeys(pairing, [
        'pairing_id',
        'platform_user_id',
        'display_name',
        'requested_at_ms',
        'expires_at_ms',
        'actions',
      ])
    ) {
      return [];
    }
    const pairingId = opaqueId(pairing.pairing_id);
    const platformUserId = pairing.platform_user_id === undefined ? null : opaqueId(pairing.platform_user_id);
    const displayName = pairing.display_name === undefined ? null : asString(pairing.display_name);
    const requestedAtMs = asInteger(pairing.requested_at_ms);
    const expiresAtMs = asInteger(pairing.expires_at_ms);
    const actions = pairingId ? parseChannelActions(pairing.actions, 'pairing', pairingId) : null;
    if (
      !pairingId ||
      (pairing.platform_user_id !== undefined && !platformUserId) ||
      (pairing.display_name !== undefined && (!displayName || displayName.length > 256)) ||
      requestedAtMs === null ||
      expiresAtMs === null ||
      !actions
    ) {
      return [];
    }
    return [
      {
        pairingId,
        ...(platformUserId ? { platformUserId } : {}),
        ...(displayName ? { displayName } : {}),
        requestedAtMs,
        expiresAtMs,
        actions,
      },
    ];
  });
  return pairings.length === value.length && new Set(pairings.map((item) => item.pairingId)).size === pairings.length
    ? pairings
    : null;
}

function parseChannelUsers(value: unknown): OplChannelAccessUser[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const users = value.flatMap((item): OplChannelAccessUser[] => {
    const user = asRecord(item);
    if (
      !user ||
      !hasOnlyKeys(user, [
        'user_id',
        'platform_user_id',
        'display_name',
        'authorized_at_ms',
        'last_active_at_ms',
        'actions',
      ])
    ) {
      return [];
    }
    const userId = opaqueId(user.user_id);
    const platformUserId = user.platform_user_id === undefined ? null : opaqueId(user.platform_user_id);
    const displayName = user.display_name === undefined ? null : asString(user.display_name);
    const authorizedAtMs = asInteger(user.authorized_at_ms);
    const lastActiveAtMs = user.last_active_at_ms === undefined ? null : asInteger(user.last_active_at_ms);
    const actions = userId ? parseChannelActions(user.actions, 'user', userId) : null;
    if (
      !userId ||
      (user.platform_user_id !== undefined && !platformUserId) ||
      (user.display_name !== undefined && (!displayName || displayName.length > 256)) ||
      authorizedAtMs === null ||
      (user.last_active_at_ms !== undefined && lastActiveAtMs === null) ||
      !actions
    ) {
      return [];
    }
    return [
      {
        userId,
        ...(platformUserId ? { platformUserId } : {}),
        ...(displayName ? { displayName } : {}),
        authorizedAtMs,
        ...(lastActiveAtMs !== null ? { lastActiveAtMs } : {}),
        actions,
      },
    ];
  });
  return users.length === value.length && new Set(users.map((item) => item.userId)).size === users.length
    ? users
    : null;
}

export function readOplChannelAccessResult(value: unknown): OplChannelAccessResult | null {
  const result = asRecord(value);
  const channelId = stableId(result?.channel_id);
  if (!result || result.schema_version !== 'opl-app-channel-access.v1' || !channelId) return null;
  const refreshAfterMs = result.refresh_after_ms === undefined ? null : asInteger(result.refresh_after_ms);
  if (
    result.refresh_after_ms !== undefined &&
    (refreshAfterMs === null || refreshAfterMs < 250 || refreshAfterMs > 60000)
  ) {
    return null;
  }
  if (result.status === 'unavailable') {
    const unavailableReason = stableId(result.unavailable_reason);
    if (
      !unavailableReason ||
      result.connection !== undefined ||
      result.actions !== undefined ||
      result.pending_pairings !== undefined ||
      result.authorized_users !== undefined ||
      !hasOnlyKeys(result, ['schema_version', 'status', 'channel_id', 'unavailable_reason', 'refresh_after_ms'])
    ) {
      return null;
    }
    return {
      schemaVersion: 'opl-app-channel-access.v1',
      status: 'unavailable',
      channelId,
      unavailableReason,
      ...(refreshAfterMs !== null ? { refreshAfterMs } : {}),
    };
  }
  if (
    result.status !== 'available' ||
    result.unavailable_reason !== undefined ||
    !hasOnlyKeys(result, [
      'schema_version',
      'status',
      'channel_id',
      'connection',
      'actions',
      'pending_pairings',
      'authorized_users',
      'refresh_after_ms',
    ])
  ) {
    return null;
  }
  const connection = parseChannelConnection(result.connection);
  const actions = parseChannelActions(result.actions, 'channel');
  const pendingPairings = parseChannelPairings(result.pending_pairings);
  const authorizedUsers = parseChannelUsers(result.authorized_users);
  if (!connection || !actions || !pendingPairings || !authorizedUsers) return null;
  const allInputsMatchChannel = [
    ...actions,
    ...pendingPairings.flatMap((item) => item.actions),
    ...authorizedUsers.flatMap((item) => item.actions),
  ].every((action) => action.input.channel_id === channelId);
  if (!allInputsMatchChannel) return null;
  return {
    schemaVersion: 'opl-app-channel-access.v1',
    status: 'available',
    channelId,
    connection,
    actions,
    pendingPairings,
    authorizedUsers,
    ...(refreshAfterMs !== null ? { refreshAfterMs } : {}),
  };
}

export function readOplPackageContributionReadResult(
  commandResult: unknown,
  expected: { packageId: string; ref: string }
): unknown | null {
  const command = asRecord(commandResult);
  const parsed = asRecord(command?.parsed);
  const contribution = asRecord(parsed?.opl_app_contribution);
  const carrierReadback = asRecord(contribution?.carrier_readback);
  const readiness = asRecord(contribution?.readiness);
  const response = asRecord(contribution?.response);
  if (
    command?.surface !== 'package_contribution_read' ||
    command?.ok === false ||
    contribution?.surface_kind !== 'opl_app_package_contribution.v1' ||
    contribution.package_id !== expected.packageId ||
    contribution.ref !== expected.ref ||
    contribution.operation !== 'read' ||
    typeof contribution.confirmation_required !== 'boolean' ||
    !carrierReadback ||
    !asString(carrierReadback.kind) ||
    !asString(carrierReadback.identity) ||
    !asString(carrierReadback.lifecycle_authority) ||
    !readiness ||
    readiness.installed !== true ||
    readiness.physical_status !== 'available' ||
    readiness.callability !== 'callable' ||
    response?.schema_version !== 'opl-package-app-contribution-response.v1' ||
    response.ok !== true ||
    response.ref !== expected.ref ||
    response.operation !== 'read' ||
    !Object.hasOwn(response, 'result')
  ) {
    return null;
  }
  return response.result;
}

export function hasPackageContributionExecuteAction(state: unknown): boolean {
  const root = asRecord(state);
  const appState = asRecord(root?.app_state) ?? root;
  return Array.isArray(appState?.actions)
    ? appState.actions.some((entry) => asRecord(entry)?.action_id === 'package_contribution_execute')
    : false;
}

export function resolveOplUiContributionLabel(text: OplUiLocalizedText, locale: string, fallback: string): string {
  const normalizedLocale = locale.toLowerCase();
  const preferred = normalizedLocale.startsWith('zh') ? ['zh-CN', 'zh', 'en-US', 'en'] : ['en-US', 'en', 'zh-CN', 'zh'];
  return preferred.map((key) => text[key]).find(Boolean) ?? Object.values(text).find(Boolean) ?? fallback;
}
