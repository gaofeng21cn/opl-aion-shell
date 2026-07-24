/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IOplAppStateProfile } from '@/common/adapter/ipcBridge';

export type OplAppStateProfile = IOplAppStateProfile;

export type OplAppStateRecord = Record<string, unknown>;

export type OplAppStatePayload = {
  app_state?: OplAppStateRecord;
} & OplAppStateRecord;

export type OplStandardAgentCapabilityMetadata = {
  source: string;
  requiredSkillIds: string[];
  optionalSkillRefs: string[];
};

export type OplStandardAgentDirectoryEntry = {
  packageId: string;
  installed: boolean;
  displayName: string | null;
  description: string | null;
  displayNameI18n: Partial<Record<'zh-CN' | 'en-US', string>>;
  descriptionI18n: Partial<Record<'zh-CN' | 'en-US', string>>;
  capabilityMetadata: OplStandardAgentCapabilityMetadata | null;
};

export type OplProjectedPackageAction = {
  actionId: string;
  actionRef: string;
  payloadRefsOnlyJson: Record<string, unknown>;
  requiredPayloadFields: string[];
  confirmationRequired: boolean;
};

export type OplProjectedActionPayload = {
  payloadRefsOnlyJson: Record<string, unknown>;
  missingRequiredPayloadFields: string[];
};

const OPL_PACKAGE_ACTION_IDS = new Set([
  'refresh_registry',
  'install_from_manifest_url',
  'agent_package_update',
  'agent_package_repair',
  'agent_package_activate',
  'agent_package_uninstall',
  'agent_package_preferences_set',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonBlankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function uniqueStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const strings = value.map(nonBlankString);
  if (strings.some((item) => item === null)) return null;
  return Array.from(new Set(strings as string[]));
}

function localizedStrings(value: unknown): Partial<Record<'zh-CN' | 'en-US', string>> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    (['zh-CN', 'en-US'] as const).flatMap((locale) => {
      const text = nonBlankString(value[locale]);
      return text ? [[locale, text]] : [];
    })
  );
}

function parseCapabilityMetadata(value: unknown): OplStandardAgentCapabilityMetadata | null {
  if (!isRecord(value)) return null;
  const source = nonBlankString(value.source);
  const requiredSkillIds = uniqueStringArray(value.required_skill_ids);
  const optionalSkillRefs = uniqueStringArray(value.optional_skill_refs);
  if (!source || !requiredSkillIds || !optionalSkillRefs) return null;
  return { source, requiredSkillIds, optionalSkillRefs };
}

/** Parse only the live Framework standard-Agent directory; no cache or Profile fallback is consulted. */
export function parseOplStandardAgentDirectoryEntries(appState: unknown): OplStandardAgentDirectoryEntry[] {
  const payload = isRecord(appState) ? appState : {};
  const state = isRecord(payload.app_state) ? payload.app_state : payload;
  const agentPackages = isRecord(state.agent_packages) ? state.agent_packages : {};
  const directory = isRecord(agentPackages.directory) ? agentPackages.directory : {};
  if (!Array.isArray(directory.entries)) return [];

  return directory.entries.flatMap((value) => {
    if (!isRecord(value) || value.package_role !== 'standard_agent') return [];
    const packageId = nonBlankString(value.package_id);
    if (!packageId) return [];
    return [
      {
        packageId,
        installed: value.installed === true,
        displayName: nonBlankString(value.display_name),
        description: nonBlankString(value.description),
        displayNameI18n: localizedStrings(value.display_name_i18n),
        descriptionI18n: localizedStrings(value.description_i18n),
        capabilityMetadata: parseCapabilityMetadata(value.capability_metadata),
      },
    ];
  });
}

export function resolveOplStandardAgentCapabilityMetadata(
  appState: unknown,
  packageId: string | null | undefined
): OplStandardAgentCapabilityMetadata | null {
  const normalizedPackageId = packageId?.trim().toLowerCase();
  if (!normalizedPackageId) return null;
  return (
    parseOplStandardAgentDirectoryEntries(appState).find(
      (entry) => entry.packageId.toLowerCase() === normalizedPackageId
    )?.capabilityMetadata ?? null
  );
}

export function getOplDirectorySkillIds(appState: unknown): string[] {
  const skillIds = new Set<string>();
  for (const entry of parseOplStandardAgentDirectoryEntries(appState)) {
    if (!entry.installed || !entry.capabilityMetadata) continue;
    for (const skillId of entry.capabilityMetadata.requiredSkillIds) skillIds.add(skillId);
    for (const skillId of entry.capabilityMetadata.optionalSkillRefs) skillIds.add(skillId);
  }
  return Array.from(skillIds);
}

function hasPayloadValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

/** Parse one exact Framework-projected package action without adding Shell fields. */
export function parseOplProjectedPackageAction(value: unknown): OplProjectedPackageAction | null {
  if (!isRecord(value)) return null;
  const expectedFields = new Set([
    'action_id',
    'action_ref',
    'payload',
    'required_payload_fields',
    'confirmation_required',
  ]);
  const fields = Object.keys(value);
  const actionId = typeof value.action_id === 'string' ? value.action_id.trim() : '';
  const actionRef = typeof value.action_ref === 'string' ? value.action_ref.trim() : '';
  if (
    fields.length !== expectedFields.size ||
    fields.some((field) => !expectedFields.has(field)) ||
    !OPL_PACKAGE_ACTION_IDS.has(actionId) ||
    actionRef !== `app_state.actions#${actionId}` ||
    !isRecord(value.payload) ||
    !Array.isArray(value.required_payload_fields) ||
    typeof value.confirmation_required !== 'boolean'
  ) {
    return null;
  }
  const requiredPayloadFields = value.required_payload_fields.map((field) =>
    typeof field === 'string' ? field.trim() : ''
  );
  if (requiredPayloadFields.some((field) => !field)) return null;
  return {
    actionId,
    actionRef,
    payloadRefsOnlyJson: { ...value.payload },
    requiredPayloadFields,
    confirmationRequired: value.confirmation_required,
  };
}

/** Return the alternative field names accepted by one projected requirement. */
export function oplProjectedRequirementAlternatives(requirement: string): string[] {
  return requirement
    .split(/\s+or\s+/i)
    .map((field) => field.trim())
    .filter(Boolean);
}

/**
 * Fill only context fields explicitly named by required_payload_fields. The
 * projected payload remains authoritative for every other field.
 */
export function buildOplProjectedActionPayload(
  action: OplProjectedPackageAction,
  requiredContext: Record<string, unknown> = {}
): OplProjectedActionPayload {
  const payloadRefsOnlyJson = { ...action.payloadRefsOnlyJson };
  const missingRequiredPayloadFields: string[] = [];
  for (const requirement of action.requiredPayloadFields) {
    const alternatives = oplProjectedRequirementAlternatives(requirement);
    if (alternatives.some((field) => hasPayloadValue(payloadRefsOnlyJson[field]))) continue;
    const providedField = alternatives.find((field) => hasPayloadValue(requiredContext[field]));
    if (providedField) {
      payloadRefsOnlyJson[providedField] = requiredContext[providedField];
      continue;
    }
    missingRequiredPayloadFields.push(requirement);
  }
  return { payloadRefsOnlyJson, missingRequiredPayloadFields };
}

/** Check whether an unresolved projected requirement names a context field. */
export function oplProjectedActionNeedsContextField(action: OplProjectedPackageAction, field: string): boolean {
  const { missingRequiredPayloadFields } = buildOplProjectedActionPayload(action);
  return missingRequiredPayloadFields.some((requirement) =>
    oplProjectedRequirementAlternatives(requirement).includes(field)
  );
}

export type OplGatewayAccountStatus =
  | 'not_connected'
  | 'setup_required'
  | 'connected'
  | 'reauth_required'
  | 'attention_needed'
  | 'disconnect_pending';

export type OplGatewayAccountActionId =
  | 'gateway_account_complete_setup'
  | 'gateway_account_refresh'
  | 'gateway_account_repair'
  | 'gateway_account_use_for_model_access'
  | 'gateway_account_disconnect';

export type OplGatewayAccountReadModel = {
  surface_kind: 'opl_gateway_account_read_model.v1';
  status: OplGatewayAccountStatus;
  connection_mode: 'none' | 'manual_key' | 'account';
  account_card_visible: boolean;
  account: {
    display_name: string | null;
    email: string | null;
    status: string;
    balance: { amount: number | null; currency: string };
  } | null;
  usage: {
    today_tokens: number | null;
    total_tokens: number | null;
    today_actual_cost: number | null;
    total_actual_cost: number | null;
    currency: string;
    day_timezone: string;
  } | null;
  managed_key: { name: string; status: string | null; ownership: string } | null;
  installation: { device_label: string; short_id: string } | null;
  available_groups: Array<{ group_id: string; label: string }>;
  freshness: {
    observed_at: string | null;
    stale_after: string | null;
    stale: boolean;
    last_error_code: string | null;
  };
  capabilities: {
    account_login_supported: boolean;
    manual_key_supported: boolean;
  };
  actions: {
    complete_setup: 'gateway_account_complete_setup' | null;
    refresh: 'gateway_account_refresh' | null;
    repair: 'gateway_account_repair' | null;
    use_for_model_access: 'gateway_account_use_for_model_access' | null;
    disconnect: 'gateway_account_disconnect' | null;
  };
};
